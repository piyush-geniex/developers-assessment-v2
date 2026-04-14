import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Worklog } from '../../worklog/models/worklog.entity';
import { Remittance } from '../../settlement/models/remittance.entity';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @OneToMany(() => Worklog, (w) => w.user)
  worklogs!: Worklog[];

  @OneToMany(() => Remittance, (r) => r.user)
  remittances!: Remittance[];
}
