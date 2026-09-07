import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] });
  }

  listGroupedByModule() {
    return this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] }).then((rows) => {
      const grouped: Record<string, typeof rows> = {};
      for (const row of rows) {
        grouped[row.module] = grouped[row.module] ?? [];
        grouped[row.module].push(row);
      }
      return grouped;
    });
  }
}
