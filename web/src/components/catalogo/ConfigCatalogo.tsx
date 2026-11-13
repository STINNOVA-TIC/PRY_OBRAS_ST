import React, { useCallback, useEffect, useState } from 'react';
import { BsPencil, BsPlusLg } from 'react-icons/bs';
import { catalogoAPI, configAPI } from '../../api';
import { mensajeError } from '../../api/client';
import type { MaterialCat, Parametro, Rendimiento } from '../../types';
import { Aviso, Campo, Cargando, Modal, btnPrimario, btnSecundario, inputCls } from '../common/Modal';
import { fmtN, leerNumero } from '../ejecucion/comunes';

// ------------------------------------------------------------------ Parámetros
export const Parametros: React.FC<{ avisar: (m: string) => void }> = ({ avisar }) => {
  const [lista, setLista] = useState<Parametro[] | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const aplicar = (l: Parametro[]) => {
    setLista(l);
    setValores(Object.fromEntries(l.map((p) => [p.clave, p.valor])));
  };
  useEffect(() => {
    configAPI.parametros().then(aplicar).catch((e) => setError(mensajeError(e)));
  }, []);
  if (!lista) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando texto="Cargando parámetros..." />;
  const cambiados = lista.filter((p) => (valores[p.clave] ?? '') !== p.valor);

  const guardar = async () => {
    setGuardando(true);
    setError('');
    try {
      aplicar(await configAPI.guardarParametros(cambiados.map((p) => ({ clave: p.clave, valor: valores[p.clave] }))));
      avisar('Parámetros guardados');
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const grupos: [string, string[]][] = [
    ['Tolerancias de consumo', ['UMBRAL_ALERTA_PCT', 'UMBRAL_CRITICO_PCT']],
    ['Planillas e impresos', ['IVA_PCT', 'EMPRESA_NOMBRE', 'PLANILLA_APODERADO']],
    ['Enlaces de carga externos', ['ACCESO_MAX_INTENTOS']],
  ];
  return (
    <div className="space-y-4 max-w-3xl">
      {grupos.map(([titulo, claves]) => (
        <section key={titulo} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-gray-800">{titulo}</h3>
          {titulo.startsWith('Tolerancias') && (
            <p className="text-[11px] text-gray-500">
              Diferencia entre el consumo real de bodega y el programado (avances × insumos). Hasta el primer valor está «dentro de lo programado»;
              hasta el segundo, en alerta; por encima, fuera de rango.
            </p>
          )}
          <div className="grid md:grid-cols-2 gap-3">
            {claves.map((k) => {
              const p = lista.find((x) => x.clave === k);
              if (!p) return null;
              return (
                <Campo key={k} etiqueta={p.etiqueta}>
                  <input className={inputCls} inputMode={p.tipo === 'texto' ? 'text' : 'decimal'} maxLength={200} value={valores[k] ?? ''}
                    onChange={(e) => setValores({ ...valores, [k]: e.target.value })} />
                </Campo>
              );
            })}
          </div>
        </section>
      ))}
      <p className="text-[11px] text-gray-500">El IVA se aplica a las planillas que se creen desde ahora; las existentes conservan el suyo.</p>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="flex gap-2">
        <button className={btnPrimario} disabled={!cambiados.length || guardando} onClick={guardar}>{guardando ? 'Guardando...' : 'Guardar parámetros'}</button>
        {cambiados.length > 0 && <button className={btnSecundario} onClick={() => aplicar(lista)}>Descartar</button>}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ Rendimientos
const CLASE_TXT = { TERMO: 'Línea de termoplástico (m eq. 15 cm)', TACHAS: 'Tachas instaladas' } as const;

export const Rendimientos: React.FC<{ avisar: (m: string) => void }> = ({ avisar }) => {
  const [lista, setLista] = useState<Rendimiento[] | null>(null);
  const [mats, setMats] = useState<MaterialCat[]>([]);
  const [editar, setEditar] = useState<Rendimiento | 'nuevo' | null>(null);
  const [error, setError] = useState('');
  const cargar = useCallback(() => configAPI.rendimientos().then(setLista).catch((e) => setError(mensajeError(e))), []);
  useEffect(() => {
    cargar();
    catalogoAPI.materiales().then(setMats).catch(() => undefined);
  }, [cargar]);
  if (!lista) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando texto="Cargando rendimientos..." />;
  const nombres = (ids: number[]) => ids.map((i) => mats.find((m) => m.id === i)?.nombre ?? `#${i}`).join(' + ');
  const rango = (r: Rendimiento) =>
    [['mín', r.minimo], ['bueno', r.bueno], ['ideal', r.ideal], ['máx', r.maximo]].filter(([, v]) => v != null).map(([k, v]) => `${k} ${fmtN(v as number)}`).join(' · ');
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end gap-3">
        <p className="text-xs text-gray-500 max-w-2xl">
          Cruzan lo producido en los avances con lo consumido en bodega. <b>Rendimiento</b>: producción ÷ (consumo ÷ factor), p. ej. metros de línea por tonelada.
          <b> Dosis</b>: (consumo ÷ factor) ÷ (consumo base ÷ factor base), p. ej. kg de microesferas por tonelada de termoplástico.
        </p>
        <button className={btnPrimario} onClick={() => setEditar('nuevo')}><BsPlusLg className="inline mr-1.5" />Nuevo rendimiento</button>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-gray-400 uppercase text-[10px] tracking-wider font-bold bg-gray-50/50 border-b border-gray-100">
            <tr><th className="px-4 py-2.5">Rendimiento</th><th className="px-3 py-2.5">Mide</th><th className="px-3 py-2.5">Materiales</th><th className="px-3 py-2.5">Rango</th><th className="px-3 py-2.5">Estado</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lista.map((r) => (
              <tr key={r.id} className={r.activo ? '' : 'opacity-50'}>
                <td className="px-4 py-2.5"><div className="font-semibold text-gray-800">{r.nombre}</div><div className="text-[11px] text-gray-400">{r.codigo}</div></td>
                <td className="px-3 py-2.5 text-gray-600">
                  {r.tipo === 'REND' ? `${r.clase ? CLASE_TXT[r.clase] : ''} por ${r.unidad}` : `${r.unidad} por ${r.unidadBase}`}
                </td>
                <td className="px-3 py-2.5 text-gray-600">{nombres(r.materiales)}{r.tipo === 'DOSIS' && <div className="text-[11px] text-gray-400">base: {nombres(r.base)}</div>}</td>
                <td className="px-3 py-2.5 text-gray-600">{rango(r) || '—'}</td>
                <td className="px-3 py-2.5">{r.activo ? <span className="text-emerald-700 font-semibold">Activo</span> : <span className="text-gray-400">Inactivo</span>}</td>
                <td className="px-3 py-2.5 text-right"><button className="p-1.5 text-gray-500 hover:text-gray-900" onClick={() => setEditar(r)} title="Editar"><BsPencil /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ModalRendimiento r={editar} mats={mats} onCerrar={() => setEditar(null)} onGuardado={(m) => { setEditar(null); avisar(m); cargar(); }} />
    </div>
  );
};

const ModalRendimiento: React.FC<{ r: Rendimiento | 'nuevo' | null; mats: MaterialCat[]; onCerrar: () => void; onGuardado: (m: string) => void }> = ({ r, mats, onCerrar, onGuardado }) => {
  const vacio = { codigo: '', nombre: '', tipo: 'REND' as 'REND' | 'DOSIS', clase: 'TERMO' as 'TERMO' | 'TACHAS', unidad: '', factor: '1', unidadBase: '', factorBase: '', minimo: '', bueno: '', ideal: '', maximo: '', activo: true, materiales: [] as number[], base: [] as number[] };
  const [f, setF] = useState(vacio);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (!r) return;
    setError('');
    const s = (n: number | null) => (n == null ? '' : String(n));
    setF(r === 'nuevo' ? vacio : {
      codigo: r.codigo, nombre: r.nombre, tipo: r.tipo, clase: r.clase ?? 'TERMO', unidad: r.unidad, factor: s(r.factor), unidadBase: r.unidadBase ?? '',
      factorBase: s(r.factorBase), minimo: s(r.minimo), bueno: s(r.bueno), ideal: s(r.ideal), maximo: s(r.maximo), activo: r.activo, materiales: r.materiales, base: r.base,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r]);
  if (!r) return null;
  const nuevo = r === 'nuevo';
  const dosis = f.tipo === 'DOSIS';
  const toggle = (k: 'materiales' | 'base', id: number) => setF({ ...f, [k]: f[k].includes(id) ? f[k].filter((x) => x !== id) : [...f[k], id] });
  const num = (v: string) => (v.trim() === '' ? null : leerNumero(v));

  const guardar = async () => {
    setError('');
    const factor = num(f.factor);
    const vals = [num(f.minimo), num(f.bueno), num(f.ideal), num(f.maximo)];
    if (!factor || factor <= 0) return setError('El factor debe ser mayor que cero');
    if ([f.minimo, f.bueno, f.ideal, f.maximo].some((v, i) => v.trim() !== '' && vals[i] == null)) return setError('Hay valores del rango que no son números');
    const d = {
      codigo: f.codigo.trim(), nombre: f.nombre.trim(), tipo: f.tipo, clase: dosis ? null : f.clase, unidad: f.unidad.trim(), factor,
      unidadBase: dosis ? f.unidadBase.trim() : null, factorBase: dosis ? num(f.factorBase) : null,
      minimo: vals[0], bueno: vals[1], ideal: vals[2], maximo: vals[3], activo: f.activo, materiales: f.materiales, base: dosis ? f.base : [],
    };
    setOcupado(true);
    try {
      if (nuevo) await configAPI.crearRendimiento(d);
      else await configAPI.actualizarRendimiento(r.id, d);
      onGuardado(nuevo ? 'Rendimiento creado' : 'Rendimiento actualizado');
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const ListaMats: React.FC<{ k: 'materiales' | 'base' }> = ({ k }) => (
    <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
      {mats.filter((m) => m.activo || f[k].includes(m.id)).map((m) => (
        <label key={m.id} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50">
          <input type="checkbox" checked={f[k].includes(m.id)} onChange={() => toggle(k, m.id)} />
          <span className="text-gray-400 w-14">{m.codigo}</span><span className="text-gray-800">{m.nombre}</span><span className="text-gray-400 ml-auto">{m.unidad}</span>
        </label>
      ))}
    </div>
  );

  return (
    <Modal abierto titulo={nuevo ? 'Nuevo rendimiento' : 'Editar rendimiento'} onCerrar={onCerrar} ancho="xl"
      pie={<><button className={btnSecundario} onClick={onCerrar}>Cancelar</button><button className={btnPrimario} onClick={guardar} disabled={ocupado}>{ocupado ? 'Guardando...' : 'Guardar'}</button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Campo etiqueta="Código"><input className={inputCls} maxLength={20} value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} placeholder="r_termo" /></Campo>
          <div className="col-span-2"><Campo etiqueta="Nombre"><input className={inputCls} maxLength={150} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Campo></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Tipo">
            <select className={inputCls} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as 'REND' | 'DOSIS' })}>
              <option value="REND">Rendimiento (producción por consumo)</option>
              <option value="DOSIS">Dosis (consumo por consumo base)</option>
            </select>
          </Campo>
          {!dosis && (
            <Campo etiqueta="Producción que mide">
              <select className={inputCls} value={f.clase} onChange={(e) => setF({ ...f, clase: e.target.value as 'TERMO' | 'TACHAS' })}>
                <option value="TERMO">{CLASE_TXT.TERMO}</option><option value="TACHAS">{CLASE_TXT.TACHAS}</option>
              </select>
            </Campo>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Unidad del consumo" ayuda="En qué se expresa: t, caneca de 5 gal, caja de 20 kg..."><input className={inputCls} maxLength={40} value={f.unidad} onChange={(e) => setF({ ...f, unidad: e.target.value })} /></Campo>
          <Campo etiqueta="Factor" ayuda="Unidades de bodega por cada unidad de consumo (kg por t = 1000)"><input className={inputCls} inputMode="decimal" value={f.factor} onChange={(e) => setF({ ...f, factor: e.target.value })} /></Campo>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Materiales que se consumen</p>
          <ListaMats k="materiales" />
        </div>
        {dosis && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Unidad base"><input className={inputCls} maxLength={40} value={f.unidadBase} onChange={(e) => setF({ ...f, unidadBase: e.target.value })} placeholder="t de termo" /></Campo>
              <Campo etiqueta="Factor base"><input className={inputCls} inputMode="decimal" value={f.factorBase} onChange={(e) => setF({ ...f, factorBase: e.target.value })} /></Campo>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Materiales base</p>
              <ListaMats k="base" />
            </div>
          </>
        )}
        <div className="grid grid-cols-4 gap-3">
          {(['minimo', 'bueno', 'ideal', 'maximo'] as const).map((k) => (
            <Campo key={k} etiqueta={{ minimo: 'Mínimo', bueno: 'Bueno', ideal: 'Ideal', maximo: 'Máximo' }[k]}>
              <input className={inputCls} inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </Campo>
          ))}
        </div>
        <p className="text-[11px] text-gray-500">Fuera del mínimo o del máximo se marca «fuera de rango». Con «bueno»: desde el ideal es ideal, desde bueno es bueno y debajo, aceptable. Deja vacío lo que no aplique.</p>
        {!nuevo && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Activo (se calcula en los reportes)</label>}
        {error && <Aviso tipo="error">{error}</Aviso>}
      </div>
    </Modal>
  );
};
