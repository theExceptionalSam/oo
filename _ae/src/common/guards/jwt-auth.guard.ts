import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import type Redis from 'ioredis';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { REDIS_CLIENT } from '../../config/redis.config';
import type { AuthUser } from '../decorators/current-user.decorator';

// Augment Express's Request with our auth + tenant fields.
declare module 'express' {
  interface Request {
    user?: AuthUser;
    tenant?: { schoolId?: string; subdomain?: string; schema?: string };
  }
}

const REVOCATION_PREFIX = 'revoked:jti:';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Missing access token');

    let payload: AuthUser;
    try {
      payload = await this.jwtService.verifyAsync<AuthUser>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    // Revocation check — logout (and password change) push the token's jti
    // onto a Redis blocklist with a TTL equal to the token's remaining life.
    if (payload.jti && (await this.redis.exists(`${REVOCATION_PREFIX}${payload.jti}`))) {
      throw new UnauthorizedException('Token has been revoked');
    }

    // Password epoch — any token issued before the user's last password
    // change is dead, covering every session at once.
    const pwChangedAt = await this.redis.get(`pwchanged:${payload.sub}`);
    if (pwChangedAt && (!payload.iat || payload.iat < Number(pwChangedAt))) {
      throw new UnauthorizedException('Password changed — please sign in again');
    }

    request.user = payload;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = (request.headers.authorization ?? '').split(' ');
    return type === 'Bearer' && token ? token : undefined;
  }
}
