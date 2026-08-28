import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attendance, AttendanceStatus } from './entities/attendance.entity';
import { Class } from '../classes/entities/class.entity';
import { EventBus } from '../../shared/events/event-bus.module';
import { SchoolSyncEvents } from '../../shared/events';
import { BulkMarkAttendanceDto } from './dto/bulk-attendance.dto';
import { Caller, assertSameTenant, isSuperAdmin, tenantWhere } from '../../common/utils/tenant';
import { ScopeService } from '../../common/scope/scope.service';
import { In } from 'typeorm';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    @InjectRepository(Attendance) private readonly repo: Repository<Attendance>,
    @InjectRepository(Class) private readonly classes: Repository<Class>,
    private readonly eventBus: EventBus,
    private readonly scope: ScopeService,
  ) {}

  async create(payload: Partial<Attendance>, caller?: Caller): Promise<Attendance> {
    if (caller && !isSuperAdmin(caller) && caller.school_id) {
      payload = { ...payload, schoolId: caller.school_id };
    }
    const entity = this.repo.create(payload);
    const saved = await this.repo.save(entity);
    this.logger.log(`Created Attendance id=${saved.id}`);
    return saved;
  }

  async findAll(opts: {
    page?: number;
    limit?: number;
    search?: string;
    where?: Record<string, unknown>;
  } = {}, caller?: Caller): Promise<{ items: Attendance[]; meta: { page: number; limit: number; total: number } }> {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 20, 200);
    const where = tenantWhere(caller, (opts.where as Record<string, unknown>) ?? {});
    // Teachers/parents/students only see their own classes/children/self.
    const studentIds = await this.scope.studentIdsFor(caller);
    if (studentIds !== null) where.studentId = In(studentIds.length ? studentIds : ['00000000-0000-0000-0000-000000000000']);
    const [items, total] = await this.repo.findAndCount({
      where: where as never,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' } as never,
    });
    return { items, meta: { page, limit, total } };
  }

  async findOne(id: string, caller?: Caller): Promise<Attendance> {
    const entity = await this.repo.findOne({ where: { id } as never });
    if (!entity) throw new NotFoundException(`Attendance ${id} not found`);
    assertSameTenant(caller, (entity as unknown as { schoolId?: string }).schoolId);
    return entity;
  }

  async update(id: string, payload: Partial<Attendance>, caller?: Caller): Promise<Attendance> {
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
   * Bulk-mark attendance for a class on a given date. Upserts by (classId, studentId, date).
   * Publishes `attendance.absent` events for any student marked absent (consumers
   * in NotificationsModule dispatch parent alerts).
   */
  async bulkMark(dto: BulkMarkAttendanceDto, recordedById: string, caller?: Caller): Promise<{
    total: number;
    absentCount: number;
    publishedAt: string;
  }> {
    const date = new Date(dto.date);
    const cls = await this.classes.findOne({ where: { id: dto.classId } });
    if (!cls) throw new NotFoundException(`Class ${dto.classId} not found`);
    assertSameTenant(caller, cls.schoolId);
    // Layer 3: teachers may only mark attendance for their assigned classes.
    if (caller?.role === 'TEACHER') {
      const teacherClassIds = await this.scope.classIdsForTeacher(caller.sub);
      if (!teacherClassIds.includes(dto.classId)) {
        throw new ForbiddenException('You can only mark attendance for your assigned classes');
      }
    }
    const rows = dto.entries.map((entry) =>
      this.repo.create({
        classId: dto.classId,
        studentId: entry.studentId,
        status: entry.status,
        remarks: entry.remarks ?? null,
        date,
        recordedById,
        schoolId: cls.schoolId,
      }),
    );

    // schoolId is resolved above from the class record so every attendance
    // row stays tenant-attributable. Re-marking a class/date replaces the
    // previous sheet atomically (delete + insert in one transaction).
    await this.repo.manager.transaction(async (manager) => {
      await manager.delete(Attendance, { date, classId: dto.classId });
      await manager.save(Attendance, rows);
    });

    const absent = rows.filter((r) => r.status === 'absent');
    for (const r of absent) {
      await this.eventBus.publish(SchoolSyncEvents.ATTENDANCE_ABSENT, {
        studentId: r.studentId,
        classId: r.classId,
        date: date.toISOString(),
      });
    }
    await this.eventBus.publish(SchoolSyncEvents.ATTENDANCE_MARKED, {
      classId: dto.classId,
      date: date.toISOString(),
      total: rows.length,
      absentCount: absent.length,
    });

    this.logger.log(
      `Bulk-marked ${rows.length} attendance rows (absent=${absent.length}) for class ${dto.classId}`,
    );
    return {
      total: rows.length,
      absentCount: absent.length,
      publishedAt: new Date().toISOString(),
    };
  }

  /**
   * Aggregate attendance report: per-student present-rate over a date range.
   */
  async report(opts: {
    classId?: string;
    studentId?: string;
    from: Date;
    to: Date;
  }, caller?: Caller): Promise<{
    studentId: string;
    present: number;
    absent: number;
    late: number;
    excused: number;
    rate: number;
  }[]> {
    const qb = this.repo
      .createQueryBuilder('a')
      .select('a.studentId', 'studentId')
      .addSelect(`SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END)`, 'present')
      .addSelect(`SUM(CASE WHEN a.status = 'absent'  THEN 1 ELSE 0 END)`, 'absent')
      .addSelect(`SUM(CASE WHEN a.status = 'late'    THEN 1 ELSE 0 END)`, 'late')
      .addSelect(`SUM(CASE WHEN a.status = 'excused' THEN 1 ELSE 0 END)`, 'excused')
      .where('a.date BETWEEN :from AND :to', { from: opts.from, to: opts.to })
      .groupBy('a.studentId');

    if (!isSuperAdmin(caller) && caller?.school_id) {
      qb.andWhere('a.school_id = :schoolId', { schoolId: caller.school_id });
    }
    // Soft boundaries: teachers/parents/students see their own rows only.
    const studentIds = await this.scope.studentIdsFor(caller);
    if (studentIds !== null) {
      qb.andWhere(studentIds.length ? 'a.student_id IN (:...ids)' : '1 = 0', { ids: studentIds });
    }
    if (opts.classId) qb.andWhere('a.classId = :classId', { classId: opts.classId });
    if (opts.studentId) qb.andWhere('a.studentId = :studentId', { studentId: opts.studentId });

    const raw = (await qb.getRawMany()) as Array<{
      studentId: string;
      present: string;
      absent: string;
      late: string;
      excused: string;
    }>;

    return raw.map((r) => {
      const present = Number(r.present);
      const absent = Number(r.absent);
      const late = Number(r.late);
      const excused = Number(r.excused);
      const total = present + absent + late + excused;
      return {
        studentId: r.studentId,
        present,
        absent,
        late,
        excused,
        rate: total === 0 ? 0 : (present + late) / total,
      };
    });
  }
}
