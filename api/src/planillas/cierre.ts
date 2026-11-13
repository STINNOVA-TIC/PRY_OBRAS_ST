import { DataSource, EntityManager } from 'typeorm';

/** Estados en los que una planilla ya «cerró» su período: los avances que cubre no se tocan. */
export const ESTADOS_CIERRAN = ['PRESENTADA', 'APROBADA', 'PAGADA'];

/**
 * Planilla presentada/aprobada/pagada que ya cubre un avance de esa fecha.
 * La del cliente cubre todos los avances; la de un contratista, solo los suyos.
 */
export async function planillaQueCubre(
  db: DataSource | EntityManager,
  obraId: string,
  obraContratistaId: string | null,
  fecha: string,
): Promise<{ numero: number; tipo: string; hasta: string; contratista: string | null } | null> {
  const [p] = await db.query(
    `SELECT p.numero, p.tipo, to_char(p.periodo_hasta, 'YYYY-MM-DD') AS hasta, c.razon_social AS contratista
       FROM planillas p
       LEFT JOIN obra_contratistas oc ON oc.id = p.obra_contratista_id
       LEFT JOIN contratistas c ON c.id = oc.contratista_id
      WHERE p.obra_id = $1 AND p.estado = ANY($4) AND $3::date <= p.periodo_hasta
        AND (p.tipo = 'CLIENTE' OR p.obra_contratista_id = $2)
      ORDER BY p.tipo, p.numero DESC LIMIT 1`,
    [obraId, obraContratistaId, fecha, ESTADOS_CIERRAN],
  );
  return p ?? null;
}

export function textoCierre(p: { numero: number; tipo: string; hasta: string; contratista: string | null }) {
  const cual = p.tipo === 'CLIENTE' ? `la planilla N.º ${p.numero} al cliente` : `la planilla N.º ${p.numero} de ${p.contratista}`;
  return `El período hasta el ${p.hasta} ya está en ${cual}`;
}
