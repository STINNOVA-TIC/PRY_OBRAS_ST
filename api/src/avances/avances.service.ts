import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { planillaQueCubre, textoCierre } from '../planillas/cierre.js';
import { DataSource } from 'typeorm';
import { asegurarAccesoObra, exigirEstado } from '../common/acceso-obra.js';
import { BitacoraService } from '../common/bitacora.service.js';
import { ROL_SUPERADMIN, type UsuarioSesion } from '../common/decorators.js';
import { enTransaccion } from '../common/transaccion.js';
import type { AnularAvanceDto, AvanceDto, ListarAvancesDto } from './avances.dto.js';

/** "Hoy" en Ecuador, que es donde están las obras. */
const HOY = `(now() AT TIME ZONE 'America/Guayaquil')::date`;

/** Abscisa «94+131» → 94131 m. */
export function abscisaMetros(a?: string | null): number | null {
  if (!a) return null;
  const s = a.replace(/\s/g, '').replace(',', '.');
  const m = s.match(/^(\d+)\+(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[1]) * 1000 + Number(m[2]);
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const SELECT_AVANCES = `
  SELECT a.id, a.obra_rubro_id AS "obraRubroId", r.codigo AS "rubroCodigo", r.descripcion AS "rubroDescripcion",
         r.unidad, to_char(a.fecha, 'YYYY-MM-DD') AS fecha, a.cantidad::float,
         (a.cantidad * r.precio_unitario)::float AS monto,
         a.obra_contratista_id AS "obraContratistaId", c.razon_social AS "contratistaNombre",
         a.frente, a.tramo, a.abscisa_desde AS "abscisaDesde", a.abscisa_hasta AS "abscisaHasta",
         a.color, a.tipo_linea AS "tipoLinea", a.num_lineas AS "numLineas", a.nota,
         a.registrado_por AS "registradoPorId", ur.nombre AS "registradoPor", a.created_at AS "creadoEn",
         a.anulado_en AS "anuladoEn", ua.nombre AS "anuladoPor", a.motivo_anulacion AS "motivoAnulacion",
         COALESCE((SELECT json_agg(json_build_object('id', ar.id, 'nombre', ar.nombre_original, 'mime', ar.mime) ORDER BY ar.created_at)
                     FROM avance_evidencias e JOIN archivos ar ON ar.id = e.archivo_id WHERE e.avance_id = a.id), '[]') AS evidencias
    FROM avances a
    JOIN obra_rubros r ON r.id = a.obra_rubro_id
    JOIN usuarios ur ON ur.id = a.registrado_por
    LEFT JOIN usuarios ua ON ua.id = a.anulado_por
    LEFT JOIN obra_contratistas oc ON oc.id = a.obra_contratista_id
    LEFT JOIN contratistas c ON c.id = oc.contratista_id`;

@Injectable()
export class AvancesService {
  constructor(
    private readonly db: DataSource,
    private readonly bitacora: BitacoraService,
  ) {}

  async listar(u: UsuarioSesion, obraId: string, f: ListarAvancesDto) {
    await asegurarAccesoObra(this.db, u, obraId);
    const params: unknown[] = [obraId];
    const where = ['a.obra_id = $1'];
    const add = (sql: string, v: unknown) => {
      params.push(v);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (!f.incluirAnulados) where.push('a.anulado_en IS NULL');
    if (f.rubroId) add('a.obra_rubro_id = ?', f.rubroId);
    if (f.contratista === 'ST') where.push('a.obra_contratista_id IS NULL');
    else if (f.contratista) add('a.obra_contratista_id = ?::uuid', f.contratista);
    if (f.desde) add('a.fecha >= ?', f.desde);
    if (f.hasta) add('a.fecha <= ?', f.hasta);
    const w = where.join(' AND ');
    const [{ total, cantidad, monto }] = await this.db.query(
      `SELECT COUNT(*)::int AS total, COALESCE(SUM(a.cantidad) FILTER (WHERE a.anulado_en IS NULL), 0)::float AS cantidad,
              COALESCE(SUM(a.cantidad * r.precio_unitario) FILTER (WHERE a.anulado_en IS NULL), 0)::float AS monto
         FROM avances a JOIN obra_rubros r ON r.id = a.obra_rubro_id WHERE ${w}`,
      params,
    );
    const limit = f.limit ?? 50;
    const page = f.page ?? 1;
    const data = await this.db.query(
      `${SELECT_AVANCES} WHERE ${w} ORDER BY a.fecha DESC, a.created_at DESC
       LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      params,
    );
    return { data, total, page, limit, sumas: { cantidad, monto } };
  }

  async registrar(u: UsuarioSesion, obraId: string, dto: AvanceDto) {
    const { estado } = await asegurarAccesoObra(this.db, u, obraId);
    exigirEstado(estado, ['ACTIVA'], 'registrar avances');
    const id = await enTransaccion(this.db, u.id, async (m) => {
      const [r] = await m.query(
        `SELECT id, descripcion, unidad, cantidad::float FROM obra_rubros WHERE id = $1 AND obra_id = $2`,
        [dto.obraRubroId, obraId],
      );
      if (!r) throw new BadRequestException('El rubro no pertenece a esta obra');
      const [{ futura, antigua }] = await m.query(
        `SELECT $1::date > ${HOY} AS futura, $1::date < ${HOY} - 366 AS antigua`,
        [dto.fecha],
      );
      if (futura) throw new BadRequestException('La fecha del avance no puede ser futura');
      if (antigua) throw new BadRequestException('La fecha del avance tiene más de un año');
      if (dto.obraContratistaId) {
        const [oc] = await m.query(
          `SELECT 1 FROM obra_contratistas WHERE id = $1 AND obra_id = $2`,
          [dto.obraContratistaId, obraId],
        );
        if (!oc) throw new BadRequestException('El contratista no está en esta obra');
      }
      const cubre = await planillaQueCubre(m, obraId, dto.obraContratistaId ?? null, dto.fecha);
      if (cubre)
        throw new BadRequestException(`${textoCierre(cubre)}: registra el avance con una fecha posterior (o que observen esa planilla)`);
      const d = abscisaMetros(dto.abscisaDesde);
      const h = abscisaMetros(dto.abscisaHasta);
      if (d != null && h != null && h <= d)
        throw new BadRequestException('La abscisa «hasta» debe ser mayor que «desde»');
      const evid = [...new Set(dto.evidencias ?? [])];
      if (evid.length) {
        const ok: { id: string }[] = await m.query(
          `SELECT id FROM archivos WHERE id = ANY($1) AND categoria <> 'FIRMA' AND subido_por = $2`,
          [evid, u.id],
        );
        if (ok.length !== evid.length)
          throw new BadRequestException('Hay evidencias no válidas (súbelas tú mismo antes de registrar)');
      }
      const [{ id }] = await m.query(
        `INSERT INTO avances (obra_id, obra_rubro_id, obra_contratista_id, fecha, cantidad, frente, tramo,
                              abscisa_desde, abscisa_hasta, color, tipo_linea, num_lineas, nota, registrado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [
          obraId,
          dto.obraRubroId,
          dto.obraContratistaId ?? null,
          dto.fecha,
          dto.cantidad,
          dto.frente?.trim() || null,
          dto.tramo?.trim() || null,
          dto.abscisaDesde?.trim() || null,
          dto.abscisaHasta?.trim() || null,
          dto.color ?? null,
          dto.tipoLinea ?? null,
          dto.numLineas ?? null,
          dto.nota?.trim() || null,
          u.id,
        ],
      );
      for (const a of evid)
        await m.query(`INSERT INTO avance_evidencias (avance_id, archivo_id) VALUES ($1, $2)`, [id, a]);
      await this.bitacora.registrar(
        {
          obraId,
          accion: 'Registró avance',
          detalle: `${r.descripcion}: ${dto.cantidad} ${r.unidad} el ${dto.fecha}`,
          usuarioId: u.id,
          entidad: 'AVANCE',
          entidadId: id,
        },
        m,
      );
      return id as string;
    });
    return this.conSaldo(obraId, id);
  }

  /**
   * Anula (no borra) un avance: queda en el historial con quién, cuándo y por qué.
   * Quien lo registró puede anular el suyo; los demás necesitan avances.anular.
   */
  async anular(u: UsuarioSesion, obraId: string, id: string, dto: AnularAvanceDto) {
    const { estado } = await asegurarAccesoObra(this.db, u, obraId);
    exigirEstado(estado, ['ACTIVA', 'PAUSADA'], 'anular avances');
    await enTransaccion(this.db, u.id, async (m) => {
      const [a] = await m.query(
        `SELECT a.registrado_por AS "registradoPor", a.anulado_en AS "anuladoEn", a.cantidad::float,
                a.obra_contratista_id AS "obraContratistaId",
                to_char(a.fecha, 'YYYY-MM-DD') AS fecha, r.descripcion, r.unidad
           FROM avances a JOIN obra_rubros r ON r.id = a.obra_rubro_id
          WHERE a.id = $1 AND a.obra_id = $2 FOR UPDATE OF a`,
        [id, obraId],
      );
      if (!a) throw new NotFoundException('Avance no encontrado');
      if (a.anuladoEn) throw new ConflictException('Este avance ya está anulado');
      const cubre = await planillaQueCubre(m, obraId, a.obraContratistaId, a.fecha);
      if (cubre) throw new ConflictException(`${textoCierre(cubre)}: este avance ya se cobró y no se puede anular`);
      const puede =
        a.registradoPor === u.id ||
        u.roles.includes(ROL_SUPERADMIN) ||
        u.permisos.includes('avances.anular');
      if (!puede) throw new ForbiddenException('Solo quien lo registró o un usuario con permiso puede anular este avance');
      await m.query(
        `UPDATE avances SET anulado_en = now(), anulado_por = $2, motivo_anulacion = $3 WHERE id = $1`,
        [id, u.id, dto.motivo.trim()],
      );
      await this.bitacora.registrar(
        {
          obraId,
          accion: 'Anuló avance',
          detalle: `${a.descripcion}: ${a.cantidad} ${a.unidad} del ${a.fecha}. Motivo: ${dto.motivo.trim()}`,
          usuarioId: u.id,
          entidad: 'AVANCE',
          entidadId: id,
        },
        m,
      );
    });
    return this.conSaldo(obraId, id);
  }

  /** El avance más el estado de su rubro después del cambio. */
  private async conSaldo(obraId: string, id: string) {
    const [avance] = await this.db.query(`${SELECT_AVANCES} WHERE a.id = $1`, [id]);
    const [rubro] = await this.db.query(
      `SELECT r.cantidad::float, v.ejecutado::float, (r.cantidad - v.ejecutado)::float AS saldo,
              (v.avance > 1.0001) AS excede
         FROM obra_rubros r JOIN vw_avance_rubros v ON v.obra_rubro_id = r.id
        WHERE r.id = $1 AND r.obra_id = $2`,
      [avance.obraRubroId, obraId],
    );
    return { avance, rubro };
  }
}
