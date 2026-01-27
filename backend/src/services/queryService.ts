import pool from '../config/database';
import { llm } from '../config/openai';
import { QueryRewriter } from '../utils/queryRewriter';
import { Reranker } from '../utils/reranker';
import { embeddings } from '../config/openai';

// Types
export interface QueryResult {
  answer: string;
  citations: any[];
  confidence: number;
}

export interface RetrievedChunk {
  content: string;
  document_name: string;
  document_id?: string;
  document_version?: string;
  document_type?: string;
  upload_date?: Date;
  section_name?: string;
  page_number?: number;
  chunk_index?: number;
  similarity: number;
  vector_score?: number;
  keyword_score?: number;
  rerank_score?: number;
}

interface HybridSearchOptions {
  topK?: number;
  vectorWeight?: number;
  keywordWeight?: number;
  minVectorSimilarity?: number;
  vectorTopK?: number;
  keywordTopK?: number;
  useBM25?: boolean;
  bm25Params?: BM25Params;
}

interface BM25Params {
  k1: number;
  b: number;
}

class BM25Scorer {
  private k1: number;
  private b: number;

  constructor(params: BM25Params = { k1: 1.5, b: 0.75 }) {
    this.k1 = params.k1;
    this.b = params.b;
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
  }

  private getTermFrequency(term: string, tokens: string[]): number {
    return tokens.filter(t => t === term).length;
  }

  async score(query: string, topK: number = 20): Promise<Array<RetrievedChunk & { id: string }>> {
    const queryTerms = this.tokenize(query);
    if (queryTerms.length === 0) return [];

    const candidates = await pool.query(
      `SELECT c.id, c.content, c.section_name, c.page_number, c.chunk_index,
              d.id as document_id, d.name as document_name, d.version as document_version,
              d.type as document_type, d.upload_date, LENGTH(c.content) as doc_length
       FROM chunks c JOIN documents d ON c.document_id = d.id
       WHERE d.is_latest = true AND to_tsvector('english', c.content) @@ plainto_tsquery('english', $1::text)`,
      [query]
    );

    if (candidates.rows.length === 0) return [];

    const docs = candidates.rows.map(row => ({
      ...row,
      tokens: this.tokenize(row.content),
      doc_length: row.content.length
    }));

    const avgDocLength = docs.reduce((sum, doc) => sum + doc.doc_length, 0) / docs.length;
    const N = docs.length;
    const idfMap = new Map<string, number>();

    for (const term of queryTerms) {
      const docCount = docs.filter(doc => doc.tokens.includes(term)).length;
      if (docCount > 0) {
        idfMap.set(term, Math.log((N - docCount + 0.5) / (docCount + 0.5) + 1));
      }
    }

    const scored = docs.map(doc => {
      let score = 0;
      for (const term of queryTerms) {
        const idf = idfMap.get(term);
        if (!idf) continue;
        const tf = this.getTermFrequency(term, doc.tokens);
        if (tf === 0) continue;
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (doc.doc_length / avgDocLength));
        score += idf * (numerator / denominator);
      }
      return {
        id: doc.id,
        content: doc.content,
        document_name: doc.document_name,
        document_id: doc.document_id,
        document_version: doc.document_version,
        document_type: doc.document_type,
        upload_date: doc.upload_date,
        section_name: doc.section_name,
        page_number: doc.page_number,
        chunk_index: doc.chunk_index,
        similarity: score
      };
    });

    return scored.filter(doc => doc.similarity > 0).sort((a, b) => b.similarity - a.similarity).slice(0, topK);
  }

  normalizeScores(results: Array<{ similarity: number }>): void {
    if (results.length === 0) return;
    const maxScore = Math.max(...results.map(r => r.similarity));
    if (maxScore > 0) results.forEach(r => r.similarity = r.similarity / maxScore);
  }
}

export class QueryService {
  private queryRewriter: QueryRewriter;
  private bm25Scorer: BM25Scorer;
  private reranker: Reranker;

  constructor(bm25Params?: BM25Params, cohereApiKey?: string) {
    this.queryRewriter = new QueryRewriter();
    this.bm25Scorer = new BM25Scorer(bm25Params);
    this.reranker = new Reranker(cohereApiKey);
  }

