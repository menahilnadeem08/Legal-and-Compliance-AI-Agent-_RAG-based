import { Response } from 'express';
import { LegalComplianceAgent } from '../services/legalComplianceAgent';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { getAdminIdForUser } from '../utils/adminIdUtils';
import { AuthenticatedRequest } from '../types';
import logger from '../utils/logger';

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

/**
 * POST /api/query/agent-stream
 * Body: { query: "string" }
 * 
 * SSE streaming version of the agent pipeline.
 * Streams log events during tool execution and the final answer.
 */
export const agentQueryStream = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const adminId = getAdminIdForUser(req.user);
    if (!adminId) {
      return res.status(500).json({ error: 'User role not properly configured' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const sendLog = (stage: string, message: string) => {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: 'info' as const,
        stage,
        message,
      };
      res.write(`data: ${JSON.stringify({ type: 'log', log: logEntry })}\n\n`);
    };

    try {
      const result = await agent.processQuery(query, adminId, 5, sendLog);

      res.write(`data: ${JSON.stringify({ type: 'answer', answer: result })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
      res.end();
    } catch (error) {
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        })}\n\n`
      );
      res.end();
    }
  } catch (error) {
    logger.error('Agent stream setup error', { message: (error as Error)?.message, stack: (error as Error)?.stack });
    res.status(500).json({ error: 'Failed to set up stream' });
  }
};