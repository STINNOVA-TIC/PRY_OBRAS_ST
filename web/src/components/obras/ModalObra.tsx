import React, { useEffect, useState } from 'react';
import { obrasAPI } from '../../api';
import { mensajeError } from '../../api/client';
import type { Obra } from '../../types';
import { Aviso, Campo, Modal, btnPrimario, btnSecundario, inputCls } from '../common/Modal';

const VACIA = { nombre: '', codigo: '', cliente: '', ubicacion: '', provincia: '', plazoTexto: '', fechaInicio: '', fechaFin: '', descripcion: '' };

/** Crear o editar los datos generales de una obra. */
export const ModalObra: React.FC<{
  abierto: boolean;
  obra?: Obra | null;
  onCerrar: () => void;
  onGuardada: (o: Obra) => void;
}> = ({ abierto, obra, onCerrar, onGuardada }) => {
  const [f, setF] = useState({ ...VACIA });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setError('');
    setF(
      obra
        ? {
            nombre: obra.nombre,
            codigo: obra.codigo ?? '',
            cliente: obra.cliente ?? '',
            ubicacion: obra.ubicacion ?? '',
            provincia: obra.provincia ?? '',
            plazoTexto: obra.plazoTexto ?? '',
            fechaInicio: obra.fechaInicio ?? '',
            fechaFin: obra.fechaFin ?? '',
            descripcion: obra.descripcion ?? '',
          }
        : { ...VACIA },
    );
  }, [abierto, obra]);

  const set = (k: keyof typeof VACIA) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (f.fechaInicio && f.fechaFin && f.fechaFin < f.fechaInicio) return setError('La fecha de fin no puede ser anterior a la de inicio');
    setGuardando(true);
    try {
      let guardada: Obra;
      if (obra) {
        guardada = await obrasAPI.actualizar(obra.id, f); // '' → null en la API
      } else {
        const datos = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '')) as Partial<Obra>;
        guardada = await obrasAPI.crear(datos);
      }
      onGuardada(guardada);
    } catch (err) {
      setError(mensajeError(err, 'No se pudo guardar la obra'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto={abierto}
      titulo={obra ? 'Editar obra' : 'Nueva obra'}
      subtitulo={obra ? obra.nombre : 'La obra empieza en habilitación. Quedarás como Administrador de la misma.'}
      onCerrar={onCerrar}
      ancho="xl"
      pie={
        <>
          <button type="button" className={btnSecundario} onClick={onCerrar}>Cancelar</button>
          <button type="submit" form="form-obra" className={btnPrimario} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
        </>
      }
    >
      <form id="form-obra" onSubmit={guardar} className="space-y-4">
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="grid sm:grid-cols-3 gap-3">
          <Campo etiqueta="Nombre de la obra *" className="sm:col-span-2">
            <input className={inputCls} value={f.nombre} onChange={set('nombre')} required minLength={2} maxLength={200} placeholder="Ej. VINCES-MACUL 3" />
          </Campo>
          <Campo etiqueta="Código">
            <input className={inputCls} value={f.codigo} onChange={set('codigo')} maxLength={30} placeholder="Opcional" />
          </Campo>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Campo etiqueta="Cliente"><input className={inputCls} value={f.cliente} onChange={set('cliente')} maxLength={200} placeholder="Ej. CCECC" /></Campo>
          <Campo etiqueta="Provincia"><input className={inputCls} value={f.provincia} onChange={set('provincia')} maxLength={100} placeholder="Se imprime en planillas" /></Campo>
        </div>
        <Campo etiqueta="Ubicación / tramo"><input className={inputCls} value={f.ubicacion} onChange={set('ubicacion')} maxLength={200} /></Campo>
        <div className="grid sm:grid-cols-3 gap-3">
          <Campo etiqueta="Inicio"><input type="date" className={inputCls} value={f.fechaInicio} onChange={set('fechaInicio')} /></Campo>
          <Campo etiqueta="Fin"><input type="date" className={inputCls} value={f.fechaFin} onChange={set('fechaFin')} /></Campo>
          <Campo etiqueta="Plazo (texto)"><input className={inputCls} value={f.plazoTexto} onChange={set('plazoTexto')} maxLength={60} placeholder="Ej. 1 mes" /></Campo>
        </div>
        <Campo etiqueta="Descripción"><textarea className={inputCls} rows={2} value={f.descripcion} onChange={set('descripcion')} placeholder="Ej. Señalización horizontal (pintura y tachas)" /></Campo>
      </form>
    </Modal>
  );
};
