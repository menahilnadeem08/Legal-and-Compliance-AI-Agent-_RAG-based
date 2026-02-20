const { DOMMatrix, DOMPoint, DOMRect } = require('canvas');
global.DOMMatrix = DOMMatrix;
global.DOMPoint = DOMPoint;
global.DOMRect = DOMRect;

const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

import { createCanvas } from 'canvas';
import sharp from 'sharp';
import path from 'path';
import os from 'os';

export const renderPageToImage = async (
  pdfPath: string,
  pageNumber: number
): Promise<string> => {
  const outputPath = path.join(
    os.tmpdir(),
    `ocr_${Date.now()}_p${pageNumber}.png`
  );

  try {
    const data = new Uint8Array(
      require('fs').readFileSync(pdfPath)
    );

    const pdfDocument = await pdfjs.getDocument({
      data,
      standardFontDataUrl: path.join(
        path.dirname(require.resolve('pdfjs-dist/package.json')),
        'standard_fonts/'
      ) + '/'
    }).promise;

    const page = await pdfDocument.getPage(pageNumber);
    const scale = 2.0;  // higher = better OCR quality
    const viewport = page.getViewport({ scale });

    const canvas = createCanvas(
      Math.floor(viewport.width),
      Math.floor(viewport.height)
    );
    const context = canvas.getContext('2d');

    await page.render({
      canvasContext: context as any,
      viewport,
      canvas: canvas as any
    }).promise;

    // Save as high quality PNG using sharp
    await sharp(canvas.toBuffer('image/png'))
      .png({ quality: 100 })
      .toFile(outputPath);

    console.log(
      `[PDF-RENDERER] Page ${pageNumber} rendered to ${outputPath}`
    );
    return outputPath;

  } catch (error) {
    console.error(
      `[PDF-RENDERER] Failed page ${pageNumber}:`, error
    );
    throw error;
  }
};
