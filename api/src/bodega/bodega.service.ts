import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { asegurarAccesoObra, veTodas } from '../common/acceso-obra.js';
import { BitacoraService } from '../common/bitacora.service.js';
import { ROL_SUPERADMIN, type UsuarioSesion } from '../common/decorators.js';
import { enTransaccion } from '../common/transaccion.js';
import type { FilaMaterialExcel } from '../common/excel.js';
import type { ImportarIngresoDto, ListarMovimientosDto, MovimientoDto, RevertirDto } from './bodega.dto.js';

const HOY = `(now() AT TIME ZONE 'America/Guayaquil')::date`;

export interface BodegaInfo {
  id: number;
  codigo: string;
  nombre: string;
  tipo: 'CENTRAL' | 'OBRA';
  obraId: string | null;
  obraNombre: string | null;
  obraEstado: string | null;
}

export const TIPO_TXT: Record<string, string> = {
  INGRESO: 'Ingreso',
  CONSUMO: 'Consumo en obra',
  DEVOLUCION: 'Salida / devolución',
  AJUSTE: 'Ajuste',
  TRANSFERENCIA_SALIDA: 'Transferencia enviada',
  TRANSFERENCIA_ENTRADA: 'Transferencia recibida',
};

const tiene = (u: UsuarioSesion, p: string) => u.roles.includes(ROL_SUPERADMIN) || u.permisos.includes(p);

/** ¿Opera la bodega central? (propietario, quien ve todas las obras o tiene bodega.central) */
export const operaCentral = (u: UsuarioSesion) => veTodas(u) || tiene(u, 'bodega.central');

/** Datos de la bodega sin verificar acceso. */
export async function infoBodega(db: DataSource | EntityManager, bodegaId: number): Promise<BodegaInfo> {
  const [b]: BodegaInfo[] = await db.query(
    `SELECT b.id, b.codigo, CASE WHEN b.tipo = 'OBRA' THEN 'Bodega ' || o.nombre ELSE b.nombre END AS nombre,
            b.tipo, b.obra_id AS "obraId", o.nombre AS "obraNombre", o.estado AS "obraEstado"
       FROM bodegas b LEFT JOIN obras o ON o.id = b.obra_id
      WHERE b.id = $1 AND b.activo AND (o.id IS NULL OR o.eliminado_en IS NULL)`,
    [bodegaId],
  );
  if (!b) throw new NotFoundException('Bodega no encontrada');
  return b;
}

/** Datos de la bodega y verificación de acceso: la central, quien la opera; la de obra, el equipo de la obra. */
export async function asegurarAccesoBodega(
  db: DataSource | EntityManager,
  u: UsuarioSesion,
  bodegaId: number,
): Promise<BodegaInfo> {
  const b = await infoBodega(db, bodegaId);
  if (b.tipo === 'OBRA') await asegurarAccesoObra(db, u, b.obraId!);
  else if (!operaCentral(u)) throw new NotFoundException('Bodega no encontrada');
  return b;
}

@Injectable()
export class BodegaService {
  constructor(
    private readonly db: DataSource,
    private readonly bitacora: BitacoraService,
  ) {}

  /** Bodega central (siempre, para poder pedirle material) y las de las obras que el usuario ve. */
  async listar(u: UsuarioSesion) {
    const central = operaCentral(u);
    const filtro = veTodas(u)
      ? ''
      : `AND (b.tipo = 'CENTRAL' OR EXISTS (SELECT 1 FROM obra_miembros m WHERE m.obra_id = b.obra_id AND m.usuario_id = $1))`;
    const filas: (BodegaInfo & { acceso: boolean })[] = await this.db.query(
      `SELECT b.id, b.codigo, CASE WHEN b.tipo = 'OBRA' THEN 'Bodega ' || o.nombre ELSE b.nombre END AS nombre,
              b.tipo, b.obra_id AS "obraId", o.nombre AS "obraNombre", o.estado AS "obraEstado",
              (b.tipo = 'OBRA' OR $2) AS acceso,
              (SELECT COUNT(*)::int FROM stock s WHERE s.bodega_id = b.id AND s.cantidad > 0) AS "materialesConStock",
              (SELECT COALESCE(SUM(s.cantidad * m.costo_unitario), 0)::float FROM stock s JOIN materiales m ON m.id = s.material_id
                WHERE s.bodega_id = b.id) AS "valorStock",
              (SELECT COUNT(*)::int FROM transferencias t WHERE (t.bodega_origen_id = b.id OR t.bodega_destino_id = b.id)
                  AND t.estado IN ('SOLICITADA','APROBADA','DESPACHADA')) AS "transferenciasAbiertas"
         FROM bodegas b LEFT JOIN obras o ON o.id = b.obra_id
        WHERE b.activo AND (o.id IS NULL OR o.eliminado_en IS NULL) AND $1::uuid IS NOT NULL ${filtro}
        ORDER BY b.tipo, o.nombre`,
      [u.id, central],
    );
    // Sin acceso a la central solo se muestra su nombre
    return filas.map((b) =>
      b.acceso ? b : { ...b, materialesConStock: null, valorStock: null, transferenciasAbiertas: null },
    );
  }

