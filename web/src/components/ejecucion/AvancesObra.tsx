import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BsCamera, BsDownload, BsPlusLg, BsSlashCircle, BsX } from 'react-icons/bs';
import { archivosAPI, avancesAPI, habilitacionAPI, rubrosAPI } from '../../api';
import { mensajeError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Avance, AvanceInput, Obra, PaginaAvances, Rubro } from '../../types';
import { fmtUSD } from '../common/EstadoChip';
import { Aviso, Campo, Cargando, Modal, btnPrimario, btnSecundario, inputCls } from '../common/Modal';
import { LinkArchivo, validarArchivo } from '../habilitacion/comunes';
import { abscisaMetros, descargarCsv, fmtFechaCorta, fmtN, hoyEC, leerNumero } from './comunes';

interface Ctr { id: string; nombre: string }

/** Pestaña "Avances": registro diario por rubro, frente, abscisas y contratista (como la app original). */
export const AvancesObra: React.FC<{ obra: Obra; onCambio: () => void }> = ({ obra, onCambio }) => {
  const { user, hasPermission, esPropietario } = useAuth();
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [ctrs, setCtrs] = useState<Ctr[]>([]);
  const [pag, setPag] = useState<PaginaAvances | null>(null);
  const [filtro, setFiltro] = useState({ rubroId: '', contratista: '', desde: '', hasta: '', incluirAnulados: false });
  const [limite, setLimite] = useState(50);
  const [error, setError] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const [anular, setAnular] = useState<Avance | null>(null);
  const [aviso, setAviso] = useState('');

  const cargarBase = useCallback(async () => {
    try {
      const [r, h] = await Promise.all([rubrosAPI.listar(obra.id), habilitacionAPI.obtener(obra.id)]);
      setRubros(r.rubros);
      setCtrs(h.contratistas.map((c) => ({ id: c.id, nombre: c.razonSocial })));
    } catch (e) {
      setError(mensajeError(e));
    }
  }, [obra.id]);

  const cargar = useCallback(() => {
    const f = Object.fromEntries(Object.entries(filtro).filter(([, v]) => v !== '' && v !== false));
    return avancesAPI.listar(obra.id, { ...f, limit: limite }).then(setPag).catch((e) => setError(mensajeError(e)));
  }, [obra.id, filtro, limite]);

  useEffect(() => {
    cargarBase();
  }, [cargarBase]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const puedeRegistrar = hasPermission('avances.registrar') && obra.estado === 'ACTIVA' && rubros.length > 0;
  const puedeAnular = (a: Avance) =>
    !a.anuladoEn && ['ACTIVA', 'PAUSADA'].includes(obra.estado) && (a.registradoPorId === user?.id || esPropietario || hasPermission('avances.anular'));

  const grupos = useMemo(() => {
    const g: { fecha: string; items: Avance[] }[] = [];
    for (const a of pag?.data ?? []) {
      const ult = g[g.length - 1];
      if (ult?.fecha === a.fecha) ult.items.push(a);
      else g.push({ fecha: a.fecha, items: [a] });
    }
    return g;
  }, [pag]);

  const exportar = async () => {
    try {
      const f = Object.fromEntries(Object.entries(filtro).filter(([, v]) => v !== '' && v !== false));
      const todo = await avancesAPI.listar(obra.id, { ...f, limit: 5000 });
      descargarCsv(`avances-${obra.nombre}.csv`, [
        ['Fecha', 'Código', 'Rubro', 'Unidad', 'Cantidad', 'Monto', 'Ejecutó', 'Tramo', 'Abscisa desde', 'Abscisa hasta', 'Frente', 'Color', 'Tipo de línea', 'N.º líneas', 'Observación', 'Registró', 'Anulado', 'Motivo anulación'],
        ...todo.data.map((a) => [
          a.fecha, a.rubroCodigo, a.rubroDescripcion, a.unidad, a.cantidad, a.monto, a.contratistaNombre ?? 'ST INNOVA', a.tramo, a.abscisaDesde, a.abscisaHasta,
          a.frente, a.color, a.tipoLinea, a.numLineas, a.nota, a.registradoPor, a.anuladoEn ? 'Sí' : '', a.motivoAnulacion,
        ]),
      ]);
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  const hecho = (msg: string) => {
    setAviso(msg);
    setTimeout(() => setAviso(''), 6000);
    cargar();
    cargarBase();
    onCambio();
  };

  return (
    <div className="space-y-5">
      {error && <Aviso tipo="error">{error}</Aviso>}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
      {obra.estado !== 'ACTIVA' && <Aviso>Solo se registran avances con la obra en ejecución.</Aviso>}

      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h2 className="text-sm font-bold text-gray-800">Avances registrados</h2>
          {pag && (
            <p className="text-[11px] text-gray-500">
              {pag.total} registro(s){filtro.rubroId && ` · ${fmtN(pag.sumas.cantidad)} ${rubros.find((r) => r.id === filtro.rubroId)?.unidad ?? ''}`} · {fmtUSD(pag.sumas.monto)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!!pag?.total && <button className={btnSecundario} onClick={exportar}><BsDownload className="inline mr-1.5" />CSV</button>}
          {puedeRegistrar && <button className={btnPrimario} onClick={() => setNuevo(true)}><BsPlusLg className="inline mr-1.5" />Registrar avance</button>}
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-gray-200 rounded-2xl p-3 grid sm:grid-cols-2 lg:grid-cols-5 gap-2 items-center">
        <select className={`${inputCls} lg:col-span-2`} value={filtro.rubroId} onChange={(e) => setFiltro({ ...filtro, rubroId: e.target.value })} aria-label="Rubro">
          <option value="">Todos los rubros</option>
          {rubros.map((r) => <option key={r.id} value={r.id}>{(r.codigo ? r.codigo + ' ' : '') + r.descripcion}</option>)}
        </select>
        <select className={inputCls} value={filtro.contratista} onChange={(e) => setFiltro({ ...filtro, contratista: e.target.value })} aria-label="Ejecutó">
          <option value="">Todos (ST y contratistas)</option>
          <option value="ST">ST INNOVA (personal propio)</option>
          {ctrs.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <div className="flex gap-2 lg:col-span-2">
          <input type="date" className={inputCls} value={filtro.desde} onChange={(e) => setFiltro({ ...filtro, desde: e.target.value })} aria-label="Desde" />
          <input type="date" className={inputCls} value={filtro.hasta} onChange={(e) => setFiltro({ ...filtro, hasta: e.target.value })} aria-label="Hasta" />
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer lg:col-span-5">
          <input type="checkbox" checked={filtro.incluirAnulados} onChange={(e) => setFiltro({ ...filtro, incluirAnulados: e.target.checked })} /> Mostrar anulados
        </label>
      </div>

      {!pag ? (
        <Cargando />
      ) : !pag.total ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl py-12 text-center text-xs text-gray-500">
          {filtro.rubroId || filtro.contratista || filtro.desde || filtro.hasta ? 'No hay avances con estos filtros.' : 'Aún no se registran avances en esta obra.'}
        </div>
      ) : (
        <div className="space-y-4">
          {grupos.map((g) => (
            <section key={g.fecha}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">{fmtFechaCorta(g.fecha)}</p>
              <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden">
                {g.items.map((a) => (
                  <FilaAvance key={a.id} a={a} onAnular={puedeAnular(a) ? () => setAnular(a) : undefined} onError={setError} />
                ))}
              </div>
            </section>
          ))}
          {pag.total > pag.data.length && (
            <div className="text-center">
              <button className={btnSecundario} onClick={() => setLimite(limite + 50)}>Ver más ({pag.total - pag.data.length} restantes)</button>
            </div>
          )}
        </div>
      )}

      <ModalAvance
        abierto={nuevo}
        obra={obra}
        rubros={rubros}
        ctrs={ctrs}
        rubroInicial={filtro.rubroId}
        onCerrar={() => setNuevo(false)}
        onHecho={(msg) => {
          setNuevo(false);
          hecho(msg);
        }}
      />
      <ModalAnular
        obraId={obra.id}
        avance={anular}
        onCerrar={() => setAnular(null)}
        onHecho={() => {
          setAnular(null);
          hecho('Avance anulado');
        }}
      />
    </div>
  );
};

const FilaAvance: React.FC<{ a: Avance; onAnular?: () => void; onError: (m: string) => void }> = ({ a, onAnular, onError }) => {
  const abs = [a.abscisaDesde, a.abscisaHasta].filter(Boolean).join(' a ');
  const anexo = [a.tramo, a.color, a.tipoLinea, a.numLineas && a.numLineas > 1 ? `${a.numLineas} líneas` : ''].filter(Boolean).join(' · ');
  return (
    <div className={`flex gap-4 px-4 py-3 ${a.anuladoEn ? 'bg-gray-50 opacity-70' : ''}`}>
      <div className="w-24 shrink-0 text-right">
        <div className={`text-base font-black ${a.anuladoEn ? 'line-through text-gray-400' : 'text-gray-800'}`}>{fmtN(a.cantidad)}</div>
        <div className="text-[11px] text-gray-400">{a.unidad}</div>
      </div>
      <div className="flex-1 min-w-0 text-xs space-y-0.5">
        <div className="font-bold text-gray-800">{(a.rubroCodigo ? a.rubroCodigo + ' ' : '') + a.rubroDescripcion}</div>
        {(abs || a.frente) && <p className="text-gray-600">{abs && `Abscisa ${abs}`}{abs && a.frente ? '. ' : ''}{a.frente}</p>}
        {anexo && <p className="text-gray-500">{anexo}</p>}
        {a.nota && <p className="text-gray-600 italic">{a.nota}</p>}
        <p className="text-[11px] text-gray-400">
          Ejecutó: {a.contratistaNombre ?? 'ST INNOVA'} · Registró {a.registradoPor} · {fmtUSD(a.monto)}
        </p>
        {a.evidencias.length > 0 && (
          <div className="flex flex-wrap gap-3 pt-1">
            {a.evidencias.map((e) => <LinkArchivo key={e.id} id={e.id} nombre={e.nombre} onError={onError} />)}
          </div>
        )}
        {a.anuladoEn && (
          <p className="text-[11px] text-red-600 font-semibold">Anulado por {a.anuladoPor}: {a.motivoAnulacion}</p>
        )}
      </div>
      {onAnular && (
        <button className="self-start p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50" title="Anular avance" onClick={onAnular}>
          <BsSlashCircle />
        </button>
      )}
    </div>
  );
};

// ------------------------------------------------------------------ Registrar avance
const VACIO = { obraRubroId: '', fecha: '', cantidad: '', desde: '', hasta: '', frente: '', tramo: '', color: '', numLineas: '1', tipoLinea: '', ctr: '', nota: '' };
let ultTramo = '';
let ultCtr = '';

const ModalAvance: React.FC<{
  abierto: boolean;
  obra: Obra;
  rubros: Rubro[];
  ctrs: Ctr[];
  rubroInicial: string;
  onCerrar: () => void;
  onHecho: (msg: string) => void;
}> = ({ abierto, obra, rubros, ctrs, rubroInicial, onCerrar, onHecho }) => {
  const [f, setF] = useState(VACIO);
  const [fotos, setFotos] = useState<File[]>([]);
  const [anexo, setAnexo] = useState(false);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setF({ ...VACIO, obraRubroId: rubroInicial || rubros[0]?.id || '', fecha: hoyEC(), tramo: ultTramo, ctr: ultCtr && ctrs.some((c) => c.id === ultCtr) ? ultCtr : '' });
    setFotos([]);
    setAnexo(false);
    setError('');
  }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps

  const r = rubros.find((x) => x.id === f.obraRubroId);

  /** Con abscisas, N.º de líneas y tipo la cantidad se calcula sola (segmentada = longitud / 4), como en el anexo. */
  const recalcular = (n: typeof f) => {
    const a = abscisaMetros(n.desde);
    const b = abscisaMetros(n.hasta);
    if (a == null || b == null || b <= a) return n;
    const lineas = Number(n.numLineas) || 1;
    const largo = n.tipoLinea === 'SEGMENTADA' ? (b - a) / 4 : b - a;
    return { ...n, cantidad: String(Math.round(lineas * largo * 100) / 100) };
  };
  const cambiar = (k: keyof typeof f, v: string, calc = false) => setF((p) => (calc ? recalcular({ ...p, [k]: v }) : { ...p, [k]: v }));

  const cantidad = leerNumero(f.cantidad);
  const excedera = r && cantidad != null && r.ejecutado + cantidad > r.cantidad + 1e-6;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!r) return setError('Elige el rubro');
    if (cantidad == null || cantidad <= 0) return setError('La cantidad debe ser mayor que 0. Para corregir un registro, anúlalo y vuelve a registrarlo.');
    if (f.fecha > hoyEC()) return setError('La fecha no puede ser futura');
    const a = abscisaMetros(f.desde);
    const b = abscisaMetros(f.hasta);
    if ((f.desde && a == null) || (f.hasta && b == null)) return setError('Abscisa no válida (ej. 94+131)');
    if (a != null && b != null && b <= a) return setError('La abscisa «hasta» debe ser mayor que «desde»');
    for (const x of fotos) {
      const err = validarArchivo(x);
      if (err) return setError(`${x.name}: ${err}`);
    }
    setOcupado(true);
    setError('');
    try {
      const evidencias: string[] = [];
      for (const x of fotos) evidencias.push((await archivosAPI.subir(x, 'EVIDENCIA')).id);
      const d: AvanceInput = {
        obraRubroId: r.id,
        fecha: f.fecha,
        cantidad,
        obraContratistaId: f.ctr || null,
        frente: f.frente.trim() || null,
        tramo: f.tramo.trim() || null,
        abscisaDesde: f.desde.trim() || null,
        abscisaHasta: f.hasta.trim() || null,
        color: f.color || null,
        tipoLinea: f.tipoLinea || null,
        numLineas: f.numLineas ? Number(f.numLineas) : null,
        nota: f.nota.trim() || null,
        evidencias,
      };
      const res = await avancesAPI.registrar(obra.id, d);
      ultTramo = f.tramo.trim();
      ultCtr = f.ctr;
      onHecho(
        `Avance registrado: ${fmtN(cantidad)} ${r.unidad}. Saldo del rubro: ${fmtN(res.rubro.saldo)} ${r.unidad}` +
          (res.rubro.excede ? '. Atención: ya supera la cantidad contractual.' : '.'),
      );
    } catch (err) {
      setError(mensajeError(err, 'No se pudo registrar el avance'));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal abierto={abierto} titulo="Registrar avance" subtitulo={obra.nombre} onCerrar={onCerrar} ancho="xl"
      pie={<><button className={btnSecundario} onClick={onCerrar}>Cancelar</button><button className={btnPrimario} type="submit" form="form-avance" disabled={ocupado}>{ocupado ? 'Registrando...' : 'Registrar avance'}</button></>}>
      <form id="form-avance" onSubmit={guardar} className="space-y-4">
        <Campo etiqueta="Rubro">
          <select className={inputCls} value={f.obraRubroId} onChange={(e) => cambiar('obraRubroId', e.target.value)}>
            {rubros.map((x) => <option key={x.id} value={x.id}>{(x.codigo ? x.codigo + ' ' : '') + x.descripcion}</option>)}
          </select>
          {r && <p className="text-[11px] text-gray-500 mt-1">Contratado {fmtN(r.cantidad)} {r.unidad}. Ejecutado {fmtN(r.ejecutado)}. Saldo {fmtN(r.saldo)} {r.unidad}.</p>}
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Fecha"><input type="date" className={inputCls} max={hoyEC()} value={f.fecha} onChange={(e) => cambiar('fecha', e.target.value)} required /></Campo>
          <Campo etiqueta={`Cantidad${r ? ` (${r.unidad})` : ''}`}><input className={inputCls} inputMode="decimal" placeholder="0" value={f.cantidad} onChange={(e) => cambiar('cantidad', e.target.value)} required /></Campo>
        </div>
        {excedera && <Aviso tipo="alerta">Con esta cantidad el rubro supera lo contratado. Se puede registrar, pero revisa si corresponde a una orden de cambio.</Aviso>}
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Abscisa desde (opcional)"><input className={inputCls} placeholder="94+131" value={f.desde} onChange={(e) => cambiar('desde', e.target.value, true)} /></Campo>
          <Campo etiqueta="Abscisa hasta (opcional)"><input className={inputCls} placeholder="96+040" value={f.hasta} onChange={(e) => cambiar('hasta', e.target.value, true)} /></Campo>
        </div>
        <Campo etiqueta="Frente o carril (opcional)"><input className={inputCls} placeholder="Eje, borde derecho, intersección..." maxLength={100} value={f.frente} onChange={(e) => cambiar('frente', e.target.value)} /></Campo>

        <div className="border border-gray-200 rounded-xl">
          <button type="button" className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700" onClick={() => setAnexo(!anexo)}>
            {anexo ? '▾' : '▸'} Datos para el anexo (memoria de cálculo)
          </button>
          {anexo && (
            <div className="px-3 pb-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Tramo o sector"><input className={inputCls} placeholder="TRAMO 4" maxLength={100} value={f.tramo} onChange={(e) => cambiar('tramo', e.target.value)} /></Campo>
                <Campo etiqueta="Color">
                  <select className={inputCls} value={f.color} onChange={(e) => cambiar('color', e.target.value)}><option value="">—</option><option>BLANCO</option><option>AMARILLO</option></select>
                </Campo>
                <Campo etiqueta="N.º de líneas"><input className={inputCls} inputMode="numeric" value={f.numLineas} onChange={(e) => cambiar('numLineas', e.target.value.replace(/\D/g, '').slice(0, 2), true)} /></Campo>
                <Campo etiqueta="Tipo de línea">
                  <select className={inputCls} value={f.tipoLinea} onChange={(e) => cambiar('tipoLinea', e.target.value, true)}><option value="">—</option><option>CONTINUA</option><option>SEGMENTADA</option></select>
                </Campo>
              </div>
              <p className="text-[11px] text-gray-400">Con abscisas, N.º de líneas y tipo, la cantidad se calcula sola (segmentada = longitud / 4), igual que en el anexo.</p>
            </div>
          )}
        </div>

        {ctrs.length > 0 && (
          <Campo etiqueta="Ejecutado por" ayuda="Si lo ejecutó un contratista, el avance entra en su planilla.">
            <select className={inputCls} value={f.ctr} onChange={(e) => cambiar('ctr', e.target.value)}>
              <option value="">ST INNOVA (personal propio)</option>
              {ctrs.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
        )}
        <Campo etiqueta="Observación (opcional)"><textarea className={inputCls} rows={2} maxLength={1000} value={f.nota} onChange={(e) => cambiar('nota', e.target.value)} /></Campo>

        <div className="space-y-2">
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-400 text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer">
            <BsCamera /> Fotos o PDF de respaldo (máx. 6)
            <input type="file" multiple accept="image/*,application/pdf" className="hidden"
              onChange={(e) => { setFotos([...fotos, ...Array.from(e.target.files ?? [])].slice(0, 6)); e.target.value = ''; }} />
          </label>
          {fotos.map((x, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
              <span className="truncate">{x.name}</span>
              <button type="button" className="text-gray-400 hover:text-red-600" onClick={() => setFotos(fotos.filter((_, j) => j !== i))}><BsX /></button>
            </div>
          ))}
        </div>
        {error && <Aviso tipo="error">{error}</Aviso>}
      </form>
    </Modal>
  );
};

const ModalAnular: React.FC<{ obraId: string; avance: Avance | null; onCerrar: () => void; onHecho: () => void }> = ({ obraId, avance, onCerrar, onHecho }) => {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    setMotivo('');
    setError('');
  }, [avance]);
  if (!avance) return null;
  const guardar = async () => {
    if (motivo.trim().length < 5) return setError('Indica el motivo (mínimo 5 caracteres)');
    setOcupado(true);
    try {
      await avancesAPI.anular(obraId, avance.id, motivo.trim());
      onHecho();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };
  return (
    <Modal abierto titulo="Anular avance" subtitulo={`${fmtN(avance.cantidad)} ${avance.unidad} · ${avance.rubroDescripcion} · ${fmtFechaCorta(avance.fecha)}`} onCerrar={onCerrar} ancho="md"
      pie={<><button className={btnSecundario} onClick={onCerrar}>Cancelar</button><button className="whitespace-nowrap px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50" onClick={guardar} disabled={ocupado}>Anular</button></>}>
      <div className="space-y-3">
        <Aviso>El avance no se borra: queda en el historial como anulado, con tu nombre y el motivo, y deja de sumar al rubro.</Aviso>
        <Campo etiqueta="Motivo"><textarea className={inputCls} rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Cantidad mal digitada" autoFocus /></Campo>
        {error && <Aviso tipo="error">{error}</Aviso>}
      </div>
    </Modal>
  );
};
