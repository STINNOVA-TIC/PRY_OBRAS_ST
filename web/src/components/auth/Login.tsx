// Adaptado de PRY_PUNTO_VENTA/frontend/src/components/auth/Login.tsx (solo acceso con correo y contraseña)
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BsEnvelope, BsExclamationTriangle, BsEye, BsEyeSlash, BsKey } from 'react-icons/bs';
import { useAuth } from '../../context/AuthContext';
import { mensajeError } from '../../api/client';
import logoEmpresa from '../../assets/logo.png';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(mensajeError(err, 'Credenciales inválidas'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-800 font-sans">
      {/* Panel visual (pantallas medianas en adelante) */}
      <div className="hidden md:flex md:w-1/2 lg:w-3/5 relative items-end p-12 overflow-hidden bg-gray-900">
        {/* Tramo de vía: bordes blancos y eje central segmentado amarillo */}
        <div className="absolute inset-x-0 top-[38%] h-40 -skew-y-6 bg-gray-800/80">
          <div className="absolute inset-x-0 top-3 h-1 bg-white/70" />
          <div
            className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2"
            style={{ backgroundImage: 'repeating-linear-gradient(90deg, #facc15 0 56px, transparent 56px 104px)' }}
          />
          <div className="absolute inset-x-0 bottom-3 h-1 bg-white/70" />
        </div>
        <div className="absolute top-1/4 left-10 w-72 h-72 bg-amber-400/10 rounded-full blur-3xl" />
        <div className="relative z-10 max-w-md space-y-3 text-white">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">Industria ST-INNOVA S.A.</span>
          <h1 className="text-3xl font-black leading-tight">Seguimiento de obras de señalización vial</h1>
          <p className="text-sm text-gray-300">
            Habilitación, avances, bodega, planillas y firmas de aprobación en un solo lugar.
          </p>
        </div>
      </div>

      {/* Formulario */}
      <div className="w-full md:w-1/2 lg:w-2/5 flex flex-col justify-center p-6 sm:p-12 md:p-16 bg-white">
        <div className="w-full max-w-sm mx-auto space-y-8">
          <div className="flex flex-col items-center space-y-4 w-full">
            <img src={logoEmpresa} alt="ST-INNOVA" className="h-20 w-auto object-contain select-none" />
            <div className="space-y-1 mt-2 text-center md:text-left w-full">
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">Iniciar sesión</h2>
              <p className="text-xs text-slate-500 font-medium">Acceso para el personal de obras, bodega y administración.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                Correo electrónico
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-sm">
                  <BsEnvelope />
                </span>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-gray-700 focus:ring-1 focus:ring-gray-700 transition text-sm shadow-inner"
                  placeholder="usuario@stinnova.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                Contraseña
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-sm">
                  <BsKey />
                </span>
                <input
                  id="password"
                  type={verPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-gray-700 focus:ring-1 focus:ring-gray-700 transition text-sm shadow-inner"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setVerPassword((v) => !v)}
                  aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-700"
                >
                  {verPassword ? <BsEyeSlash /> : <BsEye />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2 font-medium">
                <BsExclamationTriangle className="text-sm shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-xl font-bold transition duration-150 active:scale-[0.98] disabled:opacity-50 text-sm shadow-md shadow-gray-800/10"
            >
              {loading ? 'Validando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
