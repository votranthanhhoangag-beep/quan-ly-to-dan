import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AuthGate({ children }: { children: ReactNode }) {
  const { status, user, error, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  if (status === 'loading') {
    return <main role="status" style={screenStyle}>Đang kiểm tra phiên đăng nhập...</main>;
  }

  if (status === 'configuration_error') {
    return (
      <main style={screenStyle}>
        <section style={cardStyle}>
          <h1 style={headingStyle}>Chưa cấu hình đăng nhập</h1>
          <p>Hãy khai báo <code>VITE_SUPABASE_URL</code> và <code>VITE_SUPABASE_ANON_KEY</code> trong môi trường triển khai, sau đó chạy migration Supabase.</p>
        </section>
      </main>
    );
  }

  if (status === 'profile_error') {
    return (
      <main style={screenStyle}>
        <section style={cardStyle}>
          <h1 style={headingStyle}>Không thể xác minh quyền tài khoản</h1>
          <p role="alert">{error}</p>
          <p>Tài khoản chưa được cấp quyền hợp lệ; không thể truy cập dữ liệu ERP.</p>
        </section>
      </main>
    );
  }

  if (status !== 'ready' || !user) {
    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitting(true);
      setFormError('');
      try {
        await signIn(email, password);
      } catch (signInError) {
        setFormError(signInError instanceof Error ? signInError.message : 'Không thể đăng nhập.');
      } finally {
        setSubmitting(false);
      }
    };
    return (
      <main style={screenStyle}>
        <form onSubmit={handleSubmit} style={cardStyle}>
          <h1 style={headingStyle}>Đăng nhập ERP Lục Bình</h1>
          <label style={labelStyle}>Email
            <input autoComplete="username" type="email" required value={email} onChange={event => setEmail(event.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>Mật khẩu
            <input autoComplete="current-password" type="password" required value={password} onChange={event => setPassword(event.target.value)} style={inputStyle} />
          </label>
          {(formError || error) && <p role="alert" style={{ color: '#b91c1c', margin: 0 }}>{formError || error}</p>}
          <button type="submit" disabled={submitting} style={buttonStyle}>{submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
          <p style={{ margin: 0, textAlign: 'center', fontSize: '14px' }}>
            Chưa có xưởng? <Link to="/register" style={{ color: '#1d4ed8', fontWeight: 700 }}>Đăng ký xưởng mới</Link>
          </p>
        </form>
      </main>
    );
  }
  return children;
}

const screenStyle = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: '24px',
  boxSizing: 'border-box' as const,
  backgroundColor: '#f8fafc',
  color: '#334155'
};
const cardStyle = {
  width: 'min(100%, 440px)',
  display: 'grid',
  gap: '16px',
  padding: '24px',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  backgroundColor: '#fff',
  boxShadow: '0 1px 5px rgba(15, 23, 42, .08)'
};
const headingStyle = { margin: 0, color: '#0f172a', fontSize: '21px' };
const labelStyle = { display: 'grid', gap: '6px', color: '#334155', fontWeight: 700 };
const inputStyle = { padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' };
const buttonStyle = { padding: '11px 14px', border: 0, borderRadius: '7px', backgroundColor: '#2563eb', color: '#fff', fontWeight: 800, cursor: 'pointer' };
