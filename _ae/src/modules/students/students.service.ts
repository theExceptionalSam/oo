import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Student, StudentStatus } from './entities/student.entity';
import { Caller, isSuperAdmin } from '../../common/utils/tenant';
import { ScopeService } from '../../common/scope/scope.service';

// Sentinel that yields an empty result when a scoped caller has no access.
const NONE = ['00000000-0000-0000-0000-000000000000'];

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor(
    @InjectRepository(Student) private readonly repo: Repository<Student>,
    private readonly scope: ScopeService,
  ) {}

  async create(payload: Partial<Student>): Promise<Student> {
    const entity = this.repo.create(payload);
    const saved = await this.repo.save(entity);
    this.logger.log(`Created Student id=${saved.id}`);
    return saved;
  }

  async findAll(opts: {
    page?: number;
    limit?: number;
    search?: string;
    where?: Record<string, unknown>;
  } = {}, caller?: Caller): Promise<{ items: Student[]; meta: { page: number; limit: number; total: number } }> {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 20, 200);
    // Students belong to a school via their user account; teachers/parents/
    // students are further scoped to their classes/children/self.
    const where: Record<string, unknown> = { ...(opts.where as Record<string, unknown>) };
    if (!isSuperAdmin(caller) && caller?.school_id) where.user = { schoolId: caller.school_id };
    const studentIds = await this.scope.studentIdsFor(caller);
    if (studentIds !== null) where.id = In(studentIds.length ? studentIds : NONE);

    const [items, total] = await this.repo.findAndCount({
      where: where as never,
      relations: { user: true },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' } as never,
    });
    return { items, meta: { page, limit, total } };
  }

  async findOne(id: string, caller?: Caller): Promise<Student> {
    const where: Record<string, unknown> = { id };
    if (!isSuperAdmin(caller) && caller?.school_id) where.user = { schoolId: caller.school_id };
    const entity = await this.repo.findOne({ where: where as never, relations: { user: true } });
    if (!entity) throw new NotFoundException(`Student ${id} not found`);
    const studentIds = await this.scope.studentIdsFor(caller);
    if (studentIds !== null && !studentIds.includes(id)) {
      throw new NotFoundException(`Student ${id} not found`);
    }
    return entity;
  }

  async update(id: string, payload: Partial<Student>, caller?: Caller): Promise<Student> {
    const entity = await this.findOne(id, caller);
    Object.assign(entity, payload);
    return this.repo.save(entity);
  }

  async remove(id: string, caller?: Caller): Promise<{ success: boolean; id: string }> {
    const entity = await this.findOne(id, caller);
    await this.repo.softDelete(entity.id);
    return { success: true, id };
  }

  // ---- Status workflow (blueprint 3.1) ----
  private static readonly TRANSITIONS: Record<string, string[]> = {
    applicant: ['active'],
    active: ['suspended', 'withdrawn', 'graduated', 'transferred', 'inactive'],
    suspended: ['active', 'withdrawn', 'transferred'],
    withdrawn: ['active'], // re-admission
    graduated: [],          // terminal
    transferred: [],        // terminal
    inactive: ['active', 'withdrawn'],
  };

  async updateStatus(
    id: string,
    newStatus: StudentStatus,
    changedBy: string,
    caller?: Caller,
    reason?: string,
  ): Promise<Student> {
    const student = await this.findOne(id, caller);
    const current = student.status;
    const allowed = StudentsService.TRANSITIONS[current] ?? [];
    const isSuper = caller?.role === 'SUPER_ADMIN';

    if (!allowed.includes(newStatus) && !isSuper) {
      throw new BadRequestException(`Cannot transition from ${current} to ${newStatus}`);
    }
    if (!Object.values(StudentStatus).includes(newStatus)) {
      throw new BadRequestException(`Unknown status ${newStatus}`);
    }

    student.status = newStatus;
    student.statusHistory = [
      ...(student.statusHistory ?? []),
      {
        from: current,
        to: newStatus,
        changedAt: new Date().toISOString(),
        changedBy,
        reason: isSuper && !allowed.includes(newStatus) ? reason ?? 'super_admin override' : reason,
      },
    ];
    const saved = await this.repo.save(student);
    this.logger.log(`Student ${id} status ${current} → ${newStatus} by ${changedBy}`);
    return saved;
  }
}
