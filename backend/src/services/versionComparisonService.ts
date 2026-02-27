import { llm } from '../config/openai';
import { DocumentService } from './documentService';
import { ConflictDetectionService } from './conflictDetectionService';
import pool from '../config/database';
import logger from '../utils/logger';

export interface ParsedComparisonRequest {
  documentName: string;
  version1: string;
  version2: string;
}

export class VersionComparisonService {
  private documentService: DocumentService;
  private conflictService: ConflictDetectionService;

  constructor() {
    this.documentService = new DocumentService();
    this.conflictService = new ConflictDetectionService();
  }

  /**
   * Helper: Normalize a string for matching (lowercase, trim, collapse spaces)
   */
  private normalizeTerm(s: string): string {
    return (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Helper: Tokenize into words (alphanumeric segments)
   */
  private tokenize(s: string): string[] {
    return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  }

  /**
   * Helper: Calculate word overlap score between two strings
   */
  private wordOverlapScore(term: string, target: string): number {
    const termWords = new Set(this.tokenize(term));
    const targetWords = new Set(this.tokenize(target));
    if (termWords.size === 0) return 0;
    let matches = 0;
    for (const w of termWords) {
      if (targetWords.has(w)) matches++;
    }
    return matches / termWords.size;
  }

  /**
   * Resolve user input to a category with scoring logic.
   * 
   * Returns { category, resolvedFrom, documentCount } or null if no good match found.
   * 
   * Scoring:
   * - Exact match with category: 1.0
   * - Category contains input or input contains category: 0.8
   * - Word overlap with category: by ratio
   * - Exact/contains match with filename in category: 0.7
   * - Word overlap with filename: by ratio
   * 
   * Threshold: >= 0.3
   */
  async resolveCategoryFromInput(
    userInput: string,
    adminId: number
  ): Promise<{ category: string; resolvedFrom: string; documentCount: number } | null> {
    try {
      // Load all distinct categories with document counts
      const categoriesQuery = `
        SELECT DISTINCT category, COUNT(*) as doc_count
        FROM documents
        WHERE admin_id = $1 AND is_active = true AND category IS NOT NULL
        GROUP BY category
      `;
      const categoriesResult = await pool.query(categoriesQuery, [adminId]);
      const categories: Array<{ category: string; doc_count: number }> = categoriesResult.rows;

      if (categories.length === 0) {
        return null;
      }

      // Load all filenames with their categories
      const filenamesQuery = `
        SELECT DISTINCT filename, category
        FROM documents
        WHERE admin_id = $1 AND is_active = true
      `;
      const filenamesResult = await pool.query(filenamesQuery, [adminId]);
      const filenames: Array<{ filename: string; category: string | null }> = filenamesResult.rows;

      // Map category → list of filenames in that category
      const categoriesMap = new Map<string, string[]>();
      for (const file of filenames) {
        if (file.category) {
          if (!categoriesMap.has(file.category)) {
            categoriesMap.set(file.category, []);
          }
          categoriesMap.get(file.category)!.push(file.filename);
        }
      }

      // Score each category
      const normalized = this.normalizeTerm(userInput);
      let bestScore = 0;
      let bestCategory: string | null = null;
      let bestDocCount = 0;

      for (const catRow of categories) {
        const catNorm = this.normalizeTerm(catRow.category);
        let score = 0;

        // 1. Exact match with category
        if (catNorm === normalized) {
          score = 1.0;
        }
        // 2. Category contains input or input contains category
        else if (
          catNorm.includes(normalized) ||
          normalized.includes(catNorm)
        ) {
          score = 0.8;
        }
        // 3. Word overlap with category
        else {
          const overlapScore = this.wordOverlapScore(userInput, catRow.category);
          if (overlapScore > 0) {
            score = overlapScore;
          }
        }

        // 4. Check if user input matches any filename in this category
        const filesInCategory = categoriesMap.get(catRow.category) || [];
        for (const filename of filesInCategory) {
          const fileNorm = this.normalizeTerm(filename);
          // Exact or contains match with filename
          if (fileNorm === normalized || fileNorm.includes(normalized) || normalized.includes(fileNorm)) {
            score = Math.max(score, 0.7);
          }
          // Word overlap with filename
          const fileOverlap = this.wordOverlapScore(userInput, filename);
          if (fileOverlap > 0) {
            score = Math.max(score, fileOverlap);
          }
        }

        // Track best match
        if (score > bestScore) {
          bestScore = score;
          bestCategory = catRow.category;
          bestDocCount = catRow.doc_count;
        }
      }

      // Return if threshold met
      if (bestScore >= 0.3 && bestCategory) {
        logger.info('Resolved user input to category', {
          userInput,
          resolvedCategory: bestCategory,
          score: bestScore,
          documentCount: bestDocCount
        });
        return {
          category: bestCategory,
          resolvedFrom: userInput,
          documentCount: bestDocCount
        };
      }

      return null;
    } catch (error) {
      logger.error('Error resolving category from input', { userInput, adminId, error });
      return null;
    }
  }

  /**
   * Extract citations from version comparison changes
   */
  private extractCitations(comparison: any): any[] {
    // Defensive: check if comparison object has required structure
    if (!comparison || !comparison.changes || comparison.changes.length === 0) {
      return [];
    }

    // Ensure version1 and version2 exist with version fields
    if (!comparison.version1 || !comparison.version2) {
      return [];
    }

    const v1Version = comparison.version1.version || comparison.version1;
    const v2Version = comparison.version2.version || comparison.version2;

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
          document_name: comparison.document_name || 'Unknown Document',
          version: v2Version,
          section: change.section_name || 'N/A',
          page: change.page_number || null,
          change_type: 'ADDED',
          content: change.new_content.substring(0, 200) + '...'
        });
      }

