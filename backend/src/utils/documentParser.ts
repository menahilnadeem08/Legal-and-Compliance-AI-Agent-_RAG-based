import mammoth from 'mammoth';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import { llm } from '../config/openai';
import { isTextMeaningful, extractTextFromImage } from './ocrService';

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

interface SectionBoundary {
  line_index: number;
  heading: string;
  level: number;
}

export class DocumentParser {
  private maxChunkSize: number = 1500;
  private minChunkSize: number = 200;
  private fallbackChunkSize: number = 1000;
  private chunkOverlap: number = 200;

  /**
   * LLM-based intelligent section detection
   */
  private async detectSectionsWithLLM(lines: string[]): Promise<SectionBoundary[]> {
    const sampleLines = lines.slice(0, 100);
    const numberedSample = sampleLines.map((line, idx) => `${idx}: ${line}`).join('\n');

    const prompt = `Analyze this legal document and identify ALL section headings with their line numbers.

Document sample (line_number: content):
${numberedSample}

Return ONLY a JSON array of sections:
[
  {"line_index": 0, "heading": "Introduction", "level": 1},
  {"line_index": 15, "heading": "Article 1: Definitions", "level": 1},
  {"line_index": 23, "heading": "1.1 Key Terms", "level": 2}
]

Rules:
- level 1 = main sections (Article, Chapter, etc)
- level 2 = subsections (1.1, A., etc)
- level 3 = sub-subsections
- Include ALL headings, even subtle ones
- Return ONLY the JSON array, nothing else`;

    try {
      const response = await llm.invoke(prompt);
      const content = response.content.toString().trim();
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      const sections = JSON.parse(cleaned);
      
      if (!Array.isArray(sections)) {
        console.warn('LLM did not return array, using fallback');
        return [];
      }

      console.log(`🎯 LLM detected ${sections.length} sections in first 100 lines`);
      return sections.filter(s => s.line_index < lines.length);
      
    } catch (error) {
      console.error('LLM section detection failed:', error);
      return [];
    }
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
   * LLM-based section chunking
   */
  private async intelligentChunk(text: string, pageNumber?: number): Promise<ChunkWithMetadata[]> {
    const lines = text.split(/\n+/).filter(l => l.trim());
    
    if (lines.length < 10) {
      return this.fallbackChunk(text, pageNumber);
    }

    // Detect sections using LLM
    const sections = await this.detectSectionsWithLLM(lines);
    
    if (sections.length === 0) {
      console.log('No sections detected by LLM, using fallback');
      return this.fallbackChunk(text, pageNumber);
    }

    const chunks: ChunkWithMetadata[] = [];
    
    // Split text by sections
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const nextSection = sections[i + 1];
      
      const startIdx = section.line_index;
      const endIdx = nextSection ? nextSection.line_index : lines.length;
      
      // Get section lines, excluding the heading line itself
      const sectionLines = lines.slice(startIdx + 1, endIdx);
      const sectionContent = sectionLines.join(' ').trim();
      
      if (sectionContent.length === 0) continue; // Skip empty sections
      
      if (sectionContent.length <= this.maxChunkSize) {
        chunks.push({
          content: sectionContent,
          section_name: section.heading,
          page_number: pageNumber
        });
      } else {
        // Split large sections
        const words = sectionContent.split(/\s+/);
        const wordsPerChunk = Math.floor(this.maxChunkSize / 5);
        const overlapWords = Math.floor(this.chunkOverlap / 5);
        
        for (let j = 0; j < words.length; j += wordsPerChunk - overlapWords) {
          const chunkWords = words.slice(j, j + wordsPerChunk);
          chunks.push({
            content: chunkWords.join(' '),
            section_name: section.heading,
            page_number: pageNumber
          });
        }
      }
    }

    console.log(`✨ Intelligent chunking: ${sections.length} sections → ${chunks.length} chunks`);
    return chunks;
  }

