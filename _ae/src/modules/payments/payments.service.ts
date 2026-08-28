import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeePayment } from './entities/fee-payment.entity';
import { Caller, isSuperAdmin } from '../../common/utils/tenant';
import { ScopeService } from '../../common/scope/scope.service';
import { In } from 'typeorm';

const NONE = ['00000000-0000-0000-0000-000000000000'];

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(FeePayment) private readonly repo: Repository<FeePayment>,
    private readonly scope: ScopeService,
  ) {}

  async create(payload: Partial<FeePayment>): Promise<FeePayment> {
    const entity = this.repo.create(payload);
    const saved = await this.repo.save(entity);
    this.logger.log(`Created FeePayment id=${saved.id}`);
    return saved;
  }

  async findAll(opts: {
    page?: number;
    limit?: number;
    search?: string;
    where?: Record<string, unknown>;
  } = {}, caller?: Caller): Promise<{ items: FeePayment[]; meta: { page: number; limit: number; total: number } }> {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 20, 200);
    // Payments belong to a school via their fee structure; parents/students
    // see only their children's/own payments.
    const where: Record<string, unknown> = { ...(opts.where as Record<string, unknown>) };
    if (!isSuperAdmin(caller) && caller?.school_id) where.feeStructure = { schoolId: caller.school_id };
    const studentIds = await this.scope.studentIdsFor(caller);
    if (studentIds !== null) where.studentId = In(studentIds.length ? studentIds : NONE);
    const [items, total] = await this.repo.findAndCount({
      where: where as never,
      relations: { feeStructure: true },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' } as never,
    });
    return { items, meta: { page, limit, total } };
  }

  async findOne(id: string, caller?: Caller): Promise<FeePayment> {
    const where: Record<string, unknown> = { id };
    if (!isSuperAdmin(caller) && caller?.school_id) where.feeStructure = { schoolId: caller.school_id };
    const entity = await this.repo.findOne({ where: where as never, relations: { feeStructure: true } });
    if (!entity) throw new NotFoundException(`FeePayment ${id} not found`);
    const studentIds = await this.scope.studentIdsFor(caller);
    if (studentIds !== null && !studentIds.includes(entity.studentId)) {
      throw new NotFoundException(`FeePayment ${id} not found`);
    }
    return entity;
  }

  async update(id: string, payload: Partial<FeePayment>, caller?: Caller): Promise<FeePayment> {
    const entity = await this.findOne(id, caller);
    Object.assign(entity, payload);
    return this.repo.save(entity);
  }

  async remove(id: string, caller?: Caller): Promise<{ success: boolean; id: string }> {
    const entity = await this.findOne(id, caller);
    await this.repo.softDelete(entity.id);
    return { success: true, id };
  }

  /**
   * Financial report: total collected and outstanding per student.
   */
  async report(opts: { from: Date; to: Date; studentId?: string }, caller?: Caller): Promise<{
    studentId: string;
    collected: number;
    outstanding: number;
    transactions: number;
  }[]> {
    const qb = this.repo
      .createQueryBuilder('p')
      .select('p.studentId', 'studentId')
      .addSelect(`SUM(CASE WHEN p.status = 'completed' THEN p.amount ELSE 0 END)`, 'collected')
      .addSelect(`SUM(CASE WHEN p.status IN ('pending','failed') THEN p.amount ELSE 0 END)`, 'outstanding')
      .addSelect('COUNT(*)', 'transactions')
      .where('p.createdAt BETWEEN :from AND :to', { from: opts.from, to: opts.to })
      .groupBy('p.studentId');
    if (opts.studentId) qb.andWhere('p.studentId = :studentId', { studentId: opts.studentId });
    // Parents/students see only their children's/own financials.
    const studentIds = await this.scope.studentIdsFor(caller);
    if (studentIds !== null) {
      qb.andWhere(studentIds.length ? 'p.student_id IN (:...ids)' : '1 = 0', { ids: studentIds });
    }
    // Tenant scope via the fee structure join.
    if (!isSuperAdmin(caller) && caller?.school_id) {
      qb.andWhere((qb2) => {
        const sub = qb2.subQuery().select('fs.id').from('fee_structures', 'fs')
          .where('fs.school_id = :schoolId');
        return 'p.feeStructureId IN ' + sub.getQuery();
      }).setParameter('schoolId', caller.school_id);
    }

    const raw = (await qb.getRawMany()) as Array<{
      studentId: string;
      collected: string;
      outstanding: string;
      transactions: string;
    }>;
    return raw.map((r) => ({
      studentId: r.studentId,
      collected: Number(r.collected),
      outstanding: Number(r.outstanding),
      transactions: Number(r.transactions),
    }));
  }
}
