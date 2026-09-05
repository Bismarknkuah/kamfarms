import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** There is exactly one Company row in this system; seed creates it with a
   * fixed id so callers never need to know or guess it. */
  async getCompany() {
    const company = await this.prisma.company.findFirst({ include: { facilities: true } });
    if (!company) throw new NotFoundException('Company profile has not been seeded yet.');
    return company;
  }

  async updateCompany(dto: UpdateCompanyDto, actor: AuthenticatedUser) {
    const existing = await this.getCompany();
    const updated = await this.prisma.company.update({ where: { id: existing.id }, data: dto });
    await this.audit.record({
      userId: actor.id,
      action: 'organization.update_company',
      entity: 'Company',
      entityId: existing.id,
      beforeValue: existing,
      afterValue: updated,
    });
    return updated;
  }

  listFacilities() {
    return this.prisma.facility.findMany({ orderBy: { name: 'asc' } });
  }

  async createFacility(dto: CreateFacilityDto, actor: AuthenticatedUser) {
    const company = await this.getCompany();
    const facility = await this.prisma.facility.create({ data: { ...dto, companyId: company.id } });
    await this.audit.record({
      userId: actor.id,
      action: 'organization.create_facility',
      entity: 'Facility',
      entityId: facility.id,
      afterValue: facility,
    });
    return facility;
  }

  async updateFacility(id: string, dto: UpdateFacilityDto, actor: AuthenticatedUser) {
    const before = await this.prisma.facility.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Facility not found.');
    const updated = await this.prisma.facility.update({ where: { id }, data: dto });
    await this.audit.record({
      userId: actor.id,
      action: 'organization.update_facility',
      entity: 'Facility',
      entityId: id,
      beforeValue: before,
      afterValue: updated,
    });
    return updated;
  }
}
