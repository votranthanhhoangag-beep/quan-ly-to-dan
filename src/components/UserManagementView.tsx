import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useAuth, type UserRole } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';

interface ManagedUser {
  user_id: string;
  email: string | null;
  username: string;
  role: UserRole;
  auth_created_at: string | null;
  account_status: 'active' | 'pending_verification' | 'suspended';
}

const roleLabels: Record<UserRole, string> = {
  admin: 'Admin (Toàn quyền)',
  ke_toan: 'Kế toán',
  kho_to_dan: 'Tổ trưởng / Thủ kho'
};

const roleDescriptions: Record<UserRole, string> = {
  admin: 'Toàn quyền quản trị, xóa hợp đồng, quản lý tài khoản & cài đặt hệ thống.',
  ke_toan: 'Quản lý HĐ Cty, HĐ Tổ đan, thu chi tiền cọc, phiếu chi, doanh thu & chi phí.',
  kho_to_dan: 'Quản lý xuất nhập hàng đan, giao nhận khung sơn, báo cáo NXT kho & vật tư.'
};

const statusLabels: Record<ManagedUser['account_status'], { label: string; className: string }> = {
  active: { label: 'Hoạt động', className: 'bg-green-50 text-green-700 ring-green-600/20' },
  pending_verification: { label: 'Chờ xác thực', className: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  suspended: { label: 'Tạm khóa', className: 'bg-red-50 text-red-700 ring-red-600/20' }
};

const formatCreatedAt = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('vi-VN');
};

