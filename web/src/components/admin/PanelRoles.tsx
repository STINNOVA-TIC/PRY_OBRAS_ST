import React, { useEffect, useMemo, useState } from 'react';
import { BsShieldLock } from 'react-icons/bs';
import { rolesAPI } from '../../api';
import { mensajeError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Modulo, Rol } from '../../types';
import { BotonRecargar } from '../common/BotonRecargar';
import { Aviso, Campo, Cargando, Modal, btnPrimario, btnSecundario, inputCls } from '../common/Modal';

/** Roles y matriz de permisos agrupada por módulo. */
export const PanelRoles: React.FC = () => {
  const { hasPermission } = useAuth();
  const [roles, setRoles] = useState<Rol[]>([]);
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [sel, setSel] = useState<Rol | null>(null);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const puedeEditar = hasPermission('roles.editar');

  const cargar = async (mantener?: number) => {
    setLoading(true);
    try {
      const [r, m] = await Promise.all([rolesAPI.listar(true), rolesAPI.catalogoPermisos()]);
      setRoles(r);
      setModulos(m);
      const actual = r.find((x) => x.id === (mantener ?? sel?.id)) ?? r[0] ?? null;
      elegir(actual);
    } catch (e) {
      setMsg({ tipo: 'error', texto: mensajeError(e) });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elegir = (r: Rol | null) => {
    setSel(r);
    setMarcados(new Set(r?.permisos.map((p) => p.id) ?? []));
    setMsg(null);
  };

  const cambiado = useMemo(() => {
    const a = new Set(sel?.permisos.map((p) => p.id) ?? []);
    return a.size !== marcados.size || [...a].some((x) => !marcados.has(x));
  }, [sel, marcados]);

  const toggle = (id: number) => {
    const n = new Set(marcados);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setMarcados(n);
  };
  const toggleModulo = (m: Modulo) => {
    const ids = m.permisos.map((p) => p.id);
    const todos = ids.every((i) => marcados.has(i));
    const n = new Set(marcados);
    ids.forEach((i) => (todos ? n.delete(i) : n.add(i)));
    setMarcados(n);
  };

  const guardar = async () => {
    if (!sel) return;
    setGuardando(true);
    try {
      await rolesAPI.asignarPermisos(sel.id, [...marcados]);
      setMsg({ tipo: 'ok', texto: `Permisos de ${sel.nombre} actualizados. Aplican desde la próxima acción de cada usuario.` });
      await cargar(sel.id);
    } catch (e) {
      setMsg({ tipo: 'error', texto: mensajeError(e) });
    } finally {
      setGuardando(false);
    }
  };

  if (loading && !roles.length) return <Cargando texto="Cargando roles..." />;
  const esSuper = sel?.codigo === 'SUPERADMIN';

  return (
    <div className="font-sans space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Roles y permisos</h1>
          <p className="text-xs text-gray-500 mt-1">Qué puede hacer cada rol. La función en cada obra se asigna en el equipo de la obra.</p>
        </div>
        <div className="flex items-center gap-2">
          <BotonRecargar onRefresh={() => cargar()} loading={loading} />
          {hasPermission('roles.crear') && <button className={btnPrimario} onClick={() => setNuevo(true)}>Nuevo rol</button>}
        </div>
      </div>

      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}

      <div className="grid lg:grid-cols-[260px_1fr] gap-6">
        <aside className="bg-white border border-gray-200 rounded-2xl p-2 h-fit">
          {roles.map((r) => (
            <button
              key={r.id}
              onClick={() => elegir(r)}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition ${sel?.id === r.id ? 'bg-gray-900 text-white' : 'hover:bg-gray-50 text-gray-700'} ${!r.activo ? 'opacity-50' : ''}`}
            >
              <div className="text-xs font-bold flex items-center gap-1.5">
                {r.codigo === 'SUPERADMIN' && <BsShieldLock />} {r.nombre}
              </div>
              <div className={`text-[10px] ${sel?.id === r.id ? 'text-gray-300' : 'text-gray-400'}`}>{r.permisos.length} permisos{r.esExterno ? ' · externo' : ''}</div>
            </button>
          ))}
        </aside>

        {sel && (
          <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center gap-4">
              <div>
                <h2 className="text-sm font-bold text-gray-800">{sel.nombre} <span className="font-mono text-[10px] text-gray-400">{sel.codigo}</span></h2>
                <p className="text-[11px] text-gray-500">{sel.descripcion}</p>
              </div>
              {puedeEditar && !esSuper && cambiado && (
                <div className="flex gap-2 shrink-0">
                  <button className={btnSecundario} onClick={() => elegir(sel)}>Deshacer</button>
                  <button className={btnPrimario} onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar permisos'}</button>
                </div>
              )}
            </div>
            {esSuper && <div className="px-5 pt-4"><Aviso>El Propietario tiene acceso total siempre, aunque no tenga un permiso marcado.</Aviso></div>}
            <div className="p-5 grid md:grid-cols-2 gap-4">
              {modulos.filter((m) => m.permisos.length).map((m) => {
                const n = m.permisos.filter((p) => marcados.has(p.id)).length;
                return (
                  <div key={m.id} className="border border-gray-200 rounded-xl">
                    <div className="px-4 py-2.5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-t-xl">
                      <span className="text-xs font-bold text-gray-800">{m.nombre}</span>
                      {puedeEditar && !esSuper ? (
                        <button className="text-[10px] font-bold text-gray-500 hover:text-gray-800" onClick={() => toggleModulo(m)}>
                          {n === m.permisos.length ? 'Quitar todos' : 'Marcar todos'}
                        </button>
                      ) : (
                        <span className="text-[10px] text-gray-400">{n}/{m.permisos.length}</span>
                      )}
                    </div>
                    <div className="p-2 space-y-0.5">
                      {m.permisos.map((p) => (
                        <label key={p.id} className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input type="checkbox" className="mt-0.5" checked={marcados.has(p.id)} disabled={!puedeEditar || esSuper} onChange={() => toggle(p.id)} />
                          <span className="min-w-0">
                            <span className="block text-[11px] text-gray-700">{p.descripcion}</span>
                            <span className="block text-[9px] font-mono text-gray-400">{p.codigo}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <ModalNuevoRol abierto={nuevo} onCerrar={() => setNuevo(false)} onCreado={(r) => { setNuevo(false); cargar(r.id); }} />
    </div>
  );
};

const ModalNuevoRol: React.FC<{ abierto: boolean; onCerrar: () => void; onCreado: (r: Rol) => void }> = ({ abierto, onCerrar, onCreado }) => {
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (abierto) { setCodigo(''); setNombre(''); setDescripcion(''); setError(''); }
  }, [abierto]);
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      onCreado(await rolesAPI.crear({ codigo, nombre, ...(descripcion && { descripcion }) }));
    } catch (err) {
      setError(mensajeError(err));
    }
  };
  return (
    <Modal abierto={abierto} titulo="Nuevo rol" onCerrar={onCerrar} ancho="md" pie={<><button className={btnSecundario} onClick={onCerrar}>Cancelar</button><button form="form-rol" className={btnPrimario}>Crear</button></>}>
      <form id="form-rol" onSubmit={guardar} className="space-y-3">
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Campo etiqueta="Código" ayuda="MAYÚSCULAS y guion bajo. No se puede cambiar después.">
          <input className={inputCls} value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} required pattern="[A-Z][A-Z0-9_]{1,39}" placeholder="JEFE_OBRA" />
        </Campo>
        <Campo etiqueta="Nombre"><input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={2} /></Campo>
        <Campo etiqueta="Descripción"><input className={inputCls} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></Campo>
      </form>
    </Modal>
  );
};
