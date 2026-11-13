import React from 'react';
import type { Evaluacion, RendimientoObra } from '../../types';
import { fmtN } from '../ejecucion/comunes';

const CLS: Record<string, string> = {
  ok: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  alerta: 'text-amber-700 bg-amber-50 border-amber-200',
  fuera: 'text-red-700 bg-red-50 border-red-200',
  nd: 'text-gray-500 bg-gray-50 border-gray-200',
};

export const ChipEval: React.FC<{ e: Evaluacion }> = ({ e }) => (
  <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded border whitespace-nowrap ${CLS[e.k]}`}>{e.t}</span>
);

export const varTxt = (v: number | null | undefined) => (v == null ? '' : `${v > 0 ? '+' : ''}${fmtN(v * 100, 1)} %`);

/** Barra real vs. programado: la marca es lo programado. */
export const BarraConsumo: React.FC<{ prog: number; real: number; k: string }> = ({ prog, real, k }) => {
  const mx = Math.max(prog, real) || 1;
  const color = k === 'ok' ? 'bg-emerald-500' : k === 'alerta' ? 'bg-amber-500' : k === 'fuera' ? 'bg-red-500' : 'bg-gray-400';
  return (
    <div className="relative h-2 w-28 rounded-full bg-gray-100" aria-hidden="true">
      <span className={`absolute inset-y-0 left-0 rounded-full ${color}`} style={{ width: `${(real / mx) * 100}%` }} />
      {prog > 0 && <i className="absolute -top-0.5 h-3 w-0.5 bg-gray-800" style={{ left: `${(prog / mx) * 100}%` }} />}
    </div>
  );
};

/** Escala del rendimiento: zona aceptable, zona buena, ideal y el valor medido (como la app anterior). */
export const EscalaRend: React.FC<{ r: RendimientoObra }> = ({ r }) => {
  const { minimo: mn, bueno: bu, ideal: id, maximo: mx, valor: v } = r;
  const pts = [mn, bu, id, mx].filter((x): x is number => x != null);
  if (!pts.length) return null;
  let lo = Math.min(...pts);
  let hi = Math.max(...pts);
  if (v != null) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const pad = (hi - lo || hi || 1) * 0.18;
  lo = Math.max(0, lo - pad);
  hi += pad;
  const P = (x: number) => ((x - lo) / (hi - lo)) * 100;
  const okIni = bu ?? mn ?? lo;
  const okFin = mx ?? hi;
  const etiquetas: { x: number; t: string }[] = [];
  ([[mn, 'mín'], [id, 'ideal'], [mx, 'máx']] as [number | null, string][]).forEach(([x, t]) => {
    if (x == null) return;
    const p = etiquetas.find((z) => z.x === x);
    if (p) p.t += ' / ' + t;
    else etiquetas.push({ x, t });
  });
  // Si dos etiquetas quedan muy juntas, la segunda baja a otra fila
  etiquetas.sort((a, b) => a.x - b.x);
  let ultima = -100;
  let fila = 0;
  const filas = etiquetas.map((z) => {
    fila = P(z.x) - ultima < 16 ? (fila + 1) % 2 : 0;
    ultima = P(z.x);
    return fila;
  });
  return (
    <div className={`relative mt-2 ${filas.some((f) => f) ? 'h-12' : 'h-9'}`} aria-hidden="true">
      <div className="absolute top-2 inset-x-0 h-2 rounded-full bg-red-100" />
      {bu != null && mn != null && <span className="absolute top-2 h-2 bg-amber-200" style={{ left: `${P(mn)}%`, width: `${P(bu) - P(mn)}%` }} />}
      <span className="absolute top-2 h-2 bg-emerald-300" style={{ left: `${P(okIni)}%`, width: `${P(okFin) - P(okIni)}%` }} />
      {id != null && <span className="absolute top-1 h-4 w-0.5 bg-emerald-800" style={{ left: `${P(id)}%` }} />}
      {etiquetas.map((z, i) => (
        <span key={z.x} className={`absolute ${filas[i] ? 'top-8' : 'top-5'} -translate-x-1/2 text-[9px] text-gray-500 whitespace-nowrap`} style={{ left: `${P(z.x)}%` }}>{z.t} {fmtN(z.x, 0)}</span>
      ))}
      {v != null && <span className="absolute top-0.5 h-5 w-1.5 -translate-x-1/2 rounded bg-gray-900" style={{ left: `${P(v)}%` }} />}
    </div>
  );
};

export const rangoTxt = (r: RendimientoObra) =>
  ([['Mínimo', r.minimo], ['Bueno', r.bueno], ['Ideal', r.ideal], ['Máximo', r.maximo]] as [string, number | null][])
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k} ${fmtN(v as number)}`)
    .join('. ');

export const valorRend = (v: number | null) => (v == null ? '—' : fmtN(v, v < 20 ? 2 : 0));

/** Rangos rápidos de fechas (Ecuador). */
export function rangoRapido(k: 'mes' | 'sem' | 'todo'): { desde: string; hasta: string } {
  if (k === 'todo') return { desde: '', hasta: '' };
  const hoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Guayaquil' }));
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (k === 'mes') return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: iso(hoy) };
  const d = new Date(hoy);
  d.setDate(d.getDate() - 6);
  return { desde: iso(d), hasta: iso(hoy) };
}
