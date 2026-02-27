import pool from '../config/database';
import { llm } from '../config/openai';
import { embeddings } from '../config/openai';
import { Reranker } from '../utils/reranker';
import logger from '../utils/logger';

export interface ConflictChunk {
  content: string;
  document_name: string;
  document_category?: string;
  document_version: string;
  section_name?: string;
  page_number?: number;
  chunk_index?: number;
}

export interface DetectedConflict {
  severity: 'high' | 'medium' | 'low';
  conflict_type: string;
  description: string;
  document_a: {
    name: string;
    version: string;
    section?: string;
    page?: number;
    excerpt: string;
  };
  document_b: {
    name: string;
    version: string;
    section?: string;
    page?: number;
    excerpt: string;
  };
  recommendation?: string;
}

export interface ConflictAnalysisResult {
  query: string;
  documents_analyzed: string[];
  documents_resolved?: Array<{ userTerm: string; actualFilename: string }>;
  conflicts_found: number;
  conflicts: DetectedConflict[];
  summary: string;
  analysis_metadata: {
    chunks_analyzed: number;
    analysis_method: string;
    confidence: number;
  };
}

const MIN_MATCH_CONFIDENCE = 0.3;
const CATEGORY_MATCH_SCORE = 0.8;

export class ConflictDetectionService {
  private reranker: Reranker;

  constructor() {
    this.reranker = new Reranker();
  }

  /**
   * Parse conflict query to extract document names
   */
  async parseConflictQuery(query: string): Promise<{
    documents: string[];
    topic?: string;
  } | null> {
    const prompt = `Extract document names from this conflict detection query.
Return ONLY a valid JSON object with: documents (array of document names), topic (optional conflict topic)

Query: "${query}"

Examples:
- "Does privacy policy conflict with employee handbook?" → {"documents": ["privacy policy", "employee handbook"], "topic": null}
- "Check conflicts between terms of service and data retention policy on data storage" → {"documents": ["terms of service", "data retention policy"], "topic": "data storage"}
- "Are there conflicts in policy A and regulation B?" → {"documents": ["policy A", "regulation B"], "topic": null}

Return ONLY the JSON object or null if you cannot extract document information.`;

    try {
      const response = await llm.invoke(prompt);
      const content = response.content.toString().trim();
      
      if (content.toLowerCase() === 'null') return null;

      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      
      if (!parsed.documents || !Array.isArray(parsed.documents) || parsed.documents.length < 2) {
        return null;
      }

      return {
        documents: parsed.documents,
        topic: parsed.topic || undefined
      };
    } catch (error) {
      logger.error('Failed to parse conflict query', { error });
      return null;
    }
  }

