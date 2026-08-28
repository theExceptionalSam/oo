import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuditLog } from './entities/audit-log.entity';

const REDACTED_KEYS = ['password', 'passwordHash', 'newPassword', 'token', 'refreshToken'];

const redact = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACTED_KEYS.includes(k) ? '[redacted]' : redact(v);
    }
    return out;
  }
  return value;
};

/**
 * Persists a row in audit_logs for every successful mutating request
 * (POST / PATCH / PUT / DELETE). Audit failures never break the request.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const method: string = request.method;

    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: (responseData) => {
          void this.record(request, method, responseData, 'success').catch(() => {
            /* auditing must never fail the request */
          });
        },
        error: (err: Error) => {
          void this.record(request, method, null, 'denied', err.message).catch(() => {
            /* auditing must never fail the request */
          });
        },
      }),
    );
  }

  private async record(
    request: Request,
    method: string,
    responseData: unknown,
    result: 'success' | 'denied',
    notes?: string,
  ): Promise<void> {
    const user = request.user as
      | { sub?: string; email?: string; school_id?: string | null }
      | undefined;

    const path = (request.url ?? '').split('?')[0];
    const segments = path.split('/').filter(Boolean); // [api, v1, resource, id?, sub?]
    const entity = segments[2] ?? null;
    const dataId = (responseData as { id?: string } | undefined)?.id;
    const entityId = dataId ?? (segments[3]?.match(/^[0-9a-f-]{36}$/i) ? segments[3] : null) ?? null;

    await this.repo.save({
      userId: user?.sub ?? null,
      userEmail: user?.email ?? null,
      schoolId: user?.school_id ?? null,
      action: method === 'POST' ? 'CREATE' : method === 'DELETE' ? 'DELETE' : 'UPDATE',
      method,
      path,
      entity,
      ipAddress: (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        ?? request.ip ?? null,
      userAgent: (request.headers['user-agent'] ?? '').toString().slice(0, 250) || null,
      result,
      notes: notes?.slice(0, 500) ?? null,
      entityId,
      payload: (redact(request.body ?? {}) ?? {}) as Record<string, unknown>,
    });
  }
}
