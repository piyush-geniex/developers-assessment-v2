import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Worklog } from './worklog.entity';

@Entity({ name: 'work_log_segment' })
export class WorkLogSegment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'worklog_id' })
  worklogId!: number;

  @ManyToOne(() => Worklog, (w) => w.segments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'worklog_id' })
  worklog!: Worklog;

  @Column({ name: 'duration_minutes', type: 'int' })
  durationMinutes!: number;

  /** Hourly rate when amount is not set directly */
  @Column({ type: 'numeric', precision: 19, scale: 4, nullable: true })
  rate!: string | null;

  /** Direct line amount when set (mutually exclusive with rate) */
  @Column({ type: 'numeric', precision: 19, scale: 4, nullable: true })
  amount!: string | null;

  /** Calendar date work was earned (UTC), used for period eligibility */
  @Column({ name: 'earned_at', type: 'date' })
  earnedAt!: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt!: Date;
}
