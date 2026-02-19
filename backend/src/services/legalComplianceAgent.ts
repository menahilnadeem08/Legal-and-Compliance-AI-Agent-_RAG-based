import { llm } from '../config/openai';
import { QueryService } from './queryService';
import { VersionComparisonService } from './versionComparisonService';
import { ConflictDetectionService } from './conflictDetectionService';
import { DocumentService } from './documentService';

export interface AgentResult {
  answer: string;
  tool_calls?: string[];
  citations?: any[];
  confidence: number;
  reasoning?: string;
}

interface ToolResultWithMetadata {
  text: string;
  citations?: any[];
  conflicts?: any[];
}

export class LegalComplianceAgent {
  private queryService: QueryService;
  private versionService: VersionComparisonService;
  private conflictService: ConflictDetectionService;
  private documentService: DocumentService;
  private toolResultsMetadata: Map<string, any> = new Map();

  constructor() {
    this.queryService = new QueryService();
    this.versionService = new VersionComparisonService();
    this.conflictService = new ConflictDetectionService();
    this.documentService = new DocumentService();
  }

  /**
   * UNIVERSAL CITATION EXTRACTION
   * Extracts citations from any tool result
   */
  private extractUniversalCitations(toolName: string, result: any): any[] {
    const citations: any[] = [];

    switch (toolName) {
      case "search_documents":
        // RAG search already has citations
        return result.citations || [];

      case "compare_document_versions":
        return this.extractVersionCitations(result);

      case "detect_policy_conflicts":
        return this.extractConflictCitations(result);

      case "list_available_documents":
        return this.extractDocumentListCitations(result);

      case "get_document_versions":
        return this.extractVersionListCitations(result);

      default:
        return [];
    }
  }

  /**
   * Extract citations from version comparison results
   */
  private extractVersionCitations(comparison: any): any[] {
    if (!comparison.changes || comparison.changes.length === 0) {
      return [];
    }

    const citations: any[] = [];
    const significantChanges = comparison.changes.filter(
      (c: any) => c.change_type !== 'unchanged'
    ).slice(0, 10); // Top 10 changes

    for (const change of significantChanges) {
      if (change.change_type === 'added' && change.new_content) {
        citations.push({
          document_name: comparison.document_name,
          version: comparison.version2.version,
          section: change.section_name || 'N/A',
          page: change.page_number || null,
          change_type: 'ADDED',
          content: change.new_content.substring(0, 200) + '...',
          relevance_score: 1.0
        });
      }

      if (change.change_type === 'removed' && change.old_content) {
        citations.push({
          document_name: comparison.document_name,
          version: comparison.version1.version,
          section: change.section_name || 'N/A',
          page: change.page_number || null,
          change_type: 'REMOVED',
          content: change.old_content.substring(0, 200) + '...',
          relevance_score: 1.0
        });
      }

      if (change.change_type === 'modified' && change.old_content && change.new_content) {
        citations.push({
          document_name: comparison.document_name,
          version: `${comparison.version1.version} → ${comparison.version2.version}`,
          section: change.section_name || 'N/A',
          page: change.page_number || null,
          change_type: 'MODIFIED',
          content: `OLD: ${change.old_content.substring(0, 100)}... | NEW: ${change.new_content.substring(0, 100)}...`,
          relevance_score: 1.0
        });
      }
    }

    return citations;
  }

  /**
   * Extract citations from conflict detection results
   */
  private extractConflictCitations(conflictResult: any): any[] {
    if (!conflictResult.conflicts || conflictResult.conflicts.length === 0) {
      return [];
    }

    const citations: any[] = [];

    for (const conflict of conflictResult.conflicts) {
      // Citation for document A
      citations.push({
        document_name: conflict.document_a.name,
        version: conflict.document_a.version,
        section: conflict.document_a.section || 'N/A',
        page: conflict.document_a.page || null,
        conflict_type: conflict.conflict_type,
        severity: conflict.severity,
        content: conflict.document_a.excerpt,
        relevance_score: conflict.severity === 'high' ? 1.0 : conflict.severity === 'medium' ? 0.7 : 0.4
      });

      // Citation for document B
      citations.push({
        document_name: conflict.document_b.name,
        version: conflict.document_b.version,
        section: conflict.document_b.section || 'N/A',
        page: conflict.document_b.page || null,
        conflict_type: conflict.conflict_type,
        severity: conflict.severity,
        content: conflict.document_b.excerpt,
        relevance_score: conflict.severity === 'high' ? 1.0 : conflict.severity === 'medium' ? 0.7 : 0.4
      });
    }

    return citations;
  }

