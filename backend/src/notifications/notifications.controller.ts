import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // No @RequirePermission here — every authenticated user can see and
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
}
