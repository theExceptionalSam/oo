import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, of, switchMap } from 'rxjs';
import { Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../config/redis.config';

/**
 * Simple method-level cache backed by Redis. Use as:
 *   @UseInterceptors(CacheInterceptor)
 *   @CacheKey('schools:list', 60)
 */
export const CACHE_KEY_METADATA = 'cache:key';
export const CACHE_TTL_METADATA = 'cache:ttl';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const handler = context.getHandler();
    const key = Reflect.getMetadata(CACHE_KEY_METADATA, handler);
    if (!key) return next.handle();

    const ttl = Reflect.getMetadata(CACHE_TTL_METADATA, handler) ?? 60;

    return from(this.redis.get(key)).pipe(
      switchMap((cached) => {
        if (cached) return of(JSON.parse(cached));
        return next.handle().pipe(
          switchMap((data) =>
            from(this.redis.set(key, JSON.stringify(data), 'EX', ttl)).pipe(
              switchMap(() => of(data)),
            ),
          ),
        );
      }),
    );
  }
}
