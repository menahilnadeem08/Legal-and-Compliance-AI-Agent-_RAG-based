import { Request, Response } from 'express';
import { RetrievalService } from '../services/retrieval';
import { AnswerGenerator } from '../services/generator';
import { ContextCompressor } from '../services/compressor';
import { pipelineLogger } from '../services/logger';

const retrievalService = new RetrievalService();
const answerGenerator = new AnswerGenerator();
const compressor = new ContextCompressor();

export const queryStreamController = async (req: Request, res: Response) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Set headers for Server-Sent Events streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Function to send a log entry as SSE
    const sendLog = (log: any) => {
      res.write(`data: ${JSON.stringify({ type: 'log', log })}\n\n`);
    };

    // Function to send the final answer
    const sendAnswer = (answer: any) => {
      res.write(`data: ${JSON.stringify({ type: 'answer', answer })}\n\n`);
    };

    // Function to send completion
    const sendComplete = () => {
      res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
    };

    // Listen to pipeline logger events
    const logListener = (logEntry: any) => {
      sendLog(logEntry);
    };

    pipelineLogger.on('log', logListener);

    // Start processing
    pipelineLogger.info('QUERY_START', 'Processing query', { query });

    try {
      // Stage 1: Retrieval
      pipelineLogger.info('RETRIEVAL', 'Searching documents for relevant content...');
      const chunks = await retrievalService.hybridSearch(query, 10);
      pipelineLogger.info('RETRIEVAL_COMPLETE', `Retrieved ${chunks.length} chunks`, {
        count: chunks.length,
      });

      // Stage 2: Deduplication
      pipelineLogger.info('DEDUPLICATION', 'Removing duplicate content...');
      const deduplicated = compressor.removeDuplicates(chunks);
      pipelineLogger.info('DEDUPLICATION_COMPLETE', `Deduplicated to ${deduplicated.length} chunks`, {
        originalCount: chunks.length,
        finalCount: deduplicated.length,
      });

      // Stage 3: Compression
      pipelineLogger.info('COMPRESSION', 'Compressing context for efficiency...');
      const compressed = compressor.compress(deduplicated, 3000);
      pipelineLogger.info('COMPRESSION_COMPLETE', 'Context compressed successfully', {
        tokenLimit: 3000,
      });

      // Stage 4: Answer Generation
      pipelineLogger.info('GENERATION', 'Generating answer using LLM...');
      const result = await answerGenerator.generateAnswer(query, compressed);
      pipelineLogger.info('GENERATION_COMPLETE', 'Answer generated successfully');

      // Send the final answer
      sendAnswer(result);

      // Mark as complete
      pipelineLogger.info('QUERY_COMPLETE', 'Processing finished');
      sendComplete();

      // Remove listener and close connection
      pipelineLogger.removeListener('log', logListener);
      res.end();
    } catch (error) {
      pipelineLogger.error('QUERY_ERROR', 'Error during query processing', error);
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        })}\n\n`
      );
      pipelineLogger.removeListener('log', logListener);
      res.end();
    }
  } catch (error) {
    console.error('Stream setup error:', error);
    res.status(500).json({ error: 'Failed to set up stream' });
  }
};
