import { Module } from '@nestjs/common';
import { DispatchTrackingController } from './dispatch-tracking.controller';
import { DispatchTrackingService } from './dispatch-tracking.service';

@Module({ controllers: [DispatchTrackingController], providers: [DispatchTrackingService], exports: [DispatchTrackingService] })
export class DispatchTrackingModule {}
