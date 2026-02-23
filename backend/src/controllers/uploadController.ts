import { Request, Response } from 'express';
import { UploadService } from '../services/uploadService';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../types';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const upload = multer({ dest: 'uploads/' });
const uploadService = new UploadService();

export const uploadMiddleware = upload.single('file');

/**
 * File upload cleanup middleware
 * Removes uploaded file if controller throws an error
 */
export const uploadErrorCleanup = (
  err: any,
  req: Request,
  res: Response,
  next: Function
) => {
  // Clean up uploaded file on error
  if (req.file && fs.existsSync(req.file.path)) {
    fs.unlinkSync(req.file.path);
  }
  next(err);
};

export const uploadController = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Check authentication
  if (!req.user) {
    throw new AppError('Unauthorized', 401);
  }

  // Only admins can upload documents
  if (req.user.role !== 'admin') {
    throw new AppError('Only admins can upload documents', 403);
  }

  // Validation: Check if file exists (multer validation)
  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  const { category = 'Federal Legislation / Acts' } = req.body;
  const fileExt = path.extname(req.file.originalname).slice(1);

  // Validation: Check file type
  if (!uploadService.validateFileType(fileExt)) {
    fs.unlinkSync(req.file.path);
    throw new AppError('Only PDF and DOCX files are supported', 400);
  }

  // Business logic: Process document with admin_id
  const documentId = await uploadService.ingestDocument(
    req.file.path,
    req.file.originalname,
    fileExt,
    category,
    req.user.id // Pass admin_id
  );

  // Clean up uploaded file on success
  fs.unlinkSync(req.file.path);

  // Standardized response
  return res.json({
    message: 'Document uploaded and ingested successfully',
    documentId,
  });
});