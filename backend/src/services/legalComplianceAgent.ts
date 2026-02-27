import pool from '../config/database';
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
        return this.extractDocumentListCitations(result?.documents ?? result ?? []);

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
    if (!comparison?.changes || comparison.changes.length === 0) {
      return [];
    }
    if (!comparison.version1 || !comparison.version2) {
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
   * Helper: Resolve document/category inputs to categories
   * Returns { category, activeFilename } for each input
   * Tries category match first, falls back to filename → get its category
   */
  private async resolveToCategories(
    inputs: string[],
    adminId: number
  ): Promise<{
    resolved: Array<{ input: string; category: string; activeFilename: string }>;
    unresolved: string[];
  }> {
    const resolved: Array<{ input: string; category: string; activeFilename: string }> = [];
    const unresolved: string[] = [];

    // Fetch all documents and categories for this admin
    const allDocs = (await this.documentService.listDocuments(adminId)).documents;
    
    for (const input of inputs) {
      try {
        // Step 1: Try category lookup
        const categoryResult = await this.versionService.resolveCategoryFromInput(input, adminId);
        if (categoryResult) {
          resolved.push({
            input,
            category: categoryResult.category,
            activeFilename: categoryResult.category
          });
          continue;
        }

        // Step 2: Fall back to filename → get its category
        const matchedDoc = allDocs.find((doc: any) => 
          doc.filename.toLowerCase() === input.toLowerCase() ||
          doc.filename.toLowerCase().includes(input.toLowerCase()) ||
          input.toLowerCase().includes(doc.filename.toLowerCase())
        );
        
        if (matchedDoc) {
          const category = matchedDoc.category || matchedDoc.filename;
          resolved.push({
            input,
            category,
            activeFilename: category
          });
          continue;
        }

        // Could not resolve
        unresolved.push(input);
      } catch (error) {
        logger.warn('Error resolving input to category', { input, error });
        unresolved.push(input);
      }
    }

    return { resolved, unresolved };
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
          description: "MANDATORY: Call this tool for ANY question about document content, legal terms, definitions, policies, rules, laws, amendments, or any factual information. This is the ONLY source of truth. NEVER answer factual questions without calling this tool first. Even if the answer seems obvious — search first. Examples that MUST use this tool: 'what is constitution?' → search for constitution content; 'what is the penalty?' → search for penalty clauses; 'what does section 12 say?' → search for section 12; 'explain notice period' → search for notice period; 'what is First Amendment?' → search YOUR documents, not training knowledge. Do NOT use for: greetings, reformatting requests",
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
          name: "analyze_documents",
          description: "Unified tool for document analysis: version comparison OR conflict detection. Automatically determines action based on inputs. 1 input → version comparison. 2+ inputs → conflict detection across categories. Resolves categories/document names automatically.",
          parameters: {
            type: "object",
            properties: {
              inputs: {
                type: "array",
                items: { type: "string" },
                description: "Category or document names to analyze (e.g. 'constitution', 'Constitution of Pakistan', 'NOC')."
              },
              detail: {
                type: "boolean",
                description: "false=summary (default), true=detailed. Set true for 'explain', 'show', 'detail', 'elaborate', or follow-ups."
              },
              version1: {
                type: "string",
                description: "Optional. For 1 input only: specific version to compare from (e.g. 'latest', 'previous', '2')."
              },
              version2: {
                type: "string",
                description: "Optional. For 1 input only: specific version to compare to."
              }
            },
            required: ["inputs"]
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
  private async executeTool(
    toolName: string,
    args: any,
    adminId: number,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<any> {
    const startTime = Date.now();
    logger.info('Tool start', { toolName, argsPreview: JSON.stringify(args).substring(0, 60) });

    try {
      switch (toolName) {
        case "search_documents": {
          let sessionContext: string | undefined;
          if (conversationHistory && conversationHistory.length >= 2) {
            const lastExchange = conversationHistory.slice(-4);
            sessionContext = 'Previous exchange(s):\n' + lastExchange
              .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
              .join('\n');
          }
          const searchResult = await this.queryService.processQuery(
            args.query,
            adminId,
            false,
            sessionContext
          );
          logger.debug('Tool completed', { toolName, elapsed: Date.now() - startTime });
          return searchResult;
        }

        case "analyze_documents": {
          const inputs = args.inputs || [];
          const detail = args.detail === true;
          const version1 = args.version1;
          const version2 = args.version2;

          // Step 1: Resolve inputs to categories
          const { resolved, unresolved } = await this.resolveToCategories(inputs, adminId);
          logger.debug('Resolved inputs to categories', { resolved: resolved.length, unresolved: unresolved.length });

          if (unresolved.length > 0 && resolved.length === 0) {
            // All unresolved - return available categories
            const categoriesQuery = `
              SELECT DISTINCT category
              FROM documents
              WHERE admin_id = $1 AND is_active = true AND category IS NOT NULL
              ORDER BY category
            `;
            const categoriesResult = await pool.query(categoriesQuery, [adminId]);
            const availableCategories = categoriesResult.rows
              .map((r: any) => r.category)
              .filter(Boolean);
            throw new Error(
              `Could not resolve "${unresolved.join('" and "')}", Available categories: ${availableCategories.join(', ') || 'None'}`
            );
          }

          // Step 2: Determine action based on unique category count
          const uniqueCategories = Array.from(new Set(resolved.map(r => r.category)));

          if (uniqueCategories.length === 1) {
            // Single category → version comparison
            const category = uniqueCategories[0];
            if (version1 && version2) {
              // Compare specific versions
              const compResult = await this.versionService.processComparison(
                `compare ${category} version ${version1} and ${version2}`,
                adminId
              );
              logger.debug('Tool completed', { toolName, elapsed: Date.now() - startTime });
              if (compResult.success) {
                return { ...compResult.comparison, detail, analysis_type: 'version_comparison' };
              }
              throw new Error(compResult.error || 'Version comparison failed');
            } else {
              // Compare all versions
              const allResult = await this.versionService.compareAllVersions(category, adminId);
              logger.debug('Tool completed', { toolName, elapsed: Date.now() - startTime });
              if ('error' in allResult) {
                throw new Error(allResult.error || 'Compare all versions failed');
              }
              return { ...allResult, detail, analysis_type: 'version_comparison' };
            }
          } else {
            // Multiple categories → conflict detection
            const categories = uniqueCategories;
            const conflictResult = await this.conflictService.detectConflicts(categories, adminId, detail);
            logger.debug('Tool completed', { toolName, elapsed: Date.now() - startTime });
            return { ...conflictResult, detail, analysis_type: 'conflict_detection' };
          }
        }

        case "compare_document_versions": {
          const input = args.input;
          const compare_all = args.compare_all !== false; // Default to true
          const detail = args.detail === true; // Default to false
          
          if (compare_all) {
            const allResult = await this.versionService.compareAllVersions(input, adminId);
            logger.debug('Tool completed', { toolName, elapsed: Date.now() - startTime });
            if ('error' in allResult) {
              throw new Error(allResult.error || 'Compare all versions failed');
            }
            return { ...allResult, detail };
          }
          
          // Compare specific two versions
          const versionResult = await this.versionService.processComparison(
            `compare ${input} version ${args.version1 ?? 'latest'} and ${args.version2 ?? 'previous'}`,
            adminId
          );
          logger.debug('Tool completed', { toolName, elapsed: Date.now() - startTime });
          if (versionResult.success) {
            return { ...versionResult.comparison, detail };
          }
          throw new Error(versionResult.error || 'Version comparison failed');
        }

        case "detect_policy_conflicts":
          const query = args.topic
            ? `Check conflicts between ${args.document1} and ${args.document2} regarding ${args.topic}`
            : `Check conflicts between ${args.document1} and ${args.document2}`;
          const conflictResult = await this.conflictService.detectConflicts(query, adminId);
          logger.debug('Tool completed', { toolName, elapsed: Date.now() - startTime });
          return conflictResult;

        case "list_available_documents": {
          const listResult = await this.documentService.listDocuments(adminId);
          logger.debug('Tool completed', { toolName, elapsed: Date.now() - startTime });
          // Group by document name
          const grouped = listResult.documents.reduce((acc: any, doc: any) => {
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
          return { documents: Object.values(grouped), confidence: listResult.confidence };
        }

        case "get_document_versions": {
          const versionResult = await this.documentService.getDocumentVersions(args.document_name, adminId);
          const resolvedName = await this.documentService.findDocumentByName(args.document_name, adminId);
          logger.debug('Tool completed', { toolName, elapsed: Date.now() - startTime });
          return {
            document_name: resolvedName || args.document_name,
            versions: versionResult.versions,
            confidence: versionResult.confidence
          };
        }

        case "find_related_documents": {
          const relatedResult = await this.documentService.findRelatedDocuments(
            args.document_name,
            adminId,
            args.limit || 5
          );
          logger.debug('Tool completed', { toolName, elapsed: Date.now() - startTime });
          return {
            document_name: args.document_name,
            related_documents: relatedResult.related_documents,
            confidence: relatedResult.confidence
          };
        }

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

      case "analyze_documents": {
        // Handle both version comparison and conflict detection
        if (result.analysis_type === 'version_comparison') {
          // Format version comparison
          const isCompareAll = Array.isArray(result.comparisons) && result.comparisons.length > 0 && !result.version1;
          const detail = result.detail === true;

          // Helper to format change details for detail mode
          const formatDetailedChanges = (changes: any[]): string => {
            if (!changes || changes.length === 0) return '';
            
            const added = changes.filter((c: any) => c.change_type === 'added');
            const removed = changes.filter((c: any) => c.change_type === 'removed');
            const modified = changes.filter((c: any) => c.change_type === 'modified');

            const sections: string[] = [];

            if (added.length > 0) {
              sections.push('  ADDED SECTIONS:');
              added.forEach((item: any) => {
                const preview = item.new_content ? item.new_content.substring(0, 150).replace(/\n/g, ' ') : '';
                const truncated = item.new_content && item.new_content.length > 150 ? '...' : '';
                sections.push(`    + [${item.section_name}]: ${preview}${truncated}`);
              });
            }

            if (removed.length > 0) {
              sections.push('  REMOVED SECTIONS:');
              removed.forEach((item: any) => {
                const preview = item.old_content ? item.old_content.substring(0, 150).replace(/\n/g, ' ') : '';
                const truncated = item.old_content && item.old_content.length > 150 ? '...' : '';
                sections.push(`    - [${item.section_name}]: ${preview}${truncated}`);
              });
            }

            if (modified.length > 0) {
              sections.push('  MODIFIED SECTIONS:');
              modified.forEach((item: any) => {
                const oldPreview = item.old_content ? item.old_content.substring(0, 150).replace(/\n/g, ' ') : '';
                const oldTruncated = item.old_content && item.old_content.length > 150 ? '...' : '';
                const newPreview = item.new_content ? item.new_content.substring(0, 150).replace(/\n/g, ' ') : '';
                const newTruncated = item.new_content && item.new_content.length > 150 ? '...' : '';
                
                let changeLevel = 'minor';
                if (item.similarity_score !== undefined) {
                  if (item.similarity_score < 0.6) changeLevel = 'major';
                  else if (item.similarity_score < 0.8) changeLevel = 'moderate';
                }
                
                sections.push(`    ~ [${item.section_name}]:`);
                sections.push(`      Before: ${oldPreview}${oldTruncated}`);
                sections.push(`      After:  ${newPreview}${newTruncated}`);
                sections.push(`      Change: ${changeLevel}`);
              });
            }

            return sections.join('\n');
          };

          if (isCompareAll) {
            const lines: string[] = [];
            const allCitations: any[] = [];

            for (const item of result.comparisons) {
              const comparison = item.changes ?? item;
              const label = item.from_version != null && item.to_version != null
                ? `v${item.from_version} → v${item.to_version}`
                : 'Versions';
              
              const v1Doc = result.versions?.find((v: any) => v.version === item.from_version);
              const v2Doc = result.versions?.find((v: any) => v.version === item.to_version);
              const docLabel = (v1Doc?.filename && v2Doc?.filename) 
                ? ` (${v1Doc.filename} → ${v2Doc.filename})`
                : '';

              const stats = comparison.statistics || {};
              lines.push(`${label}${docLabel}: ${stats.chunks_added ?? 0} added, ${stats.chunks_removed ?? 0} removed, ${stats.chunks_modified ?? 0} modified; ${(stats.change_percentage ?? 0).toFixed(1)}% change.`);

              // Include detailed changes if detail=true
              if (detail && comparison.changes) {
                const detailedText = formatDetailedChanges(comparison.changes);
                if (detailedText) {
                  lines.push(detailedText);
                }
              }

              if (comparison.document_name || comparison.version1) {
                allCitations.push(...this.extractVersionCitations(comparison));
              }
            }

            return {
              text: `Version Comparison for ${result.category} Category:\n\n${lines.join('\n')}`,
              citations: allCitations
            };
          }

          if (!result.version1 || !result.version2) {
            return {
              text: result.message ?? result.error ?? 'Version comparison could not be completed.',
              citations: []
            };
          }

          const stats = result.statistics || {};
          const summaryText = `Version Comparison:\nDocument: ${result.document_name}\nVersions: v${result.version1.version} → v${result.version2.version}\nChanges: ${stats.chunks_added} added, ${stats.chunks_removed} removed, ${stats.chunks_modified} modified\nChange Rate: ${stats.change_percentage.toFixed(1)}%`;

          return {
            text: summaryText,
            citations: this.extractVersionCitations(result)
          };
        } else {
          // Format conflict detection (multiple categories)
          const summary = result.summary || result.all_conflicts?.length 
            ? `Found ${result.total_conflicts || result.all_conflicts?.length || 0} conflicts`
            : 'No conflicts detected';
          
          return {
            text: summary,
            conflicts: result.all_conflicts || result.conflicts,
            citations: result.all_conflicts 
              ? result.all_conflicts.flatMap((c: any) => this.extractConflictCitations({ conflicts: [c] }))
              : this.extractConflictCitations(result)
          };
        }
      }

      case "compare_document_versions": {
        // Helper function to format changed sections with preview
        const formatChangeDetails = (changes: any[], detail: boolean): string => {
          if (!detail || !changes || changes.length === 0) {
            return '';
          }

          const added = changes.filter((c: any) => c.change_type === 'added');
          const removed = changes.filter((c: any) => c.change_type === 'removed');
          const modified = changes.filter((c: any) => c.change_type === 'modified');

          const sections: string[] = [];

          if (added.length > 0) {
            sections.push('ADDED SECTIONS:');
            added.forEach((item: any) => {
              const preview = item.new_content ? item.new_content.substring(0, 150).replace(/\n/g, ' ') : '';
              const truncated = item.new_content && item.new_content.length > 150 ? '...' : '';
              sections.push(`+ [${item.section_name}]: ${preview}${truncated}`);
            });
          }

          if (removed.length > 0) {
            sections.push('\nREMOVED SECTIONS:');
            removed.forEach((item: any) => {
              const preview = item.old_content ? item.old_content.substring(0, 150).replace(/\n/g, ' ') : '';
              const truncated = item.old_content && item.old_content.length > 150 ? '...' : '';
              sections.push(`- [${item.section_name}]: ${preview}${truncated}`);
            });
          }

          if (modified.length > 0) {
            sections.push('\nMODIFIED SECTIONS:');
            modified.forEach((item: any) => {
              const oldPreview = item.old_content ? item.old_content.substring(0, 150).replace(/\n/g, ' ') : '';
              const oldTruncated = item.old_content && item.old_content.length > 150 ? '...' : '';
              const newPreview = item.new_content ? item.new_content.substring(0, 150).replace(/\n/g, ' ') : '';
              const newTruncated = item.new_content && item.new_content.length > 150 ? '...' : '';
              
              let changeLevel = 'minor';
              if (item.similarity_score !== undefined) {
                if (item.similarity_score < 0.6) changeLevel = 'major';
                else if (item.similarity_score < 0.8) changeLevel = 'moderate';
              }
              
              sections.push(`~ [${item.section_name}]:`);
              sections.push(`  Before: ${oldPreview}${oldTruncated}`);
              sections.push(`  After:  ${newPreview}${newTruncated}`);
              sections.push(`  Change: ${changeLevel}`);
            });
          }

          return sections.join('\n');
        };

        // compareAllVersions returns { category, comparisons: [{ from_version, to_version, changes }] } with no version1/version2 at top level
        const isCompareAll = Array.isArray(result.comparisons) && result.comparisons.length > 0 && !result.version1;
        const detail = result.detail === true;

        if (isCompareAll) {
          const lines: string[] = [];
          const allCitations: any[] = [];

          // Display sequential version comparisons
          for (const item of result.comparisons) {
            const comparison = item.changes ?? item;
            const label = item.from_version != null && item.to_version != null
              ? `v${item.from_version} → v${item.to_version}`
              : 'Versions';
            
            // Find the document names from versionsList
            const v1Doc = result.versions?.find((v: any) => v.version === item.from_version);
            const v2Doc = result.versions?.find((v: any) => v.version === item.to_version);
            const docLabel = (v1Doc?.filename && v2Doc?.filename) 
              ? ` (${v1Doc.filename} → ${v2Doc.filename})`
              : '';

            const stats = comparison.statistics || {};
            
            // Summary line (always shown)
            lines.push(`${label}${docLabel}: ${stats.chunks_added ?? 0} added, ${stats.chunks_removed ?? 0} removed, ${stats.chunks_modified ?? 0} modified; ${(stats.change_percentage ?? 0).toFixed(1)}% change.`);
            
            // Detail section (only if detail=true)
            if (detail) {
              const changeDetails = formatChangeDetails(comparison.changes || [], true);
              if (changeDetails) {
                const indented = changeDetails.split('\n').map(line => `  ${line}`).join('\n');
                lines.push(indented);
              }
            }

            if (comparison.document_name || comparison.version1) {
              allCitations.push(...this.extractVersionCitations(comparison));
            }
          }

          return {
            text: `Version Comparison for ${result.category} Category:\n\n${lines.join('\n')}`,
            citations: allCitations
          };
        }

        if (!result.version1 || !result.version2) {
          return {
            text: result.message ?? result.error ?? 'Version comparison could not be completed.',
            citations: []
          };
        }

        const stats = result.statistics || {};
        const summaryText = `Version Comparison Results:
Document: ${result.document_name}
Versions: ${result.version1.version} → ${result.version2.version}
Changes: ${stats.chunks_added} added, ${stats.chunks_removed} removed, ${stats.chunks_modified} modified
Change Rate: ${stats.change_percentage.toFixed(1)}%
Summary: ${result.summary}`;

        const detailText = detail ? `\n\n${formatChangeDetails(result.changes || [], true)}` : '';

        return {
          text: summaryText + detailText,
          citations: this.extractVersionCitations(result)
        };
      }

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

      case "list_available_documents": {
        const docList = result?.documents ?? result ?? [];
        return {
          text: `Available Documents:\n${docList.map((d: any) => 
            `- ${d.name} (${d.category || 'N/A'}) - Latest: v${d.latest_version}, All versions: ${d.versions.join(', ')}`
          ).join('\n')}`,
          citations: this.extractDocumentListCitations(docList)
        };
      }

      case "get_document_versions":
        return {
          text: `Versions of ${result.document_name}:\n${result.versions.join(', ')}`,
          citations: this.extractVersionListCitations(result)
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

⚠️ ABSOLUTE RULES - NO EXCEPTIONS:
1. You are NOT a general assistant. You have NO knowledge of your own.
2. For EVERY factual question you MUST call search_documents FIRST
3. NEVER answer any factual question from memory or training knowledge
4. Even if you know the answer — SEARCH FIRST, always
5. If search returns nothing → say "I could not find this in uploaded documents"
6. The ONLY exceptions (no tool needed):
   - Pure greetings: "hi", "hello", "how are you"
   - Reformatting previous answer: "summarize that", "make it shorter"
   - Follow-up on previous answer: "explain that", "give me a table"

WARNING: Your training knowledge about laws, constitutions, amendments, and legal terms refers to OTHER countries and OTHER documents. IGNORE your training knowledge completely. ONLY use information from search_documents results.

EXAMPLES OF CORRECT BEHAVIOR:
✅ User: "what is constitution?"
   Agent: calls search_documents("what is constitution") → answers from result

✅ User: "what is First Amendment?"
   Agent: calls search_documents("First Amendment") → answers from YOUR documents
   NOT from US Constitution training knowledge

✅ User: "explain notice period"
   Agent: calls search_documents("notice period") → answers from result

❌ WRONG: User asks factual question → Agent answers without calling any tool
❌ WRONG: Agent uses OpenAI training knowledge to answer legal questions
❌ WRONG: Agent says "Based on my knowledge..." for any factual question

UNDERSTANDING USER INPUT:
Identify which type of input the user sent before deciding what to do:

1. QUESTION - user wants information from documents
   Examples: "what is the notice period?", "what are the penalties?"
   Action: call appropriate search/retrieval tool

2. INSTRUCTION - user wants you to do something with existing answer
   Examples: "summarize that", "make it shorter", "give me a table", "translate to urdu", "bullet points", "no citations", "explain simply", "elaborate", "reformat this"
   Action: use previous answer from conversation history, do NOT call any tool

3. COMMAND - user wants agent to perform a specific action
   Examples: "compare constitution and rules", "check all documents for conflicts", "list available documents"
   Action: call the specific tool immediately

4. FOLLOW-UP - continuing from previous message
   Examples: "is it same in all versions?", "any conflicts?", "what changed?", "tell me more"
   Action: use conversation history for context, call appropriate tool

5. GREETING - purely social
   Examples: "hi", "hello", "how are you"
   Action: respond warmly, do not call any tool

INSTRUCTION HANDLERS (no tool call needed, use previous answer):
- "summarize" / "give me a summary" → summarize previous answer in 3-4 sentences
- "make it shorter" / "brief" / "briefly" → shorten previous answer
- "more detail" / "elaborate" / "expand" → expand on previous answer
- "bullet points" / "use bullets" / "list format" → reformat as bullets
- "give me a table" / "tabular form" → reformat as table
- "translate to urdu" / "in urdu" / "urdu mein" → translate previous answer to Urdu
- "explain simply" / "simple words" / "layman terms" / "easy language" → simplify previous answer
- "no citations" / "without citations" / "remove citations" → reformat without [n] markers
- "what does that mean?" / "explain that" → explain previous answer in simpler terms
- "give me an example" → provide example based on previous answer

MIXED INPUT (question + instruction together):
- "what is the penalty? give me a table" → search for penalty, return result as table
- "compare constitution and rules and summarize" → run conflict detection, summarize result
- Execute the action first, then apply the formatting instruction to the result

URDU AND MIXED LANGUAGE SUPPORT:
- "document mein kya likha hai?" → search documents
- "conflicts check karo" → run conflict detection
- "summary do" → summarize previous answer
- "yeh samjhao" → explain previous answer simply
- "sab documents check karo" → check all documents for conflicts
- Understand intent in mixed Urdu/English and respond in the same language the user used

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
- Use search_documents for direct factual questions about document content
- USE analyze_documents for document analysis tasks:
  - 1 input (category/document name) → version history/comparison
  - 2+ inputs (multiple categories/documents) → conflict detection
  - Examples: "what changed in constitution?" → analyze_documents(inputs:["constitution"]), "compare constitution and rules?" → analyze_documents(inputs:["constitution", "rules"])
  - detail=false (DEFAULT): "how many", "summary", "overview", "brief", or first-time general question
  - detail=true: "explain", "show", "detail", "elaborate", "tell me more", or follow-ups like "explain those changes"
- Use list_available_documents when user asks what documents exist
- Use find_related_documents when user asks "what documents relate to X", "find similar policies", "what else covers this topic"
- Use gap_analysis when user asks "what is missing from", "compare coverage", "what does A have that B doesn't", "gaps between documents"
- Call multiple tools if needed for comprehensive answers

Tool Disambiguation:
- analyze_documents vs search_documents: Use search_documents for answering FROM documents. Use analyze_documents for comparing/analyzing versions or conflicts.
- gap_analysis vs analyze_documents: Use analyze_documents for version changes within a category or conflicts across categories. Use gap_analysis for topic coverage differences.
- find_related_documents vs search_documents: Use search_documents for answering questions. Use find_related_documents for discovering related documents.

FIRST MESSAGE / NO GREETING REQUIRED:
- Answer the user's question immediately. Do NOT require or wait for a greeting first.
- If the user's first (or any) message is a factual question (e.g. recommendations, policy content, what changed, conflicts), call the appropriate tool right away. Do not ask them to say hello first.

GREETING HANDLING (only when the message is purely a greeting):
- ONLY if the user message is purely a greeting (hi, hello, hey, how are you, good morning, good day, greetings, hiya, or similar casual opener with no actual question)
- Do NOT call any tool for that message
- Respond warmly and ask how you can help with legal compliance

FOLLOW-UP CONTEXT:
- Always read conversation history before deciding which tool to call
- "is it same in all versions?" → extract topic from previous message → call analyze_documents with that category
- "any conflicts?" → extract categories from previous message → call analyze_documents with those categories
- "what changed?" (about version history) → extract category from previous message → call analyze_documents

CRITICAL: DETAIL MODE FOR analyze_documents FOLLOW-UPS:
When user asks "explain those changes", "show me the changes", "tell me more", "elaborate on those", "show details", "expand on that", or "what was added/removed" (AFTER receiving a version comparison):
1. Extract the input/category from the PREVIOUS ASSISTANT MESSAGE that summarized the version comparison
2. Call analyze_documents with EXACT SAME inputs AND SET detail=true
3. Example flow:
   - User: "changes in constitution"
   - Agent: analyze_documents(inputs:["constitution"], detail:false) → returns "v1→v2: 14 added, 3 removed, 5 modified"
   - User: "explain those changes"
   - Agent: MUST call analyze_documents(inputs:["constitution"], detail:true) → returns FULL ADDED/REMOVED/MODIFIED sections
4. DO NOT ask "which document were you asking about?" - extract from history
5. The detail=true parameter is REQUIRED for "explain", "show", "detail", "elaborate", "tell me more"
- Never ask user to repeat information already in conversation history

CONFLICT FOLLOW-UPS (do NOT call analyze_documents for values):
- If the user just received a conflict report and now asks "what were the values?", "what were the change values?", "what values differed?", "list the conflicting values", or similar, they mean the CONFLICTING VALUES from that report.
- Do NOT call analyze_documents. Use the previous assistant message from conversation history and extract/list the specific values that conflicted. If not available, offer to re-run with full detail.

REFORMAT / NO CITATIONS REQUESTS:
- If the user asks to omit citations ("no citations", "without citations") OR to reformat as a paragraph, do NOT call any tool
- Use the most recent assistant message in conversation history: rewrite as 1-2 clear paragraphs, with no citation markers [1], [2], no "Sources & Citations" section
- Keep all substantive information in flowing prose
- If there is no previous assistant message, say briefly that you need a previous answer and ask them to run the query first

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
            analyze_documents: 'Analyzing documents...',
            compare_document_versions: 'Comparing document versions...',
            detect_policy_conflicts: 'Detecting policy conflicts...',
            list_available_documents: 'Listing available documents...',
            get_document_versions: 'Retrieving document versions...',
          };
          log('TOOL_START', friendlyNames[toolName] || `Running ${toolName}...`);

          // Execute in parallel
          const result = await this.executeTool(toolName, toolArgs, adminId, recentHistory);
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
      aggregatedConfidence = 0;  // No tools ran → 0 (greeting handled above)
    }

    // Apply confidence thresholds
    if (aggregatedConfidence < 20 && aggregatedConfidence > 0) {
      finalAnswer = 'Insufficient information in the knowledge base.';
      aggregatedConfidence = 0;
    }
    if (aggregatedConfidence >= 20 && aggregatedConfidence < 50) {
      finalAnswer += `\n\n⚠️ Low confidence (${aggregatedConfidence}%). Please verify with source documents.`;
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