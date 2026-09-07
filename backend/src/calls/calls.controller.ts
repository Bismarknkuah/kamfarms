import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CallsService } from './calls.service';
import { CreateCallRequestDto } from './dto/create-call-request.dto';
import { RespondToCallRequestDto } from './dto/respond-to-call-request.dto';
import { InitiateCallDto } from './dto/initiate-call.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('calls')
@ApiBearerAuth()
@Controller()
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Get('calls/active')
  @RequirePermission(PERMISSIONS.MESSAGES_SEND)
  myActiveCall(@CurrentUser() actor: AuthenticatedUser) {
    return this.callsService.myActiveCall(actor);
  }

  @Get('call-requests')
  @RequirePermission(PERMISSIONS.MESSAGES_SEND)
  listMyCallRequests(@CurrentUser() actor: AuthenticatedUser) {
    return this.callsService.listMyCallRequests(actor);
  }

  @Post('call-requests')
  @RequirePermission(PERMISSIONS.MESSAGES_SEND)
  requestCall(@Body() dto: CreateCallRequestDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.callsService.requestCall(dto, actor);
  }

  @Post('call-requests/:id/respond')
  @RequirePermission(PERMISSIONS.MESSAGES_SEND)
  respondToCallRequest(@Param('id') id: string, @Body() dto: RespondToCallRequestDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.callsService.respondToCallRequest(id, dto, actor);
  }

  @Post('calls')
  @RequirePermission(PERMISSIONS.MESSAGES_SEND)
  initiateCall(@Body() dto: InitiateCallDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.callsService.initiateCall(dto, actor);
  }

  @Post('calls/:id/join')
  @RequirePermission(PERMISSIONS.MESSAGES_SEND)
  joinCall(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.callsService.joinCall(id, actor);
  }

  @Post('calls/:id/decline')
  @RequirePermission(PERMISSIONS.MESSAGES_SEND)
  declineCall(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.callsService.declineCall(id, actor);
  }

  @Post('calls/:id/leave')
  @RequirePermission(PERMISSIONS.MESSAGES_SEND)
  leaveCall(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.callsService.leaveCall(id, actor);
  }
}
