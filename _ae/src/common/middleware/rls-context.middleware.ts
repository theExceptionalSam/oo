import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { Request, Response, NextFunction } from 'express';

/**
 * RLS Context Middleware
 * =====================
 *
 * Sets the per-request Postgres session variable `app.current_school_id`
 * so that Row-Level-Security policies can enforce tenant isolation at the
 * database level (defense-in-depth on top of the application-layer guards).
 *
 * Lifecycle:
 *   1. Request arrives → middleware reads `req.tenant.schoolId` (set by
 *      TenantContextGuard from the X-School-Subdomain header).
 *   2. Acquires a QueryRunner + BEGIN.
 *   3. SET LOCAL app.current_school_id = '<uuid>' inside the transaction.
 *   4. Attaches the QueryRunner to `req.dbQueryRunner` so controllers / services
 *      can use it for queries that should be RLS-scoped.
 *   5. After the response, COMMIT (or ROLLBACK on error) and release.
 *
 * Why a transaction per request:
 *   - SET LOCAL only applies inside the current transaction.
 *   - Using a connection-level SET would leak across requests in the pool.
 *   - A transaction-per-request also gives you "all-or-nothing" semantics
 *     for free — if any handler throws, the whole request's DB changes roll back.
 *
 * SUPER_ADMIN bypass:
 *   When the caller is SUPER_ADMIN, we set `app.bypass_rls = 'on'` instead,
 *   which the role attribute respects (we grant BYPASSRLS to the runtime role).
 *   This means SUPER_ADMIN queries are NOT school-scoped — exactly what
 *   cross-tenant admin operations need.
 *
 * Performance:
 *   BEGIN/COMMIT overhead on Postgres is ~50µs each, so ~100µs/request.
 *   Negligible vs your typical endpoint latency of 5-50ms.
 */
@Injectable()
export class RlsContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RlsContextMiddleware.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async use(req: Request & { dbQueryRunner?: QueryRunner }, res: Response, next: NextFunction): Promise<void> {
    // Skip for public health endpoints — they don't need a tenant scope.
    // (TenantContextGuard already set req.tenant = undefined for these.)
    const tenant = (req as { tenant?: { schoolId?: string } }).tenant;
    const user = (req as { user?: { role?: string; school_id?: string } }).user;

    let queryRunner: QueryRunner | undefined;
    try {
      queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // Resolve the effective school_id.
      // Priority: explicit tenant from header > user's own school_id > none (public request).
      const schoolId =
        tenant?.schoolId ??
        (user && user.role !== 'SUPER_ADMIN' ? user.school_id : undefined);

      if (schoolId) {
        await queryRunner.query(
          `SET LOCAL app.current_school_id = $1`,
          [schoolId],
        );
      }

      // SUPER_ADMIN bypass — the role has BYPASSRLS attribute.
      if (user?.role === 'SUPER_ADMIN') {
        await queryRunner.query(`SET LOCAL app.bypass_rls = 'on'`);
      } else if (process.env.NODE_ENV !== 'production' && schoolId) {
        // Dev-only: log the school scope so you can spot RLS bugs in tests.
        this.logger.debug(`Request scoped to school_id=${schoolId} (${req.method} ${req.path})`);
      }

      // Expose the query runner so services can opt into RLS-scoped queries.
      req.dbQueryRunner = queryRunner;

      // Hook response finish to commit/rollback. Using 'close' so we run
      // even if the client disconnects mid-response.
      res.on('close', () => this.finish(queryRunner, res.statusCode));

      next();
    } catch (err) {
      this.logger.error(`RLS context setup failed: ${(err as Error).message}`, (err as Error).stack);
      if (queryRunner) {
        try { await queryRunner.rollbackTransaction(); } catch { /* ignore */ }
        await queryRunner.release();
      }
      // Re-throw so the global exception filter returns 500.
      throw err;
    }
  }

  private async finish(queryRunner: QueryRunner | undefined, statusCode: number): Promise<void> {
    if (!queryRunner) return;
    try {
      // Commit on 2xx, rollback on 4xx/5xx so a validation error doesn't
      // persist half-written state.
      if (statusCode >= 200 && statusCode < 400) {
        await queryRunner.commitTransaction();
      } else {
        await queryRunner.rollbackTransaction();
      }
    } catch (err) {
      this.logger.warn(`Transaction finish failed: ${(err as Error).message}`);
      try { await queryRunner.rollbackTransaction(); } catch { /* ignore */ }
    } finally {
      await queryRunner.release();
    }
  }
}
