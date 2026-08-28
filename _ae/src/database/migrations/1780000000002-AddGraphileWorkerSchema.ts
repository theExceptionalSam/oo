import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `graphile_jobs` schema that Graphile Worker expects.
 *
 * Graphile Worker is a Postgres-backed job queue — drop-in replacement
 * for BullMQ that uses the SAME database your app already uses. No Redis,
 * no second stateful service.
 *
 * Why this is safe for the workload:
 *   - BullMQ's killer feature is throughput (~10k jobs/sec). SchoolsSync
 *     peak is ~10 jobs/sec (notification fan-out + report generation).
 *   - Graphile Worker handles ~1k jobs/sec on a single Postgres instance.
 *   - You get transactional outbox semantics for free: a job enqueued
 *     inside a DB transaction is only visible to workers once the
 *     transaction commits. This eliminates the "job queued but data
 *     not yet written" race.
 *
 * Run the worker as a separate Render Background Worker:
 *   node dist/workers.js
 *
 * Idempotent: graphile_worker ships its own migrations that are safe to
 * re-run. We just install the schema here.
 */
export class AddGraphileWorkerSchema1780000000002 implements MigrationInterface {
  name = 'AddGraphileWorkerSchema1780000000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Install the graphile_worker schema into its own namespace so it
    // doesn't pollute the public schema.
    await queryRunner.query(`
      CREATE SCHEMA IF NOT EXISTS graphile_jobs;
    `);

    // The actual table/function creation is done by `graphile-worker`'s
    // own migration runner on first boot. We just ensure the schema exists.
    // Run the worker once with `--migrate-only` to apply them, or let
    // it auto-migrate on first run.
    await queryRunner.query(`
      COMMENT ON SCHEMA graphile_jobs IS
        'Graphile Worker job queue tables. Managed by graphile-worker; do not edit manually.';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA IF EXISTS graphile_jobs CASCADE;`);
  }
}
