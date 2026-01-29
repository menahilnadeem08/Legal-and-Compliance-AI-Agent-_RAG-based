import express from 'express';
import { queryController } from '../controllers/queryController';
import { uploadController, uploadMiddleware } from '../controllers/uploadController';
import { 
  listDocuments, 
  deleteDocument,
  getDocumentVersionHistory,
  getOutdatedDocuments,
  checkForNewerVersion,
  compareVersions,
  compareVersionsDetailed 
} from '../controllers/documentController';

const router = express.Router();

// Query endpoint
router.post('/query', queryController);

// Upload endpoint
router.post('/upload', uploadMiddleware, uploadController);

// Document management
router.get('/documents', listDocuments);
router.get('/documents/outdated', getOutdatedDocuments);
router.get('/documents/versions/:name', getDocumentVersionHistory);
router.get('/documents/:id/newer', checkForNewerVersion);

// Version comparison
router.get('/documents/compare', compareVersions);  
router.get('/documents/compare/detailed', compareVersionsDetailed);  

// Delete document
router.delete('/documents/:id', deleteDocument);

export default router;