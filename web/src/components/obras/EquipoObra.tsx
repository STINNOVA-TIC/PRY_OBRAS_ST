import React, { useEffect, useMemo, useState } from 'react';
import { BsExclamationTriangleFill, BsPenFill, BsPersonPlus, BsTrash } from 'react-icons/bs';
import { obrasAPI, usuariosAPI } from '../../api';
import { mensajeError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import { FUNCION_OBRA, type FuncionObra, type Obra, type Usuario } from '../../types';
import { Aviso, Campo, Modal, btnPrimario, btnSecundario, inputCls } from '../common/Modal';

const FUNCIONES = Object.keys(FUNCION_OBRA) as FuncionObra[];

export const EquipoObra: React.FC<{ obra: Obra; onCambio: (o: Obra) => void }> = ({ obra, onCambio }) => {
  const { hasPermission } = useAuth();
  const { showConfirm } = useModal();
  const puede = hasPermission('obras.gestionar_equipo') && obra.estado !== 'CERRADA';
  const [error, setError] = useState('');
  const [agregar, setAgregar] = useState(false);
  const miembros = obra.miembros ?? [];

  const ejecutar = async (fn: () => Promise<Obra>) => {
    setError('');
    try {
      onCambio(await fn());
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  return (
    <div className="space-y-6">
      {error && <Aviso tipo="error">{error}</Aviso>}

      <FirmantesHabilitacion obra={obra} puede={puede && obra.estado === 'HABILITACION'} onCambio={onCambio} onError={setError} />

      <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div>
            <h2 className="text-sm font-bold text-gray-800">Equipo de la obra</h2>
            <p className="text-[11px] text-gray-500">Solo los miembros ven la obra (además de quienes tienen acceso a todas).</p>
          </div>
          {puede && (
            <button className={btnPrimario} onClick={() => setAgregar(true)}>
              <BsPersonPlus className="inline h-3.5 w-3.5 mr-1.5" /> Agregar miembro
            </button>
          )}
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider font-bold">
            <tr>
              <th className="px-5 py-3">Persona</th>
              <th className="px-5 py-3">Función en la obra</th>
              <th className="px-5 py-3">Firma</th>
              <th className="px-5 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {miembros.map((m) => {
              const esFirmante = m.usuarioId === obra.administradorId || m.usuarioId === obra.superintendenteId;
              return (
                <tr key={m.usuarioId} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3">
                    <div className="font-bold text-gray-800">{m.nombre}</div>
                    <div className="text-gray-400">{m.cargo || m.email}</div>
                  </td>
                  <td className="px-5 py-3">
                    {puede ? (
                      <select
                        className="px-2 py-1 border border-gray-300 rounded-md text-xs bg-white"
                        value={m.funcion}
                        onChange={(e) => ejecutar(() => obrasAPI.asignarMiembro(obra.id, m.usuarioId, e.target.value))}
                      >
                        {FUNCIONES.map((f) => (
                          <option key={f} value={f}>{FUNCION_OBRA[f]}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="font-semibold text-gray-700">{FUNCION_OBRA[m.funcion]}</span>
                    )}
                    {esFirmante && <span className="ml-2 text-[10px] font-bold uppercase text-gray-500">· Firmante</span>}
                  </td>
                  <td className="px-5 py-3">
                    {m.tieneFirma ? (
                      <span className="text-emerald-600 font-semibold flex items-center gap-1"><BsPenFill /> Registrada</span>
                    ) : (
                      <span className="text-amber-600 font-semibold">Sin firma</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {puede && (
                      <button
                        title="Quitar de la obra"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                        onClick={async () => {
                          if (await showConfirm({ title: 'Quitar miembro', message: `¿Quitar a ${m.nombre} de la obra?`, confirmLabel: 'Quitar' }))
                            ejecutar(() => obrasAPI.quitarMiembro(obra.id, m.usuarioId));
                        }}
                      >
                        <BsTrash />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <ModalAgregarMiembro
        abierto={agregar}
        obra={obra}
        onCerrar={() => setAgregar(false)}
        onAgregado={(o) => {
          setAgregar(false);
          onCambio(o);
        }}
      />
    </div>
  );
};

/** Designación de firmantes de la habilitación (como aprobador/receptor del requerimiento en el POS). */
const FirmantesHabilitacion: React.FC<{ obra: Obra; puede: boolean; onCambio: (o: Obra) => void; onError: (e: string) => void }> = ({
  obra,
  puede,
  onCambio,
  onError,
}) => {
  const miembros = obra.miembros ?? [];
  const [adm, setAdm] = useState(obra.administradorId ?? '');
  const [sup, setSup] = useState(obra.superintendenteId ?? '');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    setAdm(obra.administradorId ?? '');
    setSup(obra.superintendenteId ?? '');
  }, [obra.administradorId, obra.superintendenteId]);

  const sinFirma = (id: string) => id && !miembros.find((m) => m.usuarioId === id)?.tieneFirma;
  const cambiado = adm !== (obra.administradorId ?? '') || sup !== (obra.superintendenteId ?? '');

  const guardar = async () => {
    setGuardando(true);
    onError('');
    try {
      onCambio(await obrasAPI.designarFirmantes(obra.id, { administradorId: adm || null, superintendenteId: sup || null }));
    } catch (e) {
      onError(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const selector = (valor: string, set: (v: string) => void, funcion: FuncionObra) => (
    <select className={inputCls} value={valor} onChange={(e) => set(e.target.value)} disabled={!puede}>
      <option value="">— Sin designar —</option>
      {miembros.filter((m) => m.funcion === funcion).map((m) => (
        <option key={m.usuarioId} value={m.usuarioId}>{m.nombre}{m.tieneFirma ? '' : ' (sin firma)'}</option>
      ))}
    </select>
  );

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="text-sm font-bold text-gray-800">Firmantes de la habilitación</h2>
        <p className="text-[11px] text-gray-500">
          Aprueban la habilitación con su firma. Deben ser personas distintas y miembros de la obra con esa función. Si cambias un firmante, se borran las firmas ya estampadas.
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Campo etiqueta="Administrador del contrato">{selector(adm, setAdm, 'ADMINISTRADOR')}</Campo>
        <Campo etiqueta="Superintendente de obra">{selector(sup, setSup, 'SUPERINTENDENTE')}</Campo>
      </div>
      {(sinFirma(adm) || sinFirma(sup)) && (
        <Aviso tipo="alerta">
          <BsExclamationTriangleFill className="inline mr-1.5" />
          Un firmante aún no registró su firma: deberá subirla en «Mi perfil y firma» antes de poder firmar.
        </Aviso>
      )}
      {!puede && obra.estado !== 'HABILITACION' && <p className="text-[11px] text-gray-400">La obra ya fue habilitada: los firmantes quedan fijos.</p>}
      {puede && cambiado && (
        <div className="flex gap-2">
          <button className={btnPrimario} onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar firmantes'}</button>
          <button className={btnSecundario} onClick={() => { setAdm(obra.administradorId ?? ''); setSup(obra.superintendenteId ?? ''); }}>Deshacer</button>
        </div>
      )}
    </section>
  );
};

const ModalAgregarMiembro: React.FC<{ abierto: boolean; obra: Obra; onCerrar: () => void; onAgregado: (o: Obra) => void }> = ({
  abierto,
  obra,
  onCerrar,
  onAgregado,
}) => {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState('');
  const [funcion, setFuncion] = useState<FuncionObra>('RESIDENTE');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!abierto) return;
    setSel('');
    setError('');
    usuariosAPI.listar({ activo: true, limit: 100 }).then((p) => setUsuarios(p.data)).catch((e) => setError(mensajeError(e)));
  }, [abierto]);

  const disponibles = useMemo(() => {
    const ya = new Set((obra.miembros ?? []).map((m) => m.usuarioId));
    const t = q.trim().toLowerCase();
    return usuarios.filter((u) => !ya.has(u.id) && (!t || u.nombre.toLowerCase().includes(t) || u.email.includes(t)));
  }, [usuarios, obra.miembros, q]);

  const guardar = async () => {
    if (!sel) return setError('Elige a una persona');
    try {
      onAgregado(await obrasAPI.asignarMiembro(obra.id, sel, funcion));
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  return (
    <Modal
      abierto={abierto}
      titulo="Agregar miembro"
      subtitulo={obra.nombre}
      onCerrar={onCerrar}
      pie={
        <>
          <button className={btnSecundario} onClick={onCerrar}>Cancelar</button>
          <button className={btnPrimario} onClick={guardar}>Agregar</button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Aviso tipo="error">{error}</Aviso>}
        <input className={inputCls} placeholder="Buscar por nombre o correo..." value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
          {!disponibles.length && <p className="p-4 text-center text-xs text-gray-400">No hay más usuarios disponibles</p>}
          {disponibles.map((u) => (
            <label key={u.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer text-xs ${sel === u.id ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
              <input type="radio" name="miembro" checked={sel === u.id} onChange={() => setSel(u.id)} />
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-gray-800 truncate">{u.nombre}</span>
                <span className="block text-gray-400 truncate">{u.cargo || u.email} · {u.roles.map((r) => r.nombre).join(', ') || 'sin rol'}</span>
              </span>
            </label>
          ))}
        </div>
        <Campo etiqueta="Función en la obra">
          <select className={inputCls} value={funcion} onChange={(e) => setFuncion(e.target.value as FuncionObra)}>
            {FUNCIONES.map((f) => (
              <option key={f} value={f}>{FUNCION_OBRA[f]}</option>
            ))}
          </select>
        </Campo>
      </div>
    </Modal>
  );
};
