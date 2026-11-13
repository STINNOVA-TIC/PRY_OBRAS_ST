import React from 'react';
import type { EstadoPlanilla } from '../../types';

export const ESTADO_PL: Record<EstadoPlanilla, [string, string]> = {
  BORRADOR: ['En elaboración', 'text-gray-600 bg-gray-50 border-gray-200'],
  PRESENTADA: ['Presentada', 'text-amber-700 bg-amber-50 border-amber-200'],
  OBSERVADA: ['Observada', 'text-red-700 bg-red-50 border-red-200'],
  APROBADA: ['Aprobada', 'text-emerald-700 bg-emerald-50 border-emerald-200'],
  PAGADA: ['Pagada', 'text-sky-700 bg-sky-50 border-sky-200'],
  ANULADA: ['Anulada', 'text-gray-400 bg-gray-50 border-gray-200 line-through'],
};

export const ChipPlanilla: React.FC<{ estado: EstadoPlanilla }> = ({ estado }) => (
  <span className={`inline-flex text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded border whitespace-nowrap ${ESTADO_PL[estado][1]}`}>
    {ESTADO_PL[estado][0]}
  </span>
);

/** Dinero con 2 decimales (sin símbolo, para tablas densas). */
export const fmt2 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Período «01/11/2026 al 15/11/2026». */
export const fmtPeriodo = (d: string, h: string) => `${fmtDia(d)} al ${fmtDia(h)}`;
export const fmtDia = (s?: string | null) => {
  if (!s) return '—';
  const [y, m, d] = s.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export const KpiPl: React.FC<{ valor: string; etiqueta: string; tono?: 'normal' | 'alerta' }> = ({ valor, etiqueta, tono = 'normal' }) => (
  <div className={`bg-white border rounded-2xl p-4 ${tono === 'alerta' ? 'border-amber-200' : 'border-gray-200'}`}>
    <div className={`text-lg font-black truncate ${tono === 'alerta' ? 'text-amber-700' : 'text-gray-800'}`}>{valor}</div>
    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-1">{etiqueta}</div>
  </div>
);
