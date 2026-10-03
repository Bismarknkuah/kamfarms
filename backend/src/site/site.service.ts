import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UUID_SHAPE } from '../common/validators/is-uuid-like';
import { SiteContent, collectMediaRefs, sanitizeSiteContent } from './site-content.schema';
import { MAX_MEDIA_FILES, MEDIA_LIMITS, UploadedFileLike, detectMedia, safeFileName } from './site-media.util';

const HOME_ID = 'home';

// Explicit shapes for what comes back from the database. Prisma's generated
// types are not available in every environment this code is checked in, so the
// service states exactly what it relies on instead of inferring it.
export interface StoredRow { data: unknown; version: number; updatedAt: Date; updatedById: string | null }
export interface MediaMeta { id: string; kind: string; mimeType: string; fileName: string; sizeBytes: number; createdAt: Date }
const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

@Injectable()
export class SiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** What the public homepage shows. content is null until an administrator saves one (the page then uses its built-in text). */
  async getContent() {
    const row = (await this.prisma.siteContent.findUnique({ where: { id: HOME_ID } })) as StoredRow | null;
    return {
      content: (row?.data ?? null) as SiteContent | null,
      version: row?.version ?? 0,
      updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    };
  }

  async getAdminContent() {
    const base = await this.getContent();
    const row = (await this.prisma.siteContent.findUnique({ where: { id: HOME_ID }, select: { updatedById: true } })) as { updatedById: string | null } | null;
    const who = row?.updatedById
      ? ((await this.prisma.user.findUnique({ where: { id: row.updatedById }, select: { firstName: true, lastName: true } })) as { firstName: string; lastName: string } | null)
      : null;
    return { ...base, updatedBy: who ? { firstName: who.firstName, lastName: who.lastName } : null };
  }

  async saveContent(input: unknown, actor: AuthenticatedUser) {
    const clean = sanitizeSiteContent(input);

    // Every uploaded file the slideshow points at must exist and be the kind the slide says it is.
    const refs = collectMediaRefs(clean);
    if (refs.length > 0) {
      const found = (await this.prisma.siteMedia.findMany({
        where: { id: { in: Array.from(new Set(refs.map((r) => r.id))) } },
        select: { id: true, kind: true },
      })) as { id: string; kind: string }[];
      const kindById = new Map<string, string>();
      for (const f of found) kindById.set(f.id, f.kind);
      for (const r of refs) {
        const kind = kindById.get(r.id);
        if (!kind) throw new BadRequestException('A picture or video in the slideshow no longer exists. Remove it and add it again.');
        if (kind !== r.type) throw new BadRequestException(`A slide is marked as a ${r.type.toLowerCase()} but the uploaded file is a ${kind.toLowerCase()}.`);
      }
    }

    // The JSON column takes any plain object; the cast keeps this independent of Prisma's generated JSON types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = clean as any;
    const row = (await this.prisma.siteContent.upsert({
      where: { id: HOME_ID },
      create: { id: HOME_ID, data, updatedById: actor.id },
      update: { data, version: { increment: 1 }, updatedById: actor.id },
    })) as StoredRow;
    await this.audit.record({
      userId: actor.id,
      action: 'site.content.update',
      entity: 'SiteContent',
      entityId: HOME_ID,
      afterValue: { version: row.version, slides: clean.slideshow.slides.length, locations: clean.contact.locations.length },
    });
    return { content: clean, version: row.version, updatedAt: new Date(row.updatedAt).toISOString() };
  }

  /** Back to the page's built-in text and no slideshow. Uploaded files are kept. */
  async resetContent(actor: AuthenticatedUser) {
    await this.prisma.siteContent.deleteMany({ where: { id: HOME_ID } });
    await this.audit.record({ userId: actor.id, action: 'site.content.reset', entity: 'SiteContent', entityId: HOME_ID, afterValue: { reset: true } });
    return { content: null, version: 0, updatedAt: null };
  }

  async uploadMedia(file: UploadedFileLike | undefined, actor: AuthenticatedUser) {
    if (!file || !file.buffer || file.buffer.length === 0) throw new BadRequestException('Choose a picture or a video to upload.');
    const detected = detectMedia(file.buffer);
    if (!detected) throw new BadRequestException('That file is not supported. Use a JPEG, PNG or WebP picture, or an MP4 or WebM video.');
    const limit = MEDIA_LIMITS[detected.kind];
    if (file.buffer.length > limit) {
      throw new BadRequestException(`That ${detected.kind.toLowerCase()} is too large. The limit is ${mb(limit)} for a ${detected.kind.toLowerCase()}.`);
    }
    if ((await this.prisma.siteMedia.count()) >= MAX_MEDIA_FILES) {
      throw new BadRequestException(`The library is full (${MAX_MEDIA_FILES} files). Delete files you no longer use first.`);
    }

    const created = (await this.prisma.siteMedia.create({
      data: {
        kind: detected.kind,
        mimeType: detected.mime,
        fileName: safeFileName(file.originalname, detected.kind === 'IMAGE' ? 'picture' : 'video'),
        sizeBytes: file.buffer.length,
        data: file.buffer,
        uploadedById: actor.id,
      },
      select: { id: true, kind: true, mimeType: true, fileName: true, sizeBytes: true, createdAt: true },
    })) as MediaMeta;
    await this.audit.record({
      userId: actor.id,
      action: 'site.media.upload',
      entity: 'SiteMedia',
      entityId: created.id,
      afterValue: { kind: created.kind, fileName: created.fileName, sizeBytes: created.sizeBytes },
    });
    return created;
  }

  async listMedia() {
    const [files, current] = await Promise.all([
      this.prisma.siteMedia.findMany({
        select: { id: true, kind: true, mimeType: true, fileName: true, sizeBytes: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }) as Promise<MediaMeta[]>,
      this.getContent(),
    ]);
    const used = new Set(current.content ? collectMediaRefs(current.content).map((r) => r.id) : []);
    return files.map((f) => ({ ...f, inUse: used.has(f.id) }));
  }

  async deleteMedia(id: string, actor: AuthenticatedUser) {
    const file = UUID_SHAPE.test(id)
      ? ((await this.prisma.siteMedia.findUnique({ where: { id }, select: { id: true, fileName: true } })) as { id: string; fileName: string } | null)
      : null;
    if (!file) throw new NotFoundException('That file was not found.');
    const { content } = await this.getContent();
    if (content && collectMediaRefs(content).some((r) => r.id === id)) {
      throw new BadRequestException('This file is in use on the homepage (the slideshow or the logo). Remove it there and save first.');
    }
    await this.prisma.siteMedia.delete({ where: { id } });
    await this.audit.record({ userId: actor.id, action: 'site.media.delete', entity: 'SiteMedia', entityId: id, afterValue: { fileName: file.fileName } });
    return { deleted: true };
  }

  /** The bytes of one uploaded file, for the public media route. */
  async getMedia(id: string) {
    const media = UUID_SHAPE.test(id)
      ? ((await this.prisma.siteMedia.findUnique({ where: { id }, select: { mimeType: true, sizeBytes: true, data: true } })) as { mimeType: string; sizeBytes: number; data: Buffer } | null)
      : null;
    if (!media) throw new NotFoundException('Not found.');
    return media;
  }
}
