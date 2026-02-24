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
  return res.status(200).json({ success: true, data: { documents } });
});

export const deleteDocument = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const adminId = getAdminIdForUser(req.user);
  if (!adminId) {
    throw new AppError('User role not properly configured', 500);
  }

  await documentService.deleteDocument(id as string, adminId);
  return res.status(200).json({ success: true, message: 'Document deleted' });
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

  await documentService.activateDocument(id as string, adminId);
  return res.status(200).json({ success: true, message: 'Document activated' });
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

  await documentService.deactivateDocument(id as string, adminId);
  return res.status(200).json({ success: true, message: 'Document deactivated' });
});