import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BsDownload, BsPencil, BsPlusLg, BsUpload, BsX } from 'react-icons/bs';
import { catalogoAPI, descargar } from '../../api';
import { mensajeError } from '../../api/client';
import type { DocumentoHab, FilaMaterialExcel, FilaRubroExcel, MaterialCat, RubroCat } from '../../types';
import { fmtUSD } from '../common/EstadoChip';
import { ModalImportarExcel } from '../common/ImportarExcel';
import { Aviso, Campo, Cargando, Modal, btnPrimario, btnSecundario, inputCls } from '../common/Modal';
import { fmtN, leerNumero } from '../ejecucion/comunes';
import { Parametros, Rendimientos } from './ConfigCatalogo';

type Tab = 'documentos' | 'rubros' | 'materiales' | 'rendimientos' | 'parametros';

/** Configuración de catálogos: documentos habilitantes de contratistas, rubros de referencia y materiales. */
export const PaginaCatalogo: React.FC = () => {
  const [tab, setTab] = useState<Tab>('documentos');
  const [aviso, setAviso] = useState('');
  const avisar = (m: string) => {
    setAviso(m);
    setTimeout(() => setAviso(''), 7000);
  };
  return (
    <div className="font-sans space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Catálogo</h1>
        <p className="text-xs text-gray-500 mt-1">Documentos que se exigen a los contratistas, rubros de referencia (precios e insumos), materiales de bodega, rendimientos y parámetros.</p>
      </div>
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit max-w-full overflow-x-auto">
        {([['documentos', 'Documentos habilitantes'], ['rubros', 'Rubros'], ['materiales', 'Materiales'], ['rendimientos', 'Rendimientos'], ['parametros', 'Parámetros']] as [Tab, string][]).map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${tab === k ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}>{t}</button>
        ))}
      </div>
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
      {tab === 'documentos' && <Documentos avisar={avisar} />}
      {tab === 'rubros' && <RubrosCatalogo avisar={avisar} />}
      {tab === 'materiales' && <Materiales avisar={avisar} />}
      {tab === 'rendimientos' && <Rendimientos avisar={avisar} />}
      {tab === 'parametros' && <Parametros avisar={avisar} />}
    </div>
  );
};

