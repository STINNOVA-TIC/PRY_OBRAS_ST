import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BsArrowRight, BsDownload, BsFunnel, BsGeoAlt, BsLaptop, BsSearch, BsTools } from 'react-icons/bs';
import { bitacoraAPI } from '../../api';
import { mensajeError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { EventoBitacora, FiltroBitacora, RegistroAuditoria } from '../../types';
import { Aviso, Cargando, Modal, btnSecundario, inputCls } from '../common/Modal';

const MODULO_TXT: Record<string, string> = {
  OBRAS: 'Obras', HABILITACION: 'Habilitación', RUBROS: 'Rubros', AVANCES: 'Avances', PROGRAMA: 'Programa', BODEGA: 'Bodega',
  PLANILLAS: 'Planillas', COSTEO: 'Costeo', REPORTES: 'Reportes', CONFIG: 'Configuración', USUARIOS: 'Usuarios', ACCESO: 'Accesos',
};
const MODULO_CLS: Record<string, string> = {
  ACCESO: 'bg-sky-50 text-sky-700 border-sky-200', USUARIOS: 'bg-violet-50 text-violet-700 border-violet-200',
  COSTEO: 'bg-amber-50 text-amber-800 border-amber-200', CONFIG: 'bg-gray-100 text-gray-700 border-gray-200',
  PLANILLAS: 'bg-emerald-50 text-emerald-700 border-emerald-200', BODEGA: 'bg-orange-50 text-orange-700 border-orange-200',
};
/** Para la auditoría técnica: qué tabla corresponde a cada tipo de registro. */
const TABLA: Record<string, string> = { PLANILLA: 'planillas', USUARIO: 'usuarios', TRANSFERENCIA: 'transferencias' };

const fmtDia = (iso: string) =>
  new Date(iso).toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Guayaquil' });
const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Guayaquil' });
const valor = (v: unknown) => (v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** Navegador legible a partir del user-agent. */
function navegador(ua: string | null) {
  if (!ua) return null;
  const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ua.split(/[ /]/)[0];
  const so = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return [nav, so].filter(Boolean).join(' · ');
}

function enlace(e: EventoBitacora): string | null {
  if (e.entidad === 'PLANILLA' && e.obraId && e.entidadId) return `/obras/${e.obraId}/planillas/${e.entidadId}`;
  if (e.entidad === 'TRANSFERENCIA' && e.entidadId) return `/transferencias/${e.entidadId}`;
  if (e.obraId) return `/obras/${e.obraId}`;
  return null;
}

/**
 * Bitácora con filtros: quién hizo qué, cuándo, desde dónde y qué cambió (antes → después).
 * Con obraId fija se usa como «Historial» de la obra.
 */
export const VistaBitacora: React.FC<{ obraId?: string }> = ({ obraId }) => {
  const { esPropietario } = useAuth();
  const [f, setF] = useState<FiltroBitacora>({ obraId });
  const [q, setQ] = useState('');
  const [datos, setDatos] = useState<EventoBitacora[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [opciones, setOpciones] = useState<{ obras: { id: string; nombre: string }[]; usuarios: { id: string; nombre: string }[]; modulos: string[]; sinObra: boolean } | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [auditoria, setAuditoria] = useState<EventoBitacora | null>(null);

  useEffect(() => {
    bitacoraAPI.filtros().then(setOpciones).catch(() => undefined);
  }, []);

  const cargar = useCallback(
    async (pag: number) => {
      setCargando(true);
      setError('');
      try {
        const r = await bitacoraAPI.listar({ ...f, obraId: obraId ?? f.obraId, pagina: pag, limite: 50 });
        setDatos((d) => (pag === 1 || !d ? r.datos : [...d, ...r.datos]));
        setTotal(r.total);
        setPagina(pag);
      } catch (e) {
        setError(mensajeError(e));
      } finally {
        setCargando(false);
      }
    },
    [f, obraId],
  );
  useEffect(() => {
    cargar(1);
  }, [cargar]);

  const set = (k: keyof FiltroBitacora, v: string) => setF({ ...f, [k]: v || undefined });
  let dia = '';

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-400"><BsFunnel /> Filtros</div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          {!obraId && (
            <select className={inputCls} value={f.obraId ?? ''} onChange={(e) => set('obraId', e.target.value)} aria-label="Obra">
              <option value="">Todas las obras</option>
              {opciones?.sinObra && <option value="SIN_OBRA">Sin obra (configuración, usuarios, accesos)</option>}
              {opciones?.obras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          )}
          <select className={inputCls} value={f.usuarioId ?? ''} onChange={(e) => set('usuarioId', e.target.value)} aria-label="Usuario">
            <option value="">Todos los usuarios</option>
            {opciones?.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
          <select className={inputCls} value={f.modulo ?? ''} onChange={(e) => set('modulo', e.target.value)} aria-label="Módulo">
            <option value="">Todos los módulos</option>
            {(opciones?.modulos ?? Object.keys(MODULO_TXT)).map((m) => <option key={m} value={m}>{MODULO_TXT[m] ?? m}</option>)}
          </select>
          <input type="date" className={inputCls} value={f.desde ?? ''} onChange={(e) => set('desde', e.target.value)} aria-label="Desde" title="Desde" />
          <input type="date" className={inputCls} value={f.hasta ?? ''} onChange={(e) => set('hasta', e.target.value)} aria-label="Hasta" title="Hasta" />
          <form className="relative" onSubmit={(e) => { e.preventDefault(); set('q', q.trim()); }}>
            <input className={`${inputCls} pr-8`} placeholder="Buscar texto..." value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => set('q', q.trim())} />
            <BsSearch className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          </form>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
          <span>{total.toLocaleString('es-EC')} evento{total === 1 ? '' : 's'}</span>
          <div className="flex gap-2">
            {(f.usuarioId || f.modulo || f.desde || f.hasta || f.q || (!obraId && f.obraId)) && (
              <button className="text-xs font-semibold text-gray-600 hover:text-gray-900" onClick={() => { setF({ obraId }); setQ(''); }}>Limpiar filtros</button>
            )}
            <button className={btnSecundario} onClick={() => bitacoraAPI.exportar({ ...f, obraId: obraId ?? f.obraId }).catch((e) => setError(mensajeError(e)))}>
              <BsDownload className="inline mr-1.5" />Excel
            </button>
          </div>
        </div>
      </div>

      {error && <Aviso tipo="error">{error}</Aviso>}
      {!datos ? (
        <Cargando texto="Cargando bitácora..." />
      ) : datos.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl py-12 text-center text-sm text-gray-500">No hay eventos con esos filtros.</div>
      ) : (
        <div className="space-y-2">
          {datos.map((e) => {
            const d = fmtDia(e.fecha);
            const cabecera = d !== dia ? ((dia = d), <p key={`d-${e.id}`} className="pt-3 text-[11px] font-bold uppercase tracking-wider text-gray-400 first-letter:uppercase">{d}</p>) : null;
            const borra = /Eliminó|Quitó|Anuló|Canceló|fallido|incorrect/i.test(e.accion);
            const link = enlace(e);
            const nav = navegador(e.agente);
            return (
              <React.Fragment key={e.id}>
                {cabecera}
                <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm font-bold ${borra ? 'text-red-700' : 'text-gray-800'}`}>{e.accion}</span>
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${MODULO_CLS[e.modulo] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                          {MODULO_TXT[e.modulo] ?? e.modulo}
                        </span>
                        {e.obraNombre && !obraId && <span className="text-[11px] text-gray-500">{e.obraNombre}</span>}
                      </div>
                      {e.detalle && <p className="text-xs text-gray-700 mt-1 break-words">{e.detalle}</p>}
                    </div>
                    <div className="text-right text-[11px] text-gray-500 shrink-0">
                      <div className="font-semibold text-gray-700">{e.usuarioNombre ?? 'Sin sesión'}</div>
                      <div>{fmtHora(e.fecha)}</div>
                    </div>
                  </div>
                  {e.cambios.length > 0 && (
                    <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50/60 divide-y divide-gray-100">
                      {e.cambios.map((c, i) => (
                        <div key={i} className="grid grid-cols-[minmax(0,180px)_1fr] gap-3 px-3 py-1.5 text-xs">
                          <span className="text-gray-500 truncate" title={c.campo}>{c.campo}</span>
                          <span className="min-w-0 break-words">
                            <s className="text-gray-400">{valor(c.antes)}</s> <BsArrowRight className="inline mx-1 text-gray-400" /> <b className="text-gray-800">{valor(c.despues)}</b>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-400">
                    {e.ip && <span title="Dirección IP"><BsGeoAlt className="inline mr-1" />{e.ip}</span>}
                    {nav && <span title={e.agente ?? ''}><BsLaptop className="inline mr-1" />{nav}</span>}
                    {link && <Link to={link} className="font-semibold text-gray-500 hover:text-gray-900">Abrir {e.entidad === 'PLANILLA' ? 'planilla' : e.entidad === 'TRANSFERENCIA' ? 'transferencia' : 'obra'} ›</Link>}
                    {esPropietario && e.entidad && e.entidadId && TABLA[e.entidad] && (
                      <button className="font-semibold text-gray-500 hover:text-gray-900" onClick={() => setAuditoria(e)}><BsTools className="inline mr-1" />Cambios técnicos</button>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          {datos.length < total && (
            <div className="text-center pt-2">
              <button className={btnSecundario} disabled={cargando} onClick={() => cargar(pagina + 1)}>{cargando ? 'Cargando...' : `Ver más (${total - datos.length} restantes)`}</button>
            </div>
          )}
        </div>
      )}
      <ModalAuditoria evento={auditoria} onCerrar={() => setAuditoria(null)} />
    </div>
  );
};

/** Auditoría técnica de un registro: cada cambio guardado en la base, campo por campo (solo propietario). */
const ModalAuditoria: React.FC<{ evento: EventoBitacora | null; onCerrar: () => void }> = ({ evento, onCerrar }) => {
  const [filas, setFilas] = useState<RegistroAuditoria[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!evento?.entidad || !evento.entidadId) return;
    setFilas(null);
    setError('');
    bitacoraAPI.auditoria(TABLA[evento.entidad], evento.entidadId).then(setFilas).catch((e) => setError(mensajeError(e)));
  }, [evento]);
  if (!evento) return null;
  return (
    <Modal abierto titulo="Cambios técnicos del registro" subtitulo={`${evento.entidad} · ${evento.accion}`} onCerrar={onCerrar} ancho="3xl"
      pie={<button className={btnSecundario} onClick={onCerrar}>Cerrar</button>}>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!filas && !error && <Cargando texto="Cargando auditoría..." />}
      {filas && filas.length === 0 && <p className="text-sm text-gray-500">No hay cambios técnicos registrados.</p>}
      <div className="space-y-3">
        {filas?.map((a) => (
          <div key={a.id} className="border border-gray-200 rounded-xl p-3">
            <div className="flex justify-between text-xs mb-2">
              <span className="font-bold text-gray-800">{a.operacion === 'INSERT' ? 'Creación' : a.operacion === 'DELETE' ? 'Eliminación' : 'Modificación'}</span>
              <span className="text-gray-500">{a.usuarioNombre ?? 'Sistema'} · {new Date(a.fecha).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}</span>
            </div>
            {a.cambios.length === 0 ? <p className="text-xs text-gray-400">Sin cambios de valores.</p> : (
              <div className="divide-y divide-gray-100 text-xs">
                {a.cambios.map((c) => (
                  <div key={c.campo} className="grid grid-cols-[160px_1fr] gap-3 py-1">
                    <span className="font-mono text-gray-500 truncate">{c.campo}</span>
                    <span className="break-all"><s className="text-gray-400">{valor(c.antes)}</s> → <b>{valor(c.despues)}</b></span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
};

export const PaginaBitacora: React.FC = () => (
  <div className="space-y-4">
    <div>
      <h1 className="text-xl font-bold text-gray-800">Bitácora</h1>
      <p className="text-xs text-gray-500 mt-1">Quién creó, cambió, firmó o borró qué, cuándo y desde dónde. Los registros no se pueden editar.</p>
    </div>
    <VistaBitacora />
  </div>
);
