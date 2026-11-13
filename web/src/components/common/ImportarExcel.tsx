import React, { useEffect, useRef, useState } from 'react';
import { BsFileEarmarkSpreadsheet, BsUpload } from 'react-icons/bs';
import { mensajeError } from '../../api/client';
import { Aviso, Modal, btnPrimario, btnSecundario } from './Modal';

export interface ColumnaVista<F> {
  titulo: string;
  valor: (f: F) => React.ReactNode;
  derecha?: boolean;
  ancho?: string;
}

/**
 * Importación en dos pasos: 1) el usuario elige el .xlsx y la API lo lee (sin guardar);
 * 2) revisa las filas (las que tienen errores u omitidas no se importan) y confirma.
 */
export function ModalImportarExcel<F extends { fila: number; errores: string[] }>({
  abierto,
  titulo,
  columnasEsperadas,
  leer,
  columnas,
  omitir,
  textoOmitida = 'Se omitirá',
  extra,
  validarExtra,
  confirmar,
  onCerrar,
  onHecho,
}: {
  abierto: boolean;
  titulo: string;
  /** Texto que explica qué columnas debe tener el Excel. */
  columnasEsperadas: React.ReactNode;
  leer: (archivo: File) => Promise<F[]>;
  columnas: ColumnaVista<F>[];
  /** Filas válidas que igual no se importan (p. ej. ya existen). */
  omitir?: (f: F) => boolean;
  textoOmitida?: string;
  /** Campos adicionales (fecha, documento…) que se muestran tras leer el archivo. */
  extra?: React.ReactNode;
  validarExtra?: () => string | null;
  confirmar: (filas: F[]) => Promise<string>;
  onCerrar: () => void;
  onHecho: (mensaje: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [filas, setFilas] = useState<F[] | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setArchivo(null);
    setFilas(null);
    setError('');
  }, [abierto]);

  if (!abierto) return null;

  const elegir = async (f: File | null) => {
    if (!f) return;
    setArchivo(f);
    setFilas(null);
    setError('');
    if (!/\.xlsx$/i.test(f.name)) return setError('Elige un archivo Excel .xlsx (si es .xls, ábrelo y guárdalo como .xlsx)');
    setOcupado(true);
    try {
      setFilas(await leer(f));
    } catch (e) {
      setError(mensajeError(e, 'No se pudo leer el archivo'));
    } finally {
      setOcupado(false);
    }
  };

  const validas = (filas ?? []).filter((f) => !f.errores.length && !omitir?.(f));
  const conError = (filas ?? []).filter((f) => f.errores.length).length;
  const omitidas = (filas ?? []).filter((f) => !f.errores.length && omitir?.(f)).length;

  const importar = async () => {
    const e = validarExtra?.();
    if (e) return setError(e);
    setOcupado(true);
    setError('');
    try {
      onHecho(await confirmar(validas));
    } catch (err) {
      setError(mensajeError(err, 'No se pudo importar'));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal abierto titulo={titulo} onCerrar={onCerrar} ancho="4xl"
      pie={<><button className={btnSecundario} onClick={onCerrar}>Cancelar</button>
        <button className={btnPrimario} onClick={importar} disabled={ocupado || !validas.length}>{ocupado && filas ? 'Importando...' : `Importar ${validas.length || ''} fila(s)`}</button></>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-[11px] text-gray-600 flex gap-3">
          <BsFileEarmarkSpreadsheet className="h-5 w-5 text-emerald-600 shrink-0" />
          <div>{columnasEsperadas} La fila de títulos puede estar más abajo (por ejemplo, después de un texto de presentación). Las filas de totales se ignoran.</div>
        </div>
        <div className="flex items-center gap-3">
          <input ref={ref} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden"
            onChange={(e) => { elegir(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          <button type="button" className="whitespace-nowrap px-3 py-2 rounded-lg border border-dashed border-gray-400 text-gray-700 hover:bg-gray-50 text-xs font-semibold" onClick={() => ref.current?.click()}>
            <BsUpload className="inline mr-1.5" />{archivo ? 'Elegir otro archivo' : 'Elegir archivo Excel (.xlsx)'}
          </button>
          {archivo && <span className="text-xs text-gray-600 truncate">{archivo.name}</span>}
          {ocupado && !filas && <span className="text-xs text-gray-400">Leyendo...</span>}
        </div>

        {filas && (
          <>
            <p className="text-xs text-gray-700">
              <b>{filas.length}</b> fila(s) leídas · <b className="text-emerald-700">{validas.length}</b> se importarán
              {omitidas > 0 && <> · <b className="text-gray-500">{omitidas}</b> omitida(s)</>}
              {conError > 0 && <> · <b className="text-red-600">{conError}</b> con errores</>}
            </p>
            <div className="max-h-[45vh] overflow-auto border border-gray-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-gray-50 text-gray-400 uppercase text-[10px] tracking-wider font-bold">
                  <tr>
                    <th className="px-3 py-2">Fila</th>
                    {columnas.map((c) => <th key={c.titulo} className={`px-3 py-2 ${c.derecha ? 'text-right' : ''} ${c.ancho ?? ''}`}>{c.titulo}</th>)}
                    <th className="px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filas.map((f) => (
                    <tr key={f.fila} className={f.errores.length ? 'bg-red-50/50' : omitir?.(f) ? 'opacity-50' : ''}>
                      <td className="px-3 py-2 text-gray-400">{f.fila}</td>
                      {columnas.map((c) => <td key={c.titulo} className={`px-3 py-2 align-top ${c.derecha ? 'text-right whitespace-nowrap' : ''}`}>{c.valor(f)}</td>)}
                      <td className="px-3 py-2 align-top text-[11px]">
                        {f.errores.length ? <span className="text-red-600 font-semibold">{f.errores.join('; ')}</span>
                          : omitir?.(f) ? <span className="text-gray-500">{textoOmitida}</span>
                          : <span className="text-emerald-700 font-semibold">OK</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {extra}
          </>
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}
      </div>
    </Modal>
  );
}