  /**
   * Normalize a string for matching: lowercase, trim, collapse spaces
   */
  private normalizeTerm(s: string): string {
    return (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Normalize filename for robust matching: collapse spaces, normalize spaces around parentheses
   * so "X (1).pdf" and "X(1).pdf" both match.
   */
  private normalizeFilenameForMatch(s: string): string {
    return (s || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\s*\(\s*/g, '(')
      .replace(/\s*\)\s*/g, ')');
  }

  /**
   * Tokenize into words (alphanumeric segments)
   */
  private tokenize(s: string): string[] {
    return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  }

  /**
   * Word overlap score: fraction of term words that appear in filename
   */
  private wordOverlapScore(term: string, filename: string): number {
    const termWords = new Set(this.tokenize(term));
    const fileWords = new Set(this.tokenize(filename));
    if (termWords.size === 0) return 0;
    let matches = 0;
    for (const w of termWords) {
      if (fileWords.has(w)) matches++;
    }
    return matches / termWords.size;
  }

  /**
   * Resolve user-provided document names to actual filenames using exact, contains, word overlap, and category matching.
   * Returns resolved map, unresolved list, and resolutionLog for display.
   */
  async resolveDocumentNames(
    userProvidedNames: string[],
    adminId?: number
  ): Promise<{
    resolvedMap: Map<string, string>;
    unresolved: string[];
    resolutionLog: Array<{ userTerm: string; actualFilename: string }>;
    resolvedFilenames: string[];
  }> {
    const resolutionLog: Array<{ userTerm: string; actualFilename: string }> = [];
    const unresolved: string[] = [];
    const resolvedMap = new Map<string, string>();

    let sql = `SELECT id, filename, category FROM documents WHERE is_active = true`;
    const params: (string | number)[] = [];
    if (adminId != null) {
      sql += ` AND admin_id = $1`;
      params.push(adminId);
    }
    const result = await pool.query(sql, params);
    const allDocs: { id: string; filename: string; category: string | null }[] = result.rows;

    if (allDocs.length === 0) {
      userProvidedNames.forEach(term => unresolved.push(term));
      return { resolvedMap, unresolved, resolutionLog, resolvedFilenames: [] };
    }

    for (const userTerm of userProvidedNames) {
      const normalized = this.normalizeTerm(userTerm);
      let bestScore = 0;
      let bestDoc: { filename: string } | null = null;

      for (const doc of allDocs) {
        const fileLower = this.normalizeTerm(doc.filename);
        const fileNorm = this.normalizeFilenameForMatch(doc.filename);
        const termNorm = this.normalizeFilenameForMatch(userTerm);
        const catLower = doc.category ? this.normalizeTerm(doc.category) : '';

        // 1. Exact match (including filename with parentheses / spacing variants) — must always win over word-overlap
        if (
          fileLower === normalized ||
          catLower === normalized ||
          fileNorm === termNorm
        ) {
          // Use score 2 so exact match beats word-overlap (1.0) and contains (0.7)
          if (2 > bestScore) {
            bestScore = 2;
            bestDoc = doc;
          }
          continue;
        }

        // 2. Contains: filename contains term or term contains significant part of filename
        const fileContainsTerm = fileLower.includes(normalized) || fileNorm.includes(termNorm);
        const termContainsFile = (normalized.includes(fileLower) || termNorm.includes(fileNorm)) && fileLower.length >= 2;
        if (fileContainsTerm || termContainsFile) {
          const score = 0.7;
          if (score > bestScore) {
            bestScore = score;
            bestDoc = doc;
          }
        }

        // 3. Word overlap
        const overlapScore = this.wordOverlapScore(userTerm, doc.filename);
        if (overlapScore > bestScore) {
          bestScore = overlapScore;
          bestDoc = doc;
        }

        // 4. Category match: category equals or contains normalized user term
        if (catLower && (catLower === normalized || catLower.includes(normalized) || normalized.includes(catLower))) {
          if (CATEGORY_MATCH_SCORE > bestScore) {
            bestScore = CATEGORY_MATCH_SCORE;
            bestDoc = doc;
          }
        }
      }

      if (bestDoc && bestScore >= MIN_MATCH_CONFIDENCE) {
        resolvedMap.set(userTerm, bestDoc.filename);
        resolutionLog.push({ userTerm, actualFilename: bestDoc.filename });
      } else {
        unresolved.push(userTerm);
      }
    }

    const resolvedFilenames = resolutionLog.map(r => r.actualFilename);
    return { resolvedMap, unresolved, resolutionLog, resolvedFilenames };
  }

  /**
   * Get relevant chunks from specific documents
   * Lookup strategy: Try category first, fall back to filename
   */
  async getDocumentChunks(
    documentNames: string[],
    topic?: string,
    chunksPerDoc: number = 10,
    adminId?: number
  ): Promise<Map<string, ConflictChunk[]>> {
    const result = new Map<string, ConflictChunk[]>();

    for (const docName of documentNames) {
      let doc: any;
      
      // Step 1: Try category lookup first
      const categoryQuery = await pool.query(
        `SELECT DISTINCT d.id, d.filename, d.category, d.version
         FROM documents d
         WHERE d.is_active = true 
         AND d.admin_id = $1
         AND LOWER(d.category) = LOWER($2)
         LIMIT 1`,
        [adminId, docName]
      );
      
      if (categoryQuery.rows.length > 0) {
        doc = categoryQuery.rows[0];
        logger.info('Document found by category', { docName, category: doc.category, filename: doc.filename });
      } else {
        // Step 2: Fall back to filename lookup
        let docQuery: any;
        if (adminId) {
          docQuery = await pool.query(
            `SELECT DISTINCT d.id, d.filename, d.category, d.version
             FROM documents d
             WHERE d.is_active = true 
             AND d.admin_id = $3
             AND (LOWER(d.filename) = LOWER($1) OR LOWER(d.filename) LIKE LOWER($2))
             LIMIT 1`,
            [docName, `%${docName}%`, adminId]
          );
        } else {
          docQuery = await pool.query(
            `SELECT DISTINCT d.id, d.filename, d.category, d.version
             FROM documents d
             WHERE d.is_active = true 
             AND (LOWER(d.filename) = LOWER($1) OR LOWER(d.filename) LIKE LOWER($2))
             LIMIT 1`,
            [docName, `%${docName}%`]
          );
        }
        
        if (docQuery.rows.length > 0) {
          doc = docQuery.rows[0];
          logger.info('Document found by filename fallback', { docName, filename: doc.filename, category: doc.category });
        } else {
          logger.warn('Document not found by category or filename', { docName });
          continue;
        }
      }

      let chunks: any[];

      if (topic) {
        // Topic-based retrieval using embeddings
        const topicEmbedding = await embeddings.embedQuery(topic);
        
        chunks = (await pool.query(
          `SELECT c.content, c.section_name, c.page_number, c.chunk_index,
                  1 - (c.embedding <=> $1::vector) as similarity
           FROM chunks c
           WHERE c.document_id = $2
           ORDER BY c.embedding <=> $1::vector
           LIMIT $3`,
          [JSON.stringify(topicEmbedding), doc.id, chunksPerDoc]
        )).rows;
      } else {
        // Get all chunks (or top N by importance)
        chunks = (await pool.query(
          `SELECT c.content, c.section_name, c.page_number, c.chunk_index
           FROM chunks c
           WHERE c.document_id = $1
           ORDER BY c.chunk_index
           LIMIT $2`,
          [doc.id, chunksPerDoc]
        )).rows;
      }

      result.set(doc.category || doc.filename, chunks.map(chunk => ({
        content: chunk.content,
        document_name: doc.filename,
        document_category: doc.category,
        document_version: doc.version,
        section_name: chunk.section_name,
        page_number: chunk.page_number,
        chunk_index: chunk.chunk_index
      })));
    }

    return result;
  }

  /**
   * Analyze chunks for conflicts using LLM
   */
  async analyzeConflicts(
    chunksMap: Map<string, ConflictChunk[]>,
    topic?: string
  ): Promise<DetectedConflict[]> {
    const documents = Array.from(chunksMap.keys());
    
    if (documents.length < 2) {
      return [];
    }

    // Build context from chunks
    const contextParts: string[] = [];
    
    for (const [docName, chunks] of chunksMap.entries()) {
      contextParts.push(`\n=== ${docName} ===`);
      chunks.forEach((chunk, idx) => {
        const location = chunk.section_name 
          ? `Section: ${chunk.section_name}`
          : chunk.page_number 
            ? `Page: ${chunk.page_number}`
            : `Chunk: ${idx + 1}`;
        
        contextParts.push(`[${location}]
${chunk.content}`);
      });
    }

    const context = contextParts.join('\n\n');

    const prompt = `You are a legal and compliance expert analyzing documents for conflicts and contradictions.

${topic ? `Focus Area: ${topic}\n` : ''}
Documents to Analyze:
${context}

TASK: Identify all conflicts, contradictions, or inconsistencies between these documents.

A conflict exists when:
1. Documents make contradictory statements about the same topic
2. Requirements or obligations are incompatible
3. Timelines, deadlines, or procedures differ
4. Permitted vs prohibited actions contradict
5. Definitions of the same term differ significantly

For EACH conflict found, provide:
1. Severity: "high" (legal risk/compliance violation), "medium" (operational issue), or "low" (minor inconsistency)
2. Conflict Type: (e.g., "contradictory requirements", "incompatible timelines", "definitional conflict")
3. Description: Clear explanation of the conflict
4. Document A details: name, excerpt (exact quote, max 100 words)
5. Document B details: name, excerpt (exact quote, max 100 words)
6. Recommendation: How to resolve it

Return ONLY a valid JSON array of conflicts:
[
  {
    "severity": "high",
    "conflict_type": "contradictory requirements",
    "description": "...",
    "document_a": {
      "name": "...",
      "excerpt": "..."
    },
    "document_b": {
      "name": "...",
      "excerpt": "..."
    },
    "recommendation": "..."
  }
]

If NO conflicts found, return: []

IMPORTANT: Return ONLY the JSON array, nothing else.`;

    try {
      const response = await llm.invoke(prompt);
      const content = response.content.toString().trim();
      
      // Clean markdown formatting
      const cleaned = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const conflicts = JSON.parse(cleaned);

      if (!Array.isArray(conflicts)) {
        logger.error('LLM did not return an array');
        return [];
      }

      // Enrich conflicts with additional metadata from chunks
      return conflicts.map((conflict: any) => {
        // Find matching chunks for more context
        const docAChunks = chunksMap.get(conflict.document_a.name) || [];
        const docBChunks = chunksMap.get(conflict.document_b.name) || [];

        const docAChunk = docAChunks.find(c => 
          conflict.document_a.excerpt && c.content.includes(conflict.document_a.excerpt.substring(0, 50))
        );
        const docBChunk = docBChunks.find(c => 
          conflict.document_b.excerpt && c.content.includes(conflict.document_b.excerpt.substring(0, 50))
        );

        return {
          severity: conflict.severity || 'medium',
          conflict_type: conflict.conflict_type || 'unspecified',
          description: conflict.description || '',
          document_a: {
            name: conflict.document_a.name || documents[0],
            version: docAChunk?.document_version || 'latest',
            section: docAChunk?.section_name,
            page: docAChunk?.page_number,
            excerpt: conflict.document_a.excerpt || ''
          },
          document_b: {
            name: conflict.document_b.name || documents[1],
            version: docBChunk?.document_version || 'latest',
            section: docBChunk?.section_name,
            page: docBChunk?.page_number,
            excerpt: conflict.document_b.excerpt || ''
          },
          recommendation: conflict.recommendation
        };
      });
    } catch (error) {
      logger.error('Failed to analyze conflicts', { error });
      return [];
    }
  }

  /**
   * Generate executive summary of conflicts
   */
  async generateConflictSummary(conflicts: DetectedConflict[]): Promise<string> {
    if (conflicts.length === 0) {
      return '✅ No conflicts detected between the analyzed documents. The policies appear to be consistent.';
    }

    const highCount = conflicts.filter(c => c.severity === 'high').length;
    const mediumCount = conflicts.filter(c => c.severity === 'medium').length;
    const lowCount = conflicts.filter(c => c.severity === 'low').length;

    const conflictsByType = new Map<string, number>();
    conflicts.forEach(c => {
      conflictsByType.set(c.conflict_type, (conflictsByType.get(c.conflict_type) || 0) + 1);
    });

    const topTypes = Array.from(conflictsByType.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, count]) => `${type} (${count})`)
      .join(', ');

    return `⚠️ **${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''} detected**

**Severity Breakdown:**
${highCount > 0 ? `- 🔴 High Priority: ${highCount}` : ''}
${mediumCount > 0 ? `\n- 🟡 Medium Priority: ${mediumCount}` : ''}
${lowCount > 0 ? `\n- 🟢 Low Priority: ${lowCount}` : ''}

**Common Conflict Types:** ${topTypes}

${highCount > 0 ? '\n⚠️ **CRITICAL**: High-priority conflicts require immediate attention to ensure compliance.' : ''}`;
  }

