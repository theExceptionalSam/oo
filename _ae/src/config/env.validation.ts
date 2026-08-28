import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsString,
  IsBoolean,
  IsOptional,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

class EnvVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsNumber()
  PORT = 3000;

  @IsString()
  API_PREFIX = 'api/v1';

  @IsString()
  @IsOptional()
  CORS_ORIGINS?: string;

  @IsString()
  DB_HOST = 'localhost';

  @IsNumber()
  DB_PORT = 5432;

  @IsString()
  DB_USERNAME = 'schoolsync';

  @IsString()
  DB_PASSWORD = 'schoolsync';

  @IsString()
  DB_DATABASE = 'schoolsync';

  @IsBoolean()
  DB_SYNC = false;

  @IsBoolean()
  DB_LOGGING = false;

  @IsNumber()
  DB_POOL_MAX = 20;

  @IsString()
  REDIS_HOST = 'localhost';

  @IsNumber()
  REDIS_PORT = 6379;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @IsNumber()
  REDIS_DB = 0;

  @IsString()
  JWT_ACCESS_TTL = '15m';

  @IsString()
  JWT_REFRESH_TTL = '7d';

  @IsString()
  @IsOptional()
  JWT_PRIVATE_KEY_PATH?: string;

  @IsString()
  @IsOptional()
  JWT_PUBLIC_KEY_PATH?: string;

  @IsString()
  JWT_ISSUER = 'schoolsync';

  @IsString()
  JWT_AUDIENCE = 'schoolsync-users';
}

export function validateEnv(config: Record<string, unknown>) {
  // dotenv delivers every value as a string — coerce to the declared types
  // BEFORE validation so numeric/boolean rules see real numbers/booleans.
  const NUMERIC = ['PORT', 'DB_PORT', 'DB_POOL_MAX', 'REDIS_PORT', 'REDIS_DB'] as const;
  const BOOLEAN = ['DB_SYNC', 'DB_LOGGING'] as const;
  const input = { ...config };
  for (const key of NUMERIC) {
    if (input[key] !== undefined && typeof input[key] === 'string' && input[key] !== '') {
      input[key] = Number(input[key]);
    }
  }
  for (const key of BOOLEAN) {
    if (input[key] !== undefined && typeof input[key] === 'string') {
      input[key] = (input[key] as string).toLowerCase() === 'true';
    }
  }

  const parsed = plainToInstance(EnvVariables, input, { enableImplicitConversion: true });
  const errors = validateSync(parsed, { skipMissingProperties: false });
  if (errors.length > 0) {
    // eslint-disable-next-line no-console
    console.warn('[EnvValidation] Issues detected with environment variables:', errors);
  }
  return parsed;
}
