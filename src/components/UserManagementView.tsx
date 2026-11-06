import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useAuth, type UserRole } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';
import { getInternalEmail } from '../utils/username';

interface ManagedUser {
  user_id: string;
  username: string;
  role: UserRole;
  auth_created_at: string | null;
  account_status: 'active' | 'pending_verification' | 'suspended';
}

const roleLabels: Record<UserRole, string> = {
  admin: 'Quản trị viên',
  ke_toan: 'Kế toán',
  kho_to_dan: 'Tổ trưởng / Thủ kho'
};

const roleDescriptions: Record<UserRole, string> = {
  admin: 'Toàn quyền quản trị, xóa hợp đồng, quản lý tài khoản & cài đặt hệ thống.',
  ke_toan: 'Quản lý HĐ Cty, HĐ Tổ đan, thu chi tiền cọc, phiếu chi, doanh thu & chi phí.',
  kho_to_dan: 'Quản lý xuất nhập hàng đan, giao nhận khung sơn, báo cáo NXT kho & vật tư.'
};

const statusLabels: Record<ManagedUser['account_status'], { label: string; bg: string; color: string }> = {
  active: { label: 'Hoạt động', bg: '#dcfce7', color: '#15803d' },
  pending_verification: { label: 'Chờ xác thực', bg: '#fef3c7', color: '#b45309' },
  suspended: { label: 'Tạm khóa', bg: '#fee2e2', color: '#b91c1c' }
};

const formatCreatedAt = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('vi-VN');
};

const normalizeManagedUsers = (value: unknown): ManagedUser[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row: unknown) => {
    if (!row || typeof row !== 'object') return [];
    const profile = row as Record<string, unknown>;
    if (typeof profile.user_id !== 'string') return [];

    const role: UserRole = profile.role === 'admin' || profile.role === 'ke_toan' || profile.role === 'kho_to_dan'
      ? profile.role
      : 'kho_to_dan';
    const accountStatus: ManagedUser['account_status'] =
      profile.account_status === 'pending_verification' || profile.account_status === 'suspended'
        ? profile.account_status
        : 'active';
    const username = typeof profile.username === 'string' ? profile.username : '';

    return [{
      user_id: profile.user_id,
      username,
      role,
      auth_created_at: typeof profile.auth_created_at === 'string'
        ? profile.auth_created_at
        : typeof profile.created_at === 'string' ? profile.created_at : null,
      account_status: accountStatus
    }];
  });
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
  const [newPassword, setNewPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('ke_toan');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const isAdmin = user?.role === 'admin';

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      if (!supabase) throw new Error('Supabase chưa được cấu hình.');

      let profiles: ManagedUser[] = [];
      const { data, error: queryError } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (queryError) {
        // Fallback nếu câu query bị lỗi do thiếu cột
        const { data: basicData, error: basicError } = await supabase
          .from('user_profiles')
          .select('user_id, username, role');
        if (basicError) throw basicError;
        profiles = normalizeManagedUsers(basicData);
      } else {
        profiles = normalizeManagedUsers(data);
      }

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
    void Promise.resolve().then(fetchUsers);
  }, [fetchUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const username = newUsername.trim();
    if (!username || !newPassword.trim()) {
      setCreateError('Vui lòng nhập tên đăng nhập, mật khẩu và chọn vai trò.');
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
      const internalEmail = getInternalEmail(username);

      // Tạo client tạm thời không lưu session để không làm Admin bị đăng xuất
      const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });

      const { data: authData, error: authError } = await tempClient.auth.signUp({
        email: internalEmail,
        password: newPassword,
        options: { data: { username } }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Không thể tạo tài khoản người dùng.');
      if (authData.user.identities?.length === 0) {
        throw new Error('Tên đăng nhập này đã được sử dụng. Vui lòng chọn tên khác.');
      }

      if (!supabase) throw new Error('Supabase chưa được cấu hình.');
      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({ username, role: newRole })
        .eq('user_id', authData.user.id)
        .select('user_id')
        .single();
      if (profileError) throw profileError;

      setNotice(`✅ Đã tạo tài khoản "${username}" thành công với vai trò ${roleLabels[newRole]}.`);
      setIsCreateModalOpen(false);
      setNewPassword('');
      setNewUsername('');
      setNewRole('ke_toan');
      await fetchUsers();
    } catch (err: unknown) {
      console.error('Lỗi tạo người dùng:', err);
      const message = err instanceof Error ? err.message : '';
      setCreateError(
        message.includes('đã được sử dụng') ||
        /already registered|already exists|duplicate key/i.test(message)
          ? 'Tên đăng nhập này đã được sử dụng. Vui lòng chọn tên khác.'
          : message.startsWith('Tên đăng nhập') ||
            message.startsWith('Mật khẩu') ||
            message.startsWith('Vui lòng') ||
            message.startsWith('Supabase')
            ? message
            : 'Không thể tạo tài khoản. Vui lòng kiểm tra quyền quản lý người dùng và kết nối Supabase.'
      );
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
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ role })
        .eq('user_id', target.user_id);

      if (updateError) throw updateError;

      setUsers(current => current.map(profile =>
        profile.user_id === target.user_id ? { ...profile, role } : profile
      ));
      setDraftRoles(current => ({ ...current, [target.user_id]: role }));
      setNotice(`Đã cập nhật vai trò của ${target.username} thành ${roleLabels[role]}.`);
    } catch (saveError) {
      console.error('Không thể cập nhật vai trò người dùng:', saveError);
      setError(saveError instanceof Error ? saveError.message : 'Không thể cập nhật vai trò người dùng.');
    } finally {
      setSavingUserId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: '20px', borderRadius: '10px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '14px', fontWeight: 600 }}>
        Bạn không có quyền quản lý người dùng. Chỉ có Quản trị viên (Admin) mới có quyền truy cập màn hình này.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: '#0f172a' }}>👥 Quản Lý Người Dùng & Phân Quyền</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Tạo tài khoản phụ (Kế toán, Thủ kho/Tổ trưởng) và phân quyền truy cập hệ thống.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              setCreateError('');
              setIsCreateModalOpen(true);
            }}
            style={{ padding: '9px 16px', borderRadius: '8px', backgroundColor: '#2563eb', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            ➕ Tạo người dùng mới
          </button>
          <button
            type="button"
            onClick={() => void fetchUsers()}
            disabled={loading}
            style={{ padding: '9px 14px', borderRadius: '8px', backgroundColor: '#fff', color: '#334155', border: '1px solid #cbd5e1', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
          >
            {loading ? 'Đang tải...' : '🔄 Làm mới'}
          </button>
        </div>
      </div>

      {/* TÓM TẮT QUYỀN HẠN CÁC VAI TRÒ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
        {(Object.keys(roleLabels) as UserRole[]).map(r => (
          <div key={r} style={{ padding: '14px', backgroundColor: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1e40af' }}>{roleLabels[r]}</div>
            <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px', lineHeight: 1.4 }}>{roleDescriptions[r]}</div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠️ {error}</span>
          <span style={{ fontSize: '11px', color: '#b91c1c' }}>(Hãy dán đoạn lệnh SQL vào Tab Supabase đang mở để sửa triệt để)</span>
        </div>
      )}
      {notice && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', fontSize: '13px', fontWeight: 600 }}>
          {notice}
        </div>
      )}

      {/* DANH SÁCH TÀI KHOẢN */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#0f172a' }}>Danh sách tài khoản ({users.length})</h2>
          <span style={{ fontSize: '12px', color: '#64748b' }}>Bấm "Lưu vai trò" sau khi đổi quyền</span>
        </div>

        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #cbd5e1', color: '#475569' }}>
              <th style={{ padding: '10px 14px', fontWeight: 600 }}>Tên đăng nhập / Tên hiển thị</th>
              <th style={{ padding: '10px 14px', fontWeight: 600 }}>Vai trò / Phân quyền</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Ngày tạo</th>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Trạng thái</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>Đang tải danh sách tài khoản...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>Chưa có hồ sơ người dùng nào trong cơ sở dữ liệu. Bấm "➕ Tạo người dùng mới" để bắt đầu!</td></tr>
              ) : users.map(profile => {
                const status = statusLabels[profile.account_status] || statusLabels.active;
                const isSelf = profile.user_id === user?.id;
                const roleChanged = draftRoles[profile.user_id] !== profile.role;
                return (
                  <tr key={profile.user_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>{profile.username}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <select
                        value={draftRoles[profile.user_id] || profile.role}
                        disabled={isSelf || savingUserId === profile.user_id}
                        onChange={event => setDraftRoles(current => ({
                          ...current,
                          [profile.user_id]: event.target.value as UserRole
                        }))}
                        style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', backgroundColor: isSelf ? '#f1f5f9' : '#fff', fontWeight: 600 }}
                      >
                        {(Object.keys(roleLabels) as UserRole[]).map(role => (
                          <option key={role} value={role}>{roleLabels[role]}</option>
                        ))}
                      </select>
                      {isSelf && <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 'bold', color: '#2563eb' }}>(Đang đăng nhập)</span>}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#64748b' }}>{profile.auth_created_at ? formatCreatedAt(profile.auth_created_at) : '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 'bold', backgroundColor: status.bg, color: status.color }}>
                        {status.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => void saveRole(profile)}
                        disabled={!roleChanged || isSelf || savingUserId === profile.user_id}
                        style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', backgroundColor: roleChanged && !isSelf ? '#2563eb' : '#e2e8f0', color: roleChanged && !isSelf ? '#fff' : '#94a3b8', fontSize: '12px', fontWeight: 'bold', cursor: roleChanged && !isSelf ? 'pointer' : 'not-allowed' }}
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
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>Tên đăng nhập / Tên hiển thị:</label>
                <input
                  type="text"
                  required
                  autoComplete="username"
                  placeholder="VD: Nguyễn Văn A"
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>Mật khẩu khởi tạo (tối thiểu 6 ký tự):</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="Nhập mật khẩu..."
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
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
                  <option value="admin">Quản trị viên</option>
                  <option value="ke_toan">Kế toán</option>
                  <option value="kho_to_dan">Tổ trưởng / Thủ kho</option>
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
    </div>
  );
}
