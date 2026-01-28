import pool from '../config/database';

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
   * Get document version comparison (for regulatory tracking)
   */
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