import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  private meta(req: Request) {
    return { ipAddress: req.ip, userAgent: req.headers['user-agent'] as string | undefined };
  }

  /** Declared before :id — otherwise NestJS would try to match
   * "directory" as a user id and 400 on the UUID pipe. No :id-shaped
   * conflict risk if this stays above the :id route. */
  @Get('directory')
  @RequirePermission(PERMISSIONS.MESSAGES_SEND)
  directory() {
    return this.usersService.directory();
  }

  @Get()
  @RequirePermission([PERMISSIONS.USERS_MANAGE, PERMISSIONS.TASKS_ASSIGN])
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.usersService.list(
      {
        search,
        status,
        page: page ? parseInt(page, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      },
      actor,
    );
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.USERS_MANAGE)
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.USERS_MANAGE)
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: Request) {
    return this.usersService.create(dto, actor, this.meta(req));
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.USERS_MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: Request) {
    return this.usersService.update(id, dto, actor, this.meta(req));
  }

  @Post(':id/roles')
  @RequirePermission(PERMISSIONS.ROLES_MANAGE)
  assignRole(@Param('id') id: string, @Body() dto: AssignRoleDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.assignRole(id, dto, actor);
  }

  @Delete(':id/roles/:roleCode')
  @RequirePermission(PERMISSIONS.ROLES_MANAGE)
  removeRole(@Param('id') id: string, @Param('roleCode') roleCode: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.removeRole(id, roleCode, actor);
  }
}