const Chip: React.FC<{ si: boolean; texto: [string, string] }> = ({ si, texto }) => (
  <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border ${si ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-gray-500 bg-gray-50 border-gray-200'}`}>{si ? texto[0] : texto[1]}</span>
);

// ------------------------------------------------------------------ Documentos habilitantes
const Documentos: React.FC<{ avisar: (m: string) => void }> = ({ avisar }) => {
  const [lista, setLista] = useState<DocumentoHab[] | null>(null);
  const [editar, setEditar] = useState<DocumentoHab | 'nuevo' | null>(null);
  const [error, setError] = useState('');
  const cargar = useCallback(() => catalogoAPI.documentos().then(setLista).catch((e) => setError(mensajeError(e))), []);
  useEffect(() => { cargar(); }, [cargar]);
  if (!lista) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando />;
  return (
    <section className="space-y-3">
      <div className="flex justify-between items-end gap-3">
        <p className="text-[11px] text-gray-500 max-w-2xl">Documentos que cada contratista debe tener aprobados por SIG para habilitar una obra. Si agregas, desactivas o cambias el vencimiento de uno, las habilitaciones en curso deben volver a firmarse.</p>
        <button className={btnPrimario} onClick={() => setEditar('nuevo')}><BsPlusLg className="inline mr-1.5" />Nuevo documento</button>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-gray-400 uppercase text-[10px] tracking-wider font-bold bg-gray-50/50 border-b border-gray-100">
            <tr><th className="px-5 py-2.5">Documento</th><th className="px-3 py-2.5">Código</th><th className="px-3 py-2.5">Vencimiento</th><th className="px-3 py-2.5 text-center">Cargados</th><th className="px-3 py-2.5">Estado</th><th className="px-5 py-2.5" /></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lista.map((d) => (
              <tr key={d.id} className={d.activo ? '' : 'opacity-60'}>
                <td className="px-5 py-2.5 font-semibold text-gray-800">{d.nombre}</td>
                <td className="px-3 py-2.5 font-mono text-gray-500">{d.codigo}</td>
                <td className="px-3 py-2.5">{d.vence ? 'Exige fecha' : <span className="text-gray-400">No aplica</span>}</td>
                <td className="px-3 py-2.5 text-center">{d.usos}</td>
                <td className="px-3 py-2.5"><Chip si={d.activo} texto={['Se exige', 'Inactivo']} /></td>
                <td className="px-5 py-2.5 text-right"><button className="p-1.5 rounded-lg text-gray-400 hover:text-gray-800 hover:bg-gray-100" title="Editar" onClick={() => setEditar(d)}><BsPencil /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ModalDocumento d={editar} onCerrar={() => setEditar(null)} onHecho={(m) => { setEditar(null); avisar(m); cargar(); }} />
    </section>
  );
};

const ModalDocumento: React.FC<{ d: DocumentoHab | 'nuevo' | null; onCerrar: () => void; onHecho: (m: string) => void }> = ({ d, onCerrar, onHecho }) => {
  const [f, setF] = useState({ nombre: '', vence: false, activo: true });
  const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    setF(d && d !== 'nuevo' ? { nombre: d.nombre, vence: d.vence, activo: d.activo } : { nombre: '', vence: false, activo: true });
  }, [d]);
  if (!d) return null;
  const nuevo = d === 'nuevo';
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.nombre.trim().length < 3) return setError('Escribe el nombre del documento');
    try {
      const r = nuevo
        ? await catalogoAPI.crearDocumento({ nombre: f.nombre.trim(), vence: f.vence })
        : await catalogoAPI.actualizarDocumento(d.id, { nombre: f.nombre.trim(), vence: f.vence, activo: f.activo });
      onHecho(`${nuevo ? 'Documento creado' : 'Documento actualizado'}${r.firmasReiniciadas ? `. Se reiniciaron las firmas de ${r.firmasReiniciadas} habilitación(es) en curso.` : '.'}`);
    } catch (err) {
      setError(mensajeError(err));
    }
  };
  return (
    <Modal abierto titulo={nuevo ? 'Nuevo documento habilitante' : 'Editar documento habilitante'} subtitulo={nuevo ? undefined : d.codigo} onCerrar={onCerrar} ancho="md"
      pie={<><button className={btnSecundario} onClick={onCerrar}>Cancelar</button><button className={btnPrimario} type="submit" form="form-doc">Guardar</button></>}>
      <form id="form-doc" onSubmit={guardar} className="space-y-4">
        <Campo etiqueta="Nombre"><input className={inputCls} value={f.nombre} maxLength={150} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej. Póliza de responsabilidad civil" autoFocus /></Campo>
        <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer"><input type="checkbox" className="mt-0.5" checked={f.vence} onChange={(e) => setF({ ...f, vence: e.target.checked })} /><span>Exige fecha de vencimiento (certificados mensuales, pólizas…). Vencido deja de contar como vigente.</span></label>
        {!nuevo && <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer"><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} />Se exige a los contratistas (desmarca para dejar de pedirlo)</label>}
        {(nuevo || f.vence !== d.vence || f.activo !== d.activo) && <Aviso tipo="alerta">Este cambio modifica lo que se exige: las obras que están en habilitación tendrán que volver a firmarse.</Aviso>}
        {error && <Aviso tipo="error">{error}</Aviso>}
      </form>
    </Modal>
  );
};

