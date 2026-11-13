import React, { useEffect, useState } from 'react';
import { BsBoxArrowUpRight, BsFileEarmarkPdf } from 'react-icons/bs';
import { habilitacionAPI } from '../../api';
import { abrirArchivo, useArchivoUrl } from '../../hooks/useArchivoUrl';
import { Aviso, Cargando, Modal, btnSecundario } from '../common/Modal';

interface Contrato { archivoId: string; nombre: string; referencia: string | null; fecha: string | null }

/** Visor en modal de un archivo protegido (PDF o imagen), sin salir de la pantalla. */
export const VisorArchivo: React.FC<{ archivoId: string | null; titulo: string; subtitulo?: string; onCerrar: () => void }> = ({ archivoId, titulo, subtitulo, onCerrar }) => {
  const { url, error } = useArchivoUrl(archivoId);
  const [tipo, setTipo] = useState<string>('');
  const [aviso, setAviso] = useState('');
  useEffect(() => {
    if (!url) return;
    fetch(url).then((r) => setTipo(r.headers.get('content-type') ?? '')).catch(() => setTipo(''));
  }, [url]);
  if (!archivoId) return null;
  const abrir = () => abrirArchivo(archivoId).catch((e: Error) => setAviso(e.message));
  return (
    <Modal abierto titulo={titulo} subtitulo={subtitulo} onCerrar={onCerrar} ancho="4xl"
      pie={<><button className={btnSecundario} onClick={abrir}><BsBoxArrowUpRight className="inline mr-1.5" />Abrir en otra pestaña</button><button className={btnSecundario} onClick={onCerrar}>Cerrar</button></>}>
      {aviso && <Aviso tipo="error">{aviso}</Aviso>}
      {error ? <Aviso tipo="error">No se pudo cargar el archivo: puede que ya no esté en el servidor.</Aviso>
        : !url ? <Cargando />
        : tipo.startsWith('image/') ? <img src={url} alt={titulo} className="mx-auto max-h-[75vh] rounded-lg border border-gray-200 object-contain" />
        : <iframe src={url} title={titulo} className="h-[75vh] w-full rounded-lg border border-gray-200 bg-gray-50" />}
    </Modal>
  );
};

/**
 * Barra con el contrato firmado de la obra (requisito de habilitación) y botón para verlo en un modal.
 * Útil al crear rubros, para copiar cantidades y precios del contrato sin cambiar de pestaña.
 */
export const BarraContrato: React.FC<{ obraId: string }> = ({ obraId }) => {
  const [c, setC] = useState<Contrato | null | undefined>(undefined);
  const [ver, setVer] = useState(false);
  useEffect(() => {
    habilitacionAPI
      .obtener(obraId)
      .then((h) => {
        const r = h.requisitos.find((x) => x.codigo === 'CONTRATO');
        setC(r?.archivoId ? { archivoId: r.archivoId, nombre: r.archivoNombre ?? 'Contrato', referencia: r.referencia, fecha: r.fecha } : null);
      })
      .catch(() => setC(null));
  }, [obraId]);
  if (c === undefined) return null;
  return (
    <>
      <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2">
        <BsFileEarmarkPdf className="shrink-0 text-blue-700" />
        <div className="min-w-0 flex-1 text-[11px] text-gray-700">
          {c ? (
            <><b>Contrato firmado</b>{c.referencia ? ` N.º ${c.referencia}` : ''} · <span className="text-gray-500">{c.nombre}</span></>
          ) : (
            <span className="text-gray-500">Aún no se ha subido el contrato firmado en Habilitación.</span>
          )}
        </div>
        {c && (
          <button type="button" className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-blue-700" onClick={() => setVer(true)}>
            Ver contrato
          </button>
        )}
      </div>
      {ver && c && <VisorArchivo archivoId={c.archivoId} titulo="Contrato firmado" subtitulo={[c.referencia && `N.º ${c.referencia}`, c.nombre].filter(Boolean).join(' · ')} onCerrar={() => setVer(false)} />}
    </>
  );
};
