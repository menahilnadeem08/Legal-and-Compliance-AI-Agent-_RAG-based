import { llm } from '../config/openai';
import { QueryService } from './queryService';
import { VersionComparisonService } from './versionComparisonService';
import { ConflictDetectionService } from './conflictDetectionService';
import { DocumentService } from './documentService';
import { GapAnalysisService } from './gapAnalysisService';
import logger from '../utils/logger';

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
  private gapAnalysisService: GapAnalysisService;
  private toolResultsMetadata: Map<string, any> = new Map();

  constructor() {
    this.queryService = new QueryService();
    this.versionService = new VersionComparisonService();
    this.conflictService = new ConflictDetectionService();
    this.documentService = new DocumentService();
    this.gapAnalysisService = new GapAnalysisService();
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
          category: doc.category,
          available_versions: doc.versions.join(', '),
          content: `Document: ${doc.name} | Category: ${doc.category} | Latest: v${doc.latest_version}`,
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
          description: "Use for direct factual questions about document content, policies, rules, definitions. Do NOT use for greetings, version comparisons, or conflict checks.",
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
          description: "Use ONLY when user asks what changed, evolved, or differs WITHIN the same document over time across versions. Also use when user asks 'is it same in all versions?' or 'did this change between versions?'",
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
          description: "Use ONLY when user explicitly asks about conflicts, contradictions, or inconsistencies BETWEEN different documents across different categories. Do NOT use for version comparisons within the same document.",
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
          description: "Use when user asks what documents exist, what is available, or what categories are present.",
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
          description: "Use when user asks which versions exist, version history, or available version numbers for a specific document. Do NOT use to compare content between versions (use compare_document_versions for that).",
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
          description: "Use when user asks for a full evolution timeline of ONE document across all versions (e.g. 'how has this policy evolved', 'show me the history', 'timeline of changes'). Do NOT use for comparing exactly two versions (use compare_document_versions) or for conflicts between documents (use detect_policy_conflicts).",
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
      },
      {
        type: "function" as const,
        function: {
          name: "find_related_documents",
          description: "Use when user asks which documents relate to a given document, find similar policies, or what else covers a topic (discovery of related documents). Do NOT use to answer a factual question from document content (use search_documents) or to find conflicts (use detect_policy_conflicts).",
          parameters: {
            type: "object",
            properties: {
              document_name: {
                type: "string",
                description: "Name of the source document"
              },
              limit: {
                type: "number",
                description: "Max related documents to return (default 5)"
              }
            },
            required: ["document_name"]
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "gap_analysis",
          description: "Use ONLY when user asks what is missing, not covered, or absent compared to another document. Do NOT use for version-by-version changes within one document.",
          parameters: {
            type: "object",
            properties: {
              document_a: {
                type: "string",
                description: "First document name"
              },
              document_b: {
                type: "string",
                description: "Second document name to compare against"
              },
              focus_area: {
                type: "string",
                description: "Optional specific topic to focus on e.g. 'data retention' or 'termination'"
              }
            },
            required: ["document_a", "document_b"]
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
    logger.info('Tool start', { toolName, argsPreview: JSON.stringify(args).substring(0, 60) });

    try {
      switch (toolName) {
        case "search_documents":
          const searchResult = await this.queryService.processQuery(args.query, adminId);
          logger.debug('Tool completed', { toolName, elapsed: Date.now() - startTime });
          return searchResult;

        case "compare_document_versions":
          const versionResult = await this.versionService.processComparison(
            `compare ${args.document_name} version ${args.version1} and ${args.version2}`
          );
          logger.debug('Tool completed', { toolName, elapsed: Date.now() - startTime });
          if (versionResult.success) {
            return versionResult.comparison;
          }
          throw new Error(versionResult.error || 'Version comparison failed');

        case "detect_policy_conflicts":
          const query = args.topic
            ? `Check conflicts between ${args.document1} and ${args.document2} regarding ${args.topic}`
            : `Check conflicts between ${args.document1} and ${args.document2}`;
          const conflictResult = await this.conflictService.detectConflicts(query, adminId);
          logger.debug('Tool completed', { toolName, elapsed: Date.now() - startTime });
          return conflictResult;

        case "list_available_documents":
          const docs = await this.documentService.listDocuments(adminId);
          logger.debug('Tool completed', { toolName, elapsed: Date.now() - startTime });
          // Group by document name
          const grouped = docs.reduce((acc: any, doc: any) => {
            const key = doc.filename;
            if (!acc[key]) {
              acc[key] = {
                name: doc.filename,
                category: doc.category,
                versions: [],
                latest_version: null
              };
            }
            acc[key].versions.push(doc.version);
            if (doc.is_active) {
              acc[key].latest_version = doc.version;
            }
            return acc;
          }, {});
          return Object.values(grouped);

        case "get_document_versions":
          const versions = await this.documentService.getDocumentVersions(args.document_name, adminId);
          const resolvedName = await this.documentService.findDocumentByName(args.document_name, adminId);
          logger.debug('Tool completed', { toolName, elapsed: Date.now() - startTime });
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

            logger.debug('Tool completed', { toolName, elapsed: Date.now() - startTime });
            return result;
          } else {
            throw new Error('Only one version exists; no changes to track');
          }

        case "find_related_documents":
          const relatedDocs = await this.documentService.findRelatedDocuments(
            args.document_name,
            adminId,
            args.limit || 5
          );
          logger.debug('Tool completed', { toolName, elapsed: Date.now() - startTime });
          return {
            document_name: args.document_name,
            related_documents: relatedDocs
          };

        case "gap_analysis":
          const gapResult = await this.gapAnalysisService.analyzeGaps(
            args.document_a,
            args.document_b,
            adminId,
            args.focus_area
          );
          logger.debug('Tool completed', { toolName, elapsed: Date.now() - startTime });
          return gapResult;

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      logger.error('Tool execution error', { toolName, message, stack });
      return {
        error: true,
        message: message || 'An unexpected error occurred',
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

      case "detect_policy_conflicts": {
        const comparedLine = result.documents_resolved && result.documents_resolved.length >= 2
          ? `I compared ${result.documents_resolved.map((r: { userTerm: string; actualFilename: string }) => `${r.actualFilename} (matched from '${r.userTerm}')`).join(' and ')}.\n\n`
          : '';
        return {
          text: `${comparedLine}Conflict Detection Results:
Documents: ${result.documents_analyzed.join(', ')}
Conflicts Found: ${result.conflicts_found}
Summary: ${result.summary}
${result.conflicts.map((c: any, i: number) =>
          `\nConflict ${i+1} [${c.severity}]: ${c.description}`
        ).join('')}`,
          conflicts: result.conflicts,
          citations: this.extractConflictCitations(result)
        };
      }

      case "list_available_documents":
        return {
          text: `Available Documents:\n${result.map((d: any) => 
            `- ${d.name} (${d.category || 'N/A'}) - Latest: v${d.latest_version}, All versions: ${d.versions.join(', ')}`
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

      case "find_related_documents":
        const relatedListText = result.related_documents
          .map((d: any) => `• ${d.document_name} (v${d.version}) - Similarity: ${(d.similarity_score * 100).toFixed(0)}% [${d.relationship_type}]\n  Topics: ${d.shared_topics.join(', ')}`)
          .join('\n\n');
        return {
          text: `Related Documents for ${result.document_name}:\n\n${relatedListText || 'No related documents found.'}`,
          citations: result.related_documents.map((d: any) => ({
            document_name: d.document_name,
            version: d.version,
            relationship_type: d.relationship_type,
            similarity_score: d.similarity_score,
            shared_topics: d.shared_topics.join(', '),
            content: `Related with ${(d.similarity_score * 100).toFixed(0)}% similarity. Shared topics: ${d.shared_topics.join(', ')}`,
            relevance_score: d.similarity_score
          }))
        };

      case "gap_analysis":
        const gapsInBText = result.gaps_in_b.length > 0
          ? `\n${result.gaps_in_b.map((g: any) => `• [${g.severity.toUpperCase()}] ${g.topic}: ${g.recommendation}`).join('\n')}`
          : '\nNo major gaps found in this direction.';
        const gapsInAText = result.gaps_in_a.length > 0
          ? `\n${result.gaps_in_a.map((g: any) => `• [${g.severity.toUpperCase()}] ${g.topic}: ${g.recommendation}`).join('\n')}`
          : '\nNo major gaps found in this direction.';
        
        return {
          text: `Gap Analysis: "${result.document_a}" vs "${result.document_b}"

Coverage Scores:
• ${result.document_a}: ${result.coverage_score_a}% coverage of ${result.document_b}
• ${result.document_b}: ${result.coverage_score_b}% coverage of ${result.document_a}

Critical Gaps Found: ${result.critical_gaps}

Missing from ${result.document_b}:${gapsInBText}

Missing from ${result.document_a}:${gapsInAText}

Expert Analysis:
${result.llm_summary}`,
          citations: [
            ...result.gaps_in_b.map((g: any) => ({
              document_name: result.document_b,
              gap_type: 'missing',
              topic: g.topic,
              severity: g.severity,
              content: g.recommendation,
              relevance_score: g.severity === 'critical' ? 1.0 : g.severity === 'important' ? 0.7 : 0.4
            })),
            ...result.gaps_in_a.map((g: any) => ({
              document_name: result.document_a,
              gap_type: 'missing',
              topic: g.topic,
              severity: g.severity,
              content: g.recommendation,
              relevance_score: g.severity === 'critical' ? 1.0 : g.severity === 'important' ? 0.7 : 0.4
            }))
          ]
        };

      default:
        return {
          text: JSON.stringify(result)
        };
    }
  }

  /**
   * Main agent processing with function calling and UNIVERSAL citation tracking.
   * Optional conversationHistory: when provided, last 3-5 exchanges are included so follow-up questions have context.
   */
  async processQuery(
    userQuery: string,
    adminId: number,
    maxIterations: number = 5,
    onLog?: (stage: string, message: string) => void,
    conversationHistoryParam?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<AgentResult> {
    const log = onLog || (() => {});
    logger.info('Legal Compliance Agent starting', { query: userQuery });
    log('AGENT_START', 'Processing your question...');

    // Reset metadata storage
    this.toolResultsMetadata.clear();

    const tools = this.getTools();
    const toolCalls: string[] = [];
    const allCitations: any[] = [];
    const allConflicts: any[] = [];

    const systemContent = `You are a Legal & Compliance AI Agent with access to specialized tools.

⚠️ CRITICAL: HALLUCINATION PREVENTION RULES
- NEVER generate, assume, or infer information not in retrieved documents
- REFUSE to answer if documents don't contain sufficient evidence
- Say "I cannot find this information in the available documents" rather than guessing
- Do NOT use speculative language: "might", "could", "possibly", "perhaps", "likely", "probably"
- Every factual claim MUST be directly supported by tool results
- If unsure about any aspect, explicitly state the limitation

Your role:
- Follow user instructions: when the user asks you to do something (list, compare, check, search, etc.), carry it out using the right tool(s)
- Answer questions about legal documents, policies, and regulations
- Compare document versions to track changes
- Detect conflicts between different policies
- Provide accurate, well-cited compliance information

TYPING MISTAKES & INFORMAL INPUT:
- Interpret user intent even when there are minor typos or informal wording (e.g. "undestrand" → understand, "documant" → document, "constituion" → constitution)
- When calling tools, use the intended meaning; for search_documents you may pass a corrected or normalized query if the typo is clear
- Document names are resolved automatically (fuzzy matching), so "ajk rules" or "constitute" can match actual document titles

UNDERSTAND INSTRUCTIONS:
- Follow the user's instructions and intent. If they ask for a comparison, list, search, or conflict check, do that
- Prioritize what the user asked for and choose the right tool(s) for their goal
- If the user gives a multi-part request, address all parts or clarify

CONSISTENCY & ACCURACY REQUIREMENTS:
- For similar queries, provide consistent answers using the same sources
- Focus on EXACT AND PRECISE information from retrieved documents
- Avoid generating different phrasings of the same answer
- If the same document is retrieved again, maintain the same answer structure
- Prioritize factual accuracy over variation in wording
- Never claim certainty beyond what evidence supports

Tool Selection Guidelines:
- Use search_documents for general questions about document content or answering FROM documents
- Use compare_document_versions when asked about version differences or changes WITHIN the same document
- Use detect_policy_conflicts when asked if documents conflict or contradict
- Use list_available_documents when user asks what documents exist
- Use track_policy_changes when user asks "what changed", "how has this evolved", "show me the history", "what was updated", "differences across versions", or "policy timeline"
- Use find_related_documents when user asks "what documents relate to X", "find similar policies", "what else covers this topic", "documents like X", or "related contracts"
- Use gap_analysis when user asks "what is missing from", "compare coverage", "what does A have that B doesn't", "gaps between documents", or "what topics are not covered"
- Call multiple tools if needed for comprehensive, well-sourced answers

Tool Disambiguation:
- gap_analysis vs compare_document_versions: Use compare_document_versions for text-level changes between versions of the SAME document. Use gap_analysis to compare topic coverage differences between TWO DIFFERENT documents.
- find_related_documents vs search_documents: Use search_documents for answering questions FROM documents. Use find_related_documents for discovering WHICH documents are topically connected to a specific document.

FIRST MESSAGE / NO GREETING REQUIRED:
- Answer the user's question immediately. Do NOT require or wait for a greeting first.
- If the user's first (or any) message is a factual question (e.g. recommendations, policy content, what changed, conflicts), call the appropriate tool right away (e.g. search_documents, compare_document_versions, detect_policy_conflicts). Do not ask them to say hello first.

GREETING HANDLING (only when the message is purely a greeting):
- ONLY if the user message is purely a greeting (hi, hello, hey, how are you, good morning, good day, greetings, hiya, or similar casual opener with no actual question)
- Do NOT call any tool for that message
- Respond warmly and ask how you can help with legal compliance

FOLLOW-UP CONTEXT:
- Always read conversation history before deciding which tool to call
- "is it same in all versions?" → extract topic from previous message → call compare_document_versions
- "any conflicts?" → extract topic from previous message → call detect_policy_conflicts
- "what changed?" (about version history of ONE document) → extract document from previous message → call compare_document_versions
- Never ask user to repeat information already in conversation history

CONFLICT FOLLOW-UPS (do NOT call compare_document_versions):
- If the user just received a conflict report and now asks "what were the values?", "what were the change values?", "what values differed?", "list the conflicting values", "what were the specific numbers?", or similar, they mean the CONFLICTING VALUES from that report (e.g. OEE 85% vs 90%, MTTR 3.0 vs 2.5 hrs), NOT version-to-version changes.
- Do NOT call compare_document_versions or say "only one version available." Use the previous assistant message (the conflict summary) from conversation history and extract/list the specific values that conflicted between the two documents (targets, percentages, counts, etc.) in a clear list or table. If the previous message does not contain those values, say so and offer to re-run conflict detection with full detail.

REFORMAT / NO CITATIONS REQUESTS:
- If the user asks to omit citations (e.g. "no citations", "don't give citations", "without citations") OR to reformat as a paragraph (e.g. "make it a paragraph", "summarize as a paragraph", "give me a paragraph of this"), do NOT call any tool and do NOT say "I cannot find this information."
- Use the most recent assistant message in the conversation history: rewrite that content as one or two clear paragraphs, with no citation markers like [1], [2], no "Sources & Citations" section, and no inline references. Keep all the substantive information (conflicts, summary, action items) in flowing prose.
- If there is no previous assistant message to reformat, say briefly that you need a previous answer to reformat and ask them to run the query again first.

AMBIGUITY HANDLING:
- If query is too vague and context does not help → ask one specific clarifying question
- Never call a tool with guessed arguments when not confident

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
Example BAD answer: "I believe the probation period is probably around 90 days." ❌`;

    const maxHistoryMessages = 10;
    const recentHistory = conversationHistoryParam?.length
      ? conversationHistoryParam.slice(-maxHistoryMessages)
      : [];

    let conversationHistory: any[] = [
      { role: "system", content: systemContent },
      ...recentHistory.map(msg => ({ role: msg.role, content: msg.content })),
      { role: "user", content: userQuery }
    ];

    let iteration = 0;
    let finalAnswer = '';

    while (iteration < maxIterations) {
      iteration++;
      logger.debug('Agent iteration', { iteration, maxIterations });
      log('LLM_THINKING', 'Analyzing your question and deciding which tools to use...');

      // Call LLM with tools
      const response = await llm.invoke(conversationHistory, {
        tools: tools as any,
        tool_choice: "auto"
      });

      const message = response;
      
      // Check if LLM wants to use tools
      if (message.additional_kwargs?.tool_calls && message.additional_kwargs.tool_calls.length > 0) {
        logger.debug('LLM requesting tool calls', { count: message.additional_kwargs.tool_calls.length });

        const toolResults: any[] = [];
        
        const toolPromises = message.additional_kwargs.tool_calls.map(async (toolCall: any) => {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);
          
          toolCalls.push(toolName);
          logger.debug('Parallel tool call', { toolName, argsPreview: JSON.stringify(toolArgs).substring(0, 100) });

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
        logger.debug('Parallel execution completed', { elapsed });

        // Collect results and citations
        for (const { toolCall, toolName, formattedResult } of parallelResults) {
          // UNIVERSAL CITATION COLLECTION
          if (formattedResult.citations) {
            logger.debug('Collected citations from tool', { toolName, count: formattedResult.citations.length });
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
        logger.info('Agent completed');
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

    logger.info('Total citations collected', { total: uniqueCitations.length, relevant: finalCitations.length });

    // Confidence: from tool results, or for greeting/no-tool responses use high confidence
    let aggregatedConfidence = 0;
    if (toolCalls.length > 0) {
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
    } else {
      // No tools called: do not calculate or show confidence for greeting replies
      const isGreetingReply = /^(hi|hello|hey|hi there|hello there|greetings)[\s!.,]|how can I (help|assist)|what can I (help|assist)|how may I (help|assist)|happy to help|here to help|assist you with/i.test(finalAnswer.trim().slice(0, 200));
      aggregatedConfidence = isGreetingReply ? 0 : 95;
    }

    // Do not show high confidence for error/fallback answers (e.g. retrieval issues, document not recognized)
    const isErrorOrFallbackAnswer = /\b(issues? with|not being recognized|please confirm|cannot find|unable to (retrieve|find)|could not (retrieve|find)|not (found|recognized)|insufficient information|no (relevant )?information)\b/i.test(finalAnswer);
    if (isErrorOrFallbackAnswer) {
      aggregatedConfidence = 0;
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