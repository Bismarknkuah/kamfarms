import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateQualityInspectionDto } from './dto/create-quality-inspection.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@Injectable()
export class QualityInspectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(batchNumber?: string) {
    return this.prisma.qualityInspection.findMany({
      where: batchNumber ? { batchNumber } : undefined,
      include: { inspector: true },
      orderBy: { inspectionDate: 'desc' },
    });
  }

  async findById(id: string) {
    const inspection = await this.prisma.qualityInspection.findUnique({ where: { id }, include: { inspector: true } });
    if (!inspection) throw new NotFoundException('Quality inspection not found.');
    return inspection;
  }

  async create(dto: CreateQualityInspectionDto, actor: AuthenticatedUser) {
    const inspection = await this.prisma.qualityInspection.create({
      data: {
        batchNumber: dto.batchNumber,
        moisturePercent: dto.moisturePercent,
        grainQuality: dto.grainQuality,
        foreignMaterialPercent: dto.foreignMaterialPercent,
        brokenPercent: dto.brokenPercent,
        impurities: dto.impurities,
        appearance: dto.appearance,
        smell: dto.smell,
        qualityGrade: dto.qualityGrade,
        result: dto.result === 'FAILED' ? 'QUARANTINED' : dto.result,
        inspectorId: actor.id,
        notes: dto.notes,
      },
    });

    await this.audit.record({
      userId: actor.id,
      action: 'quality_inspection.create',
      entity: 'QualityInspection',
      entityId: inspection.id,
      afterValue: inspection,
    });

    return inspection;
  }

  /** Explicit release step — a quarantined batch never becomes sellable
   * just because time passed or someone re-ran the same inspection (spec
   * section 42: "Failed batches cannot be sold until released by
   * authorized personnel"). */
  async release(id: string, actor: AuthenticatedUser, notes?: string) {
    const inspection = await this.findById(id);
    if (inspection.result !== 'QUARANTINED') {
      throw new BadRequestException(`Only QUARANTINED inspections can be released (current result: ${inspection.result}).`);
    }

    const updated = await this.prisma.qualityInspection.update({
      where: { id },
      data: { result: 'RELEASED', notes: notes ?? inspection.notes },
    });

    await this.audit.record({
      userId: actor.id,
      action: 'quality_inspection.release',
      entity: 'QualityInspection',
      entityId: id,
      beforeValue: { result: 'QUARANTINED' },
      afterValue: { result: 'RELEASED' },
      reason: notes,
    });

    return updated;
  }
}
