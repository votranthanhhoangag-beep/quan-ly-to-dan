import { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

export function useUserRole() {
  const [role, setRole] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState(supabase !== null);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;

    async function fetchRole(client: NonNullable<typeof supabase>) {
      try {
        const { data: { user }, error: authError } = await client.auth.getUser();
        if (authError) throw authError;
        if (!user) {
          if (active) setIsAuthenticated(false);
          return;
        }

        if (active) setIsAuthenticated(true);
        const { data, error: profileError } = await client
          .from('user_profiles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();
        if (profileError) {
          console.error('Không thể tải vai trò tài khoản:', profileError);
          if (active) setRole(null);
          return;
        }
        if (active) setRole(data?.role ?? null);
      } catch (error) {
        console.error('Không thể xác minh phiên đăng nhập hoặc vai trò:', error);
        if (active) {
          setIsAuthenticated(false);
          setRole(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void fetchRole(client);

    return () => {
      active = false;
    };
  }, []);

  return { role, loading, isAuthenticated };
}