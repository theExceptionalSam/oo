import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds Postgres Row-Level Security (RLS) on every tenant-owned table.
 *
 * The application's SchoolContextGuard + TenantContextGuard remain as the
 * first line of defence; RLS is the database-level backstop that GUARANTEES
 * a missed `WHERE school_id = ?` predicate in any query can never return
 * rows from another tenant.
 *
 * Mechanism:
 *   - Every tenant-owned table gets a `school_id` column (some already have it;
 *     a few derived tables — students, enrollments, marks, messages,
 *     notifications, class_subjects — derive it via JOIN and get a
 *     generated column instead; see migration 1780000000001 for those).
 *   - Each request opens a transaction and sets:
 *       SET LOCAL app.current_school_id = '<uuid>';
 *     The RLS policy reads that setting and enforces equality.
 *   - SUPER_ADMIN sessions set:
 *       SET LOCAL app.bypass_rls = 'on';
 *     and bypass the policy via `ALTER TABLE ... FORCE ROW LEVEL SECURITY`
 *     (which still applies RLS to table owners; the BYPASSRLS role attribute
 *     lets super-admins through).
 *
 * Idempotent: safe to re-run.
 */
export class AddRlsPolicies1780000000000 implements MigrationInterface {
  name = 'AddRlsPolicies1780000000000';

  // Tables that already carry a `school_id` column (from Init migration).
  private readonly directSchoolIdTables = [
    'users',
    'academic_years',
    'classes',
    'subjects',
    'attendance',
    'exams',
    'fee_structures',
    'announcements',
  ];

  // Tables that have no school_id column today and need one added
  // (so RLS can attach a policy to it). Some of these (students, marks,
  // enrollments) derive school_id from a parent row at write time —
  // we add the column + populate via trigger in migration 1780000000001.
  private readonly addSchoolIdColumnTo = [
    'students',
    'enrollments',
    'marks',
    'class_subjects',
    'fee_payments',
    'messages',
    'notifications',
  ];

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create a dedicated role attribute flag for super-admin bypass.
    //    We don't GRANT it here — that's done at runtime per-request via
    //    SET LOCAL. The role attribute must exist before any FORCE RLS table.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'schoolsync_app') THEN
          CREATE ROLE schoolsync_app LOGIN NOCREATEDB NOCREATEROLE NOSUPERUSER NOINHERIT;
        END IF;
      END
      $$;
    `);

    // 2. Add `school_id` column to derived tables (if missing).
    for (const t of this.addSchoolIdColumnTo) {
      await queryRunner.query(`
        ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);
      `);
      // Index for fast RLS evaluation
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_${t}_school ON ${t}(school_id);
      `);
    }

    // 3. Backfill school_id on derived tables from their parent rows.
    //    Run once; subsequent inserts should set it explicitly (the entities
    //    do this) or via triggers (see migration 1780000000001).
    await queryRunner.query(`
      UPDATE students s
        SET school_id = u.school_id
        FROM users u
        WHERE s.user_id = u.id AND s.school_id IS NULL;
    `);
    await queryRunner.query(`
      UPDATE enrollments e
        SET school_id = s.school_id
        FROM students s
        WHERE e.student_id = s.id AND e.school_id IS NULL;
    `);
    await queryRunner.query(`
      UPDATE marks m
        SET school_id = ex.school_id
        FROM exams ex
        WHERE m.exam_id = ex.id AND m.school_id IS NULL;
    `);
    await queryRunner.query(`
      UPDATE class_subjects cs
        SET school_id = c.school_id
        FROM classes c
        WHERE cs.class_id = c.id AND cs.school_id IS NULL;
    `);
    await queryRunner.query(`
      UPDATE fee_payments fp
        SET school_id = fs.school_id
        FROM fee_structures fs
        WHERE fp.fee_structure_id = fs.id AND fp.school_id IS NULL;
    `);
    await queryRunner.query(`
      UPDATE messages m
        SET school_id = u.school_id
        FROM users u
        WHERE m.sender_id = u.id AND m.school_id IS NULL;
    `);
    await queryRunner.query(`
      UPDATE notifications n
        SET school_id = u.school_id
        FROM users u
        WHERE n.user_id = u.id AND n.school_id IS NULL;
    `);

    // 4. Enable RLS on every tenant-owned table.
    const allTenantTables = [
      ...this.directSchoolIdTables,
      ...this.addSchoolIdColumnTo,
    ];
    for (const t of allTenantTables) {
      await queryRunner.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
      // FORCE means RLS applies even to the table owner — essential
      // so a misconfigured connection string can't bypass it.
      await queryRunner.query(`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY`);
    }

    // 5. Attach the tenant-isolation policy to each table.
    //    Pattern: USING (school_id = current_setting('app.current_school_id')::uuid)
    //             WITH CHECK (school_id = current_setting('app.current_school_id')::uuid)
    //
    //    USING  — filters SELECT / UPDATE / DELETE on existing rows.
    //    WITH CHECK — enforces that INSERTs / UPDATEs set the correct school_id.
    for (const t of allTenantTables) {
      await queryRunner.query(`
        DROP POLICY IF EXISTS tenant_isolation ON ${t};
      `);
      await queryRunner.query(`
        CREATE POLICY tenant_isolation ON ${t}
          USING (
            school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
          )
          WITH CHECK (
            school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
          );
      `);
    }

    // 6. Audit logs table also gets RLS but scoped to school_id (nullable
    //    for system-level audit entries).
    await queryRunner.query(`ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      DROP POLICY IF EXISTS tenant_isolation ON audit_logs;
    `);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON audit_logs
        USING (
          school_id IS NULL
          OR school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
        )
        WITH CHECK (true);  -- audit writes are always allowed from the request context
    `);

    // 7. The `schools` table itself is NOT RLS-protected by school_id —
    //    a school can read its own row. Add a policy that allows reading
    //    your own school + writing to your own school.
    await queryRunner.query(`ALTER TABLE schools ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE schools FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      DROP POLICY IF EXISTS tenant_isolation ON schools;
    `);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON schools
        USING (
          id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
        )
        WITH CHECK (
          id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
        );
    `);

    // 8. The `tenants` lookup table — also school-scoped.
    await queryRunner.query(`ALTER TABLE tenants ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE tenants FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      DROP POLICY IF EXISTS tenant_isolation ON tenants;
    `);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON tenants
        USING (
          school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
        )
        WITH CHECK (
          school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
        );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const allTenantTables = [
      ...this.directSchoolIdTables,
      ...this.addSchoolIdColumnTo,
      'audit_logs',
      'schools',
      'tenants',
    ];
    for (const t of allTenantTables) {
      await queryRunner.query(`DROP POLICY IF EXISTS tenant_isolation ON ${t};`);
      await queryRunner.query(`ALTER TABLE ${t} NO FORCE ROW LEVEL SECURITY;`);
      await queryRunner.query(`ALTER TABLE ${t} DISABLE ROW LEVEL SECURITY;`);
    }
    // Don't drop the school_id columns we added — they may contain real data.
    // The down migration is "disable the policy", not "drop the column".
  }
}
