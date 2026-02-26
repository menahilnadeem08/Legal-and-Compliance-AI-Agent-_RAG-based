import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';
import dotenv from 'dotenv';

dotenv.config();

/** Embedding size must match DB chunks.embedding column (vector(1536)). */
export const EMBEDDING_DIMENSIONS = 1536;

export const embeddings = new OpenAIEmbeddings({
  modelName: 'text-embedding-3-small',
  model: 'text-embedding-3-small', // some LangChain versions use this
  dimensions: EMBEDDING_DIMENSIONS,
});

export const llm = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0,
});
