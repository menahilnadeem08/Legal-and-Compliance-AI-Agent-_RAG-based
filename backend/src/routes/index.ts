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
import { queryStreamController } from '../controllers/queryStreamController';
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
import { handleGoogleSignIn, logout, getCurrentUser, login, changePassword } from '../controllers/authController';
import { createEmployee, getEmployees, deactivateEmployee, activateEmployee } from '../controllers/adminController';
import { authenticate, requireRole } from '../middleware/rbacMiddleware';

const router = express.Router();

// ===== Authentication Routes =====
router.post('/auth/signin', handleGoogleSignIn as any);
router.post('/auth/login', login as any); // Employee local login
router.post('/auth/logout', authenticate as any, logout as any);
router.get('/auth/me', authenticate as any, getCurrentUser as any);
router.post('/auth/change-password', authenticate as any, changePassword as any);

// ===== Admin Routes (protected with admin role) =====
router.post('/admin/create-user', authenticate as any, requireRole('admin') as any, createEmployee as any);
router.get('/admin/employees', authenticate as any, requireRole('admin') as any, getEmployees as any);
router.put('/admin/employees/:id/deactivate', authenticate as any, requireRole('admin') as any, deactivateEmployee as any);
router.put('/admin/employees/:id/activate', authenticate as any, requireRole('admin') as any, activateEmployee as any);

// ===== Health Check / Connection Test =====
router.get('/health', (req: any, res: any) => {
  res.json({
    status: 'ok',
    message: 'Backend is running and connected',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ===== Agent/Query Endpoint (requires authentication) =====
router.post('/query', 
  authenticate as any,
  validateAgentQuery,
  handleValidationErrors,
  agentQuery as any
);

// ===== Streaming Query Endpoint (with real-time logs) =====
router.post('/query/stream', 
  authenticate as any,
  validateAgentQuery,
  handleValidationErrors,
  queryStreamController as any
);

// ===== Document Upload (only admins) =====
router.post('/upload', 
  authenticate as any,
  requireRole('admin') as any,
  uploadMiddleware,
  validateDocumentUpload,
  handleValidationErrors,
  uploadController as any,
  uploadErrorCleanup  // Error cleanup middleware
);

// ===== Document Management (requires authentication) =====
router.get('/documents', authenticate as any, listDocuments as any);
router.get('/documents/outdated', authenticate as any, getOutdatedDocuments as any);
router.get('/documents/suggestions', authenticate as any, getSuggestions as any);

// Version history endpoint (must come before other :name routes)
router.get('/documents/versions/:name',
  authenticate as any,
  validateGetVersionHistory,
  handleValidationErrors,
  getDocumentVersionHistory as any
);

// Version comparison endpoints
router.get('/documents/compare/detailed',
  authenticate as any,
  validateCompareVersionsDetailed,
  handleValidationErrors,
  compareVersionsDetailed as any
);

router.get('/documents/compare',
  authenticate as any,
  validateCompareVersions,
  handleValidationErrors,
  compareVersions as any
);

// Check for newer version
router.get('/documents/:id/newer',
  authenticate as any,
  validateCheckNewerVersion,
  handleValidationErrors,
  checkForNewerVersion as any
);

// Activate document
router.put('/documents/:id/activate', 
  authenticate as any,
  activateDocument as any
);

// Deactivate document
router.put('/documents/:id/deactivate', 
  authenticate as any,
  deactivateDocument as any
);

// Delete document
router.delete('/documents/:id',
  authenticate as any,
  validateDeleteDocument,
  handleValidationErrors,
  deleteDocument as any
);

export default router;