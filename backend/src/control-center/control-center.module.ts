import { Module } from '@nestjs/common';
import { SupplyModule } from '../supply/supply.module';
import { ControlCenterController } from './control-center.controller';
import { ControlCenterService } from './control-center.service';

@Module({
  imports: [SupplyModule],
  controllers: [ControlCenterController],
  providers: [ControlCenterService],
})
export class ControlCenterModule {}
