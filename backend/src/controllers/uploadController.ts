import { Request, Response } from 'express';
import { IngestionService } from '../services/ingestion';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const upload = multer({ dest: 'uploads/' });

const ingestionService = new IngestionService();

export const uploadMiddleware = upload.single('file');

export const uploadController = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { version = '1.0', type = 'policy' } = req.body;
    const fileExt = path.extname(req.file.originalname).slice(1);

    if (!['pdf', 'docx'].includes(fileExt)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Only PDF and DOCX files are supported' });
    }

    const documentId = await ingestionService.ingestDocument(
      req.file.path,
      req.file.originalname,
      fileExt,
      version,
      type
    );

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    return res.json({
      message: 'Document uploaded and ingested successfully',
      documentId,
    });
  } catch (error) {
    console.error('Upload error:', error);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(500).json({ error: 'Failed to process document' });
  }
};