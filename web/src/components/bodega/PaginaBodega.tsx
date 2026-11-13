import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BsBoxes } from 'react-icons/bs';
import { bodegasAPI } from '../../api';
import { mensajeError } from '../../api/client';
import type { Bodega } from '../../types';
import { EstadoObraChip, fmtUSD } from '../common/EstadoChip';
import { Aviso, Cargando } from '../common/Modal';
import { BodegaVista } from './BodegaVista';

/** Bodega central: su stock, kardex y transferencias, más un resumen de las bodegas de obra. */
export const PaginaBodega: React.FC = () => {
  const [lista, setLista] = useState<Bodega[] | null>(null);
  const [error, setError] = useState('');
  const cargar = () => bodegasAPI.listar().then(setLista).catch((e) => setError(mensajeError(e)));
  useEffect(() => {
    cargar();
  }, []);

  if (!lista) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando />;
  const central = lista.find((b) => b.tipo === 'CENTRAL' && b.acceso);
  const obras = lista.filter((b) => b.tipo === 'OBRA');

  return (
    <div className="font-sans space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Bodega central</h1>
        <p className="text-xs text-gray-500 mt-1">Stock global segmentado: la central abastece a las obras con transferencias firmadas; cada obra tiene su propia bodega.</p>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}

      {obras.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Bodegas de obra</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {obras.map((b) => (
              <Link key={b.id} to={`/obras/${b.obraId}?tab=bodega`} className="bg-white border border-gray-200 rounded-2xl p-4 hover:border-gray-400 space-y-1">
                <div className="flex justify-between items-start gap-2">
                  <span className="text-xs font-bold text-gray-800">{b.obraNombre}</span>
                  {b.obraEstado && <EstadoObraChip estado={b.obraEstado} />}
                </div>
                <p className="text-[11px] text-gray-500">
                  {b.materialesConStock ?? 0} material(es) con stock · {fmtUSD(b.valorStock ?? 0)}
                  {!!b.transferenciasAbiertas && <span className="text-amber-700 font-semibold"> · {b.transferenciasAbiertas} transferencia(s) abierta(s)</span>}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {central ? (
        <BodegaVista bodegaId={central.id} onCambio={cargar} />
      ) : (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl py-12 text-center">
          <BsBoxes className="h-7 w-7 text-gray-300 mx-auto mb-2" />
          <p className="text-xs text-gray-500">No operas la bodega central. Puedes pedirle material desde la pestaña «Bodega» de tu obra.</p>
        </div>
      )}
    </div>
  );
};
