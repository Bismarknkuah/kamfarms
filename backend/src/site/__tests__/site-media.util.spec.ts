import { detectMedia, parseRange, safeFileName } from '../site-media.util';

const pad = (n = 32) => Buffer.alloc(n);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), pad()]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pad()]);
const webp = Buffer.concat([Buffer.from('RIFF'), pad(4), Buffer.from('WEBPVP8 '), pad()]);
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), pad()]);
const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), pad(8), Buffer.from('webm'), pad()]);
const mkv = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), pad(8), Buffer.from('matroska'), pad()]);
const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), pad()]);
const quicktime = Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from('ftypqt  '), pad()]);

describe('detectMedia: identifies a file by its bytes, never by its name', () => {
  it.each([
    ['JPEG', jpeg, { kind: 'IMAGE', mime: 'image/jpeg' }],
    ['PNG', png, { kind: 'IMAGE', mime: 'image/png' }],
    ['WebP', webp, { kind: 'IMAGE', mime: 'image/webp' }],
    ['MP4', mp4, { kind: 'VIDEO', mime: 'video/mp4' }],
    ['WebM', webm, { kind: 'VIDEO', mime: 'video/webm' }],
  ])('recognises %s', (_name, buf, expected) => expect(detectMedia(buf)).toEqual(expected));

  it.each([
    ['an SVG (can carry script)', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ['an HTML page', Buffer.from('<!doctype html><html><body>hi</body></html>')],
    ['a PDF', Buffer.from('%PDF-1.7 ........................')],
    ['a Windows program', Buffer.concat([Buffer.from('MZ'), pad(64)])],
    ['a Matroska video (not WebM)', mkv],
    ['a HEIC still image', heic],
    ['a QuickTime movie', quicktime],
    ['plain text', Buffer.from('this is just some text, not media')],
    ['too few bytes to tell', Buffer.from([0xff, 0xd8, 0xff])],
    ['nothing at all', Buffer.alloc(0)],
  ])('rejects %s', (_name, buf) => expect(detectMedia(buf)).toBeNull());
});

describe('parseRange: what Safari needs to play a video', () => {
  const SIZE = 1000;
  it.each([
    ['bytes=0-99', { start: 0, end: 99 }],
    ['bytes=900-', { start: 900, end: 999 }],
    ['bytes=-100', { start: 900, end: 999 }],
    ['bytes=0-5000', { start: 0, end: 999 }],
    ['  bytes=10-20  ', { start: 10, end: 20 }],
    ['bytes=-5000', { start: 0, end: 999 }],
  ])('reads %p', (header, expected) => expect(parseRange(header, SIZE)).toEqual(expected));

  it.each(['bytes=2000-', 'bytes=500-100', 'bytes=-0', 'bytes=1000-1000'])('says %p cannot be satisfied', (header) => expect(parseRange(header, SIZE)).toBe('unsatisfiable'));
  it.each([undefined, '', 'items=0-5', 'bytes=0-1,5-9', 'bytes=-', 'bytes=a-b'])('serves the whole file when the range is %p', (header) => expect(parseRange(header, SIZE)).toBeNull());
});

describe('safeFileName', () => {
  it('keeps a normal name', () => expect(safeFileName('Farm A harvest.jpg', 'picture')).toBe('Farm A harvest.jpg'));
  it('strips any path, so a name can never point anywhere', () => {
    expect(safeFileName('../../etc/passwd', 'picture')).toBe('passwd');
    expect(safeFileName('C:\\Users\\me\\photo.png', 'picture')).toBe('photo.png');
  });
  it('removes control and markup characters and bounds the length', () => {
    expect(safeFileName('a\u0000b<script>.png', 'picture')).toBe('abscript.png');
    expect(safeFileName('x'.repeat(300) + '.jpg', 'picture')).toHaveLength(120);
  });
  it('falls back when nothing usable is left', () => {
    expect(safeFileName('', 'picture')).toBe('picture');
    expect(safeFileName(undefined, 'video')).toBe('video');
    expect(safeFileName('///', 'picture')).toBe('picture');
  });
});
