import pool from '../config/database';
import { llm } from '../config/openai';
import { embeddings } from '../config/openai';
import { DocumentService } from './documentService';

export interface GapItem {
  topic: string;
  severity: 'critical' | 'important' | 'minor';
  recommendation: string;
}

export interface GapAnalysisResult {
  document_a: string;
  document_b: string;
  gaps_in_b: GapItem[];  // Covered in A, missing in B
  gaps_in_a: GapItem[];  // Covered in B, missing in A
  common_topics: string[];
  coverage_score_a: number;  // % of A's topics that are in B
  coverage_score_b: number;  // % of B's topics that are in A
  critical_gaps: number;
  llm_summary: string;
}

export class GapAnalysisService {
  private documentService: DocumentService;
  private similarityThreshold: number = 0.75;

  constructor() {
    this.documentService = new DocumentService();
  }

  /**
   * Compare two documents and identify coverage gaps
   */
  async analyzeGaps(
    documentA: string,
    documentB: string,
    adminId: number,
    focusArea?: string
  ): Promise<GapAnalysisResult> {
    // Find actual document names (fuzzy matching)
    const actualNameA = await this.documentService.findDocumentByName(documentA, adminId);
    const actualNameB = await this.documentService.findDocumentByName(documentB, adminId);

    if (!actualNameA) throw new Error(`Document "${documentA}" not found`);
    if (!actualNameB) throw new Error(`Document "${documentB}" not found`);
    if (actualNameA === actualNameB) {
      throw new Error('Cannot compare a document with itself');
    }

    // Get document IDs
    const docAQuery = await pool.query(
      `SELECT id FROM documents WHERE name = $1 AND admin_id = $2 AND is_active = true LIMIT 1`,
      [actualNameA, adminId]
    );
    const docBQuery = await pool.query(
      `SELECT id FROM documents WHERE name = $1 AND admin_id = $2 AND is_active = true LIMIT 1`,
      [actualNameB, adminId]
    );

    if (docAQuery.rows.length === 0) throw new Error(`Document "${actualNameA}" not found`);
    if (docBQuery.rows.length === 0) throw new Error(`Document "${actualNameB}" not found`);

    const docAId = docAQuery.rows[0].id;
    const docBId = docBQuery.rows[0].id;

    // Get all chunks for both documents
    const chunksA = await this.getDocumentChunks(docAId);
    const chunksB = await this.getDocumentChunks(docBId);

    if (chunksA.length === 0) throw new Error(`No content found in "${actualNameA}"`);
    if (chunksB.length === 0) throw new Error(`No content found in "${actualNameB}"`);

    // Extract topics via LLM
    const topicsA = await this.extractTopics(chunksA, focusArea);
    const topicsB = await this.extractTopics(chunksB, focusArea);

    // Perform semantic gap detection using embeddings
    const gapsInB = await this.findGaps(topicsA, chunksB, focusArea);
    const gapsInA = await this.findGaps(topicsB, chunksA, focusArea);

    // Find common topics
    const commonTopics = topicsA.filter(t => topicsB.includes(t));

    // Calculate coverage scores
    const coverageScoreA = topicsA.length > 0 
      ? Math.round(((topicsA.length - gapsInB.length) / topicsA.length) * 100)
      : 0;
    const coverageScoreB = topicsB.length > 0
      ? Math.round(((topicsB.length - gapsInA.length) / topicsB.length) * 100)
      : 0;

    // Count critical gaps
    const criticalGapsCount = [...gapsInA, ...gapsInB].filter(
      g => g.severity === 'critical'
    ).length;

    // Generate LLM summary with recommendations
    const llmSummary = await this.generateGapSummary(
      actualNameA,
      actualNameB,
      gapsInB,
      gapsInA,
      commonTopics
    );

    return {
      document_a: actualNameA,
      document_b: actualNameB,
      gaps_in_b: gapsInB,
      gaps_in_a: gapsInA,
      common_topics: commonTopics,
      coverage_score_a: coverageScoreA,
      coverage_score_b: coverageScoreB,
      critical_gaps: criticalGapsCount,
      llm_summary: llmSummary
    };
  }

