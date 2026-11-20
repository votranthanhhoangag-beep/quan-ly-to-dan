import { useAuth } from '../context/AuthContext';

export function useUserRole() {
  const { status, user } = useAuth();
  return {
    role: user?.role ?? null,
    loading: status === 'loading',
    isAuthenticated: status === 'ready' && user !== null
  };
}