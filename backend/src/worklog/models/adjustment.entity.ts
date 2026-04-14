import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Worklog } from './worklog.entity';
import { WorkLogSegment } from './work-log-segment.entity';
import { AdjustmentType } from './adjustment-type.enum';

@Entity({ name: 'adjustment' })
export class Adjustment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'worklog_id' })
  worklogId!: number;

  @ManyToOne(() => Worklog, (w) => w.adjustments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'worklog_id' })
  worklog!: Worklog;

  @Column({ type: 'varchar', length: 16 })
  type!: AdjustmentType;

  @Column({ name: 'amount_delta', type: 'numeric', precision: 19, scale: 4 })
  amountDelta!: string;

  @Column({ type: 'varchar', length: 1024 })
  reason!: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt!: Date;

  @Column({ name: 'applies_to_segment_id', nullable: true })
  appliesToSegmentId!: number | null;

  @ManyToOne(() => WorkLogSegment, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'applies_to_segment_id' })
  appliesToSegment!: WorkLogSegment | null;
}
