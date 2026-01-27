import { embeddings } from '../config/openai';

/**
 * Generate embedding for a given text using the configured embedding model
 * @param text - Text to generate embedding for
 * @returns Embedding vector as number array
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const embedding = await embeddings.embedQuery(text);
    return embedding;
  } catch (error) {
    console.error('Embedding generation error:', error);
    throw new Error('Failed to generate embedding');
  }
}

/**
 * Generate embeddings for multiple texts in batch
 * @param texts - Array of texts to generate embeddings for
 * @returns Array of embedding vectors
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  try {
    const embeddings_array = await Promise.all(
      texts.map(text => generateEmbedding(text))
    );
    return embeddings_array;
  } catch (error) {
    console.error('Batch embedding generation error:', error);
    throw new Error('Failed to generate batch embeddings');
  }
}