import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { randomUUID } from 'crypto';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const method = request.method;
    const url = request.url;
    const correlationId =
      (request.headers['x-correlation-id'] as string) || randomUUID();
    request.headers['x-correlation-id'] = correlationId;
    response.setHeader('x-correlation-id', correlationId);

    const startedAt = process.hrtime.bigint();
    this.logger.log(`→ ${method} ${url} [${correlationId}]`);

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
          this.logger.log(`← ${method} ${url} ${response.statusCode} ${ms.toFixed(2)}ms [${correlationId}]`);
        },
        error: (err) => {
          const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
          this.logger.error(
            `✖ ${method} ${url} ${err?.status ?? 500} ${ms.toFixed(2)}ms [${correlationId}] ${err?.message ?? err}`,
          );
        },
      }),
    );
  }
}
