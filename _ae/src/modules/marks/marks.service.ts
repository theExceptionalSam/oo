import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Mark } from './entities/mark.entity';
import { BulkUploadMarksDto } from './dto/bulk-marks.dto';
import { EventBus } from '../../shared/events/event-bus.module';
import { SchoolSyncEvents } from '../../shared/events';
import { Caller, isSuperAdmin } from '../../common/utils/tenant';
import { ScopeService } from '../../common/scope/scope.service';
import { In } from 'typeorm';
import { ForbiddenException } from '@nestjs/common';
import { Exam } from '../exams/entities/exam.entity';
import { School } from '../schools/entities/school.entity';

const NONE = ['00000000-0000-0000-0000-000000000000'];

@Injectable()
export class MarksService {
  private readonly logger = new Logger(MarksService.name);

  constructor(
    @InjectRepository(Mark) private readonly repo: Repository<Mark>,
    @InjectRepository(Exam) private readonly exams: Repository<Exam>,
    @InjectRepository(School) private readonly schools: Repository<School>,
    private readonly eventBus: EventBus,
    private readonly scope: ScopeService,
  ) {}

  async create(payload: Partial<Mark>, caller?: Caller): Promise<Mark> {
    // Blueprint 4.1: marks are only enterable while the exam is editable.
    const exam = await this.exams.findOne({ where: { id: payload.examId } });
    if (!exam) throw new NotFoundException(`Exam ${payload.examId} not found`);
    if (!['draft', 'submitted'].includes(exam.status ?? 'draft')) {
      throw new ForbiddenException(`Cannot modify marks for exam in ${exam.status} status`);
    }

    // Blueprint 4.2: grade derives from the school's grading configuration.
    const grade = payload.grade
      ?? (await this.calculateGrade(exam.schoolId, Number(payload.marksObtained ?? 0), exam.maxMarks ?? 100));

    const entity = this.repo.create({ ...payload, grade, recordedById: caller?.sub ?? payload.recordedById ?? null });
    const saved = await this.repo.save(entity);
    this.logger.log(`Created Mark id=${saved.id} (grade ${grade})`);
    return saved;
  }

  /** Per-school grading bands from settings.gradingSystem; sensible default. */
  private async calculateGrade(schoolId: string, marksObtained: number, maxMarks: number): Promise<string> {
    const school = await this.schools.findOne({ where: { id: schoolId } });
    const settings = (school?.settings ?? {}) as {
      gradingSystem?: Array<{ minScore: number; maxScore: number; grade: string }>;
    };
    const bands = settings.gradingSystem?.length
      ? settings.gradingSystem
      : [
          { minScore: 70, maxScore: 100, grade: 'A' },
          { minScore: 60, maxScore: 69, grade: 'B' },
          { minScore: 50, maxScore: 59, grade: 'C' },
          { minScore: 45, maxScore: 49, grade: 'D' },
          { minScore: 40, maxScore: 44, grade: 'E' },
          { minScore: 0, maxScore: 39, grade: 'F' },
        ];
    const pct = maxMarks > 0 ? (marksObtained / maxMarks) * 100 : 0;
    const band = bands.find((b) => pct >= b.minScore && pct <= b.maxScore);
    return band?.grade ?? 'F';
  }

  async findAll(opts: {
    page?: number;
    limit?: number;
    where?: Record<string, unknown>;
  } = {}, caller?: Caller): Promise<{ items: Mark[]; meta: { page: number; limit: number; total: number } }> {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 20, 200);
    // Marks belong to a school via their exam; teachers/parents/students are
    // further scoped to their classes/children/self.
    const where: Record<string, unknown> = { ...(opts.where as Record<string, unknown>) };
    if (!isSuperAdmin(caller) && caller?.school_id) where.exam = { schoolId: caller.school_id };
    const studentIds = await this.scope.studentIdsFor(caller);
    if (studentIds !== null) where.studentId = In(studentIds.length ? studentIds : NONE);
    const [items, total] = await this.repo.findAndCount({
      where: where as never,
      relations: { exam: true },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' } as never,
    });
    return { items, meta: { page, limit, total } };
  }

  async findOne(id: string, caller?: Caller): Promise<Mark> {
    const where: Record<string, unknown> = { id };
    if (!isSuperAdmin(caller) && caller?.school_id) where.exam = { schoolId: caller.school_id };
    const entity = await this.repo.findOne({ where: where as never, relations: { exam: true } });
    if (!entity) throw new NotFoundException(`Mark ${id} not found`);
    const studentIds = await this.scope.studentIdsFor(caller);
    if (studentIds !== null && !studentIds.includes(entity.studentId)) {
      throw new NotFoundException(`Mark ${id} not found`);
    }
    return entity;
  }

  async update(id: string, payload: Partial<Mark>, caller?: Caller): Promise<Mark> {
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
   * Bulk upload marks for an exam. Upserts by (examId, studentId, subjectId).
   */
  async bulkUpload(
    examId: string,
    dto: BulkUploadMarksDto,
    recordedById: string,
  ): Promise<{ total: number; publishedAt: string }> {
    const rows = dto.entries.map((e) =>
      this.repo.create({
        examId,
        studentId: e.studentId,
        subjectId: e.subjectId,
        marksObtained: e.marksObtained,
        grade: e.grade ?? null,
        remarks: e.remarks ?? null,
        recordedById,
      }),
    );

    await this.repo
      .createQueryBuilder()
      .insert()
      .into(Mark)
      .values(rows as never)
      .orUpdate(['marksObtained', 'grade', 'remarks', 'recordedById'], ['examId', 'studentId', 'subjectId'])
      .execute();

    await this.eventBus.publish(SchoolSyncEvents.EXAM_PUBLISHED, {
      examId,
      count: rows.length,
    });

    this.logger.log(`Bulk-uploaded ${rows.length} marks for exam ${examId}`);
    return { total: rows.length, publishedAt: new Date().toISOString() };
  }

  /**
   * Build a report card: every subject's latest mark for a student.
   */
  async reportCard(studentId: string, caller?: Caller): Promise<{
    studentId: string;
    subjects: Array<{ subjectId: string; marksObtained: number | null; grade: string | null }>;
    gpa: number;
  }> {
    const where: Record<string, unknown> = { studentId };
    if (!isSuperAdmin(caller) && caller?.school_id) where.exam = { schoolId: caller.school_id };
    // Parents/students can only pull report cards for their own children/self.
    const studentIds = await this.scope.studentIdsFor(caller);
    if (studentIds !== null && !studentIds.includes(studentId)) {
      throw new NotFoundException(`Report card for ${studentId} not found`);
    }
    const marks = await this.repo.find({
      where: where as never,
      order: { createdAt: 'DESC' },
    });
    const bySubject = new Map<string, Mark>();
    for (const m of marks) {
      if (!bySubject.has(m.subjectId)) bySubject.set(m.subjectId, m);
    }
    const subjects = Array.from(bySubject.entries()).map(([subjectId, m]) => ({
      subjectId,
      marksObtained: m.marksObtained,
      grade: m.grade,
    }));
    const valid = subjects.filter((s) => s.marksObtained != null);
    const gpa =
      valid.length === 0
        ? 0
        : valid.reduce((sum, s) => sum + (s.marksObtained ?? 0), 0) / valid.length / 25; // 0–4 scale
    return { studentId, subjects, gpa: Number(gpa.toFixed(2)) };
  }
}