// ------------------------------------------------------------------ Materiales
const Materiales: React.FC<{ avisar: (m: string) => void }> = ({ avisar }) => {
  const [lista, setLista] = useState<MaterialCat[] | null>(null);
  const [q, setQ] = useState('');
  const [editar, setEditar] = useState<MaterialCat | 'nuevo' | null>(null);
  const [importar, setImportar] = useState(false);
  const [error, setError] = useState('');
  const cargar = useCallback(() => catalogoAPI.materiales().then(setLista).catch((e) => setError(mensajeError(e))), []);
  useEffect(() => { cargar(); }, [cargar]);
  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (lista ?? []).filter((m) => !t || m.codigo.toLowerCase().includes(t) || m.nombre.toLowerCase().includes(t));
  }, [lista, q]);
  if (!lista) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando />;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <input className={`${inputCls} max-w-sm`} placeholder="Buscar por código o nombre..." value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <button className={btnSecundario} onClick={() => descargar('/catalogo/materiales/exportar', 'materiales.xlsx').catch((e) => setError(mensajeError(e)))}><BsDownload className="inline mr-1.5" />Exportar Excel</button>
          <button className={btnSecundario} onClick={() => setImportar(true)}><BsUpload className="inline mr-1.5" />Importar Excel</button>
          <button className={btnPrimario} onClick={() => setEditar('nuevo')}><BsPlusLg className="inline mr-1.5" />Nuevo material</button>
        </div>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-gray-400 uppercase text-[10px] tracking-wider font-bold bg-gray-50/50 border-b border-gray-100">
            <tr><th className="px-5 py-2.5">Código</th><th className="px-3 py-2.5">Material</th><th className="px-3 py-2.5">Unidad</th><th className="px-3 py-2.5 text-right">Costo unit.</th><th className="px-3 py-2.5 text-right">Mín. central</th><th className="px-3 py-2.5 text-right">Stock total</th><th className="px-3 py-2.5">Estado</th><th className="px-5 py-2.5" /></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtrados.map((m) => (
              <tr key={m.id} className={m.activo ? '' : 'opacity-60'}>
                <td className="px-5 py-2.5 font-mono text-gray-600">{m.codigo}</td>
                <td className="px-3 py-2.5 font-semibold text-gray-800">{m.nombre}</td>
                <td className="px-3 py-2.5">{m.unidad}</td>
                <td className="px-3 py-2.5 text-right">{fmtUSD(m.costoUnitario)}</td>
                <td className="px-3 py-2.5 text-right">{m.stockMinimo ? fmtN(m.stockMinimo) : '—'}</td>
                <td className="px-3 py-2.5 text-right">{fmtN(m.stockTotal)}</td>
                <td className="px-3 py-2.5"><Chip si={m.activo} texto={['Activo', 'Inactivo']} /></td>
                <td className="px-5 py-2.5 text-right"><button className="p-1.5 rounded-lg text-gray-400 hover:text-gray-800 hover:bg-gray-100" title="Editar" onClick={() => setEditar(m)}><BsPencil /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ModalMaterial m={editar} onCerrar={() => setEditar(null)} onHecho={(t) => { setEditar(null); avisar(t); cargar(); }} />
      <ModalImportarExcel<FilaMaterialExcel>
        abierto={importar}
        titulo="Importar materiales desde Excel"
        columnasEsperadas={<>Columnas: <b>CODIGO</b>, <b>DESCRIPCIÓN</b> (o NOMBRE), <b>UNIDAD</b>; opcionales <b>COSTO UNITARIO</b> y <b>STOCK MINIMO</b>. Los códigos existentes se actualizan y los nuevos se crean. No registra stock (para eso usa «Importar ingreso» en Bodega).</>}
        leer={catalogoAPI.leerMateriales}
        columnas={[
          { titulo: 'Código', valor: (f) => <span className="font-mono">{f.codigo}</span> },
          { titulo: 'Nombre', valor: (f) => f.nombre },
          { titulo: 'Unidad', valor: (f) => f.unidad },
          { titulo: 'Costo', valor: (f) => (f.costoUnitario != null ? fmtUSD(f.costoUnitario) : '—'), derecha: true },
          { titulo: '', valor: (f) => (lista.some((m) => m.codigo.toUpperCase() === f.codigo) ? <span className="text-gray-500">Actualiza</span> : <span className="text-blue-700 font-semibold">Nuevo</span>) },
        ]}
        confirmar={async (filas) => {
          const r = await catalogoAPI.importarMateriales(filas.map((f) => ({ codigo: f.codigo!, nombre: f.nombre!, unidad: f.unidad!, costoUnitario: f.costoUnitario, stockMinimo: f.stockMinimo })));
          return `Materiales importados: ${r.creados} nuevo(s), ${r.actualizados} actualizado(s).`;
        }}
        onCerrar={() => setImportar(false)}
        onHecho={(t) => { setImportar(false); avisar(t); cargar(); }}
      />
    </section>
  );
};

