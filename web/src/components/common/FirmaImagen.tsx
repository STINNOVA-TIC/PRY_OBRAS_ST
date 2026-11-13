import React from 'react';
import { useArchivoUrl } from '../../hooks/useArchivoUrl';

/** Muestra una imagen de firma protegida (se descarga con el token). */
export const FirmaImagen: React.FC<{ archivoId: string | null | undefined; alt?: string; className?: string }> = ({
  archivoId,
  alt = 'Firma',
  className = 'h-14 object-contain',
}) => {
  const { url, error } = useArchivoUrl(archivoId);
  if (!archivoId) return null;
  if (error) return <span className="text-[11px] text-red-400 italic">No se pudo cargar la firma</span>;
  if (!url) return <span className="inline-block h-10 w-24 rounded bg-gray-100 animate-pulse" />;
  return <img src={url} alt={alt} className={className} />;
};
