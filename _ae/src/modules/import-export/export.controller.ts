import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Response } from 'express';
import { toCsv } from '../../common/utils/csv';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { Caller } from '../../common/utils/tenant';
import { isSuperAdmin } from '../../common/utils/tenant';
import { UserRole } from '../users/entities/user.entity';
import { Student } from '../students/entities/student.entity';
import { User } from '../users/entities/user.entity';
import { Mark } from '../marks/entities/mark.entity';
import { Exam } from '../exams/entities/exam.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { Attendance } from '../attendance/entities/attendance.entity';
import { FeePayment } from '../payments/entities/fee-payment.entity';
import { Announcement } from '../announcements/entities/announcement.entity';

/**
 * CSV exports for the tenant's data. All lists are tenant-scoped via the
 * caller; super admins export across schools.
 */
@ApiTags('import-export')
@ApiBearerAuth('access-token')
@Controller('export')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.TEACHER)
export class ExportController {
  constructor(
    @InjectRepository(Student) private readonly students: Repository<Student>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Mark) private readonly marks: Repository<Mark>,
    @InjectRepository(Exam) private readonly exams: Repository<Exam>,
    @InjectRepository(Subject) private readonly subjects: Repository<Subject>,
    @InjectRepository(Attendance) private readonly attendance: Repository<Attendance>,
    @InjectRepository(FeePayment) private readonly payments: Repository<FeePayment>,
    @InjectRepository(Announcement) private readonly announcements: Repository<Announcement>,
  ) {}

  @Get(':entity')
  @ApiOperation({ summary: 'Download a CSV export: students | marks | attendance | payments | users | announcements' })
  async export(
    @Param('entity') entity: string,
    @CurrentUser() caller: Caller,
    @Res() res: Response,
  ) {
    const scoped = !isSuperAdmin(caller) && caller?.school_id;
    let csv: string;

    switch (entity) {
      case 'students': {
        const qb = this.students
          .createQueryBuilder('s')
          .leftJoinAndSelect('s.user', 'u')
          .where('s.deleted_at IS NULL');
        if (scoped) qb.andWhere('u.school_id = :sid', { sid: caller.school_id });
        const rows = await qb.getMany();
        csv = toCsv(
          rows.map((s) => ({
            rollNumber: s.rollNumber ?? '',
            email: s.user?.email ?? '',
            fullName: (s.user?.profile as Record<string, unknown>)?.fullName ?? '',
            admissionDate: (s.admissionDate ?? '') + '',
            guardianName: (s.guardianInfo as Record<string, unknown>)?.name ?? '',
            guardianPhone: (s.guardianInfo as Record<string, unknown>)?.phone ?? '',
          })),
          ['rollNumber', 'email', 'fullName', 'admissionDate', 'guardianName', 'guardianPhone'],
        );
        break;
      }
      case 'marks': {
        const qb = this.marks
          .createQueryBuilder('m')
          .leftJoinAndSelect('m.exam', 'e')
          .leftJoinAndSelect('m.subject', 'sub')
          .leftJoinAndMapOne(
            'm.studentRow', Student, 'st', 'st.id = m.studentId',
          )
          .leftJoin(User, 'su', 'su.id = st.userId')
          .addSelect('su.email', 'su_email')
          .where('m.deleted_at IS NULL');
        if (scoped) qb.andWhere('e.school_id = :sid', { sid: caller.school_id });
        const rows = await qb.getMany();
        csv = toCsv(
          rows.map((m) => {
            const st = (m as unknown as { studentRow?: Student }).studentRow;
            const student = st?.rollNumber
              ?? (st as unknown as { userEmail?: string })?.userEmail
              ?? m.studentId.slice(0, 8);
            return {
              exam: (m.exam as unknown as Exam)?.name ?? m.examId,
              subject: (m.subject as unknown as Subject)?.name ?? m.subjectId,
              student,
              marksObtained: m.marksObtained ?? '',
              grade: m.grade ?? '',
              remarks: m.remarks ?? '',
            };
          }),
        );
        break;
      }
      case 'attendance': {
        const qb = this.attendance.createQueryBuilder('a').where('a.deleted_at IS NULL');
        if (scoped) qb.andWhere('a.school_id = :sid', { sid: caller.school_id });
        const rows = await qb.getMany();
        csv = toCsv(
          rows.map((a) => ({
            date: (a.date as unknown as string)?.slice?.(0, 10) ?? a.date,
            studentId: a.studentId,
            classId: a.classId,
            status: a.status,
            remarks: a.remarks ?? '',
          })),
        );
        break;
      }
      case 'payments': {
        const qb = this.payments
          .createQueryBuilder('p')
          .leftJoinAndSelect('p.feeStructure', 'f')
          .where('p.deleted_at IS NULL');
        if (scoped) qb.andWhere('f.school_id = :sid', { sid: caller.school_id });
        const rows = await qb.getMany();
        csv = toCsv(
          rows.map((p) => ({
            date: (p.createdAt as unknown as string)?.slice?.(0, 10) ?? '',
            studentId: p.studentId,
            fee: (p.feeStructure as unknown as { name?: string })?.name ?? p.feeStructureId,
            amount: p.amount,
            method: p.method ?? '',
            status: p.status,
          })),
        );
        break;
      }
      case 'users': {
        const qb = this.users.createQueryBuilder('u').where('u.deleted_at IS NULL');
        if (scoped) qb.andWhere('u.school_id = :sid', { sid: caller.school_id });
        const rows = await qb.getMany();
        csv = toCsv(
          rows.map((u) => ({
            email: u.email,
            fullName: (u.profile as Record<string, unknown>)?.fullName ?? '',
            role: u.role,
            status: u.status,
          })),
        );
        break;
      }
      case 'announcements': {
        const qb = this.announcements.createQueryBuilder('a').where('a.deleted_at IS NULL');
        if (scoped) qb.andWhere('a.school_id = :sid', { sid: caller.school_id });
        const rows = await qb.getMany();
        csv = toCsv(
          rows.map((a) => ({
            title: a.title,
            content: a.content,
            priority: a.priority,
            publishedAt: (a.publishedAt ?? a.createdAt ?? '') + '',
          })),
        );
        break;
      }
      default:
        throw new BadRequestException(
          'Unknown export entity. Use students | marks | attendance | payments | users | announcements',
        );
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="schoolsync-${entity}-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }
}
