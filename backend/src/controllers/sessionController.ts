import { Request, Response } from 'express';
import { sessionMemory } from '../utils/sessionMemory';
import { pipelineLogger } from '../services/logger';

export const clearSessionController = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    sessionMemory.clearSession(sessionId);
    pipelineLogger.info('SESSION_CLEARED', 'Cleared session memory', { sessionId });
    return res.json({ ok: true });
  } catch (err) {
    pipelineLogger.error('SESSION_CLEAR_ERROR', 'Error clearing session', err);
    return res.status(500).json({ error: 'Failed to clear session' });
  }
};
