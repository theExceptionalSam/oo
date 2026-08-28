import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema migration. Mirrors the SQL DDL in the architecture document.
 * Run with: npm run migration:run
 */
export class Init1719840000000 implements MigrationInterface {
  name = 'Init1719840000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS schools (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        subdomain VARCHAR(100) UNIQUE NOT NULL,
        timezone VARCHAR(50) DEFAULT 'UTC',
        settings JSONB DEFAULT '{}',
        plan_type VARCHAR(20) DEFAULT 'free',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id UUID REFERENCES schools(id),
        db_schema VARCHAR(100) UNIQUE NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id UUID REFERENCES schools(id),
        email VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255),
        role VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        profile JSONB DEFAULT '{}',
        email_verified BOOLEAN DEFAULT FALSE,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(school_id, email)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS academic_years (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id UUID REFERENCES schools(id),
        name VARCHAR(100) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        is_current BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS classes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id UUID REFERENCES schools(id),
        academic_year_id UUID REFERENCES academic_years(id),
        name VARCHAR(100) NOT NULL,
        grade_level VARCHAR(50),
        section VARCHAR(50),
        room_number VARCHAR(50),
        class_teacher_id UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS subjects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id UUID REFERENCES schools(id),
        name VARCHAR(100) NOT NULL,
        code VARCHAR(50),
        credits INT DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS class_subjects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        class_id UUID REFERENCES classes(id),
        subject_id UUID REFERENCES subjects(id),
        teacher_id UUID REFERENCES users(id),
        schedule JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS students (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        roll_number VARCHAR(100),
        admission_date DATE,
        guardian_info JSONB DEFAULT '{}',
        medical_info JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS enrollments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID REFERENCES students(id),
        class_id UUID REFERENCES classes(id),
        status VARCHAR(20) DEFAULT 'active',
        enrolled_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id UUID REFERENCES schools(id),
        date DATE NOT NULL,
        student_id UUID REFERENCES students(id),
        class_id UUID REFERENCES classes(id),
        status VARCHAR(20) NOT NULL,
        remarks TEXT,
        recorded_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS exams (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id UUID REFERENCES schools(id),
        academic_year_id UUID REFERENCES academic_years(id),
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50),
        start_date DATE,
        end_date DATE,
        max_marks INT DEFAULT 100,
        weightage DECIMAL(5,2) DEFAULT 100.00,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS marks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        exam_id UUID REFERENCES exams(id),
        student_id UUID REFERENCES students(id),
        subject_id UUID REFERENCES subjects(id),
        marks_obtained DECIMAL(6,2),
        grade VARCHAR(10),
        remarks TEXT,
        recorded_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fee_structures (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id UUID REFERENCES schools(id),
        academic_year_id UUID REFERENCES academic_years(id),
        name VARCHAR(255) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        frequency VARCHAR(20),
        due_day INT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fee_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID REFERENCES students(id),
        fee_structure_id UUID REFERENCES fee_structures(id),
        amount DECIMAL(10,2) NOT NULL,
        paid_at TIMESTAMPTZ DEFAULT NOW(),
        method VARCHAR(50),
        transaction_id VARCHAR(255),
        status VARCHAR(20) DEFAULT 'completed',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id UUID REFERENCES schools(id),
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        target_roles JSONB DEFAULT '["all"]',
        priority VARCHAR(20) DEFAULT 'normal',
        published_by UUID REFERENCES users(id),
        published_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sender_id UUID REFERENCES users(id),
        receiver_id UUID REFERENCES users(id),
        content TEXT NOT NULL,
        attachments JSONB DEFAULT '[]',
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        channel VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        payload JSONB DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'queued',
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Performance indexes (mirror those called out in the architecture doc)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_users_school_email ON users(school_id, email)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date, class_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_marks_exam ON marks(exam_id, subject_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_fee_student ON fee_payments(student_id, status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_announcements_school ON announcements(school_id, published_at)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'notifications',
      'messages',
      'announcements',
      'fee_payments',
      'fee_structures',
      'marks',
      'exams',
      'attendance',
      'enrollments',
      'students',
      'class_subjects',
      'subjects',
      'classes',
      'academic_years',
      'users',
      'tenants',
      'schools',
    ];
    for (const t of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
    }
  }
}
