import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';

import { validateEnv } from './config/env.validation';
import { TypeOrmConfigService } from './config/database.config';
import { RedisModule } from './config/redis.config';

import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { SchoolsModule } from './modules/schools/schools.module';
import { AcademicYearsModule } from './modules/academic-years/academic-years.module';
import { ClassesModule } from './modules/classes/classes.module';
import { SubjectsModule } from './modules/subjects/subjects.module';
import { StudentsModule } from './modules/students/students.module';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { ExamsModule } from './modules/exams/exams.module';
import { MarksModule } from './modules/marks/marks.module';
import { FeesModule } from './modules/fees/fees.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { AnnouncementsModule } from './modules/announcements/announcements.module';
import { MessagesModule } from './modules/messages/messages.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { ImportExportModule } from './modules/import-export/import-export.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TenantContextGuard } from './common/guards/tenant-context.guard';
import { ScopeModule } from './common/scope/scope.module';
import { MailModule } from './shared/mail/mail.module';
import { School } from './modules/schools/entities/school.entity';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { SharedQueueModule } from './shared/queue/shared-queue.module';
import { EventBusModule } from './shared/events/event-bus.module';
import { StorageModule } from './shared/storage/storage.module';
import { SearchModule } from './shared/search/search.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      envFilePath: ['.env', '.env.local'],
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({ useClass: TypeOrmConfigService }),
    TypeOrmModule.forFeature([School]),
    ScopeModule,
    MailModule,
    RedisModule.register(),
    SharedQueueModule.register(),
    EventBusModule,
    StorageModule,
    SearchModule,

    AuthModule,
    HealthModule,
    UsersModule,
    SchoolsModule,
    AcademicYearsModule,
    ClassesModule,
    SubjectsModule,
    StudentsModule,
    EnrollmentsModule,
    AttendanceModule,
    ExamsModule,
    MarksModule,
    FeesModule,
    PaymentsModule,
    AnnouncementsModule,
    MessagesModule,
    NotificationsModule,
  AuditModule,
  ImportExportModule,
  ],
  providers: [
    // Layer 1: JWT validity + revocation. Layer 2: X-School-Subdomain tenant
    // check. Layer 3: per-route roles (@Roles) via RolesGuard on endpoints.
    // Rate limiter runs last so buckets are per-user (falls back to IP).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantContextGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
