import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { asegurarAccesoObra, exigirEstado } from '../common/acceso-obra.js';
import { BitacoraService } from '../common/bitacora.service.js';
import { ROL_SUPERADMIN, type UsuarioSesion } from '../common/decorators.js';
import { generarExcel } from '../common/excel.js';
import { enTransaccion } from '../common/transaccion.js';
import { FirmasService, type PasoFirma } from '../firmas/firmas.service.js';
import { ESTADOS_CIERRAN } from './cierre.js';
import type {
  ActualizarPlanillaDto,
  ArchivoPlanillaDto,
  CrearPlanillaDto,
  FormatoDto,
  LineaPlanillaDto,
  MotivoDto,
  PagarDto,
  PropuestaDto,
} from './planillas.dto.js';

type Db = DataSource | EntityManager;
type Tipo = 'CLIENTE' | 'CONTRATISTA';

const HOY = `(now() AT TIME ZONE 'America/Guayaquil')::date`;
const EPS = 1e-4;
/** Estados en los que la planilla se puede editar. */
const EDITABLES = ['BORRADOR', 'OBSERVADA'];
/** Mientras haya una así en la serie no se crea la siguiente (su acumulado aún puede cambiar). */
const ABIERTAS = ['BORRADOR', 'OBSERVADA', 'PRESENTADA'];

/** Flujo de firmas internas ST (el contratista aún no firma en la app; el cliente firma el impreso). */
const PASOS = {
  ELABORADO: { etiqueta: 'Elaborado por', orden: 1 },
  REVISADO: { etiqueta: 'Revisado por', orden: 2 },
  APROBADO: { etiqueta: 'Aprobado por', orden: 3 },
} as const;

const tiene = (u: UsuarioSesion, p: string) => u.roles.includes(ROL_SUPERADMIN) || u.permisos.includes(p);
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

interface Cabecera {
  id: string;
  obraId: string;
  tipo: Tipo;
  obraContratistaId: string | null;
  numero: number;
  desde: string;
  hasta: string;
  estado: string;
  creadoPor: string;
  formato: Record<string, unknown>;
  multa: number;
  multaDetalle: string | null;
}

interface Serie {
  obraId: string;
  tipo: Tipo;
  obraContratistaId: string | null;
}

interface LineaCalc {
  obraRubroId: string;
  codigo: string | null;
  descripcion: string;
  unidad: string;
  cantidadContrato: number;
  precioUnitario: number;
  cantidadAnterior: number;
  cantidadPeriodo: number;
  cantidadApp: number;
}

@Injectable()
export class PlanillasService {
  constructor(
    private readonly db: DataSource,
    private readonly firmas: FirmasService,
    private readonly bitacora: BitacoraService,
  ) {}

  // =================================================================== consulta

  /** Pestaña Planillas de la obra: indicadores, resumen por contratista y lista de planillas. */
  async resumen(u: UsuarioSesion, obraId: string) {
    const { estado } = await asegurarAccesoObra(this.db, u, obraId);
    const [cli] = await this.db.query(
      `WITH e AS (SELECT obra_rubro_id, SUM(cantidad) AS q FROM avances WHERE obra_id = $1 AND anulado_en IS NULL GROUP BY 1),
            pl AS (SELECT l.obra_rubro_id, SUM(l.cantidad_periodo) AS q
                     FROM planilla_lineas l JOIN planillas p ON p.id = l.planilla_id
                    WHERE p.obra_id = $1 AND p.tipo = 'CLIENTE' AND p.estado = ANY($2) GROUP BY 1)
       SELECT COALESCE(SUM(ROUND(r.cantidad * r.precio_unitario, 2)), 0)::float AS "montoContrato",
              COALESCE(SUM(ROUND(COALESCE(e.q, 0) * r.precio_unitario, 2)), 0)::float AS ejecutado,
              COALESCE(SUM(ROUND(GREATEST(COALESCE(e.q, 0) - COALESCE(pl.q, 0), 0) * r.precio_unitario, 2)), 0)::float AS "sinPlanillar"
         FROM obra_rubros r LEFT JOIN e ON e.obra_rubro_id = r.id LEFT JOIN pl ON pl.obra_rubro_id = r.id
        WHERE r.obra_id = $1`,
      [obraId, ESTADOS_CIERRAN],
    );
    const [montos] = await this.db.query(
      `SELECT COALESCE(SUM(t.base) FILTER (WHERE p.estado = ANY($2)), 0)::float AS planillado,
              COALESCE(SUM(t.base) FILTER (WHERE p.estado IN ('APROBADA','PAGADA')), 0)::float AS aprobado,
              COALESCE(SUM(t.base) FILTER (WHERE p.estado = 'PAGADA'), 0)::float AS pagado
         FROM planillas p JOIN vw_planilla_totales t ON t.planilla_id = p.id
        WHERE p.obra_id = $1 AND p.tipo = 'CLIENTE'`,
      [obraId, ESTADOS_CIERRAN],
    );
    const porEjecutor = await this.db.query(
      `SELECT a.obra_contratista_id AS "obraContratistaId", COALESCE(c.razon_social, 'ST (personal propio)') AS ejecutor,
              SUM(ROUND(a.cantidad * r.precio_unitario, 2))::float AS valor
         FROM avances a JOIN obra_rubros r ON r.id = a.obra_rubro_id
         LEFT JOIN obra_contratistas oc ON oc.id = a.obra_contratista_id LEFT JOIN contratistas c ON c.id = oc.contratista_id
        WHERE a.obra_id = $1 AND a.anulado_en IS NULL
        GROUP BY 1, 2 ORDER BY (a.obra_contratista_id IS NOT NULL), 2`,
      [obraId],
    );

    // Por contratista: montos de sus planillas y lo que ejecutó y aún no se le planilla
    const contratistas = await this.db.query(
      `SELECT oc.id AS "obraContratistaId", c.razon_social AS nombre, oc.activo,
              COUNT(p.id) FILTER (WHERE p.estado <> 'ANULADA')::int AS n,
              COALESCE(SUM(t.total) FILTER (WHERE p.estado = 'PRESENTADA'), 0)::float AS presentado,
              COALESCE(SUM(t.total) FILTER (WHERE p.estado = 'APROBADA'), 0)::float AS aprobado,
              COALESCE(SUM(t.total) FILTER (WHERE p.estado = 'PAGADA'), 0)::float AS pagado
         FROM obra_contratistas oc JOIN contratistas c ON c.id = oc.contratista_id
         LEFT JOIN planillas p ON p.obra_contratista_id = oc.id
         LEFT JOIN vw_planilla_totales t ON t.planilla_id = p.id
        WHERE oc.obra_id = $1
        GROUP BY oc.id, c.razon_social, oc.activo ORDER BY c.razon_social`,
      [obraId],
    );
    const rubrosCtr: { obraContratistaId: string }[] = await this.db.query(
      `WITH e AS (SELECT obra_contratista_id AS oc, obra_rubro_id AS r, SUM(cantidad) AS q
                    FROM avances WHERE obra_id = $1 AND anulado_en IS NULL AND obra_contratista_id IS NOT NULL GROUP BY 1, 2),
            pl AS (SELECT p.obra_contratista_id AS oc, l.obra_rubro_id AS r, SUM(l.cantidad_periodo) AS q
                     FROM planilla_lineas l JOIN planillas p ON p.id = l.planilla_id
                    WHERE p.obra_id = $1 AND p.tipo = 'CONTRATISTA' AND p.estado = ANY($2) GROUP BY 1, 2),
            pu AS (SELECT DISTINCT ON (p.obra_contratista_id, l.obra_rubro_id) p.obra_contratista_id AS oc, l.obra_rubro_id AS r, l.precio_unitario AS pu
                     FROM planilla_lineas l JOIN planillas p ON p.id = l.planilla_id
                    WHERE p.obra_id = $1 AND p.tipo = 'CONTRATISTA' AND p.estado <> 'ANULADA' AND l.precio_unitario > 0
                    ORDER BY p.obra_contratista_id, l.obra_rubro_id, p.numero DESC)
       SELECT e.oc AS "obraContratistaId", r.id AS "obraRubroId", r.descripcion, r.unidad,
              e.q::float AS ejecutado, COALESCE(pl.q, 0)::float AS planillado,
              GREATEST(e.q - COALESCE(pl.q, 0), 0)::float AS "porPlanillar",
              COALESCE(pu.pu, ocp.precio_unitario)::float AS "precioUnitario"
         FROM e JOIN obra_rubros r ON r.id = e.r
         LEFT JOIN pl ON pl.oc = e.oc AND pl.r = e.r
         LEFT JOIN pu ON pu.oc = e.oc AND pu.r = e.r
         LEFT JOIN obra_contratista_precios ocp ON ocp.obra_contratista_id = e.oc AND ocp.obra_rubro_id = e.r
        ORDER BY r.orden, r.descripcion`,
      [obraId, ESTADOS_CIERRAN],
    );
    for (const c of contratistas) {
      c.rubros = rubrosCtr.filter((x) => x.obraContratistaId === c.obraContratistaId);
      c.porPlanillarValor = r2(
        c.rubros.reduce((s: number, x: { porPlanillar: number; precioUnitario: number | null }) => s + x.porPlanillar * (x.precioUnitario ?? 0), 0),
      );
    }

    const planillas = await this.db.query(
      `${SELECT_LISTA} WHERE p.obra_id = $1 ORDER BY p.tipo, c.razon_social NULLS FIRST, p.numero DESC, p.created_at DESC`,
      [obraId],
    );
    return {
      obraEstado: estado,
      cliente: { ...cli, ...montos, porEjecutor },
      contratistas,
      planillas,
      puede: { elaborar: tiene(u, 'planillas.elaborar') && ['ACTIVA', 'PAUSADA'].includes(estado) },
    };
  }

