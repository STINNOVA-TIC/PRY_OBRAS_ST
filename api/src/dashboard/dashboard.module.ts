import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { veTodas } from '../common/acceso-obra.js';
import { CurrentUser, Permisos, ROL_SUPERADMIN, type UsuarioSesion } from '../common/decorators.js';

const HOY = `(now() AT TIME ZONE 'America/Guayaquil')::date`;
/** Obras que el usuario puede ver (todas o donde es miembro). $1 = ve todas, $2 = usuario. */
const VISIBLES = `SELECT o.id FROM obras o WHERE o.eliminado_en IS NULL
  AND ($1 OR EXISTS (SELECT 1 FROM obra_miembros m WHERE m.obra_id = o.id AND m.usuario_id = $2))`;

const tiene = (u: UsuarioSesion, p: string) => u.roles.includes(ROL_SUPERADMIN) || u.permisos.includes(p);

/** Datos del tablero de inicio: indicadores, tendencias y alertas de las obras visibles para el usuario. */
@Injectable()
export class DashboardService {
  constructor(private readonly db: DataSource) {}

  private async facturacion(p: unknown[]) {
    const mensual: { mes: string; facturado: number; cobrado: number }[] = await this.db.query(
      `WITH meses AS (
         SELECT to_char(m, 'YYYY-MM') AS mes FROM generate_series(date_trunc('month', ${HOY}) - interval '11 months', date_trunc('month', ${HOY}), interval '1 month') m),
       f AS (
         SELECT to_char(pp.periodo_hasta, 'YYYY-MM') AS mes, SUM(t.total) AS v
           FROM planillas pp JOIN vw_planilla_totales t ON t.planilla_id = pp.id
          WHERE pp.tipo = 'CLIENTE' AND pp.estado IN ('APROBADA','PAGADA') AND pp.obra_id IN (${VISIBLES})
          GROUP BY 1),
       c AS (
         SELECT to_char(pp.pagada_fecha, 'YYYY-MM') AS mes, SUM(t.total) AS v
           FROM planillas pp JOIN vw_planilla_totales t ON t.planilla_id = pp.id
          WHERE pp.tipo = 'CLIENTE' AND pp.estado = 'PAGADA' AND pp.pagada_fecha IS NOT NULL AND pp.obra_id IN (${VISIBLES})
          GROUP BY 1)
       SELECT meses.mes, COALESCE(f.v, 0)::float AS facturado, COALESCE(c.v, 0)::float AS cobrado
         FROM meses LEFT JOIN f ON f.mes = meses.mes LEFT JOIN c ON c.mes = meses.mes ORDER BY meses.mes`,
      p,
    );
    const porObra: { id: string; nombre: string; facturado: number; cobrado: number }[] = await this.db.query(
      `SELECT o.id, o.nombre,
              SUM(t.total)::float AS facturado,
              COALESCE(SUM(t.total) FILTER (WHERE pp.estado = 'PAGADA'), 0)::float AS cobrado
         FROM planillas pp JOIN vw_planilla_totales t ON t.planilla_id = pp.id JOIN obras o ON o.id = pp.obra_id
        WHERE pp.tipo = 'CLIENTE' AND pp.estado IN ('APROBADA','PAGADA') AND pp.obra_id IN (${VISIBLES})
        GROUP BY o.id ORDER BY 3 DESC LIMIT 6`,
      p,
    );
    const [tot] = await this.db.query(
      `SELECT COALESCE(SUM(t.total), 0)::float AS facturado,
              COALESCE(SUM(t.total) FILTER (WHERE pp.estado = 'PAGADA'), 0)::float AS cobrado
         FROM planillas pp JOIN vw_planilla_totales t ON t.planilla_id = pp.id
        WHERE pp.tipo = 'CLIENTE' AND pp.estado IN ('APROBADA','PAGADA') AND pp.obra_id IN (${VISIBLES})`,
      p,
    );
    return { mensual, porObra, totales: { facturado: tot.facturado, cobrado: tot.cobrado, pendiente: tot.facturado - tot.cobrado } };
  }

