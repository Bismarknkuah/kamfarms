import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MessagingService } from './messaging.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { RespondMessageDto } from './dto/respond-message.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('messaging')
@ApiBearerAuth()
@Controller()
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Get('conversations')
  listConversations(@CurrentUser() actor: AuthenticatedUser) {
    return this.messagingService.listConversations(actor);
  }

  @Post('conversations')
  @RequirePermission(PERMISSIONS.MESSAGES_SEND)
  createConversation(@Body() dto: CreateConversationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.messagingService.createConversation(dto, actor);
  }

  @Get('conversations/:id/messages')
  listMessages(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.messagingService.listMessages(id, actor);
  }

  @Post('conversations/:id/messages')
  @RequirePermission(PERMISSIONS.MESSAGES_SEND)
  sendMessage(@Param('id') id: string, @Body() dto: SendMessageDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.messagingService.sendMessage(id, dto, actor);
  }

  @Post('messages/:id/acknowledge')
  acknowledge(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.messagingService.acknowledge(id, actor);
  }

  @Post('messages/:id/respond')
  respond(@Param('id') id: string, @Body() dto: RespondMessageDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.messagingService.respond(id, dto, actor);
  }
}
