import express from 'express';
import { uploadController, uploadMiddleware, uploadErrorCleanup } from '../controllers/uploadController';
import { 
  listDocuments, 
  deleteDocument,
  activateDocument,
  deactivateDocument,
  downloadDocument
} from '../controllers/documentController';
import { agentQuery, agentQueryStream } from '../controllers/agentController';
import { clearSessionController } from '../controllers/sessionController';
import { handleValidationErrors } from '../middleware/validation';
import {
  validateAgentQuery,
  validateDocumentUpload,
  validateDeleteDocument
} from '../middleware/validationSchemas';
import { handleGoogleSignIn, logout, getCurrentUser, login, changePassword, refresh, forgotPassword, verifyResetOtp, resetPassword, resendResetOtp } from '../controllers/authController';
import { adminSignup, adminLogin, verifyOtp, resendOtp } from '../controllers/adminAuthController';
import { createEmployee, getEmployees, deactivateEmployee, activateEmployee, resendCredentials } from '../controllers/adminController';
import { authenticate, requireRole } from '../middleware/rbacMiddleware';
import { enforcePasswordChange } from '../middleware/enforcePasswordChange';
import { asyncHandler } from '../middleware/errorHandler';
import validate from '../middleware/validate';
import {
  loginSchema,
  adminLoginSchema,
  adminSignupSchema,
  changePasswordSchema,
  verifyOtpSchema,
  resendOtpSchema,
  refreshSchema,
  googleSignInSchema,
  forgotPasswordSchema,
  verifyResetOtpSchema,
  resetPasswordSchema,
  resendResetOtpSchema,
} from '../validators/authValidators';
import { addEmployeeSchema, employeeIdSchema } from '../validators/employeeValidators';
import { documentIdParamSchema } from '../validators/documentValidators';
import { authLimiter, resendLimiter, adminLimiter } from '../middleware/rateLimiter';

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
import {
  getCategories,
  getHiddenDefaultCategories,
  createCustomCategory,
  updateCustomCategory,
  deleteCustomCategory,
  hideDefaultCategory,
  unhideDefaultCategory
} from '../controllers/categoriesController';

const router = express.Router();

// ===== Public Routes (no authentication required) =====
router.post('/auth/signin', validate(googleSignInSchema), asyncHandler(handleGoogleSignIn as any));
router.post('/auth/login', authLimiter, validate(loginSchema), asyncHandler(login as any));
router.post('/auth/admin/signup', adminLimiter, validate(adminSignupSchema), asyncHandler(adminSignup as any));
router.post('/auth/admin/verify-otp', authLimiter, validate(verifyOtpSchema), asyncHandler(verifyOtp as any));
router.post('/auth/admin/resend-otp', resendLimiter, validate(resendOtpSchema), asyncHandler(resendOtp as any));
router.post('/auth/admin/login', authLimiter, validate(adminLoginSchema), asyncHandler(adminLogin as any));
router.post('/auth/refresh', authLimiter, validate(refreshSchema), asyncHandler(refresh as any));

// Forgot password (admin + employee, OTP via email)
router.post('/auth/forgot-password', authLimiter, validate(forgotPasswordSchema), asyncHandler(forgotPassword as any));
router.post('/auth/verify-reset-otp', authLimiter, validate(verifyResetOtpSchema), asyncHandler(verifyResetOtp as any));
router.post('/auth/reset-password', authLimiter, validate(resetPasswordSchema), asyncHandler(resetPassword as any));
router.post('/auth/resend-reset-otp', resendLimiter, validate(resendResetOtpSchema), asyncHandler(resendResetOtp as any));

router.get('/health', (req: any, res: any) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      message: 'Backend is running and connected',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
  });
});

// ===== Global middleware — everything below requires authentication =====
router.use(authenticate as any);
router.use(enforcePasswordChange as any);

// ===== Auth Routes (allowed through enforcePasswordChange via ALLOWED_PATHS) =====
router.post('/auth/logout', asyncHandler(logout as any));
router.get('/auth/me', asyncHandler(getCurrentUser as any));
router.post('/auth/change-password', validate(changePasswordSchema), asyncHandler(changePassword as any));

// ===== Admin Routes =====
router.post('/admin/create-user', adminLimiter, requireRole('admin') as any, validate(addEmployeeSchema), asyncHandler(createEmployee as any));
router.get('/admin/employees', requireRole('admin') as any, asyncHandler(getEmployees as any));
router.put('/admin/employees/:id/deactivate', requireRole('admin') as any, validate(employeeIdSchema), asyncHandler(deactivateEmployee as any));
router.put('/admin/employees/:id/activate', requireRole('admin') as any, validate(employeeIdSchema), asyncHandler(activateEmployee as any));
router.post('/admin/employees/:id/resend-credentials', resendLimiter, requireRole('admin') as any, validate(employeeIdSchema), asyncHandler(resendCredentials as any));

// ===== Agent/Query Endpoints =====
router.post('/query', 
  validateAgentQuery,
  handleValidationErrors,
  agentQuery as any
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

// ===== Categories (visible list + custom/hide management) =====
router.get('/categories', getCategories as any);
router.get('/categories/hidden-defaults', requireRole('admin') as any, getHiddenDefaultCategories as any);
router.post('/custom-categories', requireRole('admin') as any, createCustomCategory as any);
router.patch('/custom-categories/:id', requireRole('admin') as any, updateCustomCategory as any);
router.delete('/custom-categories/:id', requireRole('admin') as any, deleteCustomCategory as any);
router.post('/categories/hide-default/:defaultCategoryId', requireRole('admin') as any, hideDefaultCategory as any);
router.delete('/categories/hide-default/:defaultCategoryId', requireRole('admin') as any, unhideDefaultCategory as any);

// ===== Document Management =====
router.get('/documents', listDocuments as any);

router.put('/documents/:id/activate', validate(documentIdParamSchema), asyncHandler(activateDocument as any));
router.put('/documents/:id/deactivate', validate(documentIdParamSchema), asyncHandler(deactivateDocument as any));

router.delete('/documents/:id',
  validateDeleteDocument,
  handleValidationErrors,
  asyncHandler(deleteDocument as any)
);

router.get('/documents/:id/download', validate(documentIdParamSchema), asyncHandler(downloadDocument as any));

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
