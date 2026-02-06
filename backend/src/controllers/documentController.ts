import { Response } from 'express';
import { DocumentService } from '../services/documentService';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { getAdminIdForUser } from '../utils/adminIdUtils';
import { AuthenticatedRequest } from '../types';

const documentService = new DocumentService();

export const listDocuments = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const adminId = getAdminIdForUser(req.user);
  if (!adminId) {
    throw new AppError('User role not properly configured', 500);
  }
  
  const documents = await documentService.listDocuments(adminId);
  return res.json(documents);
});

export const getDocumentVersionHistory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { name } = req.params;
  const adminId = getAdminIdForUser(req.user);
  if (!adminId) {
    throw new AppError('User role not properly configured', 500);
  }
  
  const decodedName = decodeURIComponent(name as string);
  const history = await documentService.getDocumentVersionHistory(decodedName, adminId);
  return res.json(history);
});

export const getOutdatedDocuments = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const adminId = getAdminIdForUser(req.user);
  if (!adminId) {
    throw new AppError('User role not properly configured', 500);
  }
  
  const outdated = await documentService.getOutdatedDocuments(adminId);
  return res.json(outdated);
});

export const checkForNewerVersion = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const adminId = getAdminIdForUser(req.user);
  if (!adminId) {
    throw new AppError('User role not properly configured', 500);
  }
  
  const result = await documentService.checkForNewerVersion(id as string);
  return res.json(result);
});

/**
 * GET /documents/compare?name=...&version1=...&version2=...
 */
export const compareVersions = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { name, version1, version2 } = req.query;
  const adminId = getAdminIdForUser(req.user);
  if (!adminId) {
    throw new AppError('User role not properly configured', 500);
  }
  
  const comparison = await documentService.compareVersions(
    name as string,
    version1 as string,
    version2 as string,
    adminId
  );
  return res.json(comparison);
});

/**
 * ENHANCED: Detailed version comparison with INTELLIGENT FUZZY MATCHING
 * GET /documents/compare/detailed?name=...&version1=...&version2=...
 * Supports: fuzzy document names, partial versions, "latest", "previous" keywords
 */
export const compareVersionsDetailed = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { name, version1, version2 } = req.query;
  const adminId = getAdminIdForUser(req.user);
  if (!adminId) {
    throw new AppError('User role not properly configured', 500);
  }

  // INTELLIGENT RESOLUTION
  // 1. Fuzzy match document name
  const resolvedName = await documentService.findDocumentByName(name as string, adminId);
  if (!resolvedName) {
    const similar = await documentService.getSimilarDocuments(name as string, adminId);
    throw new AppError(`Document "${name}" not found`, 404, {
      suggestions: similar.length > 0 ? similar : ['No similar documents found'],
      hint: 'Try using a partial document name or check available documents'
    });
  }

  // 2. Resolve versions (supports "latest", "previous", partial versions like "2" -> "2.4")
  const resolvedV1 = await documentService.resolveVersion(resolvedName, version1 as string, adminId);
  const resolvedV2 = await documentService.resolveVersion(resolvedName, version2 as string, adminId);

  if (!resolvedV1 || !resolvedV2) {
    const availableVersions = await documentService.getDocumentVersions(resolvedName, adminId);
    throw new AppError('Could not resolve version(s)', 404, {
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
    resolvedV2,
    adminId
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
});

/**
 * NEW: Get suggestions for document names and versions
 * GET /documents/suggestions?query=...&document=...
 */
export const getSuggestions = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { query, document } = req.query;
  const adminId = getAdminIdForUser(req.user);
  if (!adminId) {
    throw new AppError('User role not properly configured', 500);
  }

  if (query && typeof query === 'string') {
    // Suggest documents
    const suggestions = await documentService.getSimilarDocuments(query, adminId);
    return res.json({ documents: suggestions });
  }

  if (document && typeof document === 'string') {
    // Suggest versions for a document
    const versions = await documentService.getDocumentVersions(document, adminId);
    const resolvedName = await documentService.findDocumentByName(document, adminId);
    
    return res.json({ 
      document: resolvedName || document,
      versions,
      keywords: ['latest', 'previous']
    });
  }

  throw new AppError('Either "query" or "document" parameter is required', 400);
});

export const deleteDocument = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const result = await documentService.deleteDocument(id as string);
  return res.json(result);
});

/**
 * Activate a document version
 * PUT /documents/:id/activate
 */
export const activateDocument = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const result = await documentService.activateDocument(id as string);
  return res.json(result);
});

/**
 * Deactivate a document version
 * PUT /documents/:id/deactivate
 */
export const deactivateDocument = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const result = await documentService.deactivateDocument(id as string);
  return res.json(result);
});