import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BsCheckCircleFill, BsCloudUpload } from 'react-icons/bs';
import { accesosAPI } from '../../api';
import { mensajeError } from '../../api/client';
import type { CargaPublica } from '../../types';
import { Aviso, Campo, btnPrimario, inputCls } from '../common/Modal';
import logoEmpresa from '../../assets/logo.png';

const EST: Record<string, [string, string]> = {
  PENDIENTE: ['En revisión', 'text-amber-700 bg-amber-50 border-amber-200'],
  APROBADO: ['Aprobado', 'text-emerald-700 bg-emerald-50 border-emerald-200'],
  RECHAZADO: ['Rechazado', 'text-red-700 bg-red-50 border-red-200'],
  REVISADO: ['Revisado', 'text-emerald-700 bg-emerald-50 border-emerald-200'],
};

/** Página pública /carga/:token: quien recibió el enlace sube el documento sin crear cuenta. */
export const PaginaCargaPublica: React.FC = () => {
  const { token = '' } = useParams();
  const [c, setC] = useState<CargaPublica | null>(null);
  const [error, setError] = useState('');
  const [doc, setDoc] = useState('');
  const [vence, setVence] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ok, setOk] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    document.title = 'Cargar documento · ST-OBRAS';
    accesosAPI.verPublico(token).then((x) => { setC(x); if (x.documentos.length === 1) setDoc(x.documentos[0].codigo); }).catch((e) => setError(mensajeError(e, 'Enlace no válido')));
  }, [token]);

  const elegido = c?.documentos.find((d) => d.codigo === doc);
  const subir = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!archivo || !elegido) return;
    setOcupado(true);
    setError('');
    setOk('');
    try {
      const n = await accesosAPI.subirPublico(token, archivo, c?.tipo === 'CONTRATISTA' ? doc : undefined, elegido.vence ? vence : undefined);
      setC(n);
      setArchivo(null);
      setVence('');
      setOk(`«${elegido.nombre}» se subió correctamente. Quedó pendiente de revisión.`);
      (ev.target as HTMLFormElement).reset();
    } catch (e) {
      setError(mensajeError(e, 'No se pudo subir el archivo'));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <img src={logoEmpresa} alt="" className="h-10" />
          <div><div className="text-sm font-bold text-gray-800">Carga de documentos</div><div className="text-[11px] text-gray-500">Industria ST-INNOVA S.A.</div></div>
        </div>
        {!c ? (
          error ? <Aviso tipo="error">{error}</Aviso> : <p className="text-sm text-gray-500">Cargando...</p>
        ) : (
          <>
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <p className="text-xs text-gray-500">Hola <b className="text-gray-800">{c.nombre}</b>: {c.pedidoPor} te pidió cargar {c.tipo === 'DOCUMENTO' ? 'este documento' : `los documentos habilitantes de ${c.contratista}`} para la obra</p>
              <p className="text-base font-bold text-gray-900 mt-1">{c.obra}</p>
              {c.cliente && <p className="text-xs text-gray-500">{c.cliente}</p>}
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
              {c.documentos.map((d) => (
                <div key={d.codigo} className="px-5 py-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="text-sm font-semibold text-gray-800">{d.nombre}</div>
                      {d.adjunto && <div className="text-[11px] text-gray-500">Archivo: {d.adjunto}</div>}
                      <div className="text-[11px] text-gray-400">{d.quedan > 0 ? `Te quedan ${d.quedan} de ${c.maxSubidas} subidas` : 'Sin subidas disponibles'}</div>
                    </div>
                    {d.actual?.estado && EST[d.actual.estado] && (
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${EST[d.actual.estado][1]}`}>{EST[d.actual.estado][0]}</span>
                    )}
                  </div>
                  {d.actual && (
                    <p className="text-[11px] text-gray-500 mt-1"><BsCheckCircleFill className="inline mr-1 text-emerald-600" />Actual: {d.actual.archivo}{d.actual.vence ? ` · vence ${d.actual.vence.split('-').reverse().join('/')}` : ''}</p>
                  )}
                  {d.actual?.estado === 'RECHAZADO' && d.actual.observacion && <p className="text-[11px] text-red-700 mt-1">Observación: {d.actual.observacion}</p>}
                </div>
              ))}
            </div>
            {!c.abierto ? (
              <Aviso tipo="alerta">Tu acceso está cerrado: {c.motivoCierre ?? 'el pedido ya no está activo'}. Gracias.</Aviso>
            ) : (
              <form onSubmit={subir} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
                {c.tipo === 'CONTRATISTA' && (
                  <Campo etiqueta="Documento que vas a subir">
                    <select className={inputCls} value={doc} onChange={(e) => setDoc(e.target.value)} required>
                      <option value="">Elige...</option>
                      {c.documentos.filter((d) => d.quedan > 0).map((d) => <option key={d.codigo} value={d.codigo}>{d.nombre}</option>)}
                    </select>
                  </Campo>
                )}
                {elegido?.vence && (
                  <Campo etiqueta="Fecha de vencimiento del documento"><input type="date" className={inputCls} value={vence} onChange={(e) => setVence(e.target.value)} required /></Campo>
                )}
                <Campo etiqueta="Archivo (PDF o foto, hasta 50 MB)">
                  <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required className="block w-full text-xs" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
                </Campo>
                {error && <Aviso tipo="error">{error}</Aviso>}
                {ok && <Aviso tipo="ok">{ok}</Aviso>}
                <button className={`${btnPrimario} w-full`} disabled={ocupado || !archivo || !elegido || elegido.quedan <= 0}>
                  <BsCloudUpload className="inline mr-1.5" />{ocupado ? 'Subiendo...' : elegido?.actual ? 'Subir corrección' : 'Subir archivo'}
                </button>
                <p className="text-[11px] text-gray-400">El enlace es personal: lo que subas quedará registrado a tu nombre.</p>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
};
