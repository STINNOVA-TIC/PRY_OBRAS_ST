import React, { useCallback, useEffect, useState } from 'react';
import { BsClipboard, BsEnvelope, BsLink45Deg, BsPlusLg, BsWhatsapp } from 'react-icons/bs';
import { accesosAPI } from '../../api';
import { mensajeError } from '../../api/client';
import { useModal } from '../../context/ModalContext';
import type { AccesoExterno, Habilitacion } from '../../types';
import { Aviso, Campo, Modal, btnPrimario, btnSecundario, inputCls } from '../common/Modal';
import { fmtFechaHora } from './comunes';

const urlDe = (a: AccesoExterno) => `${window.location.origin}/carga/${a.token}`;
const queSePide = (a: AccesoExterno) => (a.tipo === 'DOCUMENTO' ? a.requisitoNombre ?? 'Requisito' : `Documentos habilitantes de ${a.contratistaNombre}`);
const mensaje = (a: AccesoExterno, obra: string) =>
  `Hola ${a.nombre}:\n\nIndustria ST-INNOVA S.A. te pide cargar ${a.tipo === 'DOCUMENTO' ? `«${a.requisitoNombre}»` : `los documentos habilitantes de ${a.contratistaNombre}`} para la obra «${obra}».\n\n` +
  `Abre este enlace personal (no necesitas cuenta):\n${urlDe(a)}\n\nCódigo de referencia: ${a.codigo}\n` +
  `Puedes subir y corregir cada archivo hasta ${a.maxIntentos} veces. No compartas el enlace: lo que subas queda a tu nombre.`;

