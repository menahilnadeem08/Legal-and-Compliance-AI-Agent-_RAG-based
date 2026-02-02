import { Request, Response } from 'express';
import { LegalComplianceAgent } from '../services/legalComplianceAgent';
import { asyncHandler, AppError } from '../middleware/errorHandler';

const agent = new LegalComplianceAgent();

/**
 * POST /api/agent/query
 * Body: { query: "string" }
 * 
 * Main entry point - Agent decides which tools to use
 * Validation handled by middleware, errors caught by asyncHandler
 */
export const agentQuery = asyncHandler(async (req: Request, res: Response) => {
  const { query } = req.body;

  const result = await agent.processQuery(query);
  
  return res.json(result);
});

/**
 * Legacy compatibility
 */
export const queryController = agentQuery;