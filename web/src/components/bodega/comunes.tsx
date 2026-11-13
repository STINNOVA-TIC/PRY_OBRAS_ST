import React from 'react';
import type { EstadoTransferencia, NivelControl, TipoMovimiento } from '../../types';

export const TIPO_MOV: Record<TipoMovimiento, { texto: string; cls: string }> = {
  INGRESO: { texto: 'Ingreso', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  CONSUMO: { texto: 'Consumo', cls: 'text-blue-700 bg-blue-50 border-blue-200' },
  DEVOLUCION: { texto: 'Salida', cls: 'text-orange-700 bg-orange-50 border-orange-200' },
  AJUSTE: { texto: 'Ajuste', cls: 'text-purple-700 bg-purple-50 border-purple-200' },
  TRANSFERENCIA_SALIDA: { texto: 'Transf. enviada', cls: 'text-gray-700 bg-gray-100 border-gray-200' },
  TRANSFERENCIA_ENTRADA: { texto: 'Transf. recibida', cls: 'text-gray-700 bg-gray-100 border-gray-200' },
};

export const ChipTipoMov: React.FC<{ tipo: TipoMovimiento }> = ({ tipo }) => (
  <span className={`inline-flex text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded border whitespace-nowrap ${TIPO_MOV[tipo].cls}`}>
    {TIPO_MOV[tipo].texto}
  </span>
);

export const ESTADO_TRANSF: Record<EstadoTransferencia, { texto: string; cls: string }> = {
  SOLICITADA: { texto: 'Solicitada', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
  APROBADA: { texto: 'Aprobada', cls: 'text-blue-700 bg-blue-50 border-blue-200' },
  DESPACHADA: { texto: 'En tránsito', cls: 'text-purple-700 bg-purple-50 border-purple-200' },
  RECIBIDA: { texto: 'Recibida', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  ANULADA: { texto: 'Anulada', cls: 'text-gray-500 bg-gray-50 border-gray-200' },
  RECHAZADA: { texto: 'Rechazada sin stock', cls: 'text-red-700 bg-red-50 border-red-200' },
};

export const ChipTransf: React.FC<{ estado: EstadoTransferencia }> = ({ estado }) => (
  <span className={`inline-flex text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded border whitespace-nowrap ${ESTADO_TRANSF[estado].cls}`}>
    {ESTADO_TRANSF[estado].texto}
  </span>
);

const CONTROL: Record<NivelControl, string> = {
  OK: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  ATENCION: 'text-amber-700 bg-amber-50 border-amber-200',
  CRITICO: 'text-red-700 bg-red-50 border-red-200',
};
export const ChipControl: React.FC<{ nivel: NivelControl; texto: string }> = ({ nivel, texto }) => (
  <span className={`inline-flex text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded border whitespace-nowrap ${CONTROL[nivel]}`}>{texto}</span>
);
