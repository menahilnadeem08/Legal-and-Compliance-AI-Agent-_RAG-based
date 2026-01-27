import { Request, Response } from 'express';
import { UploadService } from '../services/uploadService';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const upload = multer({ dest: 'uploads/' });
const uploadService = new UploadService();

export const uploadMiddleware = upload.single('file');

export const uploadController = async (req: Request, res: Response) => {
  try {
    // Validation: Check if file exists
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { version = '1.0', type = 'policy' } = req.body;
    const fileExt = path.extname(req.file.originalname).slice(1);

    // Validation: Check file type
    if (!uploadService.validateFileType(fileExt)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Only PDF and DOCX files are supported' });
    }

    // Business logic: Process document
    const documentId = await uploadService.ingestDocument(
      req.file.path,
      req.file.originalname,
      fileExt,
      version,
      type
    );

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    // Standardized response
    return res.json({
      message: 'Document uploaded and ingested successfully',
      documentId,
    });
  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    return res.status(500).json({ error: 'Failed to process document' });
  }
};