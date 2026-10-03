import { Module } from '@nestjs/common';
import { SystemOverviewController } from './system-overview.controller';
import { SystemOverviewService } from './system-overview.service';

@Module({ controllers: [SystemOverviewController], providers: [SystemOverviewService] })
export class SystemOverviewModule {}
