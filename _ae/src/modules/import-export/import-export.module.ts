import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExportController } from './export.controller';
import { ImportController } from './import.controller';
import { Student } from '../students/entities/student.entity';
import { User } from '../users/entities/user.entity';
import { Mark } from '../marks/entities/mark.entity';
import { Exam } from '../exams/entities/exam.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { Attendance } from '../attendance/entities/attendance.entity';
import { FeePayment } from '../payments/entities/fee-payment.entity';
import { Announcement } from '../announcements/entities/announcement.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { Class } from '../classes/entities/class.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Student, User, Mark, Exam, Subject, Attendance, FeePayment,
      Announcement, Enrollment, Class,
    ]),
  ],
  controllers: [ExportController, ImportController],
})
export class ImportExportModule {}
