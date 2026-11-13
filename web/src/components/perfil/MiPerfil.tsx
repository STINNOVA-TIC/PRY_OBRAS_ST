import React, { useEffect, useState } from 'react';
import { authAPI } from '../../api';
import { useAuth } from '../../context/AuthContext';
import type { Usuario } from '../../types';
import { Cargando, btnSecundario } from '../common/Modal';
import { SubirFirma } from './SubirFirma';

export const MiPerfil: React.FC = () => {
  const { user, refrescarUsuario, openChangePassword } = useAuth();
  const [perfil, setPerfil] = useState<Usuario | null>(null);

  const cargar = () => authAPI.perfil().then(setPerfil);
  useEffect(() => {
    cargar();
  }, []);

  if (!perfil || !user) return <Cargando texto="Cargando tu perfil..." />;

  return (
    <div className="font-sans space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Mi perfil y firma</h1>
        <p className="text-xs text-gray-500 mt-1">Tu firma se estampa en las aprobaciones de habilitación, planillas y transferencias que firmes.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-gray-800">Datos</h2>
          <dl className="grid grid-cols-3 gap-y-3 text-xs">
            <dt className="text-gray-400 font-bold uppercase text-[10px] tracking-wider">Nombre</dt>
            <dd className="col-span-2 font-semibold text-gray-800">{perfil.nombre}</dd>
            <dt className="text-gray-400 font-bold uppercase text-[10px] tracking-wider">Cargo</dt>
            <dd className="col-span-2 text-gray-700">{perfil.cargo || <span className="text-amber-600">Sin cargo (pídelo al administrador: se imprime bajo tu firma)</span>}</dd>
            <dt className="text-gray-400 font-bold uppercase text-[10px] tracking-wider">Correo</dt>
            <dd className="col-span-2 font-mono text-gray-600">{perfil.email}</dd>
            <dt className="text-gray-400 font-bold uppercase text-[10px] tracking-wider">Cédula</dt>
            <dd className="col-span-2 text-gray-700">{perfil.cedula || '—'}</dd>
            <dt className="text-gray-400 font-bold uppercase text-[10px] tracking-wider">Roles</dt>
            <dd className="col-span-2 flex flex-wrap gap-1">
              {perfil.roles.map((r) => (
                <span key={r.id} className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border bg-gray-50 text-gray-600 border-gray-200">
                  {r.nombre}
                </span>
              ))}
            </dd>
          </dl>
          <button className={btnSecundario} onClick={openChangePassword}>
            Cambiar contraseña
          </button>
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-800">Mi firma</h2>
            {!perfil.firmaArchivoId && (
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border text-amber-700 bg-amber-50 border-amber-200">Pendiente</span>
            )}
          </div>
          <SubirFirma
            firmaArchivoId={perfil.firmaArchivoId}
            onGuardar={async (f) => {
              await authAPI.subirMiFirma(f);
              await Promise.all([cargar(), refrescarUsuario()]);
            }}
          />
        </section>
      </div>
    </div>
  );
};
