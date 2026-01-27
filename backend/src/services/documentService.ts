import pool from '../config/database';

export class DocumentService {
  async listDocuments() {
    const result = await pool.query(
      `SELECT id, name, type, version, upload_date, is_latest 
       FROM documents 
       ORDER BY upload_date DESC`
    );
    return result.rows;
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
}