import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Immutable record of every mutating API request (POST/PATCH/DELETE).
 * Written by the global AuditInterceptor — never updated or deleted
 * through the API.
 */
@Entity('audit_logs')
@Index('idx_audit_school_created', ['schoolId', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'user_email', type: 'varchar', length: 255, nullable: true })
  userEmail: string | null;

  @Column({ name: 'school_id', type: 'uuid', nullable: true })
  schoolId: string | null;

  /** CREATE | UPDATE | DELETE */
  @Column({ type: 'varchar', length: 20 })
  action: string;

  @Column({ type: 'varchar', length: 10 })
  method: string;

  @Column({ type: 'varchar', length: 255 })
  path: string;

  /** Resource entity best-effort derived from the path, e.g. "announcements". */
  @Column({ type: 'varchar', length: 100, nullable: true })
  entity: string | null;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId: string | null;

  /** Request payload (for writes). Never stores password fields. */
  @Column({ type: 'jsonb', default: '{}' })
  payload: Record<string, unknown>;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 20, default: 'success' })
  result: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
