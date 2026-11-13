import { DataSource, EntityManager } from 'typeorm';
import { UsuarioSesion } from './decorators.js';

interface FilaSesion {
  id: string;
  nombre: string;
  email: string;
  cargo: string | null;
  firma_archivo_id: string | null;
  contratista_id: string | null;
  requiere_cambio_password: boolean;
  roles: string[];
  permisos: string[];
}

/**
 * Carga un usuario ACTIVO con sus roles activos y sus permisos efectivos
 * (roles + CONCEDER − DENEGAR, calculado por vw_permisos_efectivos).
 * Devuelve null si el usuario no existe o está desactivado.
 */
export async function cargarSesion(
  db: DataSource | EntityManager,
  usuarioId: string,
): Promise<UsuarioSesion | null> {
  const filas: FilaSesion[] = await db.query(
    `SELECT u.id, u.nombre, u.email, u.cargo, u.firma_archivo_id, u.contratista_id, u.requiere_cambio_password,
            COALESCE((SELECT array_agg(r.codigo ORDER BY r.codigo)
                        FROM usuario_roles ur
                        JOIN roles r ON r.id = ur.rol_id AND r.activo
                       WHERE ur.usuario_id = u.id), '{}') AS roles,
            COALESCE((SELECT array_agg(DISTINCT v.codigo ORDER BY v.codigo)
                        FROM vw_permisos_efectivos v
                       WHERE v.usuario_id = u.id), '{}') AS permisos
       FROM usuarios u
      WHERE u.id = $1 AND u.activo`,
    [usuarioId],
  );
  const f = filas[0];
  if (!f) return null;
  return {
    id: f.id,
    nombre: f.nombre,
    email: f.email,
    cargo: f.cargo,
    tieneFirma: !!f.firma_archivo_id,
    contratistaId: f.contratista_id,
    requiereCambioPassword: f.requiere_cambio_password,
    roles: f.roles,
    permisos: f.permisos,
  };
}
