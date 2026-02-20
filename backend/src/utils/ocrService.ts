import Tesseract from 'tesseract.js';
import fs from 'fs';
import { logger } from './logger';

const MIN_TEXT_LENGTH = 50;

export const isTextMeaningful = (text: string): boolean => {
  const cleaned = text.replace(/\s+/g, '').trim();
  return cleaned.length >= MIN_TEXT_LENGTH;
};

export const extractTextFromImage = async (
  imagePath: string
): Promise<string> => {
  try {
    const result = await Tesseract.recognize(imagePath, 'eng', {
      logger: () => {}
    });
    return result.data.text || '';
  } catch (error: any) {
    logger.error('[OCR]', 'Extraction failed', error);
    return '';
  } finally {
    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
  }
};
