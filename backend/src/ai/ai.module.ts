import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiPredictionsService } from './ai-predictions.service';
import { AiAssistantService } from './ai-assistant.service';
import { AiInsightsService } from './ai-insights.service';
import { AiToolsService } from './ai-tools.service';
import { AiAgentService } from './ai-agent.service';
import { ReportsModule } from '../reports/reports.module';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [ReportsModule, FinanceModule],
  controllers: [AiController],
  providers: [AiPredictionsService, AiAssistantService, AiInsightsService, AiToolsService, AiAgentService],
  exports: [AiPredictionsService, AiAssistantService, AiInsightsService, AiToolsService, AiAgentService],
})
export class AiModule {}
