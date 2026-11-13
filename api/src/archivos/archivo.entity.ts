import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type CategoriaArchivo = 'DOCUMENTO' | 'FIRMA' | 'EVIDENCIA';

@Entity('archivos')
export class Archivo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'nombre_original' })
  nombreOriginal: string;

  @Column()
  mime: string;

  @Column()
  tamano: number;

  /** Ruta relativa a UPLOAD_DIR. No se expone al cliente. */
  @Column({ select: false })
  ruta: string;

  @Column({ select: false })
  sha256: string;

  @Column({ type: 'varchar' })
  categoria: CategoriaArchivo;

  @Column({ name: 'subido_por', type: 'uuid', nullable: true })
  subidoPor: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
