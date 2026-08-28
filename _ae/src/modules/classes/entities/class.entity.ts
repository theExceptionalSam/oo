import {
  DeleteDateColumn,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { School } from '../../schools/entities/school.entity';
import { AcademicYear } from '../../academic-years/entities/academic-year.entity';
import { User } from '../../users/entities/user.entity';

@Entity('classes')
export class Class {
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

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'grade_level', type: 'varchar', length: 50, nullable: true })
  gradeLevel: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  section: string | null;

  @Column({ name: 'room_number', type: 'varchar', length: 50, nullable: true })
  roomNumber: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'class_teacher_id' })
  classTeacher: User | null;

  @Column({ name: 'class_teacher_id', type: 'uuid', nullable: true })
  classTeacherId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

}
