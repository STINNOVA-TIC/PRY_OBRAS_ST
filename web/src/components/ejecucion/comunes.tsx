import React from 'react';
import type { NivelAlerta } from '../../types';

/** Número con hasta 2 decimales, formato Ecuador (1.234,56). */
export const fmtN = (n: number | null | undefined, dec = 2) =>
  n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('es-EC', { maximumFractionDigits: dec });

export const fmtPct = (v: number) => `${(v * 100).toLocaleString('es-EC', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** Fecha corta «11 nov 26» (para tablas y Gantt). */
export const fmtFechaCorta = (s?: string | null) => {
  if (!s) return '—';
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });
};

/** Hoy en Ecuador (YYYY-MM-DD). */
export const hoyEC = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date());

/** Barra de avance; en rojo si supera lo contratado. */
export const BarraAvance: React.FC<{ valor: number; className?: string }> = ({ valor, className = '' }) => {
  const excede = valor > 1.0001;
  return (
    <div className={`h-1.5 bg-gray-100 rounded-full overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full ${excede ? 'bg-red-500' : valor >= 1 ? 'bg-emerald-500' : 'bg-gray-800'}`}
        style={{ width: `${Math.min(100, Math.max(0, valor * 100))}%` }}
      />
    </div>
  );
};

const NIVEL: Record<NivelAlerta, [string, string]> = {
  CRITICO: ['Crítico', 'text-red-700 bg-red-50 border-red-200'],
  ATENCION: ['Atención', 'text-amber-700 bg-amber-50 border-amber-200'],
  PENDIENTE: ['Pendiente', 'text-gray-500 bg-gray-50 border-gray-200'],
};

export const ChipNivel: React.FC<{ nivel: NivelAlerta }> = ({ nivel }) => (
  <span className={`inline-flex text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded border whitespace-nowrap ${NIVEL[nivel][1]}`}>
    {NIVEL[nivel][0]}
  </span>
);

/** Abscisa «94+131» → metros (igual que la app original). */
export function abscisaMetros(a: string): number | null {
  const s = a.replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const m = s.match(/^(\d+)\+(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[1]) * 1000 + Number(m[2]);
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Descarga un CSV (separador «;» para Excel en español) sin pasar por el servidor. */
export function descargarCsv(nombre: string, filas: (string | number | null | undefined)[][]) {
  const celda = (v: string | number | null | undefined) => {
    const s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : v;
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Número tecleado con coma o punto → número (o null). */
export const leerNumero = (s: string): number | null => {
  const t = s.trim().replace(/\s/g, '');
  if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : null;
};