  // Context compression methods
  private compress(chunks: RetrievedChunk[], maxTokens: number = 3000): RetrievedChunk[] {
    let totalTokens = 0;
    const compressed: RetrievedChunk[] = [];

    for (const chunk of chunks) {
      const estimatedTokens = Math.ceil(chunk.content.length / 4);
      
      if (totalTokens + estimatedTokens > maxTokens) {
        break;
      }

      compressed.push(chunk);
      totalTokens += estimatedTokens;
    }

    return compressed;
  }

  private removeDuplicates(chunks: RetrievedChunk[]): RetrievedChunk[] {
    const seen = new Set<string>();
    return chunks.filter(chunk => {
      const key = chunk.content.substring(0, 100);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Hybrid search implementation
  private async hybridSearch(query: string, options: HybridSearchOptions = {}): Promise<RetrievedChunk[]> {
    const {
      topK = 10,
      vectorWeight = 0.7,
      keywordWeight = 0.3,
      minVectorSimilarity = 0.3,
      vectorTopK = 50,
      keywordTopK = 20,
      useBM25 = true,
      bm25Params
    } = options;

    if (bm25Params) this.bm25Scorer = new BM25Scorer(bm25Params);

    const queries = await this.queryRewriter.rewrite(query);
    const allResults = new Map<string, {
      chunk: Omit<RetrievedChunk, 'similarity'>;
      vectorScore: number;
      keywordScore: number;
      queryCount: number;
    }>();

    for (const q of queries) {
      const queryEmbedding = await embeddings.embedQuery(q);
      
      // Proper vector similarity search using pgvector's <=> operator with audit metadata
      const vectorResults = await pool.query(
        `SELECT c.id, c.content, c.section_name, c.page_number, c.chunk_index,
                d.id as document_id, d.name as document_name, d.version as document_version,
                d.type as document_type, d.upload_date,
                c.embedding <=> $1::vector as distance
         FROM chunks c 
         JOIN documents d ON c.document_id = d.id 
         WHERE d.is_latest = true 
         ORDER BY c.embedding <=> $1::vector 
         LIMIT $2`,
        [JSON.stringify(queryEmbedding), vectorTopK]
      );

      vectorResults.rows.forEach(row => {
        try {
          // Convert distance to similarity (pgvector returns cosine distance)
          // Distance range: 0 (identical) to 2 (opposite) Convert to similarity: 0-1 range
          const sim = 1 - (row.distance / 2);
          
          if (sim < minVectorSimilarity) return;

          const existing = allResults.get(row.id);
          if (existing) {
            existing.vectorScore = Math.max(existing.vectorScore, sim);
            existing.queryCount++;
          } else {
            allResults.set(row.id, {
              chunk: {
                content: row.content,
                document_name: row.document_name,
                document_id: row.document_id,
                document_version: row.document_version,
                document_type: row.document_type,
                upload_date: row.upload_date,
                section_name: row.section_name,
                page_number: row.page_number,
                chunk_index: row.chunk_index,
              },
              vectorScore: sim,
              keywordScore: 0,
              queryCount: 1
            });
          }
        } catch (e) {
          console.warn('Failed to process vector result for chunk', row.id, e);
        }
      });

      let keywordResults: Array<{ id: string; similarity: number; [key: string]: any }> = [];

      if (useBM25) {
        keywordResults = await this.bm25Scorer.score(q, keywordTopK);
        this.bm25Scorer.normalizeScores(keywordResults);
      } else {
        const tsRankResults = await pool.query(
          `SELECT c.id, c.content, c.section_name, c.page_number, c.chunk_index,
           d.id as document_id, d.name as document_name, d.version as document_version,
           d.type as document_type, d.upload_date,
           ts_rank(to_tsvector('english', c.content), plainto_tsquery('english', $1::text)) as rank
           FROM chunks c JOIN documents d ON c.document_id = d.id
           WHERE d.is_latest = true AND to_tsvector('english', c.content) @@ plainto_tsquery('english', $1::text)
           ORDER BY rank DESC LIMIT $2`,
          [q, keywordTopK]
        );
        const ranks = tsRankResults.rows.map(r => parseFloat(r.rank || '0'));
        const maxRank = ranks.length > 0 ? Math.max(...ranks) : 0;
        keywordResults = tsRankResults.rows.map(row => ({
          id: row.id,
          content: row.content,
          document_name: row.document_name,
          document_id: row.document_id,
          document_version: row.document_version,
          document_type: row.document_type,
          upload_date: row.upload_date,
          section_name: row.section_name,
          page_number: row.page_number,
          chunk_index: row.chunk_index,
          similarity: maxRank > 0 ? parseFloat(row.rank || '0') / maxRank : 0
        }));
      }

      keywordResults.forEach(result => {
        const existing = allResults.get(result.id);
        if (existing) {
          existing.keywordScore = Math.max(existing.keywordScore, result.similarity);
          existing.queryCount++;
        } else {
          allResults.set(result.id, {
            chunk: {
              content: result.content,
              document_name: result.document_name,
              document_id: result.document_id,
              document_version: result.document_version,
              document_type: result.document_type,
              upload_date: result.upload_date,
              section_name: result.section_name,
              page_number: result.page_number,
              chunk_index: result.chunk_index,
            },
            vectorScore: 0,
            keywordScore: result.similarity,
            queryCount: 1
          });
        }
      });
    }

    const scoredResults: RetrievedChunk[] = Array.from(allResults.values()).map(result => {
      const combinedScore = result.vectorScore * vectorWeight + result.keywordScore * keywordWeight;
      const queryBoost = Math.min(result.queryCount * 0.05, 0.2);
      return {
        ...result.chunk,
        similarity: Math.min(combinedScore + queryBoost, 1.0),
        vector_score: result.vectorScore,
        keyword_score: result.keywordScore
      };
    });

    return scoredResults.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
  }

  // Adaptive search with query analysis
  async search(query: string, topK: number = 10): Promise<RetrievedChunk[]> {
    const hasQuotes = /["']/.test(query);
    const hasSpecificTerms = /\b(section|page|chapter|clause|article)\s+\d+/i.test(query);
    const isShort = query.split(/\s+/).length <= 3;
    const hasNumbers = /\d+/.test(query);
    
    let vectorWeight = 0.7;
    let keywordWeight = 0.3;
    let bm25Params: BM25Params = { k1: 1.5, b: 0.75 };

    if (hasQuotes || hasSpecificTerms) {
      vectorWeight = 0.4;
      keywordWeight = 0.6;
      bm25Params = { k1: 2.0, b: 0.5 };
    } else if (isShort) {
      vectorWeight = 0.8;
      keywordWeight = 0.2;
    } else if (hasNumbers) {
      vectorWeight = 0.5;
      keywordWeight = 0.5;
      bm25Params = { k1: 1.8, b: 0.6 };
    }

    return this.hybridSearch(query, {
      topK,
      vectorWeight,
      keywordWeight,
      useBM25: true,
      bm25Params,
      minVectorSimilarity: 0.3
    });
  }

  // Answer generation
  async generateAnswer(query: string, chunks: RetrievedChunk[]): Promise<QueryResult> {
    // Check if we have relevant context
    if (chunks.length === 0) {
      return {
        answer: 'Insufficient information in the knowledge base to answer this query.',
        citations: [],
        confidence: 0,
      };
    }

    // Check relevance using rerank_score if available and > 0, otherwise use similarity
    const firstChunkScore = (chunks[0].rerank_score && chunks[0].rerank_score > 0) 
      ? chunks[0].rerank_score 
      : chunks[0].similarity;
    if (firstChunkScore < 0.2) {
      return {
        answer: 'Insufficient information in the knowledge base to answer this query.',
        citations: [],
        confidence: 0,
      };
    }

    // Build context from chunks with quality indicators
    const context = chunks
      .map((chunk, idx) => {
        let qualityNote = '';
        
        // Show rerank score if available (highest priority indicator)
        if (chunk.rerank_score !== undefined) {
          qualityNote = ` [Rerank Score: ${chunk.rerank_score.toFixed(3)}]`;
        }
        
        // Add search method indicators
        if (chunk.vector_score && chunk.keyword_score) {
          if (chunk.vector_score > 0 && chunk.keyword_score > 0) {
            qualityNote += ' [High Relevance: Found by both semantic and keyword search]';
          } else if (chunk.vector_score > 0) {
            qualityNote += ' [Semantic Match]';
          } else {
            qualityNote += ' [Keyword Match]';
          }
        }
        
        return `[${idx + 1}] ${chunk.content}\nSource: ${chunk.document_name}${qualityNote}`;
      })
      .join('\n\n');

    // Create prompt
    const prompt = `You are a legal and compliance assistant. Answer the question based ONLY on the provided context.

Rules:
- Only use information from the context below
- ONLY cite sources that actually contain the answer to the question
- Do NOT cite sources just because they mention similar keywords
- Cite sources using [number] references
- If the context doesn't contain enough information, say "Insufficient information in the knowledge base"
- Be precise and accurate
- Always include document names in your answer
- Prioritize information from sources marked as "High Relevance"

Context:
${context}

Question: ${query}

Answer:`;

    // Generate answer
    const response = await llm.invoke(prompt);
    const answer = response.content.toString();

    // Extract which sources were actually cited in the answer (e.g., [1], [2], [3])
    const citedIndices = new Set<number>();
    const citationMatches = answer.matchAll(/\[(\d+)\]/g);
    for (const match of citationMatches) {
      citedIndices.add(parseInt(match[1]) - 1); // Convert to 0-based index
    }

    // Extract citations (simplified - basic format)
    // Only include citations from chunks that are:
    // 1. Actually relevant (score > 0.4)
    // 2. Actually cited in the answer by the LLM
    const relevantChunks = chunks.filter((chunk, index) => {
      const score = (chunk.rerank_score && chunk.rerank_score > 0) 
        ? chunk.rerank_score 
        : chunk.similarity;
      const isRelevant = score > 0.4;
      const wasCited = citedIndices.has(index);
      return isRelevant && wasCited;
    });

    const citations: any[] = relevantChunks.map(chunk => ({
      document_name: chunk.document_name,
      section: chunk.section_name || 'N/A',
      page: chunk.page_number,
      content: chunk.content.substring(0, 150) + '...',
    }));

    // Calculate confidence based on multiple factors
    const avgSimilarity = chunks.reduce((sum, c) => sum + c.similarity, 0) / chunks.length;
    
    // Bonus for chunks found by both methods
    const bothMethodsCount = chunks.filter(c => 
      (c.vector_score || 0) > 0 && (c.keyword_score || 0) > 0
    ).length;
    const bothMethodsBonus = Math.min(bothMethodsCount * 5, 15); // Up to 15% bonus
    
    // Bonus for having multiple relevant chunks
    const chunkCountBonus = Math.min(chunks.length * 2, 10); // Up to 10% bonus
    
    let confidence = avgSimilarity * 100 + bothMethodsBonus + chunkCountBonus;
    confidence = Math.min(confidence, 100);
    const roundedConfidence = Math.round(confidence);

    // If confidence below threshold, do not return the generated answer
    if (roundedConfidence < 50) {
      return {
        answer: 'Insufficient information in the knowledge base to answer this query.',
        citations: [],
        confidence: roundedConfidence,
      };
    }

    return {
      answer,
      citations,
      confidence: roundedConfidence,
    };
  }

  // Main query processing method
  async processQuery(query: string): Promise<QueryResult> {
    // Step 1: Search for relevant chunks (hybrid search)
    const results = await this.search(query, 20); // Get more candidates for reranking
    
    // Step 2: Remove duplicates
    const deduplicated = this.removeDuplicates(results);
    
    // Step 3: Rerank using cross-encoder for precision
    // Lower threshold to 0.1 to avoid filtering out too many results
    const reranked = await this.reranker.rerankWithThreshold(
      query,
      deduplicated,
      10, // Top 10 after reranking
      0.1 // Minimum rerank score threshold (lowered from 0.3)
    );
    
    // Step 4: If reranking filtered everything, use original results
    const finalChunks = reranked.length > 0 ? reranked : deduplicated.slice(0, 10);
    
    // Step 5: Compress to fit context window
    const compressed = this.compress(finalChunks, 3000);
    
    // Step 6: Generate answer with LLM
    return this.generateAnswer(query, compressed);
  }
}