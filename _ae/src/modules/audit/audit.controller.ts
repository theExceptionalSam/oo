import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { Caller } from '../../common/utils/tenant';
import { isSuperAdmin } from '../../common/utils/tenant';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('audit')
@ApiBearerAuth('access-token')
@Controller('audit-logs')
@UseGuards(RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class AuditController {
  constructor(
    @InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Audit trail of mutating requests (tenant-scoped; admins see their school)' })
  async findAll(
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @CurrentUser() caller?: Caller,
  ) {
    const take = Math.min(Number(limit) || 50, 200);
    const skip = ((Number(page) || 1) - 1) * take;

    const qb = this.repo
      .createQueryBuilder('a')
      .orderBy('a.createdAt', 'DESC')
      .take(take)
      .skip(skip);

    if (!isSuperAdmin(caller) && caller?.school_id) {
      qb.andWhere('a.school_id = :schoolId', { schoolId: caller.school_id });
    }
    const [items, total] = await qb.getManyAndCount();
    return { items, meta: { page: Number(page) || 1, limit: take, total } };
  }
}