  /** Stock disponible (para armar una solicitud de transferencia, aunque no se opere esa bodega). */
  async disponible(u: UsuarioSesion, bodegaId: number) {
    const b = await infoBodega(this.db, bodegaId);
    if (b.tipo === 'OBRA') await asegurarAccesoObra(this.db, u, b.obraId!);
    else if (!operaCentral(u) && !tiene(u, 'bodega.transferir')) throw new NotFoundException('Bodega no encontrada');
    return this.db.query(
      `SELECT m.id AS "materialId", m.codigo, m.nombre, m.unidad, COALESCE(s.cantidad, 0)::float AS stock
         FROM materiales m LEFT JOIN stock s ON s.bodega_id = $1 AND s.material_id = m.id
        WHERE m.activo ORDER BY m.codigo`,
      [bodegaId],
    );
  }

  /**
   * Existencias por material. En obra, además: lo requerido por contrato (insumos × cantidad),
   * lo pendiente por ingresar y el consumo teórico según avances vs. el consumo real.
   */
  async stock(u: UsuarioSesion, bodegaId: number) {
    const b = await asegurarAccesoBodega(this.db, u, bodegaId);
    const filas: {
      materialId: number; codigo: string; nombre: string; unidad: string; costoUnitario: number; stockMinimoCentral: number;
      stock: number; entradas: number; salidas: number; consumido: number; requerido: number; teorico: number;
      ultimoMovimiento: string | null;
    }[] = await this.db.query(
      `WITH mv AS (
         SELECT material_id,
                SUM(cantidad) FILTER (WHERE tipo IN ('INGRESO','TRANSFERENCIA_ENTRADA') OR (tipo = 'AJUSTE' AND cantidad > 0 AND vivo)) AS entradas,
                -SUM(cantidad) FILTER (WHERE tipo IN ('DEVOLUCION','TRANSFERENCIA_SALIDA') OR (tipo = 'AJUSTE' AND cantidad < 0 AND vivo)) AS salidas,
                -SUM(cantidad) FILTER (WHERE tipo = 'CONSUMO') AS consumido,
                MAX(fecha) AS ultimo
           FROM (SELECT mi.*, (mi.movimiento_revertido_id IS NULL
                               AND NOT EXISTS (SELECT 1 FROM movimientos_inventario x WHERE x.movimiento_revertido_id = mi.id)) AS vivo
                   FROM movimientos_inventario mi WHERE mi.bodega_id = $1) q
          GROUP BY material_id),
       -- Reversos de ingresos (AJUSTE con revertido) restan de entradas
       rev AS (
         SELECT r.material_id, SUM(r.cantidad) AS q
           FROM movimientos_inventario r JOIN movimientos_inventario o ON o.id = r.movimiento_revertido_id
          WHERE r.bodega_id = $1 AND o.tipo = 'INGRESO' GROUP BY r.material_id),
       req AS (SELECT material_id, requerido FROM vw_material_requerido WHERE obra_id = $2),
       teo AS (
         SELECT i.material_id, SUM(v.ejecutado * i.cantidad_por_unidad) AS teorico
           FROM obra_rubro_insumos i JOIN vw_avance_rubros v ON v.obra_rubro_id = i.obra_rubro_id
          WHERE v.obra_id = $2 GROUP BY i.material_id)
       SELECT m.id AS "materialId", m.codigo, m.nombre, m.unidad, m.costo_unitario::float AS "costoUnitario",
              m.stock_minimo::float AS "stockMinimoCentral",
              COALESCE(s.cantidad, 0)::float AS stock,
              (COALESCE(mv.entradas, 0) + COALESCE(rev.q, 0))::float AS entradas,
              COALESCE(mv.salidas, 0)::float AS salidas,
              COALESCE(mv.consumido, 0)::float AS consumido,
              COALESCE(req.requerido, 0)::float AS requerido,
              COALESCE(teo.teorico, 0)::float AS teorico,
              to_char(mv.ultimo, 'YYYY-MM-DD') AS "ultimoMovimiento"
         FROM materiales m
         LEFT JOIN stock s ON s.bodega_id = $1 AND s.material_id = m.id
         LEFT JOIN mv ON mv.material_id = m.id
         LEFT JOIN rev ON rev.material_id = m.id
         LEFT JOIN req ON req.material_id = m.id
         LEFT JOIN teo ON teo.material_id = m.id
        WHERE s.material_id IS NOT NULL OR mv.material_id IS NOT NULL OR req.material_id IS NOT NULL
        ORDER BY m.codigo`,
      [bodegaId, b.obraId],
    );
    const [p1, p2] = await this.umbrales();
    const materiales = filas.map((f) => {
      const neto = f.entradas - f.salidas; // abastecido neto a la bodega
      const base = {
        materialId: f.materialId, codigo: f.codigo, nombre: f.nombre, unidad: f.unidad,
        stock: f.stock, entradas: f.entradas, salidas: f.salidas, consumido: f.consumido,
        valor: f.stock * f.costoUnitario, ultimoMovimiento: f.ultimoMovimiento,
      };
      if (b.tipo === 'CENTRAL')
        return { ...base, stockMinimo: f.stockMinimoCentral, bajoMinimo: f.stockMinimoCentral > 0 && f.stock < f.stockMinimoCentral };
      // Consumo real vs. teórico (avances × insumos), umbrales de la app original
      let control: { nivel: 'OK' | 'ATENCION' | 'CRITICO'; texto: string; desviacion: number | null } | null = null;
      if (f.teorico || f.consumido) {
        if (!f.teorico) control = { nivel: 'ATENCION', texto: 'Consumo sin avances que lo respalden', desviacion: null };
        else if (!f.consumido) control = { nivel: 'ATENCION', texto: 'Sin consumos registrados', desviacion: null };
        else {
          const v = (f.consumido - f.teorico) / f.teorico;
          const a = Math.abs(v);
          control =
            a <= p1 ? { nivel: 'OK', texto: 'Dentro de lo programado', desviacion: v }
            : v > 0 ? { nivel: a <= p2 ? 'ATENCION' : 'CRITICO', texto: a <= p2 ? 'Sobre lo programado' : 'Sobreconsumo', desviacion: v }
            : { nivel: a <= p2 ? 'ATENCION' : 'CRITICO', texto: a <= p2 ? 'Bajo lo programado' : 'Consumo muy bajo', desviacion: v };
        }
      }
      return {
        ...base,
        requerido: f.requerido,
        pendienteIngresar: Math.max(0, f.requerido - neto),
        consumoTeorico: f.teorico,
        control,
      };
    });
    return { bodega: b, materiales, umbrales: { atencion: p1, critico: p2 } };
  }

