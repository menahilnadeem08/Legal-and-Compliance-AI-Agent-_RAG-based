import { llm } from '../config/openai';
import { RetrievedChunk } from './retrieval';
import { QueryResult, Citation } from '../types';

export class AnswerGenerator {
  async generateAnswer(query: string, chunks: RetrievedChunk[]): Promise<QueryResult> {
    // Check if we have relevant context
    // Lowered similarity threshold so reasonably relevant results are considered
    if (chunks.length === 0 || chunks[0].similarity < 0.2) {
      return {
        answer: 'Insufficient information in the knowledge base to answer this query.',
        citations: [],
        confidence: 0,
      };
    }

    // Build context from chunks
    const context = chunks
      .map((chunk, idx) => `[${idx + 1}] ${chunk.content}\nSource: ${chunk.document_name}`)
      .join('\n\n');

    // Create prompt
    const prompt = `You are a legal and compliance assistant. Answer the question based ONLY on the provided context.

Rules:
- Only use information from the context below
- Cite sources using [number] references
- If the context doesn't contain enough information, say "Insufficient information in the knowledge base"
- Be precise and accurate
- Always include document names in your answer

Context:
${context}

Question: ${query}

Answer:`;

    // Generate answer
    const response = await llm.invoke(prompt);
    const answer = response.content.toString();

    // Extract citations
    const citations: Citation[] = chunks.map(chunk => ({
      document_name: chunk.document_name,
      section: chunk.section_name || 'N/A',
      page: chunk.page_number,
      content: chunk.content.substring(0, 150) + '...',
    }));

    // Calculate confidence based on similarity scores
    const avgSimilarity = chunks.reduce((sum, c) => sum + c.similarity, 0) / chunks.length;
    const confidence = Math.min(avgSimilarity * 100, 100);
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
}