import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BsArrowDown, BsArrowUp, BsBook, BsDownload, BsPlusLg, BsTrash, BsUpload, BsX } from 'react-icons/bs';
import { catalogosAPI, descargar, importacionAPI, rubrosAPI } from '../../api';
import { mensajeError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import type { Catalogos, ClaseRubro, FilaRubroExcel, Obra, Rubro, RubroInput, RubrosObra as RubrosData } from '../../types';
import { fmtUSD } from '../common/EstadoChip';
import { ModalImportarExcel } from '../common/ImportarExcel';
import { Aviso, Campo, Cargando, Modal, btnPrimario, btnSecundario, inputCls } from '../common/Modal';
import { BarraAvance, fmtN, fmtPct, leerNumero } from './comunes';
import { BarraContrato } from '../habilitacion/VerContrato';

const UNIDADES = ['m', 'm2', 'm3', 'u', 'kg', 'gl', 'km', 'ml'];
const CLASE_TXT: Record<string, string> = { TERMO: 'Línea de termoplástico', TACHAS: 'Tachas instaladas', NINGUNA: 'No aplica' };

/** Pestaña "Rubros": cantidades contractuales, precios, insumos por unidad y avance de cada rubro. */
export const RubrosObra: React.FC<{ obra: Obra; onCambio: () => void }> = ({ obra, onCambio }) => {
  const { hasPermission } = useAuth();
  const [d, setD] = useState<RubrosData | null>(null);
  const [error, setError] = useState('');
  const [editar, setEditar] = useState<Rubro | 'nuevo' | null>(null);
  const [catalogo, setCatalogo] = useState(false);
  const [importar, setImportar] = useState(false);
  const [aviso, setAviso] = useState('');
  const [cat, setCat] = useState<Catalogos | null>(null);

  const cargar = useCallback(() => rubrosAPI.listar(obra.id).then(setD).catch((e) => setError(mensajeError(e))), [obra.id]);
  useEffect(() => {
    cargar();
    catalogosAPI.todos().then(setCat).catch(() => setCat(null));
  }, [cargar]);

  const refrescar = () => {
    cargar();
    onCambio(); // montos de la ficha
  };

  if (!d) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando texto="Cargando rubros..." />;
  const enHab = obra.estado === 'HABILITACION';
  const puedeEditar = hasPermission('rubros.editar') && ['HABILITACION', 'ACTIVA', 'PAUSADA'].includes(obra.estado);

  const mover = async (i: number, delta: number) => {
    const ids = d.rubros.map((r) => r.id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      setD(await rubrosAPI.ordenar(obra.id, ids));
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  const exportar = () =>
    descargar(`/obras/${obra.id}/rubros/exportar`, `rubros-${obra.nombre}.xlsx`).catch((e) => setError(mensajeError(e, 'No se pudo exportar')));

  return (
    <div className="space-y-5">
      {error && <Aviso tipo="error">{error}</Aviso>}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}

      {/* Totales */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tot etiqueta="Monto del contrato" valor={fmtUSD(d.totales.montoContrato)} />
        <Tot etiqueta="Ejecutado" valor={fmtUSD(d.totales.montoEjecutado)} />
        <Tot etiqueta="Avance económico" valor={fmtPct(d.totales.avance)} barra={d.totales.avance} />
        <Tot etiqueta="Saldo por ejecutar" valor={fmtUSD(d.totales.saldo)} />
      </section>

      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h2 className="text-sm font-bold text-gray-800">Rubros de la obra ({d.rubros.length})</h2>
          <p className="text-[11px] text-gray-500">
            {enHab ? 'Carga los rubros de la cotización aprobada con su cantidad y precio unitario.' : 'Toca un rubro para ver su detalle o editarlo.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {d.rubros.length > 0 && <button className={btnSecundario} onClick={exportar}><BsDownload className="inline mr-1.5" />Exportar Excel</button>}
          {puedeEditar && <button className={btnSecundario} onClick={() => setImportar(true)}><BsUpload className="inline mr-1.5" />Importar Excel</button>}
          {puedeEditar && !!cat?.rubros.length && (
            <button className={btnSecundario} onClick={() => setCatalogo(true)}><BsBook className="inline mr-1.5" />Desde catálogo</button>
          )}
          {puedeEditar && <button className={btnPrimario} onClick={() => setEditar('nuevo')}><BsPlusLg className="inline mr-1.5" />Rubro nuevo</button>}
        </div>
      </div>

      {!d.rubros.length ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl py-12 text-center text-xs text-gray-500">Esta obra aún no tiene rubros.</div>
      ) : (
        <>
          {/* Escritorio: tabla */}
          <div className="hidden md:block bg-white border border-gray-200 rounded-2xl overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-gray-400 uppercase text-[10px] tracking-wider font-bold bg-gray-50/50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3">Rubro</th>
                  <th className="px-3 py-3 text-right">Cantidad</th>
                  <th className="px-3 py-3 text-right">P. unitario</th>
                  <th className="px-3 py-3 text-right">Monto</th>
                  {!enHab && <th className="px-3 py-3 w-44">Ejecutado</th>}
                  {!enHab && <th className="px-3 py-3 text-right">Saldo</th>}
                  {puedeEditar && <th className="px-3 py-3 w-16" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {d.rubros.map((r, i) => (
                  <tr key={r.id} className="hover:bg-gray-50/60 cursor-pointer" onClick={() => setEditar(r)}>
                    <td className="px-4 py-3 max-w-md">
                      <div className="text-[10px] font-mono text-gray-400">{r.codigo || 's/c'}</div>
                      <div className="font-semibold text-gray-800">{r.descripcion}</div>
                      {r.insumos.length > 0 && <div className="text-[10px] text-gray-400 mt-0.5 truncate">{r.insumos.map((x) => x.nombre).join(' · ')}</div>}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">{fmtN(r.cantidad)} {r.unidad}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">{fmtUSD(r.precioUnitario)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap font-semibold">{fmtUSD(r.montoContrato)}</td>
                    {!enHab && (
                      <td className="px-3 py-3">
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-gray-600">{fmtN(r.ejecutado)}</span>
                          <span className={`font-bold ${r.excede ? 'text-red-600' : 'text-gray-800'}`}>{fmtPct(r.avance)}</span>
                        </div>
                        <BarraAvance valor={r.avance} />
                      </td>
                    )}
                    {!enHab && <td className={`px-3 py-3 text-right whitespace-nowrap ${r.saldo < 0 ? 'text-red-600 font-bold' : ''}`}>{fmtN(r.saldo)}</td>}
                    {puedeEditar && (
                      <td className="px-3 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button className="p-1 text-gray-300 hover:text-gray-700 disabled:opacity-30" disabled={i === 0} onClick={() => mover(i, -1)} title="Subir"><BsArrowUp /></button>
                        <button className="p-1 text-gray-300 hover:text-gray-700 disabled:opacity-30" disabled={i === d.rubros.length - 1} onClick={() => mover(i, 1)} title="Bajar"><BsArrowDown /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Celular: tarjetas (como la app original) */}
          <div className="md:hidden space-y-3">
            {d.rubros.map((r) => (
              <button key={r.id} onClick={() => setEditar(r)} className="w-full text-left bg-white border border-gray-200 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono text-gray-400">{r.codigo || 's/c'}</span>
                  <span className={`text-xs font-black ${r.excede ? 'text-red-600' : 'text-gray-800'}`}>{enHab ? fmtUSD(r.montoContrato) : fmtPct(r.avance)}</span>
                </div>
                <h3 className="text-xs font-bold text-gray-800">{r.descripcion}</h3>
                {!enHab && <BarraAvance valor={r.avance} />}
                <div className="flex justify-between text-[11px] text-gray-500">
                  <span>{!enHab && `${fmtN(r.ejecutado)} de `}{fmtN(r.cantidad)} {r.unidad}</span>
                  <span>{fmtUSD(r.precioUnitario)} / {r.unidad}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <ModalRubro
        obra={obra}
        rubro={editar}
        materiales={cat?.materiales.filter((m) => m.activo) ?? []}
        puedeEditar={puedeEditar}
        onCerrar={() => setEditar(null)}
        onHecho={() => {
          setEditar(null);
          refrescar();
        }}
      />
      <ModalImportarExcel<FilaRubroExcel>
        abierto={importar}
        titulo="Importar rubros desde Excel"
        columnasEsperadas={<>El Excel debe tener las columnas <b>DESCRIPCIÓN</b>, <b>UNIDAD</b>, <b>CANTIDAD</b> y <b>P. UNIT</b> (el código es opcional). Cada fila crea un rubro con su cantidad contractual y precio.</>}
        leer={(f) => importacionAPI.leerRubrosObra(obra.id, f)}
        columnas={[
          { titulo: 'Descripción', valor: (f) => <span className="text-gray-800">{f.codigo && <span className="font-mono text-[10px] text-gray-400 mr-1">{f.codigo}</span>}{f.descripcion}</span> },
          { titulo: 'Unidad', valor: (f) => f.unidad },
          { titulo: 'Cantidad', valor: (f) => fmtN(f.cantidad), derecha: true },
          { titulo: 'P. unit', valor: (f) => (f.precioUnitario != null ? fmtUSD(f.precioUnitario) : '—'), derecha: true },
          { titulo: 'Total', valor: (f) => (f.cantidad != null && f.precioUnitario != null ? fmtUSD(f.cantidad * f.precioUnitario) : '—'), derecha: true },
        ]}
        omitir={(f) => !!f.yaExiste}
        textoOmitida="Ya existe en la obra"
        confirmar={async (filas) => {
          const r = await importacionAPI.importarRubrosObra(obra.id, filas.map((f) => ({ codigo: f.codigo, descripcion: f.descripcion!, unidad: f.unidad!, cantidad: f.cantidad!, precioUnitario: f.precioUnitario })));
          return `Se importaron ${r.creados} rubro(s)${r.omitidos.length ? `; ${r.omitidos.length} omitido(s) por existir` : ''}. Revisa sus insumos por unidad para el programa.`;
        }}
        onCerrar={() => setImportar(false)}
        onHecho={(m) => { setImportar(false); setAviso(m); setTimeout(() => setAviso(''), 8000); refrescar(); }}
      />
      <ModalCatalogo
        abierto={catalogo}
        obraId={obra.id}
        catalogo={cat?.rubros.filter((r) => r.activo) ?? []}
        yaEnObra={d.rubros.map((r) => r.catalogoRubroId).filter((x): x is number => x != null)}
        onCerrar={() => setCatalogo(false)}
        onHecho={() => {
          setCatalogo(false);
          refrescar();
        }}
      />
    </div>
  );
};

const Tot: React.FC<{ etiqueta: string; valor: string; barra?: number }> = ({ etiqueta, valor, barra }) => (
  <div className="bg-white border border-gray-200 rounded-2xl p-4">
    <div className="text-base font-black text-gray-800 truncate">{valor}</div>
    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-1">{etiqueta}</div>
    {barra != null && <BarraAvance valor={barra} className="mt-2" />}
  </div>
);

// ------------------------------------------------------------------ Modal de rubro
interface FilaInsumo { materialId: string; cantidad: string }

const ModalRubro: React.FC<{
  obra: Obra;
  rubro: Rubro | 'nuevo' | null;
  materiales: Catalogos['materiales'];
  puedeEditar: boolean;
  onCerrar: () => void;
  onHecho: () => void;
}> = ({ obra, rubro, materiales, puedeEditar, onCerrar, onHecho }) => {
  const { showConfirm } = useModal();
  const nuevo = rubro === 'nuevo';
  const r = rubro && rubro !== 'nuevo' ? rubro : null;
  const [f, setF] = useState({ codigo: '', descripcion: '', unidad: 'm', cantidad: '', precio: '', clase: '', ancho: '' });
  const [ins, setIns] = useState<FilaInsumo[]>([]);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    setError('');
    setF({
      codigo: r?.codigo ?? '',
      descripcion: r?.descripcion ?? '',
      unidad: r?.unidad ?? 'm',
      cantidad: r ? String(r.cantidad) : '',
      precio: r ? String(r.precioUnitario) : '',
      clase: r?.clase ?? '',
      ancho: r?.anchoCm ? String(r.anchoCm) : '',
    });
    setIns(r?.insumos.map((i) => ({ materialId: String(i.materialId), cantidad: String(i.cantidadPorUnidad) })) ?? []);
  }, [rubro]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clase y ancho automáticos (misma regla que la API) para mostrar como sugerencia
  const auto = useMemo(() => {
    const d = f.descripcion.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const clase = /tacha/.test(d) ? 'TACHAS' : /termo/.test(d) ? 'TERMO' : null;
    const m = f.descripcion.match(/(\d+(?:[.,]\d+)?)\s*cm/i);
    return { clase, ancho: m ? m[1] : '15' };
  }, [f.descripcion]);

  if (!rubro) return null;
  const soloLectura = !puedeEditar;
  const enHab = obra.estado === 'HABILITACION';

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const cantidad = leerNumero(f.cantidad);
    const precio = leerNumero(f.precio) ?? 0;
    if (f.descripcion.trim().length < 3) return setError('Escribe la descripción del rubro');
    if (cantidad == null || cantidad < 0) return setError('Indica la cantidad contractual');
    if (precio < 0) return setError('El precio no puede ser negativo');
    const insumos: { materialId: number; cantidadPorUnidad: number }[] = [];
    for (const i of ins) {
      if (!i.materialId && !i.cantidad) continue;
      const q = leerNumero(i.cantidad);
      if (!i.materialId || q == null || q <= 0) return setError('Cada insumo necesita material y una cantidad por unidad mayor que 0');
      if (insumos.some((x) => x.materialId === Number(i.materialId))) return setError('Hay un material repetido en los insumos');
      insumos.push({ materialId: Number(i.materialId), cantidadPorUnidad: q });
    }
    const datos: RubroInput = {
      codigo: f.codigo.trim() || null,
      descripcion: f.descripcion.trim(),
      unidad: f.unidad.trim(),
      cantidad,
      precioUnitario: precio,
      clase: (f.clase || null) as ClaseRubro | null,
      anchoCm: leerNumero(f.ancho),
      insumos,
    };
    setOcupado(true);
    setError('');
    try {
      if (nuevo) await rubrosAPI.crear(obra.id, datos);
      else await rubrosAPI.actualizar(obra.id, r!.id, datos);
      onHecho();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo guardar el rubro'));
    } finally {
      setOcupado(false);
    }
  };

  const eliminar = async () => {
    if (!r) return;
    if (!(await showConfirm({ title: 'Eliminar rubro', message: `¿Eliminar «${r.descripcion}» de la obra?`, confirmLabel: 'Eliminar', type: 'danger' }))) return;
    try {
      await rubrosAPI.eliminar(obra.id, r.id);
      onHecho();
    } catch (err) {
      setError(mensajeError(err));
    }
  };

  return (
    <Modal
      abierto
      titulo={nuevo ? 'Nuevo rubro' : soloLectura ? r!.descripcion : 'Rubro'}
      subtitulo={r?.codigo ?? undefined}
      onCerrar={onCerrar}
      ancho="xl"
      pie={
        soloLectura ? (
          <button className={btnSecundario} onClick={onCerrar}>Cerrar</button>
        ) : (
          <>
            {r && r.totalAvances === 0 && (
              <button type="button" className="mr-auto text-xs font-semibold text-red-600 hover:text-red-700" onClick={eliminar}>
                <BsTrash className="inline mr-1" />Eliminar rubro
              </button>
            )}
            <button className={btnSecundario} onClick={onCerrar}>Cancelar</button>
            <button className={btnPrimario} type="submit" form="form-rubro" disabled={ocupado}>{ocupado ? 'Guardando...' : 'Guardar rubro'}</button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {!soloLectura && <BarraContrato obraId={obra.id} />}
        {r && !enHab && (
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 space-y-2">
            <BarraAvance valor={r.avance} />
            <p className="text-[11px] text-gray-600">
              Ejecutado <b>{fmtN(r.ejecutado)}</b> de {fmtN(r.cantidad)} {r.unidad} ({fmtPct(r.avance)}). Saldo {fmtN(r.saldo)} {r.unidad}. Monto {fmtUSD(r.montoEjecutado)} de {fmtUSD(r.montoContrato)}.
            </p>
            {r.excede && <Aviso tipo="alerta">La cantidad ejecutada supera la contractual. Revisa si corresponde a una orden de cambio o cantidades adicionales.</Aviso>}
          </div>
        )}
        {soloLectura && r ? (
          <dl className="text-xs space-y-1.5">
            <div className="flex justify-between"><dt className="text-gray-400">Precio unitario</dt><dd className="font-semibold">{fmtUSD(r.precioUnitario)} / {r.unidad}</dd></div>
            {r.insumos.map((i) => (
              <div key={i.materialId} className="flex justify-between"><dt className="text-gray-400">{i.nombre}</dt><dd>{fmtN(i.cantidadPorUnidad, 6)} {i.unidad} / {r.unidad}</dd></div>
            ))}
          </dl>
        ) : (
          <form id="form-rubro" onSubmit={guardar} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Campo etiqueta="Código" className="col-span-2"><input className={inputCls} value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} placeholder="Ej. 705-(1)" maxLength={30} /></Campo>
              <Campo etiqueta="Unidad">
                <input className={inputCls} list="unidades" value={f.unidad} onChange={(e) => setF({ ...f, unidad: e.target.value })} maxLength={20} required />
                <datalist id="unidades">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
              </Campo>
            </div>
            <Campo etiqueta="Descripción">
              <textarea className={inputCls} rows={2} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} maxLength={300} required />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Cantidad contractual"><input className={inputCls} inputMode="decimal" value={f.cantidad} onChange={(e) => setF({ ...f, cantidad: e.target.value })} required /></Campo>
              <Campo etiqueta="Precio unitario (USD)"><input className={inputCls} inputMode="decimal" value={f.precio} onChange={(e) => setF({ ...f, precio: e.target.value })} /></Campo>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Rendimiento de materiales</p>
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Suma su avance a">
                  <select className={inputCls} value={f.clase} onChange={(e) => setF({ ...f, clase: e.target.value })}>
                    <option value="">Automático ({auto.clase ? CLASE_TXT[auto.clase] : 'no aplica'})</option>
                    <option value="TERMO">{CLASE_TXT.TERMO}</option>
                    <option value="TACHAS">{CLASE_TXT.TACHAS}</option>
                    <option value="NINGUNA">{CLASE_TXT.NINGUNA}</option>
                  </select>
                </Campo>
                <Campo etiqueta="Ancho de línea (cm)"><input className={inputCls} inputMode="decimal" value={f.ancho} placeholder={auto.ancho} onChange={(e) => setF({ ...f, ancho: e.target.value })} /></Campo>
              </div>
              <p className="text-[11px] text-gray-400">Automático reconoce «termo» y «tacha» en la descripción y toma el ancho escrito en cm (por defecto 15). Una línea de 10 cm cuenta 10/15 de metro equivalente.</p>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Insumos por unidad del rubro</p>
              <p className="text-[11px] text-gray-400">Material que consume una unidad del rubro según el APU. Ej.: 0,9 kg de termoplástico por metro de línea. Sirve para el programa y la necesidad de producto.</p>
              {ins.map((i, k) => {
                const mat = materiales.find((m) => String(m.id) === i.materialId);
                return (
                  <div key={k} className="flex gap-2 items-center">
                    <select className={`${inputCls} flex-1`} value={i.materialId} onChange={(e) => setIns(ins.map((x, j) => (j === k ? { ...x, materialId: e.target.value } : x)))}>
                      <option value="">Material...</option>
                      {materiales.map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.unidad})</option>)}
                    </select>
                    <input className={`${inputCls} w-28`} inputMode="decimal" placeholder={`${mat?.unidad ?? ''} / ${f.unidad}`} value={i.cantidad} onChange={(e) => setIns(ins.map((x, j) => (j === k ? { ...x, cantidad: e.target.value } : x)))} />
                    <button type="button" className="p-2 text-gray-400 hover:text-red-600" onClick={() => setIns(ins.filter((_, j) => j !== k))} title="Quitar"><BsX /></button>
                  </div>
                );
              })}
              <button type="button" className="text-xs font-semibold text-gray-600 hover:text-gray-900" onClick={() => setIns([...ins, { materialId: '', cantidad: '' }])}>
                <BsPlusLg className="inline mr-1" />Agregar insumo
              </button>
            </div>
            {r && r.totalAvances > 0 && <p className="text-[11px] text-gray-400">Este rubro tiene {r.totalAvances} avance(s): no se puede eliminar. Si ya no aplica, deja su cantidad en 0.</p>}
            {error && <Aviso tipo="error">{error}</Aviso>}
          </form>
        )}
      </div>
    </Modal>
  );
};

// ------------------------------------------------------------------ Agregar desde catálogo
const ModalCatalogo: React.FC<{
  abierto: boolean;
  obraId: string;
  catalogo: Catalogos['rubros'];
  yaEnObra: number[];
  onCerrar: () => void;
  onHecho: () => void;
}> = ({ abierto, obraId, catalogo, yaEnObra, onCerrar, onHecho }) => {
  const [sel, setSel] = useState<Record<number, { cantidad: string; precio: string }>>({});
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (abierto) {
      setSel({});
      setQ('');
      setError('');
    }
  }, [abierto]);

  const lista = catalogo.filter((c) => {
    const t = q.trim().toLowerCase();
    return !t || c.descripcion.toLowerCase().includes(t) || (c.codigo ?? '').toLowerCase().includes(t);
  });

  const guardar = async () => {
    const items = [];
    for (const [id, v] of Object.entries(sel)) {
      const cantidad = leerNumero(v.cantidad);
      if (cantidad == null || cantidad < 0) return setError('Indica la cantidad de cada rubro marcado');
      const precio = leerNumero(v.precio);
      items.push({ catalogoRubroId: Number(id), cantidad, ...(precio != null && { precioUnitario: precio }) });
    }
    if (!items.length) return setError('Marca al menos un rubro');
    setOcupado(true);
    setError('');
    try {
      await rubrosAPI.desdeCatalogo(obraId, items);
      onHecho();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal abierto={abierto} titulo="Agregar desde catálogo" subtitulo="Marca los rubros y escribe la cantidad contractual de esta obra" onCerrar={onCerrar} ancho="3xl"
      pie={<><button className={btnSecundario} onClick={onCerrar}>Cancelar</button><button className={btnPrimario} onClick={guardar} disabled={ocupado}>{ocupado ? 'Agregando...' : `Agregar ${Object.keys(sel).length || ''} a la obra`}</button></>}>
      <div className="space-y-3">
        <BarraContrato obraId={obraId} />
        <input className={inputCls} placeholder="Buscar en el catálogo..." value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-[50vh] overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-xl">
          {lista.map((c) => {
            const ya = yaEnObra.includes(c.id);
            const s = sel[c.id];
            return (
              <div key={c.id} className={`p-3 flex gap-3 items-start ${ya ? 'opacity-50' : ''}`}>
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={ya}
                  checked={!!s}
                  onChange={(e) => {
                    const n = { ...sel };
                    if (e.target.checked) n[c.id] = { cantidad: '', precio: String(c.puRef) };
                    else delete n[c.id];
                    setSel(n);
                  }}
                />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="text-xs"><span className="font-mono text-[10px] text-gray-400 mr-1">{c.codigo || 's/c'}</span><b className="text-gray-800">{c.descripcion}</b> <span className="text-gray-400">({c.unidad})</span></div>
                  {ya && <p className="text-[11px] text-gray-500">Ya está en la obra</p>}
                  {s && (
                    <div className="grid grid-cols-2 gap-2">
                      <input className={inputCls} inputMode="decimal" placeholder={`Cantidad (${c.unidad})`} value={s.cantidad} autoFocus onChange={(e) => setSel({ ...sel, [c.id]: { ...s, cantidad: e.target.value } })} />
                      <input className={inputCls} inputMode="decimal" placeholder="Precio unitario" value={s.precio} onChange={(e) => setSel({ ...sel, [c.id]: { ...s, precio: e.target.value } })} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {error && <Aviso tipo="error">{error}</Aviso>}
      </div>
    </Modal>
  );
};