  /**
   * Desglose de un material en la bodega de obra: por cada rubro que lo usa,
   * insumo por unidad × cantidad contratada = requerido, y × cantidad ejecutada (avances vigentes) = avances.
   */
  async desglose(u: UsuarioSesion, bodegaId: number, materialId: number) {
    const b = await asegurarAccesoBodega(this.db, u, bodegaId);
    if (b.tipo !== 'OBRA' || !b.obraId) throw new BadRequestException('El desglose aplica a bodegas de obra');
    const [mat] = await this.db.query(`SELECT id, codigo, nombre, unidad FROM materiales WHERE id = $1`, [materialId]);
    if (!mat) throw new NotFoundException('Material no encontrado');
    const rubros: {
      rubroId: string; codigo: string | null; descripcion: string; unidad: string; porUnidad: number;
      contratado: number; ejecutado: number; avances: number; requerido: number; teorico: number;
    }[] = await this.db.query(
      `SELECT r.id AS "rubroId", r.codigo, r.descripcion, r.unidad,
              i.cantidad_por_unidad::float AS "porUnidad",
              r.cantidad::float AS contratado,
              v.ejecutado::float AS ejecutado,
              (SELECT COUNT(*)::int FROM avances a WHERE a.obra_rubro_id = r.id AND a.anulado_en IS NULL) AS avances,
              (r.cantidad * i.cantidad_por_unidad)::float AS requerido,
              (v.ejecutado * i.cantidad_por_unidad)::float AS teorico
         FROM obra_rubro_insumos i
         JOIN obra_rubros r ON r.id = i.obra_rubro_id
         JOIN vw_avance_rubros v ON v.obra_rubro_id = r.id
        WHERE r.obra_id = $1 AND i.material_id = $2
        ORDER BY r.orden, r.codigo NULLS LAST, r.descripcion`,
      [b.obraId, materialId],
    );
    const [c] = await this.db.query(
      `SELECT COALESCE(-SUM(cantidad), 0)::float AS consumido FROM movimientos_inventario WHERE bodega_id = $1 AND material_id = $2 AND tipo = 'CONSUMO'`,
      [bodegaId, materialId],
    );
    return {
      material: mat,
      rubros,
      totales: {
        requerido: rubros.reduce((s, r) => s + r.requerido, 0),
        teorico: rubros.reduce((s, r) => s + r.teorico, 0),
        consumido: c.consumido as number,
      },
    };
  }

