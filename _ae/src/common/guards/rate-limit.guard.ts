import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../config/redis.config';
import type { AuthUser } from '../decorators/current-user.decorator';

/**
 * Redis sliding-window rate limiter.
 * Route-level override with @RateLimit({ limit: 60, windowSec: 60 });
 * otherwise the global default from RATE_LIMIT_LIMIT / RATE_LIMIT_TTL applies.
 */
export const RATE_LIMIT_METADATA = 'rateLimit';

export interface RateLimitOptions {
  limit: number;
  windowSec: number;
}

export const RateLimit = (options: RateLimitOptions) =>
  Reflect.metadata(RATE_LIMIT_METADATA, options);

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const opts = this.resolveOptions(context);
    if (!opts) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    const ip = request.ip ?? '0.0.0.0';
    const bucket = `rl:${user?.sub ?? ip}:${request.route?.path ?? request.url}`;
    const now = Date.now();
    const windowStart = now - opts.windowSec * 1000;

    const multi = this.redis.multi();
    multi.zremrangebyscore(bucket, 0, windowStart);
    multi.zadd(bucket, now, `${now}:${Math.random()}`);
    multi.zcard(bucket);
    multi.expire(bucket, opts.windowSec);
    const results = await multi.exec();
    const count = (results?.[2]?.[1] as number) ?? 0;

    if (count > opts.limit) {
      throw new HttpException(
        { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: 'Too many requests' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private resolveOptions(context: ExecutionContext): RateLimitOptions | undefined {
    const handler = context.getHandler();
    const cls = context.getClass();
    const routeOpts =
      Reflect.getMetadata(RATE_LIMIT_METADATA, handler) ??
      Reflect.getMetadata(RATE_LIMIT_METADATA, cls);
    if (routeOpts) return routeOpts as RateLimitOptions;

    // Global default (disable by setting RATE_LIMIT_LIMIT=0)
    const limit = Number(process.env.RATE_LIMIT_LIMIT ?? 120);
    const windowSec = Number(process.env.RATE_LIMIT_TTL ?? 60);
    return limit > 0 ? { limit, windowSec } : undefined;
  }
}
