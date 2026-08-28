import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { School } from '../schools/entities/school.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { MailService } from '../../shared/mail/mail.service';
import { EventBus } from '../../shared/events/event-bus.module';
import { REDIS_CLIENT } from '../../config/redis.config';

describe('AuthService', () => {
  let service: AuthService;
  let usersRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let schoolsRepo: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock };
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };

  beforeEach(async () => {
    usersRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn((dto) => dto),
    };
    schoolsRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn((dto) => Promise.resolve({ ...dto, id: 'school-1' })),
      findOne: jest.fn().mockResolvedValue({ id: 'school-1', settings: {} }),
    };
    jwt = {
      signAsync: jest.fn().mockResolvedValue('signed-token'),
      verifyAsync: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(School), useValue: schoolsRepo },
        { provide: getRepositoryToken(AuditLog), useValue: { save: jest.fn().mockResolvedValue({}) } },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: { get: () => '7d' } },
        { provide: EventBus, useValue: { publish: jest.fn() } },
        { provide: MailService, useValue: { send: jest.fn().mockResolvedValue({ delivered: false, mode: 'log' }), enabled: false } },
        {
          provide: REDIS_CLIENT,
          useValue: {
            exists: jest.fn().mockResolvedValue(0),
            set: jest.fn().mockResolvedValue('OK'),
            get: jest.fn().mockResolvedValue(null),
            del: jest.fn().mockResolvedValue(1),
            incr: jest.fn().mockResolvedValue(1),
            expire: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('login', () => {
    it('returns tokens on valid credentials', async () => {
      const passwordHash = await bcrypt.hash('S3cur3!Pass', 12);
      usersRepo.findOne.mockResolvedValue({
        id: 'user-1',
        email: 'admin@school.edu',
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        schoolId: 'school-1',
      });
      usersRepo.save.mockResolvedValue({});

      const result = await service.login({
        email: 'admin@school.edu',
        password: 'S3cur3!Pass',
      });

      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
      expect(result.user).toEqual({
        id: 'user-1',
        email: 'admin@school.edu',
        role: UserRole.ADMIN,
        schoolId: 'school-1',
      });
    });

    it('throws when user not found', async () => {
      usersRepo.findOne.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nope@school.edu', password: 'whatever' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws on wrong password', async () => {
      const passwordHash = await bcrypt.hash('correct', 12);
      usersRepo.findOne.mockResolvedValue({ passwordHash, status: 'active' });
      await expect(
        service.login({ email: 'a@b.com', password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws when account is suspended', async () => {
      const passwordHash = await bcrypt.hash('S3cur3!Pass', 12);
      usersRepo.findOne.mockResolvedValue({
        passwordHash,
        status: UserStatus.SUSPENDED,
      });
      await expect(
        service.login({ email: 'a@b.com', password: 'S3cur3!Pass' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('issues new tokens for a valid refresh token', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      usersRepo.findOne.mockResolvedValue({
        id: 'user-1',
        email: 'admin@school.edu',
        role: UserRole.ADMIN,
        schoolId: 'school-1',
      });

      const result = await service.refresh({ refreshToken: 'valid' });
      expect(result.accessToken).toBe('signed-token');
    });

    it('throws on invalid refresh token', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('bad token'));
      await expect(service.refresh({ refreshToken: 'bad' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
