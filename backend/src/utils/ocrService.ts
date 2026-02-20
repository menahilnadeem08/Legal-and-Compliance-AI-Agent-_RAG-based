import fs from 'fs';
import path from 'path';
import axios from 'axios';

const MIN_TEXT_LENGTH = 50;
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
    const easyOcrText = await extractWithEasyOCR(imagePath);
    if (easyOcrText && easyOcrText.trim().length > 0) {
      console.log('[OCR] ✓ EasyOCR succeeded');
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
      return easyOcrText;
    }
  } catch (error: any) {
    console.warn(
      '[OCR] ⚠️ EasyOCR unavailable, falling back to Tesseract:',
      error?.message ?? error
    );
  }

  // Fallback to Tesseract (file still needed); cleanup after
  const result = await extractWithTesseract(imagePath);
  if (fs.existsSync(imagePath)) {
    try {
      fs.unlinkSync(imagePath);
    } catch (e) {
      console.warn('[OCR] Failed to cleanup image:', e);
    }
  }
  return result;
};

const extractWithEasyOCR = async (
  imagePath: string
): Promise<string> => {
  try {
    console.log('[OCR] Sending to EasyOCR:', imagePath);

    const response = await axios.post(
      `${EASYOCR_URL}/ocr`,
      {
        file: fs.createReadStream(imagePath)
      },
      {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 60000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      }
    );

    const data = response.data as any;
    return data.text || '';
  } catch (error: any) {
    const errorText = error.response?.data || error.message;
    console.error('[OCR] EasyOCR error response:', errorText);
    throw new Error(`EasyOCR returned ${error.response?.status}: ${errorText}`);
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
