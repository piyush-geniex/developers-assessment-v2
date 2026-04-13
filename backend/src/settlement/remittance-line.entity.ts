import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RemittanceEntity } from './remittance.entity';
import { WorklogEntity } from '../worklog/worklog.entity';

@Entity('remittance_line')
@Index(['remittanceId'])
@Index(['worklogId'])
@Index(['worklogId', 'componentKind', 'referenceId'], { unique: true })
export class RemittanceLineEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'remittance_id' })
  remittanceId: number;

  @Column({ name: 'worklog_id' })
  worklogId: number;

  @Column({ type: 'varchar', length: 32, name: 'component_kind' })
  componentKind: string;

  @Column({ type: 'varchar', length: 64, name: 'reference_id' })
  referenceId: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: string;

  @ManyToOne(() => RemittanceEntity, (r) => r.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'remittance_id' })
  remittance: RemittanceEntity;

  @ManyToOne(() => WorklogEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'worklog_id' })
  worklog: WorklogEntity;
}