      // Create citation for removed content
      if (change.change_type === 'removed' && change.old_content) {
        citations.push({
          document_name: comparison.document_name || 'Unknown Document',
          version: v1Version,
          section: change.section_name || 'N/A',
          page: change.page_number || null,
          change_type: 'REMOVED',
          content: change.old_content.substring(0, 200) + '...'
        });
      }

      // Create citation for modified content (show both versions)
      if (change.change_type === 'modified' && change.old_content && change.new_content) {
        citations.push({
          document_name: comparison.document_name || 'Unknown Document',
          version: `${v1Version} → ${v2Version}`,
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
    } catch (error) {
      logger.error('Failed to parse comparison request', { error });
      return null;
    }
  }

  /**
   * Process intelligent version comparison by category.
   * Resolves category from input, then fetches and compares specific two versions.
   */
  async processComparison(userQuery: string, adminId: number): Promise<any> {
    try {
      // Step 1: Parse the user query to extract document name and versions
      const parsed = await this.parseComparisonRequest(userQuery);

      if (!parsed) {
        return {
          error: 'Could not understand version comparison request. Please specify document name and two versions to compare.',
          suggestions: 'Try: "compare [document name] version [X] and [Y]"'
        };
      }

      // Step 2: Resolve category from parsed document name
      const resolution = await this.resolveCategoryFromInput(parsed.documentName, adminId);

      if (!resolution) {
        // Get available categories for suggestions
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

        return {
          error: `Could not find a category for "${parsed.documentName}".`,
          suggestions:
            availableCategories.length > 0
              ? `Available categories: ${availableCategories.join(', ')}`
              : 'No documents found in your account.'
        };
      }

      // Step 3: Resolve version numbers
      const resolvedV1 = await this.resolveVersionInCategory(
        resolution.category,
        parsed.version1,
        adminId
      );
      const resolvedV2 = await this.resolveVersionInCategory(
        resolution.category,
        parsed.version2,
        adminId
      );

      if (!resolvedV1 || !resolvedV2) {
        // Get available versions for this category
        const availableVersionsQuery = `
          SELECT DISTINCT version
          FROM documents
          WHERE category = $1 AND admin_id = $2 AND version IS NOT NULL
          ORDER BY CAST(version AS INTEGER) ASC
        `;
        const availableResult = await pool.query(availableVersionsQuery, [
          resolution.category,
          adminId
        ]);
        const availableVersions = availableResult.rows.map((r: any) => r.version);

        return {
          error: `Could not resolve versions "${parsed.version1}" and/or "${parsed.version2}" for category "${resolution.category}".`,
          available_versions: availableVersions,
          suggestions: `Available versions: ${availableVersions.join(', ')}`
        };
      }

      // Step 4: Fetch the specific versions by category and version number
      const v1Query = `
        SELECT id, filename, version, is_active, created_at, content
        FROM documents
        WHERE category = $1 AND admin_id = $2 AND version = $3
        LIMIT 1
      `;
      const v1Result = await pool.query(v1Query, [resolution.category, adminId, resolvedV1]);
      const v1Doc = v1Result.rows[0];

      const v2Query = `
        SELECT id, filename, version, is_active, created_at, content
        FROM documents
        WHERE category = $1 AND admin_id = $2 AND version = $3
        LIMIT 1
      `;
      const v2Result = await pool.query(v2Query, [resolution.category, adminId, resolvedV2]);
      const v2Doc = v2Result.rows[0];

      if (!v1Doc || !v2Doc) {
        return {
          error: 'Could not fetch the specified versions for comparison.',
          category: resolution.category
        };
      }

      // Step 5: Perform detailed comparison
      try {
        const comparison = await this.documentService.compareVersionsDetailed(
          v1Doc.filename,
          resolvedV1.toString(),
          resolvedV2.toString(),
          adminId
        );

        const citations = this.extractCitations(comparison);

        return {
          success: true,
          category: resolution.category,
          resolved_from: resolution.resolvedFrom,
          comparison: {
            ...comparison,
            citations
          }
        };
      } catch (error: any) {
        return {
          error: 'Failed to compare versions',
          details: error.message,
          category: resolution.category
        };
      }
    } catch (error: any) {
      logger.error('Error in processComparison', { userQuery, adminId, error });
      return {
        error: 'An error occurred during version comparison',
        details: error?.message
      };
    }
  }

  /**
   * Helper: Resolve a version string to an actual version number in a specific category.
   * Supports: exact versions, "latest", "previous", partial versions.
   */
  private async resolveVersionInCategory(
    category: string,
    versionInput: string,
    adminId: number
  ): Promise<number | null> {
    const normalized = versionInput.toLowerCase().trim();

    // Handle "latest" keyword
    if (normalized === 'latest' || normalized === 'current') {
      const query = `
        SELECT version
        FROM documents
        WHERE category = $1 AND admin_id = $2
        ORDER BY CAST(version AS INTEGER) DESC
        LIMIT 1
      `;
      const result = await pool.query(query, [category, adminId]);
      const version = result.rows[0]?.version;
      return version != null ? (typeof version === 'string' ? parseInt(version, 10) : version) : null;
    }

    // Handle "previous" keyword
    if (normalized === 'previous' || normalized === 'old' || normalized === 'older') {
      const query = `
        SELECT version
        FROM documents
        WHERE category = $1 AND admin_id = $2
        ORDER BY CAST(version AS INTEGER) DESC
        LIMIT 2 OFFSET 1
      `;
      const result = await pool.query(query, [category, adminId]);
      const version = result.rows[0]?.version;
      return version != null ? (typeof version === 'string' ? parseInt(version, 10) : version) : null;
    }

    // Try exact version match
    const exactQuery = `
      SELECT version
      FROM documents
      WHERE category = $1 AND admin_id = $2 AND (version = $3 OR version::text = $3)
      LIMIT 1
    `;
    const exactResult = await pool.query(exactQuery, [category, adminId, versionInput.trim()]);
    if (exactResult.rows.length > 0) {
      const version = exactResult.rows[0].version;
      return version != null ? (typeof version === 'string' ? parseInt(version, 10) : version) : null;
    }

    // Try partial version matching (e.g., "2" matches "2.4" if stored as string)
    const partialQuery = `
      SELECT version
      FROM documents
      WHERE category = $1 AND admin_id = $2 AND version::text LIKE $3
      ORDER BY version DESC
      LIMIT 1
    `;
    const partialResult = await pool.query(partialQuery, [
      category,
      adminId,
      `${versionInput}%`
    ]);
    if (partialResult.rows.length > 0) {
      const version = partialResult.rows[0].version;
      return version != null ? (typeof version === 'string' ? parseInt(version, 10) : version) : null;
    }

    return null;
  }

  /**
   * Compare two documents by their IDs (not by filename+version).
   * This allows comparing documents with different filenames in the same category.
   * Performs direct chunk comparison without relying on DocumentService.
   */
  private async compareDocumentsByIds(
    doc1Id: string,
    doc1Filename: string,
    doc1Version: number,
    doc2Id: string,
    doc2Filename: string,
    doc2Version: number,
    adminId?: number
  ): Promise<any> {
    try {
      // Get chunks for both documents
      const v1ChunksResult = await pool.query(
        `SELECT chunk_index, content, section_name, page_number
         FROM chunks
         WHERE document_id = $1
         ORDER BY chunk_index ASC`,
        [doc1Id]
      );

      const v2ChunksResult = await pool.query(
        `SELECT chunk_index, content, section_name, page_number
         FROM chunks
         WHERE document_id = $1
         ORDER BY chunk_index ASC`,
        [doc2Id]
      );

      const v1Chunks = v1ChunksResult.rows;
      const v2Chunks = v2ChunksResult.rows;

      if (!v1Chunks || !v2Chunks) {
        throw new Error('One or both documents not found');
      }

      // Simple chunk comparison: match by content similarity and track changes
      const changes: any[] = [];
      const usedV2Indices = new Set<number>();

      // Find modified and removed chunks
      for (const v1Chunk of v1Chunks) {
        let foundMatch = false;

        for (let j = 0; j < v2Chunks.length; j++) {
          if (usedV2Indices.has(j)) continue;

          const v2Chunk = v2Chunks[j];
          const similarity = this.calculateSimilarity(v1Chunk.content, v2Chunk.content);

          if (similarity > 0.8) {
            // Match found
            usedV2Indices.add(j);
            foundMatch = true;

            if (similarity < 0.95) {
              // Modified
              changes.push({
                chunk_index: v1Chunk.chunk_index,
                section_name: v1Chunk.section_name,
                page_number: v1Chunk.page_number,
                old_content: v1Chunk.content,
                new_content: v2Chunk.content,
                change_type: 'modified',
                similarity_score: similarity
              });
            } else {
              // Unchanged
              changes.push({
                chunk_index: v1Chunk.chunk_index,
                section_name: v1Chunk.section_name,
                page_number: v1Chunk.page_number,
                old_content: v1Chunk.content,
                new_content: v2Chunk.content,
                change_type: 'unchanged',
                similarity_score: similarity
              });
            }
            break;
          }
        }

        if (!foundMatch) {
          // Removed
          changes.push({
            chunk_index: v1Chunk.chunk_index,
            section_name: v1Chunk.section_name,
            page_number: v1Chunk.page_number,
            old_content: v1Chunk.content,
            new_content: undefined,
            change_type: 'removed'
          });
        }
      }

      // Find added chunks in v2
      for (let j = 0; j < v2Chunks.length; j++) {
        if (!usedV2Indices.has(j)) {
          const v2Chunk = v2Chunks[j];
          changes.push({
            chunk_index: v2Chunk.chunk_index,
            section_name: v2Chunk.section_name,
            page_number: v2Chunk.page_number,
            old_content: undefined,
            new_content: v2Chunk.content,
            change_type: 'added'
          });
        }
      }

      // Calculate statistics
      const statistics = {
        chunks_added: changes.filter((c: any) => c.change_type === 'added').length,
        chunks_removed: changes.filter((c: any) => c.change_type === 'removed').length,
        chunks_modified: changes.filter((c: any) => c.change_type === 'modified').length,
        chunks_unchanged: changes.filter((c: any) => c.change_type === 'unchanged').length,
        total_changes: 0,
        change_percentage: 0
      };

      statistics.total_changes = statistics.chunks_added + statistics.chunks_removed + statistics.chunks_modified;
      const totalChunks = v1Chunks.length || 1;
      statistics.change_percentage = (statistics.total_changes / totalChunks) * 100;

      // Generate summary
      const summary = this.generateComparisonSummary(statistics);

      // Ensure version1 and version2 are properly typed and non-null
      const comparisonResult = {
        document_name: doc1Filename || 'Unknown',
        version1: {
          id: doc1Id || '',
          version: doc1Version || 0,
          upload_date: new Date(),
          chunk_count: v1Chunks?.length || 0
        },
        version2: {
          id: doc2Id || '',
          version: doc2Version || 0,
          upload_date: new Date(),
          chunk_count: v2Chunks?.length || 0
        },
        statistics,
        changes,
        summary
      };

      return comparisonResult;
    } catch (error) {
      logger.error('Error comparing documents by ID', {
        doc1Id,
        doc2Id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Calculate similarity between two text strings (simple approach)
   */
  private calculateSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;
    if (text1 === text2) return 1;
    
    const len1 = text1.length;
    const len2 = text2.length;
    const maxLen = Math.max(len1, len2);

    let matches = 0;
    for (let i = 0; i < Math.min(len1, len2); i++) {
      if (text1[i] === text2[i]) matches++;
    }

    return matches / maxLen;
  }

  /**
   * Generate a summary of comparison statistics
   */
  private generateComparisonSummary(statistics: any): string {
    const parts: string[] = [];

    if (statistics.chunks_added > 0) {
      parts.push(`${statistics.chunks_added} section(s) added`);
    }
    if (statistics.chunks_removed > 0) {
      parts.push(`${statistics.chunks_removed} section(s) removed`);
    }
    if (statistics.chunks_modified > 0) {
      parts.push(`${statistics.chunks_modified} section(s) modified`);
    }

    if (parts.length === 0) {
      return 'No changes detected between versions.';
    }

    return `Overview: ${parts.join(', ')}. Total change rate: ${statistics.change_percentage.toFixed(1)}%.`;
  }

  /**
   * Compare all versions of a document BY CATEGORY (not by filename).
   * Returns all versions in that category with consecutive pair comparisons.
   */
  async compareAllVersions(
    userInput: string,
    adminId: number
  ): Promise<{
    category: string;
    resolved_from: string;
    total_versions: number;
    versions: Array<{ version: number; filename: string; is_active: boolean; date: string }>;
    comparisons: Array<{ from_version: number; to_version: number; changes: any }>;
    message?: string;
  } | { error: string; suggestions?: string }> {
    try {
      // Step 1: Resolve category from user input
      const resolution = await this.resolveCategoryFromInput(userInput, adminId);

      if (!resolution) {
        // Try to get available categories for suggestions
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

        return {
          error: `Could not identify a document or category from "${userInput}".`,
          suggestions:
            availableCategories.length > 0
              ? `Available categories: ${availableCategories.join(', ')}`
              : 'No documents found in your account.'
        };
      }

      // Step 2: Fetch ALL versions in that category, ordered by version ASC (numeric order)
      const versionsQuery = `
        SELECT id, filename, version, is_active, created_at
        FROM documents
        WHERE category = $1 AND admin_id = $2 AND version IS NOT NULL
        ORDER BY CAST(version AS INTEGER) ASC
      `;
      const versionsResult = await pool.query(versionsQuery, [
        resolution.category,
        adminId
      ]);
      // Convert version to number
      const versions: Array<{ id: string; filename: string; version: number; is_active: boolean; created_at: Date }> = versionsResult.rows.map((row: any) => ({
        ...row,
        version: typeof row.version === 'string' ? parseInt(row.version, 10) : row.version
      }));

      // Step 3: Handle single version case
      if (versions.length === 1) {
        const v = versions[0];
        const dateStr = new Date(v.created_at).toISOString().split('T')[0];
        return {
          category: resolution.category,
          resolved_from: resolution.resolvedFrom,
          total_versions: 1,
          versions: [
            {
              version: v.version,
              filename: v.filename,
              is_active: v.is_active,
              date: dateStr
            }
          ],
          comparisons: [],
          message: `Only one version of "${resolution.category}" exists (v${v.version}, uploaded ${dateStr}). Upload a new version to enable comparison.`
        };
      }

      if (versions.length === 0) {
        return {
          error: `No documents found for "${userInput}".`,
          suggestions: 'Check the category name and try again.'
        };
      }

      // Step 4: Prepare versions info for response
      const versionsList = versions.map((v) => ({
        version: v.version,
        filename: v.filename,
        is_active: v.is_active,
        date: new Date(v.created_at).toISOString().split('T')[0]
      }));

      // Step 5: Compare consecutive version pairs: v1→v2, v2→v3, ...
      // (versions already sorted by numeric order from database query)
      const comparisons: Array<{ from_version: number; to_version: number; changes: any }> = [];

      for (let i = 0; i < versions.length - 1; i++) {
        const v1 = versions[i];
        const v2 = versions[i + 1];

        // Defensive: ensure versions are valid numbers
        if (!v1?.version || !v2?.version) {
          logger.warn('Skipping comparison due to missing version', {
            category: resolution.category,
            v1Version: v1?.version,
            v2Version: v2?.version
          });
          continue;
        }

        try {
          // Compare documents by ID
          const comparison = await this.compareDocumentsByIds(
            v1.id,
            v1.filename,
            v1.version,
            v2.id,
            v2.filename,
            v2.version,
            adminId
          );

          const citations = this.extractCitations(comparison);

          comparisons.push({
            from_version: v1.version,
            to_version: v2.version,
            changes: { ...comparison, citations }
          });
        } catch (error: any) {
          logger.error('Compare pair failed in compareAllVersions', {
            category: resolution.category,
            v1: v1.version,
            v1Filename: v1.filename,
            v2: v2.version,
            v2Filename: v2.filename,
            error: error?.message
          });

          // Add error comparison
          comparisons.push({
            from_version: v1.version,
            to_version: v2.version,
            changes: {
              error: error?.message || 'Comparison failed',
              summary: '',
              statistics: {
                chunks_added: 0,
                chunks_removed: 0,
                chunks_modified: 0,
                chunks_unchanged: 0,
                change_percentage: 0
              }
            }
          });
        }
      }

      return {
        category: resolution.category,
        resolved_from: resolution.resolvedFrom,
        total_versions: versions.length,
        versions: versionsList,
        comparisons
      };
    } catch (error: any) {
      logger.error('Error in compareAllVersions', { userInput, adminId, error });
      return {
        error: 'Failed to compare versions',
        suggestions: error?.message || 'Please try again.'
      };
    }
  }
}