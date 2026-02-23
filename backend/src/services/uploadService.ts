import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';
import { DocumentParser, ChunkWithMetadata } from '../utils/documentParser';
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
    category: string = 'Federal Legislation / Acts',
    adminId: number
  ): Promise<string> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Parse document
      const parsed = await this.parser.parse(filePath, fileType);

      // AUTOMATIC VERSION ASSIGNMENT
      // Get count of existing documents with same category for this admin
      const countResult = await client.query(
        `SELECT COUNT(*) as doc_count FROM documents WHERE admin_id = $1 AND category = $2`,
        [adminId, category]
      );
      
      const nextVersion = parseInt(countResult.rows[0].doc_count, 10) + 1;

      // Deactivate all previous documents with same category
      await client.query(
        `UPDATE documents SET is_active = false WHERE admin_id = $1 AND category = $2`,
        [adminId, category]
      );

      // Create new document record with auto-assigned version and is_active = true (filename and filepath only; no name column)
      const documentId = uuidv4();
      await client.query(
        `INSERT INTO documents (id, admin_id, filename, filepath, category, version, is_active, metadata, upload_date) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [documentId, adminId, fileName, filePath, category, nextVersion, true, JSON.stringify(parsed.metadata), new Date()]
      );

      // Generate embeddings and store chunks with metadata
      const chunks = parsed.chunks;
      console.log(`Processing ${chunks.length} chunks for ${fileName}...`);
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk: ChunkWithMetadata = chunks[i];
        const chunkId = uuidv4();
        const embedding = await generateEmbedding(chunk.content);

        // Log section detection for debugging
        if (chunk.section_name) {
          console.log(`Chunk ${i}: Section="${chunk.section_name.substring(0, 50)}..." Page=${chunk.page_number || 'N/A'}`);
        }

        await client.query(
          `INSERT INTO chunks (id, document_id, content, embedding, chunk_index, section_name, page_number) 
           VALUES ($1, $2, $3, $4::vector, $5, $6, $7)`,
          [
            chunkId, 
            documentId, 
            chunk.content, 
            JSON.stringify(embedding), 
            i,
            chunk.section_name || null,
            chunk.page_number || null
          ]
        );
      }

      await client.query('COMMIT');

      const sectionsDetected = chunks.filter(c => c.section_name).length;
      console.log(`Document ${fileName} ingested as version ${nextVersion} with ${chunks.length} chunks (${sectionsDetected} with sections detected)`);
      return documentId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}