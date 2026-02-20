import pool from '../config/database';
import { llm } from '../config/openai';

export interface RelatedDocument {
  document_name: string;
  version: string;
  similarity_score: number;
  relationship_type: 'highly related' | 'related' | 'tangentially related';
  shared_topics: string[];
}

export interface DocumentVersion {
  id: string;
  name: string;
  type: string;
  version: string;
  upload_date: Date;
  is_latest: boolean;
  chunk_count?: number;
  file_size?: number;
}

export interface DocumentVersionHistory {
  document_name: string;
  versions: DocumentVersion[];
  latest: DocumentVersion;
  deprecation_warnings: string[];
}

export interface ChunkComparison {
  chunk_index: number;
  section_name?: string;
  page_number?: number;
  old_content?: string;
  new_content?: string;
  change_type: 'added' | 'removed' | 'modified' | 'unchanged';
  similarity_score?: number;
}

export interface VersionComparisonDetailed {
  document_name: string;
  version1: {
    id: string;
    version: string;
    upload_date: Date;
    chunk_count: number;
  };
  version2: {
    id: string;
    version: string;
    upload_date: Date;
    chunk_count: number;
  };
  statistics: {
    chunks_added: number;
    chunks_removed: number;
    chunks_modified: number;
    chunks_unchanged: number;
    total_changes: number;
    change_percentage: number;
  };
  changes: ChunkComparison[];
  summary: string;
  impact_analysis?: {
    high_impact_changes: string[];
    medium_impact_changes: string[];
    low_impact_changes: string[];
  };
}

export class DocumentService {
  /**
   * FUZZY DOCUMENT NAME MATCHING
   * Finds document by partial or approximate name
   */
  async findDocumentByName(userInput: string, adminId?: number): Promise<string | null> {
    // Try exact match first (case-insensitive)
    let query = 'SELECT DISTINCT name FROM documents WHERE LOWER(name) = LOWER($1)';
    if (adminId) query += ` AND admin_id = $2`;
    query += ' LIMIT 1';
    
    const params = adminId ? [userInput, adminId] : [userInput];
    const exact = await pool.query(query, params);
    if (exact.rows.length > 0) return exact.rows[0].name;

    // Try partial match (contains)
    query = 'SELECT DISTINCT name FROM documents WHERE LOWER(name) LIKE LOWER($1)';
    if (adminId) query += ` AND admin_id = $2`;
    query += ' LIMIT 1';
    
    const partial = await pool.query(query, adminId ? [userInput, adminId] : [userInput]);
    if (partial.rows.length > 0) return partial.rows[0].name;

    // Try fuzzy match using similarity (requires pg_trgm extension)
    try {
      query = `SELECT name, similarity(LOWER(name), LOWER($1)) as score 
         FROM documents 
         WHERE similarity(LOWER(name), LOWER($1)) > 0.3`;
      if (adminId) query += ` AND admin_id = $2`;
      query += ` ORDER BY score DESC N       LIMIT 1`;
      
      const fuzzy = await pool.query(query, adminId ? [userInput, adminId] : [userInput]);
      
      if (fuzzy.rows.length > 0) return fuzzy.rows[0].name;
    } catch (error) {
      console.warn('Similarity search failed (pg_trgm not enabled?):', error);
    }

    return null;
  }

  /**
   * GET SIMILAR DOCUMENT NAMES (for suggestions)
   */
  async getSimilarDocuments(userInput: string, adminId?: number): Promise<string[]> {
    let query = `SELECT DISTINCT name FROM documents 
       WHERE LOWER(name) LIKE LOWER($1)`;
    if (adminId) query += ` AND admin_id = $2`;
    query += ` ORDER BY name LIMIT 5`;
    
    const params = adminId ? [userInput, adminId] : [userInput];
    const result = await pool.query(query, params);
    return result.rows.map(r => r.name);
  }

