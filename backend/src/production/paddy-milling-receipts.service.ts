import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePaddyMillingReceiptDto } from './dto/create-paddy-milling-receipt.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

const STANDARD_PADDY_BAG_WEIGHT_KG = 50;

@Injectable()
export class PaddyMillingReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(millingCenterId?: string) {
    return this.prisma.paddyMillingReceipt.findMany({
      where: millingCenterId ? { millingCenterId } : {},
      include: { millingCenter: true, recordedBy: true, lines: { include: { paddyGrade: true } } },
      orderBy: { date: 'desc' },
    });
  }

  async create(dto: CreatePaddyMillingReceiptDto, actor: AuthenticatedUser) {
    const center = await this.prisma.millingCenter.findUnique({ where: { id: dto.millingCenterId } });
    if (!center || !center.isActive) throw new BadRequestException('Milling center not found or inactive.');

    const created = await this.prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const prefix = `PMR-${year}-`;
      const count = await tx.paddyMillingReceipt.count({ where: { receiptNumber: { startsWith: prefix } } });
      const receiptNumber = `${prefix}${String(count + 1).padStart(6, '0')}`;

      const record = await tx.paddyMillingReceipt.create({
        data: {
          receiptNumber,
          millingCenterId: dto.millingCenterId,
          date: new Date(dto.date),
          recordedById: actor.id,
          notes: dto.notes,
          lines: {
            create: dto.lines.map((line) => ({
              paddyGradeId: line.paddyGradeId,
              bagCount: line.bagCount,
              kg: line.kg ?? line.bagCount * STANDARD_PADDY_BAG_WEIGHT_KG,
            })),
          },
        },
        include: { millingCenter: true, recordedBy: true, lines: { include: { paddyGrade: true } } },
      });

      await this.audit.record({ userId: actor.id, action: 'paddy_milling_receipt.create', entity: 'PaddyMillingReceipt', entityId: record.id, afterValue: record }, tx);
      return record;
    });

    return created;
  }
}
