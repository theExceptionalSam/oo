import {
  DeleteDateColumn,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { School } from '../../schools/entities/school.entity';
import { AcademicYear } from '../../academic-years/entities/academic-year.entity';

export const ExamType = {
  MIDTERM: 'midterm',
  FINAL: 'final',
  QUIZ: 'quiz',
  ASSIGNMENT: 'assignment',
} as const;
export type ExamType = (typeof ExamType)[keyof typeof ExamType];

export const Term = { FIRST: 'first', SECOND: 'second', THIRD: 'third' } as const;
export type Term = (typeof Term)[keyof typeof Term];

export enum ExamStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  REVIEWED = 'reviewed',
  APPROVED = 'approved',
  PUBLISHED = 'published',
  LOCKED = 'locked',
}

@Entity('exams')
export class Exam {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => School)
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ name: 'school_id', type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => AcademicYear)
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear;

  @Column({ name: 'academic_year_id', type: 'uuid' })
  academicYearId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  type: ExamType | null;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: Date | null;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: Date | null;

  @Column({ name: 'max_marks', type: 'int', default: 100 })
  maxMarks: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 100.0 })
  weightage: number;

  // ---- Term + state machine (blueprint 2.2 / 4.1) ----
  @Column({ type: 'varchar', length: 10, nullable: true })
  term: Term | null;

  @Column({ type: 'varchar', length: 20, default: ExamStatus.DRAFT })
  status: ExamStatus;

  @Column({ name: 'status_history', type: 'jsonb', default: '[]' })
  statusHistory: Array<{ from: string; to: string; changedBy: string; changedAt: string; notes?: string }>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

}
