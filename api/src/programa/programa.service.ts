import { BadRequestException, Injectable } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { DataSource } from 'typeorm';
import { asegurarAccesoObra, exigirEstado } from '../common/acceso-obra.js';
import { BitacoraService } from '../common/bitacora.service.js';
import type { UsuarioSesion } from '../common/decorators.js';
import { enTransaccion } from '../common/transaccion.js';

// ---------------------------------------------------------------- DTO
export class ProgRubroDto {
  @IsUUID() obraRubroId!: string;
  @IsOptional() @IsDateString({ strict: true }) inicio?: string | null;
  @IsOptional() @IsDateString({ strict: true }) fin?: string | null;
  /** Rendimiento planificado (unidades del rubro por día hábil). */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) rendDia?: number | null;
}

export class StockMinimoDto {
  @IsInt() @Min(1) materialId!: number;
  /** null = quitar el mínimo fijo (vuelve al cálculo por días de cobertura). */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) cantidad?: number | null;
}

export class ProgramaDto {
  @IsOptional() @IsIn([5, 6, 7]) diasLaborablesSemana?: number;
  @IsOptional() @IsInt() @Min(1) @Max(90) ventanaRitmoDias?: number;
  @IsOptional() @IsInt() @Min(1) @Max(120) diasCobertura?: number;
  @IsOptional() @IsInt() @Min(0) @Max(120) diasEntrega?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => ProgRubroDto)
  rubros?: ProgRubroDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => StockMinimoDto)
  stockMinimo?: StockMinimoDto[];
}

// ---------------------------------------------------------------- fechas (días hábiles)
const DIA = 86_400_000;
const fD = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const sumaDias = (s: string, n: number) => iso(new Date(fD(s).getTime() + n * DIA));
/** 7 = todos; 6 = lunes a sábado; 5 o menos = lunes a viernes. */
const esLab = (d: Date, ds: number) => {
  const w = d.getUTCDay();
  return ds >= 7 || (ds === 6 ? w !== 0 : w !== 0 && w !== 6);
};
/** Días hábiles entre a y b, ambos incluidos. */
export function diasLab(a: string, b: string, ds: number) {
  if (!a || !b || b < a) return 0;
  let n = 0;
  for (let t = fD(a).getTime(), e = fD(b).getTime(); t <= e; t += DIA) if (esLab(new Date(t), ds)) n++;
  return n;
}
/** Fecha que resulta de avanzar n días hábiles desde a. */
export function masLab(a: string, n: number, ds: number) {
  if (n <= 0) return a;
  let t = fD(a).getTime();
  for (let k = 0; k < n; ) {
    t += DIA;
    if (esLab(new Date(t), ds)) k++;
  }
  return iso(new Date(t));
}
const hoyEcuador = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date());

export type Nivel = 'CRITICO' | 'ATENCION' | 'PENDIENTE';
export interface Alerta {
  nivel: Nivel;
  texto: string;
  rubroId?: string;
  materialId?: number;
  nombre: string;
}
const n2 = (v: number) => v.toLocaleString('es-EC', { maximumFractionDigits: 2 });

// ---------------------------------------------------------------- servicio
@Injectable()
export class ProgramaService {
  constructor(
    private readonly db: DataSource,
    private readonly bitacora: BitacoraService,
  ) {}

  /**
   * Programa de ejecución calculado como en la app original:
   * ritmo real = promedio de los últimos N días hábiles; mínimo diario = saldo / días hábiles
   * restantes; fin estimado al ritmo real (o al planificado si aún no hay avances);
   * necesidad de material según insumos × saldo y stock de la bodega de la obra.
   */
  async obtener(u: UsuarioSesion, obraId: string, hoy = hoyEcuador()) {
    await asegurarAccesoObra(this.db, u, obraId);
    const [o] = await this.db.query(
      `SELECT to_char(fecha_inicio, 'YYYY-MM-DD') AS inicio, to_char(fecha_fin, 'YYYY-MM-DD') AS fin,
              dias_laborables_semana AS ds, ventana_ritmo_dias AS ventana, dias_cobertura AS cobertura,
              dias_entrega AS entrega, estado
         FROM obras WHERE id = $1`,
      [obraId],
    );
    const ds: number = o.ds;
    const ini0: string = o.inicio ?? hoy;
    const fin0: string = o.fin ?? sumaDias(ini0, 90);
    const desdeV = sumaDias(hoy, -o.ventana + 1);
    const labV = Math.max(1, diasLab(desdeV, hoy, ds));

    const rubros: {
      id: string; codigo: string | null; descripcion: string; unidad: string; cantidad: number;
      inicio: string | null; fin: string | null; rendDia: number | null;
      ejecutado: number; reciente: number; ultimo: string | null;
      insumos: { materialId: number; cantidadPorUnidad: number }[];
    }[] = await this.db.query(
      `SELECT r.id, r.codigo, r.descripcion, r.unidad, r.cantidad::float,
              to_char(r.prog_inicio, 'YYYY-MM-DD') AS inicio, to_char(r.prog_fin, 'YYYY-MM-DD') AS fin,
              r.prog_rend_dia::float AS "rendDia",
              COALESCE(SUM(a.cantidad), 0)::float AS ejecutado,
              COALESCE(SUM(a.cantidad) FILTER (WHERE a.fecha BETWEEN $2 AND $3), 0)::float AS reciente,
              to_char(MAX(a.fecha), 'YYYY-MM-DD') AS ultimo,
              COALESCE((SELECT json_agg(json_build_object('materialId', i.material_id, 'cantidadPorUnidad', i.cantidad_por_unidad::float))
                          FROM obra_rubro_insumos i WHERE i.obra_rubro_id = r.id), '[]') AS insumos
         FROM obra_rubros r
         LEFT JOIN avances a ON a.obra_rubro_id = r.id AND a.anulado_en IS NULL
        WHERE r.obra_id = $1 AND r.cantidad > 0
        GROUP BY r.id ORDER BY r.orden, r.created_at`,
      [obraId, desdeV, hoy],
    );

    const alertas: Alerta[] = [];
    const filas = rubros.map((r) => {
      const ini = r.inicio ?? ini0;
      const fin = r.fin ?? fin0;
      const rendP = r.rendDia ?? 0;
      const real = r.reciente / labV;
      const saldo = Math.max(0, r.cantidad - r.ejecutado);
      const labRest = diasLab(hoy < ini ? ini : hoy, fin, ds);
      const vencido = saldo > 0 && labRest <= 0;
      const minDia = saldo > 0 && labRest > 0 ? saldo / labRest : 0;
      const ritmo = real > 0 ? real : rendP;
      const finEstimado =
        saldo <= 0 ? (r.ultimo ?? hoy) : ritmo > 0 ? masLab(hoy, Math.ceil(saldo / ritmo), ds) : null;
      const labTot = diasLab(ini, fin, ds);
      const esperado =
        hoy < ini ? 0 : hoy >= fin ? r.cantidad : r.cantidad * Math.min(1, diasLab(ini, hoy, ds) / Math.max(1, labTot));
      const al: { nivel: Nivel; texto: string }[] = [];
      if (saldo > 0) {
        if (vencido) al.push({ nivel: 'CRITICO', texto: `Plazo vencido con saldo de ${n2(saldo)} ${r.unidad}` });
        else {
          if (rendP && rendP < minDia)
            al.push({ nivel: 'CRITICO', texto: `El rendimiento planificado (${n2(rendP)}/día) no alcanza: se necesitan ${n2(minDia)} ${r.unidad}/día` });
          if (hoy >= ini && real < minDia)
            al.push({
              nivel: real >= minDia * 0.8 ? 'ATENCION' : 'CRITICO',
              texto: `Producción bajo el mínimo: ${n2(real)} de ${n2(minDia)} ${r.unidad}/día`,
            });
        }
        if (finEstimado && finEstimado > fin)
          al.push({
            nivel: 'CRITICO',
            texto: `Al ritmo actual termina el ${finEstimado}, ${diasLab(fin, finEstimado, ds) - 1} días hábiles después del plazo`,
          });
        if (!rendP) al.push({ nivel: 'PENDIENTE', texto: 'Falta el rendimiento planificado por día' });
      }
      al.forEach((a) => alertas.push({ ...a, rubroId: r.id, nombre: r.descripcion }));
      return {
        obraRubroId: r.id,
        codigo: r.codigo,
        descripcion: r.descripcion,
        unidad: r.unidad,
        cantidad: r.cantidad,
        ejecutado: r.ejecutado,
        avance: r.cantidad > 0 ? r.ejecutado / r.cantidad : 0,
        inicio: ini,
        fin,
        inicioPropio: r.inicio,
        finPropio: r.fin,
        rendPlanificado: r.rendDia,
        rendReal: real,
        saldo,
        diasHabilesRestantes: labRest,
        minimoDia: vencido ? null : minDia,
        vencido,
        finEstimado,
        esperado,
        atraso: r.ejecutado + 1e-6 < esperado ? esperado - r.ejecutado : 0,
        alertas: al,
        _insumos: r.insumos,
      };
    });

    // --- materiales
    const stockFilas: { materialId: number; stock: number }[] = await this.db.query(
      `SELECT s.material_id AS "materialId", s.cantidad::float AS stock
         FROM stock s JOIN bodegas b ON b.id = s.bodega_id WHERE b.obra_id = $1`,
      [obraId],
    );
    const minFijos: { materialId: number; cantidad: number }[] = await this.db.query(
      `SELECT material_id AS "materialId", cantidad::float FROM obra_stock_minimo WHERE obra_id = $1`,
      [obraId],
    );
    const nec = new Map<number, { necesario: number; consumoDia: number }>();
    for (const f of filas)
      for (const i of f._insumos) {
        const e = nec.get(i.materialId) ?? { necesario: 0, consumoDia: 0 };
        e.necesario += f.saldo * i.cantidadPorUnidad;
        const pace = f.saldo > 0 && !f.vencido ? Math.max(f.minimoDia ?? 0, f.rendPlanificado ?? 0) : 0;
        e.consumoDia += pace * i.cantidadPorUnidad;
        nec.set(i.materialId, e);
      }
    const mats: { id: number; codigo: string; nombre: string; unidad: string }[] = nec.size
      ? await this.db.query(`SELECT id, codigo, nombre, unidad FROM materiales WHERE id = ANY($1) ORDER BY codigo`, [[...nec.keys()]])
      : [];
    const materiales = mats.map((m) => {
      const { necesario, consumoDia } = nec.get(m.id)!;
      const stock = stockFilas.find((s) => s.materialId === m.id)?.stock ?? 0;
      const fijo = minFijos.find((x) => x.materialId === m.id)?.cantidad;
      const minimo = fijo ?? consumoDia * o.cobertura;
      const faltante = Math.max(0, necesario - stock);
      const diasCobertura = consumoDia > 0 ? stock / consumoDia : null;
      const seAgota = diasCobertura != null ? masLab(hoy, Math.floor(diasCobertura), ds) : null;
      const pedirHasta = seAgota ? sumaDias(seAgota, -o.entrega) : null;
      const al: { nivel: Nivel; texto: string }[] = [];
      if (necesario > 0 && stock < minimo)
        al.push({ nivel: 'CRITICO', texto: `Stock bajo el mínimo: ${n2(stock)} de ${n2(minimo)} ${m.unidad}` });
      if (faltante > 0)
        al.push({
          nivel: pedirHasta && pedirHasta <= hoy ? 'CRITICO' : 'ATENCION',
          texto: `Faltan ${n2(faltante)} ${m.unidad} para terminar${pedirHasta ? `. Pedir a producción ${pedirHasta <= hoy ? 'ya' : 'hasta el ' + pedirHasta}` : ''}`,
        });
      al.forEach((a) => alertas.push({ ...a, materialId: m.id, nombre: m.nombre }));
      return {
        materialId: m.id, codigo: m.codigo, nombre: m.nombre, unidad: m.unidad,
        necesario, stock, faltante, consumoDia, minimo, minimoFijo: fijo ?? null,
        seAgota, pedirHasta, alertas: al,
      };
    });

    // --- necesidad semanal al ritmo mínimo requerido (hasta 26 semanas)
    const semanas: { desde: string; cantidades: Record<number, number> }[] = [];
    const finMax = filas.reduce((mx, f) => (f.saldo > 0 && f.fin > mx ? f.fin : mx), hoy);
    for (let d = hoy; finMax > hoy && d <= finMax && semanas.length < 26; d = sumaDias(d, 7)) {
      const e = sumaDias(d, 6);
      const q: Record<number, number> = {};
      for (const f of filas) {
        if (!f.saldo || f.vencido) continue;
        const n = diasLab(d < f.inicio ? f.inicio : d, e > f.fin ? f.fin : e, ds);
        if (n <= 0) continue;
        const pace = Math.max(f.minimoDia ?? 0, f.rendPlanificado ?? 0);
        for (const i of f._insumos) q[i.materialId] = (q[i.materialId] ?? 0) + n * pace * i.cantidadPorUnidad;
      }
      semanas.push({ desde: d, cantidades: q });
    }

    const desde = filas.reduce((mn, f) => (f.inicio < mn ? f.inicio : mn), ini0);
    let hasta = filas.reduce((mx, f) => {
      const e = f.finEstimado && f.finEstimado > f.fin ? f.finEstimado : f.fin;
      return e > mx ? e : mx;
    }, fin0);
    if (hasta < hoy) hasta = hoy;
    const orden: Record<Nivel, number> = { CRITICO: 0, ATENCION: 1, PENDIENTE: 2 };
    return {
      hoy,
      config: {
        fechaInicio: o.inicio,
        fechaFin: o.fin,
        diasLaborablesSemana: ds,
        ventanaRitmoDias: o.ventana,
        diasCobertura: o.cobertura,
        diasEntrega: o.entrega,
      },
      rango: { desde, hasta },
      rubros: filas.map(({ _insumos, ...f }) => f),
      materiales,
      semanas,
      alertas: alertas.sort((a, b) => orden[a.nivel] - orden[b.nivel]),
    };
  }

  async guardar(u: UsuarioSesion, obraId: string, dto: ProgramaDto) {
    const { estado } = await asegurarAccesoObra(this.db, u, obraId);
    exigirEstado(estado, ['HABILITACION', 'ACTIVA', 'PAUSADA'], 'editar el programa');
    await enTransaccion(this.db, u.id, async (m) => {
      const [antes] = await m.query(
        `SELECT dias_laborables_semana AS "diasLaborablesSemana", ventana_ritmo_dias AS "ventanaRitmoDias",
                dias_cobertura AS "diasCobertura", dias_entrega AS "diasEntrega"
           FROM obras WHERE id = $1`,
        [obraId],
      );
      const cambios = BitacoraService.diferencias(antes, dto, {
        diasLaborablesSemana: 'Días de trabajo por semana',
        ventanaRitmoDias: 'Ventana del ritmo real (días)',
        diasCobertura: 'Días de cobertura',
        diasEntrega: 'Días de producción y entrega',
      });
      await m.query(
        `UPDATE obras SET dias_laborables_semana = COALESCE($2, dias_laborables_semana),
                ventana_ritmo_dias = COALESCE($3, ventana_ritmo_dias),
                dias_cobertura = COALESCE($4, dias_cobertura), dias_entrega = COALESCE($5, dias_entrega)
          WHERE id = $1`,
        [obraId, dto.diasLaborablesSemana ?? null, dto.ventanaRitmoDias ?? null, dto.diasCobertura ?? null, dto.diasEntrega ?? null],
      );
      let rubrosCambiados = 0;
      if (dto.rubros?.length) {
        const ids = dto.rubros.map((r) => r.obraRubroId);
        if (new Set(ids).size !== ids.length) throw new BadRequestException('Hay rubros repetidos');
        const propios: { id: string }[] = await m.query(
          `SELECT id FROM obra_rubros WHERE obra_id = $1 AND id = ANY($2)`,
          [obraId, ids],
        );
        if (propios.length !== ids.length) throw new BadRequestException('Hay rubros que no son de esta obra');
        for (const r of dto.rubros) {
          if (r.inicio && r.fin && r.fin < r.inicio)
            throw new BadRequestException('En un rubro la fecha de fin es anterior al inicio');
          const res = await m.query(
            `UPDATE obra_rubros SET prog_inicio = $2, prog_fin = $3, prog_rend_dia = $4
              WHERE id = $1 AND (prog_inicio IS DISTINCT FROM $2::date OR prog_fin IS DISTINCT FROM $3::date
                                 OR prog_rend_dia IS DISTINCT FROM $4::numeric)`,
            [r.obraRubroId, r.inicio ?? null, r.fin ?? null, r.rendDia ?? null],
          );
          rubrosCambiados += Array.isArray(res) ? Number(res[1] ?? 0) : 0;
        }
      }
      for (const s of dto.stockMinimo ?? []) {
        if (s.cantidad == null)
          await m.query(`DELETE FROM obra_stock_minimo WHERE obra_id = $1 AND material_id = $2`, [obraId, s.materialId]);
        else
          await m.query(
            `INSERT INTO obra_stock_minimo (obra_id, material_id, cantidad) VALUES ($1, $2, $3)
             ON CONFLICT (obra_id, material_id) DO UPDATE SET cantidad = EXCLUDED.cantidad`,
            [obraId, s.materialId, s.cantidad],
          );
      }
      if (cambios.length || rubrosCambiados || dto.stockMinimo?.length)
        await this.bitacora.registrar(
          {
            obraId,
            accion: 'Actualizó el programa',
            detalle: [
              rubrosCambiados ? `${rubrosCambiados} rubro(s) con nuevas fechas o rendimiento` : '',
              dto.stockMinimo?.length ? 'stock mínimo por material' : '',
            ].filter(Boolean).join('; ') || undefined,
            cambios,
            usuarioId: u.id,
          },
          m,
        );
    });
    return this.obtener(u, obraId);
  }
}
