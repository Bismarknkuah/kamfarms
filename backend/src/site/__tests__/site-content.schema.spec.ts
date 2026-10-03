import { BadRequestException } from '@nestjs/common';
import { collectMediaRefs, sanitizeSiteContent } from '../site-content.schema';

const MEDIA_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const HAND_WRITTEN_ID = '00000000-0000-0000-0000-000000000021'; // the seed uses ids like this; they must work too

function valid(overrides: Record<string, unknown> = {}): any {
  return {
    hero: { eyebrow: 'KAM Trading and Farms Limited', headlineAccent: 'Quality Rice', headline: 'from Our Farms to Your Table', subheadline: 'We grow, mill and sell.', checklist: ['Farm fresh'], primaryLabel: 'Our Products', primaryHref: '#products', secondaryLabel: 'Learn More', secondaryHref: '#about' },
    slideshow: { intervalSeconds: 6, slides: [] },
    stats: [{ label: 'Farms', value: '6', sub: 'growing paddy' }],
    about: { eyebrow: 'About us', heading: 'Grown, milled and sold', paragraphs: ['One'], highlights: ['A'], workHeading: 'Where we work', work: [{ label: 'Farms', detail: 'Six farms' }] },
    operations: { eyebrow: 'What we do', heading: 'Our Core Operations', intro: 'x', items: [{ title: 'Farming', body: 'b' }] },
    products: { eyebrow: 'Our products', name: 'Pectra Rice', tagline: 'Superfine', description: 'd', sizesHeading: 'Available in bags of', sizes: ['1 kg'], highlights: ['Farm fresh'], ctaLabel: 'Find a sales point' },
    contact: { eyebrow: 'Contact', heading: 'Where to buy', intro: 'Call', locations: [{ name: 'Adenta', phones: ['0241730440'] }] },
    footer: { company: 'KAM Trading and Farms Limited', tagline: 'Pectra Rice', signInLabel: 'Sign in' },
    ...overrides,
  };
}
const slide = (extra: Record<string, unknown> = {}) => ({ type: 'IMAGE', mediaId: MEDIA_ID, alt: 'A farm', ...extra });
const invalid = (input: unknown, message: RegExp) => {
  expect(() => sanitizeSiteContent(input)).toThrow(BadRequestException);
  expect(() => sanitizeSiteContent(input)).toThrow(message);
};

