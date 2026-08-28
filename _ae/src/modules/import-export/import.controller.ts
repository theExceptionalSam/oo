import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { parseCsv } from '../../common/utils/csv';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { Caller } from '../../common/utils/tenant';
import { isSuperAdmin } from '../../common/utils/tenant';
import { UserRole } from '../users/entities/user.entity';
import { User } from '../users/entities/user.entity';
import { Student } from '../students/entities/student.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { Exam } from '../exams/entities/exam.entity';
import { Mark } from '../marks/entities/mark.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { Class } from '../classes/entities/class.entity';

interface ImportMarksDto {
  examId: string;
  /** CSV columns: rollNumber,subjectCode,marksObtained,grade */
  csv: string;
}

interface ImportStudentsDto {
  /** Optional class id — enrolled students are auto-enrolled. */
  classId?: string;
  /** Default password for created accounts (min 8 chars). */
  defaultPassword?: string;
  /** CSV columns: fullName,email,rollNumber,guardianName,guardianPhone */
  csv: string;
}

@ApiTags('import-export')
@ApiBearerAuth('access-token')
@Controller('import')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.TEACHER)
export class ImportController {
  constructor(
    @InjectRepository(Student) private readonly students: Repository<Student>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Subject) private readonly subjects: Repository<Subject>,
    @InjectRepository(Exam) private readonly exams: Repository<Exam>,
    @InjectRepository(Mark) private readonly marks: Repository<Mark>,
    @InjectRepository(Enrollment) private readonly enrollments: Repository<Enrollment>,
    @InjectRepository(Class) private readonly classes: Repository<Class>,
  ) {}

  /**
   * Bulk-import marks for one exam. Rows are keyed by student roll number +
   * subject code; unknown rows are reported (never silently dropped).
   */
  @Post('marks')
  @ApiOperation({ summary: 'Import marks from CSV (rollNumber,subjectCode,marksObtained,grade)' })
  async importMarks(@Body() dto: ImportMarksDto, @CurrentUser() caller: Caller) {
    if (!dto?.examId || !dto?.csv) throw new BadRequestException('examId and csv are required');
    const rows = parseCsv(dto.csv);
    if (!rows.length) throw new BadRequestException('CSV contains no data rows');

    const exam = await this.exams.findOne({ where: { id: dto.examId } });
    if (!exam) throw new BadRequestException(`Exam ${dto.examId} not found`);
    if (!isSuperAdmin(caller) && caller?.school_id && exam.schoolId !== caller.school_id) {
      throw new BadRequestException(`Exam ${dto.examId} not found`);
    }

    const scoped = !isSuperAdmin(caller) && caller?.school_id;
    const studentQb = this.students.createQueryBuilder('s')
      .leftJoinAndSelect('s.user', 'u').where('s.deleted_at IS NULL');
    if (scoped) studentQb.andWhere('u.school_id = :sid', { sid: caller.school_id });
    const allStudents = await studentQb.getMany();
    const byRoll = new Map(allStudents.filter((s) => s.rollNumber).map((s) => [s.rollNumber as string, s]));

    const subjectQb = this.subjects.createQueryBuilder('sub').where('sub.deleted_at IS NULL');
    if (scoped) subjectQb.andWhere('sub.school_id = :sid', { sid: caller.school_id });
    const allSubjects = await subjectQb.getMany();
    const byCode = new Map(allSubjects.filter((s) => s.code).map((s) => [s.code as string, s]));

    let imported = 0;
    const skipped: string[] = [];
    for (const [i, row] of rows.entries()) {
      const student = byRoll.get(row.rollNumber);
      const subject = byCode.get(row.subjectCode);
      const score = Number(row.marksObtained);
      if (!student) { skipped.push(`row ${i + 2}: unknown rollNumber "${row.rollNumber}"`); continue; }
      if (!subject) { skipped.push(`row ${i + 2}: unknown subjectCode "${row.subjectCode}"`); continue; }
      if (Number.isNaN(score)) { skipped.push(`row ${i + 2}: marksObtained is not a number`); continue; }

      await this.marks.save({
        examId: dto.examId,
        studentId: student.id,
        subjectId: subject.id,
        marksObtained: score,
        grade: row.grade || null,
        recordedById: caller?.sub ?? null,
      });
      imported++;
    }
    return { imported, skipped, total: rows.length };
  }

  /**
   * Bulk-import students: creates a STUDENT user account + student profile
   * per row, and optionally enrolls them into a class.
   */
  @Post('students')
  @ApiOperation({ summary: 'Import students from CSV (fullName,email,rollNumber,guardianName,guardianPhone)' })
  async importStudents(@Body() dto: ImportStudentsDto, @CurrentUser() caller: Caller) {
    if (!dto?.csv) throw new BadRequestException('csv is required');
    const rows = parseCsv(dto.csv);
    if (!rows.length) throw new BadRequestException('CSV contains no data rows');

    const schoolId = (isSuperAdmin(caller) ? null : caller?.school_id) ?? null;
    const password = dto.defaultPassword && dto.defaultPassword.length >= 8
      ? dto.defaultPassword
      : 'Student!123';
    const passwordHash = await bcrypt.hash(password, 10);

    let targetClass: Class | null = null;
    if (dto.classId) {
      targetClass = await this.classes.findOne({ where: { id: dto.classId } });
      if (!targetClass) throw new BadRequestException(`Class ${dto.classId} not found`);
      if (schoolId && targetClass.schoolId !== schoolId) {
        throw new BadRequestException(`Class ${dto.classId} not found`);
      }
    }

    let imported = 0;
    const skipped: string[] = [];
    for (const [i, row] of rows.entries()) {
      const email = row.email?.toLowerCase();
      if (!row.fullName || !email) { skipped.push(`row ${i + 2}: fullName and email are required`); continue; }

      const existingUser = await this.users.findOne({ where: { email } });
      if (existingUser) { skipped.push(`row ${i + 2}: email ${email} already exists`); continue; }

      const user = await this.users.save({
        email,
        passwordHash,
        role: UserRole.STUDENT,
        schoolId,
        profile: { fullName: row.fullName },
        emailVerified: false,
      });
      const student = await this.students.save({
        userId: user.id,
        rollNumber: row.rollNumber || crypto.randomUUID().slice(0, 8).toUpperCase(),
        guardianInfo: { name: row.guardianName ?? '', phone: row.guardianPhone ?? '' },
      });
      if (targetClass) {
        await this.enrollments.save({ studentId: student.id, classId: targetClass.id, status: 'active' });
      }
      imported++;
    }
    return { imported, skipped, total: rows.length, defaultPassword: password };
  }
}
