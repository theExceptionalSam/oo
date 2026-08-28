import { SetMetadata } from '@nestjs/common';
import { CACHE_KEY_METADATA, CACHE_TTL_METADATA } from '../interceptors/cache.interceptor';

/**
 * Combined decorator: attaches both cache key and TTL metadata.
 */
export const CacheKey = (key: string, ttlSeconds = 60): MethodDecorator => {
  // Use the loose `any`-typed signature of SetMetadata's decorator so we don't
  // fight TypeScript's MethodDecorator variance.
  const applyKey = SetMetadata(CACHE_KEY_METADATA, key) as MethodDecorator;
  const applyTtl = SetMetadata(CACHE_TTL_METADATA, ttlSeconds) as MethodDecorator;
  return (target, propertyKey, descriptor) => {
    applyKey(target, propertyKey, descriptor);
    applyTtl(target, propertyKey, descriptor);
  };
};
