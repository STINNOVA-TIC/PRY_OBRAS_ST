// Basado en PRY_PUNTO_VENTA/frontend/src/components/admin/PanelAdminUsuarios.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { BsKey, BsPencil, BsPenFill, BsPersonCheck, BsPersonSlash } from 'react-icons/bs';
import { contratistasAPI, rolesAPI, usuariosAPI } from '../../api';
import { mensajeError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import type { Contratista, Rol, Usuario } from '../../types';
import { BotonRecargar } from '../common/BotonRecargar';
import { Aviso, Campo, Cargando, Modal, btnPrimario, btnSecundario, inputCls } from '../common/Modal';
import { Paginacion } from '../common/Paginacion';
import { SearchAndFilterBar } from '../common/SearchAndFilterBar';
import { SubirFirma } from '../perfil/SubirFirma';

export const PanelUsuarios: React.FC = () => {
  const { hasPermission, user } = useAuth();
  const { showConfirm, showAlert } = useModal();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [total, setTotal] = useState(0);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [rolId, setRolId] = useState<string>('ALL');
  const [estado, setEstado] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [error, setError] = useState('');
  const [editando, setEditando] = useState<Usuario | 'nuevo' | null>(null);
  const [firmaDe, setFirmaDe] = useState<Usuario | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const p = await usuariosAPI.listar({
        q: q || undefined,
        rolId: rolId === 'ALL' ? undefined : Number(rolId),
        activo: estado === 'ALL' ? undefined : estado === 'activo',
        page,
        limit,
      });
      setUsuarios(p.data);
      setTotal(p.total);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setLoading(false);
    }
  }, [q, rolId, estado, page, limit]);

  useEffect(() => {
    const t = setTimeout(cargar, 250); // espera a que termine de escribir
    return () => clearTimeout(t);
  }, [cargar]);
  useEffect(() => {
    if (hasPermission('roles.ver')) rolesAPI.listar().then(setRoles);
  }, [hasPermission]);

  const mostrarTemporal = (nombre: string, pass?: string) =>
    pass &&
    showAlert({
      title: 'Contraseña temporal',
      message: `Entrégale a ${nombre} esta contraseña: ${pass}\n\nSolo se muestra una vez. Se le pedirá cambiarla al ingresar.`,
      type: 'info',
    });

  const alternarEstado = async (u: Usuario) => {
    const accion = u.activo ? 'desactivar' : 'activar';
    if (!(await showConfirm({ title: `${u.activo ? 'Desactivar' : 'Activar'} usuario`, message: `¿${accion} a ${u.nombre}?`, confirmLabel: u.activo ? 'Desactivar' : 'Activar', type: u.activo ? 'danger' : 'info' }))) return;
    try {
      await (u.activo ? usuariosAPI.desactivar(u.id) : usuariosAPI.activar(u.id));
      cargar();
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  const reset = async (u: Usuario) => {
    if (!(await showConfirm({ title: 'Restablecer contraseña', message: `Se generará una contraseña temporal para ${u.nombre}.`, confirmLabel: 'Generar' }))) return;
    try {
      const r = await usuariosAPI.resetPassword(u.id);
      mostrarTemporal(u.nombre, r.passwordTemporal);
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  if (loading && !usuarios.length && !error) return <Cargando texto="Cargando usuarios..." />;

  return (
    <div className="font-sans space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Usuarios</h1>
          <p className="text-xs text-gray-500 mt-1">Accesos, roles y firmas del personal</p>
        </div>
        <div className="flex items-center gap-2">
          <BotonRecargar onRefresh={cargar} loading={loading} />
          {hasPermission('usuarios.crear') && (
            <button onClick={() => setEditando('nuevo')} className={btnPrimario}>Registrar usuario</button>
          )}
        </div>
      </div>

      {error && <Aviso tipo="error">{error}</Aviso>}

      <SearchAndFilterBar
        searchPlaceholder="Buscar por nombre, correo o cédula..."
        searchValue={q}
        onSearchChange={(v) => { setQ(v); setPage(1); }}
        totalResults={usuarios.length}
        totalCount={total}
        resultsLabel="usuarios"
        selectFilters={[
          { id: 'rol', placeholder: 'Todos los roles', value: rolId, onChange: (v) => { setRolId(v); setPage(1); }, options: roles.map((r) => ({ label: r.nombre, value: String(r.id) })) },
          { id: 'estado', placeholder: 'Todos los estados', value: estado, onChange: (v) => { setEstado(v); setPage(1); }, options: [{ label: 'Activo', value: 'activo' }, { label: 'Inactivo', value: 'inactivo' }] },
        ]}
      />

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider font-bold border-b border-gray-100">
              <tr>
                <th className="px-5 py-3.5">Usuario</th>
                <th className="px-5 py-3.5">Correo</th>
                <th className="px-5 py-3.5">Roles</th>
                <th className="px-5 py-3.5">Firma</th>
                <th className="px-5 py-3.5">Estado</th>
                <th className="px-5 py-3.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!usuarios.length && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400 font-medium">No hay usuarios con ese filtro</td></tr>
              )}
              {usuarios.map((u) => (
                <tr key={u.id} className={`hover:bg-gray-50/50 ${!u.activo ? 'opacity-60' : ''}`}>
                  <td className="px-5 py-4">
                    <div className="font-bold text-gray-800">{u.nombre}</div>
                    <div className="text-gray-400">{u.cargo || '—'}</div>
                  </td>
                  <td className="px-5 py-4 font-mono text-gray-500">{u.email}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length ? u.roles.map((r) => (
                        <span key={r.id} className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border bg-gray-50 text-gray-600 border-gray-200">{r.nombre}</span>
                      )) : <span className="text-gray-300">Sin rol</span>}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => setFirmaDe(u)}
                      disabled={!hasPermission('usuarios.editar')}
                      className={`flex items-center gap-1 font-semibold ${u.firmaArchivoId ? 'text-emerald-600' : 'text-amber-600'} disabled:cursor-default`}
                    >
                      <BsPenFill /> {u.firmaArchivoId ? 'Registrada' : 'Pendiente'}
                    </button>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${u.activo ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                    {u.requiereCambioPassword && u.activo && <div className="text-[10px] text-amber-600 mt-1">Debe cambiar contraseña</div>}
                  </td>
                  <td className="px-5 py-4 text-right whitespace-nowrap">
                    {hasPermission('usuarios.editar') && (
                      <button title="Editar" onClick={() => setEditando(u)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-800 hover:bg-gray-100"><BsPencil /></button>
                    )}
                    {hasPermission('usuarios.reset_password') && (
                      <button title="Restablecer contraseña" onClick={() => reset(u)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-800 hover:bg-gray-100"><BsKey /></button>
                    )}
                    {hasPermission('usuarios.desactivar') && u.id !== user?.id && (
                      <button title={u.activo ? 'Desactivar' : 'Activar'} onClick={() => alternarEstado(u)} className={`p-1.5 rounded-lg text-gray-400 ${u.activo ? 'hover:text-red-600 hover:bg-red-50' : 'hover:text-emerald-600 hover:bg-emerald-50'}`}>
                        {u.activo ? <BsPersonSlash /> : <BsPersonCheck />}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginacion currentPage={page} totalItems={total} itemsPerPage={limit} onPageChange={setPage} onItemsPerPageChange={(n) => { setLimit(n); setPage(1); }} />
      </div>

      <ModalUsuario
        usuario={editando}
        roles={roles}
        puedeRoles={hasPermission('usuarios.asignar_roles')}
        onCerrar={() => setEditando(null)}
        onGuardado={(u) => {
          setEditando(null);
          cargar();
          mostrarTemporal(u.nombre, u.passwordTemporal);
        }}
      />

      <Modal abierto={!!firmaDe} titulo="Firma del usuario" subtitulo={firmaDe?.nombre} onCerrar={() => setFirmaDe(null)}>
        {firmaDe && (
          <SubirFirma
            firmaArchivoId={firmaDe.firmaArchivoId}
            onGuardar={async (f) => { setFirmaDe(await usuariosAPI.subirFirma(firmaDe.id, f)); cargar(); }}
            onQuitar={async () => { setFirmaDe(await usuariosAPI.quitarFirma(firmaDe.id)); cargar(); }}
          />
        )}
      </Modal>
    </div>
  );
};

const ModalUsuario: React.FC<{
  usuario: Usuario | 'nuevo' | null;
  roles: Rol[];
  puedeRoles: boolean;
  onCerrar: () => void;
  onGuardado: (u: Usuario) => void;
}> = ({ usuario, roles, puedeRoles, onCerrar, onGuardado }) => {
  const nuevo = usuario === 'nuevo';
  const u = usuario && usuario !== 'nuevo' ? usuario : null;
  const [f, setF] = useState({ nombre: '', email: '', cedula: '', cargo: '', telefono: '', password: '' });
  const [rolIds, setRolIds] = useState<number[]>([]);
  const [contratistaId, setContratistaId] = useState('');
  const [contratistas, setContratistas] = useState<Contratista[]>([]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Un rol externo (CONTRATISTA) exige vincular el usuario a una empresa contratista
  const requiereContratista = roles.some((r) => r.esExterno && rolIds.includes(r.id));
  useEffect(() => {
    if (requiereContratista && !contratistas.length)
      contratistasAPI.listar().then((l) => setContratistas(l.filter((c) => c.activo))).catch(() => undefined);
  }, [requiereContratista]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!usuario) return;
    setError('');
    setContratistaId(u?.contratistaId ?? '');
    setF({ nombre: u?.nombre ?? '', email: u?.email ?? '', cedula: u?.cedula ?? '', cargo: u?.cargo ?? '', telefono: u?.telefono ?? '', password: '' });
    setRolIds(u?.roles.map((r) => r.id) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario]);

  if (!usuario) return null;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (requiereContratista && !contratistaId) return setError('Elige la empresa contratista a la que pertenece este usuario');
    setGuardando(true);
    try {
      let r: Usuario;
      if (nuevo) {
        r = await usuariosAPI.crear({
          nombre: f.nombre,
          email: f.email,
          ...(f.cedula && { cedula: f.cedula }),
          ...(f.cargo && { cargo: f.cargo }),
          ...(f.telefono && { telefono: f.telefono }),
          ...(f.password && { password: f.password }),
          ...(puedeRoles && rolIds.length && { rolIds }),
          ...(contratistaId && requiereContratista && { contratistaId }),
        });
      } else {
        r = await usuariosAPI.actualizar(u!.id, {
          nombre: f.nombre,
          email: f.email,
          cedula: f.cedula || null,
          cargo: f.cargo || null,
          telefono: f.telefono || null,
          // Primero el vínculo: la base exige contratista antes de asignar un rol externo
          ...(requiereContratista ? { contratistaId } : u!.contratistaId ? { contratistaId: null } : {}),
        });
        const antes = u!.roles.map((x) => x.id).sort().join();
        if (puedeRoles && antes !== [...rolIds].sort().join()) r = await usuariosAPI.asignarRoles(u!.id, rolIds);
      }
      onGuardado(r);
    } catch (err) {
      setError(mensajeError(err, 'No se pudo guardar'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      titulo={nuevo ? 'Registrar usuario' : 'Editar usuario'}
      subtitulo={u?.email}
      onCerrar={onCerrar}
      ancho="xl"
      pie={
        <>
          <button type="button" className={btnSecundario} onClick={onCerrar}>Cancelar</button>
          <button type="submit" form="form-usuario" className={btnPrimario} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
        </>
      }
    >
      <form id="form-usuario" onSubmit={guardar} className="space-y-4">
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="grid sm:grid-cols-2 gap-3">
          <Campo etiqueta="Nombre completo *"><input className={inputCls} value={f.nombre} onChange={set('nombre')} required minLength={2} /></Campo>
          <Campo etiqueta="Correo *"><input type="email" className={inputCls} value={f.email} onChange={set('email')} required /></Campo>
          <Campo etiqueta="Cargo" ayuda="Se imprime bajo su firma"><input className={inputCls} value={f.cargo} onChange={set('cargo')} placeholder="Ej. Superintendente de obra" /></Campo>
          <Campo etiqueta="Cédula"><input className={inputCls} value={f.cedula} onChange={set('cedula')} inputMode="numeric" pattern="\d{10}(\d{3})?" title="10 dígitos (o 13 si es RUC)" /></Campo>
          <Campo etiqueta="Teléfono"><input className={inputCls} value={f.telefono} onChange={set('telefono')} /></Campo>
          {nuevo && (
            <Campo etiqueta="Contraseña" ayuda="Vacío = se genera una temporal y se muestra una sola vez">
              <input type="text" className={inputCls} value={f.password} onChange={set('password')} pattern="(?=.*[A-Za-z])(?=.*\d).{8,72}" title="8 a 72 caracteres, con letra y número" autoComplete="new-password" />
            </Campo>
          )}
        </div>
        {puedeRoles && (
          <div>
            <span className="block text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-2">Roles</span>
            <div className="grid sm:grid-cols-2 gap-2">
              {roles.map((r) => {
                const sel = rolIds.includes(r.id);
                return (
                  <label key={r.id} className={`p-3 rounded-xl border transition flex items-start gap-2 cursor-pointer select-none ${sel ? 'border-gray-800 bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="checkbox" className="mt-0.5" checked={sel} onChange={() => setRolIds(sel ? rolIds.filter((x) => x !== r.id) : [...rolIds, r.id])} />
                    <span>
                      <span className="block text-xs font-bold text-gray-800">{r.nombre}{r.esExterno && <span className="ml-1 text-[10px] text-gray-400">(externo)</span>}</span>
                      <span className="block text-[11px] text-gray-500 line-clamp-2">{r.descripcion}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {requiereContratista && (
              <div className="mt-3">
                <Campo etiqueta="Empresa contratista *" ayuda="El rol externo solo ve lo relacionado con su empresa">
                  <select className={inputCls} value={contratistaId} onChange={(e) => setContratistaId(e.target.value)} required>
                    <option value="">Elige...</option>
                    {contratistas.map((c) => <option key={c.id} value={c.id}>{c.razonSocial} · RUC {c.ruc}</option>)}
                  </select>
                </Campo>
                {!contratistas.length && <p className="text-[11px] text-gray-500 mt-1">No hay contratistas activos: regístralo primero en «Contratistas».</p>}
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
};
