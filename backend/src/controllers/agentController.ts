import { Request, Response } from 'express';
import { LegalComplianceAgent } from '../services/legalComplianceAgent';
import { asyncHandler, AppError } from '../middleware/errorHandler';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email?: string;
    username?: string;
    role?: string;
    admin_id?: number;
  };
}

const agent = new LegalComplianceAgent();

/**
 * GET admin_id for query filtering based on user role
 */
function getAdminIdForUser(user: AuthenticatedRequest['user']): number | null {
  if (!user) return null;
  
  if (user.role === 'admin') {
    return user.id;
  } else if (user.role === 'employee') {
    return user.admin_id || null;
  }
  return null;
}

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