import fs from 'fs';

const MIN_TEXT_LENGTH = 10;
const EASYOCR_URL = process.env.EASYOCR_URL || 'http://localhost:8001';

// Lazy load Tesseract to avoid issues if not needed
let Tesseract: any = null;
const loadTesseract = async () => {
  if (!Tesseract) {
    Tesseract = (await import('tesseract.js')).default;
  }
  return Tesseract;
};

export const isTextMeaningful = (text: string): boolean => {
  const cleaned = text.replace(/\s+/g, '').trim();
  return cleaned.length >= MIN_TEXT_LENGTH;
};

// Try EasyOCR first, fall back to Tesseract
export const extractTextFromImage = async (
  imagePath: string
): Promise<string> => {
  try {
    // Try EasyOCR microservice first
    const easyOcrText = await extractWithEasyOCR(imagePath);
    if (easyOcrText && easyOcrText.trim().length > 0) {
      console.log('[OCR] ✓ EasyOCR succeeded');
      return easyOcrText;
    }
  } catch (error: any) {
    console.warn('[OCR] ⚠️ EasyOCR unavailable, falling back to Tesseract:', error.message);
  }

  // Fallback to Tesseract (local)
  return extractWithTesseract(imagePath);
};

const extractWithEasyOCR = async (
  imagePath: string
): Promise<string> => {
  try {
    // Create FormData with file
    const formData = new FormData();
    const fileStream = fs.createReadStream(imagePath);
    formData.append('file', fileStream as any);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      const response = await fetch(`${EASYOCR_URL}/ocr`, {
        method: 'POST',
        body: formData as any,
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`EasyOCR returned ${response.status}`);
      }

      const data: any = await response.json();
      return data.text || '';
    } finally {
      clearTimeout(timeout);
    }
  } catch (error: any) {
    throw new Error(`EasyOCR error: ${error.message}`);
  }
};

const extractWithTesseract = async (
  imagePath: string
): Promise<string> => {
  try {
    console.log('[OCR] Running Tesseract fallback...');
    const Tesseract = await loadTesseract();
    const result = await Tesseract.recognize(imagePath, 'eng', {
      logger: () => {} // Suppress verbose logging
    });
    const text = result.data.text || '';
    console.log(`[OCR] ✓ Tesseract extracted ${text.length} chars`);
    return text;
  } catch (error: any) {
    console.error('[OCR] ❌ Tesseract failed:', error.message);
    return '';
  } finally {
    // Clean up temp image
    if (fs.existsSync(imagePath)) {
      try {
        fs.unlinkSync(imagePath);
      } catch (e) {
        console.warn('[OCR] Failed to cleanup image:', e);
      }
    }
  }
};

export const checkOCRServiceHealth = async (): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${EASYOCR_URL}/health`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
};