  /**
   * Extract citations from document list - ONLY if relevant to query
   * Don't cite all documents - only cite those relevant to the answer
   */
  private extractDocumentListCitations(documentList: any[], answerContext?: string): any[] {
    // If there's answer context, only cite documents mentioned in it
    if (answerContext) {
      const lowerAnswer = answerContext.toLowerCase();
      return documentList
        .filter(doc => lowerAnswer.includes(doc.name.toLowerCase()))
        .slice(0, 5)
        .map((doc: any) => ({
          document_name: doc.name,
          version: doc.latest_version,
          type: doc.type,
          available_versions: doc.versions.join(', '),
          content: `Document: ${doc.name} | Type: ${doc.type} | Latest: v${doc.latest_version}`,
          relevance_score: 0.9
        }));
    }
    
    // If no context, don't cite documents from listing
    // (they're just informational, not evidence)
    return [];
  }

  /**
   * Extract citations from version list
   */
  private extractVersionListCitations(versionResult: any): any[] {
    if (!versionResult.versions || versionResult.versions.length === 0) {
      return [];
    }

    return [{
      document_name: versionResult.document_name,
      available_versions: versionResult.versions.join(', '),
      content: `Available versions of ${versionResult.document_name}: ${versionResult.versions.join(', ')}`,
      relevance_score: 0.9
    }];
  }

