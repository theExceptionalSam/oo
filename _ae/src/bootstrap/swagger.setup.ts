import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('SchoolSync API')
    .setDescription('Unified school management platform — REST + GraphQL hybrid API')
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', name: 'Authorization' },
      'access-token',
    )
    .addTag('auth', 'Authentication & authorization')
    .addTag('schools', 'School (tenant) management')
    .addTag('users', 'User management')
    .addTag('academic-years', 'Academic year lifecycle')
    .addTag('classes', 'Class & section management')
    .addTag('subjects', 'Subjects & teacher allocation')
    .addTag('students', 'Student records')
    .addTag('enrollments', 'Enrollment workflows')
    .addTag('attendance', 'Attendance & leave')
    .addTag('exams', 'Exam scheduling')
    .addTag('marks', 'Gradebook')
    .addTag('fees', 'Fee structures & invoices')
    .addTag('payments', 'Payment processing')
    .addTag('announcements', 'Broadcasts')
    .addTag('messages', 'Direct messaging')
    .addTag('notifications', 'Realtime notifications')
    .build();

  return SwaggerModule.createDocument(app, config);
}
