import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreatePackagingSizeDto } from './dto/create-packaging-size.dto';
import { CreatePaddyGradeDto } from './dto/create-paddy-grade.dto';
import { CreatePaddyTypeDto } from './dto/create-paddy-type.dto';
import { ToggleActiveDto } from './dto/toggle-active.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@Injectable()
export class MasterDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---- Products -----------------------------------------------------
  listProducts() {
    return this.prisma.product.findMany({ orderBy: { name: 'asc' } });
  }

  async createProduct(dto: CreateProductDto, actor: AuthenticatedUser) {
    const product = await this.prisma.product.create({ data: dto });
    await this.audit.record({ userId: actor.id, action: 'product.create', entity: 'Product', entityId: product.id, afterValue: product });
    return product;
  }

  async toggleProduct(id: string, dto: ToggleActiveDto, actor: AuthenticatedUser) {
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Product not found.');
    const updated = await this.prisma.product.update({ where: { id }, data: { isActive: dto.isActive } });
    await this.audit.record({ userId: actor.id, action: 'product.toggle_active', entity: 'Product', entityId: id, beforeValue: before, afterValue: updated });
    return updated;
  }

  // ---- Packaging sizes (configurable — never hard-code 1/2/5/10/25/50) --
  listPackagingSizes() {
    return this.prisma.packagingSize.findMany({ orderBy: { sizeKg: 'asc' } });
  }

  async createPackagingSize(dto: CreatePackagingSizeDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.packagingSize.findUnique({ where: { label: dto.label } });
    if (existing) throw new ConflictException('A packaging size with this label already exists.');
    const size = await this.prisma.packagingSize.create({ data: dto });
    await this.audit.record({ userId: actor.id, action: 'packaging_size.create', entity: 'PackagingSize', entityId: size.id, afterValue: size });
    return size;
  }

  async togglePackagingSize(id: string, dto: ToggleActiveDto, actor: AuthenticatedUser) {
    const before = await this.prisma.packagingSize.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Packaging size not found.');
    const updated = await this.prisma.packagingSize.update({ where: { id }, data: { isActive: dto.isActive } });
    await this.audit.record({ userId: actor.id, action: 'packaging_size.toggle_active', entity: 'PackagingSize', entityId: id, beforeValue: before, afterValue: updated });
    return updated;
  }

  // ---- Paddy grades (configurable — Size 4 / Size 5 are seed data, not a
  // fixed enum; Admin can add Size 6, Premium, etc.) ----------------------
  listPaddyGrades() {
    return this.prisma.paddyGrade.findMany({ orderBy: { code: 'asc' } });
  }

  async createPaddyGrade(dto: CreatePaddyGradeDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.paddyGrade.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('A paddy grade with this code already exists.');
    const grade = await this.prisma.paddyGrade.create({ data: dto });
    await this.audit.record({ userId: actor.id, action: 'paddy_grade.create', entity: 'PaddyGrade', entityId: grade.id, afterValue: grade });
    return grade;
  }

  async togglePaddyGrade(id: string, dto: ToggleActiveDto, actor: AuthenticatedUser) {
    const before = await this.prisma.paddyGrade.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Paddy grade not found.');
    const updated = await this.prisma.paddyGrade.update({ where: { id }, data: { isActive: dto.isActive } });
    await this.audit.record({ userId: actor.id, action: 'paddy_grade.toggle_active', entity: 'PaddyGrade', entityId: id, beforeValue: before, afterValue: updated });
    return updated;
  }

  // ---- Paddy types -------------------------------------------------------
  listPaddyTypes() {
    return this.prisma.paddyType.findMany({ orderBy: { name: 'asc' } });
  }

  listExpenseCategories() {
    return this.prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  async createPaddyType(dto: CreatePaddyTypeDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.paddyType.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('A paddy type with this name already exists.');
    const type = await this.prisma.paddyType.create({ data: dto });
    await this.audit.record({ userId: actor.id, action: 'paddy_type.create', entity: 'PaddyType', entityId: type.id, afterValue: type });
    return type;
  }
}
