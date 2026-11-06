import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';

export default function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!success) return;
    const redirectTimer = window.setTimeout(() => {
      navigate('/login', { replace: true });
    }, 1800);
    return () => window.clearTimeout(redirectTimer);
  }, [navigate, success]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    const normalizedEmail = email.trim();
    if (normalizedEmail.toLowerCase().endsWith('@erp.local')) {
      setErrorMessage('Miền tài khoản nội bộ chỉ dành cho người dùng do quản trị viên tạo.');
      return;
    }

    setSubmitting(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
      if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase chưa được cấu hình. Vui lòng liên hệ quản trị viên.');

      const registrationClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
      const { data, error: signUpError } = await registrationClient.auth.signUp({
        email: normalizedEmail,
        password
      });
      if (signUpError) throw signUpError;
      if (!data.user) throw new Error('Supabase không trả về thông tin tài khoản mới.');

      setSuccess(true);
    } catch (error) {
      console.error('Không thể tạo tài khoản:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Không thể đăng ký. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60 sm:p-10">
        <header className="mb-8 text-center">
          <p className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-blue-600">ERP Lục Bình</p>
          <h1 className="text-2xl font-bold text-slate-900">Tạo tài khoản mới</h1>
          <p className="mt-2 text-sm text-slate-600">Dữ liệu sẽ được phân lập theo tài khoản đăng nhập.</p>
        </header>

        {success ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center text-sm font-medium text-green-800" role="status" aria-live="polite">
            Tạo tài khoản thành công. Hãy xác nhận email nếu được yêu cầu, sau đó đăng nhập. Đang chuyển trang...
          </div>
        ) : (
          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="block space-y-2 text-sm font-semibold text-slate-700">
              <span>Email</span>
              <input
                autoComplete="email"
                type="email"
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                placeholder="admin@example.com"
              />
            </label>

            <label className="block space-y-2 text-sm font-semibold text-slate-700">
              <span>Mật khẩu</span>
              <input
                autoComplete="new-password"
                type="password"
                minLength={6}
                required
                value={password}
                onChange={event => setPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                placeholder="Tối thiểu 6 ký tự"
              />
            </label>

            {errorMessage && <p className="text-sm text-red-700" role="alert">{errorMessage}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-slate-600">
          Đã có tài khoản? <Link className="font-semibold text-blue-700 hover:text-blue-800" to="/login">Đăng nhập</Link>
        </p>
      </section>
    </main>
  );
}
