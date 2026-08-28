import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the audit_logs table and deleted_at soft-delete columns to the
 * user-mutable tables. Fully idempotent.
 */
export class AuditAndSoftDeletes1760000000000 implements MigrationInterface {
  name = 'AuditAndSoftDeletes1760000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        user_email VARCHAR(255),
        school_id UUID,
        action VARCHAR(20) NOT NULL,
        method VARCHAR(10) NOT NULL,
        path VARCHAR(255) NOT NULL,
        entity VARCHAR(100),
        entity_id UUID,
        payload JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_audit_school_created ON audit_logs(school_id, created_at)`,
    );

    const tables = [
      'users', 'schools', 'academic_years', 'classes', 'class_subjects', 'subjects', 'students',
      'enrollments', 'attendance', 'exams', 'marks', 'fee_structures',
      'fee_payments', 'announcements', 'messages', 'notifications',
    ];
    for (const t of tables) {
      await queryRunner.query(
        `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS audit_logs CASCADE`);
    const tables = [
      'users', 'schools', 'academic_years', 'classes', 'class_subjects', 'subjects', 'students',
      'enrollments', 'attendance', 'exams', 'marks', 'fee_structures',
      'fee_payments', 'announcements', 'messages', 'notifications',
    ];
    for (const t of tables) {
      await queryRunner.query(`ALTER TABLE ${t} DROP COLUMN IF EXISTS deleted_at`);
    }
  }
}
