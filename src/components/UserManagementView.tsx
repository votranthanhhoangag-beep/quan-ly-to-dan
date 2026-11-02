import { useCallback, useEffect, useState } from 'react';
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
  admin: 'Admin',
  ke_toan: 'Kế toán',
  kho_to_dan: 'Tổ trưởng'
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
      setNotice(`Đã cập nhật vai trò của ${target.email || target.username}.`);
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
        Bạn không có quyền quản lý người dùng.
      </section>
    );
  }

  return (
    <section className="grid w-full gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Quản lý người dùng</h1>
          <p className="mt-1 text-sm text-slate-600">Xem hồ sơ và cập nhật vai trò truy cập hệ thống.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadUsers()}
          disabled={loading}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? 'Đang tải...' : 'Làm mới'}
        </button>
      </header>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:px-5">
          <h2 className="text-base font-bold text-slate-900">Tài khoản và phân quyền</h2>
          <span className="text-sm text-slate-500">{users.length} hồ sơ</span>
        </div>
        <div className="block touch-pan-x select-none overflow-x-auto overflow-x-auto w-full shadow-sm rounded-lg border border-gray-200 erp-table-scroll">
          <table className="min-w-[950px] w-full min-w-[850px] divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Email</th>
                <th scope="col" className="px-4 py-3 font-semibold">Tên hiển thị</th>
                <th scope="col" className="px-4 py-3 font-semibold">Vai trò</th>
                <th scope="col" className="px-4 py-3 font-semibold">Ngày tạo</th>
                <th scope="col" className="px-4 py-3 font-semibold">Trạng thái</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Đang tải danh sách...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Chưa có hồ sơ người dùng.</td></tr>
              ) : users.map(profile => {
                const status = statusLabels[profile.account_status] || statusLabels.active;
                const isSelf = profile.user_id === user?.id;
                const roleChanged = draftRoles[profile.user_id] !== profile.role;
                return (
                  <tr key={profile.user_id} className="align-middle hover:bg-slate-50/70">
                    <td className="max-w-64 break-all px-4 py-3 font-medium text-slate-800">{profile.email || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{profile.username}</td>
                    <td className="px-4 py-3">
                      <select
                        aria-label={`Vai trò của ${profile.email || profile.username}`}
                        value={draftRoles[profile.user_id] || profile.role}
                        disabled={isSelf || savingUserId === profile.user_id}
                        onChange={event => setDraftRoles(current => ({
                          ...current,
                          [profile.user_id]: event.target.value as UserRole
                        }))}
                        className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100 disabled:text-slate-500"
                      >
                        {(Object.keys(roleLabels) as UserRole[]).map(role => (
                          <option key={role} value={role}>{roleLabels[role]}</option>
                        ))}
                      </select>
                      {isSelf && <span className="ml-2 text-xs text-slate-500">Tài khoản hiện tại</span>}
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
                        className="min-h-9 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
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
    </section>
  );
}
