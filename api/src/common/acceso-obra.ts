import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ROL_SUPERADMIN, UsuarioSesion } from './decorators.js';

export type FuncionObra =
  | 'ADMINISTRADOR'
  | 'SUPERINTENDENTE'
  | 'RESIDENTE'
  | 'BODEGUERO'
  | 'VISUALIZADOR';

/** ¿Ve todas las obras sin ser miembro? (propietario o permiso obras.ver_todas) */
export const veTodas = (u: UsuarioSesion) =>
  u.roles.includes(ROL_SUPERADMIN) || u.permisos.includes('obras.ver_todas');

/**
 * Verifica que el usuario pueda acceder a la obra (miembro o ve todas).
 * Devuelve su función en la obra (null si accede por ver todas sin ser miembro).
 * Responde 404 en vez de 403 para no revelar que la obra existe.
 */
export async function asegurarAccesoObra(
  db: DataSource | EntityManager,
  u: UsuarioSesion,
  obraId: string,
): Promise<{ funcion: FuncionObra | null; estado: string }> {
  const filas: { estado: string; funcion: FuncionObra | null }[] =
    await db.query(
      `SELECT o.estado, m.funcion
       FROM obras o
       LEFT JOIN obra_miembros m ON m.obra_id = o.id AND m.usuario_id = $2
      WHERE o.id = $1 AND o.eliminado_en IS NULL`,
      [obraId, u.id],
    );
  const f = filas[0];
  if (!f || (!f.funcion && !veTodas(u)))
    throw new NotFoundException('Obra no encontrada');
  return f;
}

/** La obra debe estar en alguno de estos estados para la acción. */
export function exigirEstado(
  estado: string,
  permitidos: string[],
  accion: string,
) {
  if (!permitidos.includes(estado)) {
    throw new ForbiddenException(
      `No se puede ${accion}: la obra está en estado ${estado}`,
    );
  }
}
