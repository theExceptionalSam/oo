import {
  DeleteDateColumn,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('schools')
export class School {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  subdomain: string;

  @Column({ type: 'varchar', length: 50, default: 'UTC' })
  timezone: string;

  @Column({ type: 'jsonb', default: '{}' })
  settings: Record<string, unknown>;

  // ---- Profile (blueprint 2.1) ----
  @Column({ name: 'school_code', type: 'varchar', length: 20, nullable: true, unique: true })
  schoolCode: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  logo: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  motto: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lga: string | null;

  @Column({ type: 'varchar', length: 100, default: 'Nigeria' })
  country: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website: string | null;

  @Column({ name: 'academic_calendar', type: 'jsonb', nullable: true })
  academicCalendar: {
    termStartDates?: Record<string, string>;
    holidays?: Array<{ name: string; date: string }>;
  } | null;

  @Column({ name: 'school_type', type: 'varchar', length: 50, nullable: true })
  schoolType: string | null; // Nursery | Primary | Secondary | Mixed

  @Column({ name: 'school_levels', type: 'text', nullable: true })
  schoolLevels: string | null; // comma-separated (simple-array)

  @Column({ name: 'primary_contact', type: 'jsonb', nullable: true })
  primaryContact: {
    name: string; phone: string; email: string; role: string;
  } | null;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'plan_type', type: 'varchar', length: 20, default: 'free' })
  planType: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

}
