import type { ReactNode } from 'react';
import { useAuth, type Permission } from '../context/AuthContext';

export function PermissionGuard({
  permission,
  children,
  fallback = null
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { hasPermission } = useAuth();
  return hasPermission(permission) ? children : fallback;
}
