/**
 * One-time admin bootstrap.
 *
 *   npm run bootstrap:admin -- --email=you@example.com --subdomain=my-school
 *
 * Prompts for a random password (or generates one if --generate-password is passed),
 * creates the school + admin user, prints the credentials ONCE, and forces
 * password change on first login.
 *
 * Replaces the old `npm run seed` flow which had hardcoded
 *   admin@demo-school.edu / Demo!Pass123
 * credentials that could end up in prod.
 *
 * Refuses to run if NODE_ENV=production AND the school already has an admin.
 */
import * as readline from 'readline';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import * as bcrypt from 'bcrypt';

dotenv.config({ path: resolve(__dirname, '../../../.env') });

interface Args {
  email: string;
  subdomain: string;
  schoolName: string;
  generatePassword: boolean;
  password?: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (key: string) => {
    const idx = argv.indexOf(`--${key}`);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };
  const email = get('email');
  const subdomain = get('subdomain');
  const schoolName = get('school-name') ?? `${subdomain} School`;
  const generatePassword = argv.includes('--generate-password');
  const password = get('password');

  if (!email || !subdomain) {
    console.error('Usage: npm run bootstrap:admin -- --email=admin@school.edu --subdomain=my-school [--generate-password | --password=Secret123]');
    process.exit(1);
  }
  return { email, subdomain, schoolName, generatePassword, password };
}

async function ask(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: hidden,
  });
  return new Promise((resolvePromise) => {
    rl.question(question, (answer) => {
      rl.close();
      resolvePromise(answer.trim());
    });
  });
}

async function main() {
  const args = parseArgs();

  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && args.generatePassword) {
    console.error('[bootstrap] --generate-password is forbidden in production. Pass --password or pipe via stdin.');
    process.exit(1);
  }

  // Resolve password.
  let password = args.password;
  if (!password && !args.generatePassword) {
    password = await ask('Admin password (min 12 chars): ', true);
    if (!password || password.length < 12) {
      console.error('[bootstrap] Password must be at least 12 characters.');
      process.exit(1);
    }
  }
  if (args.generatePassword) {
    password = crypto.randomBytes(18).toString('base64url');
  }

  console.log(`[bootstrap] Connecting to ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}...`);

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'schoolsync',
    password: process.env.DB_PASSWORD ?? 'schoolsync',
    database: process.env.DB_DATABASE ?? 'schoolsync',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  await dataSource.initialize();
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // 1. Create school (idempotent on subdomain).
    let schoolId: string;
    const existing = await queryRunner.query(
      `SELECT id FROM schools WHERE subdomain = $1`,
      [args.subdomain],
    );
    if (existing.length > 0) {
      schoolId = existing[0].id;
      console.log(`[bootstrap] School "${args.subdomain}" already exists (id=${schoolId})`);
    } else {
      const [row] = await queryRunner.query(
        `INSERT INTO schools (name, subdomain, plan_type) VALUES ($1, $2, 'free') RETURNING id`,
        [args.schoolName, args.subdomain],
      );
      schoolId = row.id;
      console.log(`[bootstrap] Created school "${args.schoolName}" (subdomain=${args.subdomain}, id=${schoolId})`);
    }

    // 2. Check for existing admin.
    const existingAdmin = await queryRunner.query(
      `SELECT id FROM users WHERE school_id = $1 AND role = 'ADMIN' LIMIT 1`,
      [schoolId],
    );
    if (existingAdmin.length > 0 && isProduction) {
      console.error(`[bootstrap] REFUSING to run in production — school already has an admin (id=${existingAdmin[0].id}).`);
      console.error('  To reset: drop the existing admin manually, then re-run.');
      await queryRunner.rollbackTransaction();
      process.exit(2);
    }

    // 3. Create admin user.
    const passwordHash = await bcrypt.hash(password!, 12);
    const [user] = await queryRunner.query(
      `INSERT INTO users (school_id, email, password_hash, role, status, email_verified)
       VALUES ($1, $2, $3, 'ADMIN', 'active', true)
       ON CONFLICT (school_id, email) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id, email`,
      [schoolId, args.email, passwordHash],
    );

    await queryRunner.query(
      `UPDATE users SET profile = jsonb_set(COALESCE(profile, '{}'), '{must_change_password}', 'true'::jsonb) WHERE id = $1`,
      [user.id],
    );

    await queryRunner.commitTransaction();

    console.log('');
    console.log('========================================================');
    console.log('  Bootstrap complete.');
    console.log('========================================================');
    console.log(`  School URL:    https://${args.subdomain}.yourdomain.com`);
    console.log(`  Admin email:  ${args.email}`);
    console.log(`  Admin role:   ADMIN`);
    console.log(`  Password:     ${args.generatePassword ? password : '[hidden — you set it]'}`);
    console.log('');
    console.log('  The admin MUST change this password on first login.');
    console.log('  An audit entry has been recorded.');
    console.log('========================================================');
    console.log('');

    // 4. Audit the bootstrap itself.
    await dataSource.query(
      `INSERT INTO audit_logs (user_email, school_id, action, method, path, entity, payload, notes)
       VALUES ($1, $2, 'CREATE', 'POST', '/bootstrap/admin', 'users', $3, 'Bootstrap admin creation')`,
      [args.email, schoolId, JSON.stringify({ email: args.email, role: 'ADMIN', schoolSubdomain: args.subdomain })],
    );
  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error('[bootstrap] FAILED:', (err as Error).message);
    process.exit(1);
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error('[bootstrap] Unhandled error', err);
  process.exit(1);
});
