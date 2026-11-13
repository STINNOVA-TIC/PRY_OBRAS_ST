import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Modulo } from './modulo.entity.js';

@Entity('permisos')
export class Permiso {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'modulo_id' })
  moduloId: number;

  @ManyToOne(() => Modulo, (m) => m.permisos)
  @JoinColumn({ name: 'modulo_id' })
  modulo: Relation<Modulo>;

  /** Ej: 'usuarios.crear'. Es lo que se usa en @Permisos(...). */
  @Column()
  codigo: string;

  @Column()
  accion: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @Column()
  activo: boolean;
}
