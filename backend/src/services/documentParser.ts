import mammoth from 'mammoth';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';

export interface ParsedDocument {
  text: string;
  chunks: string[];
  metadata: {
    pageCount?: number;
    title?: string;
  };
}

export class DocumentParser {
  private chunkSize: number = 1000;
  private chunkOverlap: number = 200;

  /**
   * Split text into overlapping chunks
   */
  private chunkText(text: string): string[] {
    const chunks: string[] = [];
    const cleanText = text.replace(/\s+/g, ' ').trim();
    
    if (cleanText.length <= this.chunkSize) {
      return [cleanText];
    }

    for (let i = 0; i < cleanText.length; i += this.chunkSize - this.chunkOverlap) {
      const chunk = cleanText.substring(i, i + this.chunkSize);
      if (chunk.trim().length > 0) {
        chunks.push(chunk);
      }
    }

    return chunks;
  }

  async parsePDF(filePath: string): Promise<ParsedDocument> {
    // Try pdf-parse first (simple). If its export shape changes or it fails,
    // fall back to pdfjs-dist for page-accurate extraction.
    try {
      const pdfParseMod: any = require('pdf-parse');
      const pdfParse = typeof pdfParseMod === 'function' ? pdfParseMod : (pdfParseMod.default ?? pdfParseMod);

      if (typeof pdfParse === 'function') {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        const chunks = this.chunkText(data.text);
        return {
          text: data.text,
          chunks,
          metadata: {
            pageCount: data.numpages,
          },
        };
      }
      // else fallthrough to pdfjs-dist
    } catch (err) {
      // continue to fallback
    }

    // Fallback: use pdfjs-dist for reliable per-page extraction
    try {
      // pdfjs-dist provides ESM builds (.mjs). Use dynamic import to load it in
      // CommonJS/ts-node environments.
      const pdfjsLib: any = (await import('pdfjs-dist/legacy/build/pdf.mjs'))?.default ?? (await import('pdfjs-dist'));
      const raw = fs.readFileSync(filePath);
      const uint8 = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
      const loadingTask = pdfjsLib.getDocument({ data: uint8 });
      const doc = await loadingTask.promise;
      const pages: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map((it: any) => it.str).join(' ');
        pages.push(text);
      }
      const fullText = pages.join('\n\f\n');
      const chunks = pages.flatMap((p) => this.chunkText(p));
      return {
        text: fullText,
        chunks,
        metadata: { pageCount: doc.numPages },
      };
    } catch (err) {
      throw new Error('Failed to parse PDF with pdf-parse and pdfjs-dist: ' + String(err));
    }
  }

  async parseDOCX(filePath: string): Promise<ParsedDocument> {
    const result = await mammoth.extractRawText({ path: filePath });
    
    const chunks = this.chunkText(result.value);

    return {
      text: result.value,
      chunks,
      metadata: {},
    };
  }

  async parse(filePath: string, fileType: string): Promise<ParsedDocument> {
    if (fileType === 'pdf') {
      return this.parsePDF(filePath);
    } else if (fileType === 'docx') {
      return this.parseDOCX(filePath);
    }
    throw new Error('Unsupported file type');
  }
}