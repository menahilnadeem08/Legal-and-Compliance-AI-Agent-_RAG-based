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

export const getDocumentVersionHistory = async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    if (!name || Array.isArray(name)) {
      return res.status(400).json({ error: 'Document name is required and must be a single value' });
    }
    
    const history = await documentService.getDocumentVersionHistory(decodeURIComponent(name));
    return res.json(history);
  } catch (error) {
    console.error('Get version history error:', error);
    return res.status(500).json({ error: 'Failed to fetch version history' });
  }
};

export const getOutdatedDocuments = async (req: Request, res: Response) => {
  try {
    const outdated = await documentService.getOutdatedDocuments();
    return res.json(outdated);
  } catch (error) {
    console.error('Get outdated documents error:', error);
    return res.status(500).json({ error: 'Failed to fetch outdated documents' });
  }
};

export const checkForNewerVersion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || Array.isArray(id)) {
      return res.status(400).json({ error: 'Document ID is required and must be a single value' });
    }
    
    const result = await documentService.checkForNewerVersion(id);
    return res.json(result);
  } catch (error) {
    console.error('Check newer version error:', error);
    return res.status(500).json({ error: 'Failed to check for newer version' });
  }
};

export const compareVersions = async (req: Request, res: Response) => {
  try {
    const { name, version1, version2 } = req.query;
    
    if (!name || !version1 || !version2 || Array.isArray(name) || Array.isArray(version1) || Array.isArray(version2)) {
      return res.status(400).json({ 
        error: 'name, version1, and version2 query parameters are required and must be single values' 
      });
    }
    
    const comparison = await documentService.compareVersions(
      name as string,
      version1 as string,
      version2 as string
    );
    return res.json(comparison);
  } catch (error) {
    console.error('Compare versions error:', error);
    return res.status(500).json({ error: 'Failed to compare versions' });
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