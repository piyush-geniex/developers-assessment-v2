import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RemittanceLineEntity } from './remittance-line.entity';

@Entity('remittance')
@Index(['userId', 'periodStart', 'periodEnd'])
@Index(['createdAt', 'status'])
export class RemittanceEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64, name: 'user_id' })
  userId: string;

  @Column({ type: 'date', name: 'period_start' })
  periodStart: string;

  @Column({ type: 'date', name: 'period_end' })
  periodEnd: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', length: 32 })
  status: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => RemittanceLineEntity, (line) => line.remittance, {
    cascade: true,
  })
  lines: RemittanceLineEntity[];
}
