import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('remittance')
export class RemittanceModel {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  user_id!: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amount!: number;

  @Column()
  period_start!: string;

  @Column()
  period_end!: string;

  @Column({ default: 'PENDING' })
  status!: 'PENDING' | 'SUCCESS' | 'FAILED';

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;
}
