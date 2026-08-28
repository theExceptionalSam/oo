import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Enrollment } from './entities/enrollment.entity';
import { Caller, isSuperAdmin } from '../../common/utils/tenant';

@Injectable()
export class EnrollmentsService {
  private readonly logger = new Logger(EnrollmentsService.name);

  constructor(
    @InjectRepository(Enrollment) private readonly repo: Repository<Enrollment>,
  ) {}

  async create(payload: Partial<Enrollment>): Promise<Enrollment> {
    const entity = this.repo.create(payload);
    const saved = await this.repo.save(entity);
    this.logger.log(`Created Enrollment id=${saved.id}`);
    return saved;
  }

  async findAll(opts: {
    page?: number;
    limit?: number;
    search?: string;
    where?: Record<string, unknown>;
  } = {}, caller?: Caller): Promise<{ items: Enrollment[]; meta: { page: number; limit: number; total: number } }> {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 20, 200);
    // Enrollments belong to a school via their class.
    const where: Record<string, unknown> = { ...(opts.where as Record<string, unknown>) };
    if (!isSuperAdmin(caller) && caller?.school_id) where.class = { schoolId: caller.school_id };
    const [items, total] = await this.repo.findAndCount({
      where: where as never,
      relations: { class: true },
      skip: (page - 1) * limit,
      take: limit,
      order: { enrolledAt: 'DESC' } as never,
    });
    return { items, meta: { page, limit, total } };
  }

  async findOne(id: string, caller?: Caller): Promise<Enrollment> {
    const where: Record<string, unknown> = { id };
    if (!isSuperAdmin(caller) && caller?.school_id) where.class = { schoolId: caller.school_id };
    const entity = await this.repo.findOne({ where: where as never, relations: { class: true } });
    if (!entity) throw new NotFoundException(`Enrollment ${id} not found`);
    return entity;
  }

  async update(id: string, payload: Partial<Enrollment>, caller?: Caller): Promise<Enrollment> {
    const entity = await this.findOne(id, caller);
    Object.assign(entity, payload);
    return this.repo.save(entity);
  }

  async remove(id: string, caller?: Caller): Promise<{ success: boolean; id: string }> {
    const entity = await this.findOne(id, caller);
    await this.repo.softDelete(entity.id);
    return { success: true, id };
  }
}
