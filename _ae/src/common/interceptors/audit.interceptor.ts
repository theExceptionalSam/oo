import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Request } from 'express';

/**
 * AuditInterceptor — writes one row to `audit_logs` for every mutating
 * request (POST / PUT / PATCH / DELETE). Records:
 *   - who (user_id, user_email, ip, user_agent)
 *   - what (method, path, action, entity, entity_id)
 *   - when (created_at)
 *   - result (success / error)
 *   - payload (sanitised — password fields stripped)
 *
 * The audit_logs table is APPEND-ONLY — never updated or deleted except
 * by a DBA retention script. RLS on audit_logs allows the tenant to read
 * their own audit entries but never another tenant's.
 *
 * Write semantics: uses the request's existing RLS transaction (the
 * `dbQueryRunner` set by RlsContextMiddleware). If the request fails,
 * the audit entry rolls back with everything else — which is correct,
 * because a failed mutation shouldn't be audited as if it succeeded.
 *
 * For HTTP 5xx errors, we DO want to audit (security teams need to know
 * about failed mutations). For those cases, this interceptor catches the
 * error and writes the audit entry in a separate transaction before
 * re-throwing.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  // Don't log payloads for these routes — they contain credentials.
  private readonly payloadBlacklist = [
    '/api/v1/auth/login',
    '/api/v1/auth/register',
    '/api/v1/auth/refresh',
    '/api/v1/auth/change-password',
    '/api/v1/auth/reset-password',
  ];

  // Field names to scrub from payloads.
  private readonly redactFields = [
    'password', 'passwordHash', 'newPassword', 'oldPassword',
    'token', 'refreshToken', 'accessToken',
    'stripeSecretKey', 'twilioAuthToken', 'sendgridApiKey',
    'cardNumber', 'cvv', 'pin',
  ];

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & {
      user?: { sub?: string; email?: string; role?: string; school_id?: string };
      tenant?: { schoolId?: string };
    }>();
    const method = request.method;

    // Only audit mutations.
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const path = request.path;
    const user = request.user;
    const schoolId = request.tenant?.schoolId ?? user?.school_id;
    const entity = this.deriveEntity(path);
    const entityId = this.deriveEntityId(path);
    const action = this.deriveAction(method);
    const payload = this.shouldRecordPayload(path)
      ? this.scrubPayload(request.body as Record<string, unknown>)
      : {};

    const auditRow = {
      user_id: user?.sub ?? null,
      user_email: user?.email ?? null,
      school_id: schoolId ?? null,
      action,
      method,
      path,
      entity,
      entity_id: entityId,
      payload,
      ip_address: request.ip ?? null,
      user_agent: request.get('user-agent')?.slice(0, 255) ?? null,
      result: 'success' as 'success' | 'error',
    };

    return next.handle().pipe(
      tap({
        next: async () => {
          await this.writeAudit(auditRow, request);
        },
        error: async (err) => {
          // 5xx errors get audited in a separate transaction (the request
          // transaction is rolling back). 4xx errors (validation, etc.)
          // are audited inside the request transaction so they roll back too.
          if (err?.status >= 500 || err?.statusCode >= 500) {
            await this.writeAuditSeparately({ ...auditRow, result: 'error', notes: err?.message });
          }
        },
      }),
    );
  }

  private async writeAudit(
    row: Record<string, unknown>,
    request: Request & { dbQueryRunner?: { query: (sql: string, params?: unknown[]) => Promise<unknown> } },
  ): Promise<void> {
    try {
      // Use the request's transaction if available — so audit + mutation
      // commit atomically.
      const runner = request.dbQueryRunner;
      if (runner) {
        await runner.query(
          `INSERT INTO audit_logs
             (user_id, user_email, school_id, action, method, path, entity, entity_id,
              payload, ip_address, user_agent, result, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            row.user_id, row.user_email, row.school_id, row.action,
            row.method, row.path, row.entity, row.entity_id,
            JSON.stringify(row.payload), row.ip_address, row.user_agent,
            row.result, row.notes ?? null,
          ],
        );
      } else {
        await this.writeAuditSeparately(row);
      }
    } catch (err) {
      // Never let audit failure break the request — log and move on.
      this.logger.error(`Audit write failed: ${(err as Error).message}`);
    }
  }

  private async writeAuditSeparately(row: Record<string, unknown>): Promise<void> {
    try {
      await this.dataSource.query(
        `INSERT INTO audit_logs
           (user_id, user_email, school_id, action, method, path, entity, entity_id,
            payload, ip_address, user_agent, result, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          row.user_id, row.user_email, row.school_id, row.action,
          row.method, row.path, row.entity, row.entity_id,
          JSON.stringify(row.payload), row.ip_address, row.user_agent,
          row.result, row.notes ?? null,
        ],
      );
    } catch (err) {
      this.logger.error(`Audit write (separate txn) failed: ${(err as Error).message}`);
    }
  }

  private deriveEntity(path: string): string | null {
    // /api/v1/students/:id → "students"
    const match = path.match(/^\/api\/v[0-9]+\/([a-z-]+)/);
    return match ? match[1] : null;
  }

  private deriveEntityId(path: string): string | null {
    // /api/v1/students/abc-123 → "abc-123"
    const match = path.match(/\/([0-9a-f-]{36})/);
    return match ? match[1] : null;
  }

  private deriveAction(method: string): string {
    switch (method) {
      case 'POST': return 'CREATE';
      case 'PUT':
      case 'PATCH': return 'UPDATE';
      case 'DELETE': return 'DELETE';
      default: return method;
    }
  }

  private shouldRecordPayload(path: string): boolean {
    return !this.payloadBlacklist.some((p) => path.startsWith(p));
  }

  private scrubPayload(body: Record<string, unknown>): Record<string, unknown> {
    if (!body || typeof body !== 'object') return {};
    const scrubbed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (this.redactFields.some((f) => key.toLowerCase().includes(f.toLowerCase()))) {
        scrubbed[key] = '[REDACTED]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        scrubbed[key] = this.scrubPayload(value as Record<string, unknown>);
      } else {
        scrubbed[key] = value;
      }
    }
    return scrubbed;
  }
}