export default function UserManagementView() {
  const { user } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [draftRoles, setDraftRoles] = useState<Record<string, UserRole>>({});
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Form tạo user phụ mới
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('ke_toan');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const isAdmin = user?.role === 'admin';

  const loadUsers = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      if (!supabase) throw new Error('Supabase chưa được cấu hình.');
      const { data, error: queryError } = await supabase
        .from('user_profiles')
        .select('user_id, email, username, role, auth_created_at, account_status')
        .order('created_at', { ascending: false })
        .abortSignal(AbortSignal.timeout(8000));

      if (queryError) throw queryError;
      const profiles = (data || []) as ManagedUser[];
      setUsers(profiles);
      setDraftRoles(Object.fromEntries(profiles.map(profile => [profile.user_id, profile.role])));
    } catch (loadError) {
      console.error('Không thể tải danh sách người dùng:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Không thể tải danh sách người dùng.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void Promise.resolve().then(loadUsers);
  }, [loadUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newPassword || !newUsername) {
      setCreateError('Vui lòng điền đầy đủ email, mật khẩu và tên hiển thị.');
      return;
    }
    if (newPassword.length < 6) {
      setCreateError('Mật khẩu tối thiểu phải 6 ký tự.');
      return;
    }
    setIsCreating(true);
    setCreateError('');
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
      if (!supabaseUrl || !supabaseAnonKey) throw new Error('Chưa cấu hình Supabase URL/Key.');

      // Tạo client tạm thời không lưu session để không làm Admin bị đăng xuất
      const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });

      const { data: authData, error: authError } = await tempClient.auth.signUp({
        email: newEmail.trim(),
        password: newPassword,
        options: {
          data: {
            username: newUsername.trim(),
            role: newRole
          }
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Không thể tạo tài khoản người dùng.');

      // Cập nhật ngay vào user_profiles
      if (supabase) {
        await supabase.from('user_profiles').upsert({
          user_id: authData.user.id,
          username: newUsername.trim(),
          role: newRole,
          email: newEmail.trim(),
          account_status: 'active'
        });
      }

      setNotice(`✅ Đã tạo tài khoản ${newEmail.trim()} thành công với vai trò: ${roleLabels[newRole]}!`);
      setIsCreateModalOpen(false);
      setNewEmail('');
      setNewPassword('');
      setNewUsername('');
      setNewRole('ke_toan');
      await loadUsers();
    } catch (err: any) {
      console.error('Lỗi tạo người dùng:', err);
      setCreateError(err.message || 'Lỗi khi tạo tài khoản người dùng.');
    } finally {
      setIsCreating(false);
    }
  };

  const saveRole = async (target: ManagedUser) => {
    const role = draftRoles[target.user_id];
    if (!role || role === target.role) return;
    if (!isAdmin || target.user_id === user?.id) {
      setError('Không thể thay đổi vai trò của tài khoản đang đăng nhập.');
      return;
    }

    const adminCount = users.filter(profile => profile.role === 'admin').length;
    if (target.role === 'admin' && role !== 'admin' && adminCount <= 1) {
      setError('Không thể hạ quyền Admin cuối cùng. Hãy cấp quyền Admin cho tài khoản khác trước.');
      return;
    }

    setSavingUserId(target.user_id);
    setError('');
    setNotice('');
    try {
      if (!supabase) throw new Error('Supabase chưa được cấu hình.');
      const { data, error: updateError } = await supabase
        .from('user_profiles')
        .update({ role })
        .eq('user_id', target.user_id)
        .select('user_id, email, username, role, auth_created_at, account_status')
        .single();

      if (updateError) throw updateError;
      if (!data) throw new Error('Supabase không trả về hồ sơ đã cập nhật.');

      const updatedProfile = data as ManagedUser;
      setUsers(current => current.map(profile =>
        profile.user_id === target.user_id ? updatedProfile : profile
      ));
      setDraftRoles(current => ({ ...current, [target.user_id]: updatedProfile.role }));
      setNotice(`Đã cập nhật vai trò của ${target.email || target.username} thành ${roleLabels[role]}.`);
    } catch (saveError) {
      console.error('Không thể cập nhật vai trò người dùng:', saveError);
      setError(saveError instanceof Error ? saveError.message : 'Không thể cập nhật vai trò người dùng.');
    } finally {
      setSavingUserId(null);
    }
  };

  if (!isAdmin) {
    return (
      <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-800">
        Bạn không có quyền quản lý người dùng. Chỉ có Quản trị viên (Admin) mới có quyền truy cập màn hình này.
      </section>
    );
  }

  return (
    <section className="grid w-full gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Quản lý người dùng & Phân quyền</h1>
          <p className="mt-1 text-sm text-slate-600">Tạo tài khoản phụ (Kế toán, Thủ kho/Tổ trưởng) và phân quyền truy cập hệ thống.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setCreateError('');
              setIsCreateModalOpen(true);
            }}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 cursor-pointer"
          >
            ➕ Tạo người dùng mới
          </button>
          <button
            type="button"
            onClick={() => void loadUsers()}
            disabled={loading}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? 'Đang tải...' : '🔄 Làm mới'}
          </button>
        </div>
      </header>

      {/* TÓM TẮT QUYỀN HẠN CÁC VAI TRÒ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(Object.keys(roleLabels) as UserRole[]).map(r => (
          <div key={r} className="p-3 bg-white rounded-lg border border-slate-200 shadow-xs">
            <div className="font-bold text-sm text-blue-700">{roleLabels[r]}</div>
            <div className="text-xs text-slate-600 mt-1">{roleDescriptions[r]}</div>
          </div>
        ))}
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}

      {/* DANH SÁCH NGƯỜI DÙNG */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:px-5">
          <h2 className="text-base font-bold text-slate-900">Danh sách tài khoản ({users.length})</h2>
          <span className="text-xs text-slate-500">Bấm "Lưu vai trò" sau khi đổi quyền của tài khoản</span>
        </div>
        <div className="block touch-pan-x overflow-x-auto w-full erp-table-scroll">
          <table className="w-full text-left text-sm divide-y divide-slate-200" style={{ minWidth: '750px' }}>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Email</th>
                <th scope="col" className="px-4 py-3 font-semibold">Tên hiển thị</th>
                <th scope="col" className="px-4 py-3 font-semibold">Vai trò / Phân quyền</th>
                <th scope="col" className="px-4 py-3 font-semibold">Ngày tạo</th>
                <th scope="col" className="px-4 py-3 font-semibold">Trạng thái</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Đang tải danh sách tài khoản...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Chưa có hồ sơ người dùng nào trong cơ sở dữ liệu.</td></tr>
              ) : users.map(profile => {
                const status = statusLabels[profile.account_status] || statusLabels.active;
                const isSelf = profile.user_id === user?.id;
                const roleChanged = draftRoles[profile.user_id] !== profile.role;
                return (
                  <tr key={profile.user_id} className="align-middle hover:bg-slate-50/70">
                    <td className="max-w-64 break-all px-4 py-3 font-medium text-slate-800">{profile.email || '—'}</td>
                    <td className="px-4 py-3 text-slate-700 font-semibold">{profile.username}</td>
                    <td className="px-4 py-3">
                      <select
                        aria-label={`Vai trò của ${profile.email || profile.username}`}
                        value={draftRoles[profile.user_id] || profile.role}
                        disabled={isSelf || savingUserId === profile.user_id}
                        onChange={event => setDraftRoles(current => ({
                          ...current,
                          [profile.user_id]: event.target.value as UserRole
                        }))}
                        className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100 disabled:text-slate-500"
                      >
                        {(Object.keys(roleLabels) as UserRole[]).map(role => (
                          <option key={role} value={role}>{roleLabels[role]}</option>
                        ))}
                      </select>
                      {isSelf && <span className="ml-2 text-xs font-bold text-blue-600">(Đang đăng nhập)</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{profile.auth_created_at ? formatCreatedAt(profile.auth_created_at) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void saveRole(profile)}
                        disabled={!roleChanged || isSelf || savingUserId === profile.user_id}
                        className="min-h-8 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                      >
                        {savingUserId === profile.user_id ? 'Đang lưu...' : 'Lưu vai trò'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL TẠO NGƯỜI DÙNG PHỤ MỚI */}
      {isCreateModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', width: '100%', maxWidth: '480px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>➕ Tạo Tài Khoản Phụ Mới</h3>
              <button type="button" onClick={() => setIsCreateModalOpen(false)} style={{ border: 'none', background: 'transparent', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            {createError && (
              <div style={{ padding: '10px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#b91c1c', fontSize: '13px', marginBottom: '14px' }}>
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>Email đăng nhập:</label>
                <input
                  type="email"
                  required
                  placeholder="VD: ketoan@lucbinh.com"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>Mật khẩu khởi tạo (tối thiểu 6 ký tự):</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Nhập mật khẩu..."
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>Tên hiển thị / Họ tên:</label>
                <input
                  type="text"
                  required
                  placeholder="VD: Nguyễn Văn A (Kế toán)"
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>Vai trò / Phân quyền:</label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value as UserRole)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box', backgroundColor: '#fff' }}
                >
                  <option value="ke_toan">Kế toán (Quản lý hợp đồng, doanh thu, thu chi, báo cáo)</option>
                  <option value="kho_to_dan">Tổ trưởng / Thủ kho (Quản lý xuất nhập, giao nhận khung, tồn kho)</option>
                  <option value="admin">Admin (Toàn quyền quản trị hệ thống)</option>
                </select>
                <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#64748b' }}>
                  {roleDescriptions[newRole]}
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  style={{ padding: '9px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', color: '#475569', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  style={{ padding: '9px 18px', borderRadius: '6px', border: 'none', backgroundColor: '#2563eb', color: '#fff', fontSize: '13px', fontWeight: 'bold', cursor: isCreating ? 'wait' : 'pointer', opacity: isCreating ? 0.7 : 1 }}
                >
                  {isCreating ? '⏳ Đang tạo tài khoản...' : '💾 Tạo tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
