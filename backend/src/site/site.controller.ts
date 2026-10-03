import { Body, Controller, Delete, Get, Header, Param, Post, Put, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { SiteService } from './site.service';
import { MEDIA_LIMITS, UploadedFileLike, parseRange } from './site-media.util';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('site')
@Controller('site')
export class SiteController {
  constructor(private readonly site: SiteService) {}

  // ----- public: what any visitor's browser needs to draw the homepage -----

  /** Always revalidated, so an edit shows up for everyone straight away. The payload is a few kilobytes. */
  @Public()
  @SkipThrottle()
  @Get('content')
  @Header('Cache-Control', 'no-cache')
  getContent() {
    return this.site.getContent();
  }

  /**
   * One uploaded picture or video. Answers byte-range requests (Safari will
   * not play video without them) and is cached for a year, which is safe
   * because an uploaded file never changes: a replacement gets a new id.
   * Cross-Origin-Resource-Policy is relaxed here on purpose: the global
   * security headers would otherwise stop the website, on another domain,
   * from displaying these files.
   */
  @Public()
  @SkipThrottle()
  @Get('media/:id')
  async media(@Param('id') id: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    const media = await this.site.getMedia(id);
    const etag = `"${id}"`;
    const headers: Record<string, string> = {
      'Content-Type': media.mimeType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: etag,
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',
    };
    if (req.headers['if-none-match'] === etag) {
      res.status(304).set(headers).end();
      return;
    }
    const range = parseRange(req.headers.range, media.sizeBytes);
    if (range === 'unsatisfiable') {
      res.status(416).set({ ...headers, 'Content-Range': `bytes */${media.sizeBytes}` }).end();
      return;
    }
    if (range) {
      const chunk = media.data.subarray(range.start, range.end + 1);
      res.status(206).set({ ...headers, 'Content-Range': `bytes ${range.start}-${range.end}/${media.sizeBytes}`, 'Content-Length': String(chunk.length) }).end(chunk);
      return;
    }
    res.status(200).set({ ...headers, 'Content-Length': String(media.data.length) }).end(media.data);
  }

  // ----- System Administrator: edit the homepage -----

  @ApiBearerAuth()
  @RequirePermission(PERMISSIONS.SITE_MANAGE)
  @Get('admin/content')
  getAdminContent() {
    return this.site.getAdminContent();
  }

  @ApiBearerAuth()
  @RequirePermission(PERMISSIONS.SITE_MANAGE)
  @Put('admin/content')
  saveContent(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    return this.site.saveContent(body, actor);
  }

  @ApiBearerAuth()
  @RequirePermission(PERMISSIONS.SITE_MANAGE)
  @Delete('admin/content')
  resetContent(@CurrentUser() actor: AuthenticatedUser) {
    return this.site.resetContent(actor);
  }

  @ApiBearerAuth()
  @RequirePermission(PERMISSIONS.SITE_MANAGE)
  @Get('admin/media')
  listMedia() {
    return this.site.listMedia();
  }

  @ApiBearerAuth()
  @RequirePermission(PERMISSIONS.SITE_MANAGE)
  @Post('admin/media')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MEDIA_LIMITS.VIDEO + 1 } }))
  uploadMedia(@UploadedFile() file: UploadedFileLike | undefined, @CurrentUser() actor: AuthenticatedUser) {
    return this.site.uploadMedia(file, actor);
  }

  @ApiBearerAuth()
  @RequirePermission(PERMISSIONS.SITE_MANAGE)
  @Delete('admin/media/:id')
  deleteMedia(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.site.deleteMedia(id, actor);
  }
}
