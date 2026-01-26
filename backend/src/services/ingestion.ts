import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';
import { embeddings } from '../config/openai';
import { DocumentParser } from './documentParser';
import { Document, Chunk } from '../types';

export class IngestionService {
  private parser: DocumentParser;

  constructor() {
    this.parser = new DocumentParser();
  }

  async ingestDocument(
    filePath: string,
    fileName: string,
    fileType: string,
    version: string = '1.0',
    docType: string = 'policy'
  ): Promise<string> {
    try {
      // Parse document
      const parsed = await this.parser.parse(filePath, fileType);

      // Create document record
      const documentId = uuidv4();
      await pool.query(
        `INSERT INTO documents (id, name, type, version, is_latest, metadata) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [documentId, fileName, docType, version, true, JSON.stringify(parsed.metadata)]
      );

      // Use chunks from parsed document
      const chunks = parsed.chunks;

      // Generate embeddings and store chunks
      for (let i = 0; i < chunks.length; i++) {
        const chunkId = uuidv4();
        const embedding = await embeddings.embedQuery(chunks[i]);

        await pool.query(
          `INSERT INTO chunks (id, document_id, content, embedding, chunk_index) 
           VALUES ($1, $2, $3, $4::vector, $5)`,
          [chunkId, documentId, chunks[i], JSON.stringify(embedding), i]
        );
      }

      console.log(`Document ${fileName} ingested with ${chunks.length} chunks`);
      return documentId;
    } catch (error) {
      console.error('Ingestion error:', error);
      throw error;
    }
  }
}