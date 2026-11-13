import React, { useCallback, useEffect, useState } from 'react';
import { BsArrowLeftRight, BsArrowReturnLeft, BsDownload, BsFileEarmarkSpreadsheet, BsInfoCircle, BsPlusLg } from 'react-icons/bs';
import { bodegasAPI, catalogosAPI, importacionAPI, rubrosAPI, transferenciasAPI, archivosAPI } from '../../api';
import { mensajeError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Bodega, Catalogos, DesgloseMaterial, FilaMaterialExcel, Movimiento, MovimientoInput, PaginaMovimientos, Rubro, StockBodega, TransferenciaResumen } from '../../types';
import { ModalImportarExcel } from '../common/ImportarExcel';
import { fmtUSD } from '../common/EstadoChip';
import { Aviso, Campo, Cargando, Modal, btnPrimario, btnSecundario, inputCls } from '../common/Modal';
import { descargarCsv, fmtFechaCorta, fmtN, fmtPct, hoyEC, leerNumero } from '../ejecucion/comunes';
import { ElegirArchivo, LinkArchivo, validarArchivo } from '../habilitacion/comunes';
import { ChipControl, ChipTipoMov, ChipTransf, TIPO_MOV } from './comunes';
import { ModalSolicitar, ModalTransferencia } from './Transferencias';

type Sub = 'stock' | 'kardex' | 'transferencias';

/**
 * Bodega (central o de obra): existencias, kardex y transferencias.
 * En obra muestra lo requerido por contrato, lo pendiente por ingresar y el control de consumo (real vs. avances).
 */
export const BodegaVista: React.FC<{ bodegaId: number; onCambio?: () => void }> = ({ bodegaId, onCambio }) => {
  const { hasPermission } = useAuth();
  const [sub, setSub] = useState<Sub>('stock');
  const [st, setSt] = useState<StockBodega | null>(null);
  const [error, setError] = useState('');
  const [mov, setMov] = useState(false);
  const [importar, setImportar] = useState(false);
  const [solicitar, setSolicitar] = useState<'pedir' | 'devolver' | 'enviar' | null>(null);
  const [verTransf, setVerTransf] = useState<string | null>(null);
  const [version, setVersion] = useState(0); // fuerza recarga de kardex y transferencias
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(() => bodegasAPI.stock(bodegaId).then(setSt).catch((e) => setError(mensajeError(e))), [bodegaId]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const refrescar = (msg?: string) => {
    if (msg) {
      setAviso(msg);
      setTimeout(() => setAviso(''), 6000);
    }
    cargar();
    setVersion((v) => v + 1);
    onCambio?.();
  };

  if (!st) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando texto="Cargando bodega..." />;
  const b = st.bodega;
  const esObra = b.tipo === 'OBRA';
  const cerrada = b.obraEstado === 'CERRADA';
  const puedeMover = !cerrada && ['bodega.ingresar', 'bodega.consumo', 'bodega.ajustar'].some((p) => hasPermission(p as never));
  const puedeTransferir = !cerrada && hasPermission('bodega.transferir');

  return (
    <div className="space-y-5">
      {error && <Aviso tipo="error">{error}</Aviso>}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}

      <div className="flex flex-wrap justify-between items-end gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {([['stock', 'Existencias'], ['kardex', 'Kardex'], ['transferencias', 'Transferencias']] as [Sub, string][]).map(([k, t]) => (
            <button key={k} onClick={() => setSub(k)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${sub === k ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}>{t}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {puedeTransferir && esObra && (
            <>
              <button className={btnSecundario} onClick={() => setSolicitar('devolver')}><BsArrowReturnLeft className="inline mr-1.5" />Devolver a central</button>
              <button className={btnSecundario} onClick={() => setSolicitar('pedir')}><BsArrowLeftRight className="inline mr-1.5" />Pedir material</button>
            </>
          )}
          {puedeTransferir && !esObra && (
            <button className={btnSecundario} onClick={() => setSolicitar('enviar')}><BsArrowLeftRight className="inline mr-1.5" />Enviar a obra</button>
          )}
          {!cerrada && hasPermission('bodega.ingresar') && (
            <button className={btnSecundario} onClick={() => setImportar(true)}><BsFileEarmarkSpreadsheet className="inline mr-1.5" />Importar ingreso</button>
          )}
          {puedeMover && <button className={btnPrimario} onClick={() => setMov(true)}><BsPlusLg className="inline mr-1.5" />Registrar movimiento</button>}
        </div>
      </div>

      {sub === 'stock' && <Existencias st={st} />}
      {sub === 'kardex' && <Kardex bodega={b} version={version} onCambio={refrescar} />}
      {sub === 'transferencias' && <ListaTransferencias bodegaId={b.id} version={version} onAbrir={setVerTransf} />}

      <ModalImportarIngreso abierto={importar} bodega={b} onCerrar={() => setImportar(false)} onHecho={(m) => { setImportar(false); refrescar(m); }} />
      <ModalMovimiento abierto={mov} bodega={b} st={st} onCerrar={() => setMov(false)} onHecho={(m) => { setMov(false); refrescar(m); }} />
      <ModalSolicitar
        modo={solicitar}
        bodega={b}
        onCerrar={() => setSolicitar(null)}
        onHecho={(id) => { setSolicitar(null); refrescar('Transferencia solicitada. Queda pendiente de aprobación.'); setSub('transferencias'); setVerTransf(id); }}
      />
      <ModalTransferencia id={verTransf} onCerrar={() => setVerTransf(null)} onCambio={() => refrescar()} />
    </div>
  );
};

// ------------------------------------------------------------------ Existencias
const AYUDA = {
  requerido: 'Requerido: lo que la obra necesita por contrato = cantidad contratada de cada rubro × material por unidad del rubro (insumos).',
  porIngresar: 'Por ingresar: requerido − (entradas − salidas). Lo que falta traer a la obra.',
  avances: 'Avances: lo que debió consumirse según lo ejecutado = cantidad registrada en avances de cada rubro × material por unidad. Se compara con «Consumido».',
  consumido: 'Consumido: consumos reales registrados en el kardex de esta bodega.',
};

/** De dónde salen «Requerido» y «Avances» de un material: rubro por rubro. */
const ModalDesglose: React.FC<{ bodegaId: number; materialId: number | null; onCerrar: () => void }> = ({ bodegaId, materialId, onCerrar }) => {
  const [d, setD] = useState<DesgloseMaterial | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setD(null);
    setError('');
    if (materialId != null) bodegasAPI.desglose(bodegaId, materialId).then(setD).catch((e) => setError(mensajeError(e)));
  }, [bodegaId, materialId]);
  if (materialId == null) return null;
  const u = d?.material.unidad ?? '';
  return (
    <Modal abierto titulo={d ? `¿De dónde salen los valores? · ${d.material.nombre}` : 'Desglose del material'} subtitulo="Requerido y avances calculados rubro por rubro" onCerrar={onCerrar} ancho="4xl"
      pie={<button className={btnSecundario} onClick={onCerrar}>Cerrar</button>}>
      {error ? <Aviso tipo="error">{error}</Aviso> : !d ? <Cargando /> : (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 text-[11px] text-gray-600">
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3"><b className="text-gray-800">Requerido</b> = cantidad contratada del rubro × {u} por unidad del rubro.</div>
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3"><b className="text-gray-800">Avances</b> = cantidad ejecutada (suma de avances vigentes) × {u} por unidad del rubro.</div>
          </div>
          {!d.rubros.length ? (
            <Aviso tipo="info">Ningún rubro de la obra tiene este material como insumo. Por eso no hay requerido ni avances; asígnalo en Rubros → insumos.</Aviso>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="text-gray-400 uppercase text-[10px] tracking-wider font-bold bg-gray-50/50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-2.5">Rubro</th>
                    <th className="px-3 py-2.5 text-right">{u} por unidad</th>
                    <th className="px-3 py-2.5 text-right">Contratado</th>
                    <th className="px-3 py-2.5 text-right">Requerido</th>
                    <th className="px-3 py-2.5 text-right">Ejecutado</th>
                    <th className="px-4 py-2.5 text-right">Avances</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {d.rubros.map((r) => (
                    <tr key={r.rubroId}>
                      <td className="px-4 py-2.5"><div className="font-semibold text-gray-800">{r.codigo ? `${r.codigo} · ` : ''}{r.descripcion}</div><div className="text-[10px] text-gray-400">{r.avances} avance{r.avances === 1 ? '' : 's'} registrado{r.avances === 1 ? '' : 's'}</div></td>
                      <td className="px-3 py-2.5 text-right">{fmtN(r.porUnidad)} {u}/{r.unidad}</td>
                      <td className="px-3 py-2.5 text-right">{fmtN(r.contratado)} {r.unidad}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-gray-800" title={`${fmtN(r.contratado)} × ${fmtN(r.porUnidad)}`}>{fmtN(r.requerido)}</td>
                      <td className="px-3 py-2.5 text-right">{fmtN(r.ejecutado)} {r.unidad}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-800" title={`${fmtN(r.ejecutado)} × ${fmtN(r.porUnidad)}`}>{fmtN(r.teorico)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-gray-200 bg-gray-50/60 font-bold text-gray-800">
                  <tr>
                    <td className="px-4 py-2.5" colSpan={3}>Total ({u})</td>
                    <td className="px-3 py-2.5 text-right">{fmtN(d.totales.requerido)}</td>
                    <td />
                    <td className="px-4 py-2.5 text-right">{fmtN(d.totales.teorico)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="text-[11px] text-gray-500">
            Consumo real registrado en el kardex: <b className="text-gray-800">{fmtN(d.totales.consumido)} {u}</b>
            {d.totales.teorico > 0 && <> · diferencia con avances: <b className="text-gray-800">{d.totales.consumido - d.totales.teorico > 0 ? '+' : ''}{fmtN(d.totales.consumido - d.totales.teorico)} {u}</b></>}
          </p>
        </div>
      )}
    </Modal>
  );
};

const Existencias: React.FC<{ st: StockBodega }> = ({ st }) => {
  const esObra = st.bodega.tipo === 'OBRA';
  const [desglose, setDesglose] = useState<number | null>(null);
  if (!st.materiales.length)
    return (
      <div className="bg-white border border-dashed border-gray-300 rounded-2xl py-12 text-center text-xs text-gray-500">
        {esObra ? 'Sin movimientos ni insumos programados. Asigna insumos a los rubros o registra un ingreso.' : 'La bodega central aún no tiene movimientos. Registra un ingreso.'}
      </div>
    );
  const exportar = () =>
    descargarCsv(`existencias-${st.bodega.nombre}.csv`, [
      esObra
        ? ['Código', 'Material', 'Unidad', 'Stock', 'Entradas', 'Salidas', 'Consumido', 'Requerido por contrato', 'Pendiente por ingresar', 'Avances', 'Control']
        : ['Código', 'Material', 'Unidad', 'Stock', 'Entradas', 'Salidas', 'Stock mínimo', 'Valor'],
      ...st.materiales.map((m) =>
        esObra
          ? [m.codigo, m.nombre, m.unidad, m.stock, m.entradas, m.salidas, m.consumido, m.requerido, m.pendienteIngresar, m.consumoTeorico, m.control?.texto]
          : [m.codigo, m.nombre, m.unidad, m.stock, m.entradas, m.salidas, m.stockMinimo, m.valor],
      ),
    ]);
  const valor = st.materiales.reduce((s, m) => s + m.valor, 0);
  return (
    <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex justify-between items-center gap-3">
        <div>
          <h2 className="text-sm font-bold text-gray-800">Existencias en {esObra ? 'obra' : 'bodega central'}</h2>
          <p className="text-[11px] text-gray-500">
            Valor del stock a costo: {fmtUSD(valor)}
            {esObra && ` · Control de consumo: consumido vs. avances (atención > ${fmtPct(st.umbrales.atencion)}, crítico > ${fmtPct(st.umbrales.critico)})`}
          </p>
          {esObra && (
            <p className="mt-1 text-[11px] text-gray-500">
              <BsInfoCircle className="inline mr-1 text-blue-600" />
              <b>Requerido</b> = contratado × material por unidad · <b>Avances</b> = ejecutado × material por unidad. Toca un valor para ver el cálculo por rubro.
            </p>
          )}
        </div>
        <button className={btnSecundario} onClick={exportar}><BsDownload className="inline mr-1.5" />CSV</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-gray-400 uppercase text-[10px] tracking-wider font-bold bg-gray-50/50 border-b border-gray-100">
            <tr>
              <th className="px-5 py-2.5">Material</th>
              <th className="px-3 py-2.5 text-right">Stock</th>
              <th className="px-3 py-2.5 text-right">Entradas</th>
              <th className="px-3 py-2.5 text-right">Salidas</th>
              {esObra ? (
                <>
                  <th className="px-3 py-2.5 text-right" title={AYUDA.consumido}>Consumido</th>
                  <th className="px-3 py-2.5 text-right" title={AYUDA.requerido}>Requerido <BsInfoCircle className="inline" /></th>
                  <th className="px-3 py-2.5 text-right" title={AYUDA.porIngresar}>Por ingresar</th>
                  <th className="px-3 py-2.5 text-right" title={AYUDA.avances}>Avances <BsInfoCircle className="inline" /></th>
                  <th className="px-5 py-2.5">Control</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-2.5 text-right">Mínimo</th>
                  <th className="px-5 py-2.5 text-right">Valor</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {st.materiales.map((m) => (
              <tr key={m.materialId}>
                <td className="px-5 py-2.5"><div className="font-semibold text-gray-800">{m.nombre}</div><div className="text-[10px] text-gray-400">{m.codigo} · {m.unidad}</div></td>
                <td className={`px-3 py-2.5 text-right font-black ${m.bajoMinimo ? 'text-red-600' : 'text-gray-800'}`}>{fmtN(m.stock)}</td>
                <td className="px-3 py-2.5 text-right">{fmtN(m.entradas)}</td>
                <td className="px-3 py-2.5 text-right">{fmtN(m.salidas)}</td>
                {esObra ? (
                  <>
                    <td className="px-3 py-2.5 text-right">{fmtN(m.consumido)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button className="text-blue-700 hover:underline font-semibold" title="Ver de dónde sale" onClick={() => setDesglose(m.materialId)}>{m.requerido ? fmtN(m.requerido) : '—'}</button>
                    </td>
                    <td className={`px-3 py-2.5 text-right ${m.pendienteIngresar ? 'text-amber-700 font-bold' : 'text-emerald-700'}`}>{m.requerido ? (m.pendienteIngresar ? fmtN(m.pendienteIngresar) : 'Completo') : '—'}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button className="text-blue-700 hover:underline font-semibold" title="Ver de dónde sale" onClick={() => setDesglose(m.materialId)}>{m.consumoTeorico ? fmtN(m.consumoTeorico) : '—'}</button>
                    </td>
                    <td className="px-5 py-2.5">
                      {m.control ? (
                        <span className="inline-flex items-center gap-1.5">
                          <ChipControl nivel={m.control.nivel} texto={m.control.texto} />
                          {m.control.desviacion != null && <span className="text-[10px] text-gray-500">{m.control.desviacion > 0 ? '+' : ''}{fmtPct(m.control.desviacion)}</span>}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2.5 text-right">{m.stockMinimo ? fmtN(m.stockMinimo) : '—'}</td>
                    <td className="px-5 py-2.5 text-right">{fmtUSD(m.valor)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {esObra && <ModalDesglose bodegaId={st.bodega.id} materialId={desglose} onCerrar={() => setDesglose(null)} />}
    </section>
  );
};

// ------------------------------------------------------------------ Kardex
const Kardex: React.FC<{ bodega: Bodega; version: number; onCambio: (msg?: string) => void }> = ({ bodega, version, onCambio }) => {
  const { user, hasPermission } = useAuth();
  const [pag, setPag] = useState<PaginaMovimientos | null>(null);
  const [mats, setMats] = useState<Catalogos['materiales']>([]);
  const [f, setF] = useState({ materialId: '', tipo: '', desde: '', hasta: '' });
  const [limite, setLimite] = useState(50);
  const [revertir, setRevertir] = useState<Movimiento | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    catalogosAPI.todos().then((c) => setMats(c.materiales)).catch(() => undefined);
  }, []);
  useEffect(() => {
    bodegasAPI
      .movimientos(bodega.id, { ...(f.materialId && { materialId: Number(f.materialId) }), ...(f.tipo && { tipo: f.tipo }), ...(f.desde && { desde: f.desde }), ...(f.hasta && { hasta: f.hasta }), limit: limite })
      .then(setPag)
      .catch((e) => setError(mensajeError(e)));
  }, [bodega.id, f, limite, version]);

  const puedeRevertir = (m: Movimiento) =>
    !m.tipo.startsWith('TRANSFERENCIA') && !m.revierteA && !m.revertidoPor && bodega.obraEstado !== 'CERRADA' && (m.usuarioId === user?.id || hasPermission('bodega.ajustar'));

  const exportar = async () => {
    const todo = await bodegasAPI.movimientos(bodega.id, { ...(f.materialId && { materialId: Number(f.materialId) }), ...(f.tipo && { tipo: f.tipo }), limit: 5000 });
    descargarCsv(`kardex-${bodega.nombre}.csv`, [
      ['Fecha', 'Tipo', 'Material', 'Unidad', 'Cantidad', 'Saldo anterior', 'Saldo nuevo', 'Costo unitario', 'Documento', 'Rubro', 'Transferencia', 'Observación', 'Registró'],
      ...todo.data.map((m) => [m.fecha, TIPO_MOV[m.tipo].texto, m.materialNombre, m.unidad, m.cantidad, m.stockAnterior, m.stockNuevo, m.costoUnitario, m.documentoRef, m.rubroDescripcion, m.transferenciaNumero, m.nota, m.usuarioNombre]),
    ]);
  };

  return (
    <div className="space-y-3">
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="bg-white border border-gray-200 rounded-2xl p-3 grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <select className={inputCls} value={f.materialId} onChange={(e) => setF({ ...f, materialId: e.target.value })} aria-label="Material">
          <option value="">Todos los materiales</option>
          {mats.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
        <select className={inputCls} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_MOV).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
        </select>
        <input type="date" className={inputCls} value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} aria-label="Desde" />
        <input type="date" className={inputCls} value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} aria-label="Hasta" />
        <button className={btnSecundario} onClick={exportar} disabled={!pag?.total}><BsDownload className="inline mr-1.5" />CSV</button>
      </div>
      {!pag ? (
        <Cargando />
      ) : !pag.total ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl py-12 text-center text-xs text-gray-500">Sin movimientos con estos filtros.</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-gray-400 uppercase text-[10px] tracking-wider font-bold bg-gray-50/50 border-b border-gray-100">
              <tr><th className="px-4 py-2.5">Fecha</th><th className="px-3 py-2.5">Tipo</th><th className="px-3 py-2.5">Material</th><th className="px-3 py-2.5 text-right">Cantidad</th><th className="px-3 py-2.5 text-right">Saldo</th><th className="px-3 py-2.5">Detalle</th><th className="px-3 py-2.5" /></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pag.data.map((m) => (
                <tr key={m.id} className={m.revertidoPor ? 'opacity-50' : ''}>
                  <td className="px-4 py-2.5 whitespace-nowrap">{fmtFechaCorta(m.fecha)}</td>
                  <td className="px-3 py-2.5"><ChipTipoMov tipo={m.tipo} /></td>
                  <td className="px-3 py-2.5 font-semibold text-gray-800">{m.materialNombre}</td>
                  <td className={`px-3 py-2.5 text-right font-black whitespace-nowrap ${m.cantidad > 0 ? 'text-emerald-700' : 'text-gray-800'}`}>{m.cantidad > 0 ? '+' : ''}{fmtN(m.cantidad)} <span className="font-normal text-gray-400">{m.unidad}</span></td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap text-gray-500">{fmtN(m.stockAnterior)} → <b className="text-gray-800">{fmtN(m.stockNuevo)}</b></td>
                  <td className="px-3 py-2.5 text-gray-600 max-w-xs">
                    {m.rubroDescripcion && <div>Rubro: {m.rubroDescripcion}</div>}
                    {m.transferenciaNumero && <div>Transferencia N.º {m.transferenciaNumero}</div>}
                    {m.documentoRef && <div>Doc. {m.documentoRef}</div>}
                    {m.archivoId && <LinkArchivo id={m.archivoId} nombre={m.archivoNombre} onError={setError} />}
                    {m.nota && <div className="italic">{m.nota}</div>}
                    {m.revertidoPor && <div className="text-red-600 font-semibold">Revertido</div>}
                    <div className="text-[10px] text-gray-400">{m.usuarioNombre}{m.costoUnitario != null && ` · ${fmtUSD(m.costoUnitario)} c/u`}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {puedeRevertir(m) && <button className="text-[11px] font-semibold text-gray-400 hover:text-red-600 whitespace-nowrap" onClick={() => setRevertir(m)}>Revertir</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pag.total > pag.data.length && (
            <div className="text-center py-3 border-t border-gray-100"><button className={btnSecundario} onClick={() => setLimite(limite + 50)}>Ver más ({pag.total - pag.data.length})</button></div>
          )}
        </div>
      )}
      <ModalRevertir bodegaId={bodega.id} mov={revertir} onCerrar={() => setRevertir(null)} onHecho={() => { setRevertir(null); onCambio('Movimiento revertido'); }} />
    </div>
  );
};

const ModalRevertir: React.FC<{ bodegaId: number; mov: Movimiento | null; onCerrar: () => void; onHecho: () => void }> = ({ bodegaId, mov, onCerrar, onHecho }) => {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { setMotivo(''); setError(''); }, [mov]);
  if (!mov) return null;
  const guardar = async () => {
    if (motivo.trim().length < 5) return setError('Indica el motivo (mínimo 5 caracteres)');
    try {
      await bodegasAPI.revertir(bodegaId, mov.id, motivo.trim());
      onHecho();
    } catch (e) {
      setError(mensajeError(e));
    }
  };
  return (
    <Modal abierto titulo="Revertir movimiento" subtitulo={`${TIPO_MOV[mov.tipo].texto} · ${mov.materialNombre} · ${fmtN(mov.cantidad)} ${mov.unidad}`} onCerrar={onCerrar} ancho="md"
      pie={<><button className={btnSecundario} onClick={onCerrar}>Cancelar</button><button className="whitespace-nowrap px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold" onClick={guardar}>Revertir</button></>}>
      <div className="space-y-3">
        <Aviso>El kardex no se edita: se registra un movimiento contrario con tu nombre y el motivo. Si el material ya se usó, el stock no alcanzará para revertir.</Aviso>
        <Campo etiqueta="Motivo"><textarea className={inputCls} rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></Campo>
        {error && <Aviso tipo="error">{error}</Aviso>}
      </div>
    </Modal>
  );
};

// ------------------------------------------------------------------ Transferencias de la bodega
const ListaTransferencias: React.FC<{ bodegaId: number; version: number; onAbrir: (id: string) => void }> = ({ bodegaId, version, onAbrir }) => {
  const [lista, setLista] = useState<TransferenciaResumen[] | null>(null);
  const [estado, setEstado] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    transferenciasAPI.listar({ bodegaId, ...(estado && { estado }) }).then(setLista).catch((e) => setError(mensajeError(e)));
  }, [bodegaId, estado, version]);
  return (
    <div className="space-y-3">
      {error && <Aviso tipo="error">{error}</Aviso>}
      <select className={`${inputCls} max-w-xs`} value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado">
        <option value="">Todas</option>
        <option value="ABIERTAS">Abiertas (por aprobar, despachar o recibir)</option>
        <option value="RECIBIDA">Recibidas</option>
        <option value="ANULADA">Anuladas</option>
        <option value="RECHAZADA">Rechazadas por falta de stock</option>
      </select>
      {!lista ? (
        <Cargando />
      ) : !lista.length ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl py-12 text-center text-xs text-gray-500">No hay transferencias.</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden">
          {lista.map((t) => (
            <button key={t.id} className="w-full text-left px-4 py-3 hover:bg-gray-50 flex flex-wrap gap-x-4 gap-y-1 items-center" onClick={() => onAbrir(t.id)}>
              <span className="font-mono text-xs font-bold text-gray-500 w-14">N.º {t.numero}</span>
              <span className="flex-1 min-w-[200px]">
                <span className="block text-xs font-bold text-gray-800">{t.origenNombre} → {t.destinoNombre}</span>
                <span className="block text-[11px] text-gray-500 truncate">{t.materiales} · solicitó {t.creadoPorNombre} · {fmtFechaCorta(t.creadoEn.slice(0, 10))}</span>
                {t.siguientePaso && !['ANULADA', 'RECIBIDA', 'RECHAZADA'].includes(t.estado) && <span className="block text-[11px] text-amber-700">Falta: {t.siguientePaso}</span>}
              </span>
              <ChipTransf estado={t.estado} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ------------------------------------------------------------------ Registrar movimiento
const TIPOS: { k: MovimientoInput['tipo']; t: string; permiso: string; ayuda: string }[] = [
  { k: 'INGRESO', t: 'Ingreso (compra o entrega del proveedor)', permiso: 'bodega.ingresar', ayuda: 'Adjunta la guía de remisión o factura.' },
  { k: 'CONSUMO', t: 'Consumo en obra', permiso: 'bodega.consumo', ayuda: 'Indica el rubro para el control de consumo vs. avances.' },
  { k: 'DEVOLUCION', t: 'Salida / devolución al proveedor', permiso: 'bodega.ingresar', ayuda: 'Material que sale de la bodega sin ir a otra bodega.' },
  { k: 'AJUSTE', t: 'Ajuste de inventario (+/−)', permiso: 'bodega.ajustar', ayuda: 'Corrección por conteo físico. La observación es obligatoria.' },
];

const ModalMovimiento: React.FC<{ abierto: boolean; bodega: Bodega; st: StockBodega; onCerrar: () => void; onHecho: (msg: string) => void }> = ({ abierto, bodega, st, onCerrar, onHecho }) => {
  const { hasPermission } = useAuth();
  const [mats, setMats] = useState<Catalogos['materiales']>([]);
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [f, setF] = useState({ tipo: '' as MovimientoInput['tipo'] | '', materialId: '', cantidad: '', sentido: '+', fecha: '', doc: '', costo: '', rubro: '', nota: '' });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const tipos = TIPOS.filter((x) => hasPermission(x.permiso as never) && (x.k !== 'CONSUMO' || (bodega.tipo === 'OBRA' && bodega.obraEstado === 'ACTIVA')));

  useEffect(() => {
    if (!abierto) return;
    catalogosAPI.todos().then((c) => setMats(c.materiales.filter((m) => m.activo))).catch(() => undefined);
    if (bodega.obraId) rubrosAPI.listar(bodega.obraId).then((r) => setRubros(r.rubros)).catch(() => undefined);
    setF({ tipo: tipos[0]?.k ?? '', materialId: '', cantidad: '', sentido: '+', fecha: hoyEC(), doc: '', costo: '', rubro: '', nota: '' });
    setArchivo(null);
    setError('');
  }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps

  const stockActual = st.materiales.find((m) => String(m.materialId) === f.materialId)?.stock ?? 0;
  const mat = mats.find((m) => String(m.id) === f.materialId);
  const tipo = TIPOS.find((x) => x.k === f.tipo);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = leerNumero(f.cantidad);
    if (!f.tipo) return setError('No tienes permiso para registrar movimientos aquí');
    if (!f.materialId) return setError('Elige el material');
    if (q == null || q <= 0) return setError('La cantidad debe ser mayor que 0');
    const sale = f.tipo === 'CONSUMO' || f.tipo === 'DEVOLUCION' || (f.tipo === 'AJUSTE' && f.sentido === '-');
    if (sale && q > stockActual + 1e-9) return setError(`Stock insuficiente: hay ${fmtN(stockActual)} ${mat?.unidad ?? ''}`);
    if (f.tipo === 'AJUSTE' && !f.nota.trim()) return setError('Explica el ajuste en la observación');
    const errA = validarArchivo(archivo);
    if (errA) return setError(errA);
    setOcupado(true);
    setError('');
    try {
      const archivoId = archivo ? (await archivosAPI.subir(archivo)).id : null;
      const d: MovimientoInput = {
        tipo: f.tipo,
        materialId: Number(f.materialId),
        cantidad: f.tipo === 'AJUSTE' && f.sentido === '-' ? -q : q,
        fecha: f.fecha,
        documentoRef: f.doc.trim() || null,
        archivoId,
        costoUnitario: f.tipo === 'INGRESO' ? leerNumero(f.costo) : null,
        obraRubroId: f.tipo === 'CONSUMO' && f.rubro ? f.rubro : null,
        nota: f.nota.trim() || null,
      };
      const r = await bodegasAPI.registrar(bodega.id, d);
      onHecho(`${TIPO_MOV[r.tipo].texto} registrado: ${r.tipo === 'AJUSTE' && r.cantidad > 0 ? '+' : ''}${fmtN(r.tipo === 'AJUSTE' ? r.cantidad : Math.abs(r.cantidad))} ${r.unidad} de ${r.materialNombre}. Nuevo stock: ${fmtN(r.stockNuevo)}.`);
    } catch (err) {
      setError(mensajeError(err, 'No se pudo registrar'));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal abierto={abierto} titulo="Movimiento de bodega" subtitulo={bodega.nombre} onCerrar={onCerrar} ancho="lg"
      pie={<><button className={btnSecundario} onClick={onCerrar}>Cancelar</button><button className={btnPrimario} type="submit" form="form-mov" disabled={ocupado || !tipos.length}>{ocupado ? 'Registrando...' : 'Registrar movimiento'}</button></>}>
      <form id="form-mov" onSubmit={guardar} className="space-y-4">
        {!tipos.length && <Aviso tipo="alerta">No tienes permisos para registrar movimientos en esta bodega.</Aviso>}
        <Campo etiqueta="Tipo" ayuda={tipo?.ayuda}>
          <select className={inputCls} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as MovimientoInput['tipo'] })}>
            {tipos.map((x) => <option key={x.k} value={x.k}>{x.t}</option>)}
          </select>
        </Campo>
        {bodega.tipo === 'OBRA' && bodega.obraEstado !== 'ACTIVA' && <p className="text-[11px] text-gray-500">Los consumos se habilitan con la obra en ejecución.</p>}
        <Campo etiqueta="Material" ayuda={f.materialId ? `Stock actual: ${fmtN(stockActual)} ${mat?.unidad ?? ''}` : undefined}>
          <select className={inputCls} value={f.materialId} onChange={(e) => setF({ ...f, materialId: e.target.value })}>
            <option value="">Elige...</option>
            {mats.map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.unidad})</option>)}
          </select>
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Fecha"><input type="date" className={inputCls} max={hoyEC()} value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} required /></Campo>
          <Campo etiqueta={`Cantidad${mat ? ` (${mat.unidad})` : ''}`}>
            <div className="flex gap-2">
              {f.tipo === 'AJUSTE' && (
                <select className={`${inputCls} w-20`} value={f.sentido} onChange={(e) => setF({ ...f, sentido: e.target.value })} aria-label="Sentido">
                  <option value="+">+</option><option value="-">−</option>
                </select>
              )}
              <input className={inputCls} inputMode="decimal" placeholder="0" value={f.cantidad} onChange={(e) => setF({ ...f, cantidad: e.target.value })} required />
            </div>
          </Campo>
        </div>
        {f.tipo === 'CONSUMO' && rubros.length > 0 && (
          <Campo etiqueta="Rubro en que se usó">
            <select className={inputCls} value={f.rubro} onChange={(e) => setF({ ...f, rubro: e.target.value })}>
              <option value="">Uso general, sin rubro</option>
              {rubros.map((r) => <option key={r.id} value={r.id}>{(r.codigo ? r.codigo + ' ' : '') + r.descripcion}</option>)}
            </select>
          </Campo>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="N.º de guía, factura o vale (opcional)"><input className={inputCls} maxLength={60} value={f.doc} onChange={(e) => setF({ ...f, doc: e.target.value })} /></Campo>
          {f.tipo === 'INGRESO' && <Campo etiqueta="Costo unitario (opcional)"><input className={inputCls} inputMode="decimal" value={f.costo} onChange={(e) => setF({ ...f, costo: e.target.value })} /></Campo>}
        </div>
        {(f.tipo === 'INGRESO' || f.tipo === 'DEVOLUCION') && (
          <Campo etiqueta="Guía de remisión (PDF o foto, opcional)"><ElegirArchivo archivo={archivo} onElegir={setArchivo} /></Campo>
        )}
        <Campo etiqueta={`Observación${f.tipo === 'AJUSTE' ? '' : ' (opcional)'}`}><textarea className={inputCls} rows={2} maxLength={1000} value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} /></Campo>
        <p className="text-[11px] text-gray-400">Para corregir un registro, revísalo en el kardex y usa «Revertir».</p>
        {error && <Aviso tipo="error">{error}</Aviso>}
      </form>
    </Modal>
  );
};

// ------------------------------------------------------------------ Importar ingreso desde Excel
const ModalImportarIngreso: React.FC<{ abierto: boolean; bodega: Bodega; onCerrar: () => void; onHecho: (m: string) => void }> = ({ abierto, bodega, onCerrar, onHecho }) => {
  const [fecha, setFecha] = useState(hoyEC());
  const [doc, setDoc] = useState('');
  const [guia, setGuia] = useState<File | null>(null);
  useEffect(() => {
    if (abierto) { setFecha(hoyEC()); setDoc(''); setGuia(null); }
  }, [abierto]);
  return (
    <ModalImportarExcel<FilaMaterialExcel>
      abierto={abierto}
      titulo={`Importar ingreso · ${bodega.nombre}`}
      columnasEsperadas={<>El Excel debe tener <b>CODIGO</b>, <b>DESCRIPCIÓN</b>, <b>UNIDAD</b> y <b>CANTIDAD</b> (costo unitario opcional). Cada fila registra un ingreso; los códigos que no existan se crean en el catálogo de materiales.</>}
      leer={(f) => importacionAPI.leerIngreso(bodega.id, f)}
      columnas={[
        { titulo: 'Código', valor: (f) => <span className="font-mono">{f.codigo}</span> },
        { titulo: 'Descripción', valor: (f) => <span>{f.nombre}{f.nombreCatalogo && f.nombreCatalogo !== f.nombre && <span className="block text-[10px] text-gray-400">En catálogo: {f.nombreCatalogo}</span>}</span> },
        { titulo: 'Unidad', valor: (f) => f.unidad },
        { titulo: 'Cantidad', valor: (f) => fmtN(f.cantidad), derecha: true },
        { titulo: 'Material', valor: (f) => (f.nuevo ? <span className="text-blue-700 font-semibold">Nuevo</span> : <span className="text-gray-500">Existente</span>) },
      ]}
      extra={
        <div className="grid sm:grid-cols-3 gap-3">
          <Campo etiqueta="Fecha del ingreso"><input type="date" className={inputCls} max={hoyEC()} value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
          <Campo etiqueta="N.º de guía o factura"><input className={inputCls} maxLength={60} value={doc} onChange={(e) => setDoc(e.target.value)} /></Campo>
          <Campo etiqueta="Guía (PDF o foto, opcional)"><ElegirArchivo archivo={guia} onElegir={setGuia} etiqueta="Adjuntar" /></Campo>
        </div>
      }
      validarExtra={() => (!fecha ? 'Indica la fecha del ingreso' : fecha > hoyEC() ? 'La fecha no puede ser futura' : validarArchivo(guia))}
      confirmar={async (filas) => {
        const archivoId = guia ? (await archivosAPI.subir(guia)).id : null;
        const r = await importacionAPI.importarIngreso(bodega.id, {
          filas: filas.map((f) => ({ codigo: f.codigo!, nombre: f.nombre!, unidad: f.unidad!, cantidad: f.cantidad!, costoUnitario: f.costoUnitario })),
          fecha,
          documentoRef: doc.trim() || null,
          archivoId,
        });
        return `Ingreso registrado: ${r.ingresos} material(es)${r.materialesNuevos ? `, ${r.materialesNuevos} nuevo(s) en el catálogo` : ''}.`;
      }}
      onCerrar={onCerrar}
      onHecho={onHecho}
    />
  );
};
