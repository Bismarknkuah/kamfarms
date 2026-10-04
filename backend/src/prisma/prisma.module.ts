import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { SchemaCheckService } from './schema-check.service';

@Global()
@Module({
  providers: [PrismaService, SchemaCheckService],
  exports: [PrismaService, SchemaCheckService],
})
export class PrismaModule {}
