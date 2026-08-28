import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScopeService } from './scope.service';
import { Class } from '../../modules/classes/entities/class.entity';
import { ClassSubject } from '../../modules/classes/entities/class-subject.entity';
import { Enrollment } from '../../modules/enrollments/entities/enrollment.entity';
import { Student } from '../../modules/students/entities/student.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Class, ClassSubject, Enrollment, Student])],
  providers: [ScopeService],
  exports: [ScopeService],
})
export class ScopeModule {}
