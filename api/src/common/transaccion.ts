import { DataSource, EntityManager } from 'typeorm';

/**
 * Ejecuta `fn` en una transacción y deja registrado quién hace el cambio
 * (SET LOCAL obras.usuario_id), que es lo que lee el trigger fn_auditar()
 * para llenar auditoria_log.usuario_id.
 */
export function enTransaccion<T>(
  db: DataSource,
  actorId: string | undefined,
  fn: (m: EntityManager) => Promise<T>,
): Promise<T> {
  return db.transaction(async (m) => {
    if (actorId) {
      await m.query(`SELECT set_config('obras.usuario_id', $1, true)`, [
        actorId,
      ]);
    }
    return fn(m);
  });
}
