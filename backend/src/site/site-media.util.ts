/** Limits and checks for the pictures and videos an administrator uploads for the homepage. */

export const MEDIA_LIMITS = { IMAGE: 4 * 1024 * 1024, VIDEO: 15 * 1024 * 1024 } as const;
/** Files are stored in the database, so the total is bounded. */
export const MAX_MEDIA_FILES = 60;

/** Just the parts of a multer file this module uses (so the module needs no extra type package). */
export interface UploadedFileLike {
  buffer: Buffer;
  originalname: string;
  size: number;
  mimetype?: string;
}

export interface DetectedMedia { kind: 'IMAGE' | 'VIDEO'; mime: string }

const ascii = (buf: Buffer, from: number, to: number) => buf.subarray(from, to).toString('latin1');
const starts = (buf: Buffer, bytes: number[]) => buf.length >= bytes.length && bytes.every((b, i) => buf[i] === b);

// Brands that mark an ISO media file as a still image (HEIC, AVIF) rather than a video.
const IMAGE_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'avif', 'avis']);

/**
 * Identifies a file from its actual bytes. The file name and the type the
 * browser claims are never trusted. SVG is deliberately not accepted: it can
 * carry script.
 */
export function detectMedia(buf: Buffer): DetectedMedia | null {
  if (!buf || buf.length < 12) return null;
  if (starts(buf, [0xff, 0xd8, 0xff])) return { kind: 'IMAGE', mime: 'image/jpeg' };
  if (starts(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: 'IMAGE', mime: 'image/png' };
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return { kind: 'IMAGE', mime: 'image/webp' };
  if (starts(buf, [0x1a, 0x45, 0xdf, 0xa3])) {
    // Matroska and WebM share a container; only WebM is playable in every browser.
    return ascii(buf, 0, 64).includes('webm') ? { kind: 'VIDEO', mime: 'video/webm' } : null;
  }
  if (ascii(buf, 4, 8) === 'ftyp') {
    const brand = ascii(buf, 8, 12);
    if (IMAGE_BRANDS.has(brand) || brand === 'qt  ') return null;
    return { kind: 'VIDEO', mime: 'video/mp4' };
  }
  return null;
}

/**
 * Parses a single HTTP Range header ("bytes=0-99", "bytes=100-", "bytes=-50").
 * Returns null when there is no usable range (serve the whole file), or
 * 'unsatisfiable' when it lies outside the file. Safari will not play a video
 * from a server that cannot answer ranges.
 */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | 'unsatisfiable' | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start: number;
  let end: number;
  if (m[1] === '') {
    const n = parseInt(m[2], 10);
    if (n === 0) return 'unsatisfiable';
    start = Math.max(size - n, 0);
    end = size - 1;
  } else {
    start = parseInt(m[1], 10);
    end = m[2] === '' ? size - 1 : Math.min(parseInt(m[2], 10), size - 1);
  }
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}

/** A harmless display name: no paths, no control characters, bounded length. */
export function safeFileName(name: string | undefined, fallback: string): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[\u0000-\u001F\u007F<>:"|?*]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return cleaned || fallback;
}
