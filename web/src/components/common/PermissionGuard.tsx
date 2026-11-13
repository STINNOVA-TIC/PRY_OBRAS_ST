import React from 'react';
import { useAuth } from '../../context/AuthContext';
import type { Permiso } from '../../types';

interface PermissionGuardProps {
  children: React.ReactNode;
  permiso?: Permiso;
  permisos?: Permiso[];
  fallback?: React.ReactNode;
}

export const PermissionGuard: React.FC<PermissionGuardProps> = ({
  children,
  permiso,
  permisos,
  fallback = null,
}) => {
  const { hasPermission, hasAnyPermission } = useAuth();

  const allowed = permisos ? hasAnyPermission(...permisos) : (permiso ? hasPermission(permiso) : true);

  if (!allowed) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