  /**
   * Main entry point: Detect conflicts between documents or categories
   * Can be called with either a query string OR categories array
   */
  async detectConflicts(
    queryOrCategories: string | string[],
    adminId?: number,
    detail?: boolean
  ): Promise<any> {
    // Handle categories array (2+ categories)
    if (Array.isArray(queryOrCategories)) {
      return this.detectConflictsBetweenCategories(queryOrCategories, adminId, detail);
    }

    // Handle query string (original behavior)
    const query = queryOrCategories;
    logger.info('Starting conflict detection', { query });

    // Parse query to extract documents
    const parsed = await this.parseConflictQuery(query);
    
    if (!parsed || parsed.documents.length < 2) {
      throw new Error('Could not identify at least 2 documents to compare. Please specify document names clearly.');
    }

    logger.info('Documents to analyze', { documents: parsed.documents });
    if (parsed.topic) logger.info('Focus topic', { topic: parsed.topic });

    // Resolve user-provided names to actual filenames (fuzzy + category)
    const { resolutionLog, unresolved, resolvedFilenames } = await this.resolveDocumentNames(
      parsed.documents,
      adminId
    );

    if (unresolved.length > 0) {
      const suggestResult = await pool.query(
        `SELECT filename FROM documents WHERE is_active = true ${adminId != null ? 'AND admin_id = $1' : ''} ORDER BY filename LIMIT 15`,
        adminId != null ? [adminId] : []
      );
      const suggestions = suggestResult.rows.map((r: { filename: string }) => r.filename).join(', ') || 'No documents found';
      throw new Error(
        `Could not match "${unresolved.join('", "')}". Did you mean: ${suggestions}?`
      );
    }

    for (const { userTerm, actualFilename } of resolutionLog) {
      logger.info("Interpreted user term as document", { userTerm, actualFilename });
    }

    // Require at least 2 distinct documents (same file resolved twice is invalid)
    const distinctFilenames = [...new Set(resolvedFilenames)];
    if (distinctFilenames.length < 2) {
      throw new Error(
        `Conflict detection requires two different documents. Both terms resolved to the same file: "${distinctFilenames[0] || 'unknown'}". ` +
        'Please specify two distinct document names (e.g. "X.pdf" and "Y.pdf").'
      );
    }

    // Get relevant chunks using resolved actual filenames
    const chunksMap = await this.getDocumentChunks(
      distinctFilenames,
      parsed.topic,
      15, // chunks per document
      adminId
    );

    if (chunksMap.size < 2) {
      const foundDocs = Array.from(chunksMap.keys());
      const missingDocs = resolvedFilenames.filter(d => !foundDocs.includes(d));

      throw new Error(
        `Could not find all requested documents. Found: ${foundDocs.join(', ')}. ` +
        `Missing: ${missingDocs.join(', ')}`
      );
    }

    const totalChunks = Array.from(chunksMap.values()).reduce((sum, chunks) => sum + chunks.length, 0);
    logger.info('Analyzing chunks', { totalChunks, documentCount: chunksMap.size });

    // Analyze for conflicts
    const conflicts = await this.analyzeConflicts(chunksMap, parsed.topic);
    logger.info('Conflicts found', { count: conflicts.length });

    // Generate summary
    const summary = await this.generateConflictSummary(conflicts);

    // Calculate top-level confidence (agent reads result.confidence)
    let topLevelConfidence: number;
    if (totalChunks === 0) {
      topLevelConfidence = 20;
    } else {
      const avgChunkSimilarity = 0.6; // Default: no per-chunk similarity in conflict detection
      const conflictsWithBothExcerpts = conflicts.filter(
        c => (c.document_a?.excerpt?.trim().length || 0) > 10 && (c.document_b?.excerpt?.trim().length || 0) > 10
      ).length;
      if (conflicts.length > 0) {
        const evidenceBonus = conflicts.length > 0 ? (conflictsWithBothExcerpts / conflicts.length) * 10 : 0;
        topLevelConfidence = Math.min(avgChunkSimilarity * 100 + evidenceBonus, 85);
        if (avgChunkSimilarity < 0.2) topLevelConfidence = Math.min(topLevelConfidence, 40);
      } else {
        topLevelConfidence = Math.min(avgChunkSimilarity * 100, 90);
      }
    }

    return {
      query,
      documents_analyzed: Array.from(chunksMap.keys()),
      documents_resolved: resolutionLog.length > 0 ? resolutionLog : undefined,
      conflicts_found: conflicts.length,
      conflicts: conflicts.sort((a, b) => {
        const severityOrder = { high: 0, medium: 1, low: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      }),
      summary,
      confidence: topLevelConfidence,
      analysis_metadata: {
        chunks_analyzed: totalChunks,
        analysis_method: 'LLM-based semantic analysis',
        confidence: topLevelConfidence
      }
    };
  }

  /**
   * Batch conflict detection across all documents
   */
  async detectAllConflicts(topic?: string, adminId?: number): Promise<ConflictAnalysisResult[]> {
    // Get all latest documents for this admin (or all if adminId not provided)
    const docsResult = await pool.query(
      `SELECT DISTINCT filename FROM documents WHERE is_active = true AND (admin_id = $1 OR $1 IS NULL) ORDER BY filename`,
      [adminId ?? null]
    );

    const documents = docsResult.rows.map((r: { filename: string }) => r.filename);

    if (documents.length < 2) {
      throw new Error('Need at least 2 documents for conflict detection');
    }

    const results: ConflictAnalysisResult[] = [];

    // Compare each pair of documents
    for (let i = 0; i < documents.length; i++) {
      for (let j = i + 1; j < documents.length; j++) {
        const query = topic
          ? `Check conflicts between ${documents[i]} and ${documents[j]} regarding ${topic}`
          : `Check conflicts between ${documents[i]} and ${documents[j]}`;

        try {
          const result = await this.detectConflicts(query, adminId);
          if (result.conflicts_found > 0) {
            results.push(result);
          }
        } catch (error) {
          logger.error('Failed to compare documents', { docA: documents[i], docB: documents[j], error });
        }
      }
    }

    // Deduplicate by canonical pair key (A|B === B|A)
    const seen = new Set<string>();
    const deduplicated: ConflictAnalysisResult[] = [];
    for (const result of results) {
      const docs = result.documents_analyzed ?? [];
      const key = docs.slice().sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      deduplicated.push(result);
    }

    return deduplicated;
  }

  /**
   * Detect conflicts between multiple categories (N-way analysis)
   * Runs all pairs (i < j) and merges results
   */
  private async detectConflictsBetweenCategories(
    categories: string[],
    adminId?: number,
    detail?: boolean
  ): Promise<{
    categories_analyzed: string[];
    total_conflicts: number;
    conflicts_by_pair: Array<{ pair: string; conflicts: DetectedConflict[] }>;
    all_conflicts: DetectedConflict[];
    summary: string;
    analysis_metadata: {
      chunks_analyzed: number;
      analysis_method: string;
      confidence: number;
    };
  }> {
    if (categories.length < 2) {
      throw new Error('Need at least 2 categories for conflict detection');
    }

    logger.info('Starting multi-category conflict detection', { categories, count: categories.length });

    const conflictsByPair: Array<{ pair: string; conflicts: DetectedConflict[] }> = [];
    const allConflicts: DetectedConflict[] = [];
    let totalChunks = 0;

    // Compare all pairs (i < j)
    for (let i = 0; i < categories.length; i++) {
      for (let j = i + 1; j < categories.length; j++) {
        const cat1 = categories[i];
        const cat2 = categories[j];
        const pairKey = `${cat1} vs ${cat2}`;

        try {
          logger.debug('Analyzing category pair', { pair: pairKey });

          // Get chunks from both categories
          const chunksMap = await this.getDocumentChunks([cat1, cat2], undefined, 15, adminId);

          if (chunksMap.size < 2) {
            logger.warn('Could not get chunks for pair', { pair: pairKey });
            continue;
          }

          // Analyze for conflicts
          const conflicts = await this.analyzeConflicts(chunksMap);
          logger.debug('Conflicts found for pair', { pair: pairKey, count: conflicts.length });

          if (conflicts.length > 0) {
            conflictsByPair.push({
              pair: pairKey,
              conflicts: conflicts.sort((a, b) => {
                const severityOrder = { high: 0, medium: 1, low: 2 };
                return severityOrder[a.severity] - severityOrder[b.severity];
              })
            });

            allConflicts.push(...conflicts);
          }

          totalChunks += Array.from(chunksMap.values()).reduce((sum, chunks) => sum + chunks.length, 0);
        } catch (error) {
          logger.error('Failed to analyze category pair', { pair: pairKey, error });
        }
      }
    }

    // Deduplicate all conflicts by description
    const uniqueConflicts = Array.from(
      new Map(allConflicts.map(c => [c.description, c])).values()
    ).sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    // Generate summary
    const highCount = uniqueConflicts.filter(c => c.severity === 'high').length;
    const mediumCount = uniqueConflicts.filter(c => c.severity === 'medium').length;
    const lowCount = uniqueConflicts.filter(c => c.severity === 'low').length;

    const summary = uniqueConflicts.length === 0
      ? '✅ No conflicts detected across the analyzed categories.'
      : `⚠️ **${uniqueConflicts.length} conflict${uniqueConflicts.length > 1 ? 's' : ''} detected** across ${categories.length} categories. 🔴 High: ${highCount}, 🟡 Medium: ${mediumCount}, 🟢 Low: ${lowCount}`;

    // Calculate top-level confidence (agent reads result.confidence)
    const avgChunkSimilarity = 0.6;
    const conflictsWithBothExcerpts = uniqueConflicts.filter(
      c => (c.document_a?.excerpt?.trim().length || 0) > 10 && (c.document_b?.excerpt?.trim().length || 0) > 10
    ).length;
    let topLevelConfidence: number;
    if (totalChunks === 0) {
      topLevelConfidence = 20;
    } else if (uniqueConflicts.length > 0) {
      const evidenceBonus = (conflictsWithBothExcerpts / uniqueConflicts.length) * 10;
      topLevelConfidence = Math.min(avgChunkSimilarity * 100 + evidenceBonus, 85);
      if (avgChunkSimilarity < 0.2) topLevelConfidence = Math.min(topLevelConfidence, 40);
    } else {
      topLevelConfidence = Math.min(avgChunkSimilarity * 100, 90);
    }

    return {
      categories_analyzed: categories,
      total_conflicts: uniqueConflicts.length,
      conflicts_by_pair: conflictsByPair,
      all_conflicts: uniqueConflicts,
      summary,
      confidence: topLevelConfidence,
      analysis_metadata: {
        chunks_analyzed: totalChunks,
        analysis_method: 'LLM-based multi-category analysis',
        confidence: topLevelConfidence
      }
    };
  }
}