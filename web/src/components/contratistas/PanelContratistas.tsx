import React, { useEffect, useMemo, useState } from 'react';
import { BsPencil, BsPeople, BsPlusLg } from 'react-icons/bs';
import { contratistasAPI } from '../../api';
import { mensajeError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Contratista } from '../../types';
import { Aviso, Campo, Cargando, Modal, btnPrimario, btnSecundario, inputCls } from '../common/Modal';

/** Registro global de contratistas (su habilitación documental se hace dentro de cada obra). */
export const PanelContratistas: React.FC = () => {
  const { hasPermission } = useAuth();
  const puedeGestionar = hasPermission('contratistas.gestionar');
  const [lista, setLista] = useState<Contratista[] | null>(null);
  const [q, setQ] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);
  const [editar, setEditar] = useState<Contratista | 'nuevo' | null>(null);
  const [error, setError] = useState('');

  const cargar = () => contratistasAPI.listar().then(setLista).catch((e) => setError(mensajeError(e)));
  useEffect(() => {
    cargar();
  }, []);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (lista ?? []).filter(
      (c) => (verInactivos || c.activo) && (!t || c.razonSocial.toLowerCase().includes(t) || c.ruc.includes(t) || (c.nombreComercial ?? '').toLowerCase().includes(t)),
    );
  }, [lista, q, verInactivos]);

  return (
    <div className="font-sans space-y-5">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Contratistas</h1>
          <p className="text-xs text-gray-500 mt-1">Empresas que ejecutan trabajos en las obras. Sus documentos se revisan en la habilitación de cada obra.</p>
        </div>
        {puedeGestionar && (
          <button className={btnPrimario} onClick={() => setEditar('nuevo')}><BsPlusLg className="inline mr-1.5" />Nuevo contratista</button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input className={`${inputCls} max-w-sm`} placeholder="Buscar por razón social, nombre comercial o RUC..." value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Mostrar inactivos
        </label>
      </div>

      {error && <Aviso tipo="error">{error}</Aviso>}
      {!lista ? (
        <Cargando />
      ) : !filtrados.length ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl py-14 text-center">
          <BsPeople className="h-7 w-7 text-gray-300 mx-auto mb-2" />
          <p className="text-xs text-gray-400">{lista.length ? 'Ningún contratista coincide con la búsqueda' : 'Aún no hay contratistas registrados'}</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-gray-400 uppercase text-[10px] tracking-wider font-bold bg-gray-50/50 border-b border-gray-100">
              <tr>
                <th className="px-5 py-3">Contratista</th>
                <th className="px-3 py-3">RUC</th>
                <th className="px-3 py-3">Representante legal</th>
                <th className="px-3 py-3">Contacto</th>
                <th className="px-3 py-3 text-center">Obras</th>
                <th className="px-3 py-3">Estado</th>
                {puedeGestionar && <th className="px-5 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map((c) => (
                <tr key={c.id} className={c.activo ? '' : 'opacity-60'}>
                  <td className="px-5 py-3">
                    <div className="font-bold text-gray-800">{c.razonSocial}</div>
                    {c.nombreComercial && <div className="text-[11px] text-gray-400">{c.nombreComercial}</div>}
                  </td>
                  <td className="px-3 py-3 font-mono text-gray-700">{c.ruc}</td>
                  <td className="px-3 py-3 text-gray-700">{c.representanteLegal || '—'}</td>
                  <td className="px-3 py-3 text-gray-600">
                    <div>{c.email || '—'}</div>
                    {c.telefono && <div className="text-[11px] text-gray-400">{c.telefono}</div>}
                  </td>
                  <td className="px-3 py-3 text-center font-bold text-gray-700">{c.totalObras}</td>
                  <td className="px-3 py-3">
                    <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border ${c.activo ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-gray-500 bg-gray-50 border-gray-200'}`}>
                      {c.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  {puedeGestionar && (
                    <td className="px-5 py-3 text-right">
                      <button className="p-1.5 rounded-lg text-gray-400 hover:text-gray-800 hover:bg-gray-100" title="Editar" onClick={() => setEditar(c)}><BsPencil /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalContratista
        c={editar}
        onCerrar={() => setEditar(null)}
        onHecho={() => {
          setEditar(null);
          cargar();
        }}
      />
    </div>
  );
};

const VACIO = { ruc: '', razonSocial: '', nombreComercial: '', representanteLegal: '', email: '', telefono: '', activo: true };

const ModalContratista: React.FC<{ c: Contratista | 'nuevo' | null; onCerrar: () => void; onHecho: () => void }> = ({ c, onCerrar, onHecho }) => {
  const [f, setF] = useState(VACIO);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const esNuevo = c === 'nuevo';

  useEffect(() => {
    setError('');
    if (c === 'nuevo' || !c) setF(VACIO);
    else
      setF({
        ruc: c.ruc,
        razonSocial: c.razonSocial,
        nombreComercial: c.nombreComercial ?? '',
        representanteLegal: c.representanteLegal ?? '',
        email: c.email ?? '',
        telefono: c.telefono ?? '',
        activo: c.activo,
      });
  }, [c]);

  if (!c) return null;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{13}$/.test(f.ruc)) return setError('El RUC debe tener 13 dígitos');
    if (f.razonSocial.trim().length < 3) return setError('Indica la razón social');
    setOcupado(true);
    setError('');
    const datos = {
      razonSocial: f.razonSocial.trim(),
      nombreComercial: f.nombreComercial.trim() || null,
      representanteLegal: f.representanteLegal.trim() || null,
      email: f.email.trim() || null,
      telefono: f.telefono.trim() || null,
    };
    try {
      if (esNuevo) await contratistasAPI.crear({ ruc: f.ruc, ...datos });
      else await contratistasAPI.actualizar(c.id, { ...datos, activo: f.activo });
      onHecho();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo guardar'));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal abierto titulo={esNuevo ? 'Nuevo contratista' : 'Editar contratista'} onCerrar={onCerrar}
      pie={<><button className={btnSecundario} onClick={onCerrar}>Cancelar</button><button className={btnPrimario} form="form-ctr" type="submit" disabled={ocupado}>{ocupado ? 'Guardando...' : 'Guardar'}</button></>}>
      <form id="form-ctr" onSubmit={guardar} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Campo etiqueta="RUC">
            <input className={inputCls} value={f.ruc} disabled={!esNuevo} inputMode="numeric" onChange={(e) => setF({ ...f, ruc: e.target.value.replace(/\D/g, '').slice(0, 13) })} />
          </Campo>
          <Campo etiqueta="Razón social"><input className={inputCls} value={f.razonSocial} onChange={(e) => setF({ ...f, razonSocial: e.target.value })} maxLength={200} /></Campo>
          <Campo etiqueta="Nombre comercial"><input className={inputCls} value={f.nombreComercial} onChange={(e) => setF({ ...f, nombreComercial: e.target.value })} maxLength={200} /></Campo>
          <Campo etiqueta="Representante legal"><input className={inputCls} value={f.representanteLegal} onChange={(e) => setF({ ...f, representanteLegal: e.target.value })} maxLength={150} /></Campo>
          <Campo etiqueta="Correo"><input className={inputCls} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
          <Campo etiqueta="Teléfono"><input className={inputCls} value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} maxLength={30} /></Campo>
        </div>
        {!esNuevo && (
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Activo (los inactivos no se pueden agregar a obras nuevas)
          </label>
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}
      </form>
    </Modal>
  );
};
