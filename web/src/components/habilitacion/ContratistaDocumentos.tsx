import React, { useEffect, useMemo, useState } from 'react';
import { BsCheck2, BsPlusLg, BsTrash, BsUpload, BsX } from 'react-icons/bs';
import { archivosAPI, contratistasAPI, habilitacionAPI } from '../../api';
import { mensajeError } from '../../api/client';
import { useModal } from '../../context/ModalContext';
import type { Contratista, ContratistaObra, DocumentoContratista, Habilitacion } from '../../types';
import { fmtFecha } from '../common/EstadoChip';
import { Aviso, Campo, Modal, btnPrimario, btnSecundario, inputCls } from '../common/Modal';
import { ChipEstado, ElegirArchivo, LinkArchivo, fmtFechaHora, validarArchivo } from './comunes';

interface Permisos {
  cargar: boolean;
  revisarSig: boolean;
  puedeModificar: boolean; // obra no cerrada
}

/** Contratista de la obra con sus 7 documentos habilitantes. */
export const ContratistaDocumentos: React.FC<{
  obraId: string;
  c: ContratistaObra;
  permisos: Permisos;
  onCambio: (h: Habilitacion) => void;
}> = ({ obraId, c, permisos, onCambio }) => {
  const { showConfirm } = useModal();
  const [subir, setSubir] = useState<DocumentoContratista | null>(null);
  const [rechazar, setRechazar] = useState<DocumentoContratista | null>(null);
  const [error, setError] = useState('');
  const aprobados = c.documentos.filter((d) => d.vigente).length;

  const ejecutar = async (fn: () => Promise<Habilitacion>) => {
    setError('');
    try {
      onCambio(await fn());
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  return (
    <section className={`bg-white border rounded-2xl overflow-hidden ${c.completo ? 'border-emerald-200' : 'border-gray-200'}`}>
      <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-gray-800 truncate">{c.razonSocial}</h3>
          <p className="text-[11px] text-gray-500 truncate">RUC {c.ruc}{c.objeto ? ` · ${c.objeto}` : ''}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[11px] font-bold ${c.completo ? 'text-emerald-700' : 'text-gray-500'}`}>{aprobados}/{c.documentos.length} vigentes</span>
          {permisos.cargar && permisos.puedeModificar && (
            <button
              title="Quitar de la obra"
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
              onClick={async () => {
                if (await showConfirm({ title: 'Quitar contratista', message: `¿Quitar a ${c.razonSocial} de esta obra?`, confirmLabel: 'Quitar', type: 'danger' }))
                  ejecutar(() => habilitacionAPI.quitarContratista(obraId, c.id));
              }}
            >
              <BsTrash />
            </button>
          )}
        </div>
      </div>
      {error && <div className="px-5 pt-3"><Aviso tipo="error">{error}</Aviso></div>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-gray-400 uppercase text-[10px] tracking-wider font-bold">
            <tr>
              <th className="px-5 py-2.5">Documento</th>
              <th className="px-3 py-2.5">Estado</th>
              <th className="px-3 py-2.5">Archivo</th>
              <th className="px-3 py-2.5">Vence</th>
              <th className="px-5 py-2.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {c.documentos.map((d) => (
              <tr key={d.tipoId} className="align-top">
                <td className="px-5 py-3">
                  <div className="font-semibold text-gray-800">{d.nombre}</div>
                  {d.documento?.estado === 'RECHAZADO' && d.documento.observacion && (
                    <div className="text-[11px] text-red-600 mt-0.5">Rechazado: {d.documento.observacion}</div>
                  )}
                  {d.documento && (
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      v{d.documento.version} · cargó {d.documento.cargadoPor} {fmtFechaHora(d.documento.cargadoEn)}
                      {d.documento.revisadoEn && ` · revisó ${d.documento.revisadoPor}`}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3"><ChipEstado estado={d.estado} /></td>
                <td className="px-3 py-3 max-w-[180px]">
                  {d.documento ? <LinkArchivo id={d.documento.archivoId} nombre={d.documento.archivoNombre} onError={setError} /> : <span className="text-gray-300">—</span>}
                </td>
                <td className={`px-3 py-3 whitespace-nowrap ${d.estado === 'VENCIDO' ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                  {d.requiereVence ? fmtFecha(d.documento?.vence) || '—' : <span className="text-gray-300">No aplica</span>}
                </td>
                <td className="px-5 py-3 text-right whitespace-nowrap space-x-1">
                  {permisos.revisarSig && d.documento?.estado === 'PENDIENTE' && (
                    <>
                      <button className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-semibold" onClick={() => ejecutar(() => habilitacionAPI.revisarDocumento(obraId, d.documento!.id, 'APROBADO'))}>
                        <BsCheck2 className="inline" /> Aprobar
                      </button>
                      <button className="px-2.5 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-600 rounded-lg text-[11px] font-semibold" onClick={() => setRechazar(d)}>
                        <BsX className="inline" /> Rechazar
                      </button>
                    </>
                  )}
                  {permisos.cargar && permisos.puedeModificar && (
                    <button className="px-2.5 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-[11px] font-semibold" onClick={() => setSubir(d)}>
                      <BsUpload className="inline mr-1" />{d.documento ? 'Nueva versión' : 'Subir'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ModalSubirDocumento obraId={obraId} oc={c} doc={subir} onCerrar={() => setSubir(null)} onHecho={(h) => { setSubir(null); onCambio(h); }} />
      <ModalRechazar obraId={obraId} doc={rechazar} onCerrar={() => setRechazar(null)} onHecho={(h) => { setRechazar(null); onCambio(h); }} />
    </section>
  );
};

const ModalSubirDocumento: React.FC<{ obraId: string; oc: ContratistaObra; doc: DocumentoContratista | null; onCerrar: () => void; onHecho: (h: Habilitacion) => void }> = ({
  obraId, oc, doc, onCerrar, onHecho,
}) => {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vence, setVence] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    setArchivo(null);
    setVence('');
    setError('');
  }, [doc]);
  if (!doc) return null;
  const hoy = new Date().toISOString().slice(0, 10);

  const guardar = async () => {
    if (!archivo) return setError('Elige el archivo');
    const err = validarArchivo(archivo);
    if (err) return setError(err);
    if (doc.requiereVence && !vence) return setError('Indica la fecha de vencimiento');
    setOcupado(true);
    setError('');
    try {
      const { id } = await archivosAPI.subir(archivo);
      onHecho(await habilitacionAPI.subirDocumento(obraId, oc.id, doc.codigo, id, doc.requiereVence ? vence : undefined));
    } catch (e) {
      setError(mensajeError(e, 'No se pudo subir el documento'));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal abierto titulo={doc.nombre} subtitulo={oc.razonSocial} onCerrar={onCerrar} ancho="md"
      pie={<><button className={btnSecundario} onClick={onCerrar}>Cancelar</button><button className={btnPrimario} onClick={guardar} disabled={ocupado}>{ocupado ? 'Subiendo...' : 'Subir'}</button></>}>
      <div className="space-y-4">
        {doc.documento && <Aviso>Se registrará como versión {doc.documento.version + 1} y quedará pendiente de revisión de SIG.</Aviso>}
        <Campo etiqueta="Archivo (PDF o foto)"><ElegirArchivo archivo={archivo} onElegir={setArchivo} /></Campo>
        {doc.requiereVence && (
          <Campo etiqueta="Fecha de vencimiento"><input type="date" min={hoy} className={inputCls} value={vence} onChange={(e) => setVence(e.target.value)} /></Campo>
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}
      </div>
    </Modal>
  );
};

const ModalRechazar: React.FC<{ obraId: string; doc: DocumentoContratista | null; onCerrar: () => void; onHecho: (h: Habilitacion) => void }> = ({ obraId, doc, onCerrar, onHecho }) => {
  const [obs, setObs] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { setObs(''); setError(''); }, [doc]);
  if (!doc?.documento) return null;
  const guardar = async () => {
    if (obs.trim().length < 3) return setError('Indica el motivo del rechazo');
    try {
      onHecho(await habilitacionAPI.revisarDocumento(obraId, doc.documento!.id, 'RECHAZADO', obs.trim()));
    } catch (e) {
      setError(mensajeError(e));
    }
  };
  return (
    <Modal abierto titulo="Rechazar documento" subtitulo={doc.nombre} onCerrar={onCerrar} ancho="md"
      pie={<><button className={btnSecundario} onClick={onCerrar}>Cancelar</button><button className="whitespace-nowrap px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold" onClick={guardar}>Rechazar</button></>}>
      <div className="space-y-3">
        <Campo etiqueta="Motivo (lo verá quien carga el documento)">
          <textarea className={inputCls} rows={3} value={obs} onChange={(e) => setObs(e.target.value)} autoFocus placeholder="Ej. Certificado del mes anterior" />
        </Campo>
        {error && <Aviso tipo="error">{error}</Aviso>}
      </div>
    </Modal>
  );
};

/** Agregar un contratista existente o registrar uno nuevo y agregarlo. */
export const ModalAgregarContratista: React.FC<{
  abierto: boolean;
  obraId: string;
  yaEnObra: string[];
  puedeCrear: boolean;
  onCerrar: () => void;
  onHecho: (h: Habilitacion) => void;
}> = ({ abierto, obraId, yaEnObra, puedeCrear, onCerrar, onHecho }) => {
  const [lista, setLista] = useState<Contratista[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState('');
  const [objeto, setObjeto] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const [n, setN] = useState({ ruc: '', razonSocial: '', representanteLegal: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!abierto) return;
    setSel(''); setObjeto(''); setNuevo(false); setError(''); setN({ ruc: '', razonSocial: '', representanteLegal: '' });
    contratistasAPI.listar().then(setLista).catch((e) => setError(mensajeError(e)));
  }, [abierto]);

  const disponibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return lista.filter((c) => c.activo && !yaEnObra.includes(c.id) && (!t || c.razonSocial.toLowerCase().includes(t) || c.ruc.includes(t)));
  }, [lista, q, yaEnObra]);

  const guardar = async () => {
    setError('');
    try {
      let id = sel;
      if (nuevo) {
        if (!/^\d{13}$/.test(n.ruc)) return setError('El RUC debe tener 13 dígitos');
        id = (await contratistasAPI.crear({ ruc: n.ruc, razonSocial: n.razonSocial.trim(), ...(n.representanteLegal && { representanteLegal: n.representanteLegal }) })).id;
      }
      if (!id) return setError('Elige un contratista');
      onHecho(await habilitacionAPI.agregarContratista(obraId, id, objeto.trim() || undefined));
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  return (
    <Modal abierto={abierto} titulo="Agregar contratista a la obra" onCerrar={onCerrar}
      pie={<><button className={btnSecundario} onClick={onCerrar}>Cancelar</button><button className={btnPrimario} onClick={guardar}>Agregar</button></>}>
      <div className="space-y-4">
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!nuevo ? (
          <>
            <input className={inputCls} placeholder="Buscar por razón social o RUC..." value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {!disponibles.length && <p className="p-4 text-center text-xs text-gray-400">No hay contratistas disponibles</p>}
              {disponibles.map((c) => (
                <label key={c.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer text-xs ${sel === c.id ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
                  <input type="radio" name="ctr" checked={sel === c.id} onChange={() => setSel(c.id)} />
                  <span className="min-w-0"><span className="block font-bold text-gray-800 truncate">{c.razonSocial}</span><span className="block text-gray-400">RUC {c.ruc}</span></span>
                </label>
              ))}
            </div>
            {puedeCrear && (
              <button type="button" className="text-xs font-semibold text-gray-600 hover:text-gray-900" onClick={() => setNuevo(true)}>
                <BsPlusLg className="inline mr-1" />Registrar un contratista nuevo
              </button>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Campo etiqueta="RUC"><input className={inputCls} value={n.ruc} onChange={(e) => setN({ ...n, ruc: e.target.value.replace(/\D/g, '').slice(0, 13) })} inputMode="numeric" /></Campo>
              <Campo etiqueta="Razón social"><input className={inputCls} value={n.razonSocial} onChange={(e) => setN({ ...n, razonSocial: e.target.value })} /></Campo>
            </div>
            <Campo etiqueta="Representante legal"><input className={inputCls} value={n.representanteLegal} onChange={(e) => setN({ ...n, representanteLegal: e.target.value })} /></Campo>
            <button type="button" className="text-xs font-semibold text-gray-600 hover:text-gray-900" onClick={() => setNuevo(false)}>‹ Elegir uno existente</button>
          </div>
        )}
        <Campo etiqueta="Alcance en esta obra (opcional)"><input className={inputCls} value={objeto} onChange={(e) => setObjeto(e.target.value)} placeholder="Ej. Termoplástico y tachas" /></Campo>
      </div>
    </Modal>
  );
};
