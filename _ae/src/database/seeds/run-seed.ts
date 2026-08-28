import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import * as bcrypt from 'bcrypt';

import { School } from '../../modules/schools/entities/school.entity';
import { User, UserRole, UserStatus } from '../../modules/users/entities/user.entity';
import { AcademicYear } from '../../modules/academic-years/entities/academic-year.entity';
import { Subject } from '../../modules/subjects/entities/subject.entity';
import { Class } from '../../modules/classes/entities/class.entity';
import { Student } from '../../modules/students/entities/student.entity';
import { Enrollment } from '../../modules/enrollments/entities/enrollment.entity';
import { Attendance, AttendanceStatus } from '../../modules/attendance/entities/attendance.entity';
import { Exam } from '../../modules/exams/entities/exam.entity';
import { Mark } from '../../modules/marks/entities/mark.entity';
import { FeeStructure } from '../../modules/fees/entities/fee-structure.entity';
import { FeePayment } from '../../modules/payments/entities/fee-payment.entity';
import { Announcement } from '../../modules/announcements/entities/announcement.entity';
import { Message } from '../../modules/messages/entities/message.entity';

dotenv.config({ path: resolve(__dirname, '../../../.env') });

const RESET = process.argv.includes('--reset');
const rng = (seed: number) => () => {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
};
const rand = rng(42);

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'schoolsync',
    password: process.env.DB_PASSWORD ?? 'schoolsync',
    database: process.env.DB_DATABASE ?? 'schoolsync',
    entities: [
      School, User, AcademicYear, Subject, Class, Student, Enrollment,
      Attendance, Exam, Mark, FeeStructure, FeePayment, Announcement, Message,
    ],
    synchronize: true,
    logging: false,
  });

  await ds.initialize();

  try {
    if (RESET) {
      console.log('Resetting: truncating all tables…');
      await ds.query(`
        TRUNCATE TABLE notifications, messages, announcements, fee_payments, fee_structures,
          marks, exams, attendance, enrollments, students, class_subjects, subjects,
          classes, academic_years, users, tenants, schools, migrations RESTART IDENTITY CASCADE
      `);
    } else {
      const existing = await ds.getRepository(School).findOne({ where: { subdomain: 'demo-school' } });
      if (existing) {
        console.log('Seed already present — skipping. Run with --reset to wipe and reseed.');
        return;
      }
    }

    const schools = ds.getRepository(School);
    const users = ds.getRepository(User);
    const years = ds.getRepository(AcademicYear);
    const subjects = ds.getRepository(Subject);
    const classes = ds.getRepository(Class);
    const students = ds.getRepository(Student);
    const enrollments = ds.getRepository(Enrollment);
    const attendance = ds.getRepository(Attendance);
    const exams = ds.getRepository(Exam);
    const marks = ds.getRepository(Mark);
    const fees = ds.getRepository(FeeStructure);
    const payments = ds.getRepository(FeePayment);
    const announcements = ds.getRepository(Announcement);
    const messages = ds.getRepository(Message);

    // ---- School & academic year ----
    const school = await schools.save({
      name: 'Demo School', subdomain: 'demo-school', timezone: 'Africa/Lagos', planType: 'standard',
    });
    const now = new Date();
    const year = await years.save({
      name: `${now.getFullYear()}/${now.getFullYear() + 1}`, schoolId: school.id,
      startDate: new Date(now.getFullYear(), 8, 1), endDate: new Date(now.getFullYear() + 1, 6, 31),
      isCurrent: true,
    });

    // ---- Users ----
    const hash = async (p: string) => bcrypt.hash(p, 10);
    const admin = await users.save({
      email: 'admin@demo-school.edu', passwordHash: await hash('Demo!Pass123'),
      role: UserRole.ADMIN, status: UserStatus.ACTIVE, schoolId: school.id,
      profile: { fullName: 'Ada Administrator' }, emailVerified: true,
    });
    const teacherPassword = await hash('Teacher!123');
    const teachers = [];
    for (const [i, name] of ['Grace Okafor', 'Samuel Bello'].entries()) {
      teachers.push(await users.save({
        email: `teacher${i + 1}@demo-school.edu`, passwordHash: teacherPassword,
        role: UserRole.TEACHER, status: UserStatus.ACTIVE, schoolId: school.id,
        profile: { fullName: name, subject: i === 0 ? 'Mathematics' : 'English' }, emailVerified: true,
      }));
    }
    const studentPassword = await hash('Student!123');
    const studentUsers = [];
    const names = ['Chidi Adebayo', 'Fatima Bala', 'Emeka Nwosu', 'Zainab Musa', 'Tunde Adeyemi'];
    for (const [i, name] of names.entries()) {
      studentUsers.push(await users.save({
        email: `student${i + 1}@demo-school.edu`, passwordHash: studentPassword,
        role: UserRole.STUDENT, status: UserStatus.ACTIVE, schoolId: school.id,
        profile: { fullName: name }, emailVerified: true,
      }));
    }
    const parent = await users.save({
      email: 'parent@demo-school.edu', passwordHash: await hash('Parent!123'),
      role: UserRole.PARENT, status: UserStatus.ACTIVE, schoolId: school.id,
      profile: { fullName: 'Michael Adebayo', child: 'student1@demo-school.edu' }, emailVerified: true,
    });

    // ---- Subjects & classes ----
    const math = await subjects.save({ name: 'Mathematics', code: 'MATH101', schoolId: school.id, credits: 3 });
    const english = await subjects.save({ name: 'English', code: 'ENG101', schoolId: school.id, credits: 2 });
    const classA = await classes.save({
      name: 'Primary 5A', schoolId: school.id, academicYearId: year.id,
      gradeLevel: '5', section: 'A', roomNumber: 'Room 201', classTeacherId: teachers[0].id,
    });
    const classB = await classes.save({
      name: 'Primary 5B', schoolId: school.id, academicYearId: year.id,
      gradeLevel: '5', section: 'B', roomNumber: 'Room 202', classTeacherId: teachers[1].id,
    });

    // ---- Students & enrollments ----
    const studentProfiles = [];
    for (const [i, u] of studentUsers.entries()) {
      studentProfiles.push(await students.save({
        userId: u.id, rollNumber: `STD-00${i + 1}`,
        admissionDate: new Date(now.getFullYear(), 8, 1),
        guardianInfo: { name: `Guardian of ${names[i]}`, phone: `+23480000000${i + 1}` },
      }));
      await enrollments.save({
        studentId: studentProfiles[i].id, classId: i < 3 ? classA.id : classB.id, status: 'active',
      });
    }

    // ---- Two weeks of attendance (weekdays only) ----
    const statuses: AttendanceStatus[] = ['present', 'present', 'present', 'late', 'absent'];
    for (let d = 13; d >= 0; d--) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      if (date.getDay() === 0 || date.getDay() === 6) continue;
      for (const [i, sp] of studentProfiles.entries()) {
        const pick = statuses[Math.floor(rand() * statuses.length + (i % 2)) % statuses.length];
        await attendance.save({
          schoolId: school.id, date, studentId: sp.id,
          classId: i < 3 ? classA.id : classB.id, status: pick,
          recordedById: teachers[i < 3 ? 0 : 1].id,
        });
      }
    }

    // ---- Exam & marks ----
    const midterm = await exams.save({
      name: 'Midterm Examination', schoolId: school.id, academicYearId: year.id,
      type: 'midterm', startDate: new Date(now.getFullYear(), 9, 15), endDate: new Date(now.getFullYear(), 9, 16),
      maxMarks: 100,
    });
    for (const [i, sp] of studentProfiles.entries()) {
      const base = 55 + Math.floor(rand() * 40);
      await marks.save({
        examId: midterm.id, studentId: sp.id, subjectId: math.id,
        marksObtained: Math.min(100, base + 5), grade: base + 5 >= 70 ? 'A' : base + 5 >= 50 ? 'C' : 'F',
        recordedById: teachers[0].id,
      });
      await marks.save({
        examId: midterm.id, studentId: sp.id, subjectId: english.id,
        marksObtained: Math.max(0, base - 5), grade: base - 5 >= 70 ? 'A' : base - 5 >= 50 ? 'C' : 'F',
        recordedById: teachers[1].id,
      });
    }

    // ---- Fees & payments ----
    const tuition = await fees.save({
      name: 'Term 1 Tuition', schoolId: school.id, academicYearId: year.id,
      amount: 150000, frequency: 'quarterly', dueDay: 15,
    });
    for (const [i, sp] of studentProfiles.entries()) {
      const status = i === 4 ? 'pending' : 'completed';
      await payments.save({
        studentId: sp.id, feeStructureId: tuition.id,
        amount: i === 4 ? 0 : 150000,
        method: i % 2 === 0 ? 'bank_transfer' : 'card',
        status, paidAt: status === 'completed' ? new Date(now.getFullYear(), 8, 10 + i) : null,
      });
    }

    // ---- Announcements & messages ----
    await announcements.save([
      { title: 'Welcome to the new term', content: 'School resumes fully this week. All students should collect their timetables from the class teacher.', schoolId: school.id, priority: 'normal', publishedById: admin.id, publishedAt: new Date(now.getFullYear(), 8, 1) },
      { title: 'Midterm examination schedule released', content: 'The midterm timetable is now available. Exams begin in two weeks across all subjects.', schoolId: school.id, priority: 'high', publishedById: admin.id, publishedAt: new Date(now.getFullYear(), 8, 20) },
      { title: 'PTA meeting this Friday', content: 'Parents are invited to the termly PTA meeting in the main hall at 2:00 PM.', schoolId: school.id, priority: 'urgent', publishedById: admin.id, publishedAt: new Date() },
    ]);
    await messages.save([
      { senderId: parent.id, receiverId: teachers[0].id, content: 'Good morning, how is Chidi coping with the new mathematics topics?' },
      { senderId: teachers[0].id, receiverId: parent.id, content: 'Good morning! Chidi is doing well — he scored 82% on the last quiz.' },
    ]);

    console.log('Seed completed.');
    console.log('  admin@demo-school.edu / Demo!Pass123  (ADMIN)');
    console.log('  teacher1@demo-school.edu / Teacher!123 (TEACHER)');
    console.log('  teacher2@demo-school.edu / Teacher!123 (TEACHER)');
    console.log('  student1..5@demo-school.edu / Student!123 (STUDENT)');
    console.log('  parent@demo-school.edu / Parent!123   (PARENT)');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
