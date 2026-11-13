import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { Rol } from '../../roles/entities/rol.entity.js';

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nombre: string;

  @Column()
  email: string;

  /** Nunca se devuelve en consultas normales; hay que pedirlo con addSelect. */
  @Column({ name: 'password_hash', select: false })
  passwordHash: string;

  @Column({ type: 'varchar', nullable: true })
  cedula: string | null;

  @Column({ type: 'varchar', nullable: true })
  cargo: string | null;

  @Column({ type: 'varchar', nullable: true })
  telefono: string | null;

  /** Imagen de la firma (como empleado_firma del POS). Se estampa al firmar documentos. */
  @Column({ name: 'firma_archivo_id', type: 'uuid', nullable: true })
  firmaArchivoId: string | null;

  @Column({ name: 'contratista_id', type: 'uuid', nullable: true })
  contratistaId: string | null;

  @Column({ name: 'requiere_cambio_password' })
  requiereCambioPassword: boolean;

  @Column()
  activo: boolean;

  @Column({ name: 'ultimo_login', type: 'timestamptz', nullable: true })
  ultimoLogin: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'desactivado_en', type: 'timestamptz', nullable: true })
  desactivadoEn: Date | null;

  @ManyToMany(() => Rol)
  @JoinTable({
    name: 'usuario_roles',
    joinColumn: { name: 'usuario_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'rol_id', referencedColumnName: 'id' },
  })
  roles: Relation<Rol[]>;
}
