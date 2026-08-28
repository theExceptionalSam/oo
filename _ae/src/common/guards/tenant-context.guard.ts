import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Reflector } from '@nestjs/core';
import { School } from '../../modules/schools/entities/school.entity';

/**
 * Layer 2 of the access gate: when a request carries X-School-Subdomain,
 * verify the school exists (404), belongs to the caller (403), and is not
 * suspended (403). Requests without the header pass through — token-embedded
 * tenant scoping still applies in the service layer.
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(School) private readonly schools: Repository<School>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<Request>();
    const subdomain = request.headers['x-school-subdomain'] as string | undefined;
    if (!subdomain || isPublic) return true;

    const school = await this.schools.findOne({ where: { subdomain } });
    if (!school) {
      throw new NotFoundException(`School "${subdomain}" not found`);
    }
    const settings = (school.settings ?? {}) as Record<string, unknown>;
    if (settings.status === 'suspended') {
      throw new ForbiddenException(`School "${subdomain}" is suspended`);
    }

    const user = request.user as { role?: string; school_id?: string | null } | undefined;
    if (user && user.role !== 'SUPER_ADMIN' && user.school_id && user.school_id !== school.id) {
      throw new ForbiddenException('You do not belong to this school');
    }

    request.tenant = { schoolId: school.id, subdomain: school.subdomain };
    return true;
  }
}
