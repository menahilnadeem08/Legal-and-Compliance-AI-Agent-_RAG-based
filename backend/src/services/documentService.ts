import pool from '../config/database';
import { llm } from '../config/openai';

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
  async listDocuments() {
    const result = await pool.query(
      `SELECT id, name, type, version, upload_date, is_latest 
       FROM documents 
       ORDER BY name ASC, upload_date DESC`
    );
    return result.rows;
  }

  /**
   * Get all versions of a document by name, with latest marked
   */
  async getDocumentVersionHistory(documentName: string): Promise<DocumentVersionHistory> {
    const result = await pool.query(
      `SELECT d.id, d.name, d.type, d.version, d.upload_date, d.is_latest,
              COUNT(c.id) as chunk_count
       FROM documents d
       LEFT JOIN chunks c ON d.id = c.document_id
       WHERE d.name = $1
       GROUP BY d.id
       ORDER BY d.upload_date DESC`,
      [documentName]
    );

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
  async getLatestDocumentVersion(documentName: string): Promise<DocumentVersion> {
    const result = await pool.query(
      `SELECT id, name, type, version, upload_date, is_latest
       FROM documents
       WHERE name = $1 AND is_latest = true
       LIMIT 1`,
      [documentName]
    );

    if (result.rows.length === 0) {
      throw new Error(`No latest version found for document "${documentName}"`);
    }

    return result.rows[0];
  }

  /**
   * Get all outdated documents (not latest versions)
   */
  async getOutdatedDocuments() {
    const result = await pool.query(
      `WITH latest_per_name AS (
         SELECT name, MAX(upload_date) as max_date
         FROM documents
         GROUP BY name
       )
       SELECT d.id, d.name, d.type, d.version, d.upload_date, d.is_latest,
              lpn.max_date,
              EXTRACT(DAY FROM NOW() - d.upload_date)::int as days_old
       FROM documents d
       JOIN latest_per_name lpn ON d.name = lpn.name
       WHERE d.upload_date < lpn.max_date
       ORDER BY days_old DESC`
    );
    return result.rows;
  }

  /**
   * Check if a document has a newer version available
   */
  async checkForNewerVersion(documentId: string): Promise<{ hasNewer: boolean; newer?: DocumentVersion }> {
    const currentDoc = await pool.query(
      'SELECT name, version, upload_date FROM documents WHERE id = $1',
      [documentId]
    );

    if (currentDoc.rows.length === 0) {
      throw new Error('Document not found');
    }

    const { name, upload_date } = currentDoc.rows[0];

    const newerResult = await pool.query(
      `SELECT id, name, type, version, upload_date, is_latest
       FROM documents
       WHERE name = $1 AND upload_date > $2
       ORDER BY upload_date DESC
       LIMIT 1`,
      [name, upload_date]
    );

    return {
      hasNewer: newerResult.rows.length > 0,
      newer: newerResult.rows[0]
    };
  }

  async deleteDocument(documentId: string) {
    await pool.query('DELETE FROM documents WHERE id = $1', [documentId]);
    return { message: 'Document deleted successfully' };
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
   * Generate AI summary of changes between versions
   */
  private async generateChangeSummary(changes: ChunkComparison[]): Promise<string> {
    const significantChanges = changes.filter(c => c.change_type !== 'unchanged').slice(0, 10);

    if (significantChanges.length === 0) {
      return 'No significant changes detected between versions.';
    }

    const changesText = significantChanges.map((change, idx) => {
      const section = change.section_name ? `Section: ${change.section_name}` : `Page ${change.page_number || 'N/A'}`;

      if (change.change_type === 'added') {
        return `${idx + 1}. [ADDED] ${section}\nNew content: "${change.new_content?.substring(0, 200)}..."`;
      } else if (change.change_type === 'removed') {
        return `${idx + 1}. [REMOVED] ${section}\nOld content: "${change.old_content?.substring(0, 200)}..."`;
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
    version2: string
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


  async compareVersions(documentName: string, version1: string, version2: string) {
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
}