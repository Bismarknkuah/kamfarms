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

  /**
   * The price in force right now for every product and size, for one customer: the customer's own price where they have
   * one, otherwise the general list price. The same rule an order uses when it is created, so the order form can show a
   * price (or the lack of one) before anyone presses "Create order".
   */
  async effective(customerId?: string) {
    const now = new Date();
    const rows = await this.prisma.productPrice.findMany({
      where: { isActive: true, effectiveFrom: { lte: now }, OR: [{ customerId: null }, ...(customerId ? [{ customerId }] : [])] },
      orderBy: { effectiveFrom: 'desc' },
      select: { productId: true, packagingSizeId: true, customerId: true, pricePerBag: true },
    });
    const best = new Map<string, { productId: string; packagingSizeId: string; pricePerBag: number; source: 'customer' | 'list' }>();
    for (const r of rows) {
      const key = `${r.productId}|${r.packagingSizeId}`;
      const source = r.customerId ? 'customer' : 'list';
      const current = best.get(key);
      // Newest first, so the first of each kind is the one in force; a customer's own price beats the list price.
      if (!current || (source === 'customer' && current.source === 'list')) best.set(key, { productId: r.productId, packagingSizeId: r.packagingSizeId, pricePerBag: Number(r.pricePerBag), source });
    }
    return [...best.values()];
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
