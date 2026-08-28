import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface TenantContext {
  schoolId: string;
  subdomain?: string;
  schema?: string;
}

export const CurrentTenant = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest();
    return {
      schoolId: request.tenant?.schoolId ?? request.user?.school_id,
      subdomain: request.tenant?.subdomain,
      schema: request.tenant?.schema,
    };
  },
);
