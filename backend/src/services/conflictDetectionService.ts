import pool from '../config/database';
import { llm } from '../config/openai';
import { embeddings } from '../config/openai';
import { Reranker } from '../utils/reranker';

export interface ConflictChunk {
  content: string;
  document_name: string;
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
  conflicts_found: number;
  conflicts: DetectedConflict[];
  summary: string;
  analysis_metadata: {
    chunks_analyzed: number;
    analysis_method: string;
    confidence: number;
  };
}

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
      console.error('Failed to parse conflict query:', error);
      return null;
    }
  }

  /**
   * Get relevant chunks from specific documents
   */
  async getDocumentChunks(
    documentNames: string[],
    topic?: string,
    chunksPerDoc: number = 10
  ): Promise<Map<string, ConflictChunk[]>> {
    const result = new Map<string, ConflictChunk[]>();

    for (const docName of documentNames) {
      // Find document (fuzzy match)
      const docQuery = await pool.query(
        `SELECT DISTINCT d.id, d.name, d.version
         FROM documents d
         WHERE d.is_latest = true 
         AND (LOWER(d.name) = LOWER($1) OR LOWER(d.name) LIKE LOWER($2))
         LIMIT 1`,
        [docName, `%${docName}%`]
      );

      if (docQuery.rows.length === 0) {
        console.warn(`Document not found: ${docName}`);
        continue;
      }

      const doc = docQuery.rows[0];

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

      result.set(doc.name, chunks.map(chunk => ({
        content: chunk.content,
        document_name: doc.name,
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
        console.error('LLM did not return an array');
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
      console.error('Failed to analyze conflicts:', error);
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
   * Main entry point: Detect conflicts between documents
   */
  async detectConflicts(query: string): Promise<ConflictAnalysisResult> {
    console.log('\n🔍 Starting conflict detection:', query);

    // Parse query to extract documents
    const parsed = await this.parseConflictQuery(query);
    
    if (!parsed || parsed.documents.length < 2) {
      throw new Error('Could not identify at least 2 documents to compare. Please specify document names clearly.');
    }

    console.log('📄 Documents to analyze:', parsed.documents);
    if (parsed.topic) console.log('🎯 Focus topic:', parsed.topic);

    // Get relevant chunks
    const chunksMap = await this.getDocumentChunks(
      parsed.documents,
      parsed.topic,
      15 // chunks per document
    );

    if (chunksMap.size < 2) {
      const foundDocs = Array.from(chunksMap.keys());
      const missingDocs = parsed.documents.filter(d => !foundDocs.includes(d));
      
      throw new Error(
        `Could not find all requested documents. Found: ${foundDocs.join(', ')}. ` +
        `Missing: ${missingDocs.join(', ')}`
      );
    }

    const totalChunks = Array.from(chunksMap.values()).reduce((sum, chunks) => sum + chunks.length, 0);
    console.log(`📊 Analyzing ${totalChunks} chunks across ${chunksMap.size} documents...`);

    // Analyze for conflicts
    const conflicts = await this.analyzeConflicts(chunksMap, parsed.topic);
    console.log(`⚠️ Found ${conflicts.length} conflicts`);

    // Generate summary
    const summary = await this.generateConflictSummary(conflicts);

    return {
      query,
      documents_analyzed: Array.from(chunksMap.keys()),
      conflicts_found: conflicts.length,
      conflicts: conflicts.sort((a, b) => {
        const severityOrder = { high: 0, medium: 1, low: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      }),
      summary,
      analysis_metadata: {
        chunks_analyzed: totalChunks,
        analysis_method: 'LLM-based semantic analysis',
        confidence: conflicts.length > 0 ? 85 : 95 // Higher confidence when no conflicts
      }
    };
  }

  /**
   * Batch conflict detection across all documents
   */
  async detectAllConflicts(topic?: string): Promise<ConflictAnalysisResult[]> {
    // Get all latest documents
    const docsResult = await pool.query(
      `SELECT DISTINCT name FROM documents WHERE is_latest = true ORDER BY name`
    );

    const documents = docsResult.rows.map(r => r.name);
    
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
          const result = await this.detectConflicts(query);
          if (result.conflicts_found > 0) {
            results.push(result);
          }
        } catch (error) {
          console.error(`Failed to compare ${documents[i]} and ${documents[j]}:`, error);
        }
      }
    }

    return results;
  }
}