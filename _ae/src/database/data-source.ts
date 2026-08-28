import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../../../.env') });

/**
 * Standalone DataSource used by the TypeORM CLI:
 *   npm run migration:generate
 *   npm run migration:run
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'schoolsync',
  password: process.env.DB_PASSWORD ?? 'schoolsync',
  database: process.env.DB_DATABASE ?? 'schoolsync',
  entities: [resolve(__dirname, '../**/*.entity.{ts,js}')],
  migrations: [resolve(__dirname, 'migrations/*.{ts,js}')],
  logging: process.env.DB_LOGGING === 'true',
  synchronize: false,
});
