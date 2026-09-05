import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(search?: string) {
    return this.prisma.customer.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { company: { contains: search, mode: 'insensitive' } },
              { customerNumber: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found.');
    return customer;
  }

  async create(dto: CreateCustomerDto, actor: AuthenticatedUser) {
    const customer = await this.prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const prefix = `CUST-${year}-`;
      const count = await tx.customer.count({ where: { customerNumber: { startsWith: prefix } } });
      const customerNumber = `${prefix}${String(count + 1).padStart(6, '0')}`;

      const created = await tx.customer.create({
        data: {
          customerNumber,
          name: dto.name,
          company: dto.company,
          phone: dto.phone,
          email: dto.email,
          address: dto.address,
          location: dto.location,
          idOrBusinessRef: dto.idOrBusinessRef,
          creditLimit: dto.creditLimit ?? 0,
          paymentTerms: dto.paymentTerms,
          notes: dto.notes,
        },
      });

      await this.audit.record(
        { userId: actor.id, action: 'customer.create', entity: 'Customer', entityId: created.id, afterValue: created },
        tx,
      );
      return created;
    });

    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto, actor: AuthenticatedUser) {
    const before = await this.findById(id);
    const updated = await this.prisma.customer.update({ where: { id }, data: dto });
    await this.audit.record({
      userId: actor.id,
      action: 'customer.update',
      entity: 'Customer',
      entityId: id,
      beforeValue: before,
      afterValue: updated,
    });
    return updated;
  }
}
