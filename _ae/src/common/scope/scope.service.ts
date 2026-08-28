import { Injectable, Inject, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import type Redis from 'ioredis';
import { Class } from '../../modules/classes/entities/class.entity';
import { ClassSubject } from '../../modules/classes/entities/class-subject.entity';
import { Enrollment } from '../../modules/enrollments/entities/enrollment.entity';
import { Student } from '../../modules/students/entities/student.entity';
import { REDIS_CLIENT } from '../../config/redis.config';
import type { Caller } from '../utils/tenant';

/**
 * Resolves role-scoped "soft boundaries" inside a tenant:
 *  - TEACHER → students enrolled in classes they teach
 *  - PARENT  → students whose guardianInfo links to them
 *  - STUDENT → their own student record(s)
 *  - ADMIN / SUPER_ADMIN → null (no restriction)
 *
 * Results are cached briefly in Redis to keep hot paths cheap.
 */
@Injectable()
export class ScopeService {
  constructor(
    @InjectRepository(Class) private readonly classes: Repository<Class>,
    @InjectRepository(ClassSubject) private readonly classSubjects: Repository<ClassSubject>,
    @InjectRepository(Enrollment) private readonly enrollments: Repository<Enrollment>,
    @InjectRepository(Student) private readonly students: Repository<Student>,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  /** null = unrestricted; string[] = caller may only see these student ids. */
  async studentIdsFor(caller: Caller | undefined | null): Promise<string[] | null> {
    if (!caller?.sub) return null;
    switch (caller.role) {
      case 'TEACHER':
        return this.cached(`scope:teacher:${caller.sub}`, () => this.teacherStudentIds(caller));
      case 'PARENT':
        return this.cached(`scope:parent:${caller.sub}`, () => this.parentStudentIds(caller));
      case 'STUDENT':
        return this.cached(`scope:student:${caller.sub}`, () => this.ownStudentIds(caller));
      default:
        return null;
    }
  }

  /** Classes the teacher leads or is assigned to teach. */
  async classIdsForTeacher(userId: string): Promise<string[]> {
    const [led, assigned] = await Promise.all([
      this.classes.find({ where: { classTeacherId: userId }, select: ['id'] }),
      this.classSubjects.find({ where: { teacherId: userId }, select: ['classId'] }),
    ]);
    return [...new Set([...led.map((c) => c.id), ...assigned.map((cs) => cs.classId)])];
  }

  private async teacherStudentIds(caller: Caller): Promise<string[]> {
    const classIds = await this.classIdsForTeacher(caller.sub);
    if (!classIds.length) return [];
    const rows = await this.enrollments.find({
      where: { classId: In(classIds), status: 'active' },
      select: ['studentId'],
    });
    return [...new Set(rows.map((e) => e.studentId))];
  }

  private async parentStudentIds(caller: Caller): Promise<string[]> {
    // guardianInfo JSONB carries { parentUserId } — set by admin or CSV import.
    const rows = await this.students
      .createQueryBuilder('s')
      .select('s.id', 'id')
      .where(`s."guardian_info" ->> 'parentUserId' = :uid`, { uid: caller.sub })
      .getRawMany();
    return rows.map((r: { id: string }) => r.id);
  }

  private async ownStudentIds(caller: Caller): Promise<string[]> {
    const rows = await this.students.find({ where: { userId: caller.sub }, select: ['id'] });
    return rows.map((s) => s.id);
  }

  private async cached(key: string, load: () => Promise<string[]>): Promise<string[]> {
    try {
      const hit = await this.redis?.get(key);
      if (hit) return JSON.parse(hit) as string[];
    } catch { /* cache miss path */ }
    const ids = await load();
    try {
      await this.redis?.set(key, JSON.stringify(ids), 'EX', 30);
    } catch { /* best effort */ }
    return ids;
  }
}
