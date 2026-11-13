// Generalización de PRY_PUNTO_VENTA/.../productos/ModalFlujoRequerimiento.tsx
// Cada nodo es un paso firmable: etiqueta, firmante designado, firma estampada y fecha.
import React from 'react';
import { BsArrowRight, BsCheckCircleFill, BsClockHistory, BsHourglassSplit, BsPersonExclamation } from 'react-icons/bs';
import { FirmaImagen } from './FirmaImagen';

export interface NodoFirma {
  rol: string;
  etiqueta: string; // "Administrador del contrato"
  designadoNombre?: string | null; // a quién le toca firmar
  firmado?: boolean;
  firmaArchivoId?: string | null; // imagen estampada
  nombreFirmante?: string | null;
  cargoFirmante?: string | null;
  firmadoEn?: string | null;
  esReemplazo?: boolean;
  motivo?: string | null;
  activo?: boolean; // es el turno de este nodo
}

export const formatFechaHora = (fechaStr?: string | null) => {
  if (!fechaStr) return '';
  const f = new Date(fechaStr);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(f.getDate())}/${p(f.getMonth() + 1)}/${f.getFullYear()} ${p(f.getHours())}:${p(f.getMinutes())}`;
};

const NodoTarjeta: React.FC<{ n: NodoFirma; accion?: React.ReactNode }> = ({ n, accion }) => {
  const estado = n.firmado
    ? { texto: n.esReemplazo ? 'Firmado (reemplazo)' : 'Firmado', icono: <BsCheckCircleFill className="h-3 w-3" />, clase: 'text-emerald-600 bg-emerald-50 border-emerald-100' }
    : !n.designadoNombre
      ? { texto: 'Sin designar', icono: <BsPersonExclamation className="h-3 w-3" />, clase: 'text-red-600 bg-red-50 border-red-100' }
      : n.activo
        ? { texto: 'Pendiente', icono: <BsHourglassSplit className="h-3 w-3" />, clase: 'text-amber-600 bg-amber-50 border-amber-100' }
        : { texto: 'En espera', icono: <BsClockHistory className="h-3 w-3" />, clase: 'text-gray-500 bg-gray-50 border-gray-200' };

  return (
    <div
      className={`w-full rounded-2xl border p-4 bg-white shadow-sm flex flex-col justify-between min-h-44 transition-all duration-300 ${
        n.firmado ? 'border-emerald-200 bg-emerald-50/10' : n.activo ? 'border-amber-200 ring-1 ring-amber-100' : 'border-gray-200'
      }`}
    >
      <div className="flex justify-between items-center mb-2 gap-2">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{n.etiqueta}</span>
        <span className={`flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border shrink-0 ${estado.clase}`}>
          {estado.icono} {estado.texto}
        </span>
      </div>

      <div className="flex-1 flex flex-col justify-center items-center py-2 min-h-16">
        {n.firmado ? (
          n.firmaArchivoId ? <FirmaImagen archivoId={n.firmaArchivoId} alt={`Firma ${n.etiqueta}`} /> : <div className="text-[11px] text-gray-400 italic">Firma registrada</div>
        ) : (
          accion ?? <div className="text-[11px] text-gray-400 italic">{n.designadoNombre ? 'Esperando firma' : 'Designa a la persona que firma'}</div>
        )}
      </div>

      <div className="border-t border-gray-100 pt-2 mt-2">
        <div className="font-extrabold text-gray-800 text-[11px] tracking-wide truncate uppercase" title={n.nombreFirmante ?? n.designadoNombre ?? ''}>
          {(n.firmado ? n.nombreFirmante : n.designadoNombre) || '—'}
        </div>
        {n.firmado && n.cargoFirmante && <div className="text-[10px] text-gray-500 truncate">{n.cargoFirmante}</div>}
        <div className="text-[10px] text-gray-400 mt-0.5">{n.firmado ? formatFechaHora(n.firmadoEn) : ' '}</div>
        {n.esReemplazo && n.motivo && <div className="text-[10px] text-amber-700 mt-1">Motivo: {n.motivo}</div>}
      </div>
    </div>
  );
};

/**
 * Flujo horizontal de firmas (como la "Trazabilidad de firmas y aprobaciones" del POS).
 * `paralelo`: todos los nodos pueden firmar en cualquier orden (habilitación). Si no, es secuencial (flechas).
 */
export const FlujoFirmas: React.FC<{
  nodos: NodoFirma[];
  paralelo?: boolean;
  acciones?: Record<string, React.ReactNode>; // botón "Firmar" por rol, si aplica
}> = ({ nodos, paralelo = false, acciones = {} }) => (
  <div className="flex flex-col md:flex-row items-stretch gap-4">
    {nodos.map((n, i) => (
      <React.Fragment key={n.rol}>
        {i > 0 && !paralelo && (
          <div className="hidden md:flex items-center text-gray-300">
            <BsArrowRight className="h-5 w-5" />
          </div>
        )}
        <div className="flex-1">
          <NodoTarjeta n={n} accion={acciones[n.rol]} />
        </div>
      </React.Fragment>
    ))}
  </div>
);
