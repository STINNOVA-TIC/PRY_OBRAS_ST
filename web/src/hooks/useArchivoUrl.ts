import { useEffect, useState } from 'react';
import { archivosAPI } from '../api';

/**
 * Los archivos (firmas, PDFs) están protegidos por token, así que no sirve un <img src="/api/...">.
 * Este hook los descarga con autenticación y devuelve una URL local (blob:) para mostrarlos.
 */
export function useArchivoUrl(archivoId: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!archivoId) {
      setUrl(null);
      return;
    }
    let vivo = true;
    let creada: string | null = null;
    setError(false);
    archivosAPI
      .blob(archivoId)
      .then((b) => {
        if (!vivo) return;
        creada = URL.createObjectURL(b);
        setUrl(creada);
      })
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [archivoId]);

  return { url, error };
}

/** Abre un archivo protegido (PDF o imagen) en una pestaña nueva. Lanza error si no se pudo. */
export async function abrirArchivo(archivoId: string): Promise<void> {
  const ventana = window.open('', '_blank'); // se abre ya, para que el navegador no la bloquee
  try {
    const b = await archivosAPI.blob(archivoId);
    const url = URL.createObjectURL(b);
    if (ventana) ventana.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    ventana?.close();
    throw new Error('No se pudo abrir el archivo: puede que ya no esté en el servidor');
  }
}
