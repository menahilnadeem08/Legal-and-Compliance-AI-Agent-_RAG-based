import express from 'express';
import { queryController } from '../controllers/queryController';
import { uploadController, uploadMiddleware } from '../controllers/uploadController';
import { listDocuments, deleteDocument } from '../controllers/documentController';

const router = express.Router();

router.post('/query', queryController);
router.post('/upload', uploadMiddleware, uploadController);
router.get('/documents', listDocuments);
router.delete('/documents/:id', deleteDocument);

export default router;