/** «Pedir documento por enlace»: requisitos de habilitación o documentos de un contratista, sin crearle cuenta. */
export const AccesosExternos: React.FC<{ h: Habilitacion }> = ({ h }) => {
  const { showConfirm } = useModal();
  const [lista, setLista] = useState<AccesoExterno[] | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [enviar, setEnviar] = useState<AccesoExterno | null>(null);
  const [error, setError] = useState('');
  const cargar = useCallback(() => accesosAPI.listar(h.obra.id).then(setLista).catch((e) => setError(mensajeError(e))), [h.obra.id]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const cancelar = async (a: AccesoExterno) => {
    if (!(await showConfirm({ title: 'Cancelar enlace', message: `${a.nombre} ya no podrá subir archivos con este enlace.`, confirmLabel: 'Cancelar enlace', type: 'danger' }))) return;
    try {
      await accesosAPI.cancelar(h.obra.id, a.id);
      cargar();
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h2 className="text-sm font-bold text-gray-800">Pedir documentos por enlace</h2>
          <p className="text-[11px] text-gray-500">Para quien no tiene cuenta (contadora, ingeniero de MTK, el contratista): recibe un enlace personal y sube el archivo con un número limitado de correcciones. Lo subido queda pendiente de revisión.</p>
        </div>
        <button className={btnSecundario} onClick={() => setNuevo(true)}><BsPlusLg className="inline mr-1.5" />Pedir documento</button>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {lista && lista.length > 0 && (
        <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
          {lista.map((a) => (
            <div key={a.id} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 ${a.estado !== 'ABIERTO' ? 'opacity-60' : ''}`}>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-gray-800">{queSePide(a)}</div>
                <div className="text-[11px] text-gray-500">{a.nombre} · {a.email} · código {a.codigo} · {a.usos} subida{a.usos === 1 ? '' : 's'} · pidió {a.creadoPorNombre} {fmtFechaHora(a.creadoEn)}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${a.estado === 'ABIERTO' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-gray-500 bg-gray-50 border-gray-200'}`}>
                  {a.estado === 'ABIERTO' ? 'Abierto' : a.estado === 'CERRADO' ? 'Agotado' : 'Cancelado'}
                </span>
                {a.estado === 'ABIERTO' && (
                  <>
                    <button className="text-xs font-semibold text-gray-600 hover:text-gray-900" onClick={() => setEnviar(a)}><BsLink45Deg className="inline mr-1" />Enviar</button>
                    <button className="text-xs font-semibold text-red-600 hover:text-red-800" onClick={() => cancelar(a)}>Cancelar</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <ModalNuevoAcceso h={h} abierto={nuevo} onCerrar={() => setNuevo(false)} onCreado={(a) => { setNuevo(false); cargar(); setEnviar(a); }} />
      <ModalEnviar a={enviar} obra={h.obra.nombre} onCerrar={() => setEnviar(null)} />
    </section>
  );
};

const ModalNuevoAcceso: React.FC<{ h: Habilitacion; abierto: boolean; onCerrar: () => void; onCreado: (a: AccesoExterno) => void }> = ({ h, abierto, onCerrar, onCreado }) => {
  const enHab = h.obra.estado === 'HABILITACION';
  const [que, setQue] = useState('');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (!abierto) return;
    setQue('');
    setNombre('');
    setEmail('');
    setError('');
  }, [abierto]);
  if (!abierto) return null;
  const crear = async () => {
    if (!que) return setError('Elige qué documento pides');
    setOcupado(true);
    setError('');
    try {
      const [tipo, valor] = que.split(':');
      const a = await accesosAPI.crear(h.obra.id, {
        tipo: tipo as 'DOCUMENTO' | 'CONTRATISTA',
        requisito: tipo === 'DOCUMENTO' ? valor : undefined,
        obraContratistaId: tipo === 'CONTRATISTA' ? valor : undefined,
        nombre: nombre.trim(),
        email: email.trim(),
      });
      onCreado(a);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };
  return (
    <Modal abierto titulo="Pedir documento por enlace" onCerrar={onCerrar} ancho="md"
      pie={<><button className={btnSecundario} onClick={onCerrar}>Cancelar</button><button className={btnPrimario} onClick={crear} disabled={ocupado}>{ocupado ? 'Creando...' : 'Crear enlace'}</button></>}>
      <div className="space-y-3">
        <Campo etiqueta="Qué se pide">
          <select className={inputCls} value={que} onChange={(e) => setQue(e.target.value)}>
            <option value="">Elige...</option>
            {enHab && <optgroup label="Requisitos administrativos">{h.requisitos.map((r) => <option key={r.codigo} value={`DOCUMENTO:${r.codigo}`}>{r.nombre}</option>)}</optgroup>}
            {h.contratistas.length > 0 && <optgroup label="Documentos de contratista">{h.contratistas.map((c) => <option key={c.id} value={`CONTRATISTA:${c.id}`}>{c.razonSocial}</option>)}</optgroup>}
          </select>
        </Campo>
        <Campo etiqueta="Nombre de quien lo carga"><input className={inputCls} maxLength={150} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Contadora, Ing. de MTK" /></Campo>
        <Campo etiqueta="Correo"><input type="email" className={inputCls} maxLength={150} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></Campo>
        {error && <Aviso tipo="error">{error}</Aviso>}
      </div>
    </Modal>
  );
};

const ModalEnviar: React.FC<{ a: AccesoExterno | null; obra: string; onCerrar: () => void }> = ({ a, obra, onCerrar }) => {
  const [copiado, setCopiado] = useState('');
  if (!a) return null;
  const texto = mensaje(a, obra);
  const copiar = async (t: string, que: string) => {
    try {
      await navigator.clipboard.writeText(t);
      setCopiado(que);
      setTimeout(() => setCopiado(''), 2500);
    } catch {
      setCopiado('No se pudo copiar: selecciona el texto');
    }
  };
  const mailto = `mailto:${encodeURIComponent(a.email)}?subject=${encodeURIComponent(`Carga de documento: ${queSePide(a)}`)}&body=${encodeURIComponent(texto)}`;
  return (
    <Modal abierto titulo="Enviar enlace" subtitulo={`${a.nombre} (${a.email})`} onCerrar={onCerrar} ancho="lg" pie={<button className={btnPrimario} onClick={onCerrar}>Listo</button>}>
      <div className="space-y-3">
        <div className="text-center rounded-xl border border-gray-200 bg-gray-50 py-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Código de referencia</div>
          <div className="text-2xl font-black tracking-[0.2em] text-gray-900">{a.codigo}</div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <a className={`${btnSecundario} text-center`} href={mailto} target="_blank" rel="noopener noreferrer"><BsEnvelope className="inline mr-1.5" />Correo</a>
          <a className={`${btnSecundario} text-center`} href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer"><BsWhatsapp className="inline mr-1.5" />WhatsApp</a>
          <button className={btnSecundario} onClick={() => copiar(urlDe(a), 'Enlace copiado')}><BsClipboard className="inline mr-1.5" />Copiar enlace</button>
        </div>
        <Campo etiqueta="Mensaje">
          <textarea className={inputCls} rows={9} readOnly value={texto} onFocus={(e) => e.target.select()} />
        </Campo>
        <button className="text-xs font-semibold text-gray-600 hover:text-gray-900" onClick={() => copiar(texto, 'Mensaje copiado')}><BsClipboard className="inline mr-1" />Copiar mensaje</button>
        {copiado && <Aviso tipo="ok">{copiado}</Aviso>}
      </div>
    </Modal>
  );
};
