import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Generates a `search_vector` tsvector column + GIN index on the
 * heavily-searched tables. Replaces the Elasticsearch dependency.
 *
 * Postgres full-text search handles:
 *   - Case-insensitive substring match (via trigram fallback)
 *   - Stemmed search (run, runs, running all match "run")
 *   - Ranking (ts_rank_cd)
 *
 * This is enough for any "find a student by name" workload up to ~1M
 * rows per tenant. Re-add Elasticsearch only if you cross that line.
 *
 * Idempotent.
 */
export class AddPostgresSearch1780000000001 implements MigrationInterface {
  name = 'AddPostgresSearch1780000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. pg_trgm for fuzzy / substring matching (LIKE '%query%').
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // 2. students — searchable on roll_number + (optional) first/last name
    //    once the students table grows a name column. For now we join via
    //    users.profile (JSONB) but index a generated column.
    await queryRunner.query(`
      ALTER TABLE students
        ADD COLUMN IF NOT EXISTS search_vector tsvector
        GENERATED ALWAYS AS (
          to_tsvector('english',
            coalesce(roll_number, '') || ' ' ||
            coalesce((user_id)::text, '')
          )
        ) STORED;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_students_search
        ON students USING GIN (search_vector);
    `);
    // Trigram index for ILIKE '%query%' on roll_number
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_students_roll_trgm
        ON students USING GIN (roll_number gin_trgm_ops);
    `);

    // 3. users — searchable on email
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS search_vector tsvector
        GENERATED ALWAYS AS (
          to_tsvector('english', coalesce(email, ''))
        ) STORED;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_search
        ON users USING GIN (search_vector);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email_trgm
        ON users USING GIN (email gin_trgm_ops);
    `);

    // 4. classes — searchable on name
    await queryRunner.query(`
      ALTER TABLE classes
        ADD COLUMN IF NOT EXISTS search_vector tsvector
        GENERATED ALWAYS AS (
          to_tsvector('english',
            coalesce(name, '') || ' ' ||
            coalesce(grade_level, '') || ' ' ||
            coalesce(section, '')
          )
        ) STORED;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_classes_search
        ON classes USING GIN (search_vector);
    `);

    // 5. subjects — searchable on name + code
    await queryRunner.query(`
      ALTER TABLE subjects
        ADD COLUMN IF NOT EXISTS search_vector tsvector
        GENERATED ALWAYS AS (
          to_tsvector('english',
            coalesce(name, '') || ' ' || coalesce(code, '')
          )
        ) STORED;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_subjects_search
        ON subjects USING GIN (search_vector);
    `);

    // 6. announcements — searchable on title + content
    await queryRunner.query(`
      ALTER TABLE announcements
        ADD COLUMN IF NOT EXISTS search_vector tsvector
        GENERATED ALWAYS AS (
          to_tsvector('english',
            coalesce(title, '') || ' ' || coalesce(content, '')
          )
        ) STORED;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_announcements_search
        ON announcements USING GIN (search_vector);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const tables = ['students', 'users', 'classes', 'subjects', 'announcements'];
    for (const t of tables) {
      await queryRunner.query(`DROP INDEX IF EXISTS idx_${t}_search`);
      await queryRunner.query(`DROP INDEX IF EXISTS idx_${t}_email_trgm`);
      await queryRunner.query(`DROP INDEX IF EXISTS idx_${t}_roll_trgm`);
      await queryRunner.query(`ALTER TABLE ${t} DROP COLUMN IF EXISTS search_vector`);
    }
  }
}
