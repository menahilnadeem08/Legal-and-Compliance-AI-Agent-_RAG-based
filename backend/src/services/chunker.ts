import fs from "fs";
//Simple chunk test file
// IMPORTANT: CommonJS-style import for pdf-parse
// This avoids "pdfParse is not a function" at runtime
const pdfParse = require("pdf-parse");

/**
 * Read PDF and return full text
 */
async function readPDF(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const result = await pdfParse(buffer);
  return result.text;
}

/**
 * Chunk text with overlap (RAG-friendly)
 */
function chunkText(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 200
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }

  return chunks;
}

/**
 * Main
 */
async function main() {
  const filePath =
    "file-path-goes-here";

  console.log("Reading PDF:", filePath);

  const text = await readPDF(filePath);
  console.log("Total characters:", text.length);

  const chunks = chunkText(text, 1000, 200);
  console.log("Total chunks:", chunks.length);

  // Sample output
  chunks.slice(0, 2).forEach((c, i) => {
    console.log(`\n--- Chunk ${i + 1} ---\n`);
    console.log(c);
  });
}

main().catch(console.error);