  /**
   * Define available tools for the agent
   */
  private getTools() {
    return [
      {
        type: "function" as const,
        function: {
          name: "search_documents",
          description: "Search across legal documents using RAG (Retrieval-Augmented Generation). Use this for general questions about document content, policies, regulations, or compliance requirements.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search query or question about document content"
              }
            },
            required: ["query"]
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "compare_document_versions",
          description: "Compare two versions of the SAME document to identify changes, additions, deletions, and modifications. Use when user asks about version differences, updates, or changes between document versions.",
          parameters: {
            type: "object",
            properties: {
              document_name: {
                type: "string",
                description: "Name of the document (supports fuzzy matching)"
              },
              version1: {
                type: "string",
                description: "First version (supports 'latest', 'previous', or version numbers like '2.4')"
              },
              version2: {
                type: "string",
                description: "Second version (supports 'latest', 'previous', or version numbers)"
              }
            },
            required: ["document_name", "version1", "version2"]
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "detect_policy_conflicts",
          description: "Detect conflicts, contradictions, or inconsistencies between DIFFERENT documents. Use when user asks if policies conflict, contradict each other, or have inconsistencies.",
          parameters: {
            type: "object",
            properties: {
              document1: {
                type: "string",
                description: "Name of first document"
              },
              document2: {
                type: "string",
                description: "Name of second document"
              },
              topic: {
                type: "string",
                description: "Optional: specific topic to focus conflict analysis on (e.g., 'data retention', 'remote work')"
              }
            },
            required: ["document1", "document2"]
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "list_available_documents",
          description: "List all documents available in the system with their versions. Use when user wants to know what documents exist or explore available policies.",
          parameters: {
            type: "object",
            properties: {},
            required: []
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "get_document_versions",
          description: "Get all available versions of a specific document. Use when user wants to see version history or available versions.",
          parameters: {
            type: "object",
            properties: {
              document_name: {
                type: "string",
                description: "Name of the document (supports fuzzy matching)"
              }
            },
            required: ["document_name"]
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "track_policy_changes",
          description: "Track how a policy or document has evolved across all versions over time. Returns a chronological timeline of changes, what was added/removed/modified in each version, severity of changes, and AI summary of the evolution. Use when user asks 'what changed', 'how has this policy evolved', 'show me the history'.",
          parameters: {
            type: "object",
            properties: {
              document_name: {
                type: "string",
                description: "Name of the document to track"
              },
              from_version: {
                type: "string",
                description: "Starting version (optional, defaults to earliest)"
              },
              to_version: {
                type: "string",
                description: "Ending version (optional, defaults to latest)"
              }
            },
            required: ["document_name"]
          }
        }
      }
    ];
  }

  /**
   * Execute tool functions
   */
  private async executeTool(toolName: string, args: any, adminId: number): Promise<any> {
    const startTime = Date.now();
    console.log(`🔧 [START] ${toolName} (args: ${JSON.stringify(args).substring(0, 60)}...)`);

    try {
      switch (toolName) {
        case "search_documents":
          const searchResult = await this.queryService.processQuery(args.query, adminId);
          console.log(`✓ [${Date.now() - startTime}ms] ${toolName} completed`);
          return searchResult;

        case "compare_document_versions":
          const versionResult = await this.versionService.processComparison(
            `compare ${args.document_name} version ${args.version1} and ${args.version2}`
          );
          console.log(`✓ [${Date.now() - startTime}ms] ${toolName} completed`);
          if (versionResult.success) {
            return versionResult.comparison;
          }
          throw new Error(versionResult.error || 'Version comparison failed');

        case "detect_policy_conflicts":
          const query = args.topic
            ? `Check conflicts between ${args.document1} and ${args.document2} regarding ${args.topic}`
            : `Check conflicts between ${args.document1} and ${args.document2}`;
          const conflictResult = await this.conflictService.detectConflicts(query, adminId);
          console.log(`✓ [${Date.now() - startTime}ms] ${toolName} completed`);
          return conflictResult;

        case "list_available_documents":
          const docs = await this.documentService.listDocuments(adminId);
          console.log(`✓ [${Date.now() - startTime}ms] ${toolName} completed`);
          // Group by document name
          const grouped = docs.reduce((acc: any, doc: any) => {
            if (!acc[doc.name]) {
              acc[doc.name] = {
                name: doc.name,
                type: doc.type,
                versions: [],
                latest_version: null
              };
            }
            acc[doc.name].versions.push(doc.version);
            if (doc.is_latest) {
              acc[doc.name].latest_version = doc.version;
            }
            return acc;
          }, {});
          return Object.values(grouped);

        case "get_document_versions":
          const versions = await this.documentService.getDocumentVersions(args.document_name, adminId);
          const resolvedName = await this.documentService.findDocumentByName(args.document_name, adminId);
          console.log(`✓ [${Date.now() - startTime}ms] ${toolName} completed`);
          return {
            document_name: resolvedName || args.document_name,
            versions: versions
          };

        case "track_policy_changes":
          // Find actual document name
          const actualDocName = await this.documentService.findDocumentByName(args.document_name, adminId);
          if (!actualDocName) {
            throw new Error(`Document "${args.document_name}" not found`);
          }

          // Get full version history with metadata
          const versionHistory = await this.documentService.getDocumentVersionHistory(actualDocName, adminId);
          let versionsList = [...versionHistory.versions].sort(
            (a: any, b: any) => new Date(a.upload_date).getTime() - new Date(b.upload_date).getTime()
          );

          // Filter by from_version/to_version if provided
          if (args.from_version) {
            const fromIdx = versionsList.findIndex((v: any) => v.version === args.from_version);
            if (fromIdx === -1) throw new Error(`Version "${args.from_version}" not found`);
            versionsList = versionsList.slice(fromIdx);
          }
          if (args.to_version) {
            const toIdx = versionsList.findIndex((v: any) => v.version === args.to_version);
            if (toIdx === -1) throw new Error(`Version "${args.to_version}" not found`);
            versionsList = versionsList.slice(0, toIdx + 1);
          }

          // Build timeline by comparing consecutive versions
          const timeline: any[] = [];
          for (let i = 0; i < versionsList.length - 1; i++) {
            const v1 = versionsList[i];
            const v2 = versionsList[i + 1];

            const comparison = await this.documentService.compareVersionsDetailed(actualDocName, v1.version, v2.version, adminId);

            // Determine severity based on change statistics
            let severity = 'low';
            if (comparison.statistics.change_percentage > 30) severity = 'high';
            else if (comparison.statistics.change_percentage > 10) severity = 'medium';

            timeline.push({
              from: v1.version,
              to: v2.version,
              date: new Date(v2.upload_date).toISOString().split('T')[0],
              summary: comparison.summary,
              changes_added: comparison.statistics.chunks_added,
              changes_removed: comparison.statistics.chunks_removed,
              changes_modified: comparison.statistics.chunks_modified,
              change_percentage: comparison.statistics.change_percentage,
              severity: severity,
              impact_analysis: comparison.impact_analysis,
              key_changes: comparison.changes
                .filter((c: any) => c.change_type !== 'unchanged')
                .slice(0, 5)
                .map((c: any) => ({
                  type: c.change_type,
                  section: c.section_name || 'N/A',
                  page: c.page_number
                }))
            });
          }

          // Generate overall evolution summary
          if (timeline.length > 0) {
            const timelineSummary = timeline
              .map(t => `v${t.from} → v${t.to} (${t.date}): ${t.changes_added} added, ${t.changes_removed} removed, ${t.changes_modified} modified (${t.change_percentage.toFixed(0)}% change)`)
              .join('\n');

            const overallSummaryPrompt = `You are a legal compliance expert. Summarize the evolution of "${actualDocName}" across versions:

${timelineSummary}

Provide a concise executive summary (2-3 bullet points) highlighting:
1. Major shifts and trends in the policy
2. Key milestones in its evolution
3. Overall direction of policy changes

Be specific about business/compliance impact.`;

            const overallResponse = await llm.invoke(overallSummaryPrompt);
            const overallSummary = overallResponse.content.toString();

            const result = {
              document_name: actualDocName,
              timeline,
              overall_summary: overallSummary,
              total_versions_tracked: versionsList.length
            };

            console.log(`✓ [${Date.now() - startTime}ms] ${toolName} completed`);
            return result;
          } else {
            throw new Error('Only one version exists; no changes to track');
          }

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error: any) {
      console.error(`Tool execution error (${toolName}):`, error);
      return {
        error: true,
        message: error.message,
        tool: toolName
      };
    }
  }

  /**
   * Format tool results for the LLM - now returns structured data
   */
  private formatToolResult(toolName: string, result: any, toolCallId: string): ToolResultWithMetadata {
    if (result.error) {
      return {
        text: `Error executing ${toolName}: ${result.message}`
      };
    }

    // Store full result for later citation extraction
    this.toolResultsMetadata.set(toolCallId, { toolName, result });

    switch (toolName) {
      case "search_documents":
        return {
          text: `Search Results:\nAnswer: ${result.answer}\nConfidence: ${result.confidence}%\nCitations: ${result.citations?.length || 0}`,
          citations: result.citations
        };

      case "compare_document_versions":
        return {
          text: `Version Comparison Results:
Document: ${result.document_name}
Versions: ${result.version1.version} → ${result.version2.version}
Changes: ${result.statistics.chunks_added} added, ${result.statistics.chunks_removed} removed, ${result.statistics.chunks_modified} modified
Change Rate: ${result.statistics.change_percentage.toFixed(1)}%
Summary: ${result.summary}`,
          citations: this.extractVersionCitations(result)
        };

      case "detect_policy_conflicts":
        return {
          text: `Conflict Detection Results:
Documents: ${result.documents_analyzed.join(', ')}
Conflicts Found: ${result.conflicts_found}
Summary: ${result.summary}
${result.conflicts.map((c: any, i: number) => 
  `\nConflict ${i+1} [${c.severity}]: ${c.description}`
).join('')}`,
          conflicts: result.conflicts,
          citations: this.extractConflictCitations(result)
        };

      case "list_available_documents":
        return {
          text: `Available Documents:\n${result.map((d: any) => 
            `- ${d.name} (${d.type}) - Latest: v${d.latest_version}, All versions: ${d.versions.join(', ')}`
          ).join('\n')}`,
          citations: this.extractDocumentListCitations(result)
        };

      case "get_document_versions":
        return {
          text: `Versions of ${result.document_name}:\n${result.versions.join(', ')}`,
          citations: this.extractVersionListCitations(result)
        };

      case "track_policy_changes":
        const timelineText = result.timeline
          .map((t: any) => `v${t.from} → v${t.to} (${t.date}) [${t.severity}]: +${t.changes_added} -${t.changes_removed} ~${t.changes_modified}\n${t.summary}`)
          .join('\n\n');
        return {
          text: `Policy Evolution Timeline for ${result.document_name}:\n\n${timelineText}\n\nOverall Evolution:\n${result.overall_summary}`,
          citations: this.extractVersionCitations({  // Reuse version citation extractor
            document_name: result.document_name,
            changes: result.timeline.flatMap((t: any) => t.key_changes || [])
          })
        };

      default:
        return {
          text: JSON.stringify(result)
        };
    }
  }

  /**
   * Main agent processing with function calling and UNIVERSAL citation tracking
   */
  async processQuery(
    userQuery: string,
    adminId: number,
    maxIterations: number = 5,
    onLog?: (stage: string, message: string) => void
  ): Promise<AgentResult> {
    const log = onLog || (() => {});
    console.log('\n🤖 Legal Compliance Agent starting...');
    console.log('📝 Query:', userQuery);
    log('AGENT_START', 'Processing your question...');

    // Reset metadata storage
    this.toolResultsMetadata.clear();

    const tools = this.getTools();
    const toolCalls: string[] = [];
    const allCitations: any[] = [];
    const allConflicts: any[] = [];

    let conversationHistory: any[] = [
      {
        role: "system",
        content: `You are a Legal & Compliance AI Agent with access to specialized tools.

⚠️ CRITICAL: HALLUCINATION PREVENTION RULES
- NEVER generate, assume, or infer information not in retrieved documents
- REFUSE to answer if documents don't contain sufficient evidence
- Say "I cannot find this information in the available documents" rather than guessing
- Do NOT use speculative language: "might", "could", "possibly", "perhaps", "likely", "probably"
- Every factual claim MUST be directly supported by tool results
- If unsure about any aspect, explicitly state the limitation

Your role:
- Answer questions about legal documents, policies, and regulations
- Compare document versions to track changes
- Detect conflicts between different policies
- Provide accurate, well-cited compliance information

CONSISTENCY & ACCURACY REQUIREMENTS:
- For similar queries, provide consistent answers using the same sources
- Focus on EXACT AND PRECISE information from retrieved documents
- Avoid generating different phrasings of the same answer
- If the same document is retrieved again, maintain the same answer structure
- Prioritize factual accuracy over variation in wording
- Never claim certainty beyond what evidence supports

Tool Selection Guidelines:
- Use search_documents for general questions about document content
- Use compare_document_versions when asked about version differences or changes
- Use detect_policy_conflicts when asked if documents conflict or contradict
- Use list_available_documents when user asks what documents exist
- Call multiple tools if needed for comprehensive, well-sourced answers

Response Requirements:
- Be precise and cite sources when available [Document Name, Section/Page]
- Reference specific document sections, pages, or clauses
- Acknowledge when information is unavailable or unclear
- Explain your reasoning based on evidence
- Focus on compliance and legal implications
- Use consistent citation format: [Document Name, Section/Page]
- Example: "According to Remote Work Policy, Section 1.1..."
- If tool finds NO relevant information, say so clearly rather than fabricating

Example GOOD answer: "According to the Remote Work Policy v1.0, Section 3.2, the probation period is 90 days."
Example BAD answer: "I believe the probation period is probably around 90 days." ❌`
      },
      {
        role: "user",
        content: userQuery
      }
    ];

    let iteration = 0;
    let finalAnswer = '';

    while (iteration < maxIterations) {
      iteration++;
      console.log(`\n🔄 Iteration ${iteration}/${maxIterations}`);
      log('LLM_THINKING', 'Analyzing your question and deciding which tools to use...');

      // Call LLM with tools
      const response = await llm.invoke(conversationHistory, {
        tools: tools as any,
        tool_choice: "auto"
      });

      const message = response;
      
      // Check if LLM wants to use tools
      if (message.additional_kwargs?.tool_calls && message.additional_kwargs.tool_calls.length > 0) {
        console.log(`📞 LLM requesting ${message.additional_kwargs.tool_calls.length} tool call(s)`);

        const toolResults: any[] = [];
        
        const toolPromises = message.additional_kwargs.tool_calls.map(async (toolCall: any) => {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);
          
          toolCalls.push(toolName);
          console.log(`  → ${toolName}(${JSON.stringify(toolArgs).substring(0, 100)}...) [PARALLEL]`);

          const friendlyNames: Record<string, string> = {
            search_documents: 'Searching documents...',
            compare_document_versions: 'Comparing document versions...',
            detect_policy_conflicts: 'Detecting policy conflicts...',
            list_available_documents: 'Listing available documents...',
            get_document_versions: 'Retrieving document versions...',
          };
          log('TOOL_START', friendlyNames[toolName] || `Running ${toolName}...`);

          // Execute in parallel
          const result = await this.executeTool(toolName, toolArgs, adminId);
          const formattedResult = this.formatToolResult(toolName, result, toolCall.id);

          log('TOOL_DONE', `Completed ${toolName.replace(/_/g, ' ')}`);
          return {
            toolCall,
            toolName,
            formattedResult
          };
        });

        // Wait for all tools to complete
        const startTime = Date.now();
        const parallelResults = await Promise.all(toolPromises);
        const elapsed = Date.now() - startTime;
        console.log(`⚡ Parallel execution completed in ${elapsed}ms`);

        // Collect results and citations
        for (const { toolCall, toolName, formattedResult } of parallelResults) {
          // UNIVERSAL CITATION COLLECTION
          if (formattedResult.citations) {
            console.log(`  ✓ Collected ${formattedResult.citations.length} citations from ${toolName}`);
            allCitations.push(...formattedResult.citations);
          }
          if (formattedResult.conflicts) {
            allConflicts.push(...formattedResult.conflicts);
          }

          toolResults.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: toolName,
            content: formattedResult.text
          });
        }

        // Add assistant message and tool results to history
        conversationHistory.push({
          role: "assistant",
          content: message.content || '',
          tool_calls: message.additional_kwargs.tool_calls
        });

        conversationHistory.push(...toolResults);

      } else {
        // No more tool calls - LLM has final answer
        log('GENERATING', 'Generating final answer...');
        finalAnswer = message.content.toString();
        console.log('\n✅ Agent completed');
        break;
      }
    }

    if (iteration >= maxIterations) {
      finalAnswer = "I apologize, but I needed more iterations than allowed to fully answer your question. Please try rephrasing or breaking down your question.";
    }

    // Deduplicate citations
    const uniqueCitations = Array.from(
      new Map(allCitations.map(c => [JSON.stringify(c), c])).values()
    );

    // FILTER: Only keep citations that are mentioned in the final answer
    const answerLower = finalAnswer.toLowerCase();
    const relevantCitations = uniqueCitations.filter(citation => {
      const docNameLower = (citation.document_name || '').toLowerCase();
      const sectionLower = (citation.section || '').toLowerCase();
      
      // Keep citation if document or section is mentioned in answer
      return answerLower.includes(docNameLower) || 
             (sectionLower !== 'n/a' && answerLower.includes(sectionLower));
    });

    // If no citations passed the filter but we have some, keep the highest-scored ones
    const finalCitations = relevantCitations.length > 0 
      ? relevantCitations 
      : uniqueCitations.slice(0, 5); // Fallback: keep top 5

    console.log(`\n📚 Total citations collected: ${uniqueCitations.length} → Relevant: ${finalCitations.length}`);

    // Calculate actual confidence from tool results
    let aggregatedConfidence = 0;

    // Extract confidence from tool results
    for (const [toolCallId, metadata] of this.toolResultsMetadata.entries()) {
      if (metadata.result?.confidence !== undefined) {
        aggregatedConfidence = Math.max(aggregatedConfidence, metadata.result.confidence);
      }
    }

    // If no confidence found, estimate based on evidence
    if (aggregatedConfidence === 0) {
      if (finalCitations.length >= 5) {
        aggregatedConfidence = 90;  // Many citations = high confidence
      } else if (finalCitations.length >= 3) {
        aggregatedConfidence = 80;  // Several citations = good confidence
      } else if (finalCitations.length >= 1) {
        aggregatedConfidence = 70;  // Some citations = medium confidence
      } else if (toolCalls.includes('list_available_documents') || toolCalls.includes('get_document_versions')) {
        aggregatedConfidence = 95; // Listing operations are always accurate
      } else {
        aggregatedConfidence = 60; // Default moderate confidence
      }
    }

    return {
      answer: finalAnswer,
      tool_calls: toolCalls,
      citations: finalCitations.length > 0 ? finalCitations : undefined,
      confidence: aggregatedConfidence,
      reasoning: `Used ${toolCalls.length} tool(s): ${toolCalls.join(', ')}`
    };
  }
}