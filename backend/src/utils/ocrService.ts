import fs from 'fs';
import path from 'path';
import axios from 'axios';
import logger from './logger';

const MIN_TEXT_LENGTH = parseInt(process.env.OCR_MIN_TEXT_LENGTH || '50', 10);
const EASYOCR_URL = process.env.EASYOCR_URL || 'http://localhost:8001';

/** Map file extension to MIME type for OCR service (must match ocr-service ALLOWED_MIME_TYPES) */
const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  webp: 'image/webp',
};

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
/** @param fileExtension - e.g. 'jpg', 'png'. Used to set Content-Type when sending to EasyOCR (required for image uploads from multer paths with no extension). */
export const extractTextFromImage = async (
  imagePath: string,
  fileExtension?: string
): Promise<string> => {
  const contentType = fileExtension ? EXT_TO_MIME[fileExtension.toLowerCase()] : undefined;
  try {
    const easyOcrText = await extractWithEasyOCR(imagePath, contentType);
    if (easyOcrText && easyOcrText.trim().length > 0) {
      logger.info('EasyOCR succeeded', { context: 'OCR' });
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
      return easyOcrText;
    }
  } catch (error: any) {
    logger.warn('EasyOCR unavailable, falling back to Tesseract', { error: error?.message ?? error });
  }

  // Fallback to Tesseract (file still needed); cleanup after
  const result = await extractWithTesseract(imagePath);
  if (fs.existsSync(imagePath)) {
    try {
      fs.unlinkSync(imagePath);
    } catch (e) {
      logger.warn('OCR: failed to cleanup image', { error: e });
    }
  }
  return result;
};

const extractWithEasyOCR = async (
  imagePath: string,
  contentType?: string
): Promise<string> => {
  try {
    logger.info('Sending to EasyOCR', { imagePath, context: 'OCR' });

    const FormData = require('form-data');
    const formData = new FormData();
    // Derive Content-Type so Python OCR service accepts the part (it checks file.content_type)
    const mime = contentType || EXT_TO_MIME[path.extname(imagePath).slice(1).toLowerCase()] || 'image/png';
    const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1] || 'png';
    formData.append('file', fs.createReadStream(imagePath), {
      filename: `image.${ext}`,
      contentType: mime,
    });

    const response = await axios.post(
      `${EASYOCR_URL}/ocr`,
      formData,
      {
        headers: formData.getHeaders(),
        timeout: 60000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      }
    );

    const data = response.data as any;
    return data.text || '';
  } catch (error: any) {
    const errorText = error.response?.data || error.message;
    logger.error('EasyOCR error response', { errorText, context: 'OCR' });
    throw new Error(`EasyOCR returned ${error.response?.status}: ${errorText}`);
  }
};

const extractWithTesseract = async (
  imagePath: string
): Promise<string> => {
  try {
    logger.info('Running Tesseract fallback', { context: 'OCR' });
    const Tesseract = await loadTesseract();
    const result = await Tesseract.recognize(imagePath, 'eng', {
      logger: () => {} // Suppress verbose logging
    });
    const text = result.data.text || '';
    logger.info('Tesseract extracted text', { chars: text.length, context: 'OCR' });
    return text;
  } catch (error: any) {
    logger.error('Tesseract failed', { error: error.message, context: 'OCR' });
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
