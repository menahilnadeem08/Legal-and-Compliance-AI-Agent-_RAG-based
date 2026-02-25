import fs from 'fs';
import path from 'path';
import { getSupabase, DOCUMENTS_BUCKET } from '../config/supabase';
import logger from '../utils/logger';

const SUPABASE_PREFIX = 'supabase:';

/**
 * Object path inside the bucket: {adminId}/{documentId}/{filename}
 * Stored in DB as: supabase:documents/adminId/documentId/filename
 */
function objectPath(adminId: number, documentId: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${adminId}/${documentId}/${safeName}`;
}

function toFilepath(objectPathInBucket: string): string {
  return `${SUPABASE_PREFIX}${DOCUMENTS_BUCKET}/${objectPathInBucket}`;
}

export function isSupabaseFilepath(filepath: string | null | undefined): boolean {
  return Boolean(filepath && filepath.startsWith(SUPABASE_PREFIX));
}

export function parseSupabaseKey(filepath: string): string | null {
  if (!filepath.startsWith(SUPABASE_PREFIX)) return null;
  return filepath.slice(SUPABASE_PREFIX.length);
}

/**
 * Upload a local file to Supabase Storage and return the filepath value to store in DB.
 */
export async function uploadDocumentToSupabase(
  localPath: string,
  adminId: number,
  documentId: string,
  filename: string
): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');

  const objectPathInBucket = objectPath(adminId, documentId, filename);
  const buffer = fs.readFileSync(localPath);
  const ext = path.extname(filename).toLowerCase();
  const contentType =
    ext === '.pdf'
      ? 'application/pdf'
      : ext === '.docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : ext === '.doc'
          ? 'application/msword'
          : 'application/octet-stream';

  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(objectPathInBucket, buffer, {
    contentType,
    upsert: true,
  });

  if (error) {
    logger.error('Supabase storage upload failed', { error: error.message, objectPathInBucket });
    throw new Error(`Failed to upload to storage: ${error.message}`);
  }

  return toFilepath(objectPathInBucket);
}

/**
 * Get a signed URL for a document stored in Supabase (for redirect or "Open in new tab").
 * Expiry in seconds (default 1 hour).
 */
export async function getSignedUrl(storedFilepath: string, expirySeconds: number = 3600): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured');

  const key = parseSupabaseKey(storedFilepath);
  if (!key) throw new Error('Invalid Supabase filepath');

  const [bucket, ...pathParts] = key.split('/');
  const objectPathInBucket = pathParts.join('/');

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(objectPathInBucket, expirySeconds);
  if (error) {
    logger.error('Supabase createSignedUrl failed', { error: error.message, objectPathInBucket });
    throw new Error(`Failed to create signed URL: ${error.message}`);
  }
  return data.signedUrl;
}

/**
 * Download file from Supabase Storage and return the buffer (for streaming in download endpoint).
 */
export async function downloadFromSupabase(storedFilepath: string): Promise<Buffer> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured');

  const key = parseSupabaseKey(storedFilepath);
  if (!key) throw new Error('Invalid Supabase filepath');

  const [bucket, ...pathParts] = key.split('/');
  const objectPathInBucket = pathParts.join('/');

  const { data, error } = await supabase.storage.from(bucket).download(objectPathInBucket);
  if (error) {
    logger.error('Supabase storage download failed', { error: error.message, objectPathInBucket });
    throw new Error(`Failed to download from storage: ${error.message}`);
  }
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
