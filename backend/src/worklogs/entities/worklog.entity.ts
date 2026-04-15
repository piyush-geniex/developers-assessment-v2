import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
} from 'typeorm';
import { TimeSegment } from './time-segment.entity';
import { Adjustment } from './adjustment.entity';

@Entity('worklog')
export class Worklog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  external_id: string;

  @Column()
  user_id: string;

  @Column()
  user_name: string;

  @Column()
  task_name: string;

  @Column('decimal', { precision: 10, scale: 2 })
  hourly_rate: number;

  @Column({ default: 'UNREMITTED' })
  remittance_status: 'REMITTED' | 'UNREMITTED';

  @OneToMany(() => TimeSegment, (segment) => segment.worklog, { cascade: true })
  segments: TimeSegment[];

  @OneToMany(() => Adjustment, (adjustment) => adjustment.worklog, { cascade: true })
  adjustments: Adjustment[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
