import pool from '../config/database';
import { llm } from '../config/openai';
import { QueryRewriter } from '../utils/queryRewriter';
import { Reranker } from '../utils/reranker';
import { embeddings } from '../config/openai';
import { DocumentService } from './documentService'; 

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
      .map(t => t.replace(/(ing|ed|s|es|d)$/, '')); // Basic stemming
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

    const docs = candidates.rows.map(row => {
      const tokens = this.tokenize(row.content);
      return {
        ...row,
        tokens,
        doc_length: tokens.length
      };
    });

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
  private documentService: DocumentService; 

  constructor(bm25Params?: BM25Params, cohereApiKey?: string) {
    this.queryRewriter = new QueryRewriter();
    this.bm25Scorer = new BM25Scorer(bm25Params);
    this.reranker = new Reranker(cohereApiKey);
    this.documentService = new DocumentService(); 
  }

  private detectVersionQuery(query: string): {
    isVersionQuery: boolean;
    documentName?: string;
    version1?: string;
    version2?: string;
  } {
    const patterns = [
      // More flexible patterns
      /(?:diff|difference|compare|changes?)\s+(?:between|in)\s+(.+?)\s+versions?\s*(\d+\.?\d*)\s+(?:and|vs|versus)\s+(\d+\.?\d*)/i,
      /(?:what|show).*?(?:changed?|updates?)\s+(?:in|for)\s+(.+?)\s+(?:from|between)\s+v?(\d+\.?\d*)\s+(?:to|and)\s+v?(\d+\.?\d*)/i,
      // Match "test.pdf version1 and 2" (no space after version)
      /(?:diff|difference|compare)\s+(?:between|in)?\s*(.+?)\s+version\s*(\d+\.?\d*)\s+(?:and|vs)\s+(\d+\.?\d*)/i,
    ];

    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match) {
        return {
          isVersionQuery: true,
          documentName: match[1].trim(),
          version1: match[2],
          version2: match[3]
        };
      }
    }

    return { isVersionQuery: false };
  }

  // IMPROVED: Better context compression with relevance preservation
  private compress(chunks: RetrievedChunk[], maxTokens: number = 4000): RetrievedChunk[] {
    let totalTokens = 0;
    const compressed: RetrievedChunk[] = [];

    // Sort by relevance score (rerank_score > similarity)
    const sorted = [...chunks].sort((a, b) => {
      const scoreA = Math.min(a.rerank_score ?? a.similarity, 1);
      const scoreB = Math.min(b.rerank_score ?? b.similarity, 1);
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
      minVectorSimilarity = 0.05,
      vectorTopK = 80,
      keywordTopK = 50,
      useBM25 = true,
      bm25Params
    } = options;

    if (bm25Params) this.bm25Scorer = new BM25Scorer(bm25Params);

    const queries = await this.queryRewriter.rewrite(query);
    const vectorResults: Array<RetrievedChunk & { id?: string }> = [];

    for (const q of queries) {
      const embedding = await embeddings.embedQuery(q);
      const result = await pool.query(
        `SELECT c.id, c.content, c.section_name, c.page_number, c.chunk_index,
                d.id as document_id, d.name as document_name, d.version as document_version,
                d.type as document_type, d.upload_date,
                1 - (c.embedding <=> $1::vector) as similarity
         FROM chunks c
         JOIN documents d ON c.document_id = d.id
         WHERE d.is_latest = true AND c.embedding IS NOT NULL
         ORDER BY c.embedding <=> $1::vector
         LIMIT $2`,
        [JSON.stringify(embedding), vectorTopK]
      );
      vectorResults.push(...result.rows);
    }

    const vectorMap = new Map<string, RetrievedChunk>();
    for (const r of vectorResults) {
      if (r.similarity < minVectorSimilarity) continue;

      const key = r.id || `${r.document_id}_${r.chunk_index}`;
      if (!vectorMap.has(key) || (vectorMap.get(key)!.similarity < r.similarity)) {
        vectorMap.set(key, {
          ...r,
          vector_score: r.similarity,
          keyword_score: 0,
          similarity: r.similarity
        });
      }
    }

    let keywordResults: Array<RetrievedChunk & { id: string }> = [];
    if (useBM25) {
      keywordResults = await this.bm25Scorer.score(query, keywordTopK);
      this.bm25Scorer.normalizeScores(keywordResults);
    }

    for (const r of keywordResults) {
      const key = r.id;
      if (vectorMap.has(key)) {
        const existing = vectorMap.get(key)!;
        existing.keyword_score = r.similarity;
        existing.similarity = (existing.vector_score || 0) * vectorWeight + r.similarity * keywordWeight;
      } else {
        vectorMap.set(key, {
          ...r,
          keyword_score: r.similarity,
          vector_score: 0,
          similarity: r.similarity * keywordWeight
        });
      }
    }

    const combined = Array.from(vectorMap.values());
    return combined.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
  }

  private async search(query: string, topK: number = 20): Promise<RetrievedChunk[]> {
    return this.hybridSearch(query, {
      topK,
      vectorWeight: 0.7,
      keywordWeight: 0.3,
      minVectorSimilarity: 0.05,
      vectorTopK: 80,
      keywordTopK: 50,
      useBM25: true
    });
  }

  private async generateAnswer(query: string, chunks: RetrievedChunk[]): Promise<QueryResult> {
    const normalizeScore = (score: number) => Math.max(0, Math.min(score, 1));

    if (chunks.length === 0) {
      return {
        answer: 'No relevant information found in the knowledge base.',
        citations: [],
        confidence: 0,
      };
    }

    const bestScore = normalizeScore(
      chunks[0].rerank_score ?? chunks[0].similarity
    );

    const avgScore =
      chunks.reduce(
        (sum, c) => sum + normalizeScore(c.rerank_score ?? c.similarity),
        0
      ) / chunks.length;

    if (bestScore < 0.15) {
      return {
        answer: 'The information in the knowledge base does not seem directly relevant to your query. Please try rephrasing or providing more context.',
        citations: [],
        confidence: Math.round(bestScore * 100),
      };
    }

    const context = chunks
      .map((chunk, idx) => {
        const score = normalizeScore(
          chunk.rerank_score ?? chunk.similarity
        );
        let qualityNote = `[Relevance: ${(score * 100).toFixed(0)}%]`;

        if (chunk.vector_score && chunk.keyword_score) {
          if (chunk.vector_score > 0.1 && chunk.keyword_score > 0.1) {
            qualityNote += ' [High Confidence: Semantic + Keyword Match]';
          } else if (chunk.vector_score > 0.1) {
            qualityNote += ' [Semantic Match]';
          } else {
            qualityNote += ' [Keyword Match]';
          }
        }

        let versionInfo = '';
        if (chunk.document_version) {
          versionInfo = ` (v${chunk.document_version})`;
        }

        return `[${idx + 1}] ${chunk.content}\n📄 Source: ${chunk.document_name}${versionInfo} ${qualityNote}`;
      })
      .join('\n\n---\n\n');

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

    const response = await llm.invoke(prompt);
    const answer = response.content.toString();

    const citedIndices = new Set<number>();
    const citationMatches = answer.matchAll(/\[(\d+)\]/g);
    for (const match of citationMatches) {
      const idx = parseInt(match[1]) - 1;
      if (idx >= 0 && idx < chunks.length) {
        citedIndices.add(idx);
      }
    }

    const citations: any[] = [];
    for (const idx of citedIndices) {
      const chunk = chunks[idx];
      citations.push({
        document_name: chunk.document_name,
        version: chunk.document_version || 'N/A',
        section: chunk.section_name || 'N/A',
        page: chunk.page_number || null,
        relevance_score: normalizeScore(
          chunk.rerank_score ?? chunk.similarity
        ),
        content: chunk.content.substring(0, 200) + '...'
      });
    }

    const topScore = normalizeScore(bestScore);
    const avgChunkScore = normalizeScore(avgScore);

    let confidence = (topScore * 0.6 + avgChunkScore * 0.4) * 100;

    const relevantCount = chunks.filter(
      c => normalizeScore(c.rerank_score ?? c.similarity) > 0.3
    ).length;
    const countBonus = Math.min(relevantCount * 3, 15);

    const hybridCount = chunks.filter(c =>
      (c.vector_score || 0) > 0.1 && (c.keyword_score || 0) > 0.1
    ).length;
    const hybridBonus = Math.min(hybridCount * 5, 15);

    const citationBonus = Math.min(citations.length * 2, 10);

    confidence = confidence + countBonus + hybridBonus + citationBonus;
    confidence = Math.min(Math.max(confidence, 0), 100);
    const roundedConfidence = Math.round(confidence);

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

  // IMPROVED: Main query processing with version detection
  async processQuery(query: string, debug: boolean = true): Promise<QueryResult> {
    console.log('\n🔍 Starting query processing:', query);

    // Check if this is a version comparison query
    const versionQuery = this.detectVersionQuery(query);

    if (versionQuery.isVersionQuery) {
      console.log('🔄 Detected version comparison query');
      try {
        const comparison = await this.documentService.compareVersionsDetailed(
          versionQuery.documentName!,
          versionQuery.version1!,
          versionQuery.version2!
        );

        const answer = `# Version Comparison: ${comparison.document_name}

## Overview
📄 **Version ${comparison.version1.version}** → **Version ${comparison.version2.version}**  
📅 ${new Date(comparison.version1.upload_date).toLocaleDateString()} → ${new Date(comparison.version2.upload_date).toLocaleDateString()}

## Change Summary
${comparison.statistics.chunks_added > 0 ? `✅ **${comparison.statistics.chunks_added} sections added**` : ''}
${comparison.statistics.chunks_removed > 0 ? `\n❌ **${comparison.statistics.chunks_removed} sections removed**` : ''}
${comparison.statistics.chunks_modified > 0 ? `\n✏️ **${comparison.statistics.chunks_modified} sections modified**` : ''}
${comparison.statistics.chunks_unchanged > 0 ? `\n✓ ${comparison.statistics.chunks_unchanged} sections unchanged` : ''}

**Overall Change Rate:** ${comparison.statistics.change_percentage.toFixed(0)}%

---

## Key Changes

${comparison.summary}

---

## Impact Analysis

${comparison.impact_analysis?.high_impact_changes && comparison.impact_analysis.high_impact_changes.length > 0 ? `### ⚠️ High Impact Changes
${comparison.impact_analysis.high_impact_changes.slice(0, 5).map(c => `- ${c}`).join('\n')}` : ''}

${comparison.impact_analysis?.medium_impact_changes && comparison.impact_analysis.medium_impact_changes.length > 0 ? `\n### 🔶 Medium Impact Changes
${comparison.impact_analysis.medium_impact_changes.slice(0, 3).map(c => `- ${c}`).join('\n')}` : ''}

${comparison.impact_analysis?.low_impact_changes && comparison.impact_analysis.low_impact_changes.length > 0 ? `\n### 🔷 Low Impact Changes  
${comparison.impact_analysis.low_impact_changes.slice(0, 2).map(c => `- ${c}`).join('\n')}` : ''}`;

        return {
          answer,
          citations: [],
          confidence: 100
        };
      } catch (error: any) {
        console.error('Version comparison error:', error);
        return {
          answer: `❌ **Failed to compare versions**\n\n${error.message}\n\nPlease ensure both versions exist in the system.`,
          citations: [],
          confidence: 0
        };
      }
    }

    // Rest of existing processQuery code...
    const results = await this.search(query, 30);

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

    const deduplicated = this.removeDuplicates(results);
    if (debug) {
      console.log('\n[DEBUG] After deduplication:', deduplicated.length);
    }

    let reranked: RetrievedChunk[] = [];
    try {
      reranked = await this.reranker.rerankWithThreshold(
        query,
        deduplicated,
        15,
        0.01
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

    const finalChunks = (reranked.length > 0) ? reranked : deduplicated.slice(0, 15);

    if (debug) {
      console.log('\n[DEBUG] Final chunks for generation:', finalChunks.length);
      console.log('Using:', reranked.length > 0 ? 'reranked results' : 'original results (reranking failed/empty)');
    }

    const compressed = this.compress(finalChunks, 4000);
    if (debug) {
      console.log('[DEBUG] After compression:', compressed.length);
    }

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