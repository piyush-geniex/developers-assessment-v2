import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { AdjustmentRecord, SegmentRecord } from './worklog.types';

@Entity('worklog')
@Index(['userId'])
export class WorklogEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64, unique: true, name: 'external_id' })
  externalId: string;

  @Column({ type: 'varchar', length: 64, name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 255, name: 'user_name' })
  userName: string;

  @Column({ type: 'text', name: 'task_name' })
  taskName: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    name: 'hourly_rate',
  })
  hourlyRate: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  segments: SegmentRecord[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  adjustments: AdjustmentRecord[];
}
