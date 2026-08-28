import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
import { join } from 'path';

@Injectable()
export class TypeOrmConfigService implements TypeOrmOptionsFactory {
  private readonly logger = new Logger(TypeOrmConfigService.name);

  constructor(private readonly config: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    const isTest = this.config.get<string>('NODE_ENV') === 'test';

    const options: TypeOrmModuleOptions = {
      type: 'postgres',
      host: this.config.get<string>('DB_HOST'),
      port: this.config.get<number>('DB_PORT'),
      username: this.config.get<string>('DB_USERNAME'),
      password: this.config.get<string>('DB_PASSWORD'),
      database: this.config.get<string>('DB_DATABASE'),
      entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
      migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
      synchronize: isTest ? true : this.config.get<boolean>('DB_SYNC') ?? false,
      logging: this.config.get<boolean>('DB_LOGGING') ?? false,
      extra: {
        poolSize: this.config.get<number>('DB_POOL_MAX') ?? 20,
      },
    };

    this.logger.log(`TypeORM configured (sync=${options.synchronize})`);
    return options;
  }
}
