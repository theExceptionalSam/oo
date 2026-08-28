import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Mark } from './entities/mark.entity';
import { Exam } from '../exams/entities/exam.entity';
import { School } from '../schools/entities/school.entity';
import { MarksController } from './marks.controller';
import { MarksService } from './marks.service';

@Module({
  imports: [TypeOrmModule.forFeature([Mark, Exam, School])],
  controllers: [MarksController],
  providers: [MarksService],
  exports: [MarksService],
})
export class MarksModule {}
