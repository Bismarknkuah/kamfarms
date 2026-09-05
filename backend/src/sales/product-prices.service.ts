import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateProductPriceDto } from './dto/create-product-price.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@Injectable()
export class ProductPricesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(productId?: string, customerId?: string) {
    return this.prisma.productPrice.findMany({
      where: { productId, customerId },
      include: { product: true, packagingSize: true, customer: true },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async create(dto: CreateProductPriceDto, actor: AuthenticatedUser) {
    const price = await this.prisma.$transaction(async (tx) => {
      await tx.productPrice.updateMany({
        where: { productId: dto.productId, packagingSizeId: dto.packagingSizeId, customerId: dto.customerId ?? null, isActive: true },
        data: { isActive: false, effectiveTo: new Date(dto.effectiveFrom) },
      });

      const created = await tx.productPrice.create({
        data: {
          productId: dto.productId,
          packagingSizeId: dto.packagingSizeId,
          customerId: dto.customerId,
          pricePerBag: dto.pricePerBag,
          effectiveFrom: new Date(dto.effectiveFrom),
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
          createdById: actor.id,
        },
      });

      await this.audit.record(
        { userId: actor.id, action: 'product_price.create', entity: 'ProductPrice', entityId: created.id, afterValue: created },
        tx,
      );
      return created;
    });

    return price;
  }
}
