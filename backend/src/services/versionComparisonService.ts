import { llm } from '../config/openai';
import { DocumentService } from './documentService';

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
    } catch (error) {
      console.error('Failed to parse comparison request:', error);
      return null;
    }
  }

  /**
   * Process intelligent version comparison with fuzzy matching
   */
  async processComparison(userQuery: string): Promise<any> {
    // Parse the user query
    const parsed = await this.parseComparisonRequest(userQuery);
    
    if (!parsed) {
      return {
        error: 'Could not understand version comparison request. Please specify document name and two versions to compare.',
        suggestions: 'Try: "compare [document name] version [X] and [Y]"'
      };
    }

    // Resolve fuzzy document name
    const resolvedName = await this.documentService.findDocumentByName(parsed.documentName);
    
    if (!resolvedName) {
      const similar = await this.documentService.getSimilarDocuments(parsed.documentName);
      return {
        error: `Document "${parsed.documentName}" not found.`,
        suggestions: similar.length > 0 
          ? `Did you mean one of these? ${similar.join(', ')}` 
          : 'Please check the document name and try again.'
      };
    }

    // Resolve versions (supports "latest", "previous", partial versions, etc.)
    const resolvedV1 = await this.documentService.resolveVersion(resolvedName, parsed.version1);
    const resolvedV2 = await this.documentService.resolveVersion(resolvedName, parsed.version2);

    if (!resolvedV1 || !resolvedV2) {
      const availableVersions = await this.documentService.getDocumentVersions(resolvedName);
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
        resolvedV2
      );
      
      return {
        success: true,
        comparison
      };
    } catch (error: any) {
      return {
        error: 'Failed to compare versions',
        details: error.message
      };
    }
  }
}