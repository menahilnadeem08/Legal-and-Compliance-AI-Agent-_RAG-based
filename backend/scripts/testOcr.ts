import path from 'path';
import fs from 'fs';
import { DocumentParser } from '../src/utils/documentParser';

const test = async () => {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    console.error(
      'Usage: npx ts-node scripts/testOcr.ts ./file.pdf'
    );
    process.exit(1);
  }

  console.log(`\nTesting: ${pdfPath}\n`);
  const parser = new DocumentParser();
  const result = await parser.parse(path.resolve(pdfPath), 'pdf');

  // Create output folder next to the PDF
  const outputDir = path.join(
    path.dirname(path.resolve(pdfPath)),
    'ocr_output'
  );
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  // Save full combined text
  const fullText = result.chunks
    .map(c => `--- Page ${c.page_number ?? '?'} ---\n${c.content}`)
    .join('\n\n');

  const fullPath = path.join(outputDir, 'full_output.txt');
  fs.writeFileSync(fullPath, fullText, 'utf-8');
  console.log(`\nFull text saved to: ${fullPath}`);

  // Save each chunk separately
  result.chunks.forEach((chunk, i) => {
    const chunkPath = path.join(
      outputDir,
      `chunk_${i + 1}_page_${chunk.page_number ?? '?'}.txt`
    );
    fs.writeFileSync(chunkPath, chunk.content, 'utf-8');
    console.log(`Chunk ${i + 1} saved: ${chunkPath}`);
  });

  console.log(`\nTotal chunks: ${result.chunks.length}`);
  console.log(`Output folder: ${outputDir}`);
};

test().catch(console.error);
