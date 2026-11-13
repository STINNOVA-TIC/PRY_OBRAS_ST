import React, { useRef, useState } from 'react';
import { BsFileEarmarkPdf, BsImage, BsPaperclip } from 'react-icons/bs';
import { abrirArchivo } from '../../hooks/useArchivoUrl';
import type { EstadoDocumento, EstadoRequisito } from '../../types';

export const fmtFechaHora = (s?: string | null) => {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleString('es-EC', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const CHIP: Record<string, [string, string]> = {
  OK: ['OK', 'text-emerald-700 bg-emerald-50 border-emerald-200'],
  APROBADO: ['Aprobado', 'text-emerald-700 bg-emerald-50 border-emerald-200'],
  FALTA_OK: ['Falta OK', 'text-amber-700 bg-amber-50 border-amber-200'],
  PENDIENTE: ['Pendiente', 'text-amber-700 bg-amber-50 border-amber-200'],
  FALTA_ARCHIVO: ['Falta archivo', 'text-orange-700 bg-orange-50 border-orange-200'],
  SIN_ARCHIVO: ['Sin archivo', 'text-gray-500 bg-gray-50 border-gray-200'],
  RECHAZADO: ['Rechazado', 'text-red-700 bg-red-50 border-red-200'],
  VENCIDO: ['Vencido', 'text-red-700 bg-red-50 border-red-200'],
};

export const ChipEstado: React.FC<{ estado: EstadoRequisito | EstadoDocumento; texto?: string }> = ({ estado, texto }) => {
  const [label, cls] = CHIP[estado] ?? [estado, 'text-gray-500 bg-gray-50 border-gray-200'];
  return (
    <span className={`inline-flex items-center text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded border whitespace-nowrap ${cls}`}>
      {texto ?? label}
    </span>
  );
};

/** Enlace a un archivo protegido: lo abre en otra pestaña con el token. */
export const LinkArchivo: React.FC<{ id: string; nombre?: string | null; onError?: (m: string) => void }> = ({ id, nombre, onError }) => {
  const [abriendo, setAbriendo] = useState(false);
  const esPdf = (nombre ?? '').toLowerCase().endsWith('.pdf');
  return (
    <button
      type="button"
      onClick={async () => {
        setAbriendo(true);
        try {
          await abrirArchivo(id);
        } catch (e) {
          onError?.((e as Error).message);
        } finally {
          setAbriendo(false);
        }
      }}
      className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 hover:text-gray-900 hover:underline max-w-full"
      title={nombre ?? 'Ver archivo'}
    >
      {esPdf ? <BsFileEarmarkPdf className="shrink-0 text-red-500" /> : <BsImage className="shrink-0 text-gray-500" />}
      <span className="truncate">{abriendo ? 'Abriendo...' : nombre || 'Ver archivo'}</span>
    </button>
  );
};

/** Selector de archivo PDF/imagen con nombre visible. */
export const ElegirArchivo: React.FC<{ archivo: File | null; onElegir: (f: File | null) => void; etiqueta?: string }> = ({
  archivo,
  onElegir,
  etiqueta = 'Elegir archivo (PDF o foto)',
}) => {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <input
        ref={ref}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => onElegir(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="whitespace-nowrap px-3 py-2 rounded-lg border border-dashed border-gray-400 text-gray-700 hover:bg-gray-50 text-xs font-semibold"
      >
        <BsPaperclip className="inline mr-1" />
        {archivo ? 'Cambiar' : etiqueta}
      </button>
      {archivo && <span className="text-xs text-gray-600 truncate">{archivo.name}</span>}
    </div>
  );
};

/** Máximo 50 MB (igual que la API). */
export const validarArchivo = (f: File | null): string | null => {
  if (!f) return null;
  if (f.size > 50 * 1024 * 1024) return 'El archivo supera 50 MB';
  if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(f.type)) return 'Solo se aceptan PDF, JPG, PNG o WEBP';
  return null;
};
