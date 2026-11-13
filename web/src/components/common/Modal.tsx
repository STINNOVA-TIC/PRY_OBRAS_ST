import React, { useEffect } from 'react';
import { BsX } from 'react-icons/bs';

/** Contenedor de modal con el estilo del POS. */
export const Modal: React.FC<{
  abierto: boolean;
  titulo: string;
  subtitulo?: React.ReactNode;
  onCerrar: () => void;
  children: React.ReactNode;
  pie?: React.ReactNode;
  ancho?: 'md' | 'lg' | 'xl' | '3xl' | '4xl';
}> = ({ abierto, titulo, subtitulo, onCerrar, children, pie, ancho = 'lg' }) => {
  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [abierto, onCerrar]);

  if (!abierto) return null;
  const max = { md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', '3xl': 'max-w-3xl', '4xl': 'max-w-5xl' }[ancho];
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 font-sans" onMouseDown={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`bg-white border border-gray-200 rounded-2xl ${max} w-full shadow-2xl text-left max-h-[90vh] flex flex-col`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-start gap-4 bg-gray-50/50 rounded-t-2xl">
          <div>
            <h2 className="text-base font-bold text-gray-800">{titulo}</h2>
            {subtitulo && <p className="text-xs text-gray-500 mt-0.5">{subtitulo}</p>}
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="p-1.5 hover:bg-gray-100 text-gray-400 hover:text-gray-700 rounded-xl transition">
            <BsX className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
        {pie && <div className="px-6 py-3.5 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-2 rounded-b-2xl">{pie}</div>}
      </div>
    </div>
  );
};

export const Campo: React.FC<{ etiqueta: string; children: React.ReactNode; ayuda?: string; className?: string }> = ({
  etiqueta,
  children,
  ayuda,
  className = '',
}) => (
  <label className={`block ${className}`}>
    <span className="block text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-1">{etiqueta}</span>
    {children}
    {ayuda && <span className="block text-[11px] text-gray-400 mt-1">{ayuda}</span>}
  </label>
);

export const inputCls =
  'w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-gray-700 focus:ring-1 focus:ring-gray-700 transition disabled:bg-gray-50 disabled:text-gray-500';

export const btnPrimario =
  'whitespace-nowrap px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50';
export const btnSecundario =
  'whitespace-nowrap px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-semibold transition disabled:opacity-50';
export const btnPeligro =
  'px-4 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold transition disabled:opacity-50';

export const Aviso: React.FC<{ tipo?: 'error' | 'ok' | 'info' | 'alerta'; children: React.ReactNode }> = ({ tipo = 'info', children }) => {
  const cls = {
    error: 'bg-red-50 border-red-200 text-red-700',
    ok: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    info: 'bg-gray-50 border-gray-200 text-gray-700',
    alerta: 'bg-amber-50 border-amber-200 text-amber-800',
  }[tipo];
  return <div className={`p-3 border rounded-lg text-xs font-medium ${cls}`}>{children}</div>;
};

export const Cargando: React.FC<{ texto?: string }> = ({ texto = 'Cargando...' }) => (
  <div className="flex flex-col items-center justify-center py-16 space-y-3 font-sans">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-800" />
    <p className="text-sm text-gray-500 font-medium">{texto}</p>
  </div>
);
