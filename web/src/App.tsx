import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ModalProvider } from './context/ModalContext';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { PermissionGuard } from './components/common/PermissionGuard';
import { Layout } from './components/common/Layout';
import { Login } from './components/auth/Login';
import { DashboardHome } from './components/dashboard/DashboardHome';
import { ObrasLista } from './components/obras/ObrasLista';
import { ObraDetalle } from './components/obras/ObraDetalle';
import { PanelUsuarios } from './components/admin/PanelUsuarios';
import { PanelRoles } from './components/admin/PanelRoles';
import { PanelContratistas } from './components/contratistas/PanelContratistas';
import { PaginaCatalogo } from './components/catalogo/PaginaCatalogo';
import { PaginaBodega } from './components/bodega/PaginaBodega';
import { PaginaTransferencia } from './components/bodega/Transferencias';
import { PaginaPlanilla } from './components/planillas/DetallePlanilla';
import { ImprimirPlanilla } from './components/planillas/ImprimirPlanilla';
import { PaginaCargaPublica } from './components/habilitacion/PaginaCargaPublica';
import { ImprimirReporteGeneral, PaginaReporteGeneral } from './components/reportes/ReporteGeneral';
import { PaginaCosteo } from './components/costeo/PaginaCosteo';
import { PaginaBitacora } from './components/bitacora/Bitacora';
import { MiPerfil } from './components/perfil/MiPerfil';

const SinPermiso = (
  <div className="bg-white border border-gray-200 rounded-2xl py-16 text-center text-sm text-gray-500">No tienes permiso para ver esta sección.</div>
);

/** Página protegida con layout y, opcionalmente, permisos requeridos (cualquiera de ellos). */
const Pagina: React.FC<{ permisos?: string[]; children: React.ReactNode }> = ({ permisos, children }) => (
  <ProtectedRoute>
    <Layout>
      {permisos ? <PermissionGuard permisos={permisos} fallback={SinPermiso}>{children}</PermissionGuard> : children}
    </Layout>
  </ProtectedRoute>
);

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <ModalProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/carga/:token" element={<PaginaCargaPublica />} />
            <Route path="/reportes/imprimir" element={<ProtectedRoute><PermissionGuard permisos={['reportes.ver']} fallback={SinPermiso}><ImprimirReporteGeneral /></PermissionGuard></ProtectedRoute>} />
            <Route path="/" element={<Pagina><DashboardHome /></Pagina>} />
            <Route path="/obras" element={<Pagina permisos={['obras.ver', 'obras.ver_todas']}><ObrasLista /></Pagina>} />
            <Route path="/obras/:id" element={<Pagina permisos={['obras.ver', 'obras.ver_todas']}><ObraDetalle /></Pagina>} />
            <Route path="/obras/:obraId/planillas/:id" element={<Pagina permisos={['planillas.ver']}><PaginaPlanilla /></Pagina>} />
            <Route path="/obras/:obraId/planillas/:id/imprimir" element={<ProtectedRoute><PermissionGuard permisos={['planillas.ver']} fallback={SinPermiso}><ImprimirPlanilla /></PermissionGuard></ProtectedRoute>} />
            <Route path="/bodega" element={<Pagina permisos={['bodega.ver']}><PaginaBodega /></Pagina>} />
            <Route path="/transferencias/:id" element={<Pagina permisos={['bodega.ver']}><PaginaTransferencia /></Pagina>} />
            <Route path="/reportes" element={<Pagina permisos={['reportes.ver']}><PaginaReporteGeneral /></Pagina>} />
            <Route path="/costeo" element={<Pagina permisos={['costeo.ver']}><PaginaCosteo /></Pagina>} />
            <Route path="/bitacora" element={<Pagina permisos={['bitacora.ver']}><PaginaBitacora /></Pagina>} />
            <Route path="/catalogo" element={<Pagina permisos={['config.editar']}><PaginaCatalogo /></Pagina>} />
            <Route path="/contratistas" element={<Pagina permisos={['contratistas.ver']}><PanelContratistas /></Pagina>} />
            <Route path="/admin/usuarios" element={<Pagina permisos={['usuarios.ver', 'usuarios.crear']}><PanelUsuarios /></Pagina>} />
            <Route path="/admin/roles" element={<Pagina permisos={['roles.ver']}><PanelRoles /></Pagina>} />
            <Route path="/perfil" element={<Pagina><MiPerfil /></Pagina>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ModalProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
