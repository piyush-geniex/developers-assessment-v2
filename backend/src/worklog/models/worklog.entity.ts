import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/models/user.entity';
import { WorklogStatus } from './worklog-status.enum';
import { WorkLogSegment } from './work-log-segment.entity';
import { Adjustment } from './adjustment.entity';

@Entity({ name: 'worklog' })
export class Worklog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'user_id' })
  userId!: number;

  @ManyToOne(() => User, (u) => u.worklogs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'task_id', type: 'varchar', length: 128 })
  taskId!: string;

  @Column({ type: 'varchar', length: 16, default: WorklogStatus.ACTIVE })
  status!: WorklogStatus;

  @OneToMany(() => WorkLogSegment, (s) => s.worklog)
  segments!: WorkLogSegment[];

  @OneToMany(() => Adjustment, (a) => a.worklog)
  adjustments!: Adjustment[];
}
