import { Module } from '@nestjs/common';
import { PackagingBatchesController } from './packaging-batches.controller';
import { PackagingBatchesService } from './packaging-batches.service';

@Module({
  controllers: [PackagingBatchesController],
  providers: [PackagingBatchesService],
  exports: [PackagingBatchesService],
})
export class PackagingModule {}
