import { DataSource, EntityManager } from 'typeorm';
import { anchoEfectivo, claseEfectiva } from '../rubros/rubros.service.js';

type Db = DataSource | EntityManager;
export type Nivel = 'ok' | 'alerta' | 'fuera' | 'nd';
export interface Evaluacion { k: Nivel; t: string; v?: number | null }

const UNIDAD_CLASE = { TERMO: 'm eq. 15 cm', TACHAS: 'tachas' } as const;
const esArea = (u: string) => /^m(2|²)$/.test(u.trim().toLowerCase());

/** Producción de un avance: el termoplástico se lleva a metros equivalentes de 15 cm (m² ÷ 0,15). */
export function produccion(r: { clase: 'TERMO' | 'TACHAS' | null; unidad: string; ancho: number }, q: number) {
  if (r.clase !== 'TERMO') return q;
  if (esArea(r.unidad)) return q / 0.15;
  return (q * r.ancho) / 15;
}

/** Consumo real frente al programado (avances × insumos), con las tolerancias de los parámetros. */
export function evaluarConsumo(prog: number, real: number, t1: number, t2: number): Evaluacion {
  if (!prog && !real) return { k: 'ok', t: 'Sin movimiento', v: 0 };
  if (!prog) return { k: 'alerta', t: 'Consumo sin programación', v: null };
  const v = (real - prog) / prog;
  const a = Math.abs(v);
  if (a <= t1) return { k: 'ok', t: 'Dentro de lo programado', v };
  if (v > 0) return a <= t2 ? { k: 'alerta', t: 'Sobre lo programado', v } : { k: 'fuera', t: 'Sobreconsumo', v };
  return a <= t2 ? { k: 'alerta', t: 'Bajo lo programado', v } : { k: 'fuera', t: 'Consumo muy bajo', v };
}

export interface CfgRend {
  id: number; codigo: string; nombre: string; tipo: 'REND' | 'DOSIS'; clase: 'TERMO' | 'TACHAS' | null;
  unidad: string; factor: number; unidadBase: string | null; factorBase: number | null;
  minimo: number | null; bueno: number | null; ideal: number | null; maximo: number | null;
  materiales: number[]; base: number[];
}

/** Como la app anterior: fuera del mínimo/máximo; con «bueno», ideal/bueno/aceptable; si no, ideal ±3 %. */
export function evaluarRend(s: CfgRend, v: number): Evaluacion {
  const { minimo: mn, bueno: bu, ideal: id, maximo: mx } = s;
  if (mx != null && v > mx + 1e-9) return { k: 'fuera', t: 'Sobre el máximo' };
  if (mn != null && v < mn - 1e-9) return { k: 'fuera', t: 'Bajo el mínimo' };
  if (bu != null) {
    if (id != null && v >= id) return { k: 'ok', t: 'Ideal' };
    if (v >= bu) return { k: 'ok', t: 'Bueno' };
    return { k: 'alerta', t: 'Aceptable, cerca del mínimo' };
  }
  if (id != null && id > 0 && Math.abs(v - id) / id <= 0.03) return { k: 'ok', t: 'Ideal' };
  return { k: 'ok', t: 'Dentro del rango' };
}

export async function umbrales(db: Db) {
  const filas: { clave: string; valor: string }[] = await db.query(
    `SELECT clave, valor FROM parametros WHERE clave IN ('UMBRAL_ALERTA_PCT','UMBRAL_CRITICO_PCT')`,
  );
  const v = (k: string, d: number) => {
    const n = Number(filas.find((f) => f.clave === k)?.valor);
    return Number.isFinite(n) && n >= 0 ? n : d;
  };
  return { t1: v('UMBRAL_ALERTA_PCT', 5), t2: v('UMBRAL_CRITICO_PCT', 10) };
}

export function configRendimientos(db: Db): Promise<CfgRend[]> {
  return db.query(
    `SELECT r.id, r.codigo, r.nombre, r.tipo, r.clase, r.unidad, r.factor::float, r.unidad_base AS "unidadBase",
            r.factor_base::float AS "factorBase", r.minimo::float, r.bueno::float, r.ideal::float, r.maximo::float,
            COALESCE(array_agg(m.material_id) FILTER (WHERE m.rol = 'MAT'), '{}') AS materiales,
            COALESCE(array_agg(m.material_id) FILTER (WHERE m.rol = 'BASE'), '{}') AS base
       FROM rendimientos r LEFT JOIN rendimiento_materiales m ON m.rendimiento_id = r.id
      WHERE r.activo GROUP BY r.id ORDER BY r.id`,
  );
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Reporte de una obra en un período (como la pestaña Reporte de la app anterior):
 * avance por rubro, consumo real vs. programado por material y por rubro, y rendimientos.
 * desde/hasta null = sin límite.
 */
export async function analizarObra(db: Db, obraId: string, desde: string | null, hasta: string | null, cfg?: { t1: number; t2: number; rend: CfgRend[] }) {
  const { t1, t2 } = cfg ?? (await umbrales(db));
  const rend = cfg?.rend ?? (await configRendimientos(db));
  const enPeriodo = `($2::date IS NULL OR fecha >= $2) AND ($3::date IS NULL OR fecha <= $3)`;

  const rubros: {
    id: string; codigo: string | null; descripcion: string; unidad: string; cantidad: number; pu: number;
    clase: 'TERMO' | 'TACHAS' | 'NINGUNA' | null; anchoCm: number | null; periodo: number; acumulado: number;
  }[] = await db.query(
    `SELECT r.id, r.codigo, r.descripcion, r.unidad, r.cantidad::float, r.precio_unitario::float AS pu, r.clase, r.ancho_cm::float AS "anchoCm",
            COALESCE(SUM(a.cantidad) FILTER (WHERE ($2::date IS NULL OR a.fecha >= $2) AND ($3::date IS NULL OR a.fecha <= $3)), 0)::float AS periodo,
            COALESCE(SUM(a.cantidad) FILTER (WHERE $3::date IS NULL OR a.fecha <= $3), 0)::float AS acumulado
       FROM obra_rubros r LEFT JOIN avances a ON a.obra_rubro_id = r.id AND a.anulado_en IS NULL
      WHERE r.obra_id = $1 GROUP BY r.id ORDER BY r.orden, r.created_at`,
    [obraId, desde, hasta],
  );
  const avDia: { r: string; fecha: string; q: number }[] = await db.query(
    `SELECT obra_rubro_id AS r, to_char(fecha, 'YYYY-MM-DD') AS fecha, SUM(cantidad)::float AS q FROM avances
      WHERE obra_id = $1 AND anulado_en IS NULL AND ${enPeriodo} GROUP BY 1, 2`,
    [obraId, desde, hasta],
  );
  const insumos: { r: string; m: number; q: number }[] = await db.query(
    `SELECT i.obra_rubro_id AS r, i.material_id AS m, i.cantidad_por_unidad::float AS q
       FROM obra_rubro_insumos i JOIN obra_rubros r ON r.id = i.obra_rubro_id WHERE r.obra_id = $1`,
    [obraId],
  );
  const consumos: { m: number; r: string | null; fecha: string; q: number; n: number }[] = await db.query(
    `SELECT mi.material_id AS m, mi.obra_rubro_id AS r, to_char(mi.fecha, 'YYYY-MM-DD') AS fecha, -SUM(mi.cantidad)::float AS q,
            COUNT(*) FILTER (WHERE mi.movimiento_revertido_id IS NULL)::int AS n
       FROM movimientos_inventario mi JOIN bodegas b ON b.id = mi.bodega_id
      WHERE b.obra_id = $1 AND mi.tipo = 'CONSUMO' AND ($2::date IS NULL OR mi.fecha >= $2) AND ($3::date IS NULL OR mi.fecha <= $3)
      GROUP BY 1, 2, 3`,
    [obraId, desde, hasta],
  );
  const mats: { id: number; codigo: string; nombre: string; unidad: string; costo: number }[] = await db.query(
    `SELECT m.id, m.codigo, m.nombre, m.unidad, COALESCE(cm.costo, m.costo_unitario)::float AS costo
       FROM materiales m LEFT JOIN costeo_materiales cm ON cm.material_id = m.id AND cm.obra_id = $1`,
    [obraId],
  );
  const mat = new Map(mats.map((m) => [m.id, m]));

  // ---- avance por rubro
  const filasRubro = rubros.map((r) => ({
    id: r.id, codigo: r.codigo, descripcion: r.descripcion, unidad: r.unidad, cantidad: r.cantidad, pu: r.pu,
    periodo: r.periodo, montoPeriodo: r2(r.periodo * r.pu), acumulado: r.acumulado, montoAcumulado: r2(r.acumulado * r.pu),
    pct: r.cantidad > 0 ? r.acumulado / r.cantidad : null,
  }));
  const contratado = r2(rubros.reduce((s, r) => s + r.cantidad * r.pu, 0));
  const montoPeriodo = r2(filasRubro.reduce((s, r) => s + r.montoPeriodo, 0));
  const montoAcumulado = r2(filasRubro.reduce((s, r) => s + r.montoAcumulado, 0));

  // ---- consumo programado (avances del período × insumos) vs. real (consumos de bodega)
  const periodoDe = new Map(rubros.map((r) => [r.id, r.periodo]));
  const prog = new Map<number, number>();
  const progRM = new Map<string, number>();
  for (const i of insumos) {
    const q = (periodoDe.get(i.r) ?? 0) * i.q;
    prog.set(i.m, (prog.get(i.m) ?? 0) + q);
    progRM.set(`${i.r}|${i.m}`, (progRM.get(`${i.r}|${i.m}`) ?? 0) + q);
  }
  const real = new Map<number, number>();
  const realRM = new Map<string, number>();
  let sinRubro = 0;
  for (const c of consumos) {
    real.set(c.m, (real.get(c.m) ?? 0) + c.q);
    if (c.r) realRM.set(`${c.r}|${c.m}`, (realRM.get(`${c.r}|${c.m}`) ?? 0) + c.q);
    else sinRubro += c.n;
  }
  const requeridos = new Set(insumos.filter((i) => rubros.find((r) => r.id === i.r)!.cantidad > 0).map((i) => i.m));
  const materiales = [...new Set([...prog.keys(), ...real.keys()])]
    .map((id) => {
      const p = prog.get(id) ?? 0;
      const rl = real.get(id) ?? 0;
      let e = evaluarConsumo(p, rl, t1 / 100, t2 / 100);
      if (!p && rl && requeridos.has(id)) e = { k: 'alerta', t: 'Sin avances en el período', v: null };
      const m = mat.get(id);
      return {
        materialId: id, codigo: m?.codigo ?? '', nombre: m?.nombre ?? 'Material', unidad: m?.unidad ?? '',
        programado: p, real: rl, diferencia: rl - p, valorDiferencia: r2((rl - p) * (m?.costo ?? 0)), evaluacion: e,
      };
    })
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
  const desc = new Map(rubros.map((r) => [r.id, r.descripcion]));
  const detalle = [...new Set([...progRM.keys(), ...realRM.keys()])]
    .map((k) => {
      const [rid, mid] = k.split('|');
      const p = progRM.get(k) ?? 0;
      const rl = realRM.get(k) ?? 0;
      const m = mat.get(Number(mid));
      return {
        obraRubroId: rid, rubro: desc.get(rid) ?? 'Rubro eliminado', materialId: Number(mid), material: m?.nombre ?? '', unidad: m?.unidad ?? '',
        programado: p, real: rl, evaluacion: evaluarConsumo(p, rl, t1 / 100, t2 / 100),
      };
    })
    .filter((x) => x.programado || x.real)
    .sort((a, b) => a.rubro.localeCompare(b.rubro) || a.material.localeCompare(b.material));

  // ---- rendimientos: producción de los avances vs. consumo de bodega, por día
  const info = new Map(
    rubros.map((r) => [r.id, { clase: claseEfectiva(r.clase, r.descripcion), unidad: r.unidad, ancho: anchoEfectivo(r.anchoCm, r.descripcion) }]),
  );
  const prodClase: Record<string, Record<string, number>> = {};
  for (const a of avDia) {
    const r = info.get(a.r);
    if (!r?.clase) continue;
    const p = (prodClase[r.clase] ??= {});
    p[a.fecha] = (p[a.fecha] ?? 0) + produccion(r, a.q);
  }
  const consDia: Record<number, Record<string, number>> = {};
  for (const c of consumos) {
    const d = (consDia[c.m] ??= {});
    d[c.fecha] = (d[c.fecha] ?? 0) + c.q;
  }
  const serie = (ids: number[], f: number | null) => {
    const d: Record<string, number> = {};
    for (const m of ids) for (const [k, q] of Object.entries(consDia[m] ?? {})) d[k] = (d[k] ?? 0) + q / (f || 1);
    return d;
  };
  const suma = (x: Record<string, number>) => Object.values(x).reduce((a, b) => a + b, 0);
  const nombres = (ids: number[]) => ids.map((i) => mat.get(i)?.nombre ?? '').filter(Boolean).join(' + ');
  const rendimientos = rend.map((s) => {
    const dosis = s.tipo === 'DOSIS';
    const Ns = dosis ? serie(s.materiales, s.factor) : (prodClase[s.clase ?? ''] ?? {});
    const Ds = dosis ? serie(s.base, s.factorBase) : serie(s.materiales, s.factor);
    const N = suma(Ns);
    const D = suma(Ds);
    const v = N > 0 && D > 0 ? N / D : null;
    const dias = [...new Set([...Object.keys(Ns), ...Object.keys(Ds)])].sort().map((f) => {
      const n = Ns[f] ?? 0;
      const d = Ds[f] ?? 0;
      const vd = n > 0 && d > 0 ? n / d : null;
      return { fecha: f, n, d, v: vd, evaluacion: vd == null ? null : evaluarRend(s, vd) };
    });
    return {
      id: s.id, codigo: s.codigo, nombre: s.nombre, tipo: s.tipo,
      unidadN: dosis ? s.unidad : UNIDAD_CLASE[s.clase ?? 'TERMO'],
      unidadD: dosis ? (s.unidadBase ?? '') : s.unidad,
      materiales: nombres(s.materiales), base: nombres(s.base),
      minimo: s.minimo, bueno: s.bueno, ideal: s.ideal, maximo: s.maximo,
      N, D, valor: v,
      evaluacion: v == null ? ({ k: 'nd', t: N > 0 || D > 0 ? 'Falta producción o consumo para calcular' : 'Sin datos en el período' } as Evaluacion) : evaluarRend(s, v),
      dias,
    };
  });

  return {
    periodo: { desde, hasta },
    umbrales: { t1, t2 },
    totales: { contratado, montoPeriodo, montoAcumulado, pct: contratado > 0 ? montoAcumulado / contratado : 0 },
    rubros: filasRubro,
    materiales,
    detalle,
    sinRubro,
    rendimientos,
  };
}

export type AnalisisObra = Awaited<ReturnType<typeof analizarObra>>;
