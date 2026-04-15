import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type RemittanceStatus = 'SETTLED' | 'FAILED' | 'CANCELLED';

@Entity('remittance')
@Index(['user_id', 'period_start', 'period_end'], { unique: true })
export class Remittance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: string;

  @Column()
  user_name: string;

  @Column({ type: 'date' })
  period_start: string;

  @Column({ type: 'date' })
  period_end: string;

  @Column('decimal', { precision: 12, scale: 2 })
  amount: number;

  @Column({ default: 'SETTLED' })
  status: RemittanceStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