  private async umbrales(): Promise<[number, number]> {
    const r: { clave: string; valor: string }[] = await this.db.query(
      `SELECT clave, valor FROM parametros WHERE clave IN ('UMBRAL_ALERTA_PCT','UMBRAL_CRITICO_PCT')`,
    );
    const v = (k: string, d: number) => Number(r.find((x) => x.clave === k)?.valor ?? d) / 100;
    return [v('UMBRAL_ALERTA_PCT', 5), v('UMBRAL_CRITICO_PCT', 10)];
  }

  /** Kardex: movimientos con saldo anterior y nuevo, más recientes primero. */
  async movimientos(u: UsuarioSesion, bodegaId: number, f: ListarMovimientosDto) {
    await asegurarAccesoBodega(this.db, u, bodegaId);
    const params: unknown[] = [bodegaId];
    const where = ['mv.bodega_id = $1'];
    const add = (sql: string, v: unknown) => {
      params.push(v);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (f.materialId) add('mv.material_id = ?', f.materialId);
    if (f.tipo) add('mv.tipo = ?', f.tipo);
    if (f.desde) add('mv.fecha >= ?', f.desde);
    if (f.hasta) add('mv.fecha <= ?', f.hasta);
    const w = where.join(' AND ');
    const [{ total }] = await this.db.query(`SELECT COUNT(*)::int AS total FROM movimientos_inventario mv WHERE ${w}`, params);
    const limit = f.limit ?? 50;
    const page = f.page ?? 1;
    const data = await this.db.query(
      `SELECT mv.id::text, mv.tipo, mv.material_id AS "materialId", m.nombre AS "materialNombre", m.unidad,
              mv.cantidad::float, mv.stock_anterior::float AS "stockAnterior", mv.stock_nuevo::float AS "stockNuevo",
              mv.costo_unitario::float AS "costoUnitario", to_char(mv.fecha, 'YYYY-MM-DD') AS fecha,
              mv.documento_ref AS "documentoRef", mv.archivo_id AS "archivoId", ar.nombre_original AS "archivoNombre",
              mv.obra_rubro_id AS "obraRubroId", r.descripcion AS "rubroDescripcion",
              mv.transferencia_id AS "transferenciaId", t.numero AS "transferenciaNumero",
              mv.movimiento_revertido_id::text AS "revierteA",
              (SELECT x.id::text FROM movimientos_inventario x WHERE x.movimiento_revertido_id = mv.id LIMIT 1) AS "revertidoPor",
              mv.nota, mv.usuario_id AS "usuarioId", us.nombre AS "usuarioNombre", mv.created_at AS "creadoEn"
         FROM movimientos_inventario mv
         JOIN materiales m ON m.id = mv.material_id
         JOIN usuarios us ON us.id = mv.usuario_id
         LEFT JOIN archivos ar ON ar.id = mv.archivo_id
         LEFT JOIN obra_rubros r ON r.id = mv.obra_rubro_id
         LEFT JOIN transferencias t ON t.id = mv.transferencia_id
        WHERE ${w}
        ORDER BY mv.fecha DESC, mv.id DESC
        LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      params,
    );
    return { data, total, page, limit };
  }

  /** Ingreso, consumo, salida o ajuste. El trigger valida stock y llena el saldo (kardex inmutable). */
  async registrar(u: UsuarioSesion, bodegaId: number, dto: MovimientoDto) {
    const b = await asegurarAccesoBodega(this.db, u, bodegaId);
    const permiso: Record<string, string> = {
      INGRESO: 'bodega.ingresar',
      DEVOLUCION: 'bodega.ingresar',
      CONSUMO: 'bodega.consumo',
      AJUSTE: 'bodega.ajustar',
    };
    if (!tiene(u, permiso[dto.tipo])) throw new ForbiddenException(`No tienes permiso para registrar: ${TIPO_TXT[dto.tipo]}`);
    if (b.tipo === 'OBRA') {
      if (b.obraEstado === 'CERRADA') throw new ForbiddenException('La obra está cerrada: su bodega ya no tiene movimientos');
      if (dto.tipo === 'CONSUMO' && b.obraEstado !== 'ACTIVA')
        throw new ForbiddenException('Los consumos se registran con la obra en ejecución');
    } else if (dto.tipo === 'CONSUMO') {
      throw new BadRequestException('Los consumos solo se registran en la bodega de una obra');
    }
    if (dto.tipo !== 'AJUSTE' && dto.cantidad < 0)
      throw new BadRequestException('La cantidad debe ser positiva');
    if (dto.tipo === 'AJUSTE' && !dto.nota?.trim())
      throw new BadRequestException('Un ajuste necesita una observación que lo explique');
    if (dto.obraRubroId && dto.tipo !== 'CONSUMO')
      throw new BadRequestException('Solo los consumos se asocian a un rubro');

    const id = await enTransaccion(this.db, u.id, async (m) => {
      const [mat] = await m.query(`SELECT nombre, unidad FROM materiales WHERE id = $1 AND activo`, [dto.materialId]);
      if (!mat) throw new BadRequestException('Material no válido');
      const [{ futura }] = await m.query(`SELECT $1::date > ${HOY} AS futura`, [dto.fecha]);
      if (futura) throw new BadRequestException('La fecha no puede ser futura');
      if (dto.obraRubroId) {
        const [r] = await m.query(`SELECT 1 FROM obra_rubros WHERE id = $1 AND obra_id = $2`, [dto.obraRubroId, b.obraId]);
        if (!r) throw new BadRequestException('El rubro no es de esta obra');
      }
      if (dto.archivoId) {
        const [a] = await m.query(`SELECT 1 FROM archivos WHERE id = $1 AND categoria <> 'FIRMA'`, [dto.archivoId]);
        if (!a) throw new BadRequestException('Archivo no válido');
      }
      const signo = dto.tipo === 'INGRESO' || dto.tipo === 'AJUSTE' ? 1 : -1;
      const [{ id }] = await m.query(
        `INSERT INTO movimientos_inventario (bodega_id, material_id, tipo, cantidad, costo_unitario, fecha, documento_ref,
                                             archivo_id, obra_rubro_id, nota, usuario_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id::text`,
        [
          bodegaId, dto.materialId, dto.tipo, signo * dto.cantidad, dto.costoUnitario ?? null, dto.fecha,
          dto.documentoRef?.trim() || null, dto.archivoId ?? null, dto.obraRubroId ?? null, dto.nota?.trim() || null, u.id,
        ],
      );
      await this.bitacora.registrar(
        {
          obraId: b.obraId,
          accion: `Bodega: ${TIPO_TXT[dto.tipo]}`,
          detalle: `${mat.nombre}: ${signo * dto.cantidad > 0 ? '+' : ''}${signo * dto.cantidad} ${mat.unidad}${dto.documentoRef ? ` (doc. ${dto.documentoRef})` : ''} en ${b.nombre}`,
          usuarioId: u.id,
        },
        m,
      );
      return id as string;
    });
    return this.movimientoPorId(id);
  }

  /**
   * Anula un movimiento registrando su reverso (el kardex no se edita ni se borra).
   * Quien lo registró puede revertir el suyo; los demás necesitan bodega.ajustar.
   * Las transferencias no se revierten aquí: se gestionan desde la transferencia.
   */
  async revertir(u: UsuarioSesion, bodegaId: number, movId: string, dto: RevertirDto) {
    const b = await asegurarAccesoBodega(this.db, u, bodegaId);
    if (b.tipo === 'OBRA' && b.obraEstado === 'CERRADA') throw new ForbiddenException('La obra está cerrada');
    const id = await enTransaccion(this.db, u.id, async (m) => {
      const [o] = await m.query(
        `SELECT mv.id, mv.tipo, mv.material_id, mv.cantidad::float, mv.usuario_id, mv.movimiento_revertido_id, mat.nombre, mat.unidad,
                EXISTS (SELECT 1 FROM movimientos_inventario x WHERE x.movimiento_revertido_id = mv.id) AS revertido
           FROM movimientos_inventario mv JOIN materiales mat ON mat.id = mv.material_id
          WHERE mv.id = $1 AND mv.bodega_id = $2 FOR UPDATE OF mv`,
        [movId, bodegaId],
      );
      if (!o) throw new NotFoundException('Movimiento no encontrado');
      if (o.tipo.startsWith('TRANSFERENCIA')) throw new BadRequestException('Las transferencias se corrigen desde la propia transferencia');
      if (o.movimiento_revertido_id) throw new BadRequestException('Este movimiento ya es un reverso');
      if (o.revertido) throw new ConflictException('Este movimiento ya fue revertido');
      if (o.usuario_id !== u.id && !tiene(u, 'bodega.ajustar'))
        throw new ForbiddenException('Solo quien lo registró o un usuario con permiso de ajuste puede revertirlo');
      // Ingreso → AJUSTE negativo; consumo/salida → mismo tipo en positivo; ajuste → ajuste contrario
      const tipo = o.tipo === 'INGRESO' ? 'AJUSTE' : o.tipo;
      const [{ id }] = await m.query(
        `INSERT INTO movimientos_inventario (bodega_id, material_id, tipo, cantidad, fecha, movimiento_revertido_id, nota, usuario_id)
         VALUES ($1, $2, $3, $4, ${HOY}, $5, $6, $7) RETURNING id::text`,
        [bodegaId, o.material_id, tipo, -o.cantidad, o.id, `Reverso: ${dto.motivo.trim()}`, u.id],
      );
      await this.bitacora.registrar(
        {
          obraId: b.obraId,
          accion: 'Bodega: reverso de movimiento',
          detalle: `${TIPO_TXT[o.tipo]} de ${o.nombre} (${o.cantidad} ${o.unidad}). Motivo: ${dto.motivo.trim()}`,
          usuarioId: u.id,
        },
        m,
      );
      return id as string;
    });
    return this.movimientoPorId(id);
  }

  private async movimientoPorId(id: string) {
    const [mv] = await this.db.query(
      `SELECT mv.id::text, mv.tipo, mv.material_id AS "materialId", m.nombre AS "materialNombre", m.unidad,
              mv.cantidad::float, mv.stock_anterior::float AS "stockAnterior", mv.stock_nuevo::float AS "stockNuevo",
              to_char(mv.fecha, 'YYYY-MM-DD') AS fecha, mv.movimiento_revertido_id::text AS "revierteA"
         FROM movimientos_inventario mv JOIN materiales m ON m.id = mv.material_id WHERE mv.id = $1`,
      [id],
    );
    return mv;
  }

  /** Marca, por fila del Excel, si el material ya existe (y si su unidad coincide) o se creará. */
  async revisarIngreso(u: UsuarioSesion, bodegaId: number, filas: FilaMaterialExcel[]) {
    await asegurarAccesoBodega(this.db, u, bodegaId);
    const codigos = filas.map((f) => f.codigo).filter((c): c is string => !!c);
    const mats: { id: number; codigo: string; nombre: string; unidad: string }[] = codigos.length
      ? await this.db.query(`SELECT id, upper(codigo) AS codigo, nombre, unidad FROM materiales WHERE upper(codigo) = ANY($1)`, [codigos])
      : [];
    const vistos = new Set<string>();
    const puedeCrear = tiene(u, 'config.editar');
    return filas.map((f) => {
      const m = mats.find((x) => x.codigo === f.codigo);
      const errores = [...f.errores];
      if (f.codigo && vistos.has(f.codigo)) errores.push('Código repetido en el archivo');
      if (f.codigo) vistos.add(f.codigo);
      if (m && f.unidad && m.unidad.toLowerCase() !== f.unidad.toLowerCase())
        errores.push(`El material existe con unidad «${m.unidad}», no «${f.unidad}»`);
      if (!m && !puedeCrear && !errores.length) errores.push('Material nuevo: solo quien edita el catálogo puede crearlo');
      return { ...f, errores, materialId: m?.id ?? null, nuevo: !m, nombreCatalogo: m?.nombre ?? null };
    });
  }

  /**
   * Registra un INGRESO por fila (misma fecha y documento). Crea los materiales que no existan
   * (requiere config.editar). Todo o nada: si una fila falla no se guarda ninguna.
   */
  async importarIngreso(u: UsuarioSesion, bodegaId: number, dto: ImportarIngresoDto) {
    const b = await asegurarAccesoBodega(this.db, u, bodegaId);
    if (!tiene(u, 'bodega.ingresar')) throw new ForbiddenException('No tienes permiso para registrar ingresos');
    if (b.tipo === 'OBRA' && b.obraEstado === 'CERRADA') throw new ForbiddenException('La obra está cerrada');
    const revisadas = await this.revisarIngreso(u, bodegaId, dto.filas.map((f, i) => ({
      fila: i + 1, codigo: f.codigo.trim().toUpperCase(), nombre: f.nombre, unidad: f.unidad.trim(), cantidad: f.cantidad,
      costoUnitario: f.costoUnitario ?? null, stockMinimo: null, errores: [],
    })));
    const malas = revisadas.filter((r) => r.errores.length);
    if (malas.length)
      throw new BadRequestException(malas.map((r) => `Fila ${r.fila} (${r.codigo}): ${r.errores.join('; ')}`).join(' | '));
    return enTransaccion(this.db, u.id, async (m) => {
      const [{ futura }] = await m.query(`SELECT $1::date > ${HOY} AS futura`, [dto.fecha]);
      if (futura) throw new BadRequestException('La fecha no puede ser futura');
      if (dto.archivoId) {
        const [a] = await m.query(`SELECT 1 FROM archivos WHERE id = $1 AND categoria <> 'FIRMA'`, [dto.archivoId]);
        if (!a) throw new BadRequestException('Archivo no válido');
      }
      let nuevos = 0;
      for (const r of revisadas) {
        let materialId = r.materialId;
        if (!materialId) {
          const [n] = await m.query(
            `INSERT INTO materiales (codigo, nombre, unidad, costo_unitario) VALUES ($1, $2, $3, $4) RETURNING id`,
            [r.codigo, r.nombre!.trim(), r.unidad, r.costoUnitario ?? 0],
          );
          materialId = n.id;
          nuevos++;
        }
        await m.query(
          `INSERT INTO movimientos_inventario (bodega_id, material_id, tipo, cantidad, costo_unitario, fecha, documento_ref, archivo_id, nota, usuario_id)
           VALUES ($1, $2, 'INGRESO', $3, $4, $5, $6, $7, $8, $9)`,
          [bodegaId, materialId, r.cantidad, r.costoUnitario ?? null, dto.fecha, dto.documentoRef?.trim() || null, dto.archivoId ?? null, dto.nota?.trim() || 'Importado desde Excel', u.id],
        );
      }
      await this.bitacora.registrar(
        {
          obraId: b.obraId,
          accion: 'Bodega: ingreso importado desde Excel',
          detalle: `${revisadas.length} material(es) en ${b.nombre}${dto.documentoRef ? ` (doc. ${dto.documentoRef})` : ''}${nuevos ? `; ${nuevos} material(es) nuevo(s) en el catálogo` : ''}`,
          usuarioId: u.id,
        },
        m,
      );
      return { ingresos: revisadas.length, materialesNuevos: nuevos };
    });
  }
}
