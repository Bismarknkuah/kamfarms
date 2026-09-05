import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MasterDataService } from './master-data.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreatePackagingSizeDto } from './dto/create-packaging-size.dto';
import { CreatePaddyGradeDto } from './dto/create-paddy-grade.dto';
import { CreatePaddyTypeDto } from './dto/create-paddy-type.dto';
import { ToggleActiveDto } from './dto/toggle-active.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('master-data')
@ApiBearerAuth()
@Controller('master-data')
export class MasterDataController {
  constructor(private readonly masterDataService: MasterDataService) {}

  // Products
  @Get('products')
  @RequirePermission(PERMISSIONS.DASHBOARD_VIEW)
  listProducts() {
    return this.masterDataService.listProducts();
  }

  @Post('products')
  @RequirePermission(PERMISSIONS.MASTERDATA_MANAGE)
  createProduct(@Body() dto: CreateProductDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.masterDataService.createProduct(dto, actor);
  }

  @Patch('products/:id/active')
  @RequirePermission(PERMISSIONS.MASTERDATA_MANAGE)
  toggleProduct(@Param('id') id: string, @Body() dto: ToggleActiveDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.masterDataService.toggleProduct(id, dto, actor);
  }

  // Packaging sizes
  @Get('packaging-sizes')
  @RequirePermission(PERMISSIONS.DASHBOARD_VIEW)
  listPackagingSizes() {
    return this.masterDataService.listPackagingSizes();
  }

  @Post('packaging-sizes')
  @RequirePermission(PERMISSIONS.MASTERDATA_MANAGE)
  createPackagingSize(@Body() dto: CreatePackagingSizeDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.masterDataService.createPackagingSize(dto, actor);
  }

  @Patch('packaging-sizes/:id/active')
  @RequirePermission(PERMISSIONS.MASTERDATA_MANAGE)
  togglePackagingSize(@Param('id') id: string, @Body() dto: ToggleActiveDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.masterDataService.togglePackagingSize(id, dto, actor);
  }

  // Paddy grades
  @Get('paddy-grades')
  @RequirePermission(PERMISSIONS.DASHBOARD_VIEW)
  listPaddyGrades() {
    return this.masterDataService.listPaddyGrades();
  }

  @Post('paddy-grades')
  @RequirePermission(PERMISSIONS.MASTERDATA_MANAGE)
  createPaddyGrade(@Body() dto: CreatePaddyGradeDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.masterDataService.createPaddyGrade(dto, actor);
  }

  @Patch('paddy-grades/:id/active')
  @RequirePermission(PERMISSIONS.MASTERDATA_MANAGE)
  togglePaddyGrade(@Param('id') id: string, @Body() dto: ToggleActiveDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.masterDataService.togglePaddyGrade(id, dto, actor);
  }

  // Paddy types
  @Get('paddy-types')
  @RequirePermission(PERMISSIONS.DASHBOARD_VIEW)
  listPaddyTypes() {
    return this.masterDataService.listPaddyTypes();
  }

  @Post('paddy-types')
  @RequirePermission(PERMISSIONS.MASTERDATA_MANAGE)
  createPaddyType(@Body() dto: CreatePaddyTypeDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.masterDataService.createPaddyType(dto, actor);
  }

  // Expense categories — list-only here on purpose: anyone who can log
  // an expense (dashboard.view is universal) needs to pick a category,
  // but creating new categories stays a masterdata.manage action, same
  // as every other master-data list in this controller.
  @Get('expense-categories')
  @RequirePermission(PERMISSIONS.DASHBOARD_VIEW)
  listExpenseCategories() {
    return this.masterDataService.listExpenseCategories();
  }
}
