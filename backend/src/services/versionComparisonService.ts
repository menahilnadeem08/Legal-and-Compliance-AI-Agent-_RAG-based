import { llm } from '../config/openai';
import { DocumentService } from './documentService';
import logger from '../utils/logger';
export interface ParsedComparisonRequest {
  documentName: string;
  version1: string;
  version2: string;
}

export class VersionComparisonService {
  private documentService: DocumentService;

  constructor() {
    this.documentService = new DocumentService();
  }

  /**
   * Extract citations from version comparison changes
   */
  private extractCitations(comparison: any): any[] {
    if (!comparison.changes || comparison.changes.length === 0) {
      return [];
    }

    const citations: any[] = [];
    const significantChanges = comparison.changes.filter(
      (c: any) => c.change_type !== 'unchanged'
    );

    // Get top 10 most significant changes for citations
    const topChanges = significantChanges.slice(0, 10);

    for (const change of topChanges) {
      // Create citation for added content
      if (change.change_type === 'added' && change.new_content) {
        citations.push({
          document_name: comparison.document_name,
          version: comparison.version2.version,
          section: change.section_name || 'N/A',
          page: change.page_number || null,
          change_type: 'ADDED',
          content: change.new_content.substring(0, 200) + '...'
        });
      }

      // Create citation for removed content
      if (change.change_type === 'removed' && change.old_content) {
        citations.push({
          document_name: comparison.document_name,
          version: comparison.version1.version,
          section: change.section_name || 'N/A',
          page: change.page_number || null,
          change_type: 'REMOVED',
          content: change.old_content.substring(0, 200) + '...'
        });
      }

      // Create citation for modified content (show both versions)
      if (change.change_type === 'modified' && change.old_content && change.new_content) {
        citations.push({
          document_name: comparison.document_name,
          version: `${comparison.version1.version} → ${comparison.version2.version}`,
          section: change.section_name || 'N/A',
          page: change.page_number || null,
          change_type: 'MODIFIED',
          old_content: change.old_content.substring(0, 150) + '...',
          new_content: change.new_content.substring(0, 150) + '...'
        });
      }
    }

    return citations;
  }

  /**
   * Parse natural language version comparison requests
   * Examples:
   * - "compare privacy policy version 2.4 and 1.4"
   * - "show differences between latest and previous employee handbook"
   * - "what changed in terms from v1 to v2"
   */
  async parseComparisonRequest(userQuery: string): Promise<ParsedComparisonRequest | null> {
    const prompt = `Extract document comparison information from this user query.
Return ONLY a valid JSON object with exactly these fields: documentName, version1, version2

User query: "${userQuery}"

Examples:
- "compare privacy policy version 2.4 and 1.4" → {"documentName": "privacy policy", "version1": "2.4", "version2": "1.4"}
- "show differences between latest and previous employee handbook" → {"documentName": "employee handbook", "version1": "latest", "version2": "previous"}
- "what changed in terms of service from v1 to v2" → {"documentName": "terms of service", "version1": "1", "version2": "2"}
- "diff between test.pdf version 2 and 1" → {"documentName": "test.pdf", "version1": "2", "version2": "1"}

If you cannot extract comparison information, return: null

Return ONLY the JSON object or null, nothing else.`;

    try {
      const response = await llm.invoke(prompt);
      const content = response.content.toString().trim();
      
      // Handle "null" response
      if (content.toLowerCase() === 'null') {
        return null;
      }

      // Clean potential markdown formatting
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      const parsed = JSON.parse(cleaned);
      
      // Validate required fields
      if (!parsed.documentName || !parsed.version1 || !parsed.version2) {
        return null;
      }

      return {
        documentName: parsed.documentName,
        version1: parsed.version1,
        version2: parsed.version2
      };
    } catch (error: any) {
      logger.error('Error', { error: 'Failed to parse comparison request:', message: error?.message, stack: error?.stack });
      
      return null;
    }
  }

  /**
   * Process intelligent version comparison with fuzzy matching and citations
   */
  async processComparison(userQuery: string, adminId?: number): Promise<any> {
    // Parse the user query
    const parsed = await this.parseComparisonRequest(userQuery);
    
    if (!parsed) {
      return {
        error: 'Could not understand version comparison request. Please specify document name and two versions to compare.',
        suggestions: 'Try: "compare [document name] version [X] and [Y]"'
      };
    }

    // Resolve fuzzy document name
    const resolvedName = await this.documentService.findDocumentByName(parsed.documentName, adminId);
    
    if (!resolvedName) {
      const similar = await this.documentService.getSimilarDocuments(parsed.documentName, adminId);
      return {
        error: `Document "${parsed.documentName}" not found.`,
        suggestions: similar.length > 0 
          ? `Did you mean one of these? ${similar.join(', ')}` 
          : 'Please check the document name and try again.'
      };
    }

    // Resolve versions (supports "latest", "previous", partial versions, etc.)
    const resolvedV1 = await this.documentService.resolveVersion(resolvedName, parsed.version1, adminId);
    const resolvedV2 = await this.documentService.resolveVersion(resolvedName, parsed.version2, adminId);

    if (!resolvedV1 || !resolvedV2) {
      const availableVersions = await this.documentService.getDocumentVersions(resolvedName, adminId);
      return {
        error: `Could not resolve versions "${parsed.version1}" and/or "${parsed.version2}"`,
        document: resolvedName,
        available_versions: availableVersions,
        suggestions: `Available versions: ${availableVersions.join(', ')}`
      };
    }

    // Perform comparison
    try {
      const comparison = await this.documentService.compareVersionsDetailed(
        resolvedName,
        resolvedV1,
        resolvedV2,
        adminId
      );
      
      // Extract citations from changes
      const citations = this.extractCitations(comparison);
      
      return {
        success: true,
        comparison: {
          ...comparison,
          citations // Add citations to the comparison result
        }
      };
    } catch (error: any) {
      return {
        error: 'Failed to compare versions',
        details: error.message
      };
    }
  }
}
