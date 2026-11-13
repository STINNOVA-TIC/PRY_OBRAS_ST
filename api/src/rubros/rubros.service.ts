import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { asegurarAccesoObra, exigirEstado } from '../common/acceso-obra.js';
import { BitacoraService } from '../common/bitacora.service.js';
import type { UsuarioSesion } from '../common/decorators.js';
import { enTransaccion } from '../common/transaccion.js';
import { generarExcel, type FilaRubroExcel } from '../common/excel.js';
import type {
  ActualizarRubroDto,
  FilaImportRubroDto,
  ClaseRubro,
  DesdeCatalogoDto,
  InsumoDto,
  RubroDto,
} from './rubros.dto.js';

/** Estados en que se pueden cargar o editar rubros (en habilitación se cargan los de la cotización). */
const ESTADOS_EDICION = ['HABILITACION', 'ACTIVA', 'PAUSADA'];

const sinTilde = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Igual que la app original: «tacha» → TACHAS, «termo» → TERMO; NINGUNA = no aplica. */
export function claseEfectiva(
  clase: ClaseRubro | null,
  descripcion: string,
): 'TERMO' | 'TACHAS' | null {
  if (clase === 'NINGUNA') return null;
  if (clase) return clase;
  const d = sinTilde(descripcion);
  if (/tacha/.test(d)) return 'TACHAS';
  if (/termo/.test(d)) return 'TERMO';
  return null;
}

/** Ancho de línea: el indicado, el escrito en la descripción («10 cm») o 15. */
export function anchoEfectivo(anchoCm: number | null, descripcion: string) {
  if (anchoCm && anchoCm > 0) return anchoCm;
  const m = descripcion.match(/(\d+(?:[.,]\d+)?)\s*cm/i);
  return m ? Number(m[1].replace(',', '.')) : 15;
}

export interface RubroObra {
  id: string;
  catalogoRubroId: number | null;
  codigo: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  clase: ClaseRubro | null;
  anchoCm: number | null;
  orden: number;
  progInicio: string | null;
  progFin: string | null;
  progRendDia: number | null;
  ejecutado: number;
  totalAvances: number;
  insumos: {
    materialId: number;
    codigo: string;
    nombre: string;
    unidad: string;
    cantidadPorUnidad: number;
  }[];
}

const SELECT_RUBROS = `
  SELECT r.id, r.catalogo_rubro_id AS "catalogoRubroId", r.codigo, r.descripcion, r.unidad,
         r.cantidad::float, r.precio_unitario::float AS "precioUnitario", r.clase,
         r.ancho_cm::float AS "anchoCm", r.orden,
         to_char(r.prog_inicio, 'YYYY-MM-DD') AS "progInicio", to_char(r.prog_fin, 'YYYY-MM-DD') AS "progFin",
         r.prog_rend_dia::float AS "progRendDia",
         COALESCE((SELECT SUM(a.cantidad) FROM avances a WHERE a.obra_rubro_id = r.id AND a.anulado_en IS NULL), 0)::float AS ejecutado,
         (SELECT COUNT(*)::int FROM avances a WHERE a.obra_rubro_id = r.id AND a.anulado_en IS NULL) AS "totalAvances",
         COALESCE((SELECT json_agg(json_build_object('materialId', m.id, 'codigo', m.codigo, 'nombre', m.nombre,
                     'unidad', m.unidad, 'cantidadPorUnidad', i.cantidad_por_unidad::float) ORDER BY m.codigo)
                     FROM obra_rubro_insumos i JOIN materiales m ON m.id = i.material_id
                    WHERE i.obra_rubro_id = r.id), '[]') AS insumos
    FROM obra_rubros r`;

@Injectable()
export class RubrosService {
  constructor(
    private readonly db: DataSource,
    private readonly bitacora: BitacoraService,
  ) {}

