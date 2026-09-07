import { Module } from '@nestjs/common';
import { PaddyEntriesController } from './paddy-entries.controller';
import { PaddyEntriesService } from './paddy-entries.service';

@Module({
  controllers: [PaddyEntriesController],
  providers: [PaddyEntriesService],
  exports: [PaddyEntriesService],
})
export class PaddyModule {}
