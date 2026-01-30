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

  constructor(cohereApiKey?: string) {
    this.queryService = new QueryService(undefined, cohereApiKey);
    this.versionService = new VersionComparisonService();
    this.conflictService = new ConflictDetectionService(cohereApiKey);
    this.documentService = new DocumentService();
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
      }
    ];
  }

  /**
   * Execute tool functions
   */
  private async executeTool(toolName: string, args: any): Promise<any> {
    console.log(`🔧 Executing tool: ${toolName}`, args);

    try {
      switch (toolName) {
        case "search_documents":
          return await this.queryService.processQuery(args.query, false);

        case "compare_document_versions":
          const versionResult = await this.versionService.processComparison(
            `compare ${args.document_name} version ${args.version1} and ${args.version2}`
          );
          if (versionResult.success) {
            return versionResult.comparison;
          }
          throw new Error(versionResult.error || 'Version comparison failed');

        case "detect_policy_conflicts":
          const query = args.topic
            ? `Check conflicts between ${args.document1} and ${args.document2} regarding ${args.topic}`
            : `Check conflicts between ${args.document1} and ${args.document2}`;
          return await this.conflictService.detectConflicts(query);

        case "list_available_documents":
          const docs = await this.documentService.listDocuments();
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
          const versions = await this.documentService.getDocumentVersions(args.document_name);
          const resolvedName = await this.documentService.findDocumentByName(args.document_name);
          return {
            document_name: resolvedName || args.document_name,
            versions: versions
          };

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
    this.toolResultsMetadata.set(toolCallId, result);

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
Summary: ${result.summary}`
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
          conflicts: result.conflicts
        };

      case "list_available_documents":
        return {
          text: `Available Documents:\n${result.map((d: any) => 
            `- ${d.name} (${d.type}) - Latest: v${d.latest_version}, All versions: ${d.versions.join(', ')}`
          ).join('\n')}`
        };

      case "get_document_versions":
        return {
          text: `Versions of ${result.document_name}:\n${result.versions.join(', ')}`
        };

      default:
        return {
          text: JSON.stringify(result)
        };
    }
  }

  /**
   * Main agent processing with function calling and citation tracking
   */
  async processQuery(userQuery: string, maxIterations: number = 5): Promise<AgentResult> {
    console.log('\n🤖 Legal Compliance Agent starting...');
    console.log('📝 Query:', userQuery);

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

Your role:
- Answer questions about legal documents, policies, and regulations
- Compare document versions to track changes
- Detect conflicts between different policies
- Provide accurate, well-cited compliance information

When to use tools:
- Use search_documents for general questions about document content
- Use compare_document_versions when asked about changes between versions
- Use detect_policy_conflicts when asked if documents conflict or contradict
- Use list_available_documents when user asks what documents exist
- You can call multiple tools if needed to answer comprehensively

Always:
- Be precise and cite sources when available
- Reference specific document sections, pages, or clauses
- Acknowledge when information is unavailable
- Explain your reasoning
- Focus on compliance and legal implications

When citing sources from search results:
- Use format: [Document Name, Section/Page]
- Example: "According to the Privacy Policy, Article 5..."
- If citations are provided by tools, incorporate them naturally`
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

      // Call LLM with tools
      const response = await llm.invoke(conversationHistory, {
        tools: tools as any,
        tool_choice: "auto"
      });

      const message = response;
      
      // Check if LLM wants to use tools
      if (message.additional_kwargs?.tool_calls && message.additional_kwargs.tool_calls.length > 0) {
        console.log(`📞 LLM requesting ${message.additional_kwargs.tool_calls.length} tool call(s)`);

        // Execute all requested tools
        const toolResults: any[] = [];
        
        for (const toolCall of message.additional_kwargs.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);
          
          toolCalls.push(toolName);
          console.log(`  → ${toolName}(${JSON.stringify(toolArgs).substring(0, 100)}...)`);

          const result = await this.executeTool(toolName, toolArgs);
          const formattedResult = this.formatToolResult(toolName, result, toolCall.id);

          // Collect citations and conflicts
          if (formattedResult.citations) {
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

    return {
      answer: finalAnswer,
      tool_calls: toolCalls,
      citations: uniqueCitations.length > 0 ? uniqueCitations : undefined,
      confidence: 90,
      reasoning: `Used ${toolCalls.length} tool(s): ${toolCalls.join(', ')}`
    };
  }
}