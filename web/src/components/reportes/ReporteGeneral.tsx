import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BsFilePdf, BsPrinter } from 'react-icons/bs';
import { reportesAPI } from '../../api';
import { mensajeError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { ReporteGeneral as Reporte } from '../../types';
import { fmtUSD } from '../common/EstadoChip';
import { Aviso, Cargando, btnPrimario, inputCls } from '../common/Modal';
import { fmtN, fmtPct } from '../ejecucion/comunes';
import { KpiPl } from '../planillas/comunes';
import { ChipEval, rangoRapido, valorRend } from './comunes';

const SECC = { eco: 'Resumen económico', rub: 'Avance por rubro', rend: 'Rendimiento de materiales', cons: 'Consumo de materiales', hab: 'Obras en habilitación' } as const;
type Secc = keyof typeof SECC;
const ESTADO_TXT: Record<string, string> = { ACTIVA: 'En ejecución', PAUSADA: 'Suspendida', CERRADA: 'Cerrada', HABILITACION: 'Habilitación' };
const fmtDia = (s: string | null) => (s ? s.split('-').reverse().join('/') : null);
const periodoTxt = (d: string | null, h: string | null) => `${fmtDia(d) ?? 'inicio'} a ${fmtDia(h) ?? 'hoy'}`;

/** Reporte general: todas tus obras en un solo informe, listo para PDF (como la app anterior). */
export const PaginaReporteGeneral: React.FC = () => {
  const { hasPermission } = useAuth();
  const [desde, setDesde] = useState(rangoRapido('mes').desde);
  const [hasta, setHasta] = useState(rangoRapido('mes').hasta);
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set());
  const [secc, setSecc] = useState<Set<Secc>>(new Set(Object.keys(SECC) as Secc[]));
  const [r, setR] = useState<Reporte | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    reportesAPI.general({ desde: desde || undefined, hasta: hasta || undefined }).then(setR).catch((e) => setError(mensajeError(e)));
  }, [desde, hasta]);

  const incluidas = useMemo(() => (r ? r.visibles.filter((o) => !excluidas.has(o.id)) : []), [r, excluidas]);
  const filas = r?.obras.filter((x) => !excluidas.has(x.obra.id)) ?? [];
  const hab = r?.habilitacion.filter((x) => !excluidas.has(x.id)) ?? [];
  const con = filas.reduce((s, x) => s + x.totales.contratado, 0);
  const ej = filas.reduce((s, x) => s + x.totales.montoAcumulado, 0);
  const ejP = filas.reduce((s, x) => s + x.totales.montoPeriodo, 0);
  const alertas = filas.reduce((s, x) => s + x.alertas, 0);

  const pdf = () => {
    const q = new URLSearchParams();
    if (desde) q.set('desde', desde);
    if (hasta) q.set('hasta', hasta);
    q.set('obras', incluidas.map((o) => o.id).join(','));
    q.set('secc', [...secc].join(','));
    window.open(`/reportes/imprimir?${q}`, '_blank');
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Reporte general</h1>
        <p className="text-xs text-gray-500 mt-1">Todas tus obras en un solo informe, listo para enviar en PDF.</p>
      </div>
      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Desde<input type="date" className={`${inputCls} mt-1`} value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Hasta<input type="date" className={`${inputCls} mt-1`} value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
          {([['mes', 'Este mes'], ['sem', 'Últimos 7 días'], ['todo', 'Todo']] as const).map(([k, t]) => (
            <button key={k} className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50" onClick={() => { const x = rangoRapido(k); setDesde(x.desde); setHasta(x.hasta); }}>{t}</button>
          ))}
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Obras incluidas</p>
          <div className="flex flex-wrap gap-2">
            {r?.visibles.map((o) => (
              <label key={o.id} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${excluidas.has(o.id) ? 'border-gray-200 text-gray-400' : 'border-gray-300 text-gray-800 bg-gray-50'}`}>
                <input type="checkbox" checked={!excluidas.has(o.id)} onChange={() => { const n = new Set(excluidas); if (n.has(o.id)) n.delete(o.id); else n.add(o.id); setExcluidas(n); }} />
                {o.nombre}
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Secciones del PDF</p>
          <div className="flex flex-wrap gap-3">
            {(Object.keys(SECC) as Secc[]).map((k) => (
              <label key={k} className="flex items-center gap-1.5 text-xs text-gray-700">
                <input type="checkbox" checked={secc.has(k)} onChange={() => { const n = new Set(secc); if (n.has(k)) n.delete(k); else n.add(k); setSecc(n); }} />{SECC[k]}
              </label>
            ))}
          </div>
        </div>
        {hasPermission('reportes.exportar') && (
          <button className={btnPrimario} disabled={!incluidas.length || !secc.size} onClick={pdf}><BsFilePdf className="inline mr-1.5" />Descargar PDF</button>
        )}
      </section>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!r ? <Cargando texto="Calculando..." /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiPl valor={fmtPct(con ? ej / con : 0)} etiqueta="Avance económico" />
            <KpiPl valor={fmtUSD(ej)} etiqueta={`Ejecutado de ${fmtUSD(con)}`} />
            <KpiPl valor={fmtUSD(ejP)} etiqueta={`En el período (${periodoTxt(r.periodo.desde, r.periodo.hasta)})`} />
            <KpiPl valor={String(alertas)} etiqueta="Alertas (consumo y rendimiento)" tono={alertas ? 'alerta' : 'normal'} />
          </div>
          <TablaEconomica filas={filas} />
          {hab.length > 0 && (
            <section className="bg-white border border-gray-200 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-2">Obras en habilitación</h3>
              <div className="divide-y divide-gray-100">
                {hab.map((h) => (
                  <div key={h.id} className="py-2 flex justify-between text-xs">
                    <span className="font-semibold text-gray-800">{h.nombre}</span>
                    <span className="text-gray-500">{h.hechos}/{h.total} requisitos · {h.contratistas} contratista(s) · {h.firmas}/2 firmas</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};

const TablaEconomica: React.FC<{ filas: Reporte['obras']; impreso?: boolean }> = ({ filas, impreso }) => {
  const th = impreso ? 'border border-gray-600 px-1.5 py-1 text-left' : 'px-3 py-2';
  const td = impreso ? 'border border-gray-600 px-1.5 py-1' : 'px-3 py-2';
  return (
    <section className={impreso ? '' : 'bg-white border border-gray-200 rounded-2xl overflow-x-auto'}>
      {!impreso && <h3 className="px-5 pt-4 pb-2 text-sm font-bold text-gray-800">Resumen económico</h3>}
      <table className="w-full text-left text-xs">
        <thead className={impreso ? '' : 'text-gray-400 uppercase text-[10px] tracking-wider font-bold bg-gray-50/50 border-y border-gray-100'}>
          <tr><th className={th}>Obra</th><th className={th}>Estado</th><th className={`${th} text-right`}>Contratado</th><th className={`${th} text-right`}>Ejecutado</th><th className={`${th} text-right`}>Avance</th><th className={`${th} text-right`}>Período</th><th className={`${th} text-right`}>Alertas</th></tr>
        </thead>
        <tbody className={impreso ? '' : 'divide-y divide-gray-100'}>
          {filas.map((x) => (
            <tr key={x.obra.id}>
              <td className={`${td} font-semibold`}>{x.obra.nombre}</td>
              <td className={td}>{ESTADO_TXT[x.obra.estado] ?? x.obra.estado}</td>
              <td className={`${td} text-right`}>{fmtUSD(x.totales.contratado)}</td>
              <td className={`${td} text-right`}>{fmtUSD(x.totales.montoAcumulado)}</td>
              <td className={`${td} text-right`}>{fmtPct(x.totales.pct)}</td>
              <td className={`${td} text-right`}>{fmtUSD(x.totales.montoPeriodo)}</td>
              <td className={`${td} text-right ${x.alertas && !impreso ? 'text-amber-700 font-bold' : ''}`}>{x.alertas}</td>
            </tr>
          ))}
          {filas.length === 0 && <tr><td className={td} colSpan={7}>Sin obras en ejecución.</td></tr>}
        </tbody>
      </table>
    </section>
  );
};

/** Vista de impresión del reporte general (A4 vertical; «Guardar como PDF»). */
export const ImprimirReporteGeneral: React.FC = () => {
  const [sp] = useSearchParams();
  const [r, setR] = useState<Reporte | null>(null);
  const [error, setError] = useState('');
  const desde = sp.get('desde') ?? undefined;
  const hasta = sp.get('hasta') ?? undefined;
  const obras = sp.get('obras') ?? '';
  const secc = new Set((sp.get('secc') ?? 'eco,rub,rend,cons,hab').split(','));

  useEffect(() => {
    const p = { desde, hasta, obras };
    reportesAPI.general(p).then((x) => {
      setR(x);
      document.title = `Reporte general ${periodoTxt(x.periodo.desde, x.periodo.hasta)}`;
      reportesAPI.impreso(p).catch(() => undefined);
    }).catch((e) => setError(mensajeError(e)));
  }, [desde, hasta, obras]);

  if (error) return <div className="p-8 text-sm text-red-600">{error}</div>;
  if (!r) return <div className="p-8 text-sm text-gray-500">Preparando reporte...</div>;
  const con = r.obras.reduce((s, x) => s + x.totales.contratado, 0);
  const ej = r.obras.reduce((s, x) => s + x.totales.montoAcumulado, 0);
  const ejP = r.obras.reduce((s, x) => s + x.totales.montoPeriodo, 0);
  const th = 'border border-gray-600 px-1.5 py-1 text-left font-bold';
  const td = 'border border-gray-600 px-1.5 py-1';
  return (
    <div className="hoja bg-white text-black text-[9pt] leading-snug">
      <style>{`
        @page { size: A4 portrait; margin: 12mm; @bottom-right { content: "Página " counter(page) " de " counter(pages); font-size: 7pt; } }
        @media print { .no-imprimir { display: none !important; } }
        .hoja { font-family: Arial, Helvetica, sans-serif; max-width: 190mm; margin: 0 auto; }
        .hoja table { border-collapse: collapse; width: 100%; }
        .hoja tr, .bloque { page-break-inside: avoid; }
        .hoja thead { display: table-header-group; }
      `}</style>
      <div className="no-imprimir sticky top-0 z-10 bg-gray-900 text-white flex items-center justify-between px-4 py-2 mb-4 text-xs">
        <span>Vista de impresión · A4. Para PDF elige «Guardar como PDF».</span>
        <button className="px-3 py-1.5 rounded bg-white text-gray-900 font-bold" onClick={() => window.print()}><BsPrinter className="inline mr-1.5" />Imprimir / PDF</button>
      </div>
      <div className="px-2 space-y-4">
        <div>
          <div className="text-[13pt] font-black uppercase">Reporte general de obras</div>
          <div>Período {periodoTxt(r.periodo.desde, r.periodo.hasta)} · generado el {new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}</div>
        </div>
        <table><tbody><tr>
          <td className={td}><b>Avance económico</b><br />{fmtPct(con ? ej / con : 0)}</td>
          <td className={td}><b>Ejecutado</b><br />{fmtUSD(ej)} de {fmtUSD(con)}</td>
          <td className={td}><b>En el período</b><br />{fmtUSD(ejP)}</td>
          <td className={td}><b>Alertas</b><br />{r.obras.reduce((s, x) => s + x.alertas, 0)}</td>
        </tr></tbody></table>
        {secc.has('eco') && <div className="bloque"><h2 className="font-bold text-[10.5pt] mb-1">{SECC.eco}</h2><TablaEconomica filas={r.obras} impreso /></div>}
        {secc.has('rend') && (
          <div className="bloque">
            <h2 className="font-bold text-[10.5pt] mb-1">{SECC.rend}</h2>
            <table>
              <thead><tr><th className={th}>Obra</th><th className={th}>Rendimiento</th><th className={th}>Valor</th><th className={th}>Rango</th><th className={th}>Estado</th></tr></thead>
              <tbody>
                {r.obras.flatMap((x) => x.rendimientos.map((d) => (
                  <tr key={`${x.obra.id}-${d.id}`}>
                    <td className={td}>{x.obra.nombre}</td><td className={td}>{d.nombre}</td>
                    <td className={td}>{valorRend(d.valor)} {d.unidadN}/{d.unidadD}</td>
                    <td className={td}>{[d.minimo, d.ideal, d.maximo].map((v) => (v == null ? '—' : fmtN(v))).join(' / ')}</td>
                    <td className={td}>{d.evaluacion.t}</td>
                  </tr>
                )))}
                {!r.obras.some((x) => x.rendimientos.length) && <tr><td className={td} colSpan={5}>Sin datos de rendimiento en el período.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {(secc.has('rub') || secc.has('cons')) && r.obras.map((x) => (
          <div key={x.obra.id} className="space-y-2" style={{ pageBreakBefore: 'always' }}>
            <h2 className="font-bold text-[11pt]">{x.obra.nombre}{x.obra.cliente ? ` · ${x.obra.cliente}` : ''}</h2>
            <div>Contratado {fmtUSD(x.totales.contratado)} · ejecutado {fmtUSD(x.totales.montoAcumulado)} ({fmtPct(x.totales.pct)}) · en el período {fmtUSD(x.totales.montoPeriodo)}</div>
            {secc.has('rub') && (
              <table>
                <thead><tr><th className={th}>Rubro</th><th className={th}>Unid.</th><th className={th}>Período</th><th className={th}>Monto período</th><th className={th}>Acumulado</th><th className={th}>% avance</th></tr></thead>
                <tbody>
                  {x.rubros.map((u) => (
                    <tr key={u.id}><td className={td}>{u.descripcion}</td><td className={td}>{u.unidad}</td><td className={`${td} text-right`}>{fmtN(u.periodo)}</td><td className={`${td} text-right`}>{fmtUSD(u.montoPeriodo)}</td><td className={`${td} text-right`}>{fmtN(u.acumulado)} / {fmtN(u.cantidad)}</td><td className={`${td} text-right`}>{u.pct != null ? fmtPct(u.pct) : ''}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {secc.has('cons') && x.materiales.length > 0 && (
              <table>
                <thead><tr><th className={th}>Material</th><th className={th}>Programado</th><th className={th}>Real</th><th className={th}>Estado</th></tr></thead>
                <tbody>
                  {x.materiales.map((m) => (
                    <tr key={m.materialId}><td className={td}>{m.nombre} ({m.unidad})</td><td className={`${td} text-right`}>{fmtN(m.programado, 2)}</td><td className={`${td} text-right`}>{fmtN(m.real, 2)}</td><td className={td}><ChipEval e={m.evaluacion} /></td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
        {secc.has('hab') && r.habilitacion.length > 0 && (
          <div className="bloque">
            <h2 className="font-bold text-[10.5pt] mb-1">{SECC.hab}</h2>
            <table>
              <thead><tr><th className={th}>Obra</th><th className={th}>Requisitos</th><th className={th}>Contratistas</th><th className={th}>Firmas</th></tr></thead>
              <tbody>{r.habilitacion.map((h) => <tr key={h.id}><td className={td}>{h.nombre}</td><td className={td}>{h.hechos}/{h.total}</td><td className={td}>{h.contratistas}</td><td className={td}>{h.firmas}/2</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
