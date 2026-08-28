import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { QUEUE, QueueService } from '../queue/shared-queue.module';

/**
 * Canonical SchoolSync event names — kept in sync with the worker task list.
 *
 * Each name here becomes a Graphile Worker task identifier that the worker
 * process (see workers/notifications.worker.ts) registers a handler for.
 */
export const SchoolSyncEvents = {
  ATTENDANCE_MARKED: 'attendance.marked',
  ATTENDANCE_ABSENT: 'attendance.absent',
  USER_REGISTERED: 'user.registered',
  EXAM_PUBLISHED: 'exam.published',
  FEE_DUE_REMINDER: 'fee.due.reminder',
  FEE_PAYMENT_COMPLETED: 'fee.payment.completed',
  ANNOUNCEMENT_PUBLISHED: 'announcement.published',
  MESSAGE_SENT: 'message.sent',
} as const;

export type SchoolSyncEventName = (typeof SchoolSyncEvents)[keyof typeof SchoolSyncEvents];

/**
 * Thin wrapper around the Graphile Worker queue. Same shape as the old
 * BullMQ-based EventBus — `publish(event, payload)` — so feature modules
 * don't need to change their call sites.
 */
@Injectable()
export class EventBus {
  private readonly logger = new Logger(EventBus.name);

  constructor(@Inject(QUEUE) private readonly queue: QueueService) {}

  async publish(
    event: SchoolSyncEventName,
    payload: Record<string, unknown>,
    options: { attempts?: number; runAt?: Date } = {},
  ): Promise<void> {
    await this.queue.publish(event, payload, {
      attempts: options.attempts ?? 3,
      runAt: options.runAt,
    });
    this.logger.debug(`Published event ${event}`);
  }
}

@Global()
@Module({
  providers: [EventBus],
  exports: [EventBus],
})
export class EventBusModule {}
