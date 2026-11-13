// Adaptado de PRY_PUNTO_VENTA/frontend/src/components/common/Navbar.tsx
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BsBoxArrowRight,
  BsBoxes,
  BsBuildings,
  BsGrid1X2Fill,
  BsHouseDoor,
  BsKey,
  BsList,
  BsPenFill,
  BsPersonGear,
  BsShieldLock,
  BsX, BsPeople, BsBarChartLine, BsLock, BsClockHistory, BsGear, BsChevronDown, } from 'react-icons/bs';
import { useAuth } from '../../context/AuthContext';
import logoEmpresa from '../../assets/logo.png';

interface ItemMenu {
  to: string;
  label: string;
  icon: React.ReactNode;
  visible: boolean;
  proximamente?: boolean;
  /** Va en el menú desplegable «Administración» (en escritorio). */
  admin?: boolean;
}

export const Navbar: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const { user, logout, hasAnyPermission, esPropietario, openChangePassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isRouteActive = (basePath: string) =>
    basePath === '/' ? location.pathname === '/' : location.pathname === basePath || location.pathname.startsWith(`${basePath}/`);

  const items: ItemMenu[] = [
    { to: '/', label: 'Inicio', icon: <BsHouseDoor />, visible: true },
    { to: '/obras', label: 'Obras', icon: <BsBuildings />, visible: hasAnyPermission('obras.ver', 'obras.ver_todas') },
    { to: '/contratistas', label: 'Contratistas', icon: <BsPeople />, visible: hasAnyPermission('contratistas.ver') },
    { to: '/bodega', label: 'Bodega central', icon: <BsBoxes />, visible: hasAnyPermission('bodega.central', 'obras.ver_todas') },

    { to: '/reportes', label: 'Reportes', icon: <BsBarChartLine />, visible: hasAnyPermission('reportes.ver') },
    { to: '/costeo', label: 'Costeo', icon: <BsLock />, visible: hasAnyPermission('costeo.ver') },
    { to: '/admin/usuarios', label: 'Usuarios', icon: <BsPersonGear />, visible: hasAnyPermission('usuarios.ver', 'usuarios.crear'), admin: true },
    { to: '/admin/roles', label: 'Roles y permisos', icon: <BsShieldLock />, visible: hasAnyPermission('roles.ver'), admin: true },
    { to: '/catalogo', label: 'Catálogo y parámetros', icon: <BsGrid1X2Fill />, visible: esPropietario || hasAnyPermission('config.editar'), admin: true },
    { to: '/bitacora', label: 'Bitácora', icon: <BsClockHistory />, visible: hasAnyPermission('bitacora.ver'), admin: true },
  ];
  const visibles = items.filter((i) => i.visible && !i.proximamente);
  const principales = visibles.filter((i) => !i.admin);
  const administracion = visibles.filter((i) => i.admin);
  const [adminAbierto, setAdminAbierto] = React.useState(false);
  const adminActivo = administracion.some((i) => isRouteActive(i.to));
  React.useEffect(() => setAdminAbierto(false), [location.pathname]);

  const rolPrincipal = user?.roles[0] ?? '';

  return (
    <nav className="bg-white border-b border-gray-200 text-gray-800 font-sans shadow-xs sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex min-w-0 flex-1 items-center space-x-4 lg:space-x-6">
            <Link to="/" className="flex shrink-0 items-center select-none">
              <img src={logoEmpresa} alt="ST-INNOVA" className="h-9 w-auto object-contain" />
            </Link>

            <div className="menu-scrollbar-hidden hidden min-w-0 flex-1 items-center space-x-1 overflow-x-auto pb-1 md:flex">
              {principales.map(({ to, label, icon }) => {
                const active = isRouteActive(to);
                return (
                  <Link
                    to={to}
                    key={to}
                    className={`relative shrink-0 whitespace-nowrap px-3 py-2 rounded-xl text-xs font-bold transition-all duration-150 flex items-center gap-1.5 ${
                      active ? 'bg-gray-900 text-white shadow-sm ring-1 ring-gray-900' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <span className="text-sm shrink-0">{icon}</span>
                    <span>{label}</span>
                    {active && (
                      <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none z-10">
                        <span className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-900 animate-bounce" />
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
            {administracion.length > 0 && (
              <div className="relative hidden shrink-0 md:block">
                <button
                  type="button"
                  onClick={() => setAdminAbierto(!adminAbierto)}
                  aria-expanded={adminAbierto}
                  className={`whitespace-nowrap px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    adminActivo ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <BsGear className="text-sm" />
                  <span>Administración</span>
                  <BsChevronDown className={`text-[10px] transition-transform ${adminAbierto ? 'rotate-180' : ''}`} />
                </button>
                {adminAbierto && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setAdminAbierto(false)} />
                    <div className="absolute left-0 top-full mt-2 z-50 w-56 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg">
                      {administracion.map(({ to, label, icon }) => (
                        <Link key={to} to={to} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${isRouteActive(to) ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
                          <span className="text-sm">{icon}</span>{label}
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="ml-3 flex shrink-0 items-center space-x-2 lg:space-x-3">
            <Link to="/perfil" className="hidden max-w-[160px] flex-col items-end text-xs lg:flex hover:opacity-80" title="Mi perfil y firma">
              <span className="font-semibold text-gray-800 truncate max-w-full">{user?.nombre}</span>
              <span className="text-gray-400 uppercase tracking-wider font-bold text-[9px] mt-0.5">{rolPrincipal}</span>
            </Link>
            <Link
              to="/perfil"
              title={user?.tieneFirma ? 'Mi firma registrada' : 'Aún no registras tu firma'}
              className={`relative hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition sm:flex ${
                user?.tieneFirma ? 'border-gray-300 text-gray-600 hover:border-gray-500 hover:bg-gray-50' : 'border-amber-300 text-amber-600 bg-amber-50 hover:bg-amber-100'
              }`}
            >
              <BsPenFill className="h-4 w-4" />
              {!user?.tieneFirma && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white" />}
            </Link>
            <button
              onClick={openChangePassword}
              title="Cambiar contraseña"
              aria-label="Cambiar contraseña"
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 hover:border-gray-500 hover:bg-gray-50 text-gray-600 transition sm:flex"
            >
              <BsKey className="h-4 w-4" />
            </button>
            <button
              onClick={handleLogout}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:border-gray-500 hover:bg-gray-50 hover:text-gray-800 lg:px-4"
            >
              <BsBoxArrowRight className="h-4 w-4" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Menú"
              className="md:hidden p-2 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition"
            >
              {mobileMenuOpen ? <BsX className="h-5 w-5" /> : <BsList className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 py-3 px-4 bg-gray-50 space-y-1.5 shadow-inner">
          {[...visibles, { to: '/perfil', label: 'Mi perfil y firma', icon: <BsPenFill />, visible: true }].map(({ to, label, icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMobileMenuOpen(false)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
                isRouteActive(to) ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              <span className="h-4 w-4">{icon}</span>
              {label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
};
