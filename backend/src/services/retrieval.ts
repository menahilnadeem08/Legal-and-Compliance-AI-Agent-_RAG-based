import pool from '../config/database';
import { embeddings } from '../config/openai';
import { QueryRewriter } from '../utils/queryRewriter';
import { Reranker } from '../utils/reranker';
import { pipelineLogger } from './logger';

export interface RetrievedChunk {
  content: string;
  document_name: string;
  section_name?: string;
  page_number?: number;
  similarity: number;
  embedding?: number[];  // Required for reranking
  id?: string;           // Chunk ID for tracking
}

export class RetrievalService {
  private queryRewriter: QueryRewriter;
  private reranker: Reranker;

  constructor() {
    this.queryRewriter = new QueryRewriter();
    this.reranker = new Reranker();
  }

  async hybridSearch(query: string, topK: number = 10): Promise<RetrievedChunk[]> {
    // Rewrite query
    pipelineLogger.info('QUERY_REWRITE', 'Rewriting query for better coverage...');
    const queries = await this.queryRewriter.rewrite(query);
    pipelineLogger.info('QUERY_REWRITE_COMPLETE', `Generated ${queries.length} query variations`, {
      originalQuery: query,
      rewrittenQueries: queries,
    });
    console.log('Rewritten queries:', queries);

    const allResults = new Map<string, RetrievedChunk>();

    for (const q of queries) {
      pipelineLogger.debug('VECTOR_SEARCH', `Generating embeddings for query: "${q.substring(0, 50)}..."`);
      const queryEmbedding = await embeddings.embedQuery(q);
      pipelineLogger.debug('VECTOR_SEARCH', 'Searching vector database for similar content...');

      // Vector search. Pass the vector as a Postgres-style bracketed string
      // and cast to `vector` in the query so pgvector operators work.
      const vectorText = `[${queryEmbedding.join(',')}]`;
      // Fetch candidate chunks and their stored embeddings (as text)
      const vectorResults = await pool.query(
        `SELECT 
    c.id,
    c.content,
    c.section_name,
    c.page_number,
    d.name as document_name,
    c.embedding
   FROM chunks c
   JOIN documents d ON c.document_id = d.id
   WHERE d.is_latest = true
   LIMIT $1`,
        [50]
      );

      pipelineLogger.debug('VECTOR_SEARCH_COMPLETE', `Found ${vectorResults.rows.length} vector results`, {
        resultsCount: vectorResults.rows.length,
      });

      pipelineLogger.debug('KEYWORD_SEARCH', 'Performing keyword search on documents...');
      // Keyword search
      const keywordResults = await pool.query(
        `SELECT 
          c.id,
          c.content,
          c.section_name,
          c.page_number,
          d.name as document_name,
          ts_rank(to_tsvector('english', c.content), plainto_tsquery('english', $1::text)) as rank
         FROM chunks c
         JOIN documents d ON c.document_id = d.id
         WHERE d.is_latest = true
         AND to_tsvector('english', c.content) @@ plainto_tsquery('english', $1::text)
         ORDER BY rank DESC
         LIMIT $2`,
        [q, 5]
      );

      pipelineLogger.debug('KEYWORD_SEARCH_COMPLETE', `Found ${keywordResults.rows.length} keyword results`, {
        resultsCount: keywordResults.rows.length,
      });

      // Compute cosine similarity locally for robustness
      const qVec = queryEmbedding;
      const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);

      vectorResults.rows.forEach(row => {
        try {
          const stored = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding;
          if (Array.isArray(stored) && stored.length === qVec.length) {
            const simRaw = dot(qVec, stored) / (norm(qVec) * norm(stored));
            // map cosine [-1,1] -> [0,1]
            const sim = (simRaw + 1) / 2;
            if (!allResults.has(row.id)) {
              allResults.set(row.id, {
                id: row.id,
                content: row.content,
                document_name: row.document_name,
                section_name: row.section_name,
                page_number: row.page_number,
                similarity: sim,
                embedding: stored,  // Store embedding for reranking
              });
            }
          }
        } catch (e) {
          console.warn('Failed to parse embedding for chunk', row.id, e);
        }
      });

      // Normalize keyword ranks to [0,1] within this batch
      const ranks = keywordResults.rows.map(r => parseFloat(r.rank || '0'));
      const maxRank = ranks.length > 0 ? Math.max(...ranks) : 0;
      keywordResults.rows.forEach(row => {
        const rankVal = parseFloat(row.rank || '0');
        const sim = maxRank > 0 ? rankVal / maxRank : 0;
        if (!allResults.has(row.id)) {
          // For keyword-only results, fetch embedding separately
          const vectorRow = vectorResults.rows.find(r => r.id === row.id);
          const embedding = vectorRow ? (typeof vectorRow.embedding === 'string' ? JSON.parse(vectorRow.embedding) : vectorRow.embedding) : undefined;
          allResults.set(row.id, {
            id: row.id,
            content: row.content,
            document_name: row.document_name,
            section_name: row.section_name,
            page_number: row.page_number,
            similarity: sim * 0.6, // weight keyword matches slightly lower
            embedding,
          });
        }
      });
    }

    const initialResults = Array.from(allResults.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    // Apply MMR reranking for relevance + diversity
    try {
      pipelineLogger.info('RERANKING', 'Starting MMR reranking for diversity', {
        query,
        initialResultsCount: initialResults.length,
      });

      // Filter chunks with embeddings (required for reranking)
      const chunksWithEmbeddings = initialResults
        .filter(c => c.embedding && Array.isArray(c.embedding))
        .map(c => ({ ...c, embedding: c.embedding as number[] }));
      
      if (chunksWithEmbeddings.length === 0) {
        pipelineLogger.warn('RERANKING_SKIPPED', 'No chunks with embeddings, returning initial results');
        return initialResults;
      }

      // Rerank using MMR (λ=0.7 for legal: relevance-focused)
      const reranked = this.reranker.rerank(chunksWithEmbeddings, topK, 0.7);
      
      pipelineLogger.info('RERANKING_COMPLETE', 'MMR reranking completed', {
        inputCount: chunksWithEmbeddings.length,
        outputCount: reranked.length,
      });

      return reranked;
    } catch (err) {
      console.warn('Reranker failed, returning initial results:', err);
      pipelineLogger.warn(
        'RERANKING_FAILED',
        'Reranker failed, returning initial results',
        { error: String(err) }
      );
      return initialResults;
    }
  }
}