/**
 * Worker entry point — run as a separate Render Background Worker.
 *
 *   node dist/workers.js
 *
 * This file:
 *   1. Bootstraps a minimal NestJS app (no HTTP server, just DI).
 *   2. Wires up DB + Queue + Notification processor.
 *   3. Hands the task list to Graphile Worker, which polls Postgres.
 *
 * Do NOT call start() from the API process — it would compete with this
 * worker for jobs. Keep them as separate Render services.
 */
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { TypeOrmConfigService } from '../src/config/database.config';
import { validateEnv } from '../src/config/env.validation';
import { QueueService } from '../src/shared/queue/shared-queue.module';
import { NotificationsWorker } from './notifications.worker';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      envFilePath: ['.env', '.env.local'],
    }),
    TypeOrmModule.forRootAsync({ useClass: TypeOrmConfigService }),
  ],
  providers: [QueueService, NotificationsWorker],
})
class WorkerModule {}

async function bootstrap() {
  const logger = new Logger('WorkerBootstrap');
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(['log', 'error', 'warn', 'debug']);

  const queue = app.get(QueueService);
  const notifications = app.get(NotificationsWorker);

  logger.log('Starting Graphile Worker runner...');
  await queue.startRunner({
    'attendance.marked': (payload) => notifications.onAttendanceMarked(payload),
    'attendance.absent': (payload) => notifications.onAttendanceAbsent(payload),
    'user.registered': (payload) => notifications.onUserRegistered(payload),
    'exam.published': (payload) => notifications.onExamPublished(payload),
    'fee.due.reminder': (payload) => notifications.onFeeDueReminder(payload),
    'fee.payment.completed': (payload) => notifications.onFeePaymentCompleted(payload),
    'announcement.published': (payload) => notifications.onAnnouncementPublished(payload),
    'message.sent': (payload) => notifications.onMessageSent(payload),
  });

  // Keep the process alive — the runner polls Postgres indefinitely.
  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received, shutting down...');
    await app.close();
    process.exit(0);
  });
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Worker bootstrap failed', err);
  process.exit(1);
});