  /** Rubros con su avance (ejecutado, %, montos, saldo) y los totales de la obra. */
  async listar(u: UsuarioSesion, obraId: string) {
    const { estado } = await asegurarAccesoObra(this.db, u, obraId);
    const rubros = await this.cargar(this.db, obraId);
    const filas = rubros.map((r) => this.conAvance(r));
    const montoContrato = filas.reduce((s, r) => s + r.montoContrato, 0);
    const montoEjecutado = filas.reduce((s, r) => s + r.montoEjecutado, 0);
    return {
      estado,
      rubros: filas,
      totales: {
        montoContrato,
        montoEjecutado,
        avance: montoContrato > 0 ? montoEjecutado / montoContrato : 0,
        saldo: montoContrato - montoEjecutado,
      },
    };
  }

  cargar(db: DataSource | EntityManager, obraId: string): Promise<RubroObra[]> {
    return db.query(
      `${SELECT_RUBROS} WHERE r.obra_id = $1 ORDER BY r.orden, r.created_at`,
      [obraId],
    );
  }

  conAvance(r: RubroObra) {
    const avance = r.cantidad > 0 ? r.ejecutado / r.cantidad : 0;
    return {
      ...r,
      claseEfectiva: claseEfectiva(r.clase, r.descripcion),
      anchoEfectivo: anchoEfectivo(r.anchoCm, r.descripcion),
      avance,
      excede: avance > 1.0001,
      saldo: r.cantidad - r.ejecutado,
      montoContrato: r.cantidad * r.precioUnitario,
      montoEjecutado: r.ejecutado * r.precioUnitario,
    };
  }

  private async obtenerUno(db: DataSource | EntityManager, obraId: string, id: string) {
    const [r] = (await db.query(`${SELECT_RUBROS} WHERE r.obra_id = $1 AND r.id = $2`, [
      obraId,
      id,
    ])) as RubroObra[];
    if (!r) throw new NotFoundException('Rubro no encontrado');
    return r;
  }

  async crear(u: UsuarioSesion, obraId: string, dto: RubroDto) {
    const { estado } = await asegurarAccesoObra(this.db, u, obraId);
    exigirEstado(estado, ESTADOS_EDICION, 'cargar rubros');
    const id = await enTransaccion(this.db, u.id, async (m) => {
      const [{ id }] = await m.query(
        `INSERT INTO obra_rubros (obra_id, codigo, descripcion, unidad, cantidad, precio_unitario, clase, ancho_cm, orden)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                 COALESCE((SELECT MAX(orden) + 1 FROM obra_rubros WHERE obra_id = $1), 0))
         RETURNING id`,
        [
          obraId,
          dto.codigo?.trim() || null,
          dto.descripcion.trim(),
          dto.unidad.trim(),
          dto.cantidad,
          dto.precioUnitario,
          dto.clase ?? null,
          dto.anchoCm ?? null,
        ],
      );
      await this.guardarInsumos(m, id, dto.insumos ?? []);
      await this.bitacora.registrar(
        {
          obraId,
          accion: 'Agregó rubro',
          detalle: `${dto.codigo ? dto.codigo + ' ' : ''}${dto.descripcion.trim()}: ${dto.cantidad} ${dto.unidad} a $${dto.precioUnitario}`,
          usuarioId: u.id,
        },
        m,
      );
      return id as string;
    });
    return this.conAvance(await this.obtenerUno(this.db, obraId, id));
  }

  /** Copia rubros del catálogo con sus insumos y clase; omite los que ya están en la obra. */
  async desdeCatalogo(u: UsuarioSesion, obraId: string, dto: DesdeCatalogoDto) {
    const { estado } = await asegurarAccesoObra(this.db, u, obraId);
    exigirEstado(estado, ESTADOS_EDICION, 'cargar rubros');
    const ids = [...new Set(dto.items.map((i) => i.catalogoRubroId))];
    if (ids.length !== dto.items.length)
      throw new BadRequestException('Hay rubros del catálogo repetidos');
    return enTransaccion(this.db, u.id, async (m) => {
      const cat: { id: number; codigo: string | null; descripcion: string; unidad: string; puRef: number; clase: ClaseRubro | null; activo: boolean }[] =
        await m.query(
          `SELECT id, codigo, descripcion, unidad, pu_ref::float AS "puRef", clase, activo
             FROM catalogo_rubros WHERE id = ANY($1)`,
          [ids],
        );
      const faltan = ids.filter((id) => !cat.some((c) => c.id === id && c.activo));
      if (faltan.length)
        throw new BadRequestException(`Rubros del catálogo no válidos: ${faltan.join(', ')}`);
      const ya: { catalogo_rubro_id: number }[] = await m.query(
        `SELECT catalogo_rubro_id FROM obra_rubros WHERE obra_id = $1 AND catalogo_rubro_id = ANY($2)`,
        [obraId, ids],
      );
      if (ya.length)
        throw new ConflictException(
          `Ya están en la obra: ${ya.map((y) => cat.find((c) => c.id === y.catalogo_rubro_id)?.descripcion).join(', ')}`,
        );
      for (const it of dto.items) {
        const c = cat.find((x) => x.id === it.catalogoRubroId)!;
        const [{ id }] = await m.query(
          `INSERT INTO obra_rubros (obra_id, catalogo_rubro_id, codigo, descripcion, unidad, cantidad, precio_unitario, clase, orden)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                   COALESCE((SELECT MAX(orden) + 1 FROM obra_rubros WHERE obra_id = $1), 0))
           RETURNING id`,
          [obraId, c.id, c.codigo, c.descripcion, c.unidad, it.cantidad, it.precioUnitario ?? c.puRef, c.clase],
        );
        await m.query(
          `INSERT INTO obra_rubro_insumos (obra_rubro_id, material_id, cantidad_por_unidad)
           SELECT $1, material_id, cantidad_por_unidad FROM catalogo_rubro_insumos WHERE catalogo_rubro_id = $2`,
          [id, c.id],
        );
      }
      await this.bitacora.registrar(
        {
          obraId,
          accion: 'Agregó rubros del catálogo',
          detalle: dto.items
            .map((it) => `${cat.find((c) => c.id === it.catalogoRubroId)!.descripcion} (${it.cantidad})`)
            .join('; '),
          usuarioId: u.id,
        },
        m,
      );
      return { agregados: dto.items.length };
    });
  }

  async actualizar(u: UsuarioSesion, obraId: string, id: string, dto: ActualizarRubroDto) {
    const { estado } = await asegurarAccesoObra(this.db, u, obraId);
    exigirEstado(estado, ESTADOS_EDICION, 'editar rubros');
    await enTransaccion(this.db, u.id, async (m) => {
      const antes = await this.obtenerUno(m, obraId, id);
      const nuevo = {
        codigo: dto.codigo !== undefined ? dto.codigo?.trim() || null : antes.codigo,
        descripcion: dto.descripcion?.trim() ?? antes.descripcion,
        unidad: dto.unidad?.trim() ?? antes.unidad,
        cantidad: dto.cantidad ?? antes.cantidad,
        precioUnitario: dto.precioUnitario ?? antes.precioUnitario,
        clase: dto.clase !== undefined ? dto.clase : antes.clase,
        anchoCm: dto.anchoCm !== undefined ? dto.anchoCm : antes.anchoCm,
      };
      await m.query(
        `UPDATE obra_rubros SET codigo = $3, descripcion = $4, unidad = $5, cantidad = $6, precio_unitario = $7,
                clase = $8, ancho_cm = $9
          WHERE id = $2 AND obra_id = $1`,
        [obraId, id, nuevo.codigo, nuevo.descripcion, nuevo.unidad, nuevo.cantidad, nuevo.precioUnitario, nuevo.clase, nuevo.anchoCm],
      );
      const cambios = BitacoraService.diferencias(antes, nuevo, {
        codigo: 'Código',
        descripcion: 'Descripción',
        unidad: 'Unidad',
        cantidad: 'Cantidad contractual',
        precioUnitario: 'Precio unitario',
        clase: 'Clase',
        anchoCm: 'Ancho (cm)',
      });
      if (dto.insumos) {
        await this.guardarInsumos(m, id, dto.insumos);
        const txt = (l: { materialId: number; cantidadPorUnidad: number }[]) =>
          l.map((i) => `${i.materialId}:${i.cantidadPorUnidad}`).sort().join(', ');
        if (txt(antes.insumos) !== txt(dto.insumos))
          cambios.push({ campo: 'Insumos', antes: txt(antes.insumos), despues: txt(dto.insumos) });
      }
      if (cambios.length)
        await this.bitacora.registrar(
          { obraId, accion: 'Editó rubro', detalle: nuevo.descripcion, cambios, usuarioId: u.id },
          m,
        );
    });
    return this.conAvance(await this.obtenerUno(this.db, obraId, id));
  }

  /** Como en la app original: no se elimina un rubro con avances (aunque estén anulados quedan en el historial). */
  async eliminar(u: UsuarioSesion, obraId: string, id: string) {
    const { estado } = await asegurarAccesoObra(this.db, u, obraId);
    exigirEstado(estado, ESTADOS_EDICION, 'eliminar rubros');
    return enTransaccion(this.db, u.id, async (m) => {
      const r = await this.obtenerUno(m, obraId, id);
      const [{ n, pl }] = await m.query(
        `SELECT (SELECT COUNT(*)::int FROM avances WHERE obra_rubro_id = $1) AS n,
                (SELECT COUNT(*)::int FROM planilla_lineas WHERE obra_rubro_id = $1) AS pl`,
        [id],
      );
      if (n > 0)
        throw new ConflictException(
          'Este rubro tiene avances registrados (incluidos anulados): no se puede eliminar. Deja su cantidad en 0 si ya no aplica.',
        );
      if (pl > 0) throw new ConflictException('Este rubro está en planillas: no se puede eliminar');
      await m.query(`DELETE FROM obra_rubros WHERE id = $1`, [id]);
      await this.bitacora.registrar(
        { obraId, accion: 'Eliminó rubro', detalle: `${r.codigo ? r.codigo + ' ' : ''}${r.descripcion}`, usuarioId: u.id },
        m,
      );
      return { eliminado: true };
    });
  }

  async ordenar(u: UsuarioSesion, obraId: string, ids: string[]) {
    const { estado } = await asegurarAccesoObra(this.db, u, obraId);
    exigirEstado(estado, ESTADOS_EDICION, 'ordenar rubros');
    await enTransaccion(this.db, u.id, async (m) => {
      const actuales: { id: string }[] = await m.query(`SELECT id FROM obra_rubros WHERE obra_id = $1`, [obraId]);
      if (actuales.length !== ids.length || !actuales.every((a) => ids.includes(a.id)))
        throw new BadRequestException('La lista debe contener exactamente los rubros de la obra');
      await m.query(
        `UPDATE obra_rubros r SET orden = x.ord - 1
           FROM unnest($2::uuid[]) WITH ORDINALITY AS x(id, ord)
          WHERE r.id = x.id AND r.obra_id = $1`,
        [obraId, ids],
      );
    });
    return this.listar(u, obraId);
  }

  private async guardarInsumos(m: EntityManager, rubroId: string, insumos: InsumoDto[]) {
    const ids = insumos.map((i) => i.materialId);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('Un material está repetido en los insumos');
    if (ids.length) {
      const ok: { id: number }[] = await m.query(
        `SELECT id FROM materiales WHERE id = ANY($1) AND activo`,
        [ids],
      );
      if (ok.length !== ids.length) throw new BadRequestException('Hay materiales no válidos en los insumos');
    }
    await m.query(`DELETE FROM obra_rubro_insumos WHERE obra_rubro_id = $1`, [rubroId]);
    for (const i of insumos)
      await m.query(
        `INSERT INTO obra_rubro_insumos (obra_rubro_id, material_id, cantidad_por_unidad) VALUES ($1, $2, $3)`,
        [rubroId, i.materialId, i.cantidadPorUnidad],
      );
  }

  /** Marca las filas leídas del Excel que ya existen en la obra (mismo código, o misma descripción y unidad). */
  async marcarDuplicados(u: UsuarioSesion, obraId: string, filas: FilaRubroExcel[]) {
    await asegurarAccesoObra(this.db, u, obraId);
    const actuales: { codigo: string | null; descripcion: string; unidad: string }[] = await this.db.query(
      `SELECT codigo, descripcion, unidad FROM obra_rubros WHERE obra_id = $1`,
      [obraId],
    );
    const clave = (d: string, un: string) => `${d.toLowerCase().replace(/\s+/g, ' ').trim()}|${un.toLowerCase()}`;
    const porDesc = new Set(actuales.map((a) => clave(a.descripcion, a.unidad)));
    const porCod = new Set(actuales.filter((a) => a.codigo).map((a) => a.codigo!.toLowerCase()));
    return filas.map((f) => ({
      ...f,
      yaExiste: !!((f.codigo && porCod.has(f.codigo.toLowerCase())) || (f.descripcion && f.unidad && porDesc.has(clave(f.descripcion, f.unidad)))),
    }));
  }

  /**
   * Crea los rubros del presupuesto importado (descripción, unidad, cantidad, precio). Omite los que ya existen
   * en la obra (mismo código, o misma descripción y unidad). La clase se detecta de la descripción.
   */
  async importar(u: UsuarioSesion, obraId: string, filas: FilaImportRubroDto[]) {
    const { estado } = await asegurarAccesoObra(this.db, u, obraId);
    exigirEstado(estado, ESTADOS_EDICION, 'importar rubros');
    const marcadas = await this.marcarDuplicados(u, obraId, filas.map((f, i) => ({
      fila: i + 1, codigo: f.codigo ?? null, descripcion: f.descripcion, unidad: f.unidad, cantidad: f.cantidad, precioUnitario: f.precioUnitario ?? null, errores: [],
    })));
    // Repetidos dentro del mismo archivo
    const vistos = new Set<string>();
    return enTransaccion(this.db, u.id, async (m) => {
      let creados = 0;
      const omitidos: string[] = [];
      for (const [i, f] of filas.entries()) {
        const k = (f.codigo?.trim().toLowerCase() || '') + '|' + f.descripcion.toLowerCase().replace(/\s+/g, ' ').trim() + '|' + f.unidad.toLowerCase();
        if (marcadas[i].yaExiste || vistos.has(k)) {
          omitidos.push(f.descripcion);
          continue;
        }
        vistos.add(k);
        await m.query(
          `INSERT INTO obra_rubros (obra_id, codigo, descripcion, unidad, cantidad, precio_unitario, orden)
           VALUES ($1, $2, $3, $4, $5, $6, COALESCE((SELECT MAX(orden) + 1 FROM obra_rubros WHERE obra_id = $1), 0))`,
          [obraId, f.codigo?.trim() || null, f.descripcion.replace(/\s+/g, ' ').trim(), f.unidad.trim(), f.cantidad, f.precioUnitario ?? 0],
        );
        creados++;
      }
      if (creados)
        await this.bitacora.registrar(
          { obraId, accion: 'Importó rubros desde Excel', detalle: `${creados} rubro(s) creados${omitidos.length ? `, ${omitidos.length} omitido(s) por existir` : ''}`, usuarioId: u.id },
          m,
        );
      return { creados, omitidos };
    });
  }

  /** Rubros con su avance en .xlsx (mismas columnas que el presupuesto, más ejecutado y saldo). */
  async exportar(u: UsuarioSesion, obraId: string) {
    const d = await this.listar(u, obraId);
    const [o] = await this.db.query(`SELECT nombre FROM obras WHERE id = $1`, [obraId]);
    return {
      nombre: o.nombre as string,
      buffer: await generarExcel(
        'Rubros',
        [
          { titulo: 'CODIGO', ancho: 12 }, { titulo: 'DESCRIPCIÓN', ancho: 60 }, { titulo: 'UNIDAD', ancho: 9 },
          { titulo: 'CANTIDAD', numero: true }, { titulo: 'P. UNIT', numero: true }, { titulo: 'P. TOTAL', numero: true },
          { titulo: 'EJECUTADO', numero: true }, { titulo: '% AVANCE', numero: true }, { titulo: 'SALDO', numero: true }, { titulo: 'MONTO EJECUTADO', numero: true },
        ],
        [
          ...d.rubros.map((r) => [r.codigo, r.descripcion, r.unidad, r.cantidad, r.precioUnitario, r.montoContrato, r.ejecutado, Math.round(r.avance * 10000) / 100, r.saldo, r.montoEjecutado]),
          [null, 'TOTAL', null, null, null, d.totales.montoContrato, null, Math.round(d.totales.avance * 10000) / 100, null, d.totales.montoEjecutado],
        ],
        `Rubros de la obra ${o.nombre}`,
      ),
    };
  }
}
