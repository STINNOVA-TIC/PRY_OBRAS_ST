import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Permiso } from './permiso.entity.js';

@Entity('roles')
export class Rol {
  @PrimaryGeneratedColumn()
  id: number;

  /** Identificador estable usado en el código (SUPERADMIN, RESIDENTE...). No se edita. */
  @Column()
  codigo: string;

  @Column()
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  /** TRUE para roles de usuarios del contratista: exige usuarios.contratista_id. */
  @Column({ name: 'es_externo' })
  esExterno: boolean;

  @Column()
  activo: boolean;

  @ManyToMany(() => Permiso)
  @JoinTable({
    name: 'rol_permisos',
    joinColumn: { name: 'rol_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permiso_id', referencedColumnName: 'id' },
  })
  permisos: Relation<Permiso[]>;
}
