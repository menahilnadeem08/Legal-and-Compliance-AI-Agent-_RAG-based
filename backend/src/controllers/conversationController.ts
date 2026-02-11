import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { pipelineLogger as logger } from '../services/logger';
import * as conversationService from '../services/conversationService';

/**
 * Create a new conversation
 * POST /conversations
 */
export async function createConversation(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { title, metadata } = req.body;

    const conversation = await conversationService.createConversation(req.user.id, title, metadata);

    logger.info('CONTROLLER', 'Conversation created', { conversationId: conversation.id });
    return res.status(201).json(conversation);
  } catch (error) {
    logger.error('CONVERSATION_CREATE_CONTROLLER_ERROR', 'Error creating conversation', error);
    return res.status(500).json({ error: 'Failed to create conversation' });
  }
}

/**
 * Get all conversations for current user
 * GET /conversations?limit=20&offset=0
 */
export async function listConversations(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await conversationService.listConversations(req.user.id, limit, offset);

    logger.info('CONTROLLER', 'Listed conversations', { userId: req.user.id, count: result.conversations.length });
    return res.json(result);
  } catch (error) {
    logger.error('CONVERSATIONS_LIST_CONTROLLER_ERROR', 'Error listing conversations', error);
    return res.status(500).json({ error: 'Failed to list conversations' });
  }
}

/**
 * Get a specific conversation with all messages
 * GET /conversations/:conversationId
 */
export async function getConversation(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const conversationId = parseInt(req.params.conversationId as string);

    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }

    const conversation = await conversationService.getConversation(conversationId, req.user.id);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    logger.info('CONTROLLER', 'Retrieved conversation', { conversationId });
    return res.json(conversation);
  } catch (error) {
    logger.error('CONVERSATION_GET_CONTROLLER_ERROR', 'Error getting conversation', error);
    return res.status(500).json({ error: 'Failed to get conversation' });
  }
}

/**
 * Update conversation title and metadata
 * PUT /conversations/:conversationId
 */
export async function updateConversation(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const conversationId = parseInt(req.params.conversationId as string);

    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }

    const { title, metadata } = req.body;

    const conversation = await conversationService.updateConversation(
      conversationId,
      req.user.id,
      title,
      metadata
    );

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    logger.info('CONTROLLER', 'Updated conversation', { conversationId });
    return res.json(conversation);
  } catch (error) {
    logger.error('CONVERSATION_UPDATE_CONTROLLER_ERROR', 'Error updating conversation', error);
    return res.status(500).json({ error: 'Failed to update conversation' });
  }
}

/**
 * Delete a conversation
 * DELETE /conversations/:conversationId
 */
export async function deleteConversation(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const conversationId = parseInt(req.params.conversationId as string);

    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }

    const deleted = await conversationService.deleteConversation(conversationId, req.user.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    logger.info('CONTROLLER', 'Deleted conversation', { conversationId });
    return res.json({ ok: true });
  } catch (error) {
    logger.error('CONVERSATION_DELETE_CONTROLLER_ERROR', 'Error deleting conversation', error);
    return res.status(500).json({ error: 'Failed to delete conversation' });
  }
}

/**
 * Add a message to a conversation
 * POST /conversations/:conversationId/messages
 */
export async function addMessage(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const conversationId = parseInt(req.params.conversationId as string);

    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }

    const { role, content, metadata } = req.body;

    if (!role || !content) {
      return res.status(400).json({ error: 'Role and content are required' });
    }

    if (!['user', 'assistant', 'system'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Verify conversation exists and belongs to user
    const conversation = await conversationService.getConversation(conversationId, req.user.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const message = await conversationService.addMessage(conversationId, role, content, metadata);

    logger.info('CONTROLLER', 'Added message', { conversationId, messageId: message.id });
    return res.status(201).json(message);
  } catch (error) {
    logger.error('MESSAGE_ADD_CONTROLLER_ERROR', 'Error adding message', error);
    return res.status(500).json({ error: 'Failed to add message' });
  }
}

/**
 * Get recent messages from a conversation
 * GET /conversations/:conversationId/messages/recent?limit=10
 */
export async function getRecentMessages(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const conversationId = parseInt(req.params.conversationId as string);

    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);

    // Verify conversation exists and belongs to user
    const conversation = await conversationService.getConversation(conversationId, req.user.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const messages = await conversationService.getRecentMessages(conversationId, req.user.id, limit);

    logger.info('CONTROLLER', 'Retrieved recent messages', { conversationId, count: messages.length });
    return res.json(messages);
  } catch (error) {
    logger.error('MESSAGES_GET_CONTROLLER_ERROR', 'Error getting messages', error);
    return res.status(500).json({ error: 'Failed to get messages' });
  }
}

/**
 * Clear all messages from a conversation
 * POST /conversations/:conversationId/clear
 */
export async function clearConversationMessages(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const conversationId = parseInt(req.params.conversationId as string);

    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }

    const cleared = await conversationService.clearConversationMessages(conversationId, req.user.id);

    if (!cleared) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    logger.info('CONTROLLER', 'Cleared conversation messages', { conversationId });
    return res.json({ ok: true });
  } catch (error) {
    logger.error('CONVERSATION_CLEAR_CONTROLLER_ERROR', 'Error clearing conversation', error);
    return res.status(500).json({ error: 'Failed to clear conversation' });
  }
}

/**
 * Get message count for a conversation
 * GET /conversations/:conversationId/message-count
 */
export async function getMessageCount(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const conversationId = parseInt(req.params.conversationId as string);

    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }

    const count = await conversationService.getMessageCount(conversationId, req.user.id);

    if (count === 0) {
      // Check if conversation exists
      const conversation = await conversationService.getConversation(conversationId, req.user.id);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    }

    logger.info('CONTROLLER', 'Retrieved message count', { conversationId, count });
    return res.json({ conversationId, count });
  } catch (error) {
    logger.error('MESSAGE_COUNT_CONTROLLER_ERROR', 'Error getting message count', error);
    return res.status(500).json({ error: 'Failed to get message count' });
  }
}
