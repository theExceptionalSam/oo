import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Blueprint hardening: school profile fields, term scoping, student status
 * workflow + biodata, exam state machine, audit enrichment, and PostgreSQL
 * row-level security scaffolding. Fully idempotent.
 */
export class BlueprintHardening1770000000000 implements MigrationInterface {
  name = 'BlueprintHardening1770000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ---- School profile (Phase 2.1) ----
    const schoolCols: Array<[string, string]> = [
      ['school_code', 'VARCHAR(20)'],
      ['logo', 'VARCHAR(255)'],
      ['motto', 'VARCHAR(255)'],
      ['description', 'TEXT'],
      ['address', 'VARCHAR(255)'],
      ['state', 'VARCHAR(100)'],
      ['lga', 'VARCHAR(100)'],
      ['country', "VARCHAR(100) DEFAULT 'Nigeria'"],
      ['phone', 'VARCHAR(30)'],
      ['website', 'VARCHAR(255)'],
      ['academic_calendar', 'JSONB'],
      ['school_type', 'VARCHAR(50)'],
      ['school_levels', 'TEXT'],
      ['primary_contact', 'JSONB'],
      ['currency', "VARCHAR(3) DEFAULT 'NGN'"],
      ['is_active', 'BOOLEAN DEFAULT TRUE'],
    ];
    for (const [col, type] of schoolCols) {
      await queryRunner.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS ${col} ${type}`);
    }

    // ---- Term scoping (Phase 2.2) — varchar keeps migrations enum-free ----
    for (const t of ['exams', 'attendance', 'marks', 'fee_structures']) {
      await queryRunner.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS term VARCHAR(10)`);
    }

    // ---- Exam state machine (Phase 4.1) ----
    await queryRunner.query(`ALTER TABLE exams ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft'`);
    await queryRunner.query(`ALTER TABLE exams ADD COLUMN IF NOT EXISTS status_history JSONB DEFAULT '[]'`);

    // ---- Student status workflow + biodata (Phase 3) ----
    const studentCols: Array<[string, string]> = [
      ['status', "VARCHAR(20) DEFAULT 'applicant'"],
      ['status_history', `JSONB DEFAULT '[]'`],
      ['date_of_birth', 'DATE'],
      ['gender', 'VARCHAR(20)'],
      ['nationality', 'VARCHAR(100)'],
      ['state_of_origin', 'VARCHAR(100)'],
      ['local_government', 'VARCHAR(100)'],
      ['home_address', 'TEXT'],
      ['religion', 'VARCHAR(50)'],
      ['blood_group', 'VARCHAR(5)'],
      ['genotype', 'VARCHAR(10)'],
      ['height', 'DECIMAL(5,2)'],
      ['weight', 'DECIMAL(5,2)'],
      ['disabilities', 'TEXT'],
      ['languages_spoken', 'TEXT'],
      ['photo_url', 'VARCHAR(255)'],
    ];
    for (const [col, type] of studentCols) {
      await queryRunner.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS ${col} ${type}`);
    }

    // ---- Announcement templates (Phase 5.1) ----
    await queryRunner.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS template_id VARCHAR(50)`);
    await queryRunner.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS template_variables JSONB`);

    // ---- Audit enrichment (Phase 6.1) ----
    await queryRunner.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45)`);
    await queryRunner.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent VARCHAR(255)`);
    await queryRunner.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS result VARCHAR(20) DEFAULT 'success'`);
    await queryRunner.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS notes TEXT`);

    // ---- Row-level security scaffolding (Phase 1.4) ----
    // Policies are created WITHOUT FORCE: the table owner (the app's own
    // role) is exempt, so application queries are unaffected while any
    // separate reporting/BI role gets tenant enforcement for free.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION set_tenant_context(school_id UUID)
      RETURNS VOID AS $$
      BEGIN
        PERFORM set_config('app.current_school_id', school_id::TEXT, true);
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER
    `);
    // Only tables carrying a direct school_id column — students/enrollments/
    // marks/fee_payments/messages reach their tenant via a parent row and are
    // enforced at the application layer.
    const rlsTables = [
      'users', 'classes', 'subjects',
      'attendance', 'exams', 'announcements',
      'academic_years', 'fee_structures',
    ];
    for (const t of rlsTables) {
      await queryRunner.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE tablename = '${t}' AND policyname = '${t}_tenant_isolation'
          ) THEN
            EXECUTE 'CREATE POLICY ${t}_tenant_isolation ON ${t}
              FOR ALL
              USING (school_id = NULLIF(current_setting(''app.current_school_id'', true), '''')::UUID)';
          END IF;
        END;
        $$
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rlsTables = [
      'users', 'classes', 'subjects',
      'attendance', 'exams', 'announcements',
      'academic_years', 'fee_structures',
    ];
    for (const t of rlsTables) {
      await queryRunner.query(`DROP POLICY IF EXISTS ${t}_tenant_isolation ON ${t}`);
      await queryRunner.query(`ALTER TABLE ${t} NO ROW LEVEL SECURITY`);
    }
    await queryRunner.query(`DROP FUNCTION IF EXISTS set_tenant_context(UUID)`);

    const drop = (table: string, cols: string[]) =>
      cols.forEach((c) => queryRunner.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS ${c}`));

    drop('audit_logs', ['ip_address', 'user_agent', 'result', 'notes']);
    drop('announcements', ['template_id', 'template_variables']);
    drop('students', ['status', 'status_history', 'date_of_birth', 'gender', 'nationality', 'state_of_origin',
      'local_government', 'home_address', 'religion', 'blood_group', 'genotype', 'height', 'weight',
      'disabilities', 'languages_spoken', 'photo_url']);
    drop('exams', ['status', 'status_history', 'term']);
    for (const t of ['attendance', 'marks', 'fee_structures']) drop(t, ['term']);
    drop('schools', ['school_code', 'logo', 'motto', 'description', 'address', 'state', 'lga', 'country',
      'phone', 'website', 'academic_calendar', 'school_type', 'school_levels', 'primary_contact',
      'currency', 'is_active']);
  }
}
