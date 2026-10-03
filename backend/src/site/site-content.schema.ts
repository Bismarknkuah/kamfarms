import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { UUID_SHAPE } from '../common/validators/is-uuid-like';

/**
 * The shape of the public homepage's editable content, and the single place
 * that decides what an administrator is allowed to save.
 *
 * This text is shown to the whole internet, so nothing is trusted: every
 * field is an allow-listed, length-capped string, links may only be a page
 * path, an anchor, https, tel: or mailto:, and anything not named here is
 * dropped rather than stored. The homepage renders it as plain text, never as
 * HTML.
 */

export type SlideType = 'IMAGE' | 'VIDEO';

export interface SiteSlide {
  id: string;
  type: SlideType;
  /** An uploaded file (served by this API), or... */
  mediaId: string | null;
  /** ...an https link to a picture or video hosted elsewhere. Never both. */
  url: string | null;
  alt: string;
  caption: string;
  enabled: boolean;
}
export interface SiteStat { id: string; label: string; value: string; sub: string }
export interface SiteLabelled { id: string; label: string; detail: string }
export interface SiteCard { id: string; title: string; body: string }
export interface SiteLocation { id: string; name: string; phones: string[] }
export type ContactKind = 'text' | 'phone' | 'email' | 'whatsapp' | 'link';
/** A line of company contact information (an address, a phone, an email...). */
export interface SiteContactDetail { id: string; label: string; value: string; kind: ContactKind }

export interface SiteContent {
  hero: {
    eyebrow: string; headlineAccent: string; headline: string; subheadline: string; checklist: string[];
    primaryLabel: string; primaryHref: string; secondaryLabel: string; secondaryHref: string;
  };
  slideshow: { intervalSeconds: number; slides: SiteSlide[] };
  stats: SiteStat[];
  about: { eyebrow: string; heading: string; paragraphs: string[]; highlights: string[]; workHeading: string; work: SiteLabelled[] };
  operations: { eyebrow: string; heading: string; intro: string; items: SiteCard[] };
  products: { eyebrow: string; name: string; tagline: string; description: string; sizesHeading: string; sizes: string[]; highlights: string[]; ctaLabel: string };
  contact: { eyebrow: string; heading: string; intro: string; details: SiteContactDetail[]; locations: SiteLocation[] };
  footer: { company: string; tagline: string; signInLabel: string };
  /** The name (and optionally logo) shown in the website's top bar and on the sign-in page. */
  brand: { name: string; subtitle: string; logoMediaId: string | null };
  /** What the sign-in page shows. */
  signin: { showDemoAccounts: boolean; notice: string };
}

export const SITE_LIMITS = { slides: 12, stats: 4, operations: 6, locations: 40, work: 12, details: 12, interval: { min: 3, max: 30 } } as const;

function fail(path: string, message: string): never {
  throw new BadRequestException(`${path}: ${message}`);
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, 'must be an object.');
  return v as Record<string, unknown>;
}

// Printable text only: control characters (other than tab/newline) are removed, not rejected.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function text(v: unknown, path: string, max: number, required = false): string {
  if (v === undefined || v === null) {
    if (required) fail(path, 'is required.');
    return '';
  }
  if (typeof v !== 'string') fail(path, 'must be text.');
  const s = (v as string).replace(CONTROL_CHARS, '').trim();
  if (required && s.length === 0) fail(path, 'cannot be empty.');
  if (s.length > max) fail(path, `is too long (at most ${max} characters).`);
  return s;
}

function items(v: unknown, path: string, max: number): unknown[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) fail(path, 'must be a list.');
  if ((v as unknown[]).length > max) fail(path, `has too many entries (at most ${max}).`);
  return v as unknown[];
}

function strings(v: unknown, path: string, maxItems: number, maxLen: number): string[] {
  return items(v, path, maxItems).map((x, i) => text(x, `${path}[${i + 1}]`, maxLen, true));
}

function entryId(v: unknown): string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : randomUUID();
}

/** A page path (one slash only: // and /\ are treated by browsers as another website), an in-page anchor, https, a phone link or an email link. Nothing else (no javascript:, no data:). */
const HREF = /^(\/(?![\/\\])[^\s<>"'\\]*|#[A-Za-z0-9_-]+|https?:\/\/[^\s<>"']+|tel:\+?[0-9 ()-]{5,24}|mailto:[^\s<>"'@]+@[^\s<>"'@]+)$/;
const HTTPS_URL = /^https:\/\/[^\s<>"']{4,480}$/;
const PHONE = /^\+?[0-9][0-9 ()-]{5,22}$/;

function link(v: unknown, path: string): string {
  const s = text(v, path, 300);
  if (s !== '' && !HREF.test(s)) fail(path, 'must be a page path such as /login, an anchor such as #contact, or an https:// link.');
  return s;
}

function slide(raw: unknown, path: string): SiteSlide {
  const o = obj(raw, path);
  if (o.type !== 'IMAGE' && o.type !== 'VIDEO') fail(`${path}.type`, 'must be IMAGE or VIDEO.');
  const mediaId = o.mediaId === undefined || o.mediaId === null || o.mediaId === '' ? null : o.mediaId;
  const url = o.url === undefined || o.url === null || o.url === '' ? null : o.url;
  if (mediaId !== null && (typeof mediaId !== 'string' || !UUID_SHAPE.test(mediaId))) fail(`${path}.mediaId`, 'is not a valid uploaded file.');
  if (url !== null && (typeof url !== 'string' || !HTTPS_URL.test(url.trim()))) fail(`${path}.url`, 'must be an https:// link.');
  if (mediaId !== null && url !== null) fail(path, 'use either an uploaded file or a link, not both.');
  if (mediaId === null && url === null) fail(path, 'needs an uploaded file or a link.');
  return {
    id: entryId(o.id),
    type: o.type as SlideType,
    mediaId: mediaId as string | null,
    url: url === null ? null : (url as string).trim(),
    alt: text(o.alt, `${path}.alt`, 160),
    caption: text(o.caption, `${path}.caption`, 120),
    enabled: o.enabled === undefined ? true : o.enabled === true,
  };
}

const CONTACT_KINDS: ContactKind[] = ['text', 'phone', 'email', 'whatsapp', 'link'];
const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

function contactDetail(raw: unknown, path: string): SiteContactDetail {
  const o = obj(raw, path);
  const kind = o.kind === undefined ? 'text' : o.kind;
  if (typeof kind !== 'string' || !CONTACT_KINDS.includes(kind as ContactKind)) fail(`${path}.kind`, 'must be text, phone, email, whatsapp or link.');
  const value = text(o.value, `${path}.value`, 200, true);
  if ((kind === 'phone' || kind === 'whatsapp') && !PHONE.test(value)) fail(`${path}.value`, 'is not a valid phone number (digits, spaces, + ( ) and - only).');
  if (kind === 'email' && !EMAIL.test(value)) fail(`${path}.value`, 'is not a valid email address.');
  if (kind === 'link' && !HTTPS_URL.test(value)) fail(`${path}.value`, 'must be an https:// link.');
  return { id: entryId(o.id), label: text(o.label, `${path}.label`, 40, true), value, kind: kind as ContactKind };
}

function phoneNumber(v: unknown, path: string): string {
  const s = text(v, path, 24, true);
  if (!PHONE.test(s)) fail(path, 'is not a valid phone number (digits, spaces, + ( ) and - only).');
  return s;
}

/** Validates and normalises what an administrator submits. Throws a readable BadRequestException on the first problem. */
export function sanitizeSiteContent(input: unknown): SiteContent {
  const root = obj(input, 'content');
  const hero = obj(root.hero ?? {}, 'hero');
  const show = obj(root.slideshow ?? {}, 'slideshow');
  const about = obj(root.about ?? {}, 'about');
  const ops = obj(root.operations ?? {}, 'operations');
  const prod = obj(root.products ?? {}, 'products');
  const contact = obj(root.contact ?? {}, 'contact');
  const footer = obj(root.footer ?? {}, 'footer');
  const brand = obj(root.brand ?? {}, 'brand');
  const signin = obj(root.signin ?? {}, 'signin');
  const logo = brand.logoMediaId === undefined || brand.logoMediaId === null || brand.logoMediaId === '' ? null : brand.logoMediaId;
  if (logo !== null && (typeof logo !== 'string' || !UUID_SHAPE.test(logo))) fail('brand.logoMediaId', 'is not a valid uploaded file.');

  const interval = show.intervalSeconds === undefined ? 6 : show.intervalSeconds;
  if (typeof interval !== 'number' || !Number.isInteger(interval) || interval < SITE_LIMITS.interval.min || interval > SITE_LIMITS.interval.max) {
    fail('slideshow.intervalSeconds', `must be a whole number of seconds from ${SITE_LIMITS.interval.min} to ${SITE_LIMITS.interval.max}.`);
  }

  const primaryLabel = text(hero.primaryLabel, 'hero.primaryLabel', 40);
  const secondaryLabel = text(hero.secondaryLabel, 'hero.secondaryLabel', 40);

  return {
    hero: {
      eyebrow: text(hero.eyebrow, 'hero.eyebrow', 60),
      headlineAccent: text(hero.headlineAccent, 'hero.headlineAccent', 60),
      headline: text(hero.headline, 'hero.headline', 120, true),
      subheadline: text(hero.subheadline, 'hero.subheadline', 400),
      checklist: strings(hero.checklist, 'hero.checklist', 6, 100),
      primaryLabel,
      primaryHref: link(hero.primaryHref, 'hero.primaryHref'),
      secondaryLabel,
      secondaryHref: link(hero.secondaryHref, 'hero.secondaryHref'),
    },
    slideshow: {
      intervalSeconds: interval as number,
      slides: items(show.slides, 'slideshow.slides', SITE_LIMITS.slides).map((s, i) => slide(s, `slideshow.slides[${i + 1}]`)),
    },
    stats: items(root.stats, 'stats', SITE_LIMITS.stats).map((raw, i) => {
      const o = obj(raw, `stats[${i + 1}]`);
      return { id: entryId(o.id), label: text(o.label, `stats[${i + 1}].label`, 40, true), value: text(o.value, `stats[${i + 1}].value`, 24, true), sub: text(o.sub, `stats[${i + 1}].sub`, 80) };
    }),
    about: {
      eyebrow: text(about.eyebrow, 'about.eyebrow', 60),
      heading: text(about.heading, 'about.heading', 120, true),
      paragraphs: strings(about.paragraphs, 'about.paragraphs', 6, 1200),
      highlights: strings(about.highlights, 'about.highlights', 8, 120),
      workHeading: text(about.workHeading, 'about.workHeading', 60),
      work: items(about.work, 'about.work', SITE_LIMITS.work).map((raw, i) => {
        const o = obj(raw, `about.work[${i + 1}]`);
        return { id: entryId(o.id), label: text(o.label, `about.work[${i + 1}].label`, 60, true), detail: text(o.detail, `about.work[${i + 1}].detail`, 200) };
      }),
    },
    operations: {
      eyebrow: text(ops.eyebrow, 'operations.eyebrow', 60),
      heading: text(ops.heading, 'operations.heading', 120, true),
      intro: text(ops.intro, 'operations.intro', 400),
      items: items(ops.items, 'operations.items', SITE_LIMITS.operations).map((raw, i) => {
        const o = obj(raw, `operations.items[${i + 1}]`);
        return { id: entryId(o.id), title: text(o.title, `operations.items[${i + 1}].title`, 60, true), body: text(o.body, `operations.items[${i + 1}].body`, 300) };
      }),
    },
    products: {
      eyebrow: text(prod.eyebrow, 'products.eyebrow', 60),
      name: text(prod.name, 'products.name', 80, true),
      tagline: text(prod.tagline, 'products.tagline', 120),
      description: text(prod.description, 'products.description', 600),
      sizesHeading: text(prod.sizesHeading, 'products.sizesHeading', 60),
      sizes: strings(prod.sizes, 'products.sizes', 12, 24),
      highlights: strings(prod.highlights, 'products.highlights', 8, 120),
      ctaLabel: text(prod.ctaLabel, 'products.ctaLabel', 40),
    },
    contact: {
      eyebrow: text(contact.eyebrow, 'contact.eyebrow', 60),
      heading: text(contact.heading, 'contact.heading', 120, true),
      intro: text(contact.intro, 'contact.intro', 400),
      details: items(contact.details, 'contact.details', SITE_LIMITS.details).map((d, i) => contactDetail(d, `contact.details[${i + 1}]`)),
      locations: items(contact.locations, 'contact.locations', SITE_LIMITS.locations).map((raw, i) => {
        const o = obj(raw, `contact.locations[${i + 1}]`);
        const phones = items(o.phones, `contact.locations[${i + 1}].phones`, 4).map((p, j) => phoneNumber(p, `contact.locations[${i + 1}].phones[${j + 1}]`));
        return { id: entryId(o.id), name: text(o.name, `contact.locations[${i + 1}].name`, 100, true), phones };
      }),
    },
    footer: {
      company: text(footer.company, 'footer.company', 80, true),
      tagline: text(footer.tagline, 'footer.tagline', 200),
      signInLabel: text(footer.signInLabel, 'footer.signInLabel', 60),
    },
    brand: {
      name: text(brand.name === undefined ? 'KAM' : brand.name, 'brand.name', 30, true),
      subtitle: text(brand.subtitle === undefined ? 'TRADING & FARMS LTD.' : brand.subtitle, 'brand.subtitle', 60),
      logoMediaId: logo as string | null,
    },
    signin: {
      showDemoAccounts: signin.showDemoAccounts === true,
      notice: text(signin.notice, 'signin.notice', 300),
    },
  };
}

/** Every uploaded file the content points at, with the type the slide expects. */
export function collectMediaRefs(content: SiteContent): { id: string; type: SlideType }[] {
  const refs = content.slideshow.slides.filter((s) => s.mediaId !== null).map((s) => ({ id: s.mediaId as string, type: s.type }));
  // the logo is an uploaded picture too, and must be protected from deletion while it is in use
  if (content.brand?.logoMediaId) refs.push({ id: content.brand.logoMediaId, type: 'IMAGE' });
  return refs;
}
