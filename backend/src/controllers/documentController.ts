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

/**
 * GET /documents/compare?name=...&version1=...&version2=...
 */
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

/**
 * ENHANCED: Detailed version comparison with INTELLIGENT FUZZY MATCHING
 * GET /documents/compare/detailed?name=...&version1=...&version2=...
 * Supports: fuzzy document names, partial versions, "latest", "previous" keywords
 */
export const compareVersionsDetailed = async (req: Request, res: Response) => {
  try {
    const { name, version1, version2 } = req.query;
    
    if (!name || !version1 || !version2 || Array.isArray(name) || Array.isArray(version1) || Array.isArray(version2)) {
      return res.status(400).json({ 
        error: 'name, version1, and version2 query parameters are required and must be single values' 
      });
    }

    // INTELLIGENT RESOLUTION
    // 1. Fuzzy match document name
    const resolvedName = await documentService.findDocumentByName(name as string);
    if (!resolvedName) {
      const similar = await documentService.getSimilarDocuments(name as string);
      return res.status(404).json({
        error: `Document "${name}" not found`,
        suggestions: similar.length > 0 ? similar : ['No similar documents found'],
        hint: 'Try using a partial document name or check available documents'
      });
    }

    // 2. Resolve versions (supports "latest", "previous", partial versions like "2" -> "2.4")
    const resolvedV1 = await documentService.resolveVersion(resolvedName, version1 as string);
    const resolvedV2 = await documentService.resolveVersion(resolvedName, version2 as string);

    if (!resolvedV1 || !resolvedV2) {
      const availableVersions = await documentService.getDocumentVersions(resolvedName);
      return res.status(404).json({
        error: `Could not resolve version(s)`,
        document: resolvedName,
        requested: { version1, version2 },
        available_versions: availableVersions,
        hint: 'You can use "latest", "previous", or exact/partial version numbers'
      });
    }

    // 3. Perform comparison with resolved values
    const comparison = await documentService.compareVersionsDetailed(
      resolvedName,
      resolvedV1,
      resolvedV2
    );
    
    return res.json({
      ...comparison,
      resolution_info: {
        requested_name: name,
        resolved_name: resolvedName,
        requested_version1: version1,
        resolved_version1: resolvedV1,
        requested_version2: version2,
        resolved_version2: resolvedV2
      }
    });
  } catch (error) {
    console.error('Compare versions detailed error:', error);
    return res.status(500).json({ error: 'Failed to compare versions in detail' });
  }
};

/**
 * NEW: Get suggestions for document names and versions
 * GET /documents/suggestions?query=...&document=...
 */
export const getSuggestions = async (req: Request, res: Response) => {
  try {
    const { query, document } = req.query;

    if (query && typeof query === 'string') {
      // Suggest documents
      const suggestions = await documentService.getSimilarDocuments(query);
      return res.json({ documents: suggestions });
    }

    if (document && typeof document === 'string') {
      // Suggest versions for a document
      const versions = await documentService.getDocumentVersions(document);
      const resolvedName = await documentService.findDocumentByName(document);
      
      return res.json({ 
        document: resolvedName || document,
        versions,
        keywords: ['latest', 'previous']
      });
    }

    return res.status(400).json({ 
      error: 'Either "query" or "document" parameter is required' 
    });
  } catch (error) {
    console.error('Get suggestions error:', error);
    return res.status(500).json({ error: 'Failed to get suggestions' });
  }
};

export const deleteDocument = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

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