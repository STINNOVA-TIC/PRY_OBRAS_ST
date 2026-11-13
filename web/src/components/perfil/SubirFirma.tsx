import React, { useRef, useState } from 'react';
import { BsCloudUpload, BsPenFill } from 'react-icons/bs';
import { mensajeError } from '../../api/client';
import { FirmaImagen } from '../common/FirmaImagen';
import { Aviso, btnPrimario, btnSecundario } from '../common/Modal';

/**
 * Carga de firma (como empleado_firma del POS): vista previa local antes de guardar.
 * Recomendado: PNG con fondo transparente, firma en tinta oscura.
 */
export const SubirFirma: React.FC<{
  firmaArchivoId: string | null;
  onGuardar: (archivo: File) => Promise<void>;
  onQuitar?: () => Promise<void>;
  puedeEditar?: boolean;
}> = ({ firmaArchivoId, onGuardar, onQuitar, puedeEditar = true }) => {
  const input = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const elegir = (f: File | undefined) => {
    setError('');
    setOk('');
    if (!f) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) return setError('La firma debe ser una imagen PNG, JPG o WEBP');
    if (f.size > 2 * 1024 * 1024) return setError('La imagen no debe superar 2 MB');
    setArchivo(f);
    setPreview(URL.createObjectURL(f));
  };

  const guardar = async () => {
    if (!archivo) return;
    setGuardando(true);
    setError('');
    try {
      await onGuardar(archivo);
      setOk('Firma guardada. Se estampará en los documentos que firmes a partir de ahora.');
      setArchivo(null);
      setPreview(null);
    } catch (e) {
      setError(mensajeError(e, 'No se pudo guardar la firma'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-dashed border-gray-300 bg-[repeating-linear-gradient(45deg,#fafafa_0_10px,#fff_10px_20px)] h-40 flex items-center justify-center">
        {preview ? (
          <img src={preview} alt="Vista previa de la firma" className="max-h-32 object-contain" />
        ) : firmaArchivoId ? (
          <FirmaImagen archivoId={firmaArchivoId} className="max-h-32 object-contain" />
        ) : (
          <div className="text-center text-gray-400">
            <BsPenFill className="h-6 w-6 mx-auto mb-2" />
            <p className="text-xs font-medium">Sin firma registrada</p>
          </div>
        )}
      </div>
      {preview && <p className="text-[11px] text-amber-700 font-medium">Vista previa: aún no se ha guardado.</p>}
      {error && <Aviso tipo="error">{error}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      {puedeEditar && (
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => elegir(e.target.files?.[0])} />
          <button type="button" className={btnSecundario} onClick={() => input.current?.click()} disabled={guardando}>
            <BsCloudUpload className="inline h-3.5 w-3.5 mr-1.5" />
            {firmaArchivoId ? 'Elegir otra imagen' : 'Elegir imagen'}
          </button>
          {archivo && (
            <button type="button" className={btnPrimario} onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar firma'}
            </button>
          )}
          {!archivo && firmaArchivoId && onQuitar && (
            <button type="button" className={btnSecundario} onClick={() => onQuitar()} disabled={guardando}>
              Quitar firma
            </button>
          )}
        </div>
      )}
      <p className="text-[11px] text-gray-400">
        Recomendado: PNG con fondo transparente, firma en tinta oscura y recortada. Las firmas ya estampadas en documentos no cambian.
      </p>
    </div>
  );
};
