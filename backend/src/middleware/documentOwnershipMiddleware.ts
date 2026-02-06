import { Response, NextFunction } from 'express';
import pool from '../config/database';
import { AuthenticatedRequest } from '../types';

/**
 * Middleware to verify document ownership
 * - Admins can only access their own documents
 * - Employees can only access documents from their admin
 */
export async function verifyDocumentOwnership(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const documentId = req.params.id || req.params.documentId;
    if (!documentId) {
      return res.status(400).json({ error: 'Document ID is required' });
    }

    // Get document with admin_id
    const documentResult = await pool.query(
      'SELECT id, admin_id FROM documents WHERE id = $1',
      [documentId]
    );

    if (documentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = documentResult.rows[0];
    req.document = document;

    if (req.user.role === 'admin') {
      // Admin can only access their own documents
      if (document.admin_id !== req.user.id) {
        return res.status(403).json({ error: 'You can only access your own documents' });
      }
    } else if (req.user.role === 'employee') {
      // Employee can only access documents from their admin
      if (document.admin_id !== req.user.admin_id) {
        return res.status(403).json({ error: 'You do not have access to this document' });
      }
    } else {
      return res.status(403).json({ error: 'Invalid user role' });
    }

    next();
  } catch (error) {
    console.error('Error verifying document ownership:', error);
    res.status(500).json({ error: 'Failed to verify document ownership' });
  }
}
