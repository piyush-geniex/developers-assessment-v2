import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Remittance } from './remittance.entity';
import { Worklog } from '../../worklog/models/worklog.entity';

@Entity({ name: 'remittance_item' })
@Index('IDX_remittance_item_worklog', ['worklogId'])
export class RemittanceItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'remittance_id' })
  remittanceId!: number;

  @ManyToOne(() => Remittance, (r) => r.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'remittance_id' })
  remittance!: Remittance;

  @Column({ name: 'worklog_id' })
  worklogId!: number;

  @ManyToOne(() => Worklog, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'worklog_id' })
  worklog!: Worklog;

  /** Snapshot: final_amount at settlement time */
  @Column({ name: 'computed_amount', type: 'numeric', precision: 19, scale: 4 })
  computedAmount!: string;

  /** Snapshot: sum of adjustments at settlement time */
  @Column({
    name: 'adjustment_applied_amount',
    type: 'numeric',
    precision: 19,
    scale: 4,
  })
  adjustmentAppliedAmount!: string;

  /** Net paid in this remittance toward the worklog (may be negative if clawback) */
  @Column({ name: 'delta_paid', type: 'numeric', precision: 19, scale: 4 })
  deltaPaid!: string;
}
