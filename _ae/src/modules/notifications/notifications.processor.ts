import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

import { QUEUE_CONNECTION } from '../../shared/queue/shared-queue.module';
import { SchoolSyncEvents } from '../../shared/events';
import { NotificationGateway } from './notification.gateway';
import {
  Notification,
  NotificationChannel,
  NotificationStatus,
} from './entities/notification.entity';

/**
 * Consumes SchoolSync events and persists notifications to the DB.
 * The actual email/SMS/push delivery is delegated to pluggable providers
 * (SendGrid, Twilio) — here we simply record the notification and mark it 'sent'.
 *
 * Implemented with a raw BullMQ Worker per event so we don't take an extra
 * dependency on @nestjs/bullmq.
 */
@Injectable()
export class NotificationsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsProcessor.name);
  private readonly workers: Worker[] = [];

  private readonly eventNames = [
    SchoolSyncEvents.ATTENDANCE_ABSENT,
    SchoolSyncEvents.USER_REGISTERED,
    SchoolSyncEvents.EXAM_PUBLISHED,
    SchoolSyncEvents.FEE_DUE_REMINDER,
    SchoolSyncEvents.ANNOUNCEMENT_PUBLISHED,
    SchoolSyncEvents.MESSAGE_SENT,
  ];

  constructor(
    @Inject(QUEUE_CONNECTION) private readonly connection: IORedis,
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    private readonly gateway: NotificationGateway,
  ) {}

  onModuleInit() {
    for (const name of this.eventNames) {
      const worker = new Worker(
        name,
        async (job: Job) => this.handle(name, job),
        { connection: this.connection, concurrency: 5 },
      );
      worker.on('failed', (job, err) =>
        this.logger.error(`Worker ${name} failed: ${err.message}`, err.stack),
      );
      this.workers.push(worker);
    }
    this.logger.log(`Started ${this.workers.length} notification workers`);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
  }

  private async handle(eventName: string, job: Job): Promise<void> {
    const channel = this.deriveChannel(eventName);
    const title = this.deriveTitle(eventName);
    const body = this.deriveBody(eventName, job.data as Record<string, unknown>);

    const entity = this.notifications.create({
      channel,
      title,
      body,
      payload: job.data as Record<string, unknown>,
      status: NotificationStatus.SENT,
      sentAt: new Date(),
      userId: (job.data as { userId?: string })?.userId ?? null,
    });
    await this.notifications.save(entity);
    this.logger.log(`Processed ${eventName} → notification ${entity.id}`);

    // Fan out to connected sockets (user room + school room).
    this.gateway.emitNotification({
      id: entity.id,
      userId: entity.userId,
      title,
      body,
      channel,
      schoolId: (job.data as { schoolId?: string | null })?.schoolId ?? null,
    });
  }

  /** Human-readable summaries instead of raw event payloads. */
  private deriveBody(name: string, d: Record<string, unknown>): string {
    switch (name) {
      case SchoolSyncEvents.ANNOUNCEMENT_PUBLISHED:
        return `New announcement: "${String(d.title ?? 'Untitled').slice(0, 80)}"`;
      case SchoolSyncEvents.MESSAGE_SENT:
        return `New message: "${String(d.preview ?? '').slice(0, 80)}"`;
      case SchoolSyncEvents.ATTENDANCE_ABSENT:
        return 'A student was marked absent today. Parents have been notified.';
      case SchoolSyncEvents.ATTENDANCE_MARKED:
        return `Attendance submitted for a class (${Number(d.total ?? 0)} students, ${Number(d.absentCount ?? 0)} absent).`;
      case SchoolSyncEvents.USER_REGISTERED:
        return `Welcome aboard — account created for ${String(d.email ?? 'a new user')}.`;
      case SchoolSyncEvents.EXAM_PUBLISHED:
        return `${Number(d.count ?? 0)} marks recorded for an exam. Results are ready for review.`;
      case SchoolSyncEvents.FEE_DUE_REMINDER:
        return 'A fee payment is due. Check the Finance section for details.';
      case SchoolSyncEvents.FEE_PAYMENT_COMPLETED:
        return 'A fee payment was recorded. See Payments for the receipt details.';
      default:
        return 'You have a new SchoolSync notification.';
    }
  }

  private deriveChannel(name: string): NotificationChannel {
    switch (name) {
      case SchoolSyncEvents.ATTENDANCE_ABSENT:
        return 'sms';
      case SchoolSyncEvents.USER_REGISTERED:
        return 'email';
      case SchoolSyncEvents.FEE_DUE_REMINDER:
        return 'email';
      default:
        return 'in_app';
    }
  }

  private deriveTitle(name: string): string {
    switch (name) {
      case SchoolSyncEvents.ATTENDANCE_ABSENT:
        return 'Your child was marked absent';
      case SchoolSyncEvents.USER_REGISTERED:
        return 'Welcome to SchoolSync';
      case SchoolSyncEvents.FEE_DUE_REMINDER:
        return 'Fee payment due reminder';
      case SchoolSyncEvents.EXAM_PUBLISHED:
        return 'Exam results published';
      case SchoolSyncEvents.ANNOUNCEMENT_PUBLISHED:
        return 'New announcement';
      case SchoolSyncEvents.MESSAGE_SENT:
        return 'You have a new message';
      default:
        return 'SchoolSync notification';
    }
  }
}
