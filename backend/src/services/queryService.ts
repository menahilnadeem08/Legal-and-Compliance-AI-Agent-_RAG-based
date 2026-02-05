import pool from '../config/database';
import { llm } from '../config/openai';
import { QueryRewriter } from '../utils/queryRewriter';
import { Reranker } from '../utils/reranker';
import { embeddings } from '../config/openai';
import { DocumentService } from './documentService';
import { VersionComparisonService } from './versionComparisonService';

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
  embedding?: number[];
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
  component_scores?: {
    relevance: number;
    diversity: number;
  };
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
      .map(t => {
        // Better stemming: only remove common plurals/verb endings
        // Avoid removing important letters like 'e' in 'leave'
        return t
          .replace(/ies$/, 'i')  // policies -> polici
          .replace(/es$/, 'e')   // leaves -> leave (not lev!)
          .replace(/s$/, '')     // days -> day
          .replace(/ing$/, '')   // processing -> process
          .replace(/ed$/, '');   // terminated -> terminat
      });
  }

  private getTermFrequency(term: string, tokens: string[]): number {
    return tokens.filter(t => t === term).length;
  }

  async score(query: string, topK: number = 20): Promise<Array<RetrievedChunk & { id: string }>> {
    const queryTerms = this.tokenize(query);
    if (queryTerms.length === 0) return [];

    const tsQuery = queryTerms.join(' | ');

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
  private versionComparisonService: VersionComparisonService;

  constructor(bm25Params?: BM25Params) {
    this.queryRewriter = new QueryRewriter();
    this.bm25Scorer = new BM25Scorer(bm25Params);
    this.reranker = new Reranker();
    this.documentService = new DocumentService();
    this.versionComparisonService = new VersionComparisonService();
  }

  /**
   * ENHANCED: Detect if query is about version comparison
   * Checks for keywords like: compare, difference, changes, versions, etc.
   */
  private isVersionComparisonQuery(query: string): boolean {
    const keywords = [
      'compare', 'comparison', 'difference', 'diff', 'changes', 'changed',
      'version', 'versions', 'between', 'vs', 'versus', 'update', 'updated',
      'latest', 'previous', 'old', 'new'
    ];

    const lowerQuery = query.toLowerCase();
    return keywords.some(keyword => lowerQuery.includes(keyword));
  }

  private compress(chunks: RetrievedChunk[], maxTokens: number = 4000): RetrievedChunk[] {
    let totalTokens = 0;
    const compressed: RetrievedChunk[] = [];

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

  private removeDuplicates(chunks: RetrievedChunk[]): RetrievedChunk[] {
    const seen = new Set<string>();
    const result: RetrievedChunk[] = [];

    for (const chunk of chunks) {
      const key = chunk.content.substring(0, 200).trim();

      if (seen.has(key)) continue;

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

  private calculateOverlap(text1: string, text2: string): number {
    const tokens1 = new Set(text1.toLowerCase().split(/\s+/));
    const tokens2 = new Set(text2.toLowerCase().split(/\s+/));
    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const minSize = Math.min(tokens1.size, tokens2.size);
    return minSize > 0 ? intersection.size / minSize : 0;
  }

  async vectorSearch(queryEmbedding: number[], topK: number = 20): Promise<RetrievedChunk[]> {
    const result = await pool.query(
      `SELECT c.content, c.embedding, c.section_name, c.page_number, c.chunk_index,
              d.name as document_name, d.id as document_id, d.version as document_version,
              d.type as document_type, d.upload_date,
              1 - (c.embedding <=> $1::vector) as similarity
       FROM chunks c
       JOIN documents d ON c.document_id = d.id
       WHERE d.is_latest = true
       ORDER BY c.embedding <=> $1::vector
       LIMIT $2`,
      [JSON.stringify(queryEmbedding), topK]
    );

    return result.rows.map(row => ({
      ...row,
      embedding: typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding,
      vector_score: row.similarity
    }));
  }

  async search(query: string, topK: number = 20, options?: HybridSearchOptions): Promise<RetrievedChunk[]> {
    const opts = {
      vectorWeight: 0.6,
      keywordWeight: 0.4,
      minVectorSimilarity: 0.1,
      vectorTopK: Math.ceil(topK * 1.5),
      keywordTopK: Math.ceil(topK * 1.5),
      useBM25: true,
      ...options
    };

    const [queryEmbedding, keywordResults] = await Promise.all([
      embeddings.embedQuery(query),
      opts.useBM25 ? this.bm25Scorer.score(query, opts.keywordTopK) : Promise.resolve([])
    ]);

    const vectorResults = await this.vectorSearch(queryEmbedding, opts.vectorTopK);

    this.bm25Scorer.normalizeScores(keywordResults);

    const normalizeVector = (score: number) => Math.max(0, Math.min(1, score));
    vectorResults.forEach(r => r.similarity = normalizeVector(r.similarity));

    const combined = new Map<string, RetrievedChunk>();

    for (const result of vectorResults) {
      if (result.similarity >= opts.minVectorSimilarity) {
        const key = `${result.document_name}-${result.chunk_index}`;
        combined.set(key, {
          ...result,
          similarity: result.similarity * opts.vectorWeight,
          vector_score: result.similarity,
          keyword_score: 0
        });
      }
    }

    for (const result of keywordResults) {
      const key = `${result.document_name}-${result.chunk_index}`;
      const existing = combined.get(key);

      if (existing) {
        existing.similarity += result.similarity * opts.keywordWeight;
        existing.keyword_score = result.similarity;
      } else {
        combined.set(key, {
          ...result,
          similarity: result.similarity * opts.keywordWeight,
          vector_score: 0,
          keyword_score: result.similarity
        });
      }
    }

    const results = Array.from(combined.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    return results;
  }

  private async validateAnswer(
    answer: string,
    chunks: RetrievedChunk[]
  ): Promise<{ valid: boolean; reason?: string }> {
    // 1. Must have citations
    if (!/\[\d+\]/.test(answer)) {
      return { valid: false, reason: "Answer lacks source citations" };
    }

    // 2. Check for speculative language (not allowed in legal)
    const speculative = [
      'might', 'could', 'possibly', 'perhaps', 'maybe',
      'likely', 'probably', 'seems', 'appears to', 'suggests'
    ];
    
    const lowerAnswer = answer.toLowerCase();
    for (const word of speculative) {
      if (lowerAnswer.includes(word)) {
        return { 
          valid: false, 
          reason: `Contains speculative language: "${word}" - legal answers must be definitive` 
        };
      }
    }

    // 3. Check if answer explicitly says "I don't know" - these are valid
    const uncertainPhrases = [
      'i cannot find', 'i don\'t know', 'not available',
      'insufficient information', 'no information', 'based on the available documents'
    ];
    
    if (uncertainPhrases.some(phrase => lowerAnswer.includes(phrase))) {
      return { valid: true }; // Valid "I don't know" responses
    }

    return { valid: true };
  }

  async generateAnswer(query: string, chunks: RetrievedChunk[]): Promise<QueryResult> {
    const normalizeScore = (score: number) => Math.max(0, Math.min(1, score));

    const bestScore = chunks.length > 0
      ? Math.max(...chunks.map(c => normalizeScore(c.rerank_score ?? c.similarity)))
      : 0;

    const avgScore = chunks.length > 0
      ? chunks.reduce((sum, c) => sum + normalizeScore(c.rerank_score ?? c.similarity), 0) / chunks.length
      : 0;

    const context = chunks
      .map((chunk, idx) => {
        const score = normalizeScore(chunk.rerank_score ?? chunk.similarity);
        const confidence = score > 0.7 ? 'High Confidence' : score > 0.4 ? 'Medium Confidence' : 'Low Confidence';

        return `[${idx + 1}] ${confidence} (Score: ${score.toFixed(2)})
Document: ${chunk.document_name} (v${chunk.document_version || 'N/A'})
Section: ${chunk.section_name || 'N/A'} | Page: ${chunk.page_number || 'N/A'}
Content: ${chunk.content}`;
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

    // Validate answer before processing citations
    const validation = await this.validateAnswer(answer, chunks);
    if (!validation.valid) {
      return {
        answer: `I cannot provide a confident answer based on the available documents. ${validation.reason || ''}`,
        citations: [],
        confidence: 0
      };
    }

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

    // Use topScore as primary indicator (most relevant chunk quality)
    let confidence = topScore * 100;

    // Small bonuses for supporting signals
    const relevantCount = chunks.filter(
      c => normalizeScore(c.rerank_score ?? c.similarity) > 0.3
    ).length;
    if (relevantCount >= 3) confidence += 5;  // Multiple good sources

    const hybridCount = chunks.filter(c =>
      (c.vector_score || 0) > 0.1 && (c.keyword_score || 0) > 0.1
    ).length;
    if (hybridCount >= 2) confidence += 5;  // Vector + keyword agree

    if (citations.length >= 2) confidence += 5;  // Well-cited answer

    // Penalties for quality issues
    if (citations.length === 0) {
      confidence *= 0.5;  // No citations = major confidence drop
    }

    // Never claim perfect confidence (cap at 95)
    confidence = Math.min(Math.max(confidence, 0), 95);
    const roundedConfidence = Math.round(confidence);

    // Lower threshold since pg_trgm is available for better fuzzy matching
    // Threshold: 30% for relevant results, 0.12 for semantic similarity
    if (roundedConfidence < 30 || bestScore < 0.12) {
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

  /**
   * ENHANCED: Main query processing with intelligent version comparison
   */
  async processQuery(query: string, debug: boolean = true): Promise<QueryResult> {
    console.log('\n🔍 Starting query processing:', query);

    // Check if this might be a version comparison query
    if (this.isVersionComparisonQuery(query)) {
      console.log('🔄 Potential version comparison detected, attempting intelligent parsing...');

      const result = await this.versionComparisonService.processComparison(query);

      if (result.success) {
        const comparison = result.comparison;

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
${comparison.impact_analysis.high_impact_changes.slice(0, 5).map((c: string) => `- ${c}`).join('\n')}` : ''}

${comparison.impact_analysis?.medium_impact_changes && comparison.impact_analysis.medium_impact_changes.length > 0 ? `\n### 🔶 Medium Impact Changes
${comparison.impact_analysis.medium_impact_changes.slice(0, 3).map((c: string) => `- ${c}`).join('\n')}` : ''}

${comparison.impact_analysis?.low_impact_changes && comparison.impact_analysis.low_impact_changes.length > 0 ? `\n### 🔷 Low Impact Changes  
${comparison.impact_analysis.low_impact_changes.slice(0, 2).map((c: string) => `- ${c}`).join('\n')}` : ''}`;
        return {
          answer,
          citations: [],
          confidence: 100
        };
      } else if (result.error) {
        // If it looked like a comparison but failed, fall through to regular RAG
        console.log('⚠️ Version comparison parsing failed, falling back to RAG:', result.error);
      }
    }

    // Regular RAG query processing
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

    // MMR reranking - synchronous, no async
    let reranked: RetrievedChunk[] = [];
    try {
      // Filter chunks with embeddings for reranking
      const chunksWithEmbeddings = deduplicated.filter(c => c.embedding && c.embedding.length > 0);
      
      if (chunksWithEmbeddings.length > 0) {
        reranked = this.reranker.rerank(
          chunksWithEmbeddings as any,
          8,     // topK - legal sweet spot
          0.7    // lambda - relevance-focused for legal documents
        );

        if (debug) {
          console.log('\n[DEBUG] After MMR reranking:', reranked.length);
          if (reranked.length > 0) {
            console.log('Top 5 reranked:');
            reranked.slice(0, 5).forEach((c, i) => {
              console.log({
                idx: i,
                mmr_score: c.rerank_score?.toFixed(3),
                relevance: c.component_scores?.relevance?.toFixed(3),
                diversity: c.component_scores?.diversity?.toFixed(3),
                document_name: c.document_name,
                preview: c.content.substring(0, 80) + '...'
              });
            });
          }
        }
      } else {
        // Fallback if no embeddings available
        reranked = deduplicated.slice(0, 8);
        if (debug) console.log('⚠️ No embeddings available, using top results without reranking');
      }
    } catch (error) {
      console.error('MMR reranking error:', error);
      reranked = deduplicated.slice(0, 8);
    }

    const finalChunks = reranked.length > 0 ? reranked : deduplicated.slice(0, 8);

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