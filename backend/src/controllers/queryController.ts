import { Request, Response } from 'express';
import { QueryService } from '../services/queryService';

const queryService = new QueryService();

export const queryController = async (req: Request, res: Response) => {
  try {
    const { query } = req.body;

    // Validation
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    if (typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query must be a non-empty string' });
    }

    // Business logic: Process query
    const result = await queryService.processQuery(query);

    // Standardized response
    return res.json(result);
  } catch (error) {
    console.error('Query error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};