import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    const checks: Record<string, 'ok' | 'error'> = {};

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.postgres = 'ok';
    } catch {
      checks.postgres = 'error';
    }

    // Redis/AI-service/storage checks are added as those services come
    // online in later phases (Redis in Phase 9 for queues/cache, AI service
    // in Phase 11, MinIO wherever document upload lands).
    const healthy = Object.values(checks).every((v) => v === 'ok');

    return {
      success: healthy,
      message: healthy ? 'All checked systems healthy.' : 'One or more systems degraded.',
      errorCode: healthy ? null : 'SYSTEM_DEGRADED',
      data: { status: healthy ? 'healthy' : 'degraded', checks, timestamp: new Date().toISOString() },
    };
  }
}
