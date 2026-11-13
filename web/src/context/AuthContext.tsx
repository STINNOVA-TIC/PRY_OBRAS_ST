// Adaptado de PRY_PUNTO_VENTA/frontend/src/context/AuthContext.tsx
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { authAPI } from '../api';
import type { Permiso, UsuarioSesion } from '../types';
import { CambioPasswordModal } from '../components/auth/CambioPasswordModal';

interface AuthContextType {
  user: UsuarioSesion | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refrescarUsuario: () => Promise<void>;
  esPropietario: boolean;
  hasPermission: (permiso: Permiso) => boolean;
  hasAnyPermission: (...permisos: Permiso[]) => boolean;
  hasAllPermissions: (...permisos: Permiso[]) => boolean;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  openChangePassword: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const INACTIVIDAD_MS = 10 * 60 * 1000;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UsuarioSesion | null>(null);
  const [loading, setLoading] = useState(true);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showExpiredModal, setShowExpiredModal] = useState(false);
  const lastActivity = useRef<number>(Date.now());

  const esPropietario = !!user?.roles.includes('SUPERADMIN');

  const hasPermission = (permiso: Permiso) => !!user && (esPropietario || user.permisos.includes(permiso));
  const hasAnyPermission = (...permisos: Permiso[]) =>
    !!user && (esPropietario || permisos.some((p) => user.permisos.includes(p)));
  const hasAllPermissions = (...permisos: Permiso[]) =>
    !!user && (esPropietario || permisos.every((p) => user.permisos.includes(p)));

  const guardarUsuario = (u: UsuarioSesion) => {
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
  };

  const login = async (email: string, password: string) => {
    const { accessToken, usuario } = await authAPI.login(email, password);
    localStorage.setItem('token', accessToken);
    guardarUsuario(usuario);
    setShowChangePassword(usuario.requiereCambioPassword);
    lastActivity.current = Date.now();
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  /** Recarga roles, permisos y firma desde la API (p. ej. tras subir la firma). */
  const refrescarUsuario = async () => {
    guardarUsuario(await authAPI.me());
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    await authAPI.cambiarPassword(currentPassword, newPassword);
    if (user) guardarUsuario({ ...user, requiereCambioPassword: false });
    setShowChangePassword(false);
  };

  const verifyToken = async () => {
    try {
      if (!localStorage.getItem('token')) return logout();
      const fresco = await authAPI.me(); // valida el token y trae permisos actualizados
      guardarUsuario(fresco);
      setShowChangePassword(fresco.requiereCambioPassword);
      lastActivity.current = Date.now();
    } catch {
      logout();
    } finally {
      setLoading(false);
    }
  };

  // Cierre de sesión por inactividad (10 minutos), igual que en el POS
  useEffect(() => {
    if (!user) return;
    const actualizar = () => {
      lastActivity.current = Date.now();
    };
    const eventos = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    eventos.forEach((e) => window.addEventListener(e, actualizar));
    const interval = setInterval(() => {
      if (Date.now() - lastActivity.current > INACTIVIDAD_MS) {
        setShowExpiredModal(true);
        clearInterval(interval);
      }
    }, 10000);
    return () => {
      eventos.forEach((e) => window.removeEventListener(e, actualizar));
      clearInterval(interval);
    };
  }, [user]);

  useEffect(() => {
    verifyToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        refrescarUsuario,
        esPropietario,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        changePassword,
        openChangePassword: () => setShowChangePassword(true),
        isAuthenticated: !!user,
      }}
    >
      {children}

      {showExpiredModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 font-sans">
          <div className="bg-white border border-gray-200 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 text-left">
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">⚠️ Sesión expirada</h3>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Tu sesión expiró por inactividad (10 minutos). Vuelve a iniciar sesión para continuar.
            </p>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  setShowExpiredModal(false);
                  logout();
                }}
                className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-2 rounded-lg text-xs font-semibold shadow-sm transition"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
      {showChangePassword && user && (
        <CambioPasswordModal obligatorio={user.requiereCambioPassword} onClose={() => setShowChangePassword(false)} />
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
};
