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
import { agentQuery, agentQueryStream } from '../controllers/agentController';
import { queryStreamController } from '../controllers/queryStreamController';
import { clearSessionController } from '../controllers/sessionController';
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
import { handleGoogleSignIn, logout, getCurrentUser, login, changePassword, refresh } from '../controllers/authController';
import { adminSignup, adminLogin, verifyOtp, resendOtp } from '../controllers/adminAuthController';
import { createEmployee, getEmployees, deactivateEmployee, activateEmployee, resendCredentials } from '../controllers/adminController';
import { authenticate, requireRole } from '../middleware/rbacMiddleware';
import { enforcePasswordChange } from '../middleware/enforcePasswordChange';

import {
  createConversation,
  listConversations,
  getConversation,
  updateConversation,
  deleteConversation,
  addMessage,
  getRecentMessages,
  clearConversationMessages,
  getMessageCount
} from '../controllers/conversationController';

const router = express.Router();

// ===== Public Routes (no authentication required) =====
router.post('/auth/signin', handleGoogleSignIn as any);
router.post('/auth/login', login as any);
router.post('/auth/admin/signup', adminSignup as any);
router.post('/auth/admin/verify-otp', verifyOtp as any);
router.post('/auth/admin/resend-otp', resendOtp as any);
router.post('/auth/admin/login', adminLogin as any);
router.post('/auth/refresh', refresh as any);

router.get('/health', (req: any, res: any) => {
  res.json({
    status: 'ok',
    message: 'Backend is running and connected',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ===== Global middleware — everything below requires authentication =====
router.use(authenticate as any);
router.use(enforcePasswordChange as any);

// ===== Auth Routes (allowed through enforcePasswordChange via ALLOWED_PATHS) =====
router.post('/auth/logout', logout as any);
router.get('/auth/me', getCurrentUser as any);
router.post('/auth/change-password', changePassword as any);

// ===== Admin Routes =====
router.post('/admin/create-user', requireRole('admin') as any, createEmployee as any);
router.get('/admin/employees', requireRole('admin') as any, getEmployees as any);
router.put('/admin/employees/:id/deactivate', requireRole('admin') as any, deactivateEmployee as any);
router.put('/admin/employees/:id/activate', requireRole('admin') as any, activateEmployee as any);
router.post('/admin/employees/:id/resend-credentials', requireRole('admin') as any, resendCredentials as any);

// ===== Agent/Query Endpoints =====
router.post('/query', 
  validateAgentQuery,
  handleValidationErrors,
  agentQuery as any
);

router.post('/query/stream', 
  validateAgentQuery,
  handleValidationErrors,
  queryStreamController as any
);

router.post('/query/agent-stream',
  validateAgentQuery,
  handleValidationErrors,
  agentQueryStream as any
);

router.post('/session/clear', clearSessionController as any);

// ===== Document Upload (admin only) =====
router.post('/upload', 
  requireRole('admin') as any,
  uploadMiddleware,
  validateDocumentUpload,
  handleValidationErrors,
  uploadController as any,
  uploadErrorCleanup
);

// ===== Document Management =====
router.get('/documents', listDocuments as any);
router.get('/documents/outdated', getOutdatedDocuments as any);
router.get('/documents/suggestions', getSuggestions as any);

router.get('/documents/versions/:name',
  validateGetVersionHistory,
  handleValidationErrors,
  getDocumentVersionHistory as any
);

router.get('/documents/compare/detailed',
  validateCompareVersionsDetailed,
  handleValidationErrors,
  compareVersionsDetailed as any
);

router.get('/documents/compare',
  validateCompareVersions,
  handleValidationErrors,
  compareVersions as any
);

router.get('/documents/:id/newer',
  validateCheckNewerVersion,
  handleValidationErrors,
  checkForNewerVersion as any
);

router.put('/documents/:id/activate', activateDocument as any);
router.put('/documents/:id/deactivate', deactivateDocument as any);

router.delete('/documents/:id',
  validateDeleteDocument,
  handleValidationErrors,
  deleteDocument as any
);

// ===== Conversation Routes =====
router.post('/conversations', createConversation as any);
router.get('/conversations', listConversations as any);
router.get('/conversations/:conversationId', getConversation as any);
router.put('/conversations/:conversationId', updateConversation as any);
router.delete('/conversations/:conversationId', deleteConversation as any);
router.post('/conversations/:conversationId/messages', addMessage as any);
router.get('/conversations/:conversationId/messages/recent', getRecentMessages as any);
router.get('/conversations/:conversationId/message-count', getMessageCount as any);
router.post('/conversations/:conversationId/clear', clearConversationMessages as any);

export default router;
