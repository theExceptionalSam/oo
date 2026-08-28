import { Global, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { QUEUE_CONNECTION } from '../queue/shared-queue.module';
import { SchoolSyncEventName } from '../events';
import type { Queue } from 'bullmq';
import IORedis from 'ioredis';

/**
 * Thin wrapper around BullMQ for publishing domain events.
 * Consumers (@Processor) live in feature modules and subscribe to the same event names.
 */
@Injectable()
export class EventBus {
  private readonly logger = new Logger(EventBus.name);
  private queues = new Map<string, Queue>();

  constructor(
    @Inject(QUEUE_CONNECTION) private readonly connection: IORedis,
    private readonly config: ConfigService,
  ) {}

  async publish(
    event: SchoolSyncEventName,
    payload: Record<string, unknown>,
    options: { attempts?: number; backoff?: { type: 'exponential' | 'fixed'; delay: number } } = {},
  ): Promise<void> {
    const queue = this.getOrCreate(event);
    await queue.add(event, payload, {
      attempts: options.attempts ?? 3,
      backoff: options.backoff ?? { type: 'exponential', delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
    this.logger.debug(`Published event ${event}`);
  }

  private getOrCreate(name: string): Queue {
    let q = this.queues.get(name);
    if (!q) {
      const { Queue } = require('bullmq') as typeof import('bullmq');
      q = new Queue(name, { connection: this.connection });
      this.queues.set(name, q);
    }
    return q;
  }
}

@Global()
@Module({
  providers: [
    {
      provide: EventBus,
      inject: [QUEUE_CONNECTION, ConfigService],
      useFactory: (conn: IORedis, cfg: ConfigService) => new EventBus(conn, cfg),
    },
  ],
  exports: [EventBus],
})
export class EventBusModule implements OnModuleInit {
  private readonly logger = new Logger(EventBusModule.name);
  onModuleInit() {
    this.logger.log('EventBus ready');
  }
}
