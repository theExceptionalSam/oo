import { Injectable, Logger, UnauthorizedException, BadRequestException, ConflictException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import type Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { School } from '../schools/entities/school.entity';
import { LoginDto, RegisterDto, RefreshDto } from './dto/auth.dto';
import { EventBus } from '../../shared/events/event-bus.module';
import { SchoolSyncEvents } from '../../shared/events';
import { REDIS_CLIENT } from '../../config/redis.config';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { MailService } from '../../shared/mail/mail.service';
import { renderTemplate } from '../../shared/templates/registry';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  school_id: string | null;
  jti?: string;
  exp?: number;
  iat?: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(School) private readonly schools: Repository<School>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly eventBus: EventBus,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectRepository(AuditLog) private readonly auditLogs: Repository<AuditLog>,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto) {
    let schoolId: string | null = null;
    if (dto.role !== UserRole.SUPER_ADMIN) {
      if (!dto.schoolName || !dto.subdomain) {
        throw new BadRequestException('schoolName and subdomain are required for non-super-admin registration');
      }
      // Reject taken subdomains with a clean 409 instead of a 500.
      const clash = await this.schools.findOne({ where: { subdomain: dto.subdomain } });
      if (clash) {
        throw new ConflictException(`Subdomain "${dto.subdomain}" is already taken`);
      }
      const school = this.schools.create({
        name: dto.schoolName,
        subdomain: dto.subdomain,
      });
      const saved = await this.schools.save(school);
      schoolId = saved.id;
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.users.create({
      email: dto.email,
      passwordHash,
      role: dto.role,
      schoolId,
      status: UserStatus.ACTIVE,
      emailVerified: false,
    });
    const savedUser = await this.users.save(user);

    await this.eventBus.publish(SchoolSyncEvents.USER_REGISTERED, {
      userId: savedUser.id,
      email: savedUser.email,
      schoolId: savedUser.schoolId,
    });

    return this.issueTokens(savedUser);
  }

  async login(dto: LoginDto) {
    // ---- Brute-force protection (blueprint 1.3) ----
    const attemptKey = `login_attempts:${dto.email.toLowerCase()}`;
    const lockKey = `login_locked:${dto.email.toLowerCase()}`;
    const locked = await this.redis.get(lockKey);
    if (locked) {
      throw new UnauthorizedException('Account temporarily locked. Try again in 15 minutes.');
    }
    const attempts = parseInt((await this.redis.get(attemptKey)) ?? '0', 10);
    if (attempts >= 5) {
      await this.redis.set(lockKey, '1', 'EX', 900); // 15-minute lock
      await this.redis.del(attemptKey);
      throw new UnauthorizedException('Too many failed attempts. Account locked for 15 minutes.');
    }
    // Progressive delay: 1s after the 3rd failure, growing with each miss.
    if (attempts >= 3) {
      await new Promise((r) => setTimeout(r, (attempts - 2) * 1000));
    }

    const fail = async (msg: string): Promise<never> => {
      await this.redis.incr(attemptKey);
      await this.redis.expire(attemptKey, 900);
      await this.auditLogin(dto.email, 'failure', msg);
      throw new UnauthorizedException(msg);
    };

    const user = await this.users.findOne({ where: { email: dto.email } });
    if (!user || !user.passwordHash) {
      return fail('Invalid credentials');
    }
    const match = await bcrypt.compare(dto.password, user.passwordHash);
    if (!match) return fail('Invalid credentials');
    if (user.status !== UserStatus.ACTIVE) {
      return fail(`Account is ${user.status}`);
    }
    // Suspended schools block all their users; the platform owner is exempt.
    if (user.role !== UserRole.SUPER_ADMIN && user.schoolId) {
      const school = await this.schools.findOne({ where: { id: user.schoolId } });
      const settings = (school?.settings ?? {}) as Record<string, unknown>;
      if (settings.status === 'suspended') {
        return fail('This school account is suspended');
      }
    }

    // Success — clear the attempt counter.
    await this.redis.del(attemptKey);
    user.lastLoginAt = new Date();
    await this.users.save(user);
    await this.auditLogin(user.email, 'success');

    return this.issueTokens(user);
  }

  /** Failed and successful sign-ins land in the audit trail (no payload). */
  private async auditLogin(email: string, result: 'success' | 'failure', notes?: string): Promise<void> {
    try {
      await this.auditLogs.save({
        userId: null,
        userEmail: email,
        schoolId: null,
        action: 'LOGIN',
        method: 'POST',
        path: '/api/v1/auth/login',
        entity: 'auth',
        entityId: null,
        payload: {},
        result,
        notes: notes?.slice(0, 200) ?? null,
      });
    } catch { /* auditing must never block login */ }
  }

  async refresh(dto: RefreshDto) {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(dto.refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    // Refresh-token rotation: a refresh token is single-use — if its jti was
    // already consumed (or revoked), reject and block the whole family.
    if (payload.jti && (await this.redis.exists(`revoked:jti:${payload.jti}`))) {
      throw new UnauthorizedException('Refresh token already used or revoked');
    }
    // Tokens issued before a password change are dead, refresh included.
    const pwChangedAt = await this.redis.get(`pwchanged:${payload.sub}`);
    if (pwChangedAt && (!payload.iat || payload.iat < Number(pwChangedAt))) {
      throw new UnauthorizedException('Password changed — please sign in again');
    }
    if (payload.jti && payload.exp) {
      const ttlSeconds = Math.max(1, payload.exp - Math.floor(Date.now() / 1000));
      await this.redis.set(`revoked:jti:${payload.jti}`, '1', 'EX', ttlSeconds);
    }
    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('User not found');
    return this.issueTokens(user);
  }

  async logout(user: { sub: string; jti?: string; exp?: number }) {
    // Revoke the presented access token's jti for the remainder of its life.
    if (user.jti && user.exp) {
      const ttlSeconds = Math.max(1, user.exp - Math.floor(Date.now() / 1000));
      await this.redis.set(`revoked:jti:${user.jti}`, '1', 'EX', ttlSeconds);
    }
    this.logger.log(`User ${user.sub} logged out (token revoked)`);
    return { success: true };
  }

  async getMe(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
      status: user.status,
      profile: user.profile,
      emailVerified: user.emailVerified,
      lastLoginAt: user.lastLoginAt,
    };
  }

  /**
   * Self-service password change. All outstanding tokens (access + refresh)
   * are invalidated by bumping a per-user password epoch in Redis — the JWT
   * guard rejects any token issued before it.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || !user.passwordHash) throw new UnauthorizedException('User not found');
    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) throw new UnauthorizedException('Current password is incorrect');

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await this.users.save(user);
    // TTL covers the longest possible refresh-token life (7d) + margin.
    await this.redis.set(`pwchanged:${userId}`, Math.floor(Date.now() / 1000), 'EX', 8 * 24 * 3600);
    this.logger.log(`Password changed for user ${userId}; all tokens invalidated`);
    return { success: true };
  }

  /**
   * Forgot password: always returns success (no account enumeration), but only
   * emails a reset link when the account exists. Tokens are single-use, 1h.
   */
  async forgotPassword(email: string, appUrl: string): Promise<{ success: true }> {
    const user = await this.users.findOne({ where: { email: email.toLowerCase() } });
    if (!user) return { success: true }; // identical response either way

    const token = uuidv4();
    await this.redis.set(`pwreset:${token}`, user.id, 'EX', 3600);
    const resetUrl = `${appUrl}/reset-password?token=${token}`;
    const { subject, body } = renderTemplate('password-reset', { resetUrl });
    await this.mail.send({ to: user.email, subject, body }).catch(() => undefined);
    this.logger.log(`Password reset requested for ${user.email}`);
    return { success: true };
  }

  /** Reset password via emailed token: sets it and kills all sessions. */
  async resetPassword(token: string, newPassword: string) {
    const userId = await this.redis.get(`pwreset:${token}`);
    if (!userId) throw new BadRequestException('This reset link is invalid or has expired');
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('This reset link is no longer valid');

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await this.users.save(user);
    await this.redis.del(`pwreset:${token}`);
    // Kill every outstanding token, same as an interactive change.
    await this.redis.set(`pwchanged:${userId}`, Math.floor(Date.now() / 1000), 'EX', 8 * 24 * 3600);
    this.logger.log(`Password reset completed for user ${userId}`);
    return { success: true, email: user.email };
  }

  /**
   * Complete an invitation: set the account's first password and consume the
   * single-use invite token.
   */
  async acceptInvite(token: string, password: string) {
    const userId = await this.redis.get(`invite:${token}`);
    if (!userId) throw new BadRequestException('This invitation is invalid or has expired');

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('This invitation is no longer valid');

    user.passwordHash = await bcrypt.hash(password, 12);
    user.emailVerified = true; // they proved control of the invite link
    await this.users.save(user);
    await this.redis.del(`invite:${token}`);
    this.logger.log(`Invite accepted for user ${userId}`);
    return { success: true, email: user.email };
  }

  private async issueTokens(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      school_id: user.schoolId,
    };

    // Access and refresh tokens get distinct jtis so revoking one
    // (logout, refresh rotation) never invalidates the other.
    const accessToken = await this.jwt.signAsync({ ...payload, jti: uuidv4() });
    const refreshToken = await this.jwt.signAsync(
      { ...payload, jti: uuidv4() },
      { expiresIn: this.config.get<string>('JWT_REFRESH_TTL') ?? '7d' },
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId,
      },
    };
  }
}
