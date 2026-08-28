import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../decorators/current-user.decorator';

export const SKIP_TENANT_CHECK = 'skipTenantCheck';
export const SkipTenantCheck = () => SetMetadata(SKIP_TENANT_CHECK, true);

/**
 * Ensures the authenticated user only acts within their own school (tenant).
 * Routes that legitimately span tenants (e.g. SUPER_ADMIN cross-tenant APIs)
 * must be decorated with @SkipTenantCheck().
 */
@Injectable()
export class SchoolContextGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_CHECK, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    const targetSchoolId = request.params?.schoolId ?? request.body?.school_id ?? request.query?.school_id;

    if (user && targetSchoolId && user.school_id !== targetSchoolId) {
      throw new ForbiddenException('Cross-tenant access is not allowed');
    }
    return true;
  }
}
