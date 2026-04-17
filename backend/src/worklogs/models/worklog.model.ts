import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('worklog')
export class WorklogModel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  worklog_id!: string;

  @Column()
  user_id!: string;

  @Column()
  user_name!: string;

  @Column()
  task_name!: string;

  @Column('decimal', { precision: 10, scale: 2 })
  hourly_rate!: number;

  @Column({ type: 'jsonb', default: [] })
  segments!: any[];

  @Column({ type: 'jsonb', default: [] })
  adjustments!: any[];

  @Column({ default: 'UNREMITTED' })
  remittance_status!: 'REMITTED' | 'UNREMITTED';

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;
}
