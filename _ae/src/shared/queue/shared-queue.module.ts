import { Global, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

export const QUEUE_CONNECTION = Symbol('QUEUE_CONNECTION');

/**
 * Shared BullMQ connection — used by every module that publishes jobs.
 * Connection is shared (not per-queue) to keep Redis connections bounded.
 */
@Global()
@Module({})
export class SharedQueueModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SharedQueueModule.name);
  private connection?: IORedis;

  static register() {
    return {
      module: SharedQueueModule,
      providers: [
        {
          provide: QUEUE_CONNECTION,
          inject: [ConfigService],
          useFactory: (config: ConfigService) => {
            const host = config.get<string>('REDIS_HOST') ?? 'localhost';
            const port = config.get<number>('REDIS_PORT') ?? 6379;
            const password = config.get<string>('REDIS_PASSWORD') || undefined;
            return new IORedis({ host, port, password, maxRetriesPerRequest: null });
          },
        },
      ],
      exports: [QUEUE_CONNECTION],
    };
  }

  // The two lifecycle hooks below only fire when the module is instantiated directly.
  // When using `SharedQueueModule.register()` the factory manages the connection lifecycle.
  onModuleInit() {
    this.logger.log('SharedQueueModule initialised');
  }

  onModuleDestroy() {
    void this.connection?.disconnect();
  }
}

/**
 * Helper to build a typed BullMQ queue using the shared connection.
 */
export function buildQueue(name: string, connection: IORedis): Queue {
  return new Queue(name, { connection });
}

export function buildQueueEvents(name: string, connection: IORedis): QueueEvents {
  return new QueueEvents(name, { connection });
}
