import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrganizationService } from './organization.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('organization')
@ApiBearerAuth()
@Controller('organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get('company')
  @RequirePermission(PERMISSIONS.DASHBOARD_VIEW)
  getCompany() {
    return this.organizationService.getCompany();
  }

  @Patch('company')
  @RequirePermission(PERMISSIONS.ORGANIZATION_MANAGE)
  updateCompany(@Body() dto: UpdateCompanyDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.organizationService.updateCompany(dto, actor);
  }

  @Get('facilities')
  @RequirePermission(PERMISSIONS.DASHBOARD_VIEW)
  listFacilities() {
    return this.organizationService.listFacilities();
  }

  @Post('facilities')
  @RequirePermission(PERMISSIONS.ORGANIZATION_MANAGE)
  createFacility(@Body() dto: CreateFacilityDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.organizationService.createFacility(dto, actor);
  }

  @Patch('facilities/:id')
  @RequirePermission(PERMISSIONS.ORGANIZATION_MANAGE)
  updateFacility(@Param('id') id: string, @Body() dto: UpdateFacilityDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.organizationService.updateFacility(id, dto, actor);
  }
}
