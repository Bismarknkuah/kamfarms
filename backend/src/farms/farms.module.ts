import { Module } from '@nestjs/common';
import { FarmsController } from './farms.controller';
import { FarmsService } from './farms.service';
import { FarmEquipmentController } from './farm-equipment.controller';
import { FarmEquipmentService } from './farm-equipment.service';

@Module({
  controllers: [FarmsController, FarmEquipmentController],
  providers: [FarmsService, FarmEquipmentService],
  exports: [FarmsService, FarmEquipmentService],
})
export class FarmsModule {}
