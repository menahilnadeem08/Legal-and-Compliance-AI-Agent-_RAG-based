import { llm } from '../config/openai';

export class QueryRewriter {
  async rewrite(query: string): Promise<string[]> {
    const prompt = `You are a legal query expansion expert. Given a user query, generate 2-3 alternative phrasings that capture the same legal intent using different terminology.

Original query: "${query}"

Return only the alternative queries, one per line, without numbering or explanation.`;

    try {
      const response = await llm.invoke(prompt);

      const rewrittenQueries = response.content
        .toString()
        .split('\n')
        .filter(q => q.trim().length > 0)
        .slice(0, 3);
      console.log('Rewritten queries:', rewrittenQueries);
      return [query, ...rewrittenQueries];
    } catch (error) {
      console.error('Query rewriting error:', error);
      return [query];
    }
  }
}