  /** Lo que tendría la siguiente planilla de la serie (período, número, líneas y formato por defecto). */
  async propuesta(u: UsuarioSesion, obraId: string, dto: PropuestaDto) {
    await asegurarAccesoObra(this.db, u, obraId);
    const serie = await this.serie(this.db, obraId, dto.tipo, dto.obraContratistaId);
    const abierta = await this.abiertaEnSerie(this.db, serie);
    const sig = await this.siguiente(this.db, serie, undefined, dto.periodoHasta);
    const lineas = await this.calcularLineas(this.db, serie, sig.desde, sig.hasta, sig.previaId, null, undefined);
    const formato = await this.formatoPorDefecto(this.db, serie, sig.previaFormato, u);
    return {
      ...sig,
      primera: !sig.previaId,
      bloqueo: abierta ? `Termina primero la planilla N.º ${abierta.numero} (${abierta.estado.toLowerCase()})` : null,
      lineas: lineas.map((l) => this.conCalculos(l, dto.tipo, null)),
      formato,
    };
  }

  /** Detalle con líneas (y sus alertas), totales, firmas, anexo y qué puede hacer el usuario. */
  async obtener(u: UsuarioSesion, obraId: string, id: string, db: Db = this.db) {
    const { estado: obraEstado } = await asegurarAccesoObra(db, u, obraId);
    const c = await this.cabecera(db, obraId, id);
    const [det] = await db.query(`${SELECT_LISTA} WHERE p.id = $1`, [id]);
    const [extra] = await db.query(
      `SELECT p.multa_detalle AS "multaDetalle", p.observacion, p.formato, p.iva_pct::float AS "ivaPct",
              p.archivo_id AS "archivoId", a.nombre_original AS "archivoNombre",
              to_char(p.pagada_fecha, 'YYYY-MM-DD') AS "pagadaFecha", p.pago_ref AS "pagoRef",
              p.motivo_anulacion AS "motivoAnulacion", p.estado_en AS "estadoEn", ue.nombre AS "estadoPorNombre",
              o.nombre AS "obraNombre", o.codigo AS "obraCodigo", o.cliente AS "obraCliente",
              to_char(o.fecha_inicio, 'YYYY-MM-DD') AS "obraInicio", to_char(o.fecha_fin, 'YYYY-MM-DD') AS "obraFin"
         FROM planillas p JOIN obras o ON o.id = p.obra_id
         LEFT JOIN archivos a ON a.id = p.archivo_id LEFT JOIN usuarios ue ON ue.id = p.estado_por
        WHERE p.id = $1`,
      [id],
    );
    const filas: LineaCalc[] = await db.query(
      `SELECT l.obra_rubro_id AS "obraRubroId", l.codigo, l.descripcion, l.unidad,
              l.cantidad_contrato::float AS "cantidadContrato", l.precio_unitario::float AS "precioUnitario",
              l.cantidad_anterior::float AS "cantidadAnterior", l.cantidad_periodo::float AS "cantidadPeriodo",
              l.cantidad_app::float AS "cantidadApp"
         FROM planilla_lineas l LEFT JOIN obra_rubros r ON r.id = l.obra_rubro_id
        WHERE l.planilla_id = $1 ORDER BY r.orden, l.id`,
      [id],
    );
    const corte = await this.cantidadesHasta(db, c, c.hasta);
    const lineas = filas.map((l) => this.conCalculos(l, c.tipo, corte.get(l.obraRubroId) ?? 0));
    const anexo = await db.query(
      `SELECT to_char(a.fecha, 'YYYY-MM-DD') AS fecha, r.descripcion AS rubro, r.unidad, a.cantidad::float,
              a.abscisa_desde AS "abscisaDesde", a.abscisa_hasta AS "abscisaHasta", a.frente, a.tramo, a.nota,
              u.nombre AS "registradoPorNombre", COALESCE(ct.razon_social, 'ST') AS ejecutor
         FROM avances a JOIN obra_rubros r ON r.id = a.obra_rubro_id JOIN usuarios u ON u.id = a.registrado_por
         LEFT JOIN obra_contratistas oc ON oc.id = a.obra_contratista_id LEFT JOIN contratistas ct ON ct.id = oc.contratista_id
        WHERE a.obra_id = $1 AND a.anulado_en IS NULL AND a.fecha BETWEEN $2 AND $3
          AND ($4::uuid IS NULL OR a.obra_contratista_id = $4)
        ORDER BY a.fecha, r.orden, a.created_at`,
      [obraId, c.desde, c.hasta, c.obraContratistaId],
    );
    const firmas = await this.firmas.listar(db, 'PLANILLA', id);
    const pendiente = firmas.find((f) => !f.firmado);
    const totales = this.totales(lineas, det.multa, extra.ivaPct);

    const esCreador = c.creadoPor === u.id;
    const gestiona = tiene(u, 'planillas.estado');
    const obraViva = ['ACTIVA', 'PAUSADA'].includes(obraEstado);
    const ultima = await this.esUltima(db, c);
    const [previa] = await db.query(
      `SELECT 1 FROM planillas WHERE obra_id = $1 AND tipo = $2 AND obra_contratista_id IS NOT DISTINCT FROM $3
          AND estado <> 'ANULADA' AND numero < $4 LIMIT 1`,
      [c.obraId, c.tipo, c.obraContratistaId, c.numero],
    );
    const puedeEditar = EDITABLES.includes(c.estado) && obraViva && tiene(u, 'planillas.elaborar') && (esCreador || gestiona);
    const puede = {
      editar: puedeEditar,
      eliminar: c.estado === 'BORRADOR' && (esCreador || gestiona),
      presentar: puedeEditar,
      firmar:
        c.estado === 'PRESENTADA' && !!pendiente && pendiente.designadoId === u.id && tiene(u, 'planillas.firmar'),
      observar:
        (c.estado === 'PRESENTADA' && (esCreador || gestiona || (pendiente?.designadoId === u.id && tiene(u, 'planillas.firmar')))) ||
        (c.estado === 'APROBADA' && gestiona && ultima),
      pagar: c.estado === 'APROBADA' && gestiona,
      anular: !['ANULADA', 'PAGADA'].includes(c.estado) && gestiona && ultima,
      adjuntar: ['APROBADA', 'PAGADA'].includes(c.estado) && (esCreador || gestiona),
    };
    return {
      ...det,
      ...extra,
      lineas,
      totales,
      alertas: lineas.reduce((s, l) => s + l.alertas.length, 0),
      primera: !previa,
      firmas,
      anexo,
      puede,
    };
  }