  /**
   * Get all chunks for a document
   */
  private async getDocumentChunks(
    documentId: string
  ): Promise<Array<{ content: string; section_name?: string; page_number?: number }>> {
    const result = await pool.query(
      `SELECT c.content, c.section_name, c.page_number FROM chunks c
       WHERE c.document_id = $1
       ORDER BY c.chunk_index ASC`,
      [documentId]
    );

    return result.rows;
  }

  /**
   * Extract topics/obligations/clauses from document chunks via LLM
   */
  private async extractTopics(
    chunks: Array<{ content: string; section_name?: string }>,
    focusArea?: string
  ): Promise<string[]> {
    const chunkText = chunks
      .map(c => `${c.section_name ? `[${c.section_name}]` : ''} ${c.content}`)
      .join('\n\n')
      .substring(0, 3000); // Limit length for LLM

    const prompt = `You are a legal analyst. Analyze this document and extract a list of key topics, obligations, and clauses covered.
${focusArea ? `Focus on topics related to: ${focusArea}` : 'Extract all major topics.'}

Document:
${chunkText}

Return ONLY a valid JSON array of strings (topics). No other text.
Example: ["data retention", "termination clause", "liability limitation", "confidentiality"]

Return only the JSON array:`;

    try {
      const response = await llm.invoke(prompt);
      const content = response.content.toString().trim();
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const topics = JSON.parse(cleaned);

      if (!Array.isArray(topics)) {
        console.warn('LLM did not return array of topics, using fallback');
        return this.extractTopicsFallback(chunks);
      }

      return topics.filter((t: any) => typeof t === 'string' && t.length > 0).slice(0, 20);
    } catch (error) {
      console.warn('Failed to extract topics via LLM:', error);
      return this.extractTopicsFallback(chunks);
    }
  }

  /**
   * Fallback topic extraction if LLM fails
   */
  private extractTopicsFallback(
    chunks: Array<{ content: string; section_name?: string }>
  ): string[] {
    const topics = new Set<string>();

    // Extract section names as topics
    chunks.forEach(c => {
      if (c.section_name && c.section_name.length > 2) {
        topics.add(c.section_name.toLowerCase());
      }
    });

    // Extract common legal keywords
    const keywords = [
      'liability', 'damages', 'confidentiality', 'termination', 'payment',
      'warranty', 'indemnification', 'limitation', 'force majeure',
      'governing law', 'dispute', 'arbitration', 'insurance', 'compliance',
      'retention', 'privacy', 'data protection', 'notification', 'consent'
    ];

    for (const chunk of chunks) {
      const content = chunk.content.toLowerCase();
      for (const kw of keywords) {
        if (content.includes(kw)) {
          topics.add(kw);
        }
      }
    }

    return Array.from(topics).slice(0, 20);
  }

  /**
   * Semantic gap detection using embeddings
   * Find topics from source that are NOT covered in target
   */
  private async findGaps(
    sourceTopics: string[],
    targetChunks: Array<{ content: string }>,
    focusArea?: string
  ): Promise<GapItem[]> {
    const gaps: GapItem[] = [];

    // Generate embeddings for target chunks once
    const targetChunkEmbeddings: Array<{ content: string; embedding: number[] }> = [];

    for (const chunk of targetChunks) {
      try {
        const embedding = await embeddings.embedQuery(chunk.content.substring(0, 500));
        targetChunkEmbeddings.push({ content: chunk.content, embedding });
      } catch (error) {
        console.warn('Failed to embed chunk:', error);
      }
    }

    if (targetChunkEmbeddings.length === 0) {
      // If target has no embeddings, treat all topics as gaps (with low confidence)
      return sourceTopics.map(topic => ({
        topic,
        severity: focusArea && topic.toLowerCase().includes(focusArea.toLowerCase()) ? 'important' : 'minor',
        recommendation: `Review "${topic}" in the target document manually`
      }));
    }

    // For each topic, check if it's covered in target
    for (const topic of sourceTopics) {
      try {
        const topicEmbedding = await embeddings.embedQuery(topic);
        let bestSimilarity = 0;

        // Find highest similarity score
        for (const { embedding } of targetChunkEmbeddings) {
          const similarity = this.cosineSimilarity(topicEmbedding, embedding);
          bestSimilarity = Math.max(bestSimilarity, similarity);
        }

        // If no match above threshold, it's a gap
        if (bestSimilarity < this.similarityThreshold) {
          const isFocusTopic = !!(focusArea && topic.toLowerCase().includes(focusArea.toLowerCase()));
          const severity = this.determineSeverity(topic, isFocusTopic, bestSimilarity);

          gaps.push({
            topic,
            severity,
            recommendation: this.generateRecommendation(topic, severity)
          });
        }
      } catch (error) {
        console.warn(`Failed to process topic "${topic}":`, error);
      }
    }

    // Sort by severity
    const severityOrder = { critical: 0, important: 1, minor: 2 };
    gaps.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return gaps.slice(0, 15);
  }

  /**
   * Determine gap severity
   */
  private determineSeverity(
    topic: string,
    isFocusTopic: boolean,
    similarity: number
  ): 'critical' | 'important' | 'minor' {
    const criticalKeywords = [
      'liability', 'damages', 'indemnification', 'termination',
      'payment', 'confidentiality', 'data protection', 'privacy',
      'compliance', 'governing law'
    ];

    const topicLower = topic.toLowerCase();
    const isCriticalKeyword = criticalKeywords.some(kw => topicLower.includes(kw));

    if (isFocusTopic || isCriticalKeyword || similarity < 0.3) {
      return 'critical';
    }
    if (similarity < 0.5) {
      return 'important';
    }
    return 'minor';
  }

  /**
   * Generate recommendation for a gap
   */
  private generateRecommendation(topic: string, severity: string): string {
    if (severity === 'critical') {
      return `Add provisions for "${topic}" to align with best practices and reduce legal risk`;
    }
    if (severity === 'important') {
      return `Consider adding "${topic}" for better clarity and consistency`;
    }
    return `Optionally review and enhance "${topic}" coverage`;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0;

    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      magnitude1 += vec1[i] * vec1[i];
      magnitude2 += vec2[i] * vec2[i];
    }

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    if (magnitude1 === 0 || magnitude2 === 0) return 0;

    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Generate expert summary with recommendations
   */
  private async generateGapSummary(
    docNameA: string,
    docNameB: string,
    gapsInB: GapItem[],
    gapsInA: GapItem[],
    commonTopics: string[]
  ): Promise<string> {
    const gapsInBText = gapsInB.length > 0
      ? `Missing from ${docNameB}:\n${gapsInB.map(g => `- [${g.severity}] ${g.topic}: ${g.recommendation}`).join('\n')}`
      : `No major gaps identified in ${docNameB}.`;

    const gapsInAText = gapsInA.length > 0
      ? `Missing from ${docNameA}:\n${gapsInA.map(g => `- [${g.severity}] ${g.topic}: ${g.recommendation}`).join('\n')}`
      : `No major gaps identified in ${docNameA}.`;

    const commonText = commonTopics.length > 0
      ? `\nCommon topics (both documents): ${commonTopics.slice(0, 5).join(', ')}`
      : '';

    const prompt = `You are a legal compliance expert. Summarize the following gap analysis between two documents:

${gapsInBText}

${gapsInAText}

${commonText}

Provide a concise 2-3 sentence executive summary addressing:
1. Overall coverage alignment
2. Most critical missing elements
3. Key recommendation

Be direct and actionable.`;

    try {
      const response = await llm.invoke(prompt);
      return response.content.toString();
    } catch (error) {
      console.warn('Failed to generate gap summary:', error);
      return `${docNameA} and ${docNameB} have ${gapsInA.length + gapsInB.length} identified coverage gaps. Critical gaps: ${Math.max(
        gapsInB.filter(g => g.severity === 'critical').length,
        gapsInA.filter(g => g.severity === 'critical').length
      )}`;
    }
  }
}
