import { Request, Response } from 'express';
import { RetrievalService } from '../services/retrieval';
import { AnswerGenerator } from '../services/generator';
import { ContextCompressor } from '../services/compressor';

const retrievalService = new RetrievalService();
const answerGenerator = new AnswerGenerator();
const compressor = new ContextCompressor();

export const queryController = async (req: Request, res: Response) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const chunks = await retrievalService.hybridSearch(query, 10);
    const deduplicated = compressor.removeDuplicates(chunks);
    const compressed = compressor.compress(deduplicated, 3000);
    const result = await answerGenerator.generateAnswer(query, compressed);

    return res.json(result);
  } catch (error) {
    console.error('Query error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};