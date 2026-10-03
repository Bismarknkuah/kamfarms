import { BadRequestException, NotFoundException } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { SiteService } from '../site.service';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';
import { MAX_MEDIA_FILES, MEDIA_LIMITS } from '../site-media.util';

const admin = { id: 'admin-1' } as AuthenticatedUser;
const IMG_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const VID_ID = '4f2504e0-4f89-41d3-9a0c-0305e82c3302';
const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const mp4Header = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom')]);
const sized = (header: Buffer, bytes: number) => Buffer.concat([header, Buffer.alloc(Math.max(bytes - header.length, 16))]);
const file = (buffer: Buffer, name = 'photo.jpg') => ({ buffer, originalname: name, size: buffer.length });

function content(slides: unknown[] = []): any {
  return {
    hero: { headline: 'Hello' }, slideshow: { intervalSeconds: 6, slides }, about: { heading: 'A' }, operations: { heading: 'O' },
    products: { name: 'P' }, contact: { heading: 'C', locations: [{ name: 'Adenta', phones: ['0241730440'] }] }, footer: { company: 'KAM' },
  };
}

function build(opts: { stored?: any; media?: { id: string; kind: string }[]; mediaCount?: number } = {}) {
  let stored = opts.stored ?? null;
  let media = [...(opts.media ?? [])];
  const prisma = {
    siteContent: {
      findUnique: jest.fn(async () => stored),
      upsert: jest.fn(async ({ create, update }: any) => {
        stored = stored
          ? { ...stored, data: update.data, version: stored.version + 1, updatedById: update.updatedById, updatedAt: new Date() }
          : { id: 'home', data: create.data, version: 1, updatedById: create.updatedById, createdAt: new Date(), updatedAt: new Date() };
        return stored;
      }),
      deleteMany: jest.fn(async () => { stored = null; return { count: 1 }; }),
    },
    siteMedia: {
      findMany: jest.fn(async (args: any) => (args?.where?.id?.in ? media.filter((m) => args.where.id.in.includes(m.id)).map(({ id, kind }) => ({ id, kind })) : media.map((m) => ({ ...m, mimeType: 'x', fileName: 'f', sizeBytes: 1, createdAt: new Date() })))),
      findUnique: jest.fn(async ({ where }: any) => media.find((m) => m.id === where.id) ?? null),
      count: jest.fn(async () => opts.mediaCount ?? media.length),
      create: jest.fn(async ({ data }: any) => ({ id: IMG_ID, kind: data.kind, mimeType: data.mimeType, fileName: data.fileName, sizeBytes: data.sizeBytes, createdAt: new Date() })),
      delete: jest.fn(async ({ where }: any) => { media = media.filter((m) => m.id !== where.id); }),
    },
    user: { findUnique: jest.fn(async () => ({ firstName: 'Ada', lastName: 'Admin' })) },
  };
  const audit = { record: jest.fn() } as unknown as AuditService;
  return { service: new SiteService(prisma as any, audit), prisma, audit };
}

describe('SiteService: the editable homepage', () => {
  describe('reading', () => {
    it('says there is no saved content yet, so the page uses its built-in text', async () => {
      expect(await build().service.getContent()).toEqual({ content: null, version: 0, updatedAt: null });
    });
    it('returns what was saved, and who saved it, to the editor', async () => {
      const { service } = build({ stored: { data: content(), version: 3, updatedAt: new Date('2026-10-03T10:00:00Z'), updatedById: 'admin-1' } });
      const out = await service.getAdminContent();
      expect(out.version).toBe(3);
      expect(out.updatedBy).toEqual({ firstName: 'Ada', lastName: 'Admin' });
    });
  });

  describe('saving', () => {
    it('stores the cleaned content, bumps the version and records who changed it', async () => {
      const { service, prisma, audit } = build();
      const first = await service.saveContent(content(), admin);
      expect(first.version).toBe(1);
      expect(first.content.hero.headline).toBe('Hello');
      const second = await service.saveContent(content(), admin);
      expect(second.version).toBe(2);
      expect(prisma.siteContent.upsert).toHaveBeenCalledTimes(2);
      expect((audit.record as jest.Mock).mock.calls[0][0]).toMatchObject({ userId: 'admin-1', action: 'site.content.update', entity: 'SiteContent' });
    });

    it('saves nothing when the content is invalid, and says why', async () => {
      const { service, prisma, audit } = build();
      const bad = content(); bad.hero.primaryHref = 'javascript:alert(1)';
      await expect(service.saveContent(bad, admin)).rejects.toThrow(/hero.primaryHref/);
      expect(prisma.siteContent.upsert).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('accepts slides that use files that exist, of the right kind', async () => {
      const { service } = build({ media: [{ id: IMG_ID, kind: 'IMAGE' }, { id: VID_ID, kind: 'VIDEO' }] });
      const out = await service.saveContent(content([{ type: 'IMAGE', mediaId: IMG_ID }, { type: 'VIDEO', mediaId: VID_ID }]), admin);
      expect(out.content.slideshow.slides).toHaveLength(2);
    });

    it('refuses a slide whose uploaded file no longer exists', async () => {
      const { service, prisma } = build({ media: [] });
      await expect(service.saveContent(content([{ type: 'IMAGE', mediaId: IMG_ID }]), admin)).rejects.toThrow(/no longer exists/);
      expect(prisma.siteContent.upsert).not.toHaveBeenCalled();
    });

    it('refuses a slide marked as a picture when the file is a video', async () => {
      const { service } = build({ media: [{ id: IMG_ID, kind: 'VIDEO' }] });
      await expect(service.saveContent(content([{ type: 'IMAGE', mediaId: IMG_ID }]), admin)).rejects.toThrow(/marked as a image but the uploaded file is a video/);
    });

    it('does not look files up at all when the slideshow uses only links', async () => {
      const { service, prisma } = build();
      await service.saveContent(content([{ type: 'IMAGE', url: 'https://cdn.example.com/a.jpg' }]), admin);
      expect(prisma.siteMedia.findMany).not.toHaveBeenCalled();
    });
  });

  it('resetting returns the page to its built-in text, keeps uploaded files, and is recorded', async () => {
    const { service, prisma, audit } = build({ stored: { data: content(), version: 2, updatedAt: new Date(), updatedById: 'admin-1' }, media: [{ id: IMG_ID, kind: 'IMAGE' }] });
    expect(await service.resetContent(admin)).toEqual({ content: null, version: 0, updatedAt: null });
    expect(prisma.siteContent.deleteMany).toHaveBeenCalled();
    expect(prisma.siteMedia.delete).not.toHaveBeenCalled();
    expect((audit.record as jest.Mock).mock.calls[0][0]).toMatchObject({ action: 'site.content.reset' });
  });

  describe('uploading', () => {
    it('stores a picture, never echoes its bytes back, and records it', async () => {
      const { service, prisma, audit } = build();
      const out: any = await service.uploadMedia(file(sized(jpegHeader, 5000), '../../Farm A.jpg'), admin);
      expect(prisma.siteMedia.create.mock.calls[0][0].data).toMatchObject({ kind: 'IMAGE', mimeType: 'image/jpeg', fileName: 'Farm A.jpg', uploadedById: 'admin-1' });
      expect(out.data).toBeUndefined();
      expect((audit.record as jest.Mock).mock.calls[0][0]).toMatchObject({ action: 'site.media.upload' });
    });
    it('stores a video', async () => {
      const { service, prisma } = build();
      await service.uploadMedia(file(sized(mp4Header, 5000), 'clip.mp4'), admin);
      expect(prisma.siteMedia.create.mock.calls[0][0].data).toMatchObject({ kind: 'VIDEO', mimeType: 'video/mp4' });
    });
    it('trusts the bytes, not the name: a program renamed .jpg is refused', async () => {
      await expect(build().service.uploadMedia(file(Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]), 'virus.jpg'), admin)).rejects.toThrow(/not supported/);
    });
    it('refuses an SVG', async () => {
      await expect(build().service.uploadMedia(file(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'logo.svg'), admin)).rejects.toThrow(/not supported/);
    });
    it('refuses nothing, and an empty file', async () => {
      await expect(build().service.uploadMedia(undefined, admin)).rejects.toThrow(/Choose a picture/);
      await expect(build().service.uploadMedia(file(Buffer.alloc(0)), admin)).rejects.toThrow(/Choose a picture/);
    });
    it('enforces a smaller limit for pictures than for videos', async () => {
      const { service } = build();
      await expect(service.uploadMedia(file(sized(jpegHeader, MEDIA_LIMITS.IMAGE + 1)), admin)).rejects.toThrow(/image is too large.*4 MB/);
      await expect(service.uploadMedia(file(sized(mp4Header, MEDIA_LIMITS.VIDEO + 1), 'a.mp4'), admin)).rejects.toThrow(/video is too large.*15 MB/);
      await expect(service.uploadMedia(file(sized(mp4Header, MEDIA_LIMITS.IMAGE + 1000), 'a.mp4'), admin)).resolves.toBeDefined(); // fine as a video
    });
    it('stops when the library is full, so the database cannot grow without bound', async () => {
      await expect(build({ mediaCount: MAX_MEDIA_FILES }).service.uploadMedia(file(sized(jpegHeader, 5000)), admin)).rejects.toThrow(/library is full/);
    });
  });

  describe('the media library', () => {
    it('marks which files the current slideshow uses', async () => {
      const { service } = build({
        stored: { data: content([{ type: 'IMAGE', mediaId: IMG_ID }]), version: 1, updatedAt: new Date(), updatedById: null },
        media: [{ id: IMG_ID, kind: 'IMAGE' }, { id: VID_ID, kind: 'VIDEO' }],
      });
      const list = await service.listMedia();
      expect(list.find((m) => m.id === IMG_ID)?.inUse).toBe(true);
      expect(list.find((m) => m.id === VID_ID)?.inUse).toBe(false);
    });
    it('will not delete a file the slideshow is using', async () => {
      const { service, prisma } = build({ stored: { data: content([{ type: 'IMAGE', mediaId: IMG_ID }]), version: 1, updatedAt: new Date(), updatedById: null }, media: [{ id: IMG_ID, kind: 'IMAGE' }] });
      await expect(service.deleteMedia(IMG_ID, admin)).rejects.toThrow(/used in the slideshow/);
      expect(prisma.siteMedia.delete).not.toHaveBeenCalled();
    });
    it('deletes an unused file and records it', async () => {
      const { service, prisma, audit } = build({ media: [{ id: VID_ID, kind: 'VIDEO' }] });
      await expect(service.deleteMedia(VID_ID, admin)).resolves.toEqual({ deleted: true });
      expect(prisma.siteMedia.delete).toHaveBeenCalledWith({ where: { id: VID_ID } });
      expect((audit.record as jest.Mock).mock.calls[0][0]).toMatchObject({ action: 'site.media.delete' });
    });
    it.each(['not-an-id', IMG_ID])('says not found for %p when there is no such file', async (id) => {
      await expect(build().service.deleteMedia(id, admin)).rejects.toThrow(NotFoundException);
    });
  });

  describe('serving a file to visitors', () => {
    it('says not found for a malformed id (never reaching the database) and for a missing one', async () => {
      const { service, prisma } = build();
      await expect(service.getMedia('../../etc/passwd')).rejects.toThrow(NotFoundException);
      expect(prisma.siteMedia.findUnique).not.toHaveBeenCalled();
      await expect(service.getMedia(IMG_ID)).rejects.toThrow(NotFoundException);
    });
  });
});

describe('streaming responses and the response wrapper', () => {
  it('a handler that sends its own response and returns nothing does not break the wrapper', async () => {
    const out = await lastValueFrom(new TransformInterceptor().intercept({} as any, { handle: () => of(undefined) } as any));
    expect(out).toBeDefined();
  });
});

// keep the unused import honest
void BadRequestException;
