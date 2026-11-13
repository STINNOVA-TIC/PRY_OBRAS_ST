import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Permiso } from './permiso.entity.js';

@Entity('modulos')
export class Modulo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  codigo: string;

  @Column()
  nombre: string;

  @Column({ type: 'varchar', nullable: true })
  icono: string | null;

  @Column({ type: 'smallint' })
  orden: number;

  @Column()
  activo: boolean;

  @OneToMany(() => Permiso, (p) => p.modulo)
  permisos: Relation<Permiso[]>;
}
