import { Global, Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsRegistryController } from './settings-registry.controller';
import { SettingsService } from './settings.service';

@Global()
@Module({
  controllers: [SettingsController, SettingsRegistryController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
