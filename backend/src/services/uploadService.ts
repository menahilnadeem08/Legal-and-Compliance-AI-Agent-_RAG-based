import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';
import { DocumentParser } from '../utils/documentParser';
import { generateEmbedding } from '../utils/emdedding';
import { DocumentService } from './documentService';

export class UploadService {
  private parser: DocumentParser;
  private documentService: DocumentService;

  constructor() {
    this.parser = new DocumentParser();
    this.documentService = new DocumentService();
  }

  validateFileType(fileExtension: string): boolean {
    return ['pdf', 'docx'].includes(fileExtension.toLowerCase());
  }

  async ingestDocument(
    filePath: string,
    fileName: string,
    fileType: string,
    version: string = '1.0',
    docType: string = 'policy'
  ): Promise<string> {
    // Parse document
    const parsed = await this.parser.parse(filePath, fileType);

    // Create document record
    const documentId = uuidv4();
    await pool.query(
      `INSERT INTO documents (id, name, type, version, is_latest, metadata) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [documentId, fileName, docType, version, true, JSON.stringify(parsed.metadata)]
    );

    // Mark this as the latest version (deactivates previous versions)
    try {
      await this.documentService.markAsLatest(documentId, fileName);
    } catch (e) {
      console.warn(`Failed to update version status for ${fileName}:`, e);
    }

    // Generate embeddings and store chunks
    const chunks = parsed.chunks;
    for (let i = 0; i < chunks.length; i++) {
      const chunkId = uuidv4();
      const embedding = await generateEmbedding(chunks[i]);

      await pool.query(
        `INSERT INTO chunks (id, document_id, content, embedding, chunk_index) 
         VALUES ($1, $2, $3, $4::vector, $5)`,
        [chunkId, documentId, chunks[i], JSON.stringify(embedding), i]
      );
    }

    console.log(`Document ${fileName} ingested with ${chunks.length} chunks`);
    return documentId;
  }
}