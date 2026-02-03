import { body, query, param } from 'express-validator';

/**
 * Agent Query Validation
 * POST /api/query
 */
export const validateAgentQuery = [
  body('query')
    .trim()
    .notEmpty().withMessage('Query is required')
    .isString().withMessage('Query must be a string')
    .isLength({ min: 1, max: 2000 }).withMessage('Query must be between 1 and 2000 characters'),
];

/**
 * Document Upload Validation
 * POST /api/upload
 */
export const validateDocumentUpload = [
  body('version')
    .optional()
    .trim()
    .isString().withMessage('Version must be a string')
    .isLength({ min: 1, max: 50 }).withMessage('Version must be between 1 and 50 characters'),
  
  body('type')
    .optional()
    .trim()
    .isIn(['policy', 'regulation', 'guideline', 'other']).withMessage('Type must be one of: policy, regulation, guideline, other'),
];

/**
 * Get Document Version History Validation
 * GET /api/documents/versions/:name
 */
export const validateGetVersionHistory = [
  param('name')
    .trim()
    .notEmpty().withMessage('Document name is required')
    .isString().withMessage('Document name must be a string')
    .isLength({ min: 1, max: 255 }).withMessage('Document name must be between 1 and 255 characters'),
];

/**
 * Check for Newer Version Validation
 * GET /api/documents/:id/newer
 */
export const validateCheckNewerVersion = [
  param('id')
    .trim()
    .notEmpty().withMessage('Document ID is required')
    .isUUID().withMessage('Document ID must be a valid UUID'),
];

/**
 * Compare Versions Validation
 * GET /api/documents/compare
 */
export const validateCompareVersions = [
  query('name')
    .trim()
    .notEmpty().withMessage('Document name is required')
    .isString().withMessage('Document name must be a string'),
  
  query('version1')
    .trim()
    .notEmpty().withMessage('Version 1 is required')
    .isString().withMessage('Version 1 must be a string'),
  
  query('version2')
    .trim()
    .notEmpty().withMessage('Version 2 is required')
    .isString().withMessage('Version 2 must be a string'),
];

/**
 * Compare Versions Detailed Validation
 * GET /api/documents/compare/detailed
 */
export const validateCompareVersionsDetailed = [
  query('name')
    .trim()
    .notEmpty().withMessage('Document name is required')
    .isString().withMessage('Document name must be a string'),
  
  query('version1')
    .trim()
    .notEmpty().withMessage('Version 1 is required')
    .isString().withMessage('Version 1 must be a string'),
  
  query('version2')
    .trim()
    .notEmpty().withMessage('Version 2 is required')
    .isString().withMessage('Version 2 must be a string'),
];

/**
 * Delete Document Validation
 * DELETE /api/documents/:id
 */
export const validateDeleteDocument = [
  param('id')
    .trim()
    .notEmpty().withMessage('Document ID is required')
    .isUUID().withMessage('Document ID must be a valid UUID'),
];