describe('sanitizeSiteContent: what an administrator may save', () => {
  it('accepts a complete page and returns it normalised', () => {
    const out = sanitizeSiteContent(valid());
    expect(out.hero.headline).toBe('from Our Farms to Your Table');
    expect(out.contact.locations[0]).toMatchObject({ name: 'Adenta', phones: ['0241730440'] });
    expect(out.slideshow).toEqual({ intervalSeconds: 6, slides: [] });
  });

  it('gives every list entry an id when the sender did not, and keeps ids it was given', () => {
    const out = sanitizeSiteContent(valid({ contact: { heading: 'x', locations: [{ id: 'keep-me', name: 'A' }, { name: 'B' }] } }));
    expect(out.contact.locations[0].id).toBe('keep-me');
    expect(out.contact.locations[1].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('trims text and removes control characters', () => {
    const out = sanitizeSiteContent(valid({ footer: { company: '  KAM\u0000 Trading\u0007  ', tagline: '', signInLabel: '' } }));
    expect(out.footer.company).toBe('KAM Trading');
  });

  it('drops anything it does not know about instead of storing it', () => {
    const out: any = sanitizeSiteContent(valid({ evil: '<script>x</script>', hero: { ...valid().hero, onclick: 'steal()' } }));
    expect(out.evil).toBeUndefined();
    expect(out.hero.onclick).toBeUndefined();
  });

  it('fills sensible empties for sections that are missing altogether', () => {
    const out = sanitizeSiteContent({ hero: { headline: 'Hello' }, about: { heading: 'A' }, operations: { heading: 'O' }, products: { name: 'P' }, contact: { heading: 'C' }, footer: { company: 'K' } });
    expect(out.stats).toEqual([]);
    expect(out.slideshow.intervalSeconds).toBe(6);
  });

  describe('required text and length limits', () => {
    it.each([
      ['not an object', 'a string', /content: must be an object/],
      ['missing headline', valid({ hero: { ...valid().hero, headline: '   ' } }), /hero.headline: cannot be empty/],
      ['headline too long', valid({ hero: { ...valid().hero, headline: 'x'.repeat(121) } }), /hero.headline: is too long/],
      ['a non-text heading', valid({ about: { heading: 42 } }), /about.heading: must be text/],
      ['an empty company name', valid({ footer: { company: '' } }), /footer.company: cannot be empty/],
    ])('rejects %s', (_label, input, message) => invalid(input, message as RegExp));
  });

  describe('links', () => {
    it.each(['#contact', '/login', 'https://example.com/path?x=1', 'tel:+233241730440', 'mailto:hello@kam.example'])('accepts %s', (href) => {
      expect(sanitizeSiteContent(valid({ hero: { ...valid().hero, primaryHref: href } })).hero.primaryHref).toBe(href);
    });
    it.each(['javascript:alert(1)', 'data:text/html,<b>x</b>', 'ftp://x.example', '//evil.example', '/\\evil.example', '/\\/evil.example', 'vbscript:x', 'has space', 'x"onload="y'])('rejects %s', (href) => {
      invalid(valid({ hero: { ...valid().hero, primaryHref: href } }), /hero.primaryHref/);
    });
  });

  describe('the slideshow', () => {
    it('accepts an uploaded picture, a hand-written id, and a linked https video', () => {
      const out = sanitizeSiteContent(valid({ slideshow: { intervalSeconds: 8, slides: [slide(), slide({ mediaId: HAND_WRITTEN_ID }), { type: 'VIDEO', url: 'https://cdn.example.com/farm.mp4' }] } }));
      expect(out.slideshow.slides).toHaveLength(3);
      expect(out.slideshow.slides[2]).toMatchObject({ type: 'VIDEO', mediaId: null, url: 'https://cdn.example.com/farm.mp4', enabled: true });
    });
    it('keeps a slide that is switched off, marked as off', () => {
      expect(sanitizeSiteContent(valid({ slideshow: { slides: [slide({ enabled: false })] } })).slideshow.slides[0].enabled).toBe(false);
    });
    it.each([
      ['an unknown type', slide({ type: 'GIF' }), /type: must be IMAGE or VIDEO/],
      ['neither a file nor a link', { type: 'IMAGE', alt: 'x' }, /needs an uploaded file or a link/],
      ['both a file and a link', slide({ url: 'https://x.example/a.png' }), /either an uploaded file or a link, not both/],
      ['a plain http link', { type: 'IMAGE', url: 'http://x.example/a.png' }, /must be an https/],
      ['a javascript link', { type: 'IMAGE', url: 'javascript:alert(1)' }, /must be an https/],
      ['a malformed file id', slide({ mediaId: 'not-an-id' }), /not a valid uploaded file/],
      ['alt text that is too long', slide({ alt: 'x'.repeat(161) }), /alt: is too long/],
    ])('rejects %s', (_label, s, message) => invalid(valid({ slideshow: { slides: [s] } }), message as RegExp));
    it('rejects more than 12 slides', () => {
      invalid(valid({ slideshow: { slides: Array.from({ length: 13 }, () => slide()) } }), /too many entries \(at most 12\)/);
    });
    it.each([2, 31, 6.5, '6', null])('rejects an interval of %p', (interval) => invalid(valid({ slideshow: { intervalSeconds: interval, slides: [] } }), /intervalSeconds/));
    it.each([3, 30])('accepts the limit %p', (interval) => {
      expect(sanitizeSiteContent(valid({ slideshow: { intervalSeconds: interval, slides: [] } })).slideshow.intervalSeconds).toBe(interval);
    });
  });

  describe('locations and phone numbers', () => {
    it('accepts several phone numbers on one location', () => {
      const out = sanitizeSiteContent(valid({ contact: { heading: 'x', locations: [{ name: 'Tema', phones: ['0548254399', '+233 54 825 4399'] }] } }));
      expect(out.contact.locations[0].phones).toHaveLength(2);
    });
    it('allows a location with no phone yet', () => {
      expect(sanitizeSiteContent(valid({ contact: { heading: 'x', locations: [{ name: 'New site' }] } })).contact.locations[0].phones).toEqual([]);
    });
    it.each(['abc', '12', '0541589964; DROP', '<b>0541589964</b>'])('rejects the phone number %p', (phone) => {
      invalid(valid({ contact: { heading: 'x', locations: [{ name: 'A', phones: [phone] }] } }), /phones\[1\]/);
    });
    it('rejects more than 4 numbers on a location and more than 40 locations', () => {
      invalid(valid({ contact: { heading: 'x', locations: [{ name: 'A', phones: Array(5).fill('0541589964') }] } }), /too many entries \(at most 4\)/);
      invalid(valid({ contact: { heading: 'x', locations: Array.from({ length: 41 }, (_, i) => ({ name: `L${i}` })) } }), /too many entries \(at most 40\)/);
    });
    it('requires a name for each location', () => {
      invalid(valid({ contact: { heading: 'x', locations: [{ name: '' }] } }), /locations\[1\]\.name: cannot be empty/);
    });
  });

  it('limits the statistics strip to four', () => {
    invalid(valid({ stats: Array.from({ length: 5 }, (_, i) => ({ label: `L${i}`, value: '1' })) }), /stats: has too many entries/);
  });

  it('reports the first problem in plain words, with where it is', () => {
    expect(() => sanitizeSiteContent(valid({ products: { name: '' } }))).toThrow('products.name: cannot be empty.');
  });
});

describe('collectMediaRefs', () => {
  it('lists the uploaded files the slides use, ignoring linked ones', () => {
    const out = sanitizeSiteContent(valid({ slideshow: { slides: [slide(), { type: 'VIDEO', url: 'https://cdn.example.com/a.mp4' }, slide({ type: 'VIDEO', mediaId: HAND_WRITTEN_ID })] } }));
    expect(collectMediaRefs(out)).toEqual([{ id: MEDIA_ID, type: 'IMAGE' }, { id: HAND_WRITTEN_ID, type: 'VIDEO' }]);
  });
});
