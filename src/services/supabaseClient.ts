import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const fetchWithTimeout: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');

  let finalInput = input;
  const method = (init?.method || (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET') || 'GET').toUpperCase();

  if (method === 'GET') {
    if (typeof input === 'string') {
      const separator = input.includes('?') ? '&' : '?';
      finalInput = `${input}${separator}_t=${Date.now()}`;
    } else if (typeof Request !== 'undefined' && input instanceof Request) {
      try {
        const url = new URL(input.url);
        url.searchParams.set('_t', Date.now().toString());
        finalInput = new Request(url.toString(), input);
      } catch {
        finalInput = input;
      }
    }
  }

  return fetch(finalInput, {
    ...init,
    cache: 'no-store',
    headers,
    signal: init?.signal ?? AbortSignal.timeout(10000)
  });
};

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
    global: {
      fetch: fetchWithTimeout
    },
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  })
  : null;
