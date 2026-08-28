import {
  DeleteDateColumn,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum StudentStatus {
  APPLICANT = 'applicant',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  WITHDRAWN = 'withdrawn',
  GRADUATED = 'graduated',
  TRANSFERRED = 'transferred',
  INACTIVE = 'inactive',
}

export interface StatusHistoryEntry {
  from: string;
  to: string;
  changedAt: string;
  changedBy: string;
  reason?: string;
}

@Entity('students')
export class Student {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'roll_number', type: 'varchar', length: 100, nullable: true })
  rollNumber: string | null;

  @Column({ name: 'admission_date', type: 'date', nullable: true })
  admissionDate: Date | null;

  @Column({ name: 'guardian_info', type: 'jsonb', default: '{}' })
  guardianInfo: Record<string, unknown>;

  @Column({ name: 'medical_info', type: 'jsonb', default: '{}' })
  medicalInfo: Record<string, unknown>;

  // ---- Status workflow (blueprint 3.1) ----
  @Column({ type: 'varchar', length: 20, default: StudentStatus.APPLICANT })
  status: StudentStatus;

  @Column({ name: 'status_history', type: 'jsonb', default: '[]' })
  statusHistory: StatusHistoryEntry[];

  // ---- Biodata (blueprint 3.2) ----
  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  nationality: string | null;

  @Column({ name: 'state_of_origin', type: 'varchar', length: 100, nullable: true })
  stateOfOrigin: string | null;

  @Column({ name: 'local_government', type: 'varchar', length: 100, nullable: true })
  localGovernment: string | null;

  @Column({ name: 'home_address', type: 'text', nullable: true })
  homeAddress: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  religion: string | null;

  @Column({ name: 'blood_group', type: 'varchar', length: 5, nullable: true })
  bloodGroup: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  genotype: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  height: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  weight: number | null;

  @Column({ type: 'text', nullable: true })
  disabilities: string | null;

  @Column({ name: 'languages_spoken', type: 'text', nullable: true })
  languagesSpoken: string | null; // comma-separated (simple-array)

  @Column({ name: 'photo_url', type: 'varchar', length: 255, nullable: true })
  photoUrl: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  /** Computed age from dateOfBirth — included in every JSON response. */
  get age(): number | null {
    if (!this.dateOfBirth) return null;
    const today = new Date();
    const birth = new Date(this.dateOfBirth);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  toJSON() {
    const obj = { ...this } as Record<string, unknown>;
    obj.age = this.age;
    return obj;
  }
}