const ModalMaterial: React.FC<{ m: MaterialCat | 'nuevo' | null; onCerrar: () => void; onHecho: (m: string) => void }> = ({ m, onCerrar, onHecho }) => {
  const [f, setF] = useState({ codigo: '', nombre: '', unidad: '', costo: '', minimo: '', activo: true });
  const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    setF(m && m !== 'nuevo'
      ? { codigo: m.codigo, nombre: m.nombre, unidad: m.unidad, costo: String(m.costoUnitario), minimo: String(m.stockMinimo), activo: m.activo }
      : { codigo: '', nombre: '', unidad: '', costo: '', minimo: '', activo: true });
  }, [m]);
  if (!m) return null;
  const nuevo = m === 'nuevo';
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const costo = leerNumero(f.costo) ?? 0;
    const minimo = leerNumero(f.minimo) ?? 0;
    if (costo < 0 || minimo < 0) return setError('Costo y mínimo no pueden ser negativos');
    try {
      if (nuevo) await catalogoAPI.crearMaterial({ codigo: f.codigo.trim().toUpperCase(), nombre: f.nombre.trim(), unidad: f.unidad.trim(), costoUnitario: costo, stockMinimo: minimo });
      else await catalogoAPI.actualizarMaterial(m.id, { nombre: f.nombre.trim(), unidad: f.unidad.trim(), costoUnitario: costo, stockMinimo: minimo, activo: f.activo });
      onHecho(nuevo ? 'Material creado.' : 'Material actualizado.');
    } catch (err) {
      setError(mensajeError(err));
    }
  };
  return (
    <Modal abierto titulo={nuevo ? 'Nuevo material' : 'Editar material'} subtitulo={nuevo ? undefined : m.codigo} onCerrar={onCerrar} ancho="lg"
      pie={<><button className={btnSecundario} onClick={onCerrar}>Cancelar</button><button className={btnPrimario} type="submit" form="form-mat">Guardar</button></>}>
      <form id="form-mat" onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Campo etiqueta="Código"><input className={inputCls} value={f.codigo} disabled={!nuevo} maxLength={20} onChange={(e) => setF({ ...f, codigo: e.target.value.toUpperCase() })} placeholder="GRA-134" required /></Campo>
          <Campo etiqueta="Nombre" className="col-span-2"><input className={inputCls} value={f.nombre} maxLength={150} onChange={(e) => setF({ ...f, nombre: e.target.value })} required /></Campo>
          <Campo etiqueta="Unidad" ayuda={!nuevo && m.stockTotal ? 'Con movimientos no se puede cambiar' : undefined}><input className={inputCls} value={f.unidad} maxLength={20} onChange={(e) => setF({ ...f, unidad: e.target.value })} placeholder="kg, saco, u" required /></Campo>
          <Campo etiqueta="Costo unitario"><input className={inputCls} inputMode="decimal" value={f.costo} onChange={(e) => setF({ ...f, costo: e.target.value })} /></Campo>
          <Campo etiqueta="Stock mínimo (central)"><input className={inputCls} inputMode="decimal" value={f.minimo} onChange={(e) => setF({ ...f, minimo: e.target.value })} /></Campo>
        </div>
        {!nuevo && <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer"><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} />Activo (los inactivos no aparecen para nuevos movimientos ni insumos)</label>}
        {error && <Aviso tipo="error">{error}</Aviso>}
      </form>
    </Modal>
  );
};

// ------------------------------------------------------------------ Rubros del catálogo
const RubrosCatalogo: React.FC<{ avisar: (m: string) => void }> = ({ avisar }) => {
  const [lista, setLista] = useState<RubroCat[] | null>(null);
  const [mats, setMats] = useState<MaterialCat[]>([]);
  const [q, setQ] = useState('');
  const [editar, setEditar] = useState<RubroCat | 'nuevo' | null>(null);
  const [importar, setImportar] = useState(false);
  const [error, setError] = useState('');
  const cargar = useCallback(() => {
    catalogoAPI.rubros().then(setLista).catch((e) => setError(mensajeError(e)));
    catalogoAPI.materiales().then((l) => setMats(l.filter((m) => m.activo))).catch(() => undefined);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (lista ?? []).filter((r) => !t || (r.codigo ?? '').toLowerCase().includes(t) || r.descripcion.toLowerCase().includes(t));
  }, [lista, q]);
  if (!lista) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando />;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <input className={`${inputCls} max-w-sm`} placeholder="Buscar rubro..." value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <button className={btnSecundario} onClick={() => descargar('/catalogo/rubros/exportar', 'catalogo-rubros.xlsx').catch((e) => setError(mensajeError(e)))}><BsDownload className="inline mr-1.5" />Exportar Excel</button>
          <button className={btnSecundario} onClick={() => setImportar(true)}><BsUpload className="inline mr-1.5" />Importar Excel</button>
          <button className={btnPrimario} onClick={() => setEditar('nuevo')}><BsPlusLg className="inline mr-1.5" />Nuevo rubro</button>
        </div>
      </div>
      <p className="text-[11px] text-gray-500">Rubros de referencia para agregar a las obras con «Desde catálogo». Editarlos no cambia las obras que ya los usan.</p>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-gray-400 uppercase text-[10px] tracking-wider font-bold bg-gray-50/50 border-b border-gray-100">
            <tr><th className="px-5 py-2.5">Rubro</th><th className="px-3 py-2.5">Unidad</th><th className="px-3 py-2.5 text-right">P. ref.</th><th className="px-3 py-2.5">Insumos por unidad</th><th className="px-3 py-2.5 text-center">Obras</th><th className="px-3 py-2.5">Estado</th><th className="px-5 py-2.5" /></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtrados.map((r) => (
              <tr key={r.id} className={r.activo ? '' : 'opacity-60'}>
                <td className="px-5 py-2.5 max-w-md"><div className="text-[10px] font-mono text-gray-400">{r.codigo || 's/c'}</div><div className="font-semibold text-gray-800">{r.descripcion}</div></td>
                <td className="px-3 py-2.5">{r.unidad}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">{fmtUSD(r.puRef)}</td>
                <td className="px-3 py-2.5 text-[11px] text-gray-600">{r.insumos.length ? r.insumos.map((i) => `${i.nombre} ${fmtN(i.cantidadPorUnidad, 4)} ${i.unidad}`).join(' · ') : <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-2.5 text-center">{r.usos}</td>
                <td className="px-3 py-2.5"><Chip si={r.activo} texto={['Activo', 'Inactivo']} /></td>
                <td className="px-5 py-2.5 text-right"><button className="p-1.5 rounded-lg text-gray-400 hover:text-gray-800 hover:bg-gray-100" title="Editar" onClick={() => setEditar(r)}><BsPencil /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ModalRubroCat r={editar} mats={mats} onCerrar={() => setEditar(null)} onHecho={(t) => { setEditar(null); avisar(t); cargar(); }} />
      <ModalImportarExcel<FilaRubroExcel>
        abierto={importar}
        titulo="Importar rubros al catálogo"
        columnasEsperadas={<>Columnas: <b>DESCRIPCIÓN</b>, <b>UNIDAD</b> y <b>P. UNIT</b> (código y cantidad opcionales; la cantidad se ignora). Si el rubro ya existe (mismo código, o misma descripción y unidad) se actualiza su precio.</>}
        leer={catalogoAPI.leerRubros}
        columnas={[
          { titulo: 'Descripción', valor: (f) => <span>{f.codigo && <span className="font-mono text-[10px] text-gray-400 mr-1">{f.codigo}</span>}{f.descripcion}</span> },
          { titulo: 'Unidad', valor: (f) => f.unidad },
          { titulo: 'P. unit', valor: (f) => (f.precioUnitario != null ? fmtUSD(f.precioUnitario) : '—'), derecha: true },
        ]}
        confirmar={async (filas) => {
          const r = await catalogoAPI.importarRubros(filas.map((f) => ({ codigo: f.codigo, descripcion: f.descripcion!, unidad: f.unidad!, precioUnitario: f.precioUnitario })));
          return `Catálogo actualizado: ${r.creados} rubro(s) nuevo(s), ${r.actualizados} actualizado(s).`;
        }}
        onCerrar={() => setImportar(false)}
        onHecho={(t) => { setImportar(false); avisar(t); cargar(); }}
      />
    </section>
  );
};

const ModalRubroCat: React.FC<{ r: RubroCat | 'nuevo' | null; mats: MaterialCat[]; onCerrar: () => void; onHecho: (m: string) => void }> = ({ r, mats, onCerrar, onHecho }) => {
  const [f, setF] = useState({ codigo: '', descripcion: '', unidad: 'm', precio: '', clase: '', activo: true });
  const [ins, setIns] = useState<{ materialId: string; cantidad: string }[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    const x = r && r !== 'nuevo' ? r : null;
    setF({ codigo: x?.codigo ?? '', descripcion: x?.descripcion ?? '', unidad: x?.unidad ?? 'm', precio: x ? String(x.puRef) : '', clase: x?.clase ?? '', activo: x?.activo ?? true });
    setIns(x?.insumos.map((i) => ({ materialId: String(i.materialId), cantidad: String(i.cantidadPorUnidad) })) ?? []);
  }, [r]);
  if (!r) return null;
  const nuevo = r === 'nuevo';
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const insumos: { materialId: number; cantidadPorUnidad: number }[] = [];
    for (const i of ins) {
      if (!i.materialId && !i.cantidad) continue;
      const q = leerNumero(i.cantidad);
      if (!i.materialId || q == null || q <= 0) return setError('Cada insumo necesita material y cantidad mayor que 0');
      if (insumos.some((x) => x.materialId === Number(i.materialId))) return setError('Hay un material repetido');
      insumos.push({ materialId: Number(i.materialId), cantidadPorUnidad: q });
    }
    const datos = { codigo: f.codigo.trim() || null, descripcion: f.descripcion.trim(), unidad: f.unidad.trim(), puRef: leerNumero(f.precio) ?? 0, clase: f.clase || null, insumos };
    try {
      if (nuevo) await catalogoAPI.crearRubro(datos);
      else await catalogoAPI.actualizarRubro(r.id, { ...datos, activo: f.activo });
      onHecho(nuevo ? 'Rubro agregado al catálogo.' : 'Rubro del catálogo actualizado.');
    } catch (err) {
      setError(mensajeError(err));
    }
  };
  return (
    <Modal abierto titulo={nuevo ? 'Nuevo rubro del catálogo' : 'Rubro del catálogo'} onCerrar={onCerrar} ancho="xl"
      pie={<><button className={btnSecundario} onClick={onCerrar}>Cancelar</button><button className={btnPrimario} type="submit" form="form-rcat">Guardar</button></>}>
      <form id="form-rcat" onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Campo etiqueta="Código" className="col-span-2"><input className={inputCls} value={f.codigo} maxLength={30} onChange={(e) => setF({ ...f, codigo: e.target.value })} placeholder="Ej. 705-(1)" /></Campo>
          <Campo etiqueta="Unidad"><input className={inputCls} value={f.unidad} maxLength={20} onChange={(e) => setF({ ...f, unidad: e.target.value })} required /></Campo>
        </div>
        <Campo etiqueta="Descripción"><textarea className={inputCls} rows={2} maxLength={300} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} required /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Precio de referencia (USD)"><input className={inputCls} inputMode="decimal" value={f.precio} onChange={(e) => setF({ ...f, precio: e.target.value })} /></Campo>
          <Campo etiqueta="Clase (rendimiento)">
            <select className={inputCls} value={f.clase} onChange={(e) => setF({ ...f, clase: e.target.value })}>
              <option value="">Ninguna / automática</option><option value="TERMO">Línea de termoplástico</option><option value="TACHAS">Tachas instaladas</option>
            </select>
          </Campo>
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Insumos por unidad (APU)</p>
          {ins.map((i, k) => (
            <div key={k} className="flex gap-2">
              <select className={`${inputCls} flex-1`} value={i.materialId} onChange={(e) => setIns(ins.map((x, j) => (j === k ? { ...x, materialId: e.target.value } : x)))}>
                <option value="">Material...</option>
                {mats.map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.unidad})</option>)}
              </select>
              <input className={`${inputCls} w-28`} inputMode="decimal" placeholder="por unidad" value={i.cantidad} onChange={(e) => setIns(ins.map((x, j) => (j === k ? { ...x, cantidad: e.target.value } : x)))} />
              <button type="button" className="p-2 text-gray-400 hover:text-red-600" onClick={() => setIns(ins.filter((_, j) => j !== k))}><BsX /></button>
            </div>
          ))}
          <button type="button" className="text-xs font-semibold text-gray-600 hover:text-gray-900" onClick={() => setIns([...ins, { materialId: '', cantidad: '' }])}><BsPlusLg className="inline mr-1" />Agregar insumo</button>
        </div>
        {!nuevo && <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer"><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} />Activo (disponible en «Desde catálogo»)</label>}
        {error && <Aviso tipo="error">{error}</Aviso>}
      </form>
    </Modal>
  );
};