  async parsePDF(filePath: string): Promise<ParsedDocument> {
    try {
      // Import pdfjs with proper Node.js compatibility
      const pdfjs = require('pdfjs-dist/build/pdf');
      
      const raw = fs.readFileSync(filePath);
      const uint8 = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
      
      // Set standardFontDataUrl to fix missing fonts warning
      const pdfjsLibPath = require('path').dirname(require.resolve('pdfjs-dist/package.json'));
      const standardFontDataUrl = require('path').join(pdfjsLibPath, 'standard_fonts/');
      
      const loadingTask = pdfjs.getDocument({ data: uint8, standardFontDataUrl });
      const doc = await loadingTask.promise;
      
      const allChunks: ChunkWithMetadata[] = [];
      
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        
        // FIXED: Preserve line structure using Y-coordinates
        let lastY = -1;
        const lines: string[] = [];
        let currentLine = '';
        
        content.items.forEach((item: any) => {
          const yPos = item.transform[5];
          
          // New line detected (Y position changed)
          if (lastY !== -1 && Math.abs(yPos - lastY) > 2) {
            if (currentLine.trim()) {
              lines.push(currentLine.trim());
            }
            currentLine = item.str;
          } else {
            currentLine += (currentLine ? ' ' : '') + item.str;
          }
          
          lastY = yPos;
        });
        
        // Add last line
        if (currentLine.trim()) {
          lines.push(currentLine.trim());
        }
        
        const pageText = lines.join('\n');
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`PAGE ${i} - Extracted ${lines.length} lines`);
        console.log(`First 3 lines: ${lines.slice(0, 3).join(' | ')}`);
        console.log(`${'='.repeat(60)}\n`);
        
        // OCR fallback for scanned PDFs
        let finalText = pageText;

        if (!isTextMeaningful(pageText)) {
          console.log(`[Parser] Page ${i} has minimal text — attempting OCR`);
          try {
            // Lazy load pdfRenderer to avoid DOMMatrix errors at startup
            const { renderPageToImage } = await import('./pdfRenderer');
            const imagePath = await renderPageToImage(filePath, i);
            const ocrText = await extractTextFromImage(imagePath);
            if (ocrText.trim().length > 0) {
              finalText = ocrText;
              console.log(`[Parser] ✓ OCR recovered ${ocrText.length} chars from page ${i}`);
            } else {
              console.warn(`[Parser] ⚠️ OCR returned empty for page ${i}`);
            }
          } catch (ocrError) {
            console.error(`[Parser] ❌ OCR failed for page ${i}:`, ocrError);
            finalText = pageText;
          }
        }

        const pageChunks = await this.intelligentChunk(finalText, i);
        if (pageChunks.length > 0) allChunks.push(...pageChunks);
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
    console.log(`DOCX - Using LLM for section detection`);
    console.log(`${'='.repeat(60)}\n`);
    
    const charsPerPage = 3000;
    const estimatedPageCount = Math.ceil(result.value.length / charsPerPage);
    
    const allChunks: ChunkWithMetadata[] = [];
    
    for (let pageNum = 1; pageNum <= estimatedPageCount; pageNum++) {
      const pageStart = (pageNum - 1) * charsPerPage;
      const pageEnd = pageNum * charsPerPage;
      const pageText = result.value.substring(pageStart, pageEnd);
      
      if (pageText.trim().length > 0) {
        const pageChunks = await this.intelligentChunk(pageText, pageNum);
        allChunks.push(...pageChunks);
      }
    }

    const sectionsDetected = allChunks.filter(c => c.section_name).length;
    console.log(`\n✨ DOCX Processing Complete: ${allChunks.length} total chunks, ${sectionsDetected} with sections`);
    console.log(`📄 Estimated pages: ${estimatedPageCount} (based on ~${charsPerPage} chars/page)\n`);

    const fullText = allChunks.map(c => c.content).join('\n\n');

    return {
      text: fullText,
      chunks: allChunks,
      metadata: { pageCount: estimatedPageCount },
    };
  }

  async parseImage(filePath: string): Promise<ParsedDocument> {
    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`IMAGE - Running OCR on image file`);
      console.log(`${'='.repeat(60)}\n`);

      // Extract text from image using OCR
      const { extractTextFromImage } = await import('./ocrService');
      const ocrText = await extractTextFromImage(filePath);

      if (!ocrText || ocrText.trim().length === 0) {
        console.warn('⚠️  OCR returned no text from image');
        return {
          text: '',
          chunks: [],
          metadata: { pageCount: 1 },
        };
      }

      console.log(`[Parser] ✓ OCR extracted ${ocrText.length} chars from image`);

      // Chunk the extracted text
      const chunks = await this.intelligentChunk(ocrText, 1);

      const fullText = chunks.map(c => c.content).join('\n\n');
      const sectionsDetected = chunks.filter(c => c.section_name).length;

      console.log(`\n✨ Image Processing Complete: ${chunks.length} chunks, ${sectionsDetected} with sections\n`);

      return {
        text: fullText,
        chunks,
        metadata: { pageCount: 1 },
      };
    } catch (err) {
      throw new Error('Failed to parse image: ' + String(err));
    }
  }

  async parse(filePath: string, fileType: string): Promise<ParsedDocument> {
    const normalizedType = fileType.toLowerCase();

    if (normalizedType === 'pdf') {
      return this.parsePDF(filePath);
    } else if (normalizedType === 'docx') {
      return this.parseDOCX(filePath);
    } else if (['jpg', 'jpeg', 'png', 'tiff', 'webp'].includes(normalizedType)) {
      return this.parseImage(filePath);
    }
    throw new Error(`Unsupported file type: ${fileType}`);
  }
}