import React, { useCallback, useEffect, useState } from 'react';
import { BsDownload, BsLockFill, BsPlusLg, BsX } from 'react-icons/bs';
import { costeoAPI } from '../../api';
import { mensajeError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { CosteoObra, CosteoRubro, EstadoObra } from '../../types';
import { fmtUSD } from '../common/EstadoChip';
import { Aviso, Campo, Cargando, Modal, btnPrimario, btnSecundario, inputCls } from '../common/Modal';
import { fmtN, fmtPct, leerNumero } from '../ejecucion/comunes';
import { KpiPl } from '../planillas/comunes';

type ObraLista = { id: string; nombre: string; cliente: string | null; estado: EstadoObra; conCosteo: boolean };
const bloqueado = (e: unknown) => mensajeError(e) === 'COSTEO_BLOQUEADO';

/** Costeo privado (como la app anterior): se entra con un código personal; la sesión dura 30 min sin uso. */
export const PaginaCosteo: React.FC = () => {
  const [abierto, setAbierto] = useState(!!costeoAPI.token());
  const [obraId, setObraId] = useState<string | null>(null);

  const bloquear = () => {
    costeoAPI.bloquear().catch(() => undefined);
    setAbierto(false);
    setObraId(null);
  };
  const vencido = () => {
    costeoAPI.olvidarToken();
    setAbierto(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Costeo privado</h1>
          <p className="text-xs text-gray-500 mt-1">Costos y precios internos por obra: directos, indirectos, margen estimado y utilidad real.</p>
        </div>
        {abierto && <button className={btnSecundario} onClick={bloquear}><BsLockFill className="inline mr-1.5" />Bloquear</button>}
      </div>
      {!abierto ? <Acceso onAbierto={() => setAbierto(true)} /> : obraId ? (
        <CosteoDeObra obraId={obraId} onVolver={() => setObraId(null)} onVencido={vencido} />
      ) : (
        <ListaObras onElegir={setObraId} onVencido={vencido} />
      )}
    </div>
  );
};

const Acceso: React.FC<{ onAbierto: () => void }> = ({ onAbierto }) => {
  const [tienePin, setTienePin] = useState<boolean | null>(null);
  const [modo, setModo] = useState<'entrar' | 'olvide' | 'cambiar'>('entrar');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [actual, setActual] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    costeoAPI.estado().then((e) => setTienePin(e.tienePin)).catch((e) => setError(mensajeError(e)));
  }, []);
  if (tienePin === null) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando texto="Cargando..." />;
  const crear = !tienePin || modo === 'cambiar';

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError('');
    if ((crear || modo === 'olvide') && pin !== pin2) return setError('Los códigos no coinciden');
    setOcupado(true);
    try {
      if (modo === 'olvide') await costeoAPI.restablecerPin(password, pin);
      else if (crear) await costeoAPI.crearPin(pin, modo === 'cambiar' ? actual : undefined);
      else await costeoAPI.desbloquear(pin);
      onAbierto();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };
  const pinInput = (v: string, set: (s: string) => void, auto: string) => (
    <input type="password" inputMode="numeric" pattern="[0-9]{4,8}" maxLength={8} required autoComplete={auto} className={`${inputCls} text-center tracking-[0.5em] text-lg`} value={v} onChange={(e) => set(e.target.value.replace(/\D/g, ''))} />
  );
  return (
    <form onSubmit={enviar} className="bg-white border border-gray-200 rounded-2xl p-6 max-w-sm mx-auto space-y-4">
      <div className="text-center">
        <BsLockFill className="mx-auto text-2xl text-gray-700" />
        <h2 className="mt-2 text-sm font-bold text-gray-800">
          {modo === 'olvide' ? 'Restablecer código' : modo === 'cambiar' ? 'Cambiar código de acceso' : crear ? 'Crea tu código de acceso' : 'Ingresa tu código de acceso'}
        </h2>
        {crear && modo !== 'cambiar' && <p className="text-[11px] text-gray-500 mt-1">De 4 a 8 números. Se pedirá cada vez que entres al costeo.</p>}
      </div>
      {modo === 'olvide' && <Campo etiqueta="Contraseña de tu cuenta"><input type="password" className={inputCls} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Campo>}
      {modo === 'cambiar' && <Campo etiqueta="Código actual">{pinInput(actual, setActual, 'current-password')}</Campo>}
      <Campo etiqueta={crear || modo === 'olvide' ? 'Código nuevo' : 'Código'}>{pinInput(pin, setPin, crear ? 'new-password' : 'current-password')}</Campo>
      {(crear || modo === 'olvide') && <Campo etiqueta="Repite el código">{pinInput(pin2, setPin2, 'new-password')}</Campo>}
      {error && <Aviso tipo="error">{error}</Aviso>}
      <button className={`${btnPrimario} w-full`} disabled={ocupado}>{ocupado ? 'Verificando...' : modo === 'entrar' && !crear ? 'Entrar' : 'Guardar y entrar'}</button>
      {tienePin && (
        <div className="flex justify-between text-[11px]">
          {modo === 'entrar' ? (
            <>
              <button type="button" className="text-gray-500 hover:text-gray-900" onClick={() => { setModo('olvide'); setError(''); }}>Olvidé mi código</button>
              <button type="button" className="text-gray-500 hover:text-gray-900" onClick={() => { setModo('cambiar'); setError(''); }}>Cambiar código</button>
            </>
          ) : (
            <button type="button" className="text-gray-500 hover:text-gray-900" onClick={() => { setModo('entrar'); setError(''); }}>‹ Volver</button>
          )}
        </div>
      )}
    </form>
  );
};

const ListaObras: React.FC<{ onElegir: (id: string) => void; onVencido: () => void }> = ({ onElegir, onVencido }) => {
  const [obras, setObras] = useState<ObraLista[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    costeoAPI.obras().then(setObras).catch((e) => (bloqueado(e) ? onVencido() : setError(mensajeError(e))));
  }, [onVencido]);
  if (!obras) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando texto="Cargando obras..." />;
  return (
    <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
      <p className="px-5 py-3 text-xs text-gray-500">Cada obra tiene su propio costeo: costos de materiales, mano de obra, equipo, subcontrato, otros e indirectos.</p>
      {obras.map((o) => (
        <button key={o.id} className="w-full flex justify-between items-center px-5 py-3 text-left hover:bg-gray-50" onClick={() => onElegir(o.id)}>
          <div><div className="text-sm font-semibold text-gray-800">{o.nombre}</div><div className="text-[11px] text-gray-500">{[o.cliente, o.estado].filter(Boolean).join(' · ')}</div></div>
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${o.conCosteo ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-gray-500 bg-gray-50 border-gray-200'}`}>{o.conCosteo ? 'Con costeo' : 'Sin costeo'}</span>
        </button>
      ))}
      {obras.length === 0 && <p className="px-5 py-6 text-sm text-gray-500">No hay obras.</p>}
    </div>
  );
};

const CosteoDeObra: React.FC<{ obraId: string; onVolver: () => void; onVencido: () => void }> = ({ obraId, onVolver, onVencido }) => {
  const { hasPermission } = useAuth();
  const puedeEditar = hasPermission('costeo.editar');
  const [c, setC] = useState<CosteoObra | null>(null);
  const [error, setError] = useState('');
  const [rubro, setRubro] = useState<CosteoRubro | null>(null);
  const [verInd, setVerInd] = useState(false);

  const manejar = useCallback((e: unknown) => (bloqueado(e) ? onVencido() : setError(mensajeError(e))), [onVencido]);
  useEffect(() => {
    costeoAPI.obra(obraId).then(setC).catch(manejar);
  }, [obraId, manejar]);
  if (!c) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando texto="Calculando costeo..." />;
  const t = c.totales;

  const guardarMaterial = async (id: number, texto: string) => {
    const v = texto.trim() === '' ? null : leerNumero(texto);
    if (texto.trim() !== '' && (v == null || v < 0)) return setError('Costo no válido');
    try {
      setC(await costeoAPI.guardarMaterial(obraId, id, v));
    } catch (e) {
      manejar(e);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <button className="text-xs font-semibold text-gray-600 hover:text-gray-900" onClick={onVolver}>‹ Otras obras</button>
          <h2 className="text-lg font-bold text-gray-800">{c.obra.nombre}</h2>
        </div>
        <button className={btnSecundario} onClick={() => costeoAPI.exportar(obraId, `costeo_${c.obra.nombre}.xlsx`).catch(manejar)}><BsDownload className="inline mr-1.5" />Excel</button>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiPl valor={fmtPct(t.margenContrato)} etiqueta="Margen estimado" tono={t.margenContrato < 0 ? 'alerta' : 'normal'} />
        <KpiPl valor={fmtUSD(t.utilidadContrato)} etiqueta={`Utilidad estimada (venta ${fmtUSD(t.ventaContrato)})`} />
        <KpiPl valor={fmtUSD(t.utilidadReal)} etiqueta={`Utilidad real (${fmtPct(t.margenReal)})`} tono={t.utilidadReal < 0 ? 'alerta' : 'normal'} />
        <KpiPl valor={fmtPct(t.factorIndirectos)} etiqueta={`Indirectos (${fmtUSD(t.totalIndirectos)})`} />
      </div>
      <p className="text-[11px] text-gray-500">
        Costo unitario = costo directo × (1 + indirectos). Utilidad real = venta ejecutada − (consumo real de bodega × costo interno + otros costos por cantidad ejecutada) con indirectos.
        Venta ejecutada {fmtUSD(t.ventaEjecutada)}, costo real {fmtUSD(t.costoReal)} (materiales {fmtUSD(t.materialReal)}).
      </p>

      <section className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
        <h3 className="px-5 pt-4 pb-2 text-sm font-bold text-gray-800">Costos por rubro <span className="font-normal text-xs text-gray-400">(por unidad)</span></h3>
        <table className="w-full text-left text-xs">
          <thead className="text-gray-400 uppercase text-[10px] tracking-wider font-bold bg-gray-50/50 border-y border-gray-100">
            <tr>
              <th className="px-5 py-2">Rubro</th><th className="px-2 py-2 text-right">P. venta</th><th className="px-2 py-2 text-right">Materiales</th><th className="px-2 py-2 text-right">M. obra</th>
              <th className="px-2 py-2 text-right">Equipo</th><th className="px-2 py-2 text-right">Subcontr.</th><th className="px-2 py-2 text-right">Otros</th><th className="px-2 py-2 text-right">Costo unit.</th>
              <th className="px-2 py-2 text-right">Margen</th><th className="px-5 py-2 text-right">Utilidad contrato</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {c.rubros.map((r) => (
              <tr key={r.id} className={puedeEditar ? 'hover:bg-gray-50 cursor-pointer' : ''} onClick={() => puedeEditar && setRubro(r)}>
                <td className="px-5 py-2 font-semibold text-gray-800">{r.descripcion} <span className="font-normal text-gray-400">({fmtN(r.cantidad)} {r.unidad})</span></td>
                <td className="px-2 py-2 text-right">{fmtN(r.pu, 2)}</td>
                <td className="px-2 py-2 text-right">{fmtN(r.mat ?? r.matAuto, 2)}{r.mat == null && <span className="text-[9px] text-gray-400 ml-0.5" title="Calculado con insumos × costo">auto</span>}</td>
                <td className="px-2 py-2 text-right">{fmtN(r.mo, 2)}</td>
                <td className="px-2 py-2 text-right">{fmtN(r.eq, 2)}</td>
                <td className="px-2 py-2 text-right">{fmtN(r.sub, 2)}</td>
                <td className="px-2 py-2 text-right">{fmtN(r.otr, 2)}</td>
                <td className="px-2 py-2 text-right font-semibold">{fmtN(r.costoUnit, 2)}</td>
                <td className={`px-2 py-2 text-right font-semibold ${r.margenUnit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{r.margenPct != null ? fmtPct(r.margenPct) : '—'}</td>
                <td className="px-5 py-2 text-right">{fmtUSD(r.ventaContrato - r.costoContrato)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {puedeEditar && <p className="px-5 py-2 text-[11px] text-gray-400">Toca un rubro para editar sus costos.</p>}
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-bold text-gray-800">Indirectos</h3>
            {puedeEditar && <button className="text-xs font-semibold text-gray-600 hover:text-gray-900" onClick={() => setVerInd(true)}>Editar</button>}
          </div>
          {c.indirectosSugeridos && <p className="text-[11px] text-gray-500 mb-2">Lista sugerida, aún sin valores.</p>}
          <div className="divide-y divide-gray-100 text-xs">
            {c.indirectos.filter((i) => i.valor > 0 || c.indirectosSugeridos).map((i) => (
              <div key={i.descripcion} className="flex justify-between py-1.5"><span className="text-gray-700">{i.descripcion}{i.tipo === 'PCT' && <span className="text-gray-400"> ({fmtN(i.valor)} %)</span>}</span><span className="font-semibold">{fmtUSD(i.usd)}</span></div>
            ))}
          </div>
          <div className="flex justify-between border-t border-gray-200 pt-2 mt-1 text-sm font-bold"><span>Total</span><span>{fmtUSD(t.totalIndirectos)} · {fmtPct(t.factorIndirectos)} del directo</span></div>
        </section>
        <section className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-1">Costo interno de materiales</h3>
          <p className="text-[11px] text-gray-500 mb-2">Vacío = el costo del catálogo. Se usa para el costo de materiales (insumos) y el costo real (consumos).</p>
          <div className="divide-y divide-gray-100 text-xs">
            {c.materiales.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 py-1.5">
                <div className="min-w-0"><div className="text-gray-800 truncate">{m.nombre}</div><div className="text-[11px] text-gray-400">consumido {fmtN(m.consumo, 2)} {m.unidad} · {fmtUSD(m.valor)}</div></div>
                {puedeEditar ? (
                  <input key={`${m.id}-${m.costoObra}`} className="w-24 px-2 py-1 rounded border border-gray-300 text-right text-xs" inputMode="decimal" defaultValue={m.costoObra ?? ''} placeholder={fmtN(m.costoCatalogo, 2)}
                    onBlur={(e) => { if ((e.target.value.trim() === '' ? null : leerNumero(e.target.value)) !== m.costoObra) guardarMaterial(m.id, e.target.value); }} aria-label={`Costo de ${m.nombre}`} />
                ) : <span className="font-semibold">{fmtN(m.costo, 2)}</span>}
              </div>
            ))}
            {c.materiales.length === 0 && <p className="py-2 text-gray-400">La obra no tiene insumos ni consumos.</p>}
          </div>
        </section>
      </div>
      <ModalRubro obraId={obraId} r={rubro} onCerrar={() => setRubro(null)} onGuardado={(n) => { setC(n); setRubro(null); }} onError={manejar} />
      <ModalIndirectos obraId={obraId} c={verInd ? c : null} onCerrar={() => setVerInd(false)} onGuardado={(n) => { setC(n); setVerInd(false); }} onError={manejar} />
    </div>
  );
};

const ModalRubro: React.FC<{ obraId: string; r: CosteoRubro | null; onCerrar: () => void; onGuardado: (c: CosteoObra) => void; onError: (e: unknown) => void }> = ({ obraId, r, onCerrar, onGuardado, onError }) => {
  const [f, setF] = useState({ mat: '', mo: '', eq: '', sub: '', otr: '' });
  const [error, setError] = useState('');
  useEffect(() => {
    if (!r) return;
    setError('');
    setF({ mat: r.mat == null ? '' : String(r.mat), mo: String(r.mo || ''), eq: String(r.eq || ''), sub: String(r.sub || ''), otr: String(r.otr || '') });
  }, [r]);
  if (!r) return null;
  const guardar = async () => {
    const n = (v: string) => (v.trim() === '' ? 0 : leerNumero(v));
    const vals = { mat: f.mat.trim() === '' ? null : leerNumero(f.mat), mo: n(f.mo), eq: n(f.eq), sub: n(f.sub), otr: n(f.otr) };
    if (Object.values(vals).some((v) => v !== null && (v == null || v < 0)) || (f.mat.trim() !== '' && vals.mat == null)) return setError('Hay valores no válidos');
    try {
      onGuardado(await costeoAPI.guardarRubro(obraId, r.id, vals as { mat: number | null; mo: number; eq: number; sub: number; otr: number }));
    } catch (e) {
      onError(e);
      setError(mensajeError(e));
    }
  };
  return (
    <Modal abierto titulo="Costos del rubro" subtitulo={`${r.descripcion} · por ${r.unidad} · venta ${fmtN(r.pu, 2)}`} onCerrar={onCerrar} ancho="md"
      pie={<><button className={btnSecundario} onClick={onCerrar}>Cancelar</button><button className={btnPrimario} onClick={guardar}>Guardar</button></>}>
      <div className="space-y-3">
        <Campo etiqueta="Materiales" ayuda={`Vacío = automático con insumos × costo (${fmtN(r.matAuto, 4)})`}>
          <input className={inputCls} inputMode="decimal" value={f.mat} placeholder={fmtN(r.matAuto, 4)} onChange={(e) => setF({ ...f, mat: e.target.value })} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          {(['mo', 'eq', 'sub', 'otr'] as const).map((k) => (
            <Campo key={k} etiqueta={{ mo: 'Mano de obra', eq: 'Equipo', sub: 'Subcontrato', otr: 'Otros' }[k]}>
              <input className={inputCls} inputMode="decimal" value={f[k]} placeholder="0" onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </Campo>
          ))}
        </div>
        {error && <Aviso tipo="error">{error}</Aviso>}
      </div>
    </Modal>
  );
};

const ModalIndirectos: React.FC<{ obraId: string; c: CosteoObra | null; onCerrar: () => void; onGuardado: (c: CosteoObra) => void; onError: (e: unknown) => void }> = ({ obraId, c, onCerrar, onGuardado, onError }) => {
  const [items, setItems] = useState<{ descripcion: string; tipo: 'PCT' | 'MONTO'; valor: string }[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!c) return;
    setError('');
    setItems(c.indirectos.map((i) => ({ descripcion: i.descripcion, tipo: i.tipo, valor: i.valor ? String(i.valor) : '' })));
  }, [c]);
  if (!c) return null;
  const guardar = async () => {
    const out = [];
    for (const i of items) {
      if (!i.descripcion.trim()) continue;
      const v = i.valor.trim() === '' ? 0 : leerNumero(i.valor);
      if (v == null || v < 0) return setError(`Valor no válido en «${i.descripcion}»`);
      out.push({ descripcion: i.descripcion.trim(), tipo: i.tipo, valor: v });
    }
    try {
      onGuardado(await costeoAPI.guardarIndirectos(obraId, out));
    } catch (e) {
      onError(e);
      setError(mensajeError(e));
    }
  };
  return (
    <Modal abierto titulo="Indirectos de la obra" subtitulo={`Costo directo del contrato ${fmtUSD(c.totales.directoContrato)}`} onCerrar={onCerrar} ancho="xl"
      pie={<><button className={btnSecundario} onClick={onCerrar}>Cancelar</button><button className={btnPrimario} onClick={guardar}>Guardar indirectos</button></>}>
      <div className="space-y-2">
        {items.map((i, k) => (
          <div key={k} className="flex gap-2">
            <input className={`${inputCls} flex-1`} maxLength={200} value={i.descripcion} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, descripcion: e.target.value } : x)))} />
            <select className={`${inputCls} w-28`} value={i.tipo} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, tipo: e.target.value as 'PCT' | 'MONTO' } : x)))}>
              <option value="MONTO">Monto $</option><option value="PCT">% directo</option>
            </select>
            <input className={`${inputCls} w-28 text-right`} inputMode="decimal" placeholder="0" value={i.valor} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, valor: e.target.value } : x)))} />
            <button className="p-2 text-gray-400 hover:text-red-600" onClick={() => setItems(items.filter((_, j) => j !== k))} title="Quitar"><BsX /></button>
          </div>
        ))}
        <button className="text-xs font-semibold text-gray-600 hover:text-gray-900" onClick={() => setItems([...items, { descripcion: '', tipo: 'MONTO', valor: '' }])}><BsPlusLg className="inline mr-1" />Agregar indirecto</button>
        {error && <Aviso tipo="error">{error}</Aviso>}
      </div>
    </Modal>
  );
};
