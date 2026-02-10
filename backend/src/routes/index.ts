import express from 'express';
import { uploadController, uploadMiddleware, uploadErrorCleanup } from '../controllers/uploadController';
import { 
  listDocuments, 
  deleteDocument,
  getDocumentVersionHistory,
  getOutdatedDocuments,
  checkForNewerVersion,
  compareVersions,
  compareVersionsDetailed,
  getSuggestions,
  activateDocument,
  deactivateDocument
} from '../controllers/documentController';
import { agentQuery } from '../controllers/agentController';
import { handleValidationErrors } from '../middleware/validation';
import {
  validateAgentQuery,
  validateDocumentUpload,
  validateGetVersionHistory,
  validateCheckNewerVersion,
  validateCompareVersions,
  validateCompareVersionsDetailed,
  validateDeleteDocument
} from '../middleware/validationSchemas';

const router = express.Router();

// ===== Health Check / Connection Test =====
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend is running and connected',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ===== Agent/Query Endpoint =====
router.post('/query', 
  validateAgentQuery,
  handleValidationErrors,
  agentQuery
);

// ===== Document Upload =====
router.post('/upload', 
  uploadMiddleware,
  validateDocumentUpload,
  handleValidationErrors,
  uploadController,
  uploadErrorCleanup  // Error cleanup middleware
);

// ===== Document Management =====
router.get('/documents', listDocuments);
router.get('/documents/outdated', getOutdatedDocuments);
router.get('/documents/suggestions', getSuggestions);

// Version history endpoint (must come before other :name routes)
router.get('/documents/versions/:name',
  validateGetVersionHistory,
  handleValidationErrors,
  getDocumentVersionHistory
);

// Version comparison endpoints
router.get('/documents/compare/detailed',
  validateCompareVersionsDetailed,
  handleValidationErrors,
  compareVersionsDetailed
);

router.get('/documents/compare',
  validateCompareVersions,
  handleValidationErrors,
  compareVersions
);

// Check for newer version
router.get('/documents/:id/newer',
  validateCheckNewerVersion,
  handleValidationErrors,
  checkForNewerVersion
);

// Activate document
router.put('/documents/:id/activate', activateDocument);

// Deactivate document
router.put('/documents/:id/deactivate', deactivateDocument);

// Delete document
router.delete('/documents/:id',
  validateDeleteDocument,
  handleValidationErrors,
  deleteDocument
);

export default router;