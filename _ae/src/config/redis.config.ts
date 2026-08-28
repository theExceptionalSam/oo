import { Global, Module, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Global()
@Module({})
export class RedisModule implements OnModuleInit {
  private readonly logger = new Logger(RedisModule.name);

  static register() {
    return {
      module: RedisModule,
      providers: [
        {
          provide: REDIS_CLIENT,
          inject: [ConfigService],
          useFactory: (config: ConfigService) => {
            const host = config.get<string>('REDIS_HOST') ?? 'localhost';
            const port = config.get<number>('REDIS_PORT') ?? 6379;
            const password = config.get<string>('REDIS_PASSWORD') || undefined;
            const db = config.get<number>('REDIS_DB') ?? 0;
            return new Redis({ host, port, password, db, lazyConnect: false, maxRetriesPerRequest: 3 });
          },
        },
      ],
      exports: [REDIS_CLIENT],
    };
  }

  onModuleInit() {
    this.logger.log('Redis client registered');
  }
}
