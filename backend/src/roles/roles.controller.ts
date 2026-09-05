import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { CloneRoleDto } from './dto/clone-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermission(PERMISSIONS.ROLES_MANAGE)
  list() {
    return this.rolesService.list();
  }

  @Get(':code')
  @RequirePermission(PERMISSIONS.ROLES_MANAGE)
  findOne(@Param('code') code: string) {
    return this.rolesService.findByCode(code);
  }

  @Post()
  @RequirePermission(PERMISSIONS.ROLES_MANAGE)
  create(@Body() dto: CreateRoleDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.rolesService.create(dto, actor);
  }

  @Post(':code/clone')
  @RequirePermission(PERMISSIONS.ROLES_MANAGE)
  clone(@Param('code') code: string, @Body() dto: CloneRoleDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.rolesService.clone(code, dto, actor);
  }

  @Patch(':code/permissions')
  @RequirePermission(PERMISSIONS.PERMISSIONS_MANAGE)
  updatePermissions(@Param('code') code: string, @Body() dto: UpdateRolePermissionsDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.rolesService.updatePermissions(code, dto, actor);
  }

  @Delete(':code')
  @RequirePermission(PERMISSIONS.ROLES_MANAGE)
  remove(@Param('code') code: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.rolesService.delete(code, actor);
  }
}
