import mammoth from 'mammoth';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';

export interface ParsedDocument {
  text: string;
  chunks: ChunkWithMetadata[];
  metadata: {
    pageCount?: number;
    title?: string;
  };
}

export interface ChunkWithMetadata {
  content: string;
  section_name?: string;
  page_number?: number;
}

export class DocumentParser {
  private maxChunkSize: number = 1500;
  private minChunkSize: number = 200;
  private fallbackChunkSize: number = 1000;
  private chunkOverlap: number = 200;

  /**
   * Detect if a line is a section heading
   */
  private isSectionHeading(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 3 || trimmed.length > 150) return false;

    // Pattern 1: Article/Section/Chapter/Clause + number
    if (/^(Article|Section|Chapter|Clause|Part)\s+[\dIVXivx]+/i.test(trimmed)) return true;
    
    // Pattern 2: Numbered headings (1., 2.1, etc)
    if (/^\d+(\.\d+)*[\.\)]\s+[A-Z]/.test(trimmed)) return true;
    
    // Pattern 3: ALL CAPS (15+ chars, 3+ words, not a sentence)
    if (trimmed === trimmed.toUpperCase() && 
        trimmed.length >= 15 && 
        trimmed.split(/\s+/).length >= 3 &&
        !/[.!?]$/.test(trimmed)) return true;
    
    return false;
  }

  /**
   * Fallback: Traditional overlap chunking (when no sections detected)
   */
  private fallbackChunk(text: string, pageNumber?: number): ChunkWithMetadata[] {
    console.log('⚠️  Using fallback chunking (no sections detected)');
    const chunks: ChunkWithMetadata[] = [];
    const cleanText = text.replace(/\s+/g, ' ').trim();
    
    if (cleanText.length <= this.fallbackChunkSize) {
      return [{ content: cleanText, page_number: pageNumber }];
    }

    for (let i = 0; i < cleanText.length; i += this.fallbackChunkSize - this.chunkOverlap) {
      const chunk = cleanText.substring(i, i + this.fallbackChunkSize);
      if (chunk.trim().length > 0) {
        chunks.push({ content: chunk.trim(), page_number: pageNumber });
      }
    }

    return chunks;
  }

  /**
   * Split text by sections, then chunk large sections
   */
  private sectionBasedChunk(text: string, pageNumber?: number): ChunkWithMetadata[] {
  // Split by double-spaces or newlines to find potential section breaks
  const segments = text.split(/\s{2,}|\n/);
  console.log(`\n📄 Checking ${segments.length} segments for sections...`);
  
  const chunks: ChunkWithMetadata[] = [];
  let currentSection: string | undefined;
  let currentContent: string[] = [];
  let sectionsFound = 0;

  const flushSection = () => {
    if (currentContent.length === 0) return;
    const content = currentContent.join(' ').trim();
    if (content.length === 0) return;

    if (content.length <= this.maxChunkSize) {
      chunks.push({
        content,
        section_name: currentSection,
        page_number: pageNumber
      });
    } else {
      const words = content.split(/\s+/);
      const wordsPerChunk = Math.floor(this.maxChunkSize / 5);
      const overlapWords = Math.floor(this.chunkOverlap / 5);
      
      for (let i = 0; i < words.length; i += wordsPerChunk - overlapWords) {
        const chunkWords = words.slice(i, i + wordsPerChunk);
        chunks.push({
          content: chunkWords.join(' '),
          section_name: currentSection,
          page_number: pageNumber
        });
      }
    }
    currentContent = [];
  };

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i].trim();
    if (!segment) continue;
    
    if (i < 10) console.log(`Segment ${i}: "${segment.substring(0, 60)}..." -> isSection: ${this.isSectionHeading(segment)}`);
    
    if (this.isSectionHeading(segment)) {
      sectionsFound++;
      console.log(`🎯 SECTION #${sectionsFound}: "${segment}"`);
      flushSection();
      currentSection = segment.substring(0, 255);
    } else {
      currentContent.push(segment);
    }
  }

  flushSection();
  
  console.log(`📊 Found ${sectionsFound} sections, ${chunks.length} chunks`);
  
  if (chunks.length === 0) {
    return this.fallbackChunk(text, pageNumber);
  }
  
  return chunks;
}

  async parsePDF(filePath: string): Promise<ParsedDocument> {
    try {
      const pdfjsLib: any = (await import('pdfjs-dist/legacy/build/pdf.mjs'))?.default ?? (await import('pdfjs-dist'));
      const raw = fs.readFileSync(filePath);
      const uint8 = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
      const loadingTask = pdfjsLib.getDocument({ data: uint8 });
      const doc = await loadingTask.promise;
      
      const allChunks: ChunkWithMetadata[] = [];
      
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((it: any) => it.str).join(' ');
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`PAGE ${i} - First 300 chars:`);
        console.log(`${'='.repeat(60)}`);
        console.log(pageText.substring(0, 300));
        console.log(`${'='.repeat(60)}\n`);
        
        const pageChunks = this.sectionBasedChunk(pageText, i);
        allChunks.push(...pageChunks);
      }
      
      const fullText = allChunks.map(c => c.content).join('\n\n');
      
      const sectionsDetected = allChunks.filter(c => c.section_name).length;
      console.log(`\n✨ PDF Processing Complete: ${allChunks.length} total chunks, ${sectionsDetected} with sections\n`);
      
      return {
        text: fullText,
        chunks: allChunks,
        metadata: { pageCount: doc.numPages },
      };
    } catch (err) {
      throw new Error('Failed to parse PDF: ' + String(err));
    }
  }

  async parseDOCX(filePath: string): Promise<ParsedDocument> {
    const result = await mammoth.extractRawText({ path: filePath });
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`DOCX - First 300 chars:`);
    console.log(`${'='.repeat(60)}`);
    console.log(result.value.substring(0, 300));
    console.log(`${'='.repeat(60)}\n`);
    
    const chunks = this.sectionBasedChunk(result.value);

    const sectionsDetected = chunks.filter(c => c.section_name).length;
    console.log(`\n✨ DOCX Processing Complete: ${chunks.length} total chunks, ${sectionsDetected} with sections\n`);

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