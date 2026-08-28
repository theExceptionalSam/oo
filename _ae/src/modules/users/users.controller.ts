import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { UsersService } from './users.service';
import { User, UserRole } from './entities/user.entity';
import { CreateUserDto, UpdateUserDto, ListUserDto } from './dto/users.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { REDIS_CLIENT } from '../../config/redis.config';
import { MailService } from '../../shared/mail/mail.service';
import { renderTemplate } from '../../shared/templates/registry';
import type { Caller } from '../../common/utils/tenant';
import { IsEmail, IsEnum } from 'class-validator';

class InviteUserDto {
  @IsEmail()
  email: string;

  @IsEnum(UserRole)
  role: UserRole;
}

const INVITE_TTL_HOURS = 72;

@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(
    private readonly service: UsersService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly mail: MailService,
  ) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @ApiOperation({ summary: 'List user with pagination (admin/owner only)' })
  findAll(@Query() query: ListUserDto, @CurrentUser() caller: Caller) {
    return this.service.findAll({
      page: query.page,
      limit: query.limit,
      search: query.search,
      where: query.schoolId ? ({ schoolId: query.schoolId } as Record<string, unknown>) : undefined,
    }, caller);
  }

  /**
   * Invite a staff member: creates the account without a password and
   * returns a single-use set-password link (valid 72h). When an email
   * provider is configured the link is emailed; otherwise it is returned
   * here for the admin to share.
   */
  @Post('invite')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @ApiOperation({ summary: 'Invite a staff member by email (returns a set-password link)' })
  async invite(@Body() dto: InviteUserDto, @CurrentUser() caller: Caller, @Req() req: Request) {
    if (dto.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('Cannot invite super admins');
    }
    const created = await this.service.create({
      email: dto.email.toLowerCase(),
      role: dto.role,
      schoolId: caller?.school_id ?? undefined,
      // passwordHash intentionally null — set via the invite link
      status: 'active',
      emailVerified: false,
    } as Partial<User>, caller);

    const token = uuidv4();
    await this.redis.set(`invite:${token}`, created.id, 'EX', INVITE_TTL_HOURS * 3600);

    const origin = (process.env.APP_URL ?? `${req.protocol}://${req.get('host')}`).replace('/api', '');
    const inviteUrl = `${origin}/accept-invite?token=${token}`;

    // Send the invitation when a provider is configured; log-mode otherwise.
    const { subject, body } = renderTemplate('staff-invitation', {
      email: created.email,
      role: created.role,
      inviteUrl,
      expiresInHours: String(INVITE_TTL_HOURS),
    });
    const delivery = await this.mail.send({ to: created.email, subject, body });

    return {
      user: { id: created.id, email: created.email, role: created.role },
      inviteUrl,
      expiresInSeconds: INVITE_TTL_HOURS * 3600,
      emailed: delivery.delivered,
      emailMode: delivery.mode, // 'sendgrid' | 'log'
    };
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @ApiOperation({ summary: 'Get a single user by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: Caller) {
    return this.service.findOne(id, caller);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @ApiOperation({ summary: 'Create a user (with a password) — prefer /users/invite' })
  create(@Body() dto: CreateUserDto, @CurrentUser() caller: Caller) {
    return this.service.create(dto as unknown as Partial<User>, caller);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @ApiOperation({ summary: 'Update a user' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @CurrentUser() caller: Caller) {
    return this.service.update(id, dto as unknown as Partial<User>, caller);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SCHOOL_OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() caller: Caller) {
    return this.service.remove(id, caller);
  }
}
