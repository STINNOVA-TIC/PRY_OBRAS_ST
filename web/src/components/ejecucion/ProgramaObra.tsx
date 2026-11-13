import React, { useCallback, useEffect, useState } from 'react';
import { BsGear } from 'react-icons/bs';
import { programaAPI } from '../../api';
import { mensajeError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { FilaPrograma, Obra, Programa } from '../../types';
import { fmtFecha } from '../common/EstadoChip';
import { Aviso, Campo, Cargando, Modal, btnPrimario, btnSecundario, inputCls } from '../common/Modal';
import { BarraAvance, ChipNivel, fmtFechaCorta, fmtN, fmtPct, leerNumero } from './comunes';

const DIA = 86_400_000;
const t = (s: string) => Date.parse(`${s}T00:00:00Z`);
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Pestaña "Programa": plazos, ritmo requerido vs. real, alertas, Gantt y necesidad de producto. */
export const ProgramaObra: React.FC<{ obra: Obra }> = ({ obra }) => {
  const { hasPermission } = useAuth();
  const [p, setP] = useState<Programa | null>(null);
  const [error, setError] = useState('');
  const [config, setConfig] = useState(false);
  const [detalle, setDetalle] = useState<FilaPrograma | null>(null);
  const [verSemanas, setVerSemanas] = useState(false);

  const cargar = useCallback(() => programaAPI.obtener(obra.id).then(setP).catch((e) => setError(mensajeError(e))), [obra.id]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  if (!p) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando texto="Calculando programa..." />;
  if (!p.rubros.length)
    return <div className="bg-white border border-dashed border-gray-300 rounded-2xl py-12 text-center text-xs text-gray-500">Carga los rubros con su cantidad para armar el programa.</div>;

  const puedeEditar = hasPermission('rubros.editar') && obra.estado !== 'CERRADA';
  const visibles = p.alertas.filter((a) => a.nivel !== 'PENDIENTE');
  const pendientes = p.alertas.filter((a) => a.nivel === 'PENDIENTE').length;

  return (
    <div className="space-y-5">
      {error && <Aviso tipo="error">{error}</Aviso>}
      <section className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-wrap justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-gray-800">Programa de ejecución</h2>
          <p className="text-[11px] text-gray-500 mt-1 max-w-2xl">
            Plazo de la obra: {p.config.fechaInicio ? fmtFecha(p.config.fechaInicio) : 'sin inicio'} a {p.config.fechaFin ? fmtFecha(p.config.fechaFin) : 'sin fin'}.{' '}
            {p.config.diasLaborablesSemana} días de trabajo por semana. El ritmo real es el promedio de los últimos {p.config.ventanaRitmoDias} días.
          </p>
        </div>
        {puedeEditar && <button className={btnSecundario} onClick={() => setConfig(true)}><BsGear className="inline mr-1.5" />Plazos y rendimientos</button>}
      </section>

      {/* Alertas */}
      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-bold text-gray-800">Alertas</h2>
        {visibles.length ? (
          <ul className="space-y-2">
            {visibles.map((a, i) => (
              <li key={i} className="flex gap-3 items-start text-xs">
                <ChipNivel nivel={a.nivel} />
                <div><b className="text-gray-800">{a.nombre}</b><p className="text-gray-500">{a.texto}</p></div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-500">Sin alertas: el ritmo y el stock alcanzan para cumplir los plazos.</p>
        )}
        {pendientes > 0 && puedeEditar && <p className="text-[11px] text-gray-400">{pendientes} rubro(s) sin rendimiento planificado por día.</p>}
      </section>

      {/* Gantt */}
      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-gray-800">Diagrama de Gantt</h2>
          <p className="text-[11px] text-gray-500">Toca un rubro para ver su detalle. La línea roja es hoy; el tramo rayado, el atraso estimado.</p>
        </div>
        <Gantt p={p} onRubro={setDetalle} />
      </section>

      {/* Producción diaria */}
      <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <h2 className="text-sm font-bold text-gray-800 px-5 pt-5 pb-3">Producción diaria para cumplir el plazo</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-gray-400 uppercase text-[10px] tracking-wider font-bold bg-gray-50/50 border-y border-gray-100">
              <tr><th className="px-5 py-2.5">Rubro</th><th className="px-3 py-2.5 text-right">Saldo</th><th className="px-3 py-2.5 text-right">Días háb.</th><th className="px-3 py-2.5 text-right">Mínimo/día</th><th className="px-3 py-2.5 text-right">Planificado/día</th><th className="px-3 py-2.5 text-right">Real/día</th><th className="px-5 py-2.5">Fin estimado</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {p.rubros.map((f) => {
                const bajoPlan = !!f.rendPlanificado && f.minimoDia != null && f.rendPlanificado < f.minimoDia;
                const bajoReal = f.saldo > 0 && f.minimoDia != null && f.rendReal < f.minimoDia;
                const tarde = !!f.finEstimado && f.finEstimado > f.fin;
                return (
                  <tr key={f.obraRubroId} className="hover:bg-gray-50/60 cursor-pointer" onClick={() => setDetalle(f)}>
                    <td className="px-5 py-2.5 font-semibold text-gray-800 max-w-xs truncate">{f.descripcion}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">{fmtN(f.saldo)} {f.unidad}</td>
                    <td className="px-3 py-2.5 text-right">{f.diasHabilesRestantes}</td>
                    <td className="px-3 py-2.5 text-right">{f.saldo ? (f.vencido ? <span className="text-red-600 font-bold">vencido</span> : fmtN(f.minimoDia)) : '—'}</td>
                    <td className={`px-3 py-2.5 text-right ${bajoPlan ? 'text-red-600 font-bold' : ''}`}>{f.rendPlanificado ? fmtN(f.rendPlanificado) : '—'}</td>
                    <td className={`px-3 py-2.5 text-right ${bajoReal ? 'text-red-600 font-bold' : ''}`}>{fmtN(f.rendReal)}</td>
                    <td className={`px-5 py-2.5 whitespace-nowrap ${tarde ? 'text-red-600 font-bold' : ''}`}>{fmtFechaCorta(f.finEstimado)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Necesidad de producto */}
      <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-sm font-bold text-gray-800">Necesidad de producto</h2>
          <p className="text-[11px] text-gray-500 max-w-3xl">
            Material que falta para terminar los saldos, según los insumos por unidad de cada rubro. Stock mínimo = consumo diario requerido × {p.config.diasCobertura} días de cobertura.
            La fecha de pedido considera {p.config.diasEntrega} días de producción y entrega. El stock es el de la bodega de esta obra (súbelo con Bodega → Pedir material).
          </p>
        </div>
        {p.materiales.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-gray-400 uppercase text-[10px] tracking-wider font-bold bg-gray-50/50 border-y border-gray-100">
                  <tr><th className="px-5 py-2.5">Material</th><th className="px-3 py-2.5 text-right">Para terminar</th><th className="px-3 py-2.5 text-right">Stock obra</th><th className="px-3 py-2.5 text-right">Faltante</th><th className="px-3 py-2.5 text-right">Consumo/día</th><th className="px-3 py-2.5 text-right">Stock mínimo</th><th className="px-3 py-2.5">Se agota</th><th className="px-5 py-2.5">Pedir hasta</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {p.materiales.map((m) => (
                    <tr key={m.materialId}>
                      <td className="px-5 py-2.5 font-semibold text-gray-800">{m.nombre}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">{fmtN(m.necesario)} {m.unidad}</td>
                      <td className={`px-3 py-2.5 text-right ${m.stock < m.minimo ? 'text-red-600 font-bold' : ''}`}>{fmtN(m.stock)}</td>
                      <td className={`px-3 py-2.5 text-right ${m.faltante > 0 ? 'text-red-600 font-bold' : ''}`}>{fmtN(m.faltante)}</td>
                      <td className="px-3 py-2.5 text-right">{fmtN(m.consumoDia)}</td>
                      <td className="px-3 py-2.5 text-right">{fmtN(m.minimo)}{m.minimoFijo != null && <span className="text-[10px] text-gray-400"> fijo</span>}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{fmtFechaCorta(m.seAgota)}</td>
                      <td className={`px-5 py-2.5 whitespace-nowrap ${m.pedirHasta && m.pedirHasta <= p.hoy ? 'text-red-600 font-bold' : ''}`}>{m.pedirHasta ? (m.pedirHasta <= p.hoy ? 'Ya' : fmtFechaCorta(m.pedirHasta)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {p.semanas.length > 0 && (
              <div className="border-t border-gray-100">
                <button className="w-full text-left px-5 py-3 text-xs font-semibold text-gray-700 hover:bg-gray-50" onClick={() => setVerSemanas(!verSemanas)}>
                  {verSemanas ? '▾' : '▸'} Necesidad por semana ({p.semanas.length} semanas)
                </button>
                {verSemanas && (
                  <div className="overflow-x-auto pb-3">
                    <table className="w-full text-left text-xs">
                      <thead className="text-gray-400 text-[10px] font-bold uppercase"><tr><th className="px-5 py-2">Semana del</th>{p.materiales.map((m) => <th key={m.materialId} className="px-3 py-2 text-right">{m.nombre} ({m.unidad})</th>)}</tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {p.semanas.map((s) => (
                          <tr key={s.desde}><td className="px-5 py-2 whitespace-nowrap">{fmtFechaCorta(s.desde)}</td>{p.materiales.map((m) => <td key={m.materialId} className="px-3 py-2 text-right">{fmtN(s.cantidades[m.materialId] ?? 0)}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="px-5 pb-5 text-xs text-gray-500">Los rubros no tienen insumos por unidad. Defínelos en cada rubro para calcular la necesidad de producto.</p>
        )}
      </section>

      <ModalDetalleRubro f={detalle} puedeEditar={puedeEditar} onCerrar={() => setDetalle(null)} onEditar={() => { setDetalle(null); setConfig(true); }} />
      <ModalConfigPrograma abierto={config} obraId={obra.id} p={p} onCerrar={() => setConfig(false)} onHecho={(n) => { setConfig(false); setP(n); }} />
    </div>
  );
};

// ------------------------------------------------------------------ Gantt
const Gantt: React.FC<{ p: Programa; onRubro: (f: FilaPrograma) => void }> = ({ p, onRubro }) => {
  const a = t(p.rango.desde);
  const b = t(p.rango.hasta) + DIA;
  const x = (s: string) => Math.max(0, Math.min(100, ((t(s) - a) / (b - a)) * 100));
  const xFin = (s: string) => Math.max(0, Math.min(100, ((t(s) + DIA - a) / (b - a)) * 100));
  // Marcas de mes; el mes inicial se rotula al comienzo aunque el plazo empiece a mitad de mes
  const meses: string[] = [p.rango.desde];
  const d = new Date(a);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  while (d.getTime() < b) {
    meses.push(d.toISOString().slice(0, 10));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  const hoy = x(p.hoy);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="flex border-b border-gray-200 pb-1">
          <div className="w-56 shrink-0 text-[10px] font-bold uppercase text-gray-400">Rubro</div>
          <div className="flex-1 relative h-4">
            {meses.map((m, i) => <span key={m} className={`absolute text-[10px] text-gray-400 whitespace-nowrap ${i ? '-translate-x-1/2' : ''}`} style={{ left: `${x(m)}%` }}>{MES[+m.slice(5, 7) - 1]} {m.slice(2, 4)}</span>)}
          </div>
        </div>
        {p.rubros.map((f) => {
          const nivel = f.alertas.some((z) => z.nivel === 'CRITICO') ? 'bg-red-500' : f.alertas.some((z) => z.nivel === 'ATENCION') ? 'bg-amber-500' : 'bg-emerald-500';
          const l = x(f.inicio);
          const w = Math.max(0.8, xFin(f.fin) - l);
          const tarde = f.finEstimado && f.finEstimado > f.fin;
          return (
            <button key={f.obraRubroId} className="flex w-full items-center py-2 border-b border-gray-50 hover:bg-gray-50 text-left" onClick={() => onRubro(f)}>
              <div className="w-56 shrink-0 pr-3">
                <div className="text-[11px] font-semibold text-gray-800 truncate">{(f.codigo ? f.codigo + ' ' : '') + f.descripcion}</div>
                <div className="text-[10px] text-gray-400">{fmtFechaCorta(f.inicio)} a {fmtFechaCorta(f.fin)} · {fmtPct(f.avance)}</div>
              </div>
              <div className="flex-1 relative h-5">
                {meses.map((m) => <span key={m} className="absolute top-0 bottom-0 border-l border-gray-100" style={{ left: `${x(m)}%` }} />)}
                <div className="absolute top-1 h-3 rounded bg-gray-200 overflow-hidden" style={{ left: `${l}%`, width: `${w}%` }}>
                  <div className={`h-full ${nivel}`} style={{ width: `${Math.min(100, f.avance * 100)}%` }} />
                </div>
                {tarde && (
                  <div className="absolute top-1 h-3 rounded-r border border-red-300 bg-[repeating-linear-gradient(45deg,#fecaca_0,#fecaca_3px,transparent_3px,transparent_6px)]"
                    style={{ left: `${xFin(f.fin)}%`, width: `${Math.max(0.5, xFin(f.finEstimado!) - xFin(f.fin))}%` }} title={`Fin estimado ${f.finEstimado}`} />
                )}
                <span className="absolute top-0 bottom-0 border-l-2 border-red-500" style={{ left: `${hoy}%` }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const ModalDetalleRubro: React.FC<{ f: FilaPrograma | null; puedeEditar: boolean; onCerrar: () => void; onEditar: () => void }> = ({ f, puedeEditar, onCerrar, onEditar }) => {
  if (!f) return null;
  return (
    <Modal abierto titulo={f.descripcion} subtitulo={f.codigo ?? undefined} onCerrar={onCerrar} ancho="md"
      pie={<>{puedeEditar && <button className={btnSecundario} onClick={onEditar}>Editar plazos y rendimientos</button>}<button className={btnPrimario} onClick={onCerrar}>Cerrar</button></>}>
      <div className="space-y-3 text-xs text-gray-600">
        <BarraAvance valor={f.avance} />
        <p>
          Programado del {fmtFechaCorta(f.inicio)} al {fmtFechaCorta(f.fin)}. Ejecutado <b>{fmtN(f.ejecutado)}</b> de {fmtN(f.cantidad)} {f.unidad} ({fmtPct(f.avance)}).
          Debería llevar {fmtN(f.esperado)}{f.atraso > 0 && <span className="text-red-600 font-semibold">: atraso de {fmtN(f.atraso)} {f.unidad}</span>}.
        </p>
        <p>
          Mínimo para cumplir: {f.saldo ? (f.vencido ? 'plazo vencido' : `${fmtN(f.minimoDia)} ${f.unidad}/día en ${f.diasHabilesRestantes} días hábiles`) : 'terminado'}.
          Planificado: {f.rendPlanificado ? `${fmtN(f.rendPlanificado)}/día` : 'sin definir'}. Real: {fmtN(f.rendReal)}/día.
          {f.finEstimado && ` Fin estimado: ${fmtFechaCorta(f.finEstimado)}.`}
        </p>
        {f.alertas.map((a, i) => <p key={i} className="flex gap-2 items-start"><ChipNivel nivel={a.nivel} /><span>{a.texto}</span></p>)}
      </div>
    </Modal>
  );
};

// ------------------------------------------------------------------ Configuración
const ModalConfigPrograma: React.FC<{ abierto: boolean; obraId: string; p: Programa; onCerrar: () => void; onHecho: (p: Programa) => void }> = ({ abierto, obraId, p, onCerrar, onHecho }) => {
  const [g, setG] = useState({ ds: '6', ventana: '14', cobertura: '7', entrega: '7' });
  const [rs, setRs] = useState<Record<string, { inicio: string; fin: string; rend: string }>>({});
  const [mins, setMins] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setError('');
    setG({ ds: String(p.config.diasLaborablesSemana), ventana: String(p.config.ventanaRitmoDias), cobertura: String(p.config.diasCobertura), entrega: String(p.config.diasEntrega) });
    setRs(Object.fromEntries(p.rubros.map((f) => [f.obraRubroId, { inicio: f.inicioPropio ?? '', fin: f.finPropio ?? '', rend: f.rendPlanificado != null ? String(f.rendPlanificado) : '' }])));
    setMins(Object.fromEntries(p.materiales.map((m) => [m.materialId, m.minimoFijo != null ? String(m.minimoFijo) : ''])));
  }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async () => {
    const ent = (s: string, min: number, max: number, nombre: string) => {
      const n = Number(s);
      if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${nombre}: entre ${min} y ${max}`);
      return n;
    };
    try {
      const rubros = p.rubros.map((f) => {
        const v = rs[f.obraRubroId];
        if (v.inicio && v.fin && v.fin < v.inicio) throw new Error(`${f.descripcion}: el fin es anterior al inicio`);
        const rend = leerNumero(v.rend);
        if (rend != null && rend < 0) throw new Error(`${f.descripcion}: rendimiento no válido`);
        return { obraRubroId: f.obraRubroId, inicio: v.inicio || null, fin: v.fin || null, rendDia: rend };
      });
      const stockMinimo = p.materiales.map((m) => ({ materialId: m.materialId, cantidad: leerNumero(mins[m.materialId] ?? '') }));
      const datos = {
        diasLaborablesSemana: Number(g.ds),
        ventanaRitmoDias: ent(g.ventana, 1, 90, 'Ventana del ritmo real'),
        diasCobertura: ent(g.cobertura, 1, 120, 'Días de cobertura'),
        diasEntrega: ent(g.entrega, 0, 120, 'Días de producción y entrega'),
        rubros,
        stockMinimo,
      };
      setOcupado(true);
      setError('');
      onHecho(await programaAPI.guardar(obraId, datos));
    } catch (e) {
      setError(e instanceof Error && !('isAxiosError' in e) ? e.message : mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal abierto={abierto} titulo="Plazos y rendimientos" subtitulo="Si dejas vacías las fechas de un rubro se usa el plazo de la obra" onCerrar={onCerrar} ancho="3xl"
      pie={<><button className={btnSecundario} onClick={onCerrar}>Cancelar</button><button className={btnPrimario} onClick={guardar} disabled={ocupado}>{ocupado ? 'Guardando...' : 'Guardar programa'}</button></>}>
      <div className="space-y-5">
        <p className="text-[11px] text-gray-500">Plazo general de la obra: {fmtFechaCorta(p.config.fechaInicio)} a {fmtFechaCorta(p.config.fechaFin)} (se cambia en Editar obra).</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Campo etiqueta="Días de trabajo / semana">
            <select className={inputCls} value={g.ds} onChange={(e) => setG({ ...g, ds: e.target.value })}>
              <option value="5">5 (lun-vie)</option><option value="6">6 (lun-sáb)</option><option value="7">7</option>
            </select>
          </Campo>
          <Campo etiqueta="Ritmo real: últimos (días)"><input className={inputCls} inputMode="numeric" value={g.ventana} onChange={(e) => setG({ ...g, ventana: e.target.value })} /></Campo>
          <Campo etiqueta="Días de cobertura"><input className={inputCls} inputMode="numeric" value={g.cobertura} onChange={(e) => setG({ ...g, cobertura: e.target.value })} /></Campo>
          <Campo etiqueta="Producción y entrega (días)"><input className={inputCls} inputMode="numeric" value={g.entrega} onChange={(e) => setG({ ...g, entrega: e.target.value })} /></Campo>
        </div>

        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Por rubro</p>
          {p.rubros.map((f) => {
            const v = rs[f.obraRubroId] ?? { inicio: '', fin: '', rend: '' };
            const set = (k: 'inicio' | 'fin' | 'rend', val: string) => setRs({ ...rs, [f.obraRubroId]: { ...v, [k]: val } });
            return (
              <div key={f.obraRubroId} className="border border-gray-100 rounded-xl p-3 space-y-2">
                <div>
                  <b className="text-xs text-gray-800">{f.descripcion}</b>
                  <p className="text-[11px] text-gray-500">Saldo {fmtN(f.saldo)} {f.unidad}. Mínimo para cumplir: {f.minimoDia != null && f.saldo ? `${fmtN(f.minimoDia)} ${f.unidad}/día` : '—'}.</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Campo etiqueta="Inicio"><input type="date" className={inputCls} value={v.inicio} onChange={(e) => set('inicio', e.target.value)} /></Campo>
                  <Campo etiqueta="Fin"><input type="date" className={inputCls} value={v.fin} onChange={(e) => set('fin', e.target.value)} /></Campo>
                  <Campo etiqueta={`${f.unidad} por día`}><input className={inputCls} inputMode="decimal" placeholder={f.minimoDia ? fmtN(Math.ceil(f.minimoDia), 0) : ''} value={v.rend} onChange={(e) => set('rend', e.target.value)} /></Campo>
                </div>
              </div>
            );
          })}
        </div>

        {p.materiales.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Stock mínimo fijo por material <span className="normal-case font-normal">(opcional, reemplaza el cálculo por días de cobertura)</span></p>
            <div className="grid sm:grid-cols-2 gap-3">
              {p.materiales.map((m) => (
                <Campo key={m.materialId} etiqueta={`${m.nombre} (${m.unidad})`}>
                  <input className={inputCls} inputMode="decimal" placeholder={fmtN(m.consumoDia * Number(g.cobertura || 0))} value={mins[m.materialId] ?? ''} onChange={(e) => setMins({ ...mins, [m.materialId]: e.target.value })} />
                </Campo>
              ))}
            </div>
          </div>
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}
      </div>
    </Modal>
  );
};
