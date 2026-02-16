import pool from '../config/database';
import { pipelineLogger as logger } from './logger';

export interface Message {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sequence_number: number;
  metadata?: Record<string, any>;
  created_at: Date;
}

export interface Conversation {
  id: number;
  user_id: number;
  title?: string;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
  message_count?: number;
  messages?: Message[];
}

/**
 * Create a new conversation for a user
 */
export async function createConversation(
  userId: number,
  title?: string,
  metadata?: Record<string, any>
): Promise<Conversation> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO conversations (user_id, title, metadata)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, title, metadata, created_at, updated_at`,
      [userId, title || null, metadata || {}]
    );

    logger.info('CONVERSATION', 'Created new conversation', { userId, conversationId: result.rows[0].id });
    return result.rows[0];
  } catch (error) {
    logger.error('CONVERSATION_CREATE_ERROR', 'Error creating conversation', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Add a message to a conversation
 */
export async function addMessage(
  conversationId: number,
  role: 'user' | 'assistant' | 'system',
  content: string,
  metadata?: Record<string, any>
): Promise<Message> {
  const client = await pool.connect();
  try {
    // Get the next sequence number
    const seqResult = await client.query(
      `SELECT COALESCE(MAX(sequence_number), -1) + 1 as next_seq FROM messages WHERE conversation_id = $1`,
      [conversationId]
    );
    const sequenceNumber = seqResult.rows[0].next_seq;

    // Insert message
    const result = await client.query(
      `INSERT INTO messages (conversation_id, role, content, sequence_number, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, conversation_id, role, content, sequence_number, metadata, created_at`,
      [conversationId, role, content, sequenceNumber, metadata || {}]
    );

    // Update conversation's updated_at timestamp
    await client.query(
      `UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [conversationId]
    );

    logger.info('MESSAGE', 'Added message to conversation', {
      conversationId,
      messageId: result.rows[0].id,
      role
    });

    return result.rows[0];
  } catch (error) {
    logger.error('MESSAGE_ADD_ERROR', 'Error adding message', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get a single conversation by ID with all messages
 */
export async function getConversation(conversationId: number, userId: number): Promise<Conversation | null> {
  const client = await pool.connect();
  try {
    // Get conversation metadata
    const convResult = await client.query(
      `SELECT id, user_id, title, metadata, created_at, updated_at
       FROM conversations
       WHERE id = $1 AND user_id = $2`,
      [conversationId, userId]
    );

    if (convResult.rows.length === 0) {
      return null;
    }

    const conversation = convResult.rows[0];

    // Get all messages in order
    const messagesResult = await client.query(
      `SELECT id, conversation_id, role, content, sequence_number, metadata, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY sequence_number ASC`,
      [conversationId]
    );

    return {
      ...conversation,
      messages: messagesResult.rows,
      message_count: messagesResult.rows.length
    };
  } catch (error) {
    logger.error('CONVERSATION_GET_ERROR', 'Error getting conversation', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * List all conversations for a user with pagination
 */
export async function listConversations(
  userId: number,
  limit: number = 20,
  offset: number = 0
): Promise<{ conversations: Conversation[]; total: number }> {
  const client = await pool.connect();
  try {
    // Get total count
    const countResult = await client.query(
      `SELECT COUNT(*) as total FROM conversations WHERE user_id = $1`,
      [userId]
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Get conversations with message count
    const result = await client.query(
      `SELECT 
        c.id, c.user_id, c.title, c.metadata, c.created_at, c.updated_at,
        COUNT(m.id) as message_count
       FROM conversations c
       LEFT JOIN messages m ON c.id = m.conversation_id
       WHERE c.user_id = $1
       GROUP BY c.id
       ORDER BY c.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    logger.info('CONVERSATIONS_LIST', 'Listed conversations', { userId, count: result.rows.length });

    return {
      conversations: result.rows,
      total
    };
  } catch (error) {
    logger.error('CONVERSATIONS_LIST_ERROR', 'Error listing conversations', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update conversation title and metadata
 */
export async function updateConversation(
  conversationId: number,
  userId: number,
  title?: string,
  metadata?: Record<string, any>
): Promise<Conversation | null> {
  const client = await pool.connect();
  try {
    let query = `UPDATE conversations SET updated_at = CURRENT_TIMESTAMP`;
    const params: any[] = [conversationId, userId];
    let paramIndex = 3;

    if (title !== undefined) {
      query += `, title = $${paramIndex}`;
      params.splice(params.length - 1, 0, title);
      paramIndex++;
    }

    if (metadata !== undefined) {
      query += `, metadata = $${paramIndex}`;
      params.splice(params.length - 1, 0, JSON.stringify(metadata));
      paramIndex++;
    }

    query += ` WHERE id = $1 AND user_id = $2 RETURNING id, user_id, title, metadata, created_at, updated_at`;

    const result = await client.query(query, params);

    if (result.rows.length === 0) {
      return null;
    }

    logger.info('CONVERSATION_UPDATE', 'Updated conversation', { conversationId });
    return result.rows[0];
  } catch (error) {
    logger.error('CONVERSATION_UPDATE_ERROR', 'Error updating conversation', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Delete a conversation and all its messages
 */
export async function deleteConversation(conversationId: number, userId: number): Promise<boolean> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `DELETE FROM conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, userId]
    );

    logger.info('CONVERSATION_DELETE', 'Deleted conversation', { conversationId });
    return result.rowCount! > 0;
  } catch (error) {
    logger.error('CONVERSATION_DELETE_ERROR', 'Error deleting conversation', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get recent messages from a conversation (last N messages)
 */
export async function getRecentMessages(
  conversationId: number,
  userId: number,
  limit: number = 10
): Promise<Message[]> {
  const client = await pool.connect();
  try {
    // Verify user owns this conversation
    const convCheck = await client.query(
      `SELECT id FROM conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, userId]
    );

    if (convCheck.rows.length === 0) {
      return [];
    }

    const result = await client.query(
      `SELECT id, conversation_id, role, content, sequence_number, metadata, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY sequence_number DESC
       LIMIT $2`,
      [conversationId, limit]
    );

    // Return in ascending order (oldest first)
    return result.rows.reverse();
  } catch (error) {
    logger.error('MESSAGES_GET_ERROR', 'Error getting recent messages', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Clear all messages from a conversation (keep metadata)
 */
export async function clearConversationMessages(
  conversationId: number,
  userId: number
): Promise<boolean> {
  const client = await pool.connect();
  try {
    // Verify user owns this conversation
    const convCheck = await client.query(
      `SELECT id FROM conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, userId]
    );

    if (convCheck.rows.length === 0) {
      return false;
    }

    await client.query(
      `DELETE FROM messages WHERE conversation_id = $1`,
      [conversationId]
    );

    await client.query(
      `UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [conversationId]
    );

    logger.info('CONVERSATION_CLEARED', 'Cleared all messages', { conversationId });
    return true;
  } catch (error) {
    logger.error('CONVERSATION_CLEAR_ERROR', 'Error clearing conversation', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get message count for a conversation
 */
export async function getMessageCount(conversationId: number, userId: number): Promise<number> {
  const client = await pool.connect();
  try {
    // Verify user owns this conversation
    const convCheck = await client.query(
      `SELECT id FROM conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, userId]
    );

    if (convCheck.rows.length === 0) {
      return 0;
    }

    const result = await client.query(
      `SELECT COUNT(*) as count FROM messages WHERE conversation_id = $1`,
      [conversationId]
    );

    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    logger.error('MESSAGE_COUNT_ERROR', 'Error getting message count', error);
    throw error;
  } finally {
    client.release();
  }
}
