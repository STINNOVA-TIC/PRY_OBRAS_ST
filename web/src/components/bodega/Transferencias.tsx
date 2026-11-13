import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BsArrowRight, BsCheck, BsPaperclip, BsPenFill, BsSearch, BsX, BsXOctagon } from 'react-icons/bs';
import { archivosAPI, authAPI, bodegasAPI, transferenciasAPI } from '../../api';
import { mensajeError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Bodega, Disponible, Transferencia } from '../../types';
import { FirmaImagen } from '../common/FirmaImagen';
import { FlujoFirmas, type NodoFirma } from '../common/FlujoFirmas';
import { Aviso, Campo, Cargando, Modal, btnPrimario, btnSecundario, inputCls } from '../common/Modal';
import { fmtN, leerNumero } from '../ejecucion/comunes';
import { LinkArchivo, fmtFechaHora, validarArchivo } from '../habilitacion/comunes';
import { ChipTransf } from './comunes';

// ------------------------------------------------------------------ Solicitar
/**
 * pedir: de otra bodega (por defecto la central) hacia esta obra.
 * devolver: de esta obra hacia la central (u otra obra).
 * enviar: desde la central hacia una obra.
 */
export const ModalSolicitar: React.FC<{
  modo: 'pedir' | 'devolver' | 'enviar' | null;
  bodega: Bodega;
  onCerrar: () => void;
  onHecho: (id: string) => void;
}> = ({ modo, bodega, onCerrar, onHecho }) => {
  const { user } = useAuth();
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [otra, setOtra] = useState('');
  const [disp, setDisp] = useState<Disponible[]>([]);
  const [items, setItems] = useState<{ materialId: string; cantidad: string }[]>([]);
  const [motivo, setMotivo] = useState('');
  const [busca, setBusca] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!modo) return;
    setError('');
    setMotivo('');
    setBusca('');
    setItems([]);
    bodegasAPI
      .listar()
      .then((l) => {
        const opciones = l.filter((b) => b.id !== bodega.id && (modo === 'enviar' ? b.tipo === 'OBRA' && b.obraEstado !== 'CERRADA' : true));
        setBodegas(opciones);
        setOtra(String((modo === 'enviar' ? opciones[0] : opciones.find((b) => b.tipo === 'CENTRAL') ?? opciones[0])?.id ?? ''));
      })
      .catch((e) => setError(mensajeError(e)));
  }, [modo, bodega.id]);

  const origenId = modo === 'pedir' ? Number(otra) : bodega.id;
  const destinoId = modo === 'pedir' ? bodega.id : Number(otra);

  useEffect(() => {
    if (!modo || !origenId) return;
    bodegasAPI.disponible(origenId).then(setDisp).catch(() => setDisp([]));
  }, [modo, origenId]);

  if (!modo) return null;
  const titulo = { pedir: 'Pedir material', devolver: 'Devolver material', enviar: 'Enviar material a una obra' }[modo];

  const guardar = async () => {
    const lista: { materialId: number; cantidad: number }[] = [];
    for (const i of items) {
      const q = leerNumero(i.cantidad);
      const nombre = disp.find((x) => String(x.materialId) === i.materialId)?.nombre ?? 'un material';
      if (q == null || q <= 0) return setError(`Indica una cantidad mayor que 0 para ${nombre}`);
      if (lista.some((x) => x.materialId === Number(i.materialId))) return setError('Hay un material repetido');
      lista.push({ materialId: Number(i.materialId), cantidad: q });
    }
    if (!lista.length) return setError('Agrega al menos un material');
    if (!otra) return setError('Elige la bodega');
    setOcupado(true);
    setError('');
    try {
      const t = await transferenciasAPI.solicitar({ bodegaOrigenId: origenId, bodegaDestinoId: destinoId, items: lista, motivo: motivo.trim() || null });
      onHecho(t.id);
    } catch (e) {
      setError(mensajeError(e, 'No se pudo solicitar'));
    } finally {
      setOcupado(false);
    }
  };

  const elegidos = new Set(items.map((i) => i.materialId));
  const q = busca.trim().toLowerCase();
  const filtrados = disp.filter((m) => !q || m.nombre.toLowerCase().includes(q) || m.codigo.toLowerCase().includes(q));
  const alternar = (id: string) =>
    setItems(elegidos.has(id) ? items.filter((x) => x.materialId !== id) : [...items, { materialId: id, cantidad: '' }]);

  return (
    <Modal abierto titulo={titulo} subtitulo={bodega.nombre} onCerrar={onCerrar} ancho="4xl"
      pie={user?.tieneFirma ? <><button className={btnSecundario} onClick={onCerrar}>Cancelar</button><button className={btnPrimario} onClick={guardar} disabled={ocupado}>{ocupado ? 'Enviando...' : `Firmar y solicitar${items.length ? ` (${items.length})` : ''}`}</button></> : <button className={btnSecundario} onClick={onCerrar}>Cerrar</button>}>
      <div className="space-y-4">
        {!user?.tieneFirma && <Aviso tipo="alerta">La solicitud se firma al enviarla. <Link to="/perfil" className="underline font-bold">Sube tu firma en «Mi perfil y firma»</Link> primero.</Aviso>}
        <Campo etiqueta={modo === 'pedir' ? 'Desde' : 'Hacia'}>
          <select className={inputCls} value={otra} onChange={(e) => { setOtra(e.target.value); if (modo === 'pedir') setItems([]); }}>
            {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}{b.tipo === 'CENTRAL' ? ' (central)' : ''}</option>)}
          </select>
        </Campo>
        <div className="grid md:grid-cols-2 gap-4">
          {/* Catálogo de la bodega de origen: lista amplia, con lo elegido marcado */}
          <div className="border border-gray-200 rounded-xl overflow-hidden flex flex-col">
            <div className="p-2 border-b border-gray-100 bg-gray-50/60">
              <div className="relative">
                <BsSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className={`${inputCls} pl-8`} placeholder="Buscar material por nombre o código..." value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
            </div>
            <ul className="h-[22rem] overflow-y-auto divide-y divide-gray-100" role="listbox" aria-multiselectable="true" aria-label="Materiales disponibles">
              {filtrados.map((m) => {
                const sel = elegidos.has(String(m.materialId));
                return (
                  <li key={m.materialId}>
                    <button type="button" role="option" aria-selected={sel} onClick={() => alternar(String(m.materialId))}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition ${sel ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${sel ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white'}`}>
                        {sel && <BsCheck className="text-base" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-xs ${sel ? 'font-bold text-blue-900' : 'font-semibold text-gray-800'}`}>{m.nombre}</span>
                        <span className="block text-[11px] text-gray-400">{m.codigo}</span>
                      </span>
                      <span className={`shrink-0 text-[11px] tabular-nums ${m.stock > 0 ? 'text-gray-600' : 'text-red-600'}`}>{fmtN(m.stock)} {m.unidad}</span>
                    </button>
                  </li>
                );
              })}
              {filtrados.length === 0 && <li className="px-3 py-8 text-center text-xs text-gray-400">Sin resultados.</li>}
            </ul>
            <p className="px-3 py-1.5 text-[10px] text-gray-400 border-t border-gray-100">Stock disponible en la bodega de origen. Toca un material para agregarlo o quitarlo.</p>
          </div>

          {/* Lo seleccionado, con su cantidad */}
          <div className="border border-gray-200 rounded-xl overflow-hidden flex flex-col">
            <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50/60 text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Seleccionados ({items.length})
            </div>
            <ul className="h-[22rem] overflow-y-auto divide-y divide-gray-100">
              {items.map((i) => {
                const d = disp.find((x) => String(x.materialId) === i.materialId);
                const cant = leerNumero(i.cantidad);
                return (
                  <li key={i.materialId} className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-gray-800">{d?.nombre ?? 'Material'}</span>
                        <span className="block text-[11px] text-gray-400">disp. {fmtN(d?.stock ?? 0)} {d?.unidad}</span>
                      </span>
                      <div className="w-28 shrink-0">
                        <input className={`${inputCls} text-right`} inputMode="decimal" placeholder="Cantidad" aria-label={`Cantidad de ${d?.nombre}`} value={i.cantidad}
                          onChange={(e) => setItems(items.map((x) => (x.materialId === i.materialId ? { ...x, cantidad: e.target.value } : x)))} />
                      </div>
                      <span className="w-8 shrink-0 text-[11px] text-gray-400">{d?.unidad}</span>
                      <button type="button" className="p-1.5 text-gray-400 hover:text-red-600" onClick={() => alternar(i.materialId)} title="Quitar"><BsX /></button>
                    </div>
                    {d && cant != null && cant > d.stock && <p className="mt-1 text-[11px] text-amber-700">Hoy solo hay {fmtN(d.stock)} {d.unidad}: se podrá despachar menos o rechazar por falta de stock.</p>}
                  </li>
                );
              })}
              {items.length === 0 && <li className="px-3 py-12 text-center text-xs text-gray-400">Elige materiales de la lista de la izquierda.</li>}
            </ul>
          </div>
        </div>
        <Campo etiqueta="Motivo (opcional)"><textarea className={inputCls} rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Inicio de línea continua del tramo 4" /></Campo>
        <p className="text-[11px] text-gray-400">Flujo: tú firmas la solicitud → la aprueba el Administrador de la obra → la bodega de origen despacha (o la rechaza por falta de stock) → en la obra se recibe. Cada paso queda firmado.</p>
        {error && <Aviso tipo="error">{error}</Aviso>}
      </div>
    </Modal>
  );
};

// ------------------------------------------------------------------ Detalle
export const DetalleTransferencia: React.FC<{ id: string; onCambio?: () => void }> = ({ id, onCambio }) => {
  const { user } = useAuth();
  const [t, setT] = useState<Transferencia | null>(null);
  const [error, setError] = useState('');
  const [accion, setAccion] = useState<Accion | null>(null);

  const cargar = useCallback(() => transferenciasAPI.obtener(id).then(setT).catch((e) => setError(mensajeError(e))), [id]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  if (!t) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando />;

  const pendiente = (rol: string) => {
    const f = t.firmas.find((x) => x.rol === rol)!;
    if (f.firmado || f.designadoNombre) return f.designadoNombre;
    const b = rol === 'DESPACHADO' ? t.origen : t.destino;
    return b.tipo === 'CENTRAL'
      ? 'Bodeguero de la central (o Administrador)'
      : rol === 'RECIBIDO'
        ? `Residente, bodeguero o administración de ${b.obraNombre}`
        : `Bodeguero o administración de ${b.obraNombre}`;
  };
  const turno: Record<string, string> = { SOLICITADA: 'APROBADO', APROBADA: 'DESPACHADO', DESPACHADA: 'RECIBIDO' };
  const nodos: NodoFirma[] = t.firmas.map((f) => ({
    rol: f.rol,
    etiqueta: f.etiqueta,
    designadoNombre: pendiente(f.rol),
    firmado: f.firmado,
    firmaArchivoId: f.firmaArchivoId,
    nombreFirmante: f.nombreFirmante,
    cargoFirmante: f.cargoFirmante,
    firmadoEn: f.firmadoEn,
    activo: turno[t.estado] === f.rol,
  }));
  const boton = (texto: string, a: typeof accion) => (
    <button className="whitespace-nowrap px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm" onClick={() => setAccion(a)}>
      <BsPenFill className="inline mr-1.5" />{texto}
    </button>
  );
  const acciones: Record<string, React.ReactNode> = {};
  if (t.puede.aprobar) acciones.APROBADO = boton('Aprobar', 'aprobar');
  if (t.puede.despachar) acciones.DESPACHADO = boton('Despachar', 'despachar');
  if (t.puede.recibir) acciones.RECIBIDO = boton('Recibir', 'recibir');

  const hecho = (n: Transferencia) => {
    setT(n);
    setAccion(null);
    onCambio?.();
  };

  return (
    <div className="space-y-5">
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-gray-800">Transferencia N.º {t.numero}</h2>
            <ChipTransf estado={t.estado} />
          </div>
          <p className="text-xs text-gray-600 mt-1 flex items-center gap-2 flex-wrap">
            <b>{t.origen.nombre}</b> <BsArrowRight /> <b>{t.destino.nombre}</b>
          </p>
          <p className="text-[11px] text-gray-400">Solicitó {t.creadoPorNombre} · {fmtFechaHora(t.creadoEn)}{t.documentoRef && ` · Guía ${t.documentoRef}`}</p>
          {t.motivo && <p className="text-xs text-gray-600 mt-1">{t.motivo}</p>}
        </div>
        {t.puede.anular && <button className="text-xs font-semibold text-red-600 hover:text-red-700" onClick={() => setAccion('anular')}>{t.puede.aprobar ? 'Rechazar' : 'Anular'}</button>}
      </div>
      {t.estado === 'ANULADA' && <Aviso tipo="alerta">Anulada por {t.anuladoPorNombre}: {t.motivoAnulacion}</Aviso>}
      {t.estado === 'RECHAZADA' && <Aviso tipo="error">Rechazada por falta de stock por {t.rechazadoPorNombre} · {fmtFechaHora(t.rechazadoEn)}: {t.motivoRechazo}</Aviso>}
      {t.notaRecepcion && <Aviso>Novedad en la recepción: {t.notaRecepcion}</Aviso>}
      {(t.puede.aprobar || t.puede.despachar || t.puede.recibir) && !user?.tieneFirma && (
        <Aviso tipo="alerta">Para firmar necesitas tu firma registrada. <Link to="/perfil" className="underline font-bold">Súbela en «Mi perfil y firma»</Link>.</Aviso>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-gray-400 uppercase text-[10px] tracking-wider font-bold bg-gray-50/50 border-b border-gray-100">
            <tr><th className="px-4 py-2.5">Material</th><th className="px-3 py-2.5 text-right">Solicitado</th><th className="px-3 py-2.5 text-right">Despachado</th><th className="px-3 py-2.5 text-right">Recibido</th>{t.estado === 'APROBADA' || t.estado === 'SOLICITADA' ? <th className="px-4 py-2.5 text-right">Stock en origen</th> : null}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {t.items.map((i) => (
              <tr key={i.materialId} className="align-top">
                <td className="px-4 py-2.5">
                  <div className="font-semibold text-gray-800">{i.nombre} <span className="font-normal text-gray-400">({i.unidad})</span></div>
                  {(i.notaDespacho || i.archivoDespachoId) && (
                    <div className="mt-1 text-[11px] text-gray-600">
                      <span className="font-bold text-gray-500">{t.estado === 'RECHAZADA' ? 'Bodega:' : 'Despacho:'}</span> {i.notaDespacho}
                      {i.archivoDespachoId && <span className="ml-1.5 inline-flex"><LinkArchivo id={i.archivoDespachoId} nombre={i.archivoDespachoNombre} onError={setError} /></span>}
                    </div>
                  )}
                  {(i.notaRecepcion || i.archivoRecepcionId) && (
                    <div className="mt-0.5 text-[11px] text-gray-600">
                      <span className="font-bold text-gray-500">Recepción:</span> {i.notaRecepcion}
                      {i.archivoRecepcionId && <span className="ml-1.5 inline-flex"><LinkArchivo id={i.archivoRecepcionId} nombre={i.archivoRecepcionNombre} onError={setError} /></span>}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">{fmtN(i.solicitada)}</td>
                <td className={`px-3 py-2.5 text-right ${i.despachada != null && i.despachada < i.solicitada ? 'text-amber-700 font-bold' : ''}`}>{i.despachada != null ? fmtN(i.despachada) : '—'}</td>
                <td className={`px-3 py-2.5 text-right ${i.recibida != null && i.despachada != null && i.recibida < i.despachada ? 'text-red-600 font-bold' : ''}`}>{i.recibida != null ? fmtN(i.recibida) : '—'}</td>
                {t.estado === 'APROBADA' || t.estado === 'SOLICITADA' ? <td className={`px-4 py-2.5 text-right ${i.stockOrigen < i.solicitada ? 'text-red-600 font-bold' : ''}`}>{fmtN(i.stockOrigen)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {t.puede.rechazar && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50/60 px-4 py-3">
          <p className="text-xs text-red-800">¿No hay stock suficiente para despachar? Puedes rechazar la solicitud indicando el motivo.</p>
          <button className="whitespace-nowrap px-3 py-1.5 rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50 text-xs font-bold" onClick={() => setAccion('rechazar')}>
            <BsXOctagon className="inline mr-1.5" />Rechazar por falta de stock
          </button>
        </div>
      )}
      <FlujoFirmas nodos={nodos} acciones={acciones} />

      <ModalAccion t={t} accion={accion} onCerrar={() => setAccion(null)} onHecho={hecho} />
    </div>
  );
};

type Accion = 'aprobar' | 'despachar' | 'rechazar' | 'recibir' | 'anular';
interface Fila { cumple: boolean; cant: string; nota: string; archivo: File | null }

/**
 * Confirmación de cada paso con vista previa de la firma (como en el POS).
 * Al despachar o recibir: un check por material si se cumple lo pedido (si no, se indica la cantidad),
 * y por cada material una observación y una foto o documento opcionales.
 * Rechazar: bodega no despacha por falta de stock (sin mover nada).
 */
const ModalAccion: React.FC<{ t: Transferencia; accion: Accion | null; onCerrar: () => void; onHecho: (t: Transferencia) => void }> = ({ t, accion, onCerrar, onHecho }) => {
  const { user, refrescarUsuario } = useAuth();
  const [filas, setFilas] = useState<Record<number, Fila>>({});
  const [texto, setTexto] = useState('');
  const [firmaId, setFirmaId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!accion) return;
    setError('');
    setTexto(accion === 'rechazar' ? 'Falta de stock en bodega' : '');
    setFilas(Object.fromEntries(t.items.map((i) => {
      const tope = accion === 'recibir' ? (i.despachada ?? 0) : i.solicitada;
      const alcanza = accion === 'recibir' || i.stockOrigen >= i.solicitada;
      return [i.materialId, { cumple: alcanza, cant: String(alcanza ? tope : Math.max(0, Math.min(i.solicitada, i.stockOrigen))), nota: '', archivo: null }];
    })));
    if (accion !== 'anular' && accion !== 'rechazar') authAPI.perfil().then((p) => setFirmaId(p.firmaArchivoId)).catch(() => undefined);
  }, [accion]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!accion) return null;
  const titulos: Record<Accion, string> = {
    aprobar: 'Aprobar transferencia',
    despachar: 'Despachar material',
    rechazar: 'Rechazar por falta de stock',
    recibir: 'Recibir material',
    anular: t.puede.aprobar ? 'Rechazar transferencia' : 'Anular transferencia',
  };
  const firma = accion === 'aprobar' || accion === 'despachar' || accion === 'recibir';
  const porMaterial = accion === 'despachar' || accion === 'recibir' || accion === 'rechazar';
  const conCantidad = accion === 'despachar' || accion === 'recibir';
  const tope = (i: Transferencia['items'][number]) => (accion === 'recibir' ? i.despachada ?? 0 : i.solicitada);
  const set = (id: number, cambio: Partial<Fila>) => setFilas({ ...filas, [id]: { ...filas[id], ...cambio } });

  const confirmar = async () => {
    setOcupado(true);
    setError('');
    try {
      // Valida antes de subir adjuntos
      const lineas = t.items.map((i) => {
        const f = filas[i.materialId];
        const cantidad = f.cumple ? tope(i) : leerNumero(f.cant);
        if (conCantidad && (cantidad == null || cantidad < 0 || cantidad > tope(i) + 1e-9)) throw new Error(`Cantidad no válida para ${i.nombre}`);
        return { i, f, cantidad: cantidad ?? 0 };
      });
      for (const { f, i } of lineas) {
        const err = f.archivo ? validarArchivo(f.archivo) : null;
        if (err) throw new Error(`${i.nombre}: ${err}`);
      }
      if (accion === 'recibir') {
        const faltan = lineas.filter((x) => x.cantidad < tope(x.i) - 1e-9);
        if (faltan.length && !texto.trim() && faltan.some((x) => !x.f.nota.trim()))
          throw new Error('Llegó menos de lo despachado: explica la novedad en la observación del material o en la nota general');
      }
      if ((accion === 'rechazar' || accion === 'anular') && texto.trim().length < 5) throw new Error('Indica el motivo (mínimo 5 caracteres)');
      const items = [];
      for (const { i, f, cantidad } of lineas) {
        const archivoId = f.archivo ? (await archivosAPI.subir(f.archivo, 'EVIDENCIA')).id : null;
        items.push({ materialId: i.materialId, cantidad, nota: f.nota.trim() || null, archivoId });
      }
      let n: Transferencia;
      if (accion === 'aprobar') n = await transferenciasAPI.aprobar(t.id);
      else if (accion === 'despachar') n = await transferenciasAPI.despachar(t.id, { items, documentoRef: texto.trim() || null });
      else if (accion === 'recibir') n = await transferenciasAPI.recibir(t.id, { items, nota: texto.trim() || null });
      else if (accion === 'rechazar')
        n = await transferenciasAPI.rechazar(t.id, { motivo: texto.trim(), items: items.filter((x) => x.nota || x.archivoId).map(({ materialId, nota, archivoId }) => ({ materialId, nota, archivoId })) });
      else n = await transferenciasAPI.anular(t.id, texto.trim());
      onHecho(n);
    } catch (e) {
      setError(e instanceof Error && !('isAxiosError' in e) ? e.message : mensajeError(e));
      refrescarUsuario();
    } finally {
      setOcupado(false);
    }
  };

  const rojo = accion === 'anular' || accion === 'rechazar';
  return (
    <Modal abierto titulo={titulos[accion]} subtitulo={`N.º ${t.numero} · ${t.origen.nombre} → ${t.destino.nombre}`} onCerrar={onCerrar} ancho={porMaterial ? '4xl' : 'lg'}
      pie={firma && !user?.tieneFirma ? <button className={btnSecundario} onClick={onCerrar}>Cerrar</button> : (
        <><button className={btnSecundario} onClick={onCerrar}>Cancelar</button>
          <button className={`whitespace-nowrap px-4 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-50 ${rojo ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`} onClick={confirmar} disabled={ocupado}>
            {ocupado ? 'Procesando...' : accion === 'rechazar' ? 'Rechazar solicitud' : accion === 'anular' ? titulos.anular.split(' ')[0] : 'Confirmar y firmar'}
          </button></>
      )}>
      <div className="space-y-4">
        {accion === 'rechazar' && (
          <Aviso tipo="alerta">No se despacha nada y la transferencia queda <b>rechazada por falta de stock</b>. Quien la pidió podrá hacer una nueva solicitud cuando haya material.</Aviso>
        )}
        {porMaterial && (
          <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
            <p className="px-4 py-2 text-[11px] text-gray-500 bg-gray-50/60">
              {accion === 'despachar' ? 'Marca «Cumple» si sale completo lo solicitado; si no, indica cuánto sale.' : accion === 'recibir' ? 'Marca «Cumple» si llegó completo lo despachado; si no, indica cuánto llegó.' : 'Puedes dejar una observación o una foto por material.'}
              {' '}La observación y el adjunto son opcionales.
            </p>
            {t.items.map((i) => {
              const f = filas[i.materialId];
              if (!f) return null;
              return (
                <div key={i.materialId} className="px-4 py-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-gray-800">{i.nombre}</div>
                      <div className="text-[11px] text-gray-500">
                        {accion === 'recibir' ? `Despachado ${fmtN(i.despachada)} ${i.unidad}` : `Solicitado ${fmtN(i.solicitada)} ${i.unidad} · en stock `}
                        {accion !== 'recibir' && <span className={i.stockOrigen < i.solicitada ? 'font-bold text-red-600' : ''}>{fmtN(i.stockOrigen)}</span>}
                      </div>
                    </div>
                    {conCantidad && (
                      <>
                        <label className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${f.cumple ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-gray-200 text-gray-600'}`}>
                          <input type="checkbox" checked={f.cumple} onChange={(e) => set(i.materialId, { cumple: e.target.checked, cant: e.target.checked ? String(tope(i)) : f.cant })} />
                          Cumple
                        </label>
                        <div className="flex items-center gap-1.5">
                          <div className="w-28 shrink-0">
                            <input className={`${inputCls} text-right ${f.cumple ? 'bg-gray-50 text-gray-500' : ''}`} inputMode="decimal" disabled={f.cumple} aria-label={`Cantidad de ${i.nombre}`}
                              value={f.cumple ? String(tope(i)) : f.cant} onChange={(e) => set(i.materialId, { cant: e.target.value })} />
                          </div>
                          <span className="w-8 text-[11px] text-gray-400">{i.unidad}</span>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input className={`${inputCls} flex-1 min-w-[200px]`} maxLength={500} placeholder="Observación (opcional)" value={f.nota} onChange={(e) => set(i.materialId, { nota: e.target.value })} />
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-2 text-[11px] font-semibold text-gray-600 hover:bg-gray-50">
                      <BsPaperclip />
                      <span className="max-w-[160px] truncate">{f.archivo ? f.archivo.name : 'Foto o documento'}</span>
                      <input type="file" className="hidden" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => set(i.materialId, { archivo: e.target.files?.[0] ?? null })} />
                    </label>
                    {f.archivo && <button type="button" className="p-1 text-gray-400 hover:text-red-600" onClick={() => set(i.materialId, { archivo: null })} title="Quitar adjunto"><BsX /></button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {accion === 'despachar' && <Campo etiqueta="N.º de guía de remisión (opcional)"><input className={inputCls} maxLength={60} value={texto} onChange={(e) => setTexto(e.target.value)} /></Campo>}
        {accion === 'recibir' && <Campo etiqueta="Nota general (opcional; obligatoria si llegó menos y no lo explicaste por material)"><textarea className={inputCls} rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej. 2 sacos rotos" /></Campo>}
        {(accion === 'anular' || accion === 'rechazar') && <Campo etiqueta="Motivo"><textarea className={inputCls} rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus /></Campo>}
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

export const ModalTransferencia: React.FC<{ id: string | null; onCerrar: () => void; onCambio: () => void }> = ({ id, onCerrar, onCambio }) =>
  id ? (
    <Modal abierto titulo="Transferencia" onCerrar={onCerrar} ancho="3xl" pie={<button className={btnSecundario} onClick={onCerrar}>Cerrar</button>}>
      <DetalleTransferencia id={id} onCambio={onCambio} />
    </Modal>
  ) : null;

/** Página /transferencias/:id (enlace desde la bandeja de firmas). */
export const PaginaTransferencia: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <button className="text-xs font-semibold text-gray-600 hover:text-gray-900" onClick={() => navigate(-1)}>‹ Volver</button>
      <div className="bg-white border border-gray-200 rounded-2xl p-5">{id && <DetalleTransferencia id={id} />}</div>
    </div>
  );
};

