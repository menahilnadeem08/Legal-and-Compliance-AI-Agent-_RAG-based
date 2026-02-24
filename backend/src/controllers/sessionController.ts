import { Request, Response } from 'express';
import { sessionMemory } from '../utils/sessionMemory';
import { pipelineLogger } from '../services/logger';

export const clearSessionController = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required' });
    }

    sessionMemory.clearSession(sessionId);
    pipelineLogger.info('SESSION_CLEARED', 'Cleared session memory', { sessionId });
    return res.status(200).json({ success: true, message: 'Session cleared' });
  } catch (err) {
    pipelineLogger.error('SESSION_CLEAR_ERROR', 'Error clearing session', err);
    return res.status(500).json({ success: false, message: 'Failed to clear session' });
  }
};
