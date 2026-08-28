import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type Redis from 'ioredis';
import { Public } from '../../common/decorators/public.decorator';
import { REDIS_CLIENT } from '../../config/redis.config';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe — returns 200 OK if the process is up' })
  liveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Public()
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Readiness probe — pings Postgres and Redis, 503 if either is down' })
  async readiness() {
    const checks: Record<string, { status: 'up' | 'down'; error?: string }> = {};

    try {
      await this.dataSource.query('SELECT 1');
      checks.database = { status: 'up' };
    } catch (err) {
      checks.database = { status: 'down', error: (err as Error).message };
    }

    try {
      const pong = await this.redis.ping();
      checks.redis = { status: pong === 'PONG' ? 'up' : 'down', error: pong === 'PONG' ? undefined : `unexpected reply: ${pong}` };
    } catch (err) {
      checks.redis = { status: 'down', error: (err as Error).message };
    }

    const allUp = Object.values(checks).every((c) => c.status === 'up');
    if (!allUp) {
      throw new ServiceUnavailableException({ status: 'unavailable', checks });
    }
    return { status: 'ok', checks };
  }
}
