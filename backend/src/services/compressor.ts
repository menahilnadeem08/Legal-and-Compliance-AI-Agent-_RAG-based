import { RetrievedChunk } from './retrieval';

export class ContextCompressor {
  compress(chunks: RetrievedChunk[], maxTokens: number = 3000): RetrievedChunk[] {
    let totalTokens = 0;
    const compressed: RetrievedChunk[] = [];

    for (const chunk of chunks) {
      const estimatedTokens = Math.ceil(chunk.content.length / 4);
      
      if (totalTokens + estimatedTokens > maxTokens) {
        break;
      }

      compressed.push(chunk);
      totalTokens += estimatedTokens;
    }

    return compressed;
  }

  removeDuplicates(chunks: RetrievedChunk[]): RetrievedChunk[] {
    const seen = new Set<string>();
    return chunks.filter(chunk => {
      const key = chunk.content.substring(0, 100);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}