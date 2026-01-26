import pool from '../config/database';
import { embeddings } from '../config/openai';
import { QueryRewriter } from './queryRewriter';
import { Reranker } from './reranker';

export interface RetrievedChunk {
  content: string;
  document_name: string;
  section_name?: string;
  page_number?: number;
  similarity: number;
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
    const queries = await this.queryRewriter.rewrite(query);
    console.log('Rewritten queries:', queries);

    const allResults = new Map<string, RetrievedChunk>();

    for (const q of queries) {
      const queryEmbedding = await embeddings.embedQuery(q);

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
                content: row.content,
                document_name: row.document_name,
                section_name: row.section_name,
                page_number: row.page_number,
                similarity: sim,
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
          allResults.set(row.id, {
            content: row.content,
            document_name: row.document_name,
            section_name: row.section_name,
            page_number: row.page_number,
            similarity: sim * 0.6, // weight keyword matches slightly lower
          });
        }
      });
    }

    const initialResults = Array.from(allResults.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    // Try cross-encoder reranking (best-effort). If it fails, return initial results.
    try {
      const reranked = await this.reranker.rerank(query, initialResults, topK);
      return reranked;
    } catch (err) {
      console.warn('Reranker failed or not configured, returning initial hybrid results:', err);
      return initialResults;
    }
  }
}