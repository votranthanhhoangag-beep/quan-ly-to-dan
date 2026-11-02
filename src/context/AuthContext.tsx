import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../services/supabaseClient';

export type UserRole = 'admin' | 'ke_toan' | 'kho_to_dan';

export type Permission =
  | 'view_dashboard'
  | 'view_categories'
  | 'view_company_contracts'
  | 'view_knitting_contracts'
  | 'manage_contracts'
  | 'delete_contracts'
  | 'manage_knitting_receipts'
  | 'manage_knitting_exports'
  | 'delete_knitting_exports'
  | 'manage_frame_returns'
  | 'view_frame_stock'
  | 'view_material_stock'
  | 'view_expenses'
  | 'manage_expenses'
  | 'delete_expenses'
  | 'view_revenue'
  | 'view_vehicles'
  | 'manage_settings'
  | 'view_audit_logs';

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
}

type AuthStatus = 'loading' | 'ready' | 'signed_out' | 'configuration_error' | 'profile_error';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthenticatedUser | null;
  error: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
}

const rolePermissions: Record<UserRole, Permission[]> = {
  admin: [
    'view_dashboard', 'view_categories', 'view_company_contracts', 'view_knitting_contracts',
    'manage_contracts', 'delete_contracts', 'manage_knitting_receipts', 'manage_knitting_exports', 'delete_knitting_exports',
    'manage_frame_returns', 'view_frame_stock', 'view_material_stock', 'view_expenses',
    'manage_expenses', 'delete_expenses', 'view_revenue', 'view_vehicles', 'manage_settings',
    'view_audit_logs'
  ],
  ke_toan: [
    'view_dashboard', 'view_company_contracts', 'view_knitting_contracts', 'manage_contracts',
    'view_expenses', 'manage_expenses', 'view_revenue'
  ],
  kho_to_dan: [
    'view_knitting_contracts', 'manage_knitting_receipts', 'manage_knitting_exports',
    'manage_frame_returns', 'view_frame_stock', 'view_material_stock'
  ]
};

const AuthContext = createContext<AuthContextValue | null>(null);

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Đã xảy ra lỗi xác thực. Vui lòng thử lại.';

const loadProfile = async (session: Session): Promise<AuthenticatedUser> => {
  if (!supabase) throw new Error('Supabase chưa được cấu hình.');
  const { data, error } = await supabase
    .from('user_profiles')
    .select('username, role')
    .eq('user_id', session.user.id)
    .abortSignal(AbortSignal.timeout(8000))
    .single();
  if (error) throw new Error(`Không thể tải vai trò tài khoản: ${error.message}`);
  if (!data || !['admin', 'ke_toan', 'kho_to_dan'].includes(data.role)) {
    throw new Error('Tài khoản chưa được cấp vai trò hợp lệ. Hãy liên hệ quản trị viên.');
  }
  return {
    id: session.user.id,
    username: String(data.username || session.user.email || 'user'),
    email: String(session.user.email || ''),
    role: data.role as UserRole
  };
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(
    isSupabaseConfigured ? 'loading' : 'configuration_error'
  );
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [error, setError] = useState('');

  const applySession = useCallback(async (session: Session | null) => {
    setError('');
    if (!session) {
      setUser(null);
      setStatus('signed_out');
      return;
    }
    try {
      const profile = await loadProfile(session);
      setUser(profile);
      setStatus('ready');
      window.dispatchEvent(new CustomEvent('erp:auth-ready'));
    } catch (profileError) {
      const message = getErrorMessage(profileError);
      await supabase?.auth.signOut();
      setUser(null);
      setError(message);
      setStatus('profile_error');
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setError(sessionError.message);
        setStatus('signed_out');
        return;
      }
      void applySession(data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) void applySession(session);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [applySession]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Thiếu cấu hình Supabase. Hãy khai báo URL và anon key.');
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      throw signInError;
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
    setUser(null);
    setStatus('signed_out');
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    user,
    error,
    signIn,
    signOut,
    hasPermission: permission => user !== null && rolePermissions[user.role].includes(permission)
  }), [status, user, error, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth phải được sử dụng trong AuthProvider');
  return context;
};
