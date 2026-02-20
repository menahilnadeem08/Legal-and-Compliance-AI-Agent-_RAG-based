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

export const deleteDocument = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const adminId = getAdminIdForUser(req.user);
  if (!adminId) {
    throw new AppError('User role not properly configured', 500);
  }

  const result = await documentService.deleteDocument(id as string, adminId);
  return res.json(result);
});

/**
 * Activate a document (sets it as active and deactivates all other documents with same category)
 * PUT /documents/:id/activate
 */
export const activateDocument = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const adminId = getAdminIdForUser(req.user);
  if (!adminId) {
    throw new AppError('User role not properly configured', 500);
  }

  const result = await documentService.activateDocument(id as string, adminId);
  return res.json(result);
});

/**
 * Deactivate a document
 * PUT /documents/:id/deactivate
 */
export const deactivateDocument = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const adminId = getAdminIdForUser(req.user);
  if (!adminId) {
    throw new AppError('User role not properly configured', 500);
  }

  const result = await documentService.deactivateDocument(id as string, adminId);
  return res.json(result);
});