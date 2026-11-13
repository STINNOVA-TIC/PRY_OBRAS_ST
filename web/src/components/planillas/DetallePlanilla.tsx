import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  BsCashCoin,
  BsChevronDown,
  BsChevronRight,
  BsDownload,
  BsExclamationTriangleFill,
  BsPaperclip,
  BsPenFill,
  BsPlusLg,
  BsPrinter,
  BsTrash,
  BsX,
} from 'react-icons/bs';
import { archivosAPI, authAPI, planillasAPI } from '../../api';
import { mensajeError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import type { FirmaFormato, FormatoPlanilla, LineaPlanillaInput, Planilla } from '../../types';
import { fmtUSD } from '../common/EstadoChip';
import { FirmaImagen } from '../common/FirmaImagen';
import { FlujoFirmas, type NodoFirma } from '../common/FlujoFirmas';
import { Aviso, Campo, Cargando, Modal, btnPrimario, btnSecundario, inputCls } from '../common/Modal';
import { fmtN, fmtPct, hoyEC, leerNumero } from '../ejecucion/comunes';
import { ElegirArchivo, LinkArchivo, fmtFechaHora, validarArchivo } from '../habilitacion/comunes';
import { ChipPlanilla, fmt2, fmtDia, fmtPeriodo } from './comunes';

type Edit = { q?: string; pu?: string; ant?: string };
type Accion = 'presentar' | 'firmar' | 'observar' | 'pagar' | 'anular' | 'adjuntar' | null;

const celdaInput = 'w-24 px-2 py-1 rounded border border-gray-300 text-right text-xs focus:outline-none focus:ring-1 focus:ring-gray-800';

/** Página /obras/:obraId/planillas/:id: editor del borrador, flujo de firmas y acciones de estado. */
export const PaginaPlanilla: React.FC = () => {
  const { obraId = '', id = '' } = useParams();
  const navigate = useNavigate();
  const { showConfirm } = useModal();
  const [p, setP] = useState<Planilla | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [cab, setCab] = useState<{ desde: string; hasta: string; multa: string; multaDetalle: string }>({ desde: '', hasta: '', multa: '', multaDetalle: '' });
  const [formato, setFormato] = useState<FormatoPlanilla | null>(null);
  const [verFormato, setVerFormato] = useState(false);
  const [verAnexo, setVerAnexo] = useState(false);
  const [accion, setAccion] = useState<Accion>(null);
  const [guardando, setGuardando] = useState(false);

  const aplicar = useCallback((n: Planilla) => {
    setP(n);
    setEdits({});
    setFormato(null);
    setCab({ desde: n.periodoDesde, hasta: n.periodoHasta, multa: String(n.multa || ''), multaDetalle: n.multaDetalle ?? '' });
  }, []);
  const cargar = useCallback(() => planillasAPI.obtener(obraId, id).then(aplicar).catch((e) => setError(mensajeError(e))), [obraId, id, aplicar]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const sucio = useMemo(() => {
    if (!p) return false;
    return (
      Object.keys(edits).length > 0 ||
      formato !== null ||
      cab.hasta !== p.periodoHasta ||
      (p.primera && cab.desde !== p.periodoDesde) ||
      (leerNumero(cab.multa) ?? 0) !== p.multa ||
      cab.multaDetalle.trim() !== (p.multaDetalle ?? '')
    );
  }, [p, edits, formato, cab]);

  if (!p) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando texto="Cargando planilla..." />;
  const ctr = p.tipo === 'CONTRATISTA';
  const ed = p.puede.editar;
  const titulo = `Planilla N.º ${p.numero} ${ctr ? `de ${p.contratistaNombre}` : 'al cliente'}`;

  const ok = (msg: string) => {
    setAviso(msg);
    setTimeout(() => setAviso(''), 6000);
  };

  /** Arma el PATCH con lo cambiado; devuelve null si hay un número inválido. */
  const cambios = () => {
    const lineas: LineaPlanillaInput[] = [];
    for (const [rid, e] of Object.entries(edits)) {
      const l: LineaPlanillaInput = { obraRubroId: rid };
      for (const [k, campo] of [['q', 'cantidadPeriodo'], ['pu', 'precioUnitario'], ['ant', 'cantidadAnterior']] as const) {
        const v = e[k];
        if (v === undefined) continue;
        const n = v.trim() === '' ? 0 : leerNumero(v);
        if (n == null || n < 0) throw new Error(`Valor no válido en «${p.lineas.find((x) => x.obraRubroId === rid)?.descripcion}»`);
        l[campo] = n;
      }
      lineas.push(l);
    }
    const multa = cab.multa.trim() === '' ? 0 : leerNumero(cab.multa);
    if (multa == null || multa < 0) throw new Error('El descuento no es válido');
    return {
      periodoHasta: cab.hasta,
      periodoDesde: p.primera ? cab.desde : undefined,
      multa,
      multaDetalle: cab.multaDetalle.trim() || null,
      formato: formato ?? undefined,
      lineas: lineas.length ? lineas : undefined,
    };
  };

  const guardar = async (silencioso = false) => {
    setGuardando(true);
    setError('');
    try {
      const n = await planillasAPI.actualizar(obraId, id, cambios());
      aplicar(n);
      if (!silencioso) ok('Cambios guardados');
      return true;
    } catch (e) {
      setError(e instanceof Error && !('isAxiosError' in e) ? e.message : mensajeError(e, 'No se pudo guardar'));
      return false;
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!(await showConfirm({ title: 'Eliminar borrador', message: `¿Eliminar el borrador de la ${titulo.toLowerCase()}?`, confirmLabel: 'Eliminar', type: 'danger' }))) return;
    try {
      await planillasAPI.eliminar(obraId, id);
      navigate(`/obras/${obraId}?tab=planillas`);
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  const presentar = async () => {
    if (sucio && !(await guardar(true))) return;
    setAccion('presentar');
  };

  const valor = (rid: string, k: keyof Edit, base: number) => edits[rid]?.[k] ?? String(base);
  const setValor = (rid: string, k: keyof Edit, v: string) => setEdits({ ...edits, [rid]: { ...edits[rid], [k]: v } });
  const fmtActual = formato ?? p.formato;
  const setF = (patch: Partial<FormatoPlanilla>) => setFormato({ ...fmtActual, ...patch });
  const firmasF: FirmaFormato[] = fmtActual.firmas ?? [];

  const pendiente = p.firmas.find((f) => !f.firmado);
  const nodos: NodoFirma[] = p.firmas.map((f) => ({
    rol: f.rol,
    etiqueta: f.etiqueta,
    designadoNombre: f.designadoNombre,
    firmado: f.firmado,
    firmaArchivoId: f.firmaArchivoId,
    nombreFirmante: f.nombreFirmante,
    cargoFirmante: f.cargoFirmante,
    firmadoEn: f.firmadoEn,
    activo: p.estado === 'PRESENTADA' && pendiente?.rol === f.rol,
  }));
  const acciones: Record<string, React.ReactNode> = {};
  if (p.puede.firmar && pendiente)
    acciones[pendiente.rol] = (
      <button className="whitespace-nowrap px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm" onClick={() => setAccion('firmar')}>
        <BsPenFill className="inline mr-1.5" />{pendiente.rol === 'APROBADO' ? 'Aprobar' : 'Revisar y firmar'}
      </button>
    );

  const t = p.totales;
  const alertas = p.lineas.filter((l) => l.alertas.length);

  return (
    <div className="space-y-5">
      <Link to={`/obras/${obraId}?tab=planillas`} className="text-xs font-semibold text-gray-600 hover:text-gray-900">‹ {p.obraNombre}</Link>

      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-gray-800">{titulo}</h1>
              <ChipPlanilla estado={p.estado} />
            </div>
            <p className="text-xs text-gray-600 mt-1">Período {fmtPeriodo(p.periodoDesde, p.periodoHasta)}</p>
            <p className="text-[11px] text-gray-400">Elaboró {p.creadoPorNombre} · {fmtFechaHora(p.creadoEn)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={btnSecundario} onClick={() => planillasAPI.exportar(obraId, id, `planilla_${p.numero}.xlsx`).catch((e) => setError(mensajeError(e)))}>
              <BsDownload className="inline mr-1.5" />Excel
            </button>
            <button className={btnSecundario} onClick={() => window.open(`/obras/${obraId}/planillas/${id}/imprimir`, '_blank')}><BsPrinter className="inline mr-1.5" />Imprimir / PDF</button>
            {p.puede.eliminar && <button className="px-3 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold" onClick={eliminar} title="Eliminar borrador"><BsTrash /></button>}
            {p.puede.observar && <button className={btnSecundario} onClick={() => setAccion('observar')}>{p.estado === 'APROBADA' ? 'Reabrir' : 'Observar'}</button>}
            {p.puede.anular && p.estado !== 'BORRADOR' && <button className="px-3 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold" onClick={() => setAccion('anular')}>Anular</button>}
            {p.puede.adjuntar && <button className={btnSecundario} onClick={() => setAccion('adjuntar')}><BsPaperclip className="inline mr-1.5" />{p.archivoId ? 'Cambiar firmada' : 'Adjuntar firmada'}</button>}
            {p.puede.pagar && <button className={btnPrimario} onClick={() => setAccion('pagar')}><BsCashCoin className="inline mr-1.5" />Marcar pagada</button>}
            {ed && sucio && <button className={btnSecundario} onClick={() => guardar()} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar cambios'}</button>}
            {p.puede.presentar && <button className={btnPrimario} onClick={presentar} disabled={guardando}><BsPenFill className="inline mr-1.5" />Firmar y presentar</button>}
          </div>
        </div>

        {error && <Aviso tipo="error">{error}</Aviso>}
        {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
        {p.estado === 'OBSERVADA' && p.observacion && <Aviso tipo="alerta">Observada por {p.estadoPorNombre}: {p.observacion}</Aviso>}
        {p.estado === 'ANULADA' && <Aviso tipo="alerta">Anulada por {p.estadoPorNombre}: {p.motivoAnulacion}</Aviso>}
        {p.estado === 'PAGADA' && <Aviso tipo="ok">Pagada el {fmtDia(p.pagadaFecha)}{p.pagoRef ? ` · ref. ${p.pagoRef}` : ''} (registró {p.estadoPorNombre}).</Aviso>}
        {p.archivoId && (
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span className="font-bold uppercase text-[10px] tracking-wider text-gray-400">Planilla firmada:</span>
            <LinkArchivo id={p.archivoId} nombre={p.archivoNombre} onError={setError} />
          </div>
        )}
        {ed && alertas.length > 0 && (
          <Aviso tipo="alerta">{alertas.length} rubro{alertas.length === 1 ? '' : 's'} con alertas: revisa las cantidades marcadas antes de presentar.</Aviso>
        )}

        {ed && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Campo etiqueta="Desde" ayuda={p.primera ? undefined : 'Sigue a la planilla anterior'}>
              <input type="date" className={inputCls} value={cab.desde} disabled={!p.primera} max={cab.hasta} onChange={(e) => setCab({ ...cab, desde: e.target.value })} />
            </Campo>
            <Campo etiqueta="Hasta (corte)">
              <input type="date" className={inputCls} value={cab.hasta} min={cab.desde} max={hoyEC()} onChange={(e) => setCab({ ...cab, hasta: e.target.value })} />
            </Campo>
            <Campo etiqueta="Descuentos / multas ($)">
              <input className={inputCls} inputMode="decimal" value={cab.multa} placeholder="0" onChange={(e) => setCab({ ...cab, multa: e.target.value })} />
            </Campo>
            <Campo etiqueta="Concepto del descuento">
              <input className={inputCls} maxLength={300} value={cab.multaDetalle} onChange={(e) => setCab({ ...cab, multaDetalle: e.target.value })} placeholder="Ej. Multa por atraso" />
            </Campo>
          </div>
        )}
      </div>

      {/* Líneas */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-gray-400 uppercase text-[10px] tracking-wider font-bold bg-gray-50/50 border-b border-gray-100">
            <tr>
              <th className="px-3 py-2.5">N.º</th>
              <th className="px-3 py-2.5">Descripción</th>
              <th className="px-2 py-2.5 text-right">Contrato</th>
              <th className="px-2 py-2.5 text-right">{ctr ? 'P. subcontrato' : 'P. unitario'}</th>
              <th className="px-2 py-2.5 text-right">Anterior</th>
              <th className="px-2 py-2.5 text-right" title="Registrado en avances del período">App</th>
              <th className="px-2 py-2.5 text-right">Actual</th>
              <th className="px-2 py-2.5 text-right">Acumulado</th>
              <th className="px-2 py-2.5 text-right">Valor actual</th>
              <th className="px-3 py-2.5 text-right">% ejec.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {p.lineas.map((l, i) => {
              const q = edits[l.obraRubroId]?.q;
              const cambiado = q !== undefined && (leerNumero(q) ?? -1) !== l.cantidadPeriodo;
              return (
                <React.Fragment key={l.obraRubroId}>
                  <tr className={l.alertas.length ? 'bg-amber-50/40' : ''}>
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 font-semibold text-gray-800 min-w-48">{l.descripcion} <span className="font-normal text-gray-400">({l.unidad})</span></td>
                    <td className="px-2 py-2 text-right text-gray-500">{fmtN(l.cantidadContrato)}</td>
                    <td className="px-2 py-2 text-right">
                      {ed && ctr ? <input className={celdaInput} inputMode="decimal" value={valor(l.obraRubroId, 'pu', l.precioUnitario)} onChange={(e) => setValor(l.obraRubroId, 'pu', e.target.value)} /> : fmtN(l.precioUnitario, 4)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {ed && p.primera ? <input className={celdaInput} inputMode="decimal" value={valor(l.obraRubroId, 'ant', l.cantidadAnterior)} onChange={(e) => setValor(l.obraRubroId, 'ant', e.target.value)} title="Planillado fuera de la app" /> : fmtN(l.cantidadAnterior)}
                    </td>
                    <td className="px-2 py-2 text-right text-gray-500">{fmtN(l.cantidadApp)}</td>
                    <td className="px-2 py-2 text-right font-bold text-gray-800">
                      {ed ? <input className={`${celdaInput} ${cambiado ? 'border-amber-400 bg-amber-50' : ''}`} inputMode="decimal" value={valor(l.obraRubroId, 'q', l.cantidadPeriodo)} onChange={(e) => setValor(l.obraRubroId, 'q', e.target.value)} /> : fmtN(l.cantidadPeriodo)}
                    </td>
                    <td className="px-2 py-2 text-right">{fmtN(l.cantidadAcumulada)}</td>
                    <td className="px-2 py-2 text-right font-semibold">{fmt2(l.subtotal)}</td>
                    <td className={`px-3 py-2 text-right ${l.pctEjecucion != null && l.pctEjecucion > 1.0001 ? 'text-red-600 font-bold' : 'text-gray-500'}`}>{l.pctEjecucion != null ? fmtPct(l.pctEjecucion) : '—'}</td>
                  </tr>
                  {l.alertas.length > 0 && p.estado !== 'ANULADA' && (
                    <tr className="bg-amber-50/40">
                      <td />
                      <td colSpan={9} className="px-3 pb-2 -mt-1 text-[11px] text-amber-700">
                        {l.alertas.map((a) => <div key={a.codigo}><BsExclamationTriangleFill className="inline mr-1" />{a.texto}</div>)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {ed && Object.keys(edits).length > 0 && <p className="px-4 py-2 text-[11px] text-gray-500 border-t border-gray-100">Los valores y totales se recalculan al guardar.</p>}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 text-xs space-y-1.5">
          <Fila k={ctr ? 'Monto subcontrato' : 'Monto contrato'} v={fmtUSD(t.montoContrato)} />
          <Fila k="Planillado anterior" v={fmtUSD(t.anterior)} />
          <Fila k="Acumulado con esta planilla" v={fmtUSD(t.acumulado)} />
          <Fila k="Avance acumulado" v={t.montoContrato > 0 ? fmtPct(t.acumulado / t.montoContrato) : '—'} />
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-5 text-xs space-y-1.5">
          <Fila k="Total sin descuentos" v={fmtUSD(t.subtotal)} />
          <Fila k={`Descuentos${p.multaDetalle ? ` (${p.multaDetalle})` : ''}`} v={`− ${fmtUSD(t.multa)}`} />
          <Fila k="Total con descuentos" v={fmtUSD(t.base)} />
          <Fila k={`IVA ${fmtN(p.ivaPct)} %`} v={fmtUSD(t.iva)} />
          <div className="flex justify-between border-t border-gray-200 pt-2 mt-1 text-sm font-black text-gray-900"><span>Total + IVA</span><span>{fmtUSD(t.total)}</span></div>
        </div>
      </div>

      {/* Firmas */}
      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-bold text-gray-800">Firmas de aprobación</h2>
        {p.firmas.length ? (
          <FlujoFirmas nodos={nodos} acciones={acciones} />
        ) : (
          <p className="text-xs text-gray-500">Al presentar firmas «Elaborado por»; luego revisa el Superintendente y aprueba el Administrador de la obra (si uno de ellos la elaboró, aprueba el otro). Si alguien la observa, las firmas se borran y se vuelve a presentar.</p>
        )}
      </section>

      {/* Datos de impresión */}
      <section className="bg-white border border-gray-200 rounded-2xl">
        <button className="w-full flex items-center gap-2 px-5 py-3 text-sm font-bold text-gray-800" onClick={() => setVerFormato(!verFormato)}>
          {verFormato ? <BsChevronDown /> : <BsChevronRight />} Datos de impresión
          <span className="font-normal text-xs text-gray-400">cabecera y firmas del formato impreso</span>
        </button>
        {verFormato && (
          <div className="px-5 pb-5 space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              {([
                ['proyecto', 'Proyecto', 300],
                ['contratante', 'Contratante', 200],
                ['contratista', 'Contratista', 200],
                ['fiscalizacion', 'Fiscalización', 200],
                ['provincia', 'Provincia', 100],
                ['plazo', 'Plazo', 60],
                ['ampliacion', 'Ampliación de plazo', 200],
                ['descripcion', 'Descripción', 500],
              ] as [keyof FormatoPlanilla, string, number][]).map(([k, et, max]) => (
                <Campo key={k} etiqueta={et}>
                  <input className={inputCls} maxLength={max} disabled={!ed} value={(fmtActual[k] as string) ?? ''} onChange={(e) => setF({ [k]: e.target.value })} />
                </Campo>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" disabled={!ed} checked={fmtActual.anexo !== false} onChange={(e) => setF({ anexo: e.target.checked })} />
              Incluir el anexo «memoria de cálculo» con los avances del período
            </label>
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Firmas del impreso</p>
              {firmasF.map((f, k) => (
                <div key={k} className="flex gap-2">
                  {(['nombre', 'cargo', 'entidad'] as const).map((c) => (
                    <input key={c} className={`${inputCls} flex-1`} disabled={!ed} placeholder={c[0].toUpperCase() + c.slice(1)} maxLength={c === 'entidad' ? 160 : 120} value={f[c]}
                      onChange={(e) => setF({ firmas: firmasF.map((x, j) => (j === k ? { ...x, [c]: e.target.value } : x)) })} />
                  ))}
                  {ed && <button className="p-2 text-gray-400 hover:text-red-600" onClick={() => setF({ firmas: firmasF.filter((_, j) => j !== k) })} title="Quitar"><BsX /></button>}
                </div>
              ))}
              {ed && firmasF.length < 6 && (
                <button className="text-xs font-semibold text-gray-600 hover:text-gray-900" onClick={() => setF({ firmas: [...firmasF, { nombre: '', cargo: '', entidad: '' }] })}>
                  <BsPlusLg className="inline mr-1" />Agregar firma
                </button>
              )}
            </div>
            {ed && formato && <button className={btnPrimario} onClick={() => guardar()} disabled={guardando}>Guardar datos de impresión</button>}
          </div>
        )}
      </section>

      {/* Anexo */}
      <section className="bg-white border border-gray-200 rounded-2xl">
        <button className="w-full flex items-center gap-2 px-5 py-3 text-sm font-bold text-gray-800" onClick={() => setVerAnexo(!verAnexo)}>
          {verAnexo ? <BsChevronDown /> : <BsChevronRight />} Memoria de cálculo
          <span className="font-normal text-xs text-gray-400">{p.anexo.length} avance{p.anexo.length === 1 ? '' : 's'} del período</span>
        </button>
        {verAnexo && (
          <div className="overflow-x-auto border-t border-gray-100">
            <table className="w-full text-left text-xs">
              <thead className="text-gray-400 uppercase text-[10px] tracking-wider font-bold bg-gray-50/50 border-b border-gray-100">
                <tr><th className="px-4 py-2">Fecha</th><th className="px-3 py-2">Rubro</th><th className="px-3 py-2">Abscisas</th><th className="px-3 py-2">Frente</th><th className="px-3 py-2 text-right">Cantidad</th><th className="px-3 py-2">Ejecutó</th><th className="px-4 py-2">Registró</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {p.anexo.map((a, k) => (
                  <tr key={k}>
                    <td className="px-4 py-2 whitespace-nowrap">{fmtDia(a.fecha)}</td>
                    <td className="px-3 py-2">{a.rubro}{a.nota && <div className="text-[11px] text-gray-400">{a.nota}</div>}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{a.abscisaDesde || a.abscisaHasta ? `${a.abscisaDesde ?? ''} – ${a.abscisaHasta ?? ''}` : '—'}</td>
                    <td className="px-3 py-2">{[a.frente, a.tramo].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold">{fmtN(a.cantidad)} {a.unidad}</td>
                    <td className="px-3 py-2">{a.ejecutor}</td>
                    <td className="px-4 py-2 text-gray-500">{a.registradoPorNombre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ModalAccionPlanilla p={p} accion={accion} onCerrar={() => setAccion(null)} onHecho={(n, msg) => { aplicar(n); setAccion(null); ok(msg); }} />
    </div>
  );
};

const Fila: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div className="flex justify-between gap-4"><span className="text-gray-500">{k}</span><span className="font-semibold text-gray-800">{v}</span></div>
);

/** Presentar / firmar (con vista previa de la firma, como en el POS), observar, anular, pagar y adjuntar la firmada. */
const ModalAccionPlanilla: React.FC<{ p: Planilla; accion: Accion; onCerrar: () => void; onHecho: (p: Planilla, msg: string) => void }> = ({ p, accion, onCerrar, onHecho }) => {
  const { user, refrescarUsuario } = useAuth();
  const [texto, setTexto] = useState('');
  const [fecha, setFecha] = useState(hoyEC());
  const [archivo, setArchivo] = useState<File | null>(null);
  const [firmaId, setFirmaId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!accion) return;
    setError('');
    setTexto('');
    setArchivo(null);
    setFecha(hoyEC());
    if (accion === 'presentar' || accion === 'firmar') authAPI.perfil().then((x) => setFirmaId(x.firmaArchivoId)).catch(() => undefined);
  }, [accion]);

  if (!accion) return null;
  const firma = accion === 'presentar' || accion === 'firmar';
  const pendiente = p.firmas.find((f) => !f.firmado);
  const titulos: Record<Exclude<Accion, null>, string> = {
    presentar: 'Firmar y presentar',
    firmar: pendiente?.rol === 'APROBADO' ? 'Aprobar planilla' : 'Revisar planilla',
    observar: p.estado === 'APROBADA' ? 'Reabrir planilla aprobada' : 'Observar planilla',
    anular: 'Anular planilla',
    pagar: 'Marcar como pagada',
    adjuntar: 'Planilla firmada',
  };
  const alertas = p.lineas.reduce((s, l) => s + l.alertas.length, 0);

  const confirmar = async () => {
    setOcupado(true);
    setError('');
    try {
      let n: Planilla;
      let msg = '';
      if (accion === 'presentar') {
        n = await planillasAPI.presentar(p.obraId, p.id);
        msg = 'Planilla presentada: queda a la espera de revisión';
      } else if (accion === 'firmar') {
        n = await planillasAPI.firmar(p.obraId, p.id);
        msg = n.estado === 'APROBADA' ? 'Planilla aprobada' : 'Firma registrada';
      } else if (accion === 'observar' || accion === 'anular') {
        if (texto.trim().length < 5) throw new Error('Explica el motivo (mínimo 5 caracteres)');
        n = accion === 'observar' ? await planillasAPI.observar(p.obraId, p.id, texto.trim()) : await planillasAPI.anular(p.obraId, p.id, texto.trim());
        msg = accion === 'observar' ? 'Planilla devuelta para corregir' : 'Planilla anulada';
      } else if (accion === 'pagar') {
        n = await planillasAPI.pagar(p.obraId, p.id, fecha, texto.trim());
        msg = 'Pago registrado';
      } else {
        const err = validarArchivo(archivo);
        if (!archivo || err) throw new Error(err ?? 'Elige el archivo (PDF o foto)');
        const a = await archivosAPI.subir(archivo, 'DOCUMENTO');
        n = await planillasAPI.adjuntar(p.obraId, p.id, a.id);
        msg = 'Planilla firmada adjuntada';
      }
      onHecho(n, msg);
    } catch (e) {
      setError(e instanceof Error && !('isAxiosError' in e) ? e.message : mensajeError(e));
      if (firma) refrescarUsuario();
    } finally {
      setOcupado(false);
    }
  };

  const rojo = accion === 'anular';
  return (
    <Modal abierto titulo={titulos[accion]} subtitulo={`N.º ${p.numero} · ${fmtPeriodo(p.periodoDesde, p.periodoHasta)} · ${fmtUSD(p.totales.total)}`} onCerrar={onCerrar} ancho="lg"
      pie={firma && !user?.tieneFirma ? <button className={btnSecundario} onClick={onCerrar}>Cerrar</button> : (
        <><button className={btnSecundario} onClick={onCerrar}>Cancelar</button>
          <button className={`whitespace-nowrap px-4 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-50 ${rojo ? 'bg-red-600 hover:bg-red-700' : firma ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-900 hover:bg-gray-800'}`} onClick={confirmar} disabled={ocupado}>
            {ocupado ? 'Procesando...' : firma ? 'Confirmar y firmar' : titulos[accion].split(' ')[0]}
          </button></>
      )}>
      <div className="space-y-4">
        {accion === 'presentar' && alertas > 0 && <Aviso tipo="alerta">La planilla tiene {alertas} alerta{alertas === 1 ? '' : 's'} (cantidades que difieren de la app o del contrato). Corrobóralas antes de presentar.</Aviso>}
        {accion === 'presentar' && <p className="text-xs text-gray-600">Se recalculan los avances del período y se cierra: mientras esté presentada nadie podrá registrar ni anular avances con fecha hasta el {fmtDia(p.periodoHasta)}.</p>}
        {accion === 'firmar' && <p className="text-xs text-gray-600">Firmas como «{pendiente?.etiqueta}».{pendiente?.rol === 'APROBADO' ? ' Con tu firma la planilla queda aprobada.' : ''} Si encuentras errores, ciérralo y usa «Observar».</p>}
        {(accion === 'observar' || accion === 'anular') && (
          <Campo etiqueta={accion === 'observar' ? 'Qué se debe corregir' : 'Motivo de la anulación'}>
            <textarea className={inputCls} rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
          </Campo>
        )}
        {accion === 'observar' && <p className="text-[11px] text-gray-500">Las firmas se borran y quien la elaboró la corrige y vuelve a presentar.</p>}
        {accion === 'anular' && <p className="text-[11px] text-gray-500">Libera su número y sus avances. Solo se anula la última planilla de la serie.</p>}
        {accion === 'pagar' && (
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Fecha de pago"><input type="date" className={inputCls} value={fecha} max={hoyEC()} min={p.periodoHasta} onChange={(e) => setFecha(e.target.value)} /></Campo>
            <Campo etiqueta="Referencia (opcional)"><input className={inputCls} maxLength={100} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="N.º de transferencia o comprobante" /></Campo>
          </div>
        )}
        {accion === 'adjuntar' && (
          <div className="space-y-2">
            <p className="text-xs text-gray-600">Sube el escaneo de la planilla impresa con las firmas del cliente o del contratista.</p>
            <ElegirArchivo archivo={archivo} onElegir={setArchivo} />
          </div>
        )}
        {firma && (user?.tieneFirma ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-600">Se estampará tu firma con tu nombre, cargo y la fecha y hora actuales:</p>
            <div className="rounded-xl border border-gray-200 bg-gray-50 h-24 flex items-center justify-center">
              {firmaId ? <FirmaImagen archivoId={firmaId} className="max-h-20 object-contain" /> : <span className="text-xs text-gray-400">Cargando firma...</span>}
            </div>
            <p className="text-center text-[11px] font-bold uppercase text-gray-700">{user.nombre}{user.cargo ? ` · ${user.cargo}` : ''}</p>
          </div>
        ) : (
          <Aviso tipo="alerta">Aún no registras tu firma. <Link to="/perfil" className="underline font-bold">Súbela en «Mi perfil y firma»</Link>.</Aviso>
        ))}
        {error && <Aviso tipo="error">{error}</Aviso>}
      </div>
    </Modal>
  );
};
