import { Request, Response } from 'express';
import { DocumentService } from '../services/documentService';

const documentService = new DocumentService();

export const listDocuments = async (req: Request, res: Response) => {
  try {
    const documents = await documentService.listDocuments();
    return res.json(documents);
  } catch (error) {
    console.error('List documents error:', error);
    return res.status(500).json({ error: 'Failed to fetch documents' });
  }
};

export const deleteDocument = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Validation: Ensure id is a string
    if (!id || Array.isArray(id)) {
      return res.status(400).json({ error: 'Document ID is required and must be a single value' });
    }

    const result = await documentService.deleteDocument(id);
    return res.json(result);
  } catch (error) {
    console.error('Delete document error:', error);
    return res.status(500).json({ error: 'Failed to delete document' });
  }
};