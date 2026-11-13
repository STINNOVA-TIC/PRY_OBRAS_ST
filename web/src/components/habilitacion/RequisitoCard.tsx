import React, { useEffect, useState } from 'react';
import { BsCheck2Circle, BsPencil, BsXCircle } from 'react-icons/bs';
import { archivosAPI, habilitacionAPI } from '../../api';
import { mensajeError } from '../../api/client';
import type { Habilitacion, RequisitoHab } from '../../types';
import { fmtFecha, fmtUSD } from '../common/EstadoChip';
import { Aviso, Campo, btnPrimario, btnSecundario, inputCls } from '../common/Modal';
import { ChipEstado, ElegirArchivo, LinkArchivo, fmtFechaHora, validarArchivo } from './comunes';

/** Un requisito administrativo: carga (referencia, fecha, monto, adjunto, confirmación) y OK de revisión. */
export const RequisitoCard: React.FC<{
  obraId: string;
  r: RequisitoHab;
  puedeCargar: boolean;
  puedeRevisar: boolean;
  onCambio: (h: Habilitacion) => void;
}> = ({ obraId, r, puedeCargar, puedeRevisar, onCambio }) => {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ referencia: '', fecha: '', monto: '', confirmado: false });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!editando) return;
    setF({ referencia: r.referencia ?? '', fecha: r.fecha ?? '', monto: r.monto != null ? String(r.monto) : '', confirmado: r.confirmado });
    setArchivo(null);
    setError('');
  }, [editando, r]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const errArchivo = validarArchivo(archivo);
    if (errArchivo) return setError(errArchivo);
    if (!archivo && !r.archivoId) return setError(`Adjunta: ${r.etiquetaAdjunto}`);
    if (!f.confirmado) return setError('Marca la confirmación para continuar');
    setOcupado(true);
    setError('');
    try {
      const archivoId = archivo ? (await archivosAPI.subir(archivo)).id : undefined;
      onCambio(
        await habilitacionAPI.guardarRequisito(obraId, r.codigo, {
          referencia: f.referencia || null,
          fecha: f.fecha || null,
          ...(r.esMonto && { monto: f.monto ? Number(f.monto) : null }),
          ...(archivoId && { archivoId }),
          confirmado: f.confirmado,
        }),
      );
      setEditando(false);
    } catch (err) {
      setError(mensajeError(err, 'No se pudo guardar'));
    } finally {
      setOcupado(false);
    }
  };

  const revisar = async (ok: boolean) => {
    setOcupado(true);
    setError('');
    try {
      onCambio(await habilitacionAPI.revisarRequisito(obraId, r.codigo, ok));
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className={`rounded-2xl border p-4 bg-white space-y-3 ${r.estado === 'OK' ? 'border-emerald-200' : 'border-gray-200'}`}>
      <div className="flex justify-between items-start gap-2">
        <h3 className="text-xs font-bold text-gray-800">{r.nombre}</h3>
        <ChipEstado estado={r.estado} />
      </div>

      {!editando ? (
        <>
          {r.id ? (
            <dl className="text-xs space-y-1">
              <div className="flex gap-2"><dt className="text-gray-400 shrink-0">{r.etiquetaRef}:</dt><dd className="text-gray-800 font-semibold truncate">{r.esMonto && r.monto != null ? fmtUSD(r.monto) : r.referencia || '—'}</dd></div>
              {r.esMonto && r.referencia && <div className="flex gap-2"><dt className="text-gray-400">Referencia:</dt><dd className="text-gray-700 truncate">{r.referencia}</dd></div>}
              <div className="flex gap-2"><dt className="text-gray-400 shrink-0">{r.etiquetaFecha}:</dt><dd className="text-gray-700">{fmtFecha(r.fecha) || '—'}</dd></div>
              <div className="pt-1">{r.archivoId ? <LinkArchivo id={r.archivoId} nombre={r.archivoNombre} onError={setError} /> : <span className="text-orange-600 font-semibold">Sin adjunto</span>}</div>
            </dl>
          ) : (
            <p className="text-xs text-gray-400">Aún no se ha cargado.</p>
          )}
          {r.cargadoEn && <p className="text-[10px] text-gray-400">Cargó {r.cargadoPor} · {fmtFechaHora(r.cargadoEn)}</p>}
          {r.revisadoEn && <p className="text-[10px] text-emerald-700 font-semibold">OK de {r.revisadoPor} · {fmtFechaHora(r.revisadoEn)}</p>}
          {error && <Aviso tipo="error">{error}</Aviso>}
          <div className="flex flex-wrap gap-2">
            {puedeCargar && (
              <button className={btnSecundario} onClick={() => setEditando(true)} disabled={ocupado}>
                <BsPencil className="inline mr-1" /> {r.id ? 'Actualizar' : 'Cargar'}
              </button>
            )}
            {puedeRevisar && r.estado === 'FALTA_OK' && (
              <button className="whitespace-nowrap px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold" onClick={() => revisar(true)} disabled={ocupado}>
                <BsCheck2Circle className="inline mr-1" /> Dar OK
              </button>
            )}
            {puedeRevisar && r.estado === 'OK' && (
              <button className={btnSecundario} onClick={() => revisar(false)} disabled={ocupado}>
                <BsXCircle className="inline mr-1" /> Quitar OK
              </button>
            )}
          </div>
        </>
      ) : (
        <form onSubmit={guardar} className="space-y-3">
          {r.esMonto ? (
            <Campo etiqueta={r.etiquetaRef}>
              <input className={inputCls} type="number" step="0.01" min="0" inputMode="decimal" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} required />
            </Campo>
          ) : (
            <Campo etiqueta={r.etiquetaRef}>
              <input className={inputCls} value={f.referencia} onChange={(e) => setF({ ...f, referencia: e.target.value })} maxLength={150} required />
            </Campo>
          )}
          {r.esMonto && (
            <Campo etiqueta="Referencia (opcional)">
              <input className={inputCls} value={f.referencia} onChange={(e) => setF({ ...f, referencia: e.target.value })} maxLength={150} placeholder="N.º de transferencia" />
            </Campo>
          )}
          <Campo etiqueta={r.etiquetaFecha}>
            <input className={inputCls} type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} required />
          </Campo>
          <Campo etiqueta={r.etiquetaAdjunto}>
            <ElegirArchivo archivo={archivo} onElegir={setArchivo} etiqueta={r.archivoId ? 'Reemplazar archivo' : 'Elegir archivo'} />
            {r.archivoId && !archivo && <p className="text-[11px] text-gray-400 mt-1">Se conserva el archivo actual: {r.archivoNombre}</p>}
          </Campo>
          <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={f.confirmado} onChange={(e) => setF({ ...f, confirmado: e.target.checked })} />
            <span>{r.textoConfirmacion}</span>
          </label>
          {r.revisadoEn && <Aviso tipo="alerta">Al guardar se quitará el OK de revisión y se reiniciarán las firmas de aprobación.</Aviso>}
          {error && <Aviso tipo="error">{error}</Aviso>}
          <div className="flex gap-2">
            <button type="submit" className={btnPrimario} disabled={ocupado}>{ocupado ? 'Guardando...' : 'Guardar'}</button>
            <button type="button" className={btnSecundario} onClick={() => setEditando(false)} disabled={ocupado}>Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
};
