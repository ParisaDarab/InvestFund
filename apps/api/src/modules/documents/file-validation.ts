/**
 * Upload validation: declared type, extension and the file's magic bytes must agree, and the
 * file name is reduced to a safe display name (no paths, no control characters). The storage
 * key is random and never derived from the name, so path traversal is impossible.
 */
import { DOCUMENT_CONTENT_TYPES, type DocumentContentType } from '@investfund/shared';

const startsWith = (data: Buffer, bytes: number[]) =>
  data.length >= bytes.length && bytes.every((byte, index) => data[index] === byte);

function sniff(data: Buffer): DocumentContentType | 'text/plain' | null {
  if (startsWith(data, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'; // %PDF-
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(data, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  return null;
}

function looksLikeText(data: Buffer): boolean {
  const sample = data.subarray(0, 4096);
  if (sample.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(
      sample.length < data.length ? sample.subarray(0, sample.length - 4) : sample,
    );
    return true;
  } catch {
    return false;
  }
}

/** Keeps the base name, strips control and path characters, and caps the length. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  return cleaned.slice(-150) || 'document';
}

export type FileCheck =
  | { readonly ok: true; readonly contentType: DocumentContentType; readonly fileName: string }
  | { readonly ok: false; readonly reason: string };

export function checkUpload(
  declaredType: string | undefined,
  fileName: string,
  data: Buffer,
): FileCheck {
  const type = (declaredType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (!(type in DOCUMENT_CONTENT_TYPES)) {
    return { ok: false, reason: 'Only PDF, PNG, JPEG and plain-text files are accepted.' };
  }
  const contentType = type as DocumentContentType;
  const safeName = sanitizeFileName(fileName);
  const extension = safeName.includes('.') ? safeName.split('.').pop()?.toLowerCase() : undefined;
  const allowed = DOCUMENT_CONTENT_TYPES[contentType] as readonly string[];
  if (extension === undefined || !allowed.includes(extension)) {
    return { ok: false, reason: `The file extension does not match ${contentType}.` };
  }
  if (data.length === 0) return { ok: false, reason: 'The file is empty.' };
  const detected = sniff(data);
  const matches =
    contentType === 'text/plain'
      ? detected === null && looksLikeText(data)
      : detected === contentType;
  if (!matches) return { ok: false, reason: 'The file content does not match its type.' };
  return { ok: true, contentType, fileName: safeName };
}
