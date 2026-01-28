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
  debug?: {
    retrievalMethod: string;
    chunksRetrieved: number;
    chunksAfterRerank: number;
    topScores: number[];
  };
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
     return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
      .map(t => t.replace(/(ing|ed|s|es|d)$/,'')); // Basic stemming
  }

  private getTermFrequency(term: string, tokens: string[]): number {
    return tokens.filter(t => t === term).length;
  }

  async score(query: string, topK: number = 20): Promise<Array<RetrievedChunk & { id: string }>> {
    const queryTerms = this.tokenize(query);
    if (queryTerms.length === 0) return [];

    // Improved: Use partial matching with OR condition for better recall
    const tsQuery = queryTerms.join(' | '); // OR instead of AND
    
    const candidates = await pool.query(
      `SELECT c.id, c.content, c.section_name, c.page_number, c.chunk_index,
              d.id as document_id, d.name as document_name, d.version as document_version,
              d.type as document_type, d.upload_date, LENGTH(c.content) as doc_length
       FROM chunks c JOIN documents d ON c.document_id = d.id
       WHERE d.is_latest = true AND to_tsvector('english', c.content) @@ to_tsquery('english', $1)`,
      [tsQuery]
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

  // IMPROVED: Better context compression with relevance preservation
  private compress(chunks: RetrievedChunk[], maxTokens: number = 4000): RetrievedChunk[] {
    let totalTokens = 0;
    const compressed: RetrievedChunk[] = [];

    // Sort by relevance score (rerank_score > similarity)
    const sorted = [...chunks].sort((a, b) => {
      const scoreA = a.rerank_score ?? a.similarity;
      const scoreB = b.rerank_score ?? b.similarity;
      return scoreB - scoreA;
    });

    for (const chunk of sorted) {
      const estimatedTokens = Math.ceil(chunk.content.length / 4);
      
      if (totalTokens + estimatedTokens > maxTokens) {
        break;
      }

      compressed.push(chunk);
      totalTokens += estimatedTokens;
    }

    return compressed;
  }

  // IMPROVED: Better deduplication with content similarity
  private removeDuplicates(chunks: RetrievedChunk[]): RetrievedChunk[] {
    const seen = new Set<string>();
    const result: RetrievedChunk[] = [];
    
    for (const chunk of chunks) {
      // Use first 200 chars for better dedup
      const key = chunk.content.substring(0, 200).trim();
      
      if (seen.has(key)) continue;
      
      // Check for high overlap with existing chunks
      let isDuplicate = false;
      for (const existing of result) {
        const overlap = this.calculateOverlap(chunk.content, existing.content);
        if (overlap > 0.8) {
          isDuplicate = true;
          break;
        }
      }
      
      if (!isDuplicate) {
        seen.add(key);
        result.push(chunk);
      }
    }
    
    return result;
  }

  // Helper: Calculate content overlap
  private calculateOverlap(str1: string, str2: string): number {
    const tokens1 = new Set(str1.toLowerCase().split(/\s+/));
    const tokens2 = new Set(str2.toLowerCase().split(/\s+/));
    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);
    return intersection.size / union.size;
  }

  // IMPROVED: Hybrid search with better scoring
  private async hybridSearch(query: string, options: HybridSearchOptions = {}): Promise<RetrievedChunk[]> {
    const {
      topK = 10,
      vectorWeight = 0.7,
      keywordWeight = 0.3,
      minVectorSimilarity = 0.05, // Lowered for better recall
        vectorTopK = 80, // Increased from 50
        keywordTopK = 50, // Increased from 30
      useBM25 = true,
      bm25Params
    } = options;

    if (bm25Params) this.bm25Scorer = new BM25Scorer(bm25Params);

    // IMPROVED: Use original query + 1-2 rewrites (not 3+)
    const queries = await this.queryRewriter.rewrite(query);
    const limitedQueries = [queries[0], ...queries.slice(1, 3)]; // Max 3 queries
    
    const allResults = new Map<string, {
      chunk: Omit<RetrievedChunk, 'similarity'>;
      vectorScore: number;
      keywordScore: number;
      queryCount: number;
    }>();

    for (const q of limitedQueries) {
      const queryEmbedding = await embeddings.embedQuery(q);
      
      // Vector search
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
          // Convert distance to similarity
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
                chunk_index: row.chunk_index
              },
              vectorScore: sim,
              keywordScore: 0,
              queryCount: 1
            });
          }
        } catch (error) {
          console.error('Error processing vector result:', error);
        }
      });

      // Keyword search with BM25
      if (useBM25) {
        try {
          const keywordResults = await this.bm25Scorer.score(q, keywordTopK);
          
          // Normalize keyword scores
          this.bm25Scorer.normalizeScores(keywordResults);
          
          keywordResults.forEach(row => {
            const existing = allResults.get(row.id);
            if (existing) {
              existing.keywordScore = Math.max(existing.keywordScore, row.similarity);
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
                  chunk_index: row.chunk_index
                },
                vectorScore: 0,
                keywordScore: row.similarity,
                queryCount: 1
              });
            }
          });
        } catch (error) {
          console.error('BM25 search error:', error);
        }
      }
    }

    // IMPROVED: Better scoring with RRF (Reciprocal Rank Fusion)
    const scoredResults: RetrievedChunk[] = Array.from(allResults.values()).map(result => {
      // Traditional weighted score
      const weightedScore = result.vectorScore * vectorWeight + result.keywordScore * keywordWeight;
      
      // Query diversity bonus
      const queryBoost = Math.min(result.queryCount * 0.05, 0.15);
      
      // Bonus for chunks found by both methods
      const hybridBonus = (result.vectorScore > 0 && result.keywordScore > 0) ? 0.1 : 0;
      
      return {
        ...result.chunk,
        similarity: Math.min(weightedScore + queryBoost + hybridBonus, 1.0),
        vector_score: result.vectorScore,
        keyword_score: result.keywordScore
      };
    });

    return scoredResults.sort((a, b) => b.similarity - a.similarity).slice(0, topK * 2); // Get more for reranking
  }

  // IMPROVED: Adaptive search with better query analysis
  async search(query: string, topK: number = 20): Promise<RetrievedChunk[]> {
    const hasQuotes = /["']/.test(query);
    const hasSpecificTerms = /\b(section|page|chapter|clause|article|paragraph)\s+\d+/i.test(query);
    const isShort = query.split(/\s+/).length <= 3;
    const hasNumbers = /\d+/.test(query);
    const isTechnicalQuery = /\b(database|api|system|server|protocol|framework|architecture)\b/i.test(query);
    
    let vectorWeight = 0.7;
    let keywordWeight = 0.3;
    let bm25Params: BM25Params = { k1: 1.5, b: 0.75 };

    // Adjust weights based on query type
    if (hasQuotes || hasSpecificTerms) {
      vectorWeight = 0.3;
      keywordWeight = 0.7;
      bm25Params = { k1: 2.0, b: 0.5 };
    } else if (isShort) {
      vectorWeight = 0.8;
      keywordWeight = 0.2;
    } else if (isTechnicalQuery) {
      // Technical queries benefit from both methods equally
      vectorWeight = 0.6;
      keywordWeight = 0.4;
      bm25Params = { k1: 1.8, b: 0.65 };
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
      minVectorSimilarity: 0.05, // Lower threshold for better recall
      vectorTopK: 60,
      keywordTopK: 40
    });
  }

  // IMPROVED: Better answer generation with context quality assessment
  async generateAnswer(query: string, chunks: RetrievedChunk[]): Promise<QueryResult> {
    // Check if we have relevant context
    if (chunks.length === 0) {
      return {
        answer: 'I could not find relevant information in the knowledge base to answer this query. Please try rephrasing your question or check if the relevant documents have been uploaded.',
        citations: [],
        confidence: 0,
      };
    }

    // IMPROVED: Better relevance check using rerank score when available
    const bestScore = chunks[0].rerank_score ?? chunks[0].similarity;
    const avgScore = chunks.reduce((sum, c) => sum + (c.rerank_score ?? c.similarity), 0) / chunks.length;
    
    // More lenient threshold
    if (bestScore < 0.15) {
      return {
        answer: 'The information in the knowledge base does not seem directly relevant to your query. Please try rephrasing or providing more context.',
        citations: [],
        confidence: Math.round(bestScore * 100),
      };
    }

    // Build context with quality indicators
    const context = chunks
      .map((chunk, idx) => {
        const score = chunk.rerank_score ?? chunk.similarity;
        let qualityNote = `[Relevance: ${(score * 100).toFixed(0)}%]`;
        
        // Add search method indicators
        if (chunk.vector_score && chunk.keyword_score) {
          if (chunk.vector_score > 0.1 && chunk.keyword_score > 0.1) {
            qualityNote += ' [High Confidence: Semantic + Keyword Match]';
          } else if (chunk.vector_score > 0.1) {
            qualityNote += ' [Semantic Match]';
          } else {
            qualityNote += ' [Keyword Match]';
          }
        }
        
        // Add version info for regulatory compliance
        let versionInfo = '';
        if (chunk.document_version) {
          versionInfo = ` (v${chunk.document_version})`;
        }
        
        return `[${idx + 1}] ${chunk.content}\n📄 Source: ${chunk.document_name}${versionInfo} ${qualityNote}`;
      })
      .join('\n\n---\n\n');

    // IMPROVED: Better prompt with explicit instructions
    const prompt = `You are a legal and compliance assistant. Answer the question based strictly on the provided context.

CRITICAL RULES:
1. Only use information explicitly stated in the context
2. Cite sources using [number] format (e.g., [1], [2])
3. ONLY cite sources that directly answer the question
4. If multiple sources say the same thing, cite all of them
5. If the context lacks sufficient information, explicitly state: "Based on the available documents, I cannot find sufficient information about [specific aspect]"
6. Be precise and accurate
7. Prioritize sources marked as "High Confidence"
8. Always mention document names and versions in your answer
9. If the answer requires information not in the context, say so clearly

Context:
${context}

Question: ${query}

Answer (be specific and cite sources):`;

    // Generate answer
    const response = await llm.invoke(prompt);
    const answer = response.content.toString();

    // Extract cited sources
    const citedIndices = new Set<number>();
    const citationMatches = answer.matchAll(/\[(\d+)\]/g);
    for (const match of citationMatches) {
      const idx = parseInt(match[1]) - 1;
      if (idx >= 0 && idx < chunks.length) {
        citedIndices.add(idx);
      }
    }

    // Build citations from actually cited chunks
    const citations: any[] = [];
    for (const idx of citedIndices) {
      const chunk = chunks[idx];
      citations.push({
        document_name: chunk.document_name,
        version: chunk.document_version || 'N/A',
        section: chunk.section_name || 'N/A',
        page: chunk.page_number || null, 
        relevance_score: (chunk.rerank_score ?? chunk.similarity), 
        content: chunk.content.substring(0, 200) + '...'
      });
    }

    // IMPROVED: Better confidence calculation
    const topScore = bestScore;
    const avgChunkScore = avgScore;
    
    // Base confidence from scores
    let confidence = (topScore * 0.6 + avgChunkScore * 0.4) * 100;
    
    // Bonus for multiple relevant chunks
    const relevantCount = chunks.filter(c => (c.rerank_score ?? c.similarity) > 0.3).length;
    const countBonus = Math.min(relevantCount * 3, 15);
    
    // Bonus for hybrid matches
    const hybridCount = chunks.filter(c => 
      (c.vector_score || 0) > 0.1 && (c.keyword_score || 0) > 0.1
    ).length;
    const hybridBonus = Math.min(hybridCount * 5, 15);
    
    // Bonus for citations
    const citationBonus = Math.min(citations.length * 2, 10);
    
    confidence = confidence + countBonus + hybridBonus + citationBonus;
    confidence = Math.min(Math.max(confidence, 0), 100);
    const roundedConfidence = Math.round(confidence);

    // Lower threshold for returning answer
    if (roundedConfidence < 40 || bestScore < 0.2) {
      return {
        answer: 'While I found some potentially related information, the relevance is too low to provide a confident answer. Please try rephrasing your question or check if the relevant documents have been uploaded.',
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

  // IMPROVED: Main query processing with better debugging
  async processQuery(query: string, debug: boolean = true): Promise<QueryResult> {
    console.log('\n🔍 Starting query processing:', query);
    
    // Step 1: Search for relevant chunks
      const results = await this.search(query, 30); // Get more candidates (already set to 30)
    
    if (debug) {
      console.log('\n[DEBUG] Retrieved Chunks (after hybrid search):', results.length);
      console.log('Top 5 results:');
      results.slice(0, 5).forEach((c, i) => {
        console.log({
          idx: i,
          similarity: c.similarity?.toFixed(3),
          vector_score: c.vector_score?.toFixed(3),
          keyword_score: c.keyword_score?.toFixed(3),
          document_name: c.document_name,
          preview: c.content.substring(0, 100) + '...'
        });
      });
    }

    if (results.length === 0) {
      return {
        answer: 'No relevant documents found. Please check if the relevant documents have been uploaded to the system.',
        citations: [],
        confidence: 0,
      };
    }

    // Step 2: Remove duplicates
    const deduplicated = this.removeDuplicates(results);
    if (debug) {
      console.log('\n[DEBUG] After deduplication:', deduplicated.length);
    }

    // Step 3: Rerank using cross-encoder
    let reranked: RetrievedChunk[] = [];
    try {
      // CRITICAL FIX: Much lower threshold and get more results
      reranked = await this.reranker.rerankWithThreshold(
        query,
        deduplicated,
        15, // Get top 15
        0.01 // Very low threshold - let the answer generation handle filtering
      );
      
      if (debug) {
        console.log('\n[DEBUG] After reranking:', reranked.length);
        if (reranked.length > 0) {
          console.log('Top 5 reranked:');
          reranked.slice(0, 5).forEach((c, i) => {
            console.log({
              idx: i,
              rerank_score: c.rerank_score?.toFixed(3),
              document_name: c.document_name,
              preview: c.content.substring(0, 80) + '...'
            });
          });
        }
      }
    } catch (error) {
      console.error('Reranking error:', error);
    }

    // Step 4: Fallback to original if reranking fails or returns nothing
    const finalChunks = (reranked.length > 0) ? reranked : deduplicated.slice(0, 15);
    
    if (debug) {
      console.log('\n[DEBUG] Final chunks for generation:', finalChunks.length);
      console.log('Using:', reranked.length > 0 ? 'reranked results' : 'original results (reranking failed/empty)');
    }

    // Step 5: Compress to fit context window
    const compressed = this.compress(finalChunks, 4000); // Increased token limit
    if (debug) {
      console.log('[DEBUG] After compression:', compressed.length);
    }

    // Step 6: Generate answer
    const result = await this.generateAnswer(query, compressed);
    
    if (debug) {
      console.log('\n[DEBUG] Final Result:');
      console.log({
        confidence: result.confidence,
        citations: result.citations.length,
        answer_length: result.answer.length
      });
    }

    return result;
  }
}