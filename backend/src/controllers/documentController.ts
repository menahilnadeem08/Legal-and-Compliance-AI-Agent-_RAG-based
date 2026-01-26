import { Request, Response } from 'express';
import pool from '../config/database';

export const listDocuments = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, name, type, version, upload_date, is_latest 
       FROM documents 
       ORDER BY upload_date DESC`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('List documents error:', error);
    return res.status(500).json({ error: 'Failed to fetch documents' });
  }
};

export const deleteDocument = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM documents WHERE id = $1', [id]);
    return res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    return res.status(500).json({ error: 'Failed to delete document' });
  }
};