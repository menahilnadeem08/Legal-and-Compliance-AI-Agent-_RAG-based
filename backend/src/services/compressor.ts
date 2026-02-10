import { RetrievedChunk } from './retrieval';
import { pipelineLogger } from './logger';

export class ContextCompressor {
  compress(chunks: RetrievedChunk[], maxTokens: number = 3000): RetrievedChunk[] {
    pipelineLogger.info('COMPRESSION', 'Starting context compression', {
      inputChunks: chunks.length,
      maxTokens,
    });

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

    pipelineLogger.info('COMPRESSION_COMPLETE', 'Context compression completed', {
      outputChunks: compressed.length,
      totalTokens,
    });

    return compressed;
  }

  removeDuplicates(chunks: RetrievedChunk[]): RetrievedChunk[] {
    pipelineLogger.info('DEDUPLICATION', 'Starting duplicate removal', {
      inputChunks: chunks.length,
    });

    const seen = new Set<string>();
    const deduplicated = chunks.filter(chunk => {
      const key = chunk.content.substring(0, 100);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    pipelineLogger.info('DEDUPLICATION_COMPLETE', 'Duplicate removal completed', {
      outputChunks: deduplicated.length,
      removedDuplicates: chunks.length - deduplicated.length,
    });

    return deduplicated;
  }
}