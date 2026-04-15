import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Worklog } from './worklog.entity';

export type SegmentStatus = 'approved' | 'disputed' | 'cancelled';

@Entity('time_segment')
export class TimeSegment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  external_id: string;

  @Index()
  @Column()
  worklog_id: number;

  @ManyToOne(() => Worklog, (worklog) => worklog.segments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'worklog_id' })
  worklog: Worklog;

  @Column({ type: 'timestamptz' })
  started_at: Date;

  @Column({ type: 'timestamptz' })
  ended_at: Date;

  @Column()
  status: SegmentStatus;

  @Column({ nullable: true, type: 'text' })
  dispute_reason: string | null;
}
