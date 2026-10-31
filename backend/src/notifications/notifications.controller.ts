import { Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // No @RequirePermission here - every authenticated user can see and
  // manage their own notifications; the query is always scoped to the
  // caller's own id, never a param the caller could substitute.
  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Query('unreadOnly') unreadOnly?: string) {
    return this.notificationsService.listForUser(actor.id, unreadOnly === 'true');
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() actor: AuthenticatedUser) {
    return this.notificationsService.unreadCount(actor.id);
  }

  @Post(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.notificationsService.markRead(id, actor.id);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() actor: AuthenticatedUser) {
    return this.notificationsService.markAllRead(actor.id);
  }

  /** Clear old notifications: ?scope=read (default) | older (&days=30) | all. Declared before :id so "clear" is not read as an id. */
  @Delete()
  clear(@CurrentUser() actor: AuthenticatedUser, @Query('scope') scope?: string, @Query('days') days?: string) {
    const s = scope === 'all' || scope === 'older' ? scope : 'read';
    return this.notificationsService.clear(actor.id, s, days === undefined ? 30 : Number(days));
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.notificationsService.remove(id, actor.id);
  }
}
