/** A temporary password made with the browser's secure random source (not Math.random), easy to read out or type from a screenshot: no
 * look-alike characters (0/O, 1/l/I), and always at least one capital, one small letter and one digit. */
const LOWER = 'abcdefghjkmnpqrstuvwxyz', UPPER = 'ABCDEFGHJKMNPQRSTUVWXYZ', DIGITS = '23456789';
function randomInt(max: number): number {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c?.getRandomValues) {
    const limit = Math.floor(0x100000000 / max) * max; // no modulo bias
    const buf = new Uint32Array(1);
    do { c.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % max;
  }
  return Math.floor(Math.random() * max);
}
export function generateTemporaryPassword(length = 12): string {
  const all = LOWER + UPPER + DIGITS;
  const chars = [LOWER[randomInt(LOWER.length)], UPPER[randomInt(UPPER.length)], DIGITS[randomInt(DIGITS.length)]];
  while (chars.length < length) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}
export const MIN_PASSWORD = 10; // the server's own rule
