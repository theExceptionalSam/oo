import {
  DeleteDateColumn,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Student } from '../../students/entities/student.entity';
import { FeeStructure } from '../../fees/entities/fee-structure.entity';

export const PaymentMethod = {
  CASH: 'cash',
  CARD: 'card',
  BANK_TRANSFER: 'bank_transfer',
  ONLINE: 'online',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

@Entity('fee_payments')
@Index('idx_fee_student', ['studentId', 'status'])
export class FeePayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Student)
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId: string;

  @ManyToOne(() => FeeStructure)
  @JoinColumn({ name: 'fee_structure_id' })
  feeStructure: FeeStructure;

  @Column({ name: 'fee_structure_id', type: 'uuid' })
  feeStructureId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  method: PaymentMethod | null;

  @Column({ name: 'transaction_id', type: 'varchar', length: 255, nullable: true })
  transactionId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'completed' })
  status: PaymentStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

}