  /**
   * INTELLIGENT VERSION RESOLUTION
   * Supports: exact versions, "latest", "previous", partial versions (e.g., "2" matches "2.4")
   */
  async resolveVersion(documentName: string, versionInput: string, adminId?: number): Promise<string | null> {
    // First find the actual document name
    const actualName = await this.findDocumentByName(documentName, adminId);
    if (!actualName) return null;

    const normalizedVersion = versionInput.toLowerCase().trim();

    // Handle "latest" keyword
    if (normalizedVersion === 'latest' || normalizedVersion === 'current') {
      let query = 'SELECT version FROM documents WHERE name = $1 AND is_latest = true';
      if (adminId) query += ' AND admin_id = $2';
      const params = adminId ? [actualName, adminId] : [actualName];
      const result = await pool.query(query, params);
      return result.rows[0]?.version || null;
    }

    // Handle "previous" or "old" keyword
    if (normalizedVersion === 'previous' || normalizedVersion === 'old' || normalizedVersion === 'older') {
      let query = `SELECT version FROM documents 
         WHERE name = $1 AND is_latest = false`;
      if (adminId) query += ' AND admin_id = $2';
      query += ` ORDER BY upload_date DESC LIMIT 1`;
      const params = adminId ? [actualName, adminId] : [actualName];
      const result = await pool.query(query, params);
      return result.rows[0]?.version || null;
    }

    // Try exact version match
    let query = 'SELECT version FROM documents WHERE name = $1 AND version = $2';
    if (adminId) query += ' AND admin_id = $3';
    let params = adminId ? [actualName, versionInput, adminId] : [actualName, versionInput];
    const exact = await pool.query(query, params);
    if (exact.rows.length > 0) return exact.rows[0].version;

    // Try partial version matching (e.g., "2" matches "2.4")
    query = `SELECT version FROM documents 
       WHERE name = $1 AND version LIKE $2`;
    if (adminId) query += ' AND admin_id = $3';
    query += ` ORDER BY version DESC LIMIT 1`;
    params = adminId ? [actualName, `${versionInput}%`, adminId] : [actualName, `${versionInput}%`];
    const partial = await pool.query(query, params);
    
    return partial.rows[0]?.version || null;
  }

  /**
   * GET ALL VERSIONS OF A DOCUMENT (for suggestions)
   */
  async getDocumentVersions(documentName: string, adminId?: number): Promise<string[]> {
    const actualName = await this.findDocumentByName(documentName, adminId);
    if (!actualName) return [];

    let query = `SELECT version FROM documents 
       WHERE name = $1`;
    if (adminId) query += ` AND admin_id = $2`;
    query += ` ORDER BY upload_date DESC`;
    
    const params = adminId ? [actualName, adminId] : [actualName];
    const result = await pool.query(query, params);
    return result.rows.map(r => r.version);
  }

  async listDocuments(adminId?: number) {
    let query = `SELECT id, name, category, version, is_active, upload_date 
       FROM documents`;
    
    if (adminId) {
      query += ` WHERE admin_id = $1`;
    }
    
    query += ` ORDER BY name ASC, upload_date DESC`;
    
    const result = adminId 
      ? await pool.query(query, [adminId])
      : await pool.query(query);
    
    return result.rows;
  }

  /**
   * Get all versions of a document by name, with latest marked
   */
  async getDocumentVersionHistory(documentName: string, adminId?: number): Promise<DocumentVersionHistory> {
    let query = `SELECT d.id, d.name, d.type, d.version, d.upload_date, d.is_latest,
              COUNT(c.id) as chunk_count
       FROM documents d
       LEFT JOIN chunks c ON d.id = c.document_id
       WHERE d.name = $1`;
    
    if (adminId) {
      query += ` AND d.admin_id = $2`;
    }
    
    query += ` GROUP BY d.id
       ORDER BY d.upload_date DESC`;
    
    const params = adminId ? [documentName, adminId] : [documentName];
    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      throw new Error(`Document "${documentName}" not found`);
    }

    const versions = result.rows as DocumentVersion[];
    const latest = versions.find(v => v.is_latest);

    // Generate deprecation warnings
    const deprecation_warnings: string[] = [];
    versions.slice(1).forEach((version, idx) => {
      deprecation_warnings.push(
        `Version ${version.version} (uploaded ${new Date(version.upload_date).toLocaleDateString()}) is outdated. Latest version is ${latest?.version}.`
      );
    });

