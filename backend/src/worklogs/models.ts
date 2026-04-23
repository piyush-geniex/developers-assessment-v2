import { Entity, Column, PrimaryGeneratedColumn,UpdateDateColumn,CreateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';

@Entity('record') // <--- Assure-toi que c'est présent
export class Record {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  type: string;

  @Column({ type: 'jsonb' })
  payload: any;

  @OneToMany(() => Record, (record) => record.parent)
  children: Record[];

  @ManyToOne(() => Record, (record) => record.children)
  @JoinColumn({ name: 'parentId' }) // On dit explicitement à TypeORM d'utiliser cette colonne
  parent: Record;

  @Column({ nullable: true })
   parentId: number; // Optionnel, mais aide pour certaines requêtes directes


// Cette colonne sera remplie automatiquement par TypeORM
  @CreateDateColumn()
  createdAt: Date;

  // Optionnel : utile pour savoir quand une remittance a été modifiée
  @UpdateDateColumn()
  updatedAt: Date;

}