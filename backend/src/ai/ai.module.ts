import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiPredictionsService } from './ai-predictions.service';
import { AiAssistantService } from './ai-assistant.service';
import { ReportsModule } from '../reports/reports.module';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [ReportsModule, FinanceModule],
  controllers: [AiController],
  providers: [AiPredictionsService, AiAssistantService],
  exports: [AiPredictionsService, AiAssistantService],
})
export class AiModule {}
