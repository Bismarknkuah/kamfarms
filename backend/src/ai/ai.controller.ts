import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AiPredictionsService } from './ai-predictions.service';
import { AiAssistantService } from './ai-assistant.service';
import { AiInsightsService } from './ai-insights.service';
import { PredictFromEnergyDto } from './dto/predict-from-energy.dto';
import { PredictFromPaddyDto } from './dto/predict-from-paddy.dto';
import { PredictFromRiceDto } from './dto/predict-from-rice.dto';
import { PredictProductionDto } from './dto/predict-production.dto';
import { PredictEnergyDto } from './dto/predict-energy.dto';
import { ForecastStockDto } from './dto/forecast-stock.dto';
import { AskAssistantDto } from './dto/ask-assistant.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(
    private readonly predictionsService: AiPredictionsService,
    private readonly assistantService: AiAssistantService,
    private readonly insightsService: AiInsightsService,
  ) {}

  @Post('predict-production')
  @RequirePermission(PERMISSIONS.AI_USE)
  predictProduction(@Body() dto: PredictProductionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.predictionsService.predictProduction(dto, actor);
  }

  @Post('predict-energy')
  @RequirePermission(PERMISSIONS.AI_USE)
  predictEnergy(@Body() dto: PredictEnergyDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.predictionsService.predictEnergyConsumption(dto, actor);
  }

  @Post('forecast-stock')
  @RequirePermission(PERMISSIONS.AI_USE)
  forecastStock(@Body() dto: ForecastStockDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.predictionsService.forecastStockDepletion(dto, actor);
  }

  @Get('anomalies')
  @RequirePermission(PERMISSIONS.AI_VIEW)
  anomalies(@CurrentUser() actor: AuthenticatedUser) {
    return this.predictionsService.recentAnomalies(actor);
  }

  @Post('assistant/ask')
  @RequirePermission(PERMISSIONS.AI_USE)
  ask(@Body() dto: AskAssistantDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.assistantService.ask(dto, actor);
  }

  /** The AI page's data: what power and paddy turn into, within the asker's jurisdiction (the whole company for the MD and CEO). */
  @Get('insights')
  @RequirePermission(PERMISSIONS.AI_VIEW)
  insights(@CurrentUser() actor: AuthenticatedUser) {
    return this.insightsService.overview(actor);
  }

  /** Expected against actual for each milling run, per milling center, plus how the AI itself is learning. */
  @Get('feedback')
  @RequirePermission(PERMISSIONS.AI_VIEW)
  feedback(@CurrentUser() actor: AuthenticatedUser, @Query('days') days?: string, @Query('millingCenterId') millingCenterId?: string) {
    const n = days ? parseInt(days, 10) : NaN;
    return this.insightsService.feedback(actor, { days: Number.isFinite(n) ? n : 30, millingCenterId: millingCenterId || undefined });
  }

  @Post('predict-from-energy')
  @RequirePermission(PERMISSIONS.AI_USE)
  predictFromEnergy(@Body() dto: PredictFromEnergyDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.insightsService.predictFromEnergy(dto, actor);
  }

  @Post('predict-from-paddy')
  @RequirePermission(PERMISSIONS.AI_USE)
  predictFromPaddy(@Body() dto: PredictFromPaddyDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.insightsService.predictFromPaddy(dto, actor);
  }

  @Post('predict-from-rice')
  @RequirePermission(PERMISSIONS.AI_USE)
  predictFromRice(@Body() dto: PredictFromRiceDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.insightsService.predictFromRice(dto, actor);
  }
}