    return {
      document_name: documentName,
      versions,
      latest: latest!,
      deprecation_warnings
    };
  }

  /**
   * Get latest version of a specific document
   */
  async getLatestDocumentVersion(documentName: string, adminId?: number): Promise<DocumentVersion> {
    let query = `SELECT id, name, type, version, upload_date, is_latest
       FROM documents
       WHERE name = $1 AND is_latest = true`;
    
    if (adminId) {
      query += ` AND admin_id = $2`;
    }
    
    query += ` LIMIT 1`;
    
    const params = adminId ? [documentName, adminId] : [documentName];
    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      throw new Error(`No latest version found for document "${documentName}"`);
    }

    return result.rows[0];
  }

  /**
   * Get all outdated documents (not latest versions)
   */
  async getOutdatedDocuments(adminId?: number) {
    let query = `WITH latest_per_name AS (
         SELECT name, MAX(upload_date) as max_date
         FROM documents`;
    
    if (adminId) {
      query += ` WHERE admin_id = $1`;
    }
    
    query += `
         GROUP BY name
       )
       SELECT d.id, d.name, d.type, d.version, d.upload_date, d.is_latest,
              lpn.max_date,
              EXTRACT(DAY FROM NOW() - d.upload_date)::int as days_old
       FROM documents d
       JOIN latest_per_name lpn ON d.name = lpn.name
       WHERE d.upload_date < lpn.max_date`;
    
    if (adminId) {
      query += ` AND d.admin_id = $1`;
    }
    
    query += ` ORDER BY days_old DESC`;
    
    const result = adminId
      ? await pool.query(query, [adminId])
      : await pool.query(query);
    
    return result.rows;
  }

  /**
   * Check if a document has a newer version available
   */
  async checkForNewerVersion(documentId: string, adminId: number): Promise<{ hasNewer: boolean; newer?: DocumentVersion }> {
    const currentDoc = await pool.query(
      'SELECT name, version, upload_date FROM documents WHERE id = $1 AND admin_id = $2',
      [documentId, adminId]
    );

    if (currentDoc.rows.length === 0) {
      throw new Error('Document not found');
    }

    const { name, upload_date } = currentDoc.rows[0];

    const newerResult = await pool.query(
      `SELECT id, name, type, version, upload_date, is_latest
       FROM documents
       WHERE name = $1 AND admin_id = $2 AND upload_date > $3
       ORDER BY upload_date DESC
       LIMIT 1`,
      [name, adminId, upload_date]
    );

    return {
      hasNewer: newerResult.rows.length > 0,
      newer: newerResult.rows[0]
    };
  }

  async deleteDocument(documentId: string, adminId: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const docResult = await client.query(
        'SELECT name FROM documents WHERE id = $1 AND admin_id = $2',
        [documentId, adminId]
      );

      if (docResult.rows.length === 0) {
        throw new Error('Document not found');
      }

      // Delete chunks first (foreign key constraint)
      await client.query('DELETE FROM chunks WHERE document_id = $1', [documentId]);

      // Delete document
      await client.query('DELETE FROM documents WHERE id = $1 AND admin_id = $2', [documentId, adminId]);

      await client.query('COMMIT');
      return { 
        message: 'Document deleted successfully'
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getDocumentById(documentId: string) {
    const result = await pool.query(
      'SELECT * FROM documents WHERE id = $1',
      [documentId]
    );
    return result.rows[0];
  }

  /**
   * Mark a document version as latest (when new version uploaded)
   */
  async markAsLatest(documentId: string, documentName: string) {
    // First, unmark all previous versions
    await pool.query(
      'UPDATE documents SET is_latest = false WHERE name = $1 AND type = (SELECT type FROM documents WHERE id = $2)',
      [documentName, documentId]
    );

    // Mark the new one as latest
    const result = await pool.query(
      'UPDATE documents SET is_latest = true WHERE id = $1 RETURNING *',
      [documentId]
    );

    return result.rows[0];
  }

  /**
   * Calculate similarity between two text chunks using simple token overlap
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const tokens1 = new Set(text1.toLowerCase().split(/\s+/));
    const tokens2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);

    return intersection.size / union.size;
  }

  /**
   * Find matching chunk in other version (for alignment)
   */
  private findMatchingChunk(
    targetChunk: any,
    candidateChunks: any[],
    usedIndices: Set<number>
  ): { index: number; similarity: number } | null {
    let bestMatch = { index: -1, similarity: 0 };

    for (let i = 0; i < candidateChunks.length; i++) {
      if (usedIndices.has(i)) continue;

      const candidate = candidateChunks[i];

      // Exact section match gets bonus
      let similarity = this.calculateTextSimilarity(targetChunk.content, candidate.content);

      if (targetChunk.section_name && candidate.section_name === targetChunk.section_name) {
        similarity += 0.2; // Boost for same section
      }

      if (similarity > bestMatch.similarity) {
        bestMatch = { index: i, similarity };
      }
    }

    return bestMatch.similarity > 0.3 ? bestMatch : null;
  }

  /**
   * Generate AI-powered change summary
   */
  private async generateChangeSummary(changes: ChunkComparison[]): Promise<string> {
    const significantChanges = changes.filter(c => 
      c.change_type !== 'unchanged' && 
      (c.section_name || c.page_number)
    ).slice(0, 10);

    if (significantChanges.length === 0) {
      return 'No significant changes detected between versions.';
    }

    const changesText = significantChanges.map((change, idx) => {
      const section = change.section_name || `Page ${change.page_number}`;
      if (change.change_type === 'added') {
        return `${idx + 1}. [ADDED] ${section}\n"${change.new_content?.substring(0, 150)}..."`;
      } else if (change.change_type === 'removed') {
        return `${idx + 1}. [REMOVED] ${section}\n"${change.old_content?.substring(0, 150)}..."`;
      } else if (change.change_type === 'modified') {
        return `${idx + 1}. [MODIFIED] ${section}\nOld: "${change.old_content?.substring(0, 150)}..."\nNew: "${change.new_content?.substring(0, 150)}..."`;
      }
      return '';
    }).join('\n\n');

    const prompt = `You are a legal document analyst. Summarize the key changes between two versions of a document.

Changes detected:
${changesText}

Provide a concise executive summary (3-5 bullet points) highlighting:
1. The most important changes
2. New additions that impact compliance or obligations
3. Removed content that may affect existing processes
4. Modified sections with significant legal implications

Be specific and actionable. Focus on business/legal impact.`;

    try {
      const response = await llm.invoke(prompt);
      return response.content.toString();
    } catch (error) {
      console.error('Error generating summary:', error);
      return `${changes.filter(c => c.change_type === 'added').length} sections added, ${changes.filter(c => c.change_type === 'removed').length} removed, ${changes.filter(c => c.change_type === 'modified').length} modified.`;
    }
  }

  /**
   * Analyze impact of changes
   */
  private analyzeImpact(changes: ChunkComparison[]): {
    high_impact_changes: string[];
    medium_impact_changes: string[];
    low_impact_changes: string[];
  } {
    const high: string[] = [];
    const medium: string[] = [];
    const low: string[] = [];

    // High-impact keywords
    const highImpactKeywords = [
      'penalty', 'fine', 'sanction', 'liability', 'breach', 'violation',
      'must', 'shall', 'required', 'mandatory', 'prohibited', 'forbidden',
      'deadline', 'terminate', 'termination', 'suspend'
    ];

    // Medium-impact keywords
    const mediumImpactKeywords = [
      'should', 'recommend', 'advised', 'obligation', 'responsibility',
      'notification', 'report', 'disclose', 'consent', 'authorization'
    ];

    for (const change of changes) {
      if (change.change_type === 'unchanged') continue;

      const content = (change.new_content || change.old_content || '').toLowerCase();
      const section = change.section_name || `Page ${change.page_number || 'N/A'}`;

      const hasHighImpact = highImpactKeywords.some(kw => content.includes(kw));
      const hasMediumImpact = mediumImpactKeywords.some(kw => content.includes(kw));

      const changeDesc = `${change.change_type.toUpperCase()} in ${section}`;

      if (hasHighImpact) {
        high.push(changeDesc);
      } else if (hasMediumImpact) {
        medium.push(changeDesc);
      } else {
        low.push(changeDesc);
      }
    }

    return {
      high_impact_changes: high.slice(0, 10),
      medium_impact_changes: medium.slice(0, 10),
      low_impact_changes: low.slice(0, 10)
    };
  }

  /**
   * ENHANCED: Get detailed document version comparison with actual content changes
   */
  async compareVersionsDetailed(
    documentName: string,
    version1: string,
    version2: string,
    adminId?: number
  ): Promise<VersionComparisonDetailed> {
    // Get document metadata
    const v1Meta = await pool.query(
      `SELECT d.id, d.version, d.upload_date, COUNT(c.id) as chunk_count
       FROM documents d
       LEFT JOIN chunks c ON d.id = c.document_id
       WHERE d.name = $1 AND d.version = $2
       GROUP BY d.id`,
      [documentName, version1]
    );

    const v2Meta = await pool.query(
      `SELECT d.id, d.version, d.upload_date, COUNT(c.id) as chunk_count
       FROM documents d
       LEFT JOIN chunks c ON d.id = c.document_id
       WHERE d.name = $1 AND d.version = $2
       GROUP BY d.id`,
      [documentName, version2]
    );

    if (v1Meta.rows.length === 0 || v2Meta.rows.length === 0) {
      throw new Error('One or both versions not found');
    }

    // Get actual chunks for both versions
    const v1Chunks = await pool.query(
      `SELECT chunk_index, content, section_name, page_number
       FROM chunks
       WHERE document_id = $1
       ORDER BY chunk_index ASC`,
      [v1Meta.rows[0].id]
    );

    const v2Chunks = await pool.query(
      `SELECT chunk_index, content, section_name, page_number
       FROM chunks
       WHERE document_id = $1
       ORDER BY chunk_index ASC`,
      [v2Meta.rows[0].id]
    );

    // Compare chunks
    const changes: ChunkComparison[] = [];
    const usedV2Indices = new Set<number>();

    // Find modified and removed chunks
    for (const v1Chunk of v1Chunks.rows) {
      const match = this.findMatchingChunk(v1Chunk, v2Chunks.rows, usedV2Indices);

      if (match) {
        usedV2Indices.add(match.index);
        const v2Chunk = v2Chunks.rows[match.index];

        if (match.similarity < 0.95) {
          // Modified
          changes.push({
            chunk_index: v1Chunk.chunk_index,
            section_name: v1Chunk.section_name,
            page_number: v1Chunk.page_number,
            old_content: v1Chunk.content,
            new_content: v2Chunk.content,
            change_type: 'modified',
            similarity_score: match.similarity
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
            similarity_score: match.similarity
          });
        }
      } else {
        // Removed
        changes.push({
          chunk_index: v1Chunk.chunk_index,
          section_name: v1Chunk.section_name,
          page_number: v1Chunk.page_number,
          old_content: v1Chunk.content,
          change_type: 'removed'
        });
      }
    }

    // Find added chunks
    for (let i = 0; i < v2Chunks.rows.length; i++) {
      if (!usedV2Indices.has(i)) {
        const v2Chunk = v2Chunks.rows[i];
        changes.push({
          chunk_index: v2Chunk.chunk_index,
          section_name: v2Chunk.section_name,
          page_number: v2Chunk.page_number,
          new_content: v2Chunk.content,
          change_type: 'added'
        });
      }
    }

    // Calculate statistics
    const stats = {
      chunks_added: changes.filter(c => c.change_type === 'added').length,
      chunks_removed: changes.filter(c => c.change_type === 'removed').length,
      chunks_modified: changes.filter(c => c.change_type === 'modified').length,
      chunks_unchanged: changes.filter(c => c.change_type === 'unchanged').length,
      total_changes: 0,
      change_percentage: 0
    };

    stats.total_changes = stats.chunks_added + stats.chunks_removed + stats.chunks_modified;
    const totalChunks = Math.max(v1Chunks.rows.length, v2Chunks.rows.length);
    stats.change_percentage = Math.min((stats.total_changes / totalChunks) * 100, 100);

    // Generate AI summary
    const summary = await this.generateChangeSummary(changes);

    // Analyze impact
    const impact_analysis = this.analyzeImpact(changes);

    return {
      document_name: documentName,
      version1: v1Meta.rows[0],
      version2: v2Meta.rows[0],
      statistics: stats,
      changes: changes.sort((a, b) => {
        // Sort by change type priority: added > removed > modified > unchanged
        const priority = { added: 0, removed: 1, modified: 2, unchanged: 3 };
        return priority[a.change_type] - priority[b.change_type];
      }),
      summary,
      impact_analysis
    };
  }


  async compareVersions(documentName: string, version1: string, version2: string, adminId?: number) {
    const v1 = await pool.query(
      `SELECT d.id, d.version, d.upload_date, COUNT(c.id) as chunk_count
       FROM documents d
       LEFT JOIN chunks c ON d.id = c.document_id
       WHERE d.name = $1 AND d.version = $2
       GROUP BY d.id`,
      [documentName, version1]
    );

    const v2 = await pool.query(
      `SELECT d.id, d.version, d.upload_date, COUNT(c.id) as chunk_count
       FROM documents d
       LEFT JOIN chunks c ON d.id = c.document_id
       WHERE d.name = $1 AND d.version = $2
       GROUP BY d.id`,
      [documentName, version2]
    );

    if (v1.rows.length === 0 || v2.rows.length === 0) {
      throw new Error('One or both versions not found');
    }

    return {
      document_name: documentName,
      version1: v1.rows[0],
      version2: v2.rows[0],
      chunk_count_difference: (v2.rows[0].chunk_count || 0) - (v1.rows[0].chunk_count || 0)
    };
  }

  /**
   * Activate a document version
   * Only allows activation if no other document with same name and type is already active
   */
  async activateDocument(documentId: string, adminId: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const docResult = await client.query(
        'SELECT category, is_active FROM documents WHERE id = $1 AND admin_id = $2',
        [documentId, adminId]
      );

      if (docResult.rows.length === 0) {
        throw new Error('Document not found');
      }

      const { category, is_active } = docResult.rows[0];

      if (is_active) {
        await client.query('COMMIT');
        return { 
          message: 'Document is already active',
          already_active: true
        };
      }

      // Deactivate all other documents with the same category
      await client.query(
        `UPDATE documents SET is_active = false WHERE category = $1 AND admin_id = $2 AND id != $3`,
        [category, adminId, documentId]
      );

      // Activate the specified document
      await client.query(
        'UPDATE documents SET is_active = true WHERE id = $1 AND admin_id = $2',
        [documentId, adminId]
      );

      await client.query('COMMIT');
      return { 
        message: 'Document activated successfully',
        already_active: false
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Deactivate a document version
   */
  async deactivateDocument(documentId: string, adminId: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const docResult = await client.query(
        'SELECT is_active FROM documents WHERE id = $1 AND admin_id = $2',
        [documentId, adminId]
      );

      if (docResult.rows.length === 0) {
        throw new Error('Document not found');
      }

      const { is_active } = docResult.rows[0];

      if (!is_active) {
        await client.query('COMMIT');
        return { 
          message: 'Document is already inactive',
          already_inactive: true
        };
      }

      await client.query(
        'UPDATE documents SET is_active = false WHERE id = $1 AND admin_id = $2',
        [documentId, adminId]
      );

      await client.query('COMMIT');
      return { 
        message: 'Document deactivated successfully',
        already_inactive: false
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find documents related to a given document using embedding similarity
   * Computes average embedding for the source document and all other documents,
   * then ranks by cosine similarity
   */
  async findRelatedDocuments(
    documentName: string,
    adminId: number,
    limit: number = 5
  ): Promise<RelatedDocument[]> {
    // Find the actual document
    const actualName = await this.findDocumentByName(documentName, adminId);
    if (!actualName) {
      throw new Error(`Document "${documentName}" not found`);
    }

    // Get source document ID
    const sourceDocQuery = await pool.query(
      `SELECT id FROM documents WHERE name = $1 AND admin_id = $2 AND is_latest = true LIMIT 1`,
      [actualName, adminId]
    );

    if (sourceDocQuery.rows.length === 0) {
      throw new Error(`Document "${actualName}" not found`);
    }

    const sourceDocId = sourceDocQuery.rows[0].id;

    // Get all chunks for source document with embeddings
    const sourceChunksQuery = await pool.query(
      `SELECT c.embedding, c.content FROM chunks c
       WHERE c.document_id = $1
       ORDER BY c.chunk_index ASC`,
      [sourceDocId]
    );

    if (sourceChunksQuery.rows.length === 0) {
      throw new Error(`No chunks found for document "${actualName}"`);
    }

    // Average the source document embeddings
    const sourceEmbeddings = sourceChunksQuery.rows.map(row => {
      const emb = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding;
      return Array.isArray(emb) ? emb : [];
    }).filter(e => e.length > 0);

    if (sourceEmbeddings.length === 0) {
      throw new Error('Source document has no valid embeddings');
    }

    const sourceDocVector = this.averageEmbeddings(sourceEmbeddings);

    // Get all OTHER latest documents for this admin
    const otherDocsQuery = await pool.query(
      `SELECT DISTINCT d.id, d.name, d.version FROM documents d
       WHERE d.admin_id = $1 AND d.is_latest = true AND d.id != $2
       ORDER BY d.name ASC`,
      [adminId, sourceDocId]
    );

    if (otherDocsQuery.rows.length === 0) {
      return []; // No other documents
    }

    // Compute average embeddings for each other document and compute similarity
    const documentSimilarities: Array<{
      document_name: string;
      version: string;
      similarity_score: number;
      source_chunks: string[];
      target_chunks: string[];
    }> = [];

    for (const doc of otherDocsQuery.rows) {
      const chunksQuery = await pool.query(
        `SELECT c.embedding, c.content FROM chunks c
         WHERE c.document_id = $1
         ORDER BY c.chunk_index ASC`,
        [doc.id]
      );

      if (chunksQuery.rows.length === 0) continue;

      const otherEmbeddings = chunksQuery.rows
        .map(row => {
          const emb = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding;
          return Array.isArray(emb) ? emb : [];
        })
        .filter(e => e.length > 0);

      if (otherEmbeddings.length === 0) continue;

      const otherDocVector = this.averageEmbeddings(otherEmbeddings);
      const similarity = this.cosineSimilarity(sourceDocVector, otherDocVector);

      // Get top chunk samples from both documents for LLM analysis
      const sourceChunkSamples = sourceChunksQuery.rows
        .slice(0, 3)
        .map(r => r.content.substring(0, 200));

      const targetChunkSamples = chunksQuery.rows
        .slice(0, 3)
        .map(r => r.content.substring(0, 200));

      documentSimilarities.push({
        document_name: doc.name,
        version: doc.version,
        similarity_score: similarity,
        source_chunks: sourceChunkSamples,
        target_chunks: targetChunkSamples
      });
    }

    // Sort by similarity and take top N
    const topDocuments = documentSimilarities
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, limit);

    if (topDocuments.length === 0) {
      return [];
    }

    // Use LLM to infer relationship type and shared topics for each related document
    const result: RelatedDocument[] = [];

    for (const doc of topDocuments) {
      const inferencePrompt = `You are analyzing document relationships. Given snippets from two documents, infer:
1. Relationship type: "highly related" (same topic/regulatory area), "related" (overlapping concerns), or "tangentially related" (minor overlap)
2. Shared topics: 2-4 key topics they share

Source Document (${actualName}) snippets:
${doc.source_chunks.join('\n\n')}

Target Document (${doc.document_name}) snippets:
${doc.target_chunks.join('\n\n')}

Respond ONLY with valid JSON:
{
  "relationship_type": "highly related" | "related" | "tangentially related",
  "shared_topics": ["topic1", "topic2"]
}`;

      try {
        const response = await llm.invoke(inferencePrompt);
        const content = response.content.toString().trim();
        const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);

        result.push({
          document_name: doc.document_name,
          version: doc.version,
          similarity_score: Math.round(doc.similarity_score * 100) / 100,
          relationship_type: parsed.relationship_type || 'related',
          shared_topics: parsed.shared_topics || []
        });
      } catch (error) {
        console.warn(`Failed to infer relationship for ${doc.document_name}:`, error);
        // Fallback: determine relationship type from similarity score
        const relType = doc.similarity_score > 0.7 ? 'highly related' : doc.similarity_score > 0.4 ? 'related' : 'tangentially related';
        result.push({
          document_name: doc.document_name,
          version: doc.version,
          similarity_score: Math.round(doc.similarity_score * 100) / 100,
          relationship_type: relType,
          shared_topics: []
        });
      }
    }

    return result;
  }

  /**
   * Calculate average of multiple embedding vectors (element-wise mean)
   */
  private averageEmbeddings(embeddings: number[][]): number[] {
    if (embeddings.length === 0) return [];

    const dims = embeddings[0].length;
    const avg = new Array(dims).fill(0);

    for (const emb of embeddings) {
      for (let i = 0; i < dims; i++) {
        avg[i] += (emb[i] || 0);
      }
    }

    return avg.map(val => val / embeddings.length);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0;

    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      magnitude1 += vec1[i] * vec1[i];
      magnitude2 += vec2[i] * vec2[i];
    }

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    if (magnitude1 === 0 || magnitude2 === 0) return 0;

    return dotProduct / (magnitude1 * magnitude2);
  }
}