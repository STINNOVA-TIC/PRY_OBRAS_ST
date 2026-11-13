import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { Permiso } from '../../roles/entities/permiso.entity.js';

/** Excepción de permiso para un usuario puntual, por encima de lo que dan sus roles. */
@Entity('usuario_permisos')
export class UsuarioPermiso {
  @PrimaryColumn({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @PrimaryColumn({ name: 'permiso_id' })
  permisoId: number;

  @Column({ type: 'varchar' })
  tipo: 'CONCEDER' | 'DENEGAR';

  @Column({ name: 'asignado_en', type: 'timestamptz' })
  asignadoEn: Date;

  @ManyToOne(() => Permiso)
  @JoinColumn({ name: 'permiso_id' })
  permiso: Relation<Permiso>;
}
