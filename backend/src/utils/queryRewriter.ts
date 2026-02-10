import { llm } from '../config/openai';
import { pipelineLogger } from '../services/logger';

export class QueryRewriter {
  async rewrite(query: string): Promise<string[]> {
    const prompt = `You are a legal query expansion expert. Given a user query, generate 2-3 alternative phrasings that capture the same legal intent using different terminology and keep the meaning same.

Original query: "${query}"

Return only the alternative queries, one per line, without numbering or explanation.`;

    try {
      pipelineLogger.debug('QUERY_REWRITE_START', 'Rewriting user query with LLM', {
        originalQuery: query,
      });

      const response = await llm.invoke(prompt);

      const rewrittenQueries = response.content
        .toString()
        .split('\n')
        .filter(q => q.trim().length > 0)
        .slice(0, 3);

      const allQueries = [query, ...rewrittenQueries];

      pipelineLogger.debug('QUERY_REWRITE_VARIANTS', 'Query variations generated', {
        variationCount: allQueries.length,
        queries: allQueries,
      });

      return allQueries;
    } catch (error) {
      console.error('Query rewriting error:', error);
      pipelineLogger.warn('QUERY_REWRITE_FAILED', 'Query rewriting failed, using original query', {
        error: String(error),
      });
      return [query];
    }
  }
}