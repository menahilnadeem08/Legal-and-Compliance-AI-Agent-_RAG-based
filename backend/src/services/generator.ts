import { llm } from '../config/openai';
import { RetrievedChunk } from './retrieval';
import { QueryResult, Citation } from '../types';
import { pipelineLogger } from './logger';

export class AnswerGenerator {
  private isGreeting(text: string): boolean {
    const greetings = /^(hi|hello|hey|greetings|hola|bonjour|good morning|good afternoon|good evening)\s*[!?.]?$/i;
    return greetings.test(text.trim());
  }

  async generateAnswer(query: string, chunks: RetrievedChunk[]): Promise<QueryResult> {
    // Handle greetings first (no retrieval needed)
    if (this.isGreeting(query)) {
      return {
        answer: 'Hello! I\'m here to help with legal and compliance questions. Ask me about policies, regulations, contracts, or any compliance-related matters.',
        citations: [],
        confidence: 100,
      };
    }

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
    pipelineLogger.info('GENERATION', 'Starting LLM answer generation', {
      query,
      contextsCount: chunks.length,
    });

    const response = await llm.invoke(prompt);
    const answer = response.content.toString();

    // Check if answer is a fallback/generic response (no citations needed)
    const fallbackPhrases = [
      'insufficient information',
      'no information',
      'cannot find',
      'don\'t know',
      'not available in',
      'i cannot provide',
      'i cannot answer',
    ];
    
    const isGenericGreeting = /^(hi|hello|hey|greetings)/i.test(answer.trim());
    const isFallbackAnswer = fallbackPhrases.some(phrase => answer.toLowerCase().includes(phrase));

    // If fallback or greeting, return without citations
    if (isFallbackAnswer || isGenericGreeting) {
      pipelineLogger.warn('GENERATION_FALLBACK', 'LLM returned fallback/generic response', {
        isFallback: isFallbackAnswer,
        isGreeting: isGenericGreeting,
      });

      return {
        answer,
        citations: [],
        confidence: 0,
      };
    }

    // Extract citations only for substantive answers
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
      pipelineLogger.warn('GENERATION_SKIPPED', 'Answer generation skipped due to low confidence', {
        confidence: roundedConfidence,
      });

      return {
        answer: 'Insufficient information in the knowledge base to answer this query.',
        citations: [],
        confidence: roundedConfidence,
      };
    }

    pipelineLogger.info('GENERATION_COMPLETE', 'LLM answer generation completed', {
      confidenceScore: roundedConfidence,
      citationCount: citations.length,
      answerLength: answer.length,
    });

    return {
      answer,
      citations,
      confidence: roundedConfidence,
    };
  }
}