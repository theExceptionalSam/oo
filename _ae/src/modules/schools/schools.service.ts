import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { School } from './entities/school.entity';
import { Caller, isSuperAdmin } from '../../common/utils/tenant';

@Injectable()
export class SchoolsService {
  private readonly logger = new Logger(SchoolsService.name);

  constructor(
    @InjectRepository(School) private readonly repo: Repository<School>,
  ) {}

  async create(payload: Partial<School>): Promise<School> {
    // Auto-generate SCH-### school codes when absent (blueprint 2.1).
    if (!payload.schoolCode) {
      const count = await this.repo.count();
      payload.schoolCode = `SCH-${String(count + 1).padStart(3, '0')}`;
    }
    const entity = this.repo.create(payload);
    const saved = await this.repo.save(entity);
    this.logger.log(`Created School id=${saved.id} (code ${saved.schoolCode})`);
    return saved;
  }

  async findAll(opts: {
    page?: number;
    limit?: number;
    search?: string;
    where?: Record<string, unknown>;
  } = {}, caller?: Caller): Promise<{ items: School[]; meta: { page: number; limit: number; total: number } }> {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 20, 200);
    // Non-super-admins only ever see their own school.
    const where: Record<string, unknown> =
      isSuperAdmin(caller) || !caller?.school_id
        ? (opts.where as Record<string, unknown>) ?? {}
        : { id: caller.school_id };
    const [items, total] = await this.repo.findAndCount({
      where: where as never,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' } as never,
    });
    return { items, meta: { page, limit, total } };
  }

  async findOne(id: string, caller?: Caller): Promise<School> {
    const entity = await this.repo.findOne({ where: { id } as never });
    if (!entity) throw new NotFoundException(`School ${id} not found`);
    if (!isSuperAdmin(caller) && caller?.school_id && entity.id !== caller.school_id) {
      throw new NotFoundException(`School ${id} not found`);
    }
    return entity;
  }

  async update(id: string, payload: Partial<School>, caller?: Caller): Promise<School> {
    const entity = await this.findOne(id, caller);
    Object.assign(entity, payload);
    // Backfill missing school codes on first profile edit (blueprint 2.1).
    if (!entity.schoolCode) {
      const count = await this.repo.count();
      entity.schoolCode = `SCH-${String(count + 1).padStart(3, '0')}`;
    }
    return this.repo.save(entity);
  }

  async remove(id: string, caller?: Caller): Promise<{ success: boolean; id: string }> {
    const entity = await this.findOne(id, caller);
    await this.repo.softDelete(entity.id);
    return { success: true, id };
  }
}
