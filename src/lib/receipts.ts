import { supabase, errorMessage } from './supabase';

const MAX_SIDE = 1600;

/** Downscale and re-encode photos to WebP so receipts stay small on the free storage tier. */
async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.78));
  return blob && blob.size < file.size ? blob : file;
}

async function sha256(blob: Blob): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Upload a receipt into the private bucket under the uploader's folder.
 * Files are named by content hash, so the same file is stored only once.
 */
export async function uploadReceipt(file: File, userId: string): Promise<string> {
  if (file.size > 10 * 1024 * 1024) throw new Error('File is larger than 10 MB');
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowed.includes(file.type)) throw new Error('Use a JPG, PNG, WebP or PDF file');
  const blob = await compressImage(file);
  if (blob.size > 2 * 1024 * 1024) throw new Error('File is still larger than 2 MB after compression');
  const ext = blob.type === 'application/pdf' ? 'pdf' : blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
  const path = `${userId}/${await sha256(blob)}.${ext}`;
  const { error } = await supabase.storage.from('receipts').upload(path, blob, { contentType: blob.type, upsert: false });
  if (error && !/exists|Duplicate/i.test(error.message)) throw new Error(errorMessage(error));
  return path;
}

export async function receiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 300);
  if (error) throw new Error(errorMessage(error));
  return data.signedUrl;
}
