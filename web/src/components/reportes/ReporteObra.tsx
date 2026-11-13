import React, { useCallback, useEffect, useState } from 'react';
import { BsChevronDown, BsChevronRight, BsDownload } from 'react-icons/bs';
import { reportesAPI } from '../../api';
import { mensajeError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Obra, ReporteObra as Reporte } from '../../types';
import { fmtUSD } from '../common/EstadoChip';
import { Aviso, Cargando, btnSecundario, inputCls } from '../common/Modal';
import { fmtN, fmtPct } from '../ejecucion/comunes';
import { KpiPl } from '../planillas/comunes';
import { BarraConsumo, ChipEval, EscalaRend, rangoRapido, rangoTxt, valorRend, varTxt } from './comunes';

/** Pestaña Reporte de la obra: avance por rubro, consumo real vs. programado y rendimientos, en un período. */
export const ReporteObra: React.FC<{ obra: Obra }> = ({ obra }) => {
  const { hasPermission } = useAuth();
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [r, setR] = useState<Reporte | null>(null);
  const [error, setError] = useState('');
  const [verDetalle, setVerDetalle] = useState(false);
  const [diasDe, setDiasDe] = useState<number | null>(null);

  const cargar = useCallback(() => {
    setError('');
    reportesAPI.obra(obra.id, desde || undefined, hasta || undefined).then(setR).catch((e) => setError(mensajeError(e)));
  }, [obra.id, desde, hasta]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const rango = (k: 'mes' | 'sem' | 'todo') => {
    const x = rangoRapido(k);
    setDesde(x.desde);
    setHasta(x.hasta);
  };
  const n = { ok: 0, alerta: 0, fuera: 0 };
  r?.materiales.forEach((m) => { if (m.evaluacion.k !== 'nd') n[m.evaluacion.k]++; });

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-wrap items-end gap-3">
        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Desde<input type="date" className={`${inputCls} mt-1`} value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} /></label>
        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Hasta<input type="date" className={`${inputCls} mt-1`} value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} /></label>
        <div className="flex gap-1">
          {([['mes', 'Este mes'], ['sem', 'Últimos 7 días'], ['todo', 'Todo']] as const).map(([k, t]) => (
            <button key={k} className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50" onClick={() => rango(k)}>{t}</button>
          ))}
        </div>
        {hasPermission('reportes.exportar') && (
          <button className={`${btnSecundario} ml-auto`} onClick={() => reportesAPI.exportarObra(obra.id, `reporte_${obra.nombre}.xlsx`, desde || undefined, hasta || undefined).catch((e) => setError(mensajeError(e)))}>
            <BsDownload className="inline mr-1.5" />Excel
          </button>
        )}
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!r ? <Cargando texto="Calculando reporte..." /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiPl valor={fmtUSD(r.totales.montoPeriodo)} etiqueta={desde || hasta ? 'Ejecutado en el período' : 'Ejecutado'} />
            <KpiPl valor={fmtUSD(r.totales.montoAcumulado)} etiqueta={`Acumulado de ${fmtUSD(r.totales.contratado)}`} />
            <KpiPl valor={fmtPct(r.totales.pct)} etiqueta="Avance económico" />
            <KpiPl valor={`${n.fuera} / ${n.alerta}`} etiqueta="Materiales fuera / en alerta" tono={n.fuera ? 'alerta' : 'normal'} />
          </div>

          <section className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
            <h3 className="px-5 pt-4 pb-2 text-sm font-bold text-gray-800">Avance por rubro</h3>
            <table className="w-full text-left text-xs">
              <thead className="text-gray-400 uppercase text-[10px] tracking-wider font-bold bg-gray-50/50 border-y border-gray-100">
                <tr><th className="px-5 py-2">Rubro</th><th className="px-2 py-2 text-right">En el período</th><th className="px-2 py-2 text-right">P. unitario</th><th className="px-2 py-2 text-right">Monto período</th><th className="px-2 py-2 text-right">Acumulado</th><th className="px-2 py-2 text-right">Monto acumulado</th><th className="px-5 py-2 text-right">% avance</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {r.rubros.map((x) => (
                  <tr key={x.id}>
                    <td className="px-5 py-2 font-semibold text-gray-800">{x.codigo ? <span className="text-gray-400 font-normal mr-1">{x.codigo}</span> : null}{x.descripcion} <span className="font-normal text-gray-400">({x.unidad})</span></td>
                    <td className="px-2 py-2 text-right">{fmtN(x.periodo)}</td>
                    <td className="px-2 py-2 text-right text-gray-500">{fmtUSD(x.pu)}</td>
                    <td className="px-2 py-2 text-right font-semibold">{fmtUSD(x.montoPeriodo)}</td>
                    <td className="px-2 py-2 text-right">{fmtN(x.acumulado)} / {fmtN(x.cantidad)}</td>
                    <td className="px-2 py-2 text-right">{fmtUSD(x.montoAcumulado)}</td>
                    <td className={`px-5 py-2 text-right ${x.pct != null && x.pct > 1.0001 ? 'text-red-600 font-bold' : 'text-gray-600'}`}>{x.pct != null ? fmtPct(x.pct) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
            <div className="px-5 pt-4 pb-2">
              <h3 className="text-sm font-bold text-gray-800">Consumo de materiales</h3>
              <p className="text-[11px] text-gray-500">Real (consumos de bodega) frente a lo programado (avances × insumos de cada rubro). Tolerancias ±{r.umbrales.t1} % y ±{r.umbrales.t2} %.</p>
            </div>
            {r.materiales.length === 0 ? <p className="px-5 pb-4 text-xs text-gray-400">Sin consumos ni avances con insumos en el período.</p> : (
              <table className="w-full text-left text-xs">
                <thead className="text-gray-400 uppercase text-[10px] tracking-wider font-bold bg-gray-50/50 border-y border-gray-100">
                  <tr><th className="px-5 py-2">Material</th><th className="px-2 py-2 text-right">Programado</th><th className="px-2 py-2 text-right">Real</th><th className="px-2 py-2">Real vs. programado</th><th className="px-2 py-2 text-right">Variación</th><th className="px-2 py-2 text-right">Valor dif.</th><th className="px-5 py-2">Estado</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {r.materiales.map((m) => (
                    <tr key={m.materialId}>
                      <td className="px-5 py-2 font-semibold text-gray-800">{m.nombre} <span className="font-normal text-gray-400">({m.unidad})</span></td>
                      <td className="px-2 py-2 text-right">{fmtN(m.programado, 2)}</td>
                      <td className="px-2 py-2 text-right font-semibold">{fmtN(m.real, 2)}</td>
                      <td className="px-2 py-2"><BarraConsumo prog={m.programado} real={m.real} k={m.evaluacion.k} /></td>
                      <td className="px-2 py-2 text-right text-gray-600">{varTxt(m.evaluacion.v)}</td>
                      <td className="px-2 py-2 text-right text-gray-600">{m.valorDiferencia ? fmtUSD(m.valorDiferencia) : '—'}</td>
                      <td className="px-5 py-2"><ChipEval e={m.evaluacion} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {r.sinRubro > 0 && <p className="px-5 py-2 text-[11px] text-amber-700">{r.sinRubro} consumo(s) sin rubro: cuentan en el total del material pero no en el detalle por rubro.</p>}
            {r.detalle.length > 0 && (
              <div className="border-t border-gray-100">
                <button className="w-full flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-gray-700" onClick={() => setVerDetalle(!verDetalle)}>
                  {verDetalle ? <BsChevronDown /> : <BsChevronRight />} Detalle por rubro y material ({r.detalle.length})
                </button>
                {verDetalle && (
                  <table className="w-full text-left text-xs">
                    <tbody className="divide-y divide-gray-100">
                      {r.detalle.map((d) => (
                        <tr key={`${d.obraRubroId}|${d.materialId}`}>
                          <td className="px-5 py-1.5 text-gray-700">{d.rubro}</td>
                          <td className="px-2 py-1.5 text-gray-600">{d.material}</td>
                          <td className="px-2 py-1.5 text-right">{fmtN(d.programado, 2)}</td>
                          <td className="px-2 py-1.5 text-right font-semibold">{fmtN(d.real, 2)} {d.unidad}</td>
                          <td className="px-5 py-1.5"><ChipEval e={d.evaluacion} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-bold text-gray-800">Rendimiento por material</h3>
              <p className="text-[11px] text-gray-500">Cruza lo producido en los avances con lo consumido en bodega. Las líneas de termoplástico se llevan a metros equivalentes de 15 cm (los m² se dividen para 0,15).</p>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {r.rendimientos.map((x) => (
                <div key={x.id} className="bg-white border border-gray-200 rounded-2xl p-4">
                  <div className="flex justify-between items-start gap-2">
                    <b className="text-sm text-gray-800">{x.nombre}</b>
                    <ChipEval e={x.evaluacion} />
                  </div>
                  <div className="mt-1 text-2xl font-black text-gray-900">{valorRend(x.valor)} <span className="text-xs font-semibold text-gray-500">{x.unidadN} por {x.unidadD}</span></div>
                  <EscalaRend r={x} />
                  <p className="text-[11px] text-gray-500 mt-1">
                    {x.tipo === 'DOSIS'
                      ? `${x.materiales}: ${fmtN(x.N, 2)} ${x.unidadN}. ${x.base}: ${fmtN(x.D, 2)} ${x.unidadD}.`
                      : `Producción: ${fmtN(x.N)} ${x.unidadN}. Consumo de ${x.materiales}: ${fmtN(x.D, 2)} ${x.unidadD}.`}
                  </p>
                  <p className="text-[11px] text-gray-400">{rangoTxt(x)}</p>
                  {x.dias.length > 0 && (
                    <>
                      <button className="mt-2 text-[11px] font-semibold text-gray-600 hover:text-gray-900" onClick={() => setDiasDe(diasDe === x.id ? null : x.id)}>
                        {diasDe === x.id ? 'Ocultar días' : `Ver por día (${x.dias.length})`}
                      </button>
                      {diasDe === x.id && (
                        <table className="w-full text-[11px] mt-1">
                          <tbody className="divide-y divide-gray-100">
                            {x.dias.map((d) => (
                              <tr key={d.fecha}>
                                <td className="py-1 text-gray-600">{d.fecha.split('-').reverse().join('/')}</td>
                                <td className="py-1 text-right">{fmtN(d.n, 2)}</td>
                                <td className="py-1 text-right text-gray-500">{fmtN(d.d, 3)}</td>
                                <td className="py-1 text-right font-semibold">{valorRend(d.v)}</td>
                                <td className="py-1 pl-2">{d.evaluacion ? <ChipEval e={d.evaluacion} /> : <span className="text-gray-300">—</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </>
                  )}
                </div>
              ))}
              {r.rendimientos.length === 0 && <p className="text-xs text-gray-400">No hay rendimientos configurados (Catálogo › Rendimientos).</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
};