  async datos(u: UsuarioSesion) {
    const p = [veTodas(u), u.id];
    const verPlanillas = tiene(u, 'planillas.ver');
    const verBodega = tiene(u, 'bodega.ver');

    const estados: { estado: string; n: number }[] = await this.db.query(
      `SELECT o.estado, COUNT(*)::int AS n FROM obras o WHERE o.id IN (${VISIBLES}) GROUP BY 1`,
      p,
    );

    const [kpi] = await this.db.query(
      `WITH r AS (
         SELECT r.obra_id, r.cantidad * r.precio_unitario AS contrato,
                COALESCE((SELECT SUM(a.cantidad) FROM avances a WHERE a.obra_rubro_id = r.id AND a.anulado_en IS NULL), 0) * r.precio_unitario AS ejecutado
           FROM obra_rubros r JOIN obras o ON o.id = r.obra_id
          WHERE o.estado = 'ACTIVA' AND o.id IN (${VISIBLES}))
       SELECT COALESCE(SUM(contrato), 0)::float AS contratado, COALESCE(SUM(ejecutado), 0)::float AS ejecutado FROM r`,
      p,
    );
    const [mes] = await this.db.query(
      `SELECT COALESCE(SUM(a.cantidad * r.precio_unitario) FILTER (WHERE a.fecha >= date_trunc('month', ${HOY})), 0)::float AS actual,
              -- mismo tramo del mes anterior (del 1 al mismo día), para comparar parejo
              COALESCE(SUM(a.cantidad * r.precio_unitario) FILTER (
                WHERE a.fecha < date_trunc('month', ${HOY}) AND a.fecha <= (${HOY} - interval '1 month')::date), 0)::float AS anterior
         FROM avances a JOIN obra_rubros r ON r.id = a.obra_rubro_id
        WHERE a.anulado_en IS NULL AND a.obra_id IN (${VISIBLES}) AND a.fecha >= date_trunc('month', ${HOY}) - interval '1 month'`,
      p,
    );

    // Tendencia: ejecutado (avances a precio de contrato) y planillado al cliente, por mes, últimos 12 meses
    const mensual: { mes: string; ejecutado: number; planillado: number }[] = await this.db.query(
      `WITH meses AS (
         SELECT to_char(m, 'YYYY-MM') AS mes FROM generate_series(date_trunc('month', ${HOY}) - interval '11 months', date_trunc('month', ${HOY}), interval '1 month') m),
       e AS (
         SELECT to_char(a.fecha, 'YYYY-MM') AS mes, SUM(a.cantidad * r.precio_unitario) AS v
           FROM avances a JOIN obra_rubros r ON r.id = a.obra_rubro_id
          WHERE a.anulado_en IS NULL AND a.obra_id IN (${VISIBLES}) AND a.fecha >= date_trunc('month', ${HOY}) - interval '11 months'
          GROUP BY 1),
       pl AS (
         SELECT to_char(pp.periodo_hasta, 'YYYY-MM') AS mes, SUM(t.base) AS v
           FROM planillas pp JOIN vw_planilla_totales t ON t.planilla_id = pp.id
          WHERE $3 AND pp.tipo = 'CLIENTE' AND pp.estado IN ('PRESENTADA','APROBADA','PAGADA') AND pp.obra_id IN (${VISIBLES})
            AND pp.periodo_hasta >= date_trunc('month', ${HOY}) - interval '11 months'
          GROUP BY 1)
       SELECT meses.mes, COALESCE(e.v, 0)::float AS ejecutado, COALESCE(pl.v, 0)::float AS planillado
         FROM meses LEFT JOIN e ON e.mes = meses.mes LEFT JOIN pl ON pl.mes = meses.mes ORDER BY meses.mes`,
      [...p, verPlanillas],
    );

    // Avance económico vs. tiempo transcurrido de cada obra en ejecución
    const avance: { id: string; nombre: string; contratado: number; ejecutado: number; pct: number; pctTiempo: number | null }[] = await this.db.query(
      `SELECT o.id, o.nombre, x.contratado, x.ejecutado,
              CASE WHEN x.contratado > 0 THEN x.ejecutado / x.contratado ELSE 0 END AS pct,
              CASE WHEN o.fecha_inicio IS NOT NULL AND o.fecha_fin IS NOT NULL AND o.fecha_fin > o.fecha_inicio
                   THEN LEAST(GREATEST((${HOY} - o.fecha_inicio)::float / (o.fecha_fin - o.fecha_inicio), 0), 1) END AS "pctTiempo"
         FROM obras o
         JOIN LATERAL (
           SELECT COALESCE(SUM(r.cantidad * r.precio_unitario), 0)::float AS contratado,
                  COALESCE(SUM(r.precio_unitario * (SELECT COALESCE(SUM(a.cantidad), 0) FROM avances a WHERE a.obra_rubro_id = r.id AND a.anulado_en IS NULL)), 0)::float AS ejecutado
             FROM obra_rubros r WHERE r.obra_id = o.id) x ON TRUE
        WHERE o.estado = 'ACTIVA' AND o.id IN (${VISIBLES}) AND x.contratado > 0
        ORDER BY x.contratado DESC LIMIT 8`,
      p,
    );

    // Embudo de cobro (planillas al cliente)
    const cobro = verPlanillas
      ? await this.db.query(
          `SELECT CASE WHEN pp.estado IN ('BORRADOR','OBSERVADA') THEN 'ELABORACION' ELSE pp.estado END AS etapa,
                  COUNT(*)::int AS n, COALESCE(SUM(t.total), 0)::float AS total
             FROM planillas pp JOIN vw_planilla_totales t ON t.planilla_id = pp.id
            WHERE pp.tipo = 'CLIENTE' AND pp.estado <> 'ANULADA' AND pp.obra_id IN (${VISIBLES})
            GROUP BY 1`,
          p,
        )
      : null;

    // Facturado (planillas al cliente aprobadas o pagadas, total con IVA) por mes del período, y cobrado por mes de pago
    const facturacion = verPlanillas ? await this.facturacion(p) : null;

    // Consumo de materiales del mes, valorizado al costo del catálogo
    const consumo = verBodega
      ? await this.db.query(
          `SELECT m.id, m.nombre, m.unidad, -SUM(mi.cantidad)::float AS cantidad, (-SUM(mi.cantidad) * m.costo_unitario)::float AS valor
             FROM movimientos_inventario mi JOIN bodegas b ON b.id = mi.bodega_id JOIN materiales m ON m.id = mi.material_id
            WHERE mi.tipo = 'CONSUMO' AND b.obra_id IN (${VISIBLES}) AND mi.fecha >= date_trunc('month', ${HOY})
            GROUP BY m.id HAVING -SUM(mi.cantidad) > 0 ORDER BY 5 DESC, 4 DESC LIMIT 6`,
          p,
        )
      : null;

    const [docs] = await this.db.query(
      `SELECT COUNT(*) FILTER (WHERE d.vence < ${HOY})::int AS vencidos,
              COUNT(*) FILTER (WHERE d.vence BETWEEN ${HOY} AND ${HOY} + 15)::int AS "porVencer"
         FROM contratista_documentos d JOIN obra_contratistas oc ON oc.id = d.obra_contratista_id
        WHERE d.vigente AND d.estado = 'APROBADO' AND d.vence IS NOT NULL AND oc.activo AND oc.obra_id IN (${VISIBLES})`,
      p,
    );

    return {
      estados,
      kpis: {
        contratado: kpi.contratado,
        ejecutado: kpi.ejecutado,
        pct: kpi.contratado > 0 ? kpi.ejecutado / kpi.contratado : 0,
        ejecutadoMes: mes.actual,
        ejecutadoMesAnterior: mes.anterior,
        porCobrar: cobro?.find((x: { etapa: string }) => x.etapa === 'APROBADA')?.total ?? null,
        cobrado: cobro?.find((x: { etapa: string }) => x.etapa === 'PAGADA')?.total ?? null,
      },
      mensual,
      avance,
      atrasadas: avance.filter((o) => o.pctTiempo != null && o.pctTiempo - o.pct > 0.1).length,
      cobro,
      facturacion,
      consumo,
      documentos: docs,
      ver: { planillas: verPlanillas, bodega: verBodega },
    };
  }
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly s: DashboardService) {}

  @Get()
  @Permisos('obras.ver')
  datos(@CurrentUser() u: UsuarioSesion) {
    return this.s.datos(u);
  }
}

@Module({ controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
