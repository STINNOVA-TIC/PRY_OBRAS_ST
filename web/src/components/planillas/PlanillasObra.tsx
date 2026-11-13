import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BsExclamationTriangleFill, BsPaperclip, BsPlusLg } from 'react-icons/bs';
import { planillasAPI } from '../../api';
import { mensajeError } from '../../api/client';
import type { Obra, PlanillaResumen, PropuestaPlanilla, ResumenPlanillas, TipoPlanilla } from '../../types';
import { fmtUSD } from '../common/EstadoChip';
import { Aviso, Campo, Cargando, Modal, btnPrimario, btnSecundario, inputCls } from '../common/Modal';
import { fmtN, hoyEC } from '../ejecucion/comunes';
import { ChipPlanilla, KpiPl, fmtPeriodo } from './comunes';

type Sub = 'cliente' | 'contratistas';

/** Pestaña Planillas de la obra: ST al cliente y a cada contratista (como la app anterior). */
export const PlanillasObra: React.FC<{ obra: Obra }> = ({ obra }) => {
  const navigate = useNavigate();
  const [sub, setSub] = useState<Sub>('cliente');
  const [r, setR] = useState<ResumenPlanillas | null>(null);
  const [error, setError] = useState('');
  const [nueva, setNueva] = useState<{ tipo: TipoPlanilla; obraContratistaId?: string; nombre?: string } | null>(null);

  const cargar = useCallback(() => planillasAPI.resumen(obra.id).then(setR).catch((e) => setError(mensajeError(e))), [obra.id]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  if (!r) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando texto="Cargando planillas..." />;
  const abrir = (p: PlanillaResumen) => navigate(`/obras/${obra.id}/planillas/${p.id}`);
  const deCliente = r.planillas.filter((p) => p.tipo === 'CLIENTE');
  const c = r.cliente;

  return (
    <div className="space-y-5">
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {([['cliente', 'ST al cliente'], ['contratistas', `Contratistas (${r.contratistas.length})`]] as [Sub, string][]).map(([k, t]) => (
            <button key={k} onClick={() => setSub(k)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${sub === k ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}>{t}</button>
          ))}
        </div>
        {sub === 'cliente' && r.puede.elaborar && (
          <button className={btnPrimario} onClick={() => setNueva({ tipo: 'CLIENTE' })}><BsPlusLg className="inline mr-1.5" />Nueva planilla al cliente</button>
        )}
      </div>

      {sub === 'cliente' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiPl valor={fmtUSD(c.montoContrato)} etiqueta="Monto contrato" />
            <KpiPl valor={fmtUSD(c.ejecutado)} etiqueta="Ejecutado (avances)" />
            <KpiPl valor={fmtUSD(c.planillado)} etiqueta="Planillado (sin IVA)" />
            <KpiPl valor={fmtUSD(c.sinPlanillar)} etiqueta="Ejecutado sin planillar" tono={c.sinPlanillar > 0.005 ? 'alerta' : 'normal'} />
          </div>
          {c.porEjecutor.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Ejecutado por (a precio de contrato)</p>
              <div className="flex flex-wrap gap-2">
                {c.porEjecutor.map((e) => (
                  <span key={e.obraContratistaId ?? 'ST'} className="text-xs px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200">
                    <b className="text-gray-800">{e.ejecutor}</b> <span className="text-gray-500">{fmtUSD(e.valor)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <TablaPlanillas planillas={deCliente} onAbrir={abrir} vacio="Aún no hay planillas al cliente." />
          <p className="text-[11px] text-gray-400">
            Cada planilla toma los avances registrados en su período. Al presentarla firma quien la elaboró; luego revisa el Superintendente y aprueba el Administrador.
            Los avances de un período presentado ya no se pueden anular ni registrar con esas fechas.
          </p>
        </>
      )}

      {sub === 'contratistas' && (
        <div className="space-y-4">
          {r.contratistas.length === 0 && (
            <div className="bg-white border border-dashed border-gray-300 rounded-2xl py-10 text-center text-sm text-gray-500">La obra no tiene contratistas.</div>
          )}
          {r.contratistas.map((ct) => {
            const suyas = r.planillas.filter((p) => p.obraContratistaId === ct.obraContratistaId);
            return (
              <section key={ct.obraContratistaId} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap justify-between items-start gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-gray-800">{ct.nombre}</h3>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {ct.n} planilla{ct.n === 1 ? '' : 's'} · Presentado {fmtUSD(ct.presentado)} · Aprobado {fmtUSD(ct.aprobado)} · Pagado {fmtUSD(ct.pagado)} <span className="text-gray-400">(con IVA)</span>
                    </p>
                  </div>
                  {r.puede.elaborar && (
                    <button className={btnSecundario} onClick={() => setNueva({ tipo: 'CONTRATISTA', obraContratistaId: ct.obraContratistaId, nombre: ct.nombre })}>
                      <BsPlusLg className="inline mr-1.5" />Nueva planilla
                    </button>
                  )}
                </div>
                {ct.rubros.length > 0 ? (
                  <div className="overflow-x-auto border border-gray-100 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="text-gray-400 uppercase text-[10px] tracking-wider font-bold bg-gray-50/50 border-b border-gray-100">
                        <tr><th className="px-3 py-2">Rubro</th><th className="px-3 py-2 text-right">Ejecutado</th><th className="px-3 py-2 text-right">Planillado</th><th className="px-3 py-2 text-right">Por planillar</th><th className="px-3 py-2 text-right">P. subcontrato</th></tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {ct.rubros.map((x) => (
                          <tr key={x.obraRubroId}>
                            <td className="px-3 py-2 font-semibold text-gray-800">{x.descripcion} <span className="font-normal text-gray-400">({x.unidad})</span></td>
                            <td className="px-3 py-2 text-right">{fmtN(x.ejecutado)}</td>
                            <td className="px-3 py-2 text-right">{fmtN(x.planillado)}</td>
                            <td className={`px-3 py-2 text-right ${x.porPlanillar > 0.0001 ? 'font-bold text-amber-700' : 'text-gray-400'}`}>{fmtN(x.porPlanillar)}</td>
                            <td className="px-3 py-2 text-right">{x.precioUnitario != null ? fmtN(x.precioUnitario, 4) : <span className="text-gray-300">sin precio</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Sin avances registrados a su nombre.</p>
                )}
                {ct.porPlanillarValor > 0.005 && <p className="text-[11px] text-amber-700 font-semibold">Por planillar ≈ {fmtUSD(ct.porPlanillarValor)} (sin IVA, a precio de subcontrato)</p>}
                {suyas.length > 0 && <TablaPlanillas planillas={suyas} onAbrir={abrir} vacio="" />}
              </section>
            );
          })}
        </div>
      )}

      <ModalNuevaPlanilla obra={obra} datos={nueva} onCerrar={() => setNueva(null)} onCreada={(id) => navigate(`/obras/${obra.id}/planillas/${id}`)} />
    </div>
  );
};

const TablaPlanillas: React.FC<{ planillas: PlanillaResumen[]; onAbrir: (p: PlanillaResumen) => void; vacio: string }> = ({ planillas, onAbrir, vacio }) =>
  planillas.length === 0 ? (
    vacio ? <div className="bg-white border border-dashed border-gray-300 rounded-2xl py-10 text-center text-sm text-gray-500">{vacio}</div> : null
  ) : (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-gray-400 uppercase text-[10px] tracking-wider font-bold bg-gray-50/50 border-b border-gray-100">
          <tr>
            <th className="px-4 py-2.5">N.º</th><th className="px-3 py-2.5">Período</th><th className="px-3 py-2.5">Estado</th>
            <th className="px-3 py-2.5 text-right">Subtotal</th><th className="px-3 py-2.5 text-right">Total + IVA</th><th className="px-4 py-2.5">Siguiente paso</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {planillas.map((p) => (
            <tr key={p.id} className={`hover:bg-gray-50 cursor-pointer ${p.estado === 'ANULADA' ? 'opacity-60' : ''}`} onClick={() => onAbrir(p)}>
              <td className="px-4 py-2.5 font-bold text-gray-800">N.º {p.numero}</td>
              <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{fmtPeriodo(p.periodoDesde, p.periodoHasta)}</td>
              <td className="px-3 py-2.5"><div className="flex items-center gap-1.5"><ChipPlanilla estado={p.estado} />{p.tieneArchivo && <BsPaperclip className="text-gray-400" title="Tiene la planilla firmada" />}</div></td>
              <td className="px-3 py-2.5 text-right">{fmtUSD(p.subtotal)}</td>
              <td className="px-3 py-2.5 text-right font-bold text-gray-800">{fmtUSD(p.total)}</td>
              <td className="px-4 py-2.5 text-gray-500">
                {p.alertas > 0 && ['BORRADOR', 'OBSERVADA', 'PRESENTADA'].includes(p.estado) && (
                  <span className="text-amber-600 font-semibold mr-2"><BsExclamationTriangleFill className="inline mr-1" />{p.alertas}</span>
                )}
                {p.estado === 'PRESENTADA' ? p.siguientePaso : p.estado === 'BORRADOR' || p.estado === 'OBSERVADA' ? `Presentar (${p.creadoPorNombre})` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

/** Elige el corte del período, muestra lo que tomaría de la app y crea el borrador. */
const ModalNuevaPlanilla: React.FC<{
  obra: Obra;
  datos: { tipo: TipoPlanilla; obraContratistaId?: string; nombre?: string } | null;
  onCerrar: () => void;
  onCreada: (id: string) => void;
}> = ({ obra, datos, onCerrar, onCreada }) => {
  const [hasta, setHasta] = useState(hoyEC());
  const [desde, setDesde] = useState('');
  const [p, setP] = useState<PropuestaPlanilla | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!datos) return;
    setHasta(hoyEC());
    setDesde('');
    setP(null);
    setError('');
  }, [datos]);

  useEffect(() => {
    if (!datos || !hasta) return;
    planillasAPI
      .propuesta(obra.id, datos.tipo, datos.obraContratistaId, hasta)
      .then((x) => {
        setP(x);
        setDesde((d) => d || x.desde);
        setError('');
      })
      .catch((e) => setError(mensajeError(e)));
  }, [datos, hasta, obra.id]);

  if (!datos) return null;
  const conAvance = p?.lineas.filter((l) => l.cantidadApp > 0) ?? [];
  const estimado = p?.lineas.reduce((s, l) => s + l.subtotal, 0) ?? 0;
  const sinPrecio = p?.lineas.some((l) => l.alertas.some((a) => a.codigo === 'SIN_PRECIO'));

  const crear = async () => {
    setOcupado(true);
    setError('');
    try {
      const n = await planillasAPI.crear(obra.id, {
        tipo: datos.tipo,
        obraContratistaId: datos.obraContratistaId,
        periodoHasta: hasta,
        periodoDesde: p?.primera ? desde : undefined,
      });
      onCreada(n.id);
    } catch (e) {
      setError(mensajeError(e, 'No se pudo crear la planilla'));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal abierto titulo={datos.tipo === 'CLIENTE' ? 'Nueva planilla al cliente' : 'Nueva planilla de contratista'} subtitulo={datos.nombre ?? obra.nombre} onCerrar={onCerrar} ancho="lg"
      pie={<><button className={btnSecundario} onClick={onCerrar}>Cancelar</button><button className={btnPrimario} onClick={crear} disabled={ocupado || !p || !!p.bloqueo}>{ocupado ? 'Creando...' : 'Crear borrador'}</button></>}>
      <div className="space-y-4">
        {p?.bloqueo && <Aviso tipo="alerta">{p.bloqueo}: su acumulado es la base de la siguiente.</Aviso>}
        {p && (
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Desde" ayuda={p.primera ? 'Primera planilla: puedes ajustar el inicio' : 'Día siguiente al cierre de la planilla anterior'}>
              <input type="date" className={inputCls} value={p.primera ? desde : p.desde} disabled={!p.primera} max={hasta} onChange={(e) => setDesde(e.target.value)} />
            </Campo>
            <Campo etiqueta="Hasta (corte)">
              <input type="date" className={inputCls} value={hasta} max={hoyEC()} onChange={(e) => setHasta(e.target.value)} />
            </Campo>
          </div>
        )}
        {p && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs space-y-1">
            <p className="font-bold text-gray-800">Planilla N.º {p.numero}</p>
            <p className="text-gray-600">{conAvance.length} rubro{conAvance.length === 1 ? '' : 's'} con avances en el período · subtotal estimado {fmtUSD(estimado)} (sin IVA)</p>
            {p.primera && <p className="text-gray-500">Si ya se planilló parte de la obra fuera de la app, indica la «cantidad anterior» de cada rubro en el borrador.</p>}
            {sinPrecio && <p className="text-amber-700">Hay rubros sin precio de subcontrato: complétalos en el borrador.</p>}
          </div>
        )}
        <p className="text-[11px] text-gray-400">Se crea un borrador: podrás corregir cantidades, descuentos y los datos de impresión antes de presentarla.</p>
        {error && <Aviso tipo="error">{error}</Aviso>}
      </div>
    </Modal>
  );
};