  // =================================================================== edición

  async crear(u: UsuarioSesion, obraId: string, dto: CrearPlanillaDto) {
    const { estado } = await asegurarAccesoObra(this.db, u, obraId);
    exigirEstado(estado, ['ACTIVA', 'PAUSADA'], 'elaborar planillas');
    const id = await enTransaccion(this.db, u.id, async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext('planillas:' || $1))`, [obraId]);
      const serie = await this.serie(m, obraId, dto.tipo, dto.obraContratistaId);
      const abierta = await this.abiertaEnSerie(m, serie);
      if (abierta)
        throw new ConflictException(
          `Termina primero la planilla N.º ${abierta.numero} (${abierta.estado.toLowerCase()}): su acumulado es la base de la siguiente`,
        );
      const sig = await this.siguiente(m, serie, dto.periodoDesde, dto.periodoHasta);
      const [{ iva }] = await m.query(`SELECT COALESCE((SELECT valor FROM parametros WHERE clave = 'IVA_PCT'), '15')::numeric AS iva`);
      const formato = { ...(await this.formatoPorDefecto(m, serie, sig.previaFormato, u)), ...limpiarFormato(dto.formato) };
      const [{ id }] = await m.query(
        `INSERT INTO planillas (obra_id, tipo, obra_contratista_id, numero, periodo_desde, periodo_hasta, multa, multa_detalle,
                                iva_pct, observacion, formato, creado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [
          obraId, serie.tipo, serie.obraContratistaId, sig.numero, sig.desde, sig.hasta, dto.multa ?? 0,
          dto.multaDetalle?.trim() || null, iva, dto.observacion?.trim() || null, formato, u.id,
        ],
      );
      const lineas = await this.calcularLineas(m, serie, sig.desde, sig.hasta, sig.previaId, null, dto.lineas);
      await this.guardarLineas(m, id, serie, lineas);
      await this.bitacora.registrar(
        { obraId, accion: `Creó la planilla ${await this.nombreSerie(m, serie)} N.º ${sig.numero}`, detalle: `Período ${sig.desde} a ${sig.hasta}`, usuarioId: u.id, entidad: 'PLANILLA', entidadId: id },
        m,
      );
      return id as string;
    });
    return this.obtener(u, obraId, id);
  }

  async actualizar(u: UsuarioSesion, obraId: string, id: string, dto: ActualizarPlanillaDto) {
    const { estado } = await asegurarAccesoObra(this.db, u, obraId);
    exigirEstado(estado, ['ACTIVA', 'PAUSADA'], 'editar planillas');
    await enTransaccion(this.db, u.id, async (m) => {
      const c = await this.cabecera(m, obraId, id, true);
      this.exigirEditable(u, c);
      const serie: Serie = { obraId, tipo: c.tipo, obraContratistaId: c.obraContratistaId };
      const sig = await this.siguiente(m, serie, dto.periodoDesde ?? c.desde, dto.periodoHasta ?? c.hasta, c);
      const formato = dto.formato ? { ...c.formato, ...limpiarFormato(dto.formato) } : c.formato;
      await m.query(
        `UPDATE planillas SET periodo_desde = $2, periodo_hasta = $3, multa = COALESCE($4, multa),
                multa_detalle = CASE WHEN $5::boolean THEN $6 ELSE multa_detalle END,
                observacion = CASE WHEN $7::boolean THEN $8 ELSE observacion END, formato = $9
          WHERE id = $1`,
        [
          id, sig.desde, sig.hasta, dto.multa ?? null,
          dto.multaDetalle !== undefined, dto.multaDetalle?.trim() || null,
          dto.observacion !== undefined, dto.observacion?.trim() || null, formato,
        ],
      );
      const existentes = await this.lineasGuardadas(m, id);
      const lineas = await this.calcularLineas(m, serie, sig.desde, sig.hasta, sig.previaId, existentes, dto.lineas);
      await this.guardarLineas(m, id, serie, lineas);
      const cambios = [
        ...BitacoraService.diferencias(
          { desde: c.desde, hasta: c.hasta, multa: c.multa, multaDetalle: c.multaDetalle ?? '' },
          { desde: sig.desde, hasta: sig.hasta, multa: dto.multa, multaDetalle: dto.multaDetalle === undefined ? undefined : (dto.multaDetalle?.trim() ?? '') },
          { desde: 'Desde', hasta: 'Hasta', multa: 'Descuentos', multaDetalle: 'Concepto del descuento' },
        ),
        ...cambiosLineas(existentes, lineas),
        ...(dto.formato
          ? Object.keys(limpiarFormato(dto.formato))
              .filter((k) => JSON.stringify(c.formato[k] ?? null) !== JSON.stringify(formato[k as keyof typeof formato] ?? null))
              .map((k) => ({ campo: `Impreso: ${k}`, antes: c.formato[k] ?? null, despues: formato[k as keyof typeof formato] ?? null }))
          : []),
      ];
      await this.bitacora.registrar(
        {
          obraId,
          accion: `Editó la planilla ${await this.nombreSerie(m, serie)} N.º ${c.numero}`,
          cambios,
          usuarioId: u.id,
          entidad: 'PLANILLA',
          entidadId: id,
        },
        m,
      );
    });
    return this.obtener(u, obraId, id);
  }

  /** Solo borradores (nunca presentados). */
  async eliminar(u: UsuarioSesion, obraId: string, id: string) {
    await asegurarAccesoObra(this.db, u, obraId);
    await enTransaccion(this.db, u.id, async (m) => {
      const c = await this.cabecera(m, obraId, id, true);
      if (c.estado !== 'BORRADOR') throw new ConflictException('Solo se eliminan borradores; esta planilla se puede anular');
      if (c.creadoPor !== u.id && !tiene(u, 'planillas.estado'))
        throw new ForbiddenException('Solo quien la elaboró puede eliminar el borrador');
      await m.query(`DELETE FROM firmas WHERE entidad_tipo = 'PLANILLA' AND entidad_id = $1`, [id]);
      await m.query(`DELETE FROM planillas WHERE id = $1`, [id]);
      const serie: Serie = { obraId, tipo: c.tipo, obraContratistaId: c.obraContratistaId };
      await this.bitacora.registrar(
        { obraId, accion: `Eliminó el borrador de la planilla ${await this.nombreSerie(m, serie)} N.º ${c.numero}`, usuarioId: u.id, entidad: 'PLANILLA', entidadId: id },
        m,
      );
    });
    return { ok: true };
  }

  // =================================================================== flujo

  /**
   * Presenta la planilla: recalcula lo registrado en la app, valida y firma «Elaborado por».
   * Revisa el Superintendente y aprueba el Administrador de la obra (si uno de ellos la elaboró, firma el otro).
   */
  async presentar(u: UsuarioSesion, obraId: string, id: string) {
    const { estado } = await asegurarAccesoObra(this.db, u, obraId);
    exigirEstado(estado, ['ACTIVA', 'PAUSADA'], 'presentar planillas');
    await enTransaccion(this.db, u.id, async (m) => {
      const c = await this.cabecera(m, obraId, id, true);
      this.exigirEditable(u, c);
      const serie: Serie = { obraId, tipo: c.tipo, obraContratistaId: c.obraContratistaId };
      const sig = await this.siguiente(m, serie, c.desde, c.hasta, c);
      const lineas = await this.calcularLineas(m, serie, sig.desde, sig.hasta, sig.previaId, await this.lineasGuardadas(m, id), undefined);
      await this.guardarLineas(m, id, serie, lineas);

      if (!lineas.some((l) => l.cantidadPeriodo > EPS)) throw new BadRequestException('La planilla no cobra nada en el período');
      if (c.tipo === 'CONTRATISTA') {
        const sinPrecio = lineas.filter((l) => l.cantidadPeriodo > EPS && l.precioUnitario <= 0);
        if (sinPrecio.length)
          throw new BadRequestException(`Falta el precio del subcontrato en: ${sinPrecio.map((l) => l.descripcion).join(', ')}`);
      }
      const [t] = await m.query(`SELECT subtotal::float, multa::float FROM vw_planilla_totales WHERE planilla_id = $1`, [id]);
      if (t.multa > t.subtotal + 0.001) throw new BadRequestException('Los descuentos superan el subtotal de la planilla');

      const [o] = await m.query(`SELECT administrador_id AS a, superintendente_id AS s FROM obras WHERE id = $1`, [obraId]);
      const firmantes = [o.s, o.a].filter((x: string | null, i, arr) => x && x !== u.id && arr.indexOf(x) === i) as string[];
      if (!firmantes.length)
        throw new BadRequestException('La obra no tiene un Superintendente o Administrador designado (distinto de ti) que apruebe la planilla');
      const pasos: PasoFirma[] = [{ rol: 'ELABORADO', ...PASOS.ELABORADO, designadoId: u.id }];
      if (firmantes.length === 2) pasos.push({ rol: 'REVISADO', ...PASOS.REVISADO, designadoId: firmantes[0] });
      pasos.push({ rol: 'APROBADO', ...PASOS.APROBADO, designadoId: firmantes[firmantes.length - 1] });

      // Cada presentación empieza un flujo nuevo (los firmantes pueden haber cambiado)
      await m.query(`DELETE FROM firmas WHERE entidad_tipo = 'PLANILLA' AND entidad_id = $1`, [id]);
      await this.firmas.asegurar(m, 'PLANILLA', id, pasos);
      await this.firmas.firmar(m, 'PLANILLA', id, 'ELABORADO', u);
      await m.query(`UPDATE planillas SET estado = 'PRESENTADA', estado_por = $2, estado_en = now() WHERE id = $1`, [id, u.id]);
      await this.bitacora.registrar(
        { obraId, accion: `Presentó la planilla ${await this.nombreSerie(m, serie)} N.º ${c.numero}`, detalle: `Período ${c.desde} a ${c.hasta}`, usuarioId: u.id, entidad: 'PLANILLA', entidadId: id },
        m,
      );
    });
    return this.obtener(u, obraId, id);
  }

  /** Firma el siguiente paso (Revisado / Aprobado) si estás designado. Con la última firma queda APROBADA. */
  async firmar(u: UsuarioSesion, obraId: string, id: string) {
    await asegurarAccesoObra(this.db, u, obraId);
    await enTransaccion(this.db, u.id, async (m) => {
      const c = await this.cabecera(m, obraId, id, true);
      if (c.estado !== 'PRESENTADA') throw new ConflictException(`No se puede firmar: la planilla está ${c.estado.toLowerCase()}`);
      const pendientes = (await this.firmas.listar(m, 'PLANILLA', id)).filter((f) => !f.firmado);
      const paso = pendientes[0];
      if (!paso) throw new ConflictException('La planilla no tiene firmas pendientes');
      await this.firmas.firmar(m, 'PLANILLA', id, paso.rol, u);
      const serie: Serie = { obraId, tipo: c.tipo, obraContratistaId: c.obraContratistaId };
      const nombre = `${await this.nombreSerie(m, serie)} N.º ${c.numero}`;
      if (pendientes.length === 1) {
        await m.query(`UPDATE planillas SET estado = 'APROBADA', estado_por = $2, estado_en = now() WHERE id = $1`, [id, u.id]);
        await this.bitacora.registrar({ obraId, accion: `Aprobó la planilla ${nombre}`, usuarioId: u.id, entidad: 'PLANILLA', entidadId: id }, m);
      } else {
        await this.bitacora.registrar({ obraId, accion: `Revisó la planilla ${nombre}`, usuarioId: u.id, entidad: 'PLANILLA', entidadId: id }, m);
      }
    });
    return this.obtener(u, obraId, id);
  }

  /** Devuelve la planilla para corregir (se borran las firmas). Una aprobada solo la reabre administración y si es la última. */
  async observar(u: UsuarioSesion, obraId: string, id: string, dto: MotivoDto) {
    await asegurarAccesoObra(this.db, u, obraId);
    await enTransaccion(this.db, u.id, async (m) => {
      const c = await this.cabecera(m, obraId, id, true);
      const gestiona = tiene(u, 'planillas.estado');
      if (c.estado === 'PRESENTADA') {
        const pendiente = (await this.firmas.listar(m, 'PLANILLA', id)).find((f) => !f.firmado);
        const designado = pendiente?.designadoId === u.id && tiene(u, 'planillas.firmar');
        if (c.creadoPor !== u.id && !gestiona && !designado)
          throw new ForbiddenException('Solo quien elaboró la planilla, quien debe firmarla o administración puede observarla');
      } else if (c.estado === 'APROBADA') {
        if (!gestiona) throw new ForbiddenException('Solo administración puede reabrir una planilla aprobada');
        if (!(await this.esUltima(m, c))) throw new ConflictException('Ya hay planillas posteriores: anúlalas u obsérvalas primero');
      } else {
        throw new ConflictException(`No se puede observar: la planilla está ${c.estado.toLowerCase()}`);
      }
      await this.firmas.reiniciar(m, 'PLANILLA', id);
      await m.query(
        `UPDATE planillas SET estado = 'OBSERVADA', observacion = $2, estado_por = $3, estado_en = now() WHERE id = $1`,
        [id, dto.motivo.trim(), u.id],
      );
      const serie: Serie = { obraId, tipo: c.tipo, obraContratistaId: c.obraContratistaId };
      await this.bitacora.registrar(
        { obraId, accion: `Observó la planilla ${await this.nombreSerie(m, serie)} N.º ${c.numero}`, detalle: dto.motivo.trim(), usuarioId: u.id, entidad: 'PLANILLA', entidadId: id },
        m,
      );
    });
    return this.obtener(u, obraId, id);
  }

  async pagar(u: UsuarioSesion, obraId: string, id: string, dto: PagarDto) {
    await asegurarAccesoObra(this.db, u, obraId);
    await enTransaccion(this.db, u.id, async (m) => {
      const c = await this.cabecera(m, obraId, id, true);
      if (c.estado !== 'APROBADA') throw new ConflictException('Solo una planilla aprobada se marca como pagada');
      const [{ futura, previa }] = await m.query(`SELECT $1::date > ${HOY} AS futura, $1::date < $2::date AS previa`, [dto.fecha, c.hasta]);
      if (futura) throw new BadRequestException('La fecha de pago no puede ser futura');
      if (previa) throw new BadRequestException('La fecha de pago no puede ser anterior al cierre del período');
      await m.query(
        `UPDATE planillas SET estado = 'PAGADA', pagada_fecha = $2, pago_ref = $3, estado_por = $4, estado_en = now() WHERE id = $1`,
        [id, dto.fecha, dto.referencia?.trim() || null, u.id],
      );
      const serie: Serie = { obraId, tipo: c.tipo, obraContratistaId: c.obraContratistaId };
      await this.bitacora.registrar(
        {
          obraId,
          accion: `Marcó pagada la planilla ${await this.nombreSerie(m, serie)} N.º ${c.numero}`,
          detalle: `Fecha ${dto.fecha}${dto.referencia ? `, ref. ${dto.referencia.trim()}` : ''}`,
          usuarioId: u.id,
          entidad: 'PLANILLA',
          entidadId: id,
        },
        m,
      );
    });
    return this.obtener(u, obraId, id);
  }

  /** Solo la última de su serie y nunca una pagada; libera su número y sus avances. */
  async anular(u: UsuarioSesion, obraId: string, id: string, dto: MotivoDto) {
    await asegurarAccesoObra(this.db, u, obraId);
    await enTransaccion(this.db, u.id, async (m) => {
      const c = await this.cabecera(m, obraId, id, true);
      if (c.estado === 'ANULADA') throw new ConflictException('La planilla ya está anulada');
      if (c.estado === 'PAGADA') throw new ConflictException('Una planilla pagada no se anula');
      if (!(await this.esUltima(m, c))) throw new ConflictException('Solo se anula la última planilla de la serie');
      await m.query(
        `UPDATE planillas SET estado = 'ANULADA', motivo_anulacion = $2, estado_por = $3, estado_en = now() WHERE id = $1`,
        [id, dto.motivo.trim(), u.id],
      );
      const serie: Serie = { obraId, tipo: c.tipo, obraContratistaId: c.obraContratistaId };
      await this.bitacora.registrar(
        { obraId, accion: `Anuló la planilla ${await this.nombreSerie(m, serie)} N.º ${c.numero}`, detalle: dto.motivo.trim(), usuarioId: u.id, entidad: 'PLANILLA', entidadId: id },
        m,
      );
    });
    return this.obtener(u, obraId, id);
  }

  /** Planilla firmada escaneada (PDF o imagen subida antes por el mismo usuario). */
  async adjuntar(u: UsuarioSesion, obraId: string, id: string, dto: ArchivoPlanillaDto) {
    await asegurarAccesoObra(this.db, u, obraId);
    await enTransaccion(this.db, u.id, async (m) => {
      const c = await this.cabecera(m, obraId, id, true);
      if (!['APROBADA', 'PAGADA'].includes(c.estado))
        throw new ConflictException('La planilla firmada se adjunta cuando está aprobada');
      if (c.creadoPor !== u.id && !tiene(u, 'planillas.estado'))
        throw new ForbiddenException('Solo quien la elaboró o administración adjunta la planilla firmada');
      if (dto.archivoId) {
        const [a] = await m.query(`SELECT 1 FROM archivos WHERE id = $1 AND categoria = 'DOCUMENTO' AND subido_por = $2`, [dto.archivoId, u.id]);
        if (!a) throw new BadRequestException('Archivo no válido (súbelo tú mismo como documento)');
      }
      await m.query(`UPDATE planillas SET archivo_id = $2 WHERE id = $1`, [id, dto.archivoId ?? null]);
      const serie: Serie = { obraId, tipo: c.tipo, obraContratistaId: c.obraContratistaId };
      await this.bitacora.registrar(
        {
          obraId,
          accion: `${dto.archivoId ? 'Adjuntó' : 'Quitó'} la planilla firmada ${await this.nombreSerie(m, serie)} N.º ${c.numero}`,
          usuarioId: u.id,
          entidad: 'PLANILLA',
          entidadId: id,
        },
        m,
      );
    });
    return this.obtener(u, obraId, id);
  }

  /** Excel con el mismo contenido que la planilla impresa. */
  async exportar(u: UsuarioSesion, obraId: string, id: string) {
    const p = await this.obtener(u, obraId, id);
    const filas: (string | number | null)[][] = p.lineas.map((l: ReturnType<PlanillasService['conCalculos']>, i: number) => [
      i + 1, l.descripcion, l.unidad, l.cantidadContrato, l.precioUnitario, r2(l.cantidadContrato * l.precioUnitario),
      l.cantidadAnterior, l.cantidadPeriodo, l.cantidadAcumulada, l.valorAnterior, l.subtotal, l.valorAcumulado,
      l.cantidadContrato > 0 ? r2((l.cantidadAcumulada / l.cantidadContrato) * 100) : null,
    ]);
    const t = p.totales;
    filas.push([]);
    filas.push([null, 'Total sin descuentos', null, null, null, null, null, null, null, null, t.subtotal]);
    filas.push([null, `Descuentos${p.multaDetalle ? ` (${p.multaDetalle})` : ''}`, null, null, null, null, null, null, null, null, t.multa]);
    filas.push([null, 'Total con descuentos', null, null, null, null, null, null, null, null, t.base]);
    filas.push([null, `IVA ${p.ivaPct} %`, null, null, null, null, null, null, null, null, t.iva]);
    filas.push([null, 'Total + IVA', null, null, null, null, null, null, null, null, t.total]);
    const titulo = `Planilla N.º ${p.numero} — ${p.contratistaNombre ?? 'Cliente'} — ${p.obraNombre} (${p.periodoDesde} a ${p.periodoHasta})`;
    const buffer = await generarExcel(
      'Planilla',
      [
        { titulo: 'N.º', ancho: 6, numero: true, decimales: 0 },
        { titulo: 'Descripción', ancho: 46 },
        { titulo: 'Unid.', ancho: 8 },
        { titulo: 'Cantidad contrato', numero: true },
        { titulo: 'P. unitario', numero: true },
        { titulo: 'Subtotal contrato', numero: true },
        { titulo: 'Cant. anterior', numero: true },
        { titulo: 'Cant. actual', numero: true },
        { titulo: 'Cant. acumulada', numero: true },
        { titulo: 'Valor anterior', numero: true },
        { titulo: 'Valor actual', numero: true },
        { titulo: 'Valor acumulado', numero: true },
        { titulo: '% ejecución', numero: true },
      ],
      filas,
      titulo,
    );
    const quien = (p.contratistaNombre ?? 'cliente').replace(/[^\w-]+/g, '_').slice(0, 40);
    await this.bitacora.registrar({
      obraId,
      accion: `Exportó a Excel la planilla ${p.tipo === 'CLIENTE' ? 'al cliente' : `de ${p.contratistaNombre}`} N.º ${p.numero}`,
      usuarioId: u.id,
      entidad: 'PLANILLA',
      entidadId: id,
    });
    return { buffer, nombre: `planilla_${p.numero}_${quien}.xlsx` };
  }

  /** Bandeja: planillas presentadas cuyo siguiente paso está designado al usuario. */
  async pendientes(u: UsuarioSesion) {
    if (!tiene(u, 'planillas.firmar')) return [];
    return this.db.query(
      `SELECT 'PLANILLA' AS tipo, p.id AS "planillaId", p.obra_id AS "obraId", o.nombre AS "obraNombre", p.numero,
              p.tipo AS "tipoPlanilla", c.razon_social AS "contratistaNombre", f.rol_firma AS rol, f.etiqueta,
              to_char(p.periodo_desde, 'YYYY-MM-DD') AS "periodoDesde", to_char(p.periodo_hasta, 'YYYY-MM-DD') AS "periodoHasta",
              t.total::float
         FROM planillas p JOIN obras o ON o.id = p.obra_id AND o.eliminado_en IS NULL
         JOIN vw_planilla_totales t ON t.planilla_id = p.id
         LEFT JOIN obra_contratistas oc ON oc.id = p.obra_contratista_id LEFT JOIN contratistas c ON c.id = oc.contratista_id
         JOIN LATERAL (SELECT rol_firma, etiqueta, designado_id FROM firmas
                        WHERE entidad_tipo = 'PLANILLA' AND entidad_id = p.id AND firmado_en IS NULL ORDER BY orden LIMIT 1) f ON TRUE
        WHERE p.estado = 'PRESENTADA' AND f.designado_id = $1
        ORDER BY p.estado_en`,
      [u.id],
    );
  }

  // =================================================================== cálculo

  /**
   * Líneas de la planilla:
   *  - anterior: acumulado de la planilla previa de la serie (en la primera se puede indicar lo planillado fuera de la app);
   *  - app: avances del período (cliente: todos; contratista: solo los suyos);
   *  - período: lo indicado, o lo que ya tenía si se había corregido, o lo de la app;
   *  - precio: cliente = contrato; contratista = subcontrato (indicado, el guardado, el de la planilla previa o el registrado).
   */
  private async calcularLineas(
    m: Db,
    serie: Serie,
    desde: string,
    hasta: string,
    previaId: string | null,
    existentes: Map<string, LineaCalc> | null,
    dados: LineaPlanillaDto[] | undefined,
  ): Promise<LineaCalc[]> {
    const ids = (dados ?? []).map((d) => d.obraRubroId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Hay rubros repetidos en las líneas');
    const ctr = serie.tipo === 'CONTRATISTA';
    const filas: (LineaCalc & { previo: number | null; puPrevio: number | null; puRegistrado: number | null })[] = await m.query(
      `WITH prev AS (SELECT obra_rubro_id, (cantidad_anterior + cantidad_periodo) AS q, precio_unitario AS pu
                       FROM planilla_lineas WHERE planilla_id = $5),
            per AS (SELECT obra_rubro_id, SUM(cantidad) AS q FROM avances
                     WHERE obra_id = $1 AND anulado_en IS NULL AND fecha BETWEEN $3 AND $4
                       AND ($2::uuid IS NULL OR obra_contratista_id = $2) GROUP BY 1),
            hasta AS (SELECT obra_rubro_id, SUM(cantidad) AS q FROM avances
                       WHERE obra_id = $1 AND anulado_en IS NULL AND fecha <= $4
                         AND ($2::uuid IS NULL OR obra_contratista_id = $2) GROUP BY 1)
       SELECT r.id AS "obraRubroId", r.codigo, r.descripcion, r.unidad, r.cantidad::float AS "cantidadContrato",
              r.precio_unitario::float AS "precioUnitario", COALESCE(prev.q, 0)::float AS "cantidadAnterior",
              COALESCE(per.q, 0)::float AS "cantidadApp", COALESCE(per.q, 0)::float AS "cantidadPeriodo",
              prev.q::float AS previo, prev.pu::float AS "puPrevio", ocp.precio_unitario::float AS "puRegistrado"
         FROM obra_rubros r
         LEFT JOIN prev ON prev.obra_rubro_id = r.id
         LEFT JOIN per ON per.obra_rubro_id = r.id
         LEFT JOIN hasta ON hasta.obra_rubro_id = r.id
         LEFT JOIN obra_contratista_precios ocp ON ocp.obra_contratista_id = $2 AND ocp.obra_rubro_id = r.id
        WHERE r.obra_id = $1
          AND (NOT $6 OR prev.obra_rubro_id IS NOT NULL OR hasta.q > 0 OR ocp.obra_rubro_id IS NOT NULL OR r.id = ANY($7::uuid[])
               OR r.id = ANY($8::uuid[]))
        ORDER BY r.orden, r.created_at`,
      [serie.obraId, serie.obraContratistaId, desde, hasta, previaId, ctr, ids, [...(existentes?.keys() ?? [])]],
    );
    const porId = new Map(filas.map((f) => [f.obraRubroId, f]));
    for (const d of dados ?? []) {
      if (!porId.has(d.obraRubroId)) throw new BadRequestException('Hay líneas con rubros que no son de esta obra');
      if (d.precioUnitario != null && !ctr)
        throw new BadRequestException('En la planilla al cliente el precio es el del contrato (edítalo en Rubros)');
      if (d.cantidadAnterior != null && previaId)
        throw new BadRequestException('La cantidad anterior sale de la planilla previa; solo la primera la acepta');
    }
    return filas.map((f) => {
      const d = dados?.find((x) => x.obraRubroId === f.obraRubroId);
      const e = existentes?.get(f.obraRubroId);
      // Período: lo indicado; si no, lo corregido antes (si difería de la app de entonces); si no, la app
      const corregido = e && Math.abs(e.cantidadPeriodo - e.cantidadApp) > EPS;
      const cantidadPeriodo = d?.cantidadPeriodo ?? (corregido ? e!.cantidadPeriodo : f.cantidadApp);
      const cantidadAnterior = previaId ? f.cantidadAnterior : (d?.cantidadAnterior ?? e?.cantidadAnterior ?? 0);
      const precioUnitario = ctr
        ? (d?.precioUnitario ?? e?.precioUnitario ?? f.puPrevio ?? f.puRegistrado ?? 0)
        : f.precioUnitario;
      return {
        obraRubroId: f.obraRubroId,
        codigo: f.codigo,
        descripcion: f.descripcion,
        unidad: f.unidad,
        cantidadContrato: f.cantidadContrato,
        precioUnitario,
        cantidadAnterior,
        cantidadPeriodo,
        cantidadApp: f.cantidadApp,
      };
    });
  }

  private async guardarLineas(m: EntityManager, planillaId: string, serie: Serie, lineas: LineaCalc[]) {
    await m.query(`DELETE FROM planilla_lineas WHERE planilla_id = $1`, [planillaId]);
    for (const l of lineas) {
      await m.query(
        `INSERT INTO planilla_lineas (planilla_id, obra_rubro_id, codigo, descripcion, unidad, cantidad_contrato, precio_unitario,
                                      cantidad_anterior, cantidad_periodo, cantidad_app)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          planillaId, l.obraRubroId, l.codigo, l.descripcion.slice(0, 300), l.unidad, l.cantidadContrato, l.precioUnitario,
          l.cantidadAnterior, l.cantidadPeriodo, l.cantidadApp,
        ],
      );
      // El precio de subcontrato se recuerda para las próximas planillas del contratista
      if (serie.tipo === 'CONTRATISTA' && l.precioUnitario > 0)
        await m.query(
          `INSERT INTO obra_contratista_precios (obra_contratista_id, obra_rubro_id, precio_unitario) VALUES ($1, $2, $3)
           ON CONFLICT (obra_contratista_id, obra_rubro_id) DO UPDATE SET precio_unitario = EXCLUDED.precio_unitario
           WHERE obra_contratista_precios.precio_unitario IS DISTINCT FROM EXCLUDED.precio_unitario`,
          [serie.obraContratistaId, l.obraRubroId, l.precioUnitario],
        );
    }
  }

  private async lineasGuardadas(m: Db, planillaId: string) {
    const filas: LineaCalc[] = await m.query(
      `SELECT obra_rubro_id AS "obraRubroId", codigo, descripcion, unidad, cantidad_contrato::float AS "cantidadContrato",
              precio_unitario::float AS "precioUnitario", cantidad_anterior::float AS "cantidadAnterior",
              cantidad_periodo::float AS "cantidadPeriodo", cantidad_app::float AS "cantidadApp"
         FROM planilla_lineas WHERE planilla_id = $1`,
      [planillaId],
    );
    return new Map(filas.map((f) => [f.obraRubroId, f]));
  }

  /** Lo ejecutado hasta la fecha de corte (para comparar con el acumulado). */
  private async cantidadesHasta(db: Db, c: Cabecera, hasta: string) {
    const filas: { id: string; q: number }[] = await db.query(
      `SELECT obra_rubro_id AS id, SUM(cantidad)::float AS q FROM avances
        WHERE obra_id = $1 AND anulado_en IS NULL AND fecha <= $2 AND ($3::uuid IS NULL OR obra_contratista_id = $3) GROUP BY 1`,
      [c.obraId, hasta, c.obraContratistaId],
    );
    return new Map(filas.map((f) => [f.id, f.q]));
  }

  /** Valores, acumulados y alertas de una línea (como plCalc de la app anterior). */
  private conCalculos(l: LineaCalc, tipo: Tipo, corte: number | null) {
    const acumulada = l.cantidadAnterior + l.cantidadPeriodo;
    const alertas: { codigo: string; texto: string }[] = [];
    if (Math.abs(l.cantidadPeriodo - l.cantidadApp) > EPS)
      alertas.push({ codigo: 'DIFIERE_APP', texto: `Difiere de lo registrado en la app (${fmt(l.cantidadApp)}): corrobora` });
    if (corte != null && Math.abs(acumulada - corte) > EPS)
      alertas.push({ codigo: 'CORTE', texto: `El acumulado (${fmt(acumulada)}) no coincide con lo ejecutado hasta el corte (${fmt(corte)})` });
    if (acumulada > l.cantidadContrato + EPS)
      alertas.push({ codigo: 'EXCEDE', texto: `El acumulado supera la cantidad del contrato (${fmt(l.cantidadContrato)})` });
    if (tipo === 'CONTRATISTA' && l.cantidadPeriodo > EPS && l.precioUnitario <= 0)
      alertas.push({ codigo: 'SIN_PRECIO', texto: 'Falta el precio del subcontrato' });
    return {
      ...l,
      cantidadAcumulada: acumulada,
      subtotal: r2(l.cantidadPeriodo * l.precioUnitario),
      valorAnterior: r2(l.cantidadAnterior * l.precioUnitario),
      valorAcumulado: r2(r2(l.cantidadAnterior * l.precioUnitario) + r2(l.cantidadPeriodo * l.precioUnitario)),
      pctEjecucion: l.cantidadContrato > 0 ? acumulada / l.cantidadContrato : null,
      corte,
      alertas,
    };
  }

  private totales(lineas: ReturnType<PlanillasService['conCalculos']>[], multa: number, ivaPct: number) {
    const subtotal = r2(lineas.reduce((s, l) => s + l.subtotal, 0));
    const base = r2(subtotal - multa);
    const iva = r2((base * ivaPct) / 100);
    const anterior = r2(lineas.reduce((s, l) => s + l.valorAnterior, 0));
    return {
      montoContrato: r2(lineas.reduce((s, l) => s + r2(l.cantidadContrato * l.precioUnitario), 0)),
      subtotal,
      multa,
      base,
      iva,
      total: r2(base + iva),
      anterior,
      acumulado: r2(anterior + subtotal),
    };
  }

  // =================================================================== utilidades

  private async serie(db: Db, obraId: string, tipo: Tipo, obraContratistaId?: string): Promise<Serie> {
    if (tipo === 'CLIENTE') {
      if (obraContratistaId) throw new BadRequestException('La planilla al cliente no lleva contratista');
      return { obraId, tipo, obraContratistaId: null };
    }
    if (!obraContratistaId) throw new BadRequestException('Indica el contratista de la planilla');
    const [oc] = await db.query(`SELECT 1 FROM obra_contratistas WHERE id = $1 AND obra_id = $2`, [obraContratistaId, obraId]);
    if (!oc) throw new BadRequestException('El contratista no está en esta obra');
    return { obraId, tipo, obraContratistaId };
  }

  private async abiertaEnSerie(db: Db, s: Serie): Promise<{ numero: number; estado: string } | null> {
    const [p] = await db.query(
      `SELECT numero, estado FROM planillas WHERE obra_id = $1 AND tipo = $2 AND obra_contratista_id IS NOT DISTINCT FROM $3
          AND estado = ANY($4) ORDER BY numero LIMIT 1`,
      [s.obraId, s.tipo, s.obraContratistaId, ABIERTAS],
    );
    return p ?? null;
  }

  /**
   * Número y período: desde = día siguiente al cierre de la planilla previa (o el inicio de la obra / el indicado en la primera);
   * hasta = el indicado o hoy. `actual`: la planilla que se edita (se excluye de la búsqueda de la previa).
   */
  private async siguiente(db: Db, s: Serie, desdeDado?: string, hastaDado?: string, actual?: Cabecera) {
    const [previa] = await db.query(
      `SELECT id, numero, to_char(periodo_hasta + 1, 'YYYY-MM-DD') AS desde, formato FROM planillas
        WHERE obra_id = $1 AND tipo = $2 AND obra_contratista_id IS NOT DISTINCT FROM $3 AND estado <> 'ANULADA'
          AND id IS DISTINCT FROM $4 AND ($5::int IS NULL OR numero < $5)
        ORDER BY numero DESC LIMIT 1`,
      [s.obraId, s.tipo, s.obraContratistaId, actual?.id ?? null, actual?.numero ?? null],
    );
    const [o] = await db.query(
      `SELECT to_char(${HOY}, 'YYYY-MM-DD') AS hoy, to_char(o.fecha_inicio, 'YYYY-MM-DD') AS inicio,
              (SELECT to_char(MIN(fecha), 'YYYY-MM-DD') FROM avances WHERE obra_id = o.id AND anulado_en IS NULL) AS "primerAvance"
         FROM obras o WHERE o.id = $1`,
      [s.obraId],
    );
    const hasta: string = hastaDado ?? o.hoy;
    let desde: string;
    if (previa) {
      if (desdeDado && desdeDado !== previa.desde && desdeDado !== actual?.desde)
        throw new BadRequestException(`El período empieza el ${previa.desde}, el día siguiente al cierre de la planilla N.º ${previa.numero}`);
      desde = previa.desde;
    } else {
      desde = desdeDado ?? ([o.inicio, o.primerAvance].filter(Boolean).sort()[0] as string | undefined) ?? hasta;
    }
    if (hasta > o.hoy) throw new BadRequestException('El período no puede cerrar en una fecha futura');
    if (hasta < desde) throw new BadRequestException(`El período debe cerrar desde el ${desde} en adelante`);
    const numero =
      actual?.numero ??
      (
        await db.query(
          `SELECT COALESCE(MAX(numero), 0)::int + 1 AS n FROM planillas
            WHERE obra_id = $1 AND tipo = $2 AND obra_contratista_id IS NOT DISTINCT FROM $3 AND estado <> 'ANULADA'`,
          [s.obraId, s.tipo, s.obraContratistaId],
        )
      )[0].n;
    return {
      numero: numero as number,
      desde,
      hasta,
      previaId: (previa?.id ?? null) as string | null,
      previaFormato: (previa?.formato ?? null) as Record<string, unknown> | null,
    };
  }

  /** Cabecera y firmas impresas: las de la planilla previa de la serie o las de la app anterior. */
  private async formatoPorDefecto(db: Db, s: Serie, previo: Record<string, unknown> | null, u: UsuarioSesion) {
    if (previo && Object.keys(previo).length) return previo;
    const [o] = await db.query(
      `SELECT o.nombre, o.provincia, o.plazo_texto AS plazo, o.cliente, o.descripcion, sup.nombre AS superintendente,
              (SELECT valor FROM parametros WHERE clave = 'EMPRESA_NOMBRE') AS empresa,
              (SELECT valor FROM parametros WHERE clave = 'PLANILLA_APODERADO') AS apoderado
         FROM obras o LEFT JOIN usuarios sup ON sup.id = o.superintendente_id WHERE o.id = $1`,
      [s.obraId],
    );
    const empresa = o.empresa ?? 'INDUSTRIA ST INNOVA S.A.';
    const apoderado = { nombre: o.apoderado ?? '', cargo: 'APODERADO ESPECIAL', entidad: empresa };
    const sup = { nombre: o.superintendente ?? '', cargo: 'SUPERINTENDENTE DE OBRA', entidad: empresa };
    const base = { proyecto: o.nombre, provincia: o.provincia ?? '', plazo: o.plazo ?? '', descripcion: o.descripcion ?? '', fiscalizacion: '', ampliacion: '', anexo: true };
    if (s.tipo === 'CLIENTE')
      return {
        ...base,
        contratante: o.cliente ?? '',
        contratista: empresa,
        firmas: [apoderado, { nombre: '', cargo: 'GERENTE TÉCNICO', entidad: empresa }, sup, { nombre: '', cargo: 'SUPERVISOR', entidad: o.cliente ?? '' }],
      };
    const [c] = await db.query(
      `SELECT c.razon_social, c.representante_legal FROM obra_contratistas oc JOIN contratistas c ON c.id = oc.contratista_id WHERE oc.id = $1`,
      [s.obraContratistaId],
    );
    return {
      ...base,
      contratante: empresa,
      contratista: c.razon_social,
      firmas: [
        { nombre: c.representante_legal ?? '', cargo: 'CONTRATISTA', entidad: c.razon_social },
        { nombre: u.nombre, cargo: 'RESIDENTE DE OBRA', entidad: empresa },
        sup,
        apoderado,
      ],
    };
  }

  private async cabecera(db: Db, obraId: string, id: string, bloquear = false): Promise<Cabecera> {
    const [c] = await db.query(
      `SELECT id, obra_id AS "obraId", tipo, obra_contratista_id AS "obraContratistaId", numero, estado, creado_por AS "creadoPor",
              to_char(periodo_desde, 'YYYY-MM-DD') AS desde, to_char(periodo_hasta, 'YYYY-MM-DD') AS hasta, formato,
              multa::float AS multa, multa_detalle AS "multaDetalle"
         FROM planillas WHERE id = $1 AND obra_id = $2 ${bloquear ? 'FOR UPDATE' : ''}`,
      [id, obraId],
    );
    if (!c) throw new NotFoundException('Planilla no encontrada');
    return c;
  }

  /** ¿No hay planillas posteriores (no anuladas) en la serie? */
  private async esUltima(db: Db, c: Cabecera) {
    const [x] = await db.query(
      `SELECT 1 FROM planillas WHERE obra_id = $1 AND tipo = $2 AND obra_contratista_id IS NOT DISTINCT FROM $3
          AND estado <> 'ANULADA' AND numero > $4 LIMIT 1`,
      [c.obraId, c.tipo, c.obraContratistaId, c.numero],
    );
    return !x;
  }

  private exigirEditable(u: UsuarioSesion, c: Cabecera) {
    if (!EDITABLES.includes(c.estado))
      throw new ConflictException(
        c.estado === 'PRESENTADA'
          ? 'La planilla está presentada: obsérvala para corregirla'
          : `La planilla está ${c.estado.toLowerCase()} y ya no se edita`,
      );
    if (c.creadoPor !== u.id && !tiene(u, 'planillas.estado'))
      throw new ForbiddenException('Solo quien elaboró la planilla (o administración) puede modificarla');
  }

  private async nombreSerie(db: Db, s: Serie) {
    if (s.tipo === 'CLIENTE') return 'al cliente';
    const [c] = await db.query(
      `SELECT c.razon_social AS n FROM obra_contratistas oc JOIN contratistas c ON c.id = oc.contratista_id WHERE oc.id = $1`,
      [s.obraContratistaId],
    );
    return `de ${c?.n ?? 'contratista'}`;
  }
}

const SELECT_LISTA = `
  SELECT p.id, p.obra_id AS "obraId", p.tipo, p.obra_contratista_id AS "obraContratistaId", c.razon_social AS "contratistaNombre",
         p.numero, to_char(p.periodo_desde, 'YYYY-MM-DD') AS "periodoDesde", to_char(p.periodo_hasta, 'YYYY-MM-DD') AS "periodoHasta",
         p.estado, t.subtotal::float, t.multa::float, t.base::float, t.iva::float, t.total::float, t.alertas::int,
         p.creado_por AS "creadoPor", uc.nombre AS "creadoPorNombre", p.created_at AS "creadoEn", p.updated_at AS "actualizadoEn",
         (p.archivo_id IS NOT NULL) AS "tieneArchivo",
         (SELECT f.etiqueta || ': ' || COALESCE(d.nombre, '—') FROM firmas f LEFT JOIN usuarios d ON d.id = f.designado_id
           WHERE f.entidad_tipo = 'PLANILLA' AND f.entidad_id = p.id AND f.firmado_en IS NULL ORDER BY f.orden LIMIT 1) AS "siguientePaso"
    FROM planillas p
    JOIN vw_planilla_totales t ON t.planilla_id = p.id
    JOIN usuarios uc ON uc.id = p.creado_por
    LEFT JOIN obra_contratistas oc ON oc.id = p.obra_contratista_id
    LEFT JOIN contratistas c ON c.id = oc.contratista_id`;

const fmt = (n: number) => n.toLocaleString('es-EC', { maximumFractionDigits: 4 });

/** Qué cambió en las líneas (cantidad del período, precio, cantidad anterior), rubro por rubro. */
function cambiosLineas(antes: Map<string, LineaCalc>, despues: LineaCalc[]) {
  const out: { campo: string; antes: unknown; despues: unknown }[] = [];
  for (const l of despues) {
    const a = antes.get(l.obraRubroId);
    if (!a) continue;
    const corto = l.descripcion.length > 40 ? l.descripcion.slice(0, 40) + '…' : l.descripcion;
    if (Math.abs(a.cantidadPeriodo - l.cantidadPeriodo) > EPS) out.push({ campo: `${corto}: cantidad`, antes: a.cantidadPeriodo, despues: l.cantidadPeriodo });
    if (Math.abs(a.precioUnitario - l.precioUnitario) > EPS) out.push({ campo: `${corto}: precio`, antes: a.precioUnitario, despues: l.precioUnitario });
    if (Math.abs(a.cantidadAnterior - l.cantidadAnterior) > EPS) out.push({ campo: `${corto}: anterior`, antes: a.cantidadAnterior, despues: l.cantidadAnterior });
  }
  return out;
}

/** Quita espacios sobrantes del formato; deja solo los campos conocidos. */
function limpiarFormato(f?: FormatoDto): Record<string, unknown> {
  if (!f) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined) continue;
    if (typeof v === 'string') out[k] = v.trim();
    else if (k === 'firmas' && Array.isArray(v))
      out[k] = v.map((x) => ({ nombre: x.nombre?.trim() ?? '', cargo: x.cargo?.trim() ?? '', entidad: x.entidad?.trim() ?? '' }));
    else out[k] = v;
  }
  return out;
}
