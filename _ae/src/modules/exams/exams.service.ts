import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Exam, ExamStatus } from './entities/exam.entity';
import { Caller, assertSameTenant, isSuperAdmin, tenantWhere } from '../../common/utils/tenant';

@Injectable()
export class ExamsService {
  private readonly logger = new Logger(ExamsService.name);

  constructor(
    @InjectRepository(Exam) private readonly repo: Repository<Exam>,
  ) {}

  // ---- State machine (blueprint 4.1) ----
  private static readonly TRANSITIONS: Record<ExamStatus, ExamStatus[]> = {
    [ExamStatus.DRAFT]: [ExamStatus.SUBMITTED],
    [ExamStatus.SUBMITTED]: [ExamStatus.REVIEWED, ExamStatus.DRAFT],
    [ExamStatus.REVIEWED]: [ExamStatus.APPROVED, ExamStatus.SUBMITTED],
    [ExamStatus.APPROVED]: [ExamStatus.PUBLISHED, ExamStatus.REVIEWED],
    [ExamStatus.PUBLISHED]: [ExamStatus.LOCKED],
    [ExamStatus.LOCKED]: [],
  };

  async transition(
    id: string,
    newStatus: ExamStatus,
    changedBy: string,
    caller?: Caller,
    notes?: string,
  ): Promise<Exam> {
    const exam = await this.findOne(id, caller);
    const current = exam.status ?? ExamStatus.DRAFT;
    const allowed = ExamsService.TRANSITIONS[current] ?? [];
    const isSuper = caller?.role === 'SUPER_ADMIN';

    if (!allowed.includes(newStatus) && !(isSuper && newStatus === ExamStatus.DRAFT)) {
      throw new BadRequestException(`Cannot transition exam from ${current} to ${newStatus}`);
    }
    if (!Object.values(ExamStatus).includes(newStatus)) {
      throw new BadRequestException(`Unknown exam status ${newStatus}`);
    }

    exam.status = newStatus;
    exam.statusHistory = [
      ...(exam.statusHistory ?? []),
      { from: current, to: newStatus, changedBy, changedAt: new Date().toISOString(), notes },
    ];
    const saved = await this.repo.save(exam);
    this.logger.log(`Exam ${id} ${current} → ${newStatus} by ${changedBy}`);
    return saved;
  }

  async create(payload: Partial<Exam>, caller?: Caller): Promise<Exam> {
    if (caller && !isSuperAdmin(caller) && caller.school_id) {
      payload = { ...payload, schoolId: caller.school_id };
    }
    const entity = this.repo.create(payload);
    const saved = await this.repo.save(entity);
    this.logger.log(`Created Exam id=${saved.id}`);
    return saved;
  }

  async findAll(opts: {
    page?: number;
    limit?: number;
    search?: string;
    where?: Record<string, unknown>;
  } = {}, caller?: Caller): Promise<{ items: Exam[]; meta: { page: number; limit: number; total: number } }> {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 20, 200);
    const where = tenantWhere(caller, (opts.where as Record<string, unknown>) ?? {});
    const [items, total] = await this.repo.findAndCount({
      where: where as never,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' } as never,
    });
    return { items, meta: { page, limit, total } };
  }

  async findOne(id: string, caller?: Caller): Promise<Exam> {
    const entity = await this.repo.findOne({ where: { id } as never });
    if (!entity) throw new NotFoundException(`Exam ${id} not found`);
    assertSameTenant(caller, (entity as unknown as { schoolId?: string }).schoolId);
    return entity;
  }

  async update(id: string, payload: Partial<Exam>, caller?: Caller): Promise<Exam> {
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
