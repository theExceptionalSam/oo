import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'db_schema', type: 'varchar', length: 100 })
  dbSchema: string;
}

/**
 * Tenant context held in request scope after auth resolves.
 */
export interface TenantContext {
  schoolId: string;
  subdomain?: string;
  schema?: string;
}
