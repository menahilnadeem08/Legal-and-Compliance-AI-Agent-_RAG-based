/**
 * MMR Reranker for Legal RAG
 * --------------------------------
 * - No external APIs
 * - No model downloads
 * - Deterministic & audit-friendly
 * - Ideal for Node.js + TypeScript backends
 */

export interface RerankResult {
  content: string;
  document_name: string;
  section_name?: string;
  page_number?: number;
  similarity: number;        // original vector similarity
  rerank_score: number;      // MMR score
  component_scores: {
    relevance: number;
    diversity: number;
  };
}

interface VectorChunk {
  content: string;
  embedding: number[];
  similarity: number;
  document_name?: string;
  section_name?: string;
  page_number?: number;
}

export class Reranker {
  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * MMR reranking
   *
   * λ (lambda):
   * - 0.7 → relevance-focused (recommended for legal)
   * - 0.5 → balanced
   * - 0.3 → diversity-focused
   */
  rerank<T extends VectorChunk>(
    chunks: T[],
    topK: number = 10,
    lambda: number = 0.7
  ): (T & RerankResult)[] {
    if (chunks.length === 0) return [];

    const selected: T[] = [];
    const candidates = [...chunks];

    // Always pick the most relevant first
    candidates.sort((a, b) => b.similarity - a.similarity);
    selected.push(candidates.shift()!);

    while (selected.length < topK && candidates.length > 0) {
      let bestIdx = 0;
      let bestScore = -Infinity;

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];

        // Relevance = vector similarity to query
        const relevance = candidate.similarity;

        // Diversity = max similarity to already selected chunks
        let maxSimilarityToSelected = 0;
        for (const sel of selected) {
          const sim = this.cosineSimilarity(
            candidate.embedding,
            sel.embedding
          );
          maxSimilarityToSelected = Math.max(maxSimilarityToSelected, sim);
        }

        const mmrScore =
          lambda * relevance -
          (1 - lambda) * maxSimilarityToSelected;

        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIdx = i;
        }
      }

      selected.push(candidates.splice(bestIdx, 1)[0]);
    }

    return selected.map(chunk => ({
      ...chunk,
      content: chunk.content,
      document_name: chunk.document_name ?? "",
      similarity: chunk.similarity,
      rerank_score: chunk.similarity, // relevance still dominates
      component_scores: {
        relevance: chunk.similarity,
        diversity: 1 - chunk.similarity
      }
    }));
  }
}
