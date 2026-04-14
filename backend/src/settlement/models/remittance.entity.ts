import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../user/models/user.entity';
import { RemittanceStatus } from './remittance-status.enum';
import { RemittanceItem } from './remittance-item.entity';

@Entity({ name: 'remittance' })
@Unique('UQ_remittance_user_period', ['userId', 'periodStart', 'periodEnd'])
@Index('IDX_remittance_user', ['userId'])
export class Remittance {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'user_id' })
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'period_start', type: 'date' })
  periodStart!: string;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd!: string;

  @Column({ name: 'total_amount', type: 'numeric', precision: 19, scale: 4 })
  totalAmount!: string;

  @Column({ type: 'varchar', length: 16 })
  status!: RemittanceStatus;

  @Column({ name: 'error_message', type: 'varchar', length: 2048, nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt!: Date;

  @OneToMany(() => RemittanceItem, (i) => i.remittance)
  items!: RemittanceItem[];
}
