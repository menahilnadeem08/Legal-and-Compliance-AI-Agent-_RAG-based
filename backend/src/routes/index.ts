import express from 'express';
import { queryController } from '../controllers/queryController';
import { uploadController, uploadMiddleware } from '../controllers/uploadController';
import { 
  listDocuments, 
  deleteDocument,
  getDocumentVersionHistory,
  getOutdatedDocuments,
  checkForNewerVersion,
  compareVersions
} from '../controllers/documentController';

const router = express.Router();

router.post('/query', queryController);
router.post('/upload', uploadMiddleware, uploadController);

// Document management
router.get('/documents', listDocuments);
router.get('/documents/outdated', getOutdatedDocuments);
router.get('/documents/versions/:name', getDocumentVersionHistory);
router.get('/documents/:id/newer', checkForNewerVersion);
router.get('/documents/compare', compareVersions);
router.delete('/documents/:id', deleteDocument);


export default router;