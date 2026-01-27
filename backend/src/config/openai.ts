import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';
import dotenv from 'dotenv';

dotenv.config();

export const embeddings = new OpenAIEmbeddings({
  modelName: 'text-embedding-3-small',
});

export const llm = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0,
});
