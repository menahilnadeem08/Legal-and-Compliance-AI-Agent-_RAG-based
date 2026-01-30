import { Request, Response } from 'express';
import { LegalComplianceAgent } from '../services/legalComplianceAgent';

const agent = new LegalComplianceAgent();

/**
 * POST /api/agent/query
 * Body: { query: "string" }
 * 
 * Main entry point - Agent decides which tools to use
 */
export const agentQuery = async (req: Request, res: Response) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Query is required and must be a non-empty string' 
      });
    }

    const result = await agent.processQuery(query);
    
    return res.json(result);
  } catch (error: any) {
    console.error('Agent query error:', error);
    return res.status(500).json({ 
      error: 'Agent failed to process query',
      details: error.message 
    });
  }
};

/**
 * Legacy compatibility - can keep old endpoint too
 */
export const queryController = agentQuery;