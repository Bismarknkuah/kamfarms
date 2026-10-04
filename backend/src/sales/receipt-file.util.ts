/** A payment receipt is kept with the order: a photo taken on a phone, a screenshot, or a PDF. */
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const MAX_RECEIPTS_PER_ORDER = 10;

export interface ReceiptUpload {
  buffer: Buffer;
  originalname?: string;
}

const starts = (buf: Buffer, bytes: number[]) => bytes.every((b, i) => buf[i] === b);
const ascii = (buf: Buffer, from: number, to: number) => buf.subarray(from, to).toString('ascii');

/** What the file really is, judged by its content, not by the name or type the browser claimed. */
export function detectReceipt(buf: Buffer): { mime: string; ext: string } | null {
  if (!buf || buf.length < 12) return null;
  if (starts(buf, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', ext: 'jpg' };
  if (starts(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', ext: 'png' };
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (ascii(buf, 0, 5) === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  return null;
}

/** iPhone "High Efficiency" photos: many devices cannot show them, so they are turned away with a clear message. */
export function isHeic(buf: Buffer): boolean {
  return !!buf && buf.length > 12 && ascii(buf, 4, 8) === 'ftyp' && ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(ascii(buf, 8, 12));
}

export function receiptFileName(original: string | undefined, ext: string): string {
  const base = (original ?? 'receipt').replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[^A-Za-z0-9 _.-]/g, '').trim().slice(0, 60) || 'receipt';
  return `${base}.${ext}`;
}
