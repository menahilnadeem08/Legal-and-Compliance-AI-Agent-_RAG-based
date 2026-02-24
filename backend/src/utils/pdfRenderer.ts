// DOM polyfills MUST be first — before any other imports
const { createCanvas, DOMMatrix, DOMPoint, DOMRect } = require('canvas');
global.DOMMatrix = DOMMatrix;
global.DOMPoint = DOMPoint;
global.DOMRect = DOMRect;

const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
const path = require('path');
const os = require('os');
const fs = require('fs');
const sharp = require('sharp');
const logger = require('./logger').default;

export const renderPageToImage = async (
  pdfPath: string,
  pageNumber: number
): Promise<string> => {
  const outputPath = path.join(
    os.tmpdir(),
    `ocr_${Date.now()}_p${pageNumber}.png`
  );

  try {
    const data = new Uint8Array(fs.readFileSync(pdfPath));

    // Set standardFontDataUrl to fix missing fonts warning
    const pdfjsLibPath = path.dirname(require.resolve('pdfjs-dist/package.json'));
    const standardFontDataUrl = path.join(pdfjsLibPath, 'standard_fonts/') + '/';

    const pdfDocument = await pdfjs.getDocument({
      data,
      standardFontDataUrl
    }).promise;

    const page = await pdfDocument.getPage(pageNumber);
    const scale = 2.0; // Higher scale = better OCR quality
    const viewport = page.getViewport({ scale });

    // Use viewport dimensions instead of fixed size for better OCR quality
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height)
    );
    const context = canvas.getContext('2d');

    // Render page to canvas
    const renderContext: any = {
      canvasContext: context,
      viewport: viewport
    };
    await page.render(renderContext).promise;

    // Save as high quality PNG using sharp
    await sharp(canvas.toBuffer('image/png'))
      .png({ quality: 100 })
      .toFile(outputPath);

    logger.info('PDF page rendered', { pageNumber, outputPath });
    return outputPath;

  } catch (error) {
    logger.error('Failed to render PDF page', { pageNumber, error });
    throw error;
  }
};
