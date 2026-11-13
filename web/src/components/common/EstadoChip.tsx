import React from 'react';
import { ESTADO_OBRA, type EstadoObra } from '../../types';

export const EstadoObraChip: React.FC<{ estado: EstadoObra }> = ({ estado }) => {
  const e = ESTADO_OBRA[estado];
  return (
    <span className={`inline-flex items-center text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded border ${e.clase}`}>
      {e.label}
    </span>
  );
};

export const fmtUSD = (n: number) =>
  '$' + Number(n || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtFecha = (s?: string | null) => {
  if (!s) return '';
  const [y, m, d] = s.slice(0, 10).split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${+d} ${meses[+m - 1]} ${y}`;
};
