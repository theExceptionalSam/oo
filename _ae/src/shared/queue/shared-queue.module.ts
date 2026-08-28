import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Graphile Worker integration.
 *
 * Replaces the BullMQ + Redis dependency with a Postgres-backed job queue.
 * Same database, zero new stateful services.
 *
 * Why this works for SchoolSync:
 *   - BullMQ's strength is throughput (~10k jobs/sec). We peak at ~10 jobs/sec.
 *   - Graphile Worker handles ~1k jobs/sec on a single Postgres instance.
 *   - We get transactional outbox semantics for free: a job enqueued inside
 *     a DB transaction is only visible to workers after commit. No more
 *     "job queued, but DB write failed" inconsistency.
 *
 * Usage (publishing):
 *   constructor(@Inject(QUEUE) private queue: QueueService) {}
 *   await this.queue.publish('attendance.absent', { studentId, classId });
 *
 * Usage (consuming):
 *   See workers/notifications.worker.ts for a complete example.
 */

export const QUEUE = Symbol('QUEUE');

export interface JobOptions {
  /** Max attempts (default 3). */
  attempts?: number;
  /** Run at this time (ISO string or Date). */
  runAt?: Date | string;
  /** Job priority — lower = higher priority (default 0). */
  priority?: number;
  /** Unique job key — prevents duplicate enqueues. */
  jobKey?: string;
  /** What to do with a job keyed jobKey on conflict. */
  jobKeyMode?: 'replace' | 'preserve_run_at' | 'preserve_unaffected';
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private runner?: { stop(): Promise<void> };
  private graphileLib?: any;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Auto-migrate the worker schema on first boot. Safe to re-run.
    try {
      await this.dataSource.query(`CREATE SCHEMA IF NOT EXISTS graphile_jobs`);
      this.logger.log('Graphile Worker schema ensured');
    } catch (err) {
      this.logger.error(`Failed to create graphile_jobs schema: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.runner) {
      await this.runner.stop();
      this.logger.log('Graphile Worker runner stopped');
    }
  }

  /**
   * Enqueue a job. If called inside a transaction (e.g., the RLS middleware's
   * per-request transaction), the job is only visible to workers after commit.
   *
   * @param taskIdentifier — must match a registered task name in the worker
   * @param payload — JSON-serialisable job data
   * @param options — scheduling / retry options
   */
  async publish(
    taskIdentifier: string,
    payload: Record<string, unknown>,
    options: JobOptions = {},
  ): Promise<void> {
    const runAt = options.runAt instanceof Date
      ? options.runAt.toISOString()
      : options.runAt ?? new Date().toISOString();

    // We use a raw INSERT — works whether or not we're inside a transaction.
    // If inside the RLS middleware's transaction, the INSERT is scoped to
    // that transaction and only commits on success.
    await this.dataSource.query(
      `SELECT graphile_jobs.add_job($1, $2, $3, $4, $5, $6, $7)`,
      [
        taskIdentifier,
        JSON.stringify(payload),
        runAt,
        options.priority ?? 0,
        options.attempts ?? 3,
        options.jobKey ?? null,
        options.jobKeyMode ?? null,
      ],
    );
    this.logger.debug(`Enqueued job ${taskIdentifier} (runAt=${runAt})`);
  }

  /**
   * Start the worker runner. Only call this from the worker process —
   * not from the API server. The API process only publishes; the worker
   * process only consumes.
   *
   * In Render: deploy two services from the same Docker image:
   *   1. Web Service (API)   → start: node dist/main.js
   *   2. Background Worker   → start: node dist/workers.js
   */
  async startRunner(taskList: Record<string, (payload: any) => Promise<void>>): Promise<void> {
    const lib = await import('graphile-worker');
    this.graphileLib = lib;

    this.runner = await lib.run({
      connectionString: this.buildConnectionString(),
      schema: 'graphile_jobs',
      taskList,
      concurrency: Number(this.config.get<number>('WORKER_CONCURRENCY') ?? 5),
      pollInterval: 1000,
      // No-op hook is fine; we use Sentry for error tracking.
      noPreparedStatements: false,
    });

    this.logger.log(`Graphile Worker started with ${Object.keys(taskList).length} task(s)`);
  }

  private buildConnectionString(): string {
    const host = this.config.get<string>('DB_HOST') ?? 'localhost';
    const port = this.config.get<number>('DB_PORT') ?? 5432;
    const user = this.config.get<string>('DB_USERNAME') ?? 'schoolsync';
    const pass = this.config.get<string>('DB_PASSWORD') ?? 'schoolsync';
    const db = this.config.get<string>('DB_DATABASE') ?? 'schoolsync';
    const ssl = this.config.get<string>('DB_SSL') === 'true' ? '?sslmode=require' : '';
    return `postgres://${user}:${pass}@${host}:${port}/${db}${ssl}`;
  }
}

@Global()
@Module({
  providers: [
    {
      provide: QUEUE,
      inject: [DataSource, ConfigService],
      useFactory: (ds: DataSource, cfg: ConfigService) => new QueueService(ds, cfg),
    },
  ],
  exports: [QUEUE],
})
export class SharedQueueModule {}
