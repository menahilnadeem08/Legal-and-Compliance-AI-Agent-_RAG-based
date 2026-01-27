import { CohereClient } from 'cohere-ai';

export interface RerankResult {
  content: string;
  document_name: string;
  section_name?: string;
  page_number?: number;
  similarity: number;
  vector_score?: number;
  keyword_score?: number;
  rerank_score?: number;
}

export class Reranker {
  private cohere: CohereClient | null = null;
  private model: string = 'rerank-english-v3.0';
  private enabled: boolean = false;

  constructor(apiKey?: string) {
    // Use environment variable if no key provided
    const key = apiKey || process.env.COHERE_API_KEY;
    
    if (!key) {
      console.warn('COHERE_API_KEY not set — Cohere reranker will be disabled.');
      this.enabled = false;
      return;
    }

    try {
      this.cohere = new CohereClient({
        token: key,
      });
      this.enabled = true;
    } catch (error) {
      console.error('Failed to initialize Cohere client:', error);
      this.enabled = false;
    }
  }

  /**
   * Rerank chunks using Cohere's cross-encoder model
   * @param query - User query
   * @param chunks - Chunks to rerank
   * @param topK - Number of top results to return after reranking
   * @returns Reranked chunks with rerank scores
   */
  async rerank<T extends { content: string }>(
    query: string,
    chunks: T[],
    topK: number = 10
  ): Promise<(T & { rerank_score: number })[]> {
    if (chunks.length === 0) {
      return [];
    }

    // If reranker is disabled, return original chunks without reranking
    if (!this.enabled || !this.cohere) {
      return chunks.slice(0, topK).map(chunk => ({
        ...chunk,
        rerank_score: 0,
      }));
    }

    try {
      // Prepare documents for reranking
      const documents = chunks.map(chunk => chunk.content);

      // Call Cohere rerank API
      const response = await this.cohere.rerank({
        model: this.model,
        query: query,
        documents: documents,
        topN: topK,
        returnDocuments: false, // We already have the documents
      });

      // Map results back to original chunks with rerank scores
      const rerankedChunks = response.results.map(result => ({
        ...chunks[result.index],
        rerank_score: result.relevanceScore,
      }));

      return rerankedChunks;
    } catch (error) {
      console.error('Reranking error:', error);
      // Fallback: return original chunks without reranking
      return chunks.slice(0, topK).map(chunk => ({
        ...chunk,
        rerank_score: 0,
      }));
    }
  }

  /**
   * Rerank and filter chunks by minimum rerank score threshold
   * @param query - User query
   * @param chunks - Chunks to rerank
   * @param topK - Number of top results to return
   * @param minScore - Minimum rerank score threshold (0-1)
   * @returns Filtered and reranked chunks
   */
  async rerankWithThreshold<T extends { content: string }>(
    query: string,
    chunks: T[],
    topK: number = 10,
    minScore: number = 0.3
  ): Promise<(T & { rerank_score: number })[]> {
    // If reranker is disabled, just return top chunks without filtering
    if (!this.enabled || !this.cohere) {
      return chunks.slice(0, topK).map(chunk => ({
        ...chunk,
        rerank_score: 0,
      }));
    }

    const reranked = await this.rerank(query, chunks, topK * 2); // Get more initially
    
    // Filter by minimum score and take topK
    return reranked
      .filter(chunk => chunk.rerank_score >= minScore)
      .slice(0, topK);
  }
}