import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import { DocumentService } from '../services/documentService';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { getAdminIdForUser } from '../utils/adminIdUtils';
import { AuthenticatedRequest } from '../types';
import { isSupabaseFilepath, downloadFromSupabase } from '../services/supabaseStorage';

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

/**
 * Stream document file for preview/download
 * GET /documents/:id/download
 */
export const downloadDocument = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const adminId = getAdminIdForUser(req.user);
  if (!adminId) {
    throw new AppError('User role not properly configured', 500);
  }

  const doc = await documentService.getDocumentById(id as string, adminId);
  const filepath = doc?.filepath;
  const filename = doc?.filename || "document";

  const notAvailableMessage =
    "File not available for download. It may have been uploaded before preview was enabled, or the file was removed.";

  if (!filepath) {
    throw new AppError(notAvailableMessage, 404);
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType =
    ext === ".pdf"
      ? "application/pdf"
      : ext === ".docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : ext === ".doc"
          ? "application/msword"
          : "application/octet-stream";
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `inline; filename="${path.basename(filename)}"`);

  if (isSupabaseFilepath(filepath)) {
    const buffer = await downloadFromSupabase(filepath);
    return res.send(buffer);
  }

  const resolvedPath = path.isAbsolute(filepath) ? filepath : path.resolve(process.cwd(), filepath);
  if (!fs.existsSync(resolvedPath)) {
    throw new AppError(notAvailableMessage, 404);
  }
  return res.sendFile(resolvedPath);
});