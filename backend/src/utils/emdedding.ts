import { embeddings } from '../config/openai';
import logger from './logger';

/** Max texts per OpenAI embed request (stay under token/input limits) */
const BATCH_SIZE = 100;

/**
 * Generate embedding for a single text (e.g. query at runtime).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const embedding = await embeddings.embedQuery(text);
    return embedding;
  } catch (error) {
    logger.error('Embedding generation error', { error });
    throw new Error('Failed to generate embedding');
  }
}

/**
 * Generate embeddings for multiple texts via batched API calls.
 * Uses embedDocuments() so each request sends up to BATCH_SIZE texts (fewer round-trips than one-by-one).
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  try {
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const batchEmbeddings = await embeddings.embedDocuments(batch);
      results.push(...batchEmbeddings);
    }
    logger.debug('Batch embeddings complete', { total: texts.length, batches: Math.ceil(texts.length / BATCH_SIZE) });
    return results;
  } catch (error) {
    logger.error('Batch embedding generation error', { error });
    throw new Error('Failed to generate batch embeddings');
  }
}