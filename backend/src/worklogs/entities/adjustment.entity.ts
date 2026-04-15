import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Worklog } from './worklog.entity';

@Entity('adjustment')
export class Adjustment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  external_id: string;

  @Index()
  @Column()
  worklog_id: number;

  @ManyToOne(() => Worklog, (worklog) => worklog.adjustments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'worklog_id' })
  worklog: Worklog;

  /**
   * Positive = bonus, negative = deduction.
   * Using numeric to avoid floating-point rounding in financial calculations.
   */
  @Column('decimal', { precision: 12, scale: 2 })
  amount: number;

  @Column('text')
  reason: string;

  @Column({ type: 'timestamptz' })
  applied_at: Date;

  /**
   * Set to the remittance ID when this adjustment is included in a settlement.
   * NULL means it has not yet been settled — will be picked up in the next run.
   * This is how retroactive adjustments on already-settled worklogs are handled.
   */
  @Index()
  @Column({ nullable: true, type: 'int' })
  settled_in_remittance_id: number | null;
}
