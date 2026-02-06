import { Response } from 'express';
import { LegalComplianceAgent } from '../services/legalComplianceAgent';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { getAdminIdForUser } from '../utils/adminIdUtils';
import { AuthenticatedRequest } from '../types';

const agent = new LegalComplianceAgent();

/**
 * POST /api/query
 * Body: { query: "string" }
 * 
 * Main entry point - Agent decides which tools to use
 * Validation handled by middleware, errors caught by asyncHandler
 * Filters documents by admin_id based on user role
 */
export const agentQuery = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { query } = req.body;
  
  const adminId = getAdminIdForUser(req.user);
  if (!adminId) {
    throw new AppError('User role not properly configured', 500);
  }

  const result = await agent.processQuery(query, adminId);
  
  return res.json(result);
});