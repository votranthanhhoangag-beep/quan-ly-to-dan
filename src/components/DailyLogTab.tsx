import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';

type DailyLogAction =
  | 'CREATE_IMPORT'
  | 'CREATE_EXPORT'
  | 'CREATE_RECEIPT'
  | 'CREATE_PAYMENT'
  | 'CUSTOM_NOTE';

interface DailyLog {
  id: string;
  user_id: string | null;
  organization_id: string;
  user_email: string;
  action_type: DailyLogAction;
  title: string;
  description: string | null;
  reference_id: string | null;
  created_at: string;
}

const actionPresentation: Record<DailyLogAction, { label: string; badgeClass: string }> = {
  CREATE_IMPORT: { label: 'Phiếu Nhập', badgeClass: 'bg-blue-100 text-blue-800 ring-blue-600/20' },
  CREATE_EXPORT: { label: 'Phiếu Xuất', badgeClass: 'bg-orange-100 text-orange-800 ring-orange-600/20' },
  CREATE_RECEIPT: { label: 'Phiếu Thu', badgeClass: 'bg-green-100 text-green-800 ring-green-600/20' },
  CREATE_PAYMENT: { label: 'Phiếu Chi', badgeClass: 'bg-red-100 text-red-800 ring-red-600/20' },
  CUSTOM_NOTE: { label: 'Ghi Chú', badgeClass: 'bg-purple-100 text-purple-800 ring-purple-600/20' }
};

const getLocalDateInputValue = () => {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
};

const getSelectedDayRange = (dateValue: string) => {
  const [year, month, day] = dateValue.split('-').map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day + 1);
  return { start: start.toISOString(), end: end.toISOString() };
};

const getSelectedDateTimestamp = (dateValue: string) => {
  const [year, month, day] = dateValue.split('-').map(Number);
  const now = new Date();
  return new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
};

const formatTimestamp = (value: string) =>
  new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

export default function DailyLogTab() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(getLocalDateInputValue);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<{ date: string; message: string } | null>(null);
  const [formError, setFormError] = useState('');

  const loadLogs = useCallback(async (dateValue: string, isActive: () => boolean = () => true) => {
    try {
      if (!supabase) throw new Error('Supabase chưa được cấu hình.');
      if (!user?.organizationId) throw new Error('Không xác định được công ty đang đăng nhập.');
      const { start, end } = getSelectedDayRange(dateValue);
      const { data, error: queryError } = await supabase
        .from('daily_logs')
        .select('id, user_id, organization_id, user_email, action_type, title, description, reference_id, created_at')
        .eq('organization_id', user.organizationId)
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: false })
        .abortSignal(AbortSignal.timeout(8000));

      if (queryError) throw queryError;
      if (isActive()) {
        setLogs((data || []) as DailyLog[]);
        setLoadError(null);
        setLoadedDate(dateValue);
      }
    } catch (loadError) {
      console.error('Không thể tải nhật ký công việc:', loadError);
      if (isActive()) {
        setLogs([]);
        setLoadError({
          date: dateValue,
          message: loadError instanceof Error ? loadError.message : 'Không thể tải nhật ký công việc.'
        });
        setLoadedDate(dateValue);
      }
    }
  }, [user]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => loadLogs(selectedDate, () => active));
    return () => {
      active = false;
    };
  }, [loadLogs, selectedDate]);

  const submitNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const description = note.trim();
    if (!description) {
      setFormError('Vui lòng nhập nội dung ghi chú.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      if (!supabase) throw new Error('Supabase chưa được cấu hình.');
      if (!user?.email || !user.id || !user.organizationId) {
        throw new Error('Không xác định được tài khoản hoặc công ty đang đăng nhập.');
      }

      const { data, error: insertError } = await supabase
        .from('daily_logs')
        .insert({
          organization_id: user.organizationId,
          user_id: user.id,
          user_email: user.email,
          action_type: 'CUSTOM_NOTE',
          title: 'Ghi chú công việc thủ công',
          description,
          created_at: getSelectedDateTimestamp(selectedDate)
        })
        .select('id, user_id, organization_id, user_email, action_type, title, description, reference_id, created_at')
        .single();

      if (insertError) throw insertError;
      if (!data) throw new Error('Supabase không trả về nhật ký vừa tạo.');
      setLogs(currentLogs => [(data as DailyLog), ...currentLogs]
        .sort((first, second) => second.created_at.localeCompare(first.created_at)));
      setNote('');
    } catch (saveError) {
      console.error('Không thể lưu ghi chú công việc:', saveError);
      setFormError(saveError instanceof Error ? saveError.message : 'Không thể lưu ghi chú công việc.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto grid w-full max-w-5xl gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Nhật ký công việc</h1>
          <p className="mt-1 text-sm text-slate-600">Theo dõi các phiếu phát sinh và ghi chú trong ngày.</p>
        </div>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Chọn ngày
          <input
            type="date"
            value={selectedDate}
            max={getLocalDateInputValue()}
            onChange={event => setSelectedDate(event.target.value)}
            className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </label>
      </header>

      <form onSubmit={event => void submitNote(event)} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <label htmlFor="daily-log-note" className="text-sm font-bold text-slate-800">
          Ghi chú công việc thủ công
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <textarea
            id="daily-log-note"
            value={note}
            onChange={event => setNote(event.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Nhập nhanh nội dung công việc phát sinh..."
            className="min-h-11 min-w-0 flex-1 resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <button
            type="submit"
            disabled={saving || !note.trim()}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Đang lưu...' : 'Thêm ghi chú'}
          </button>
        </div>
      </form>

      {(formError || (loadError?.date === selectedDate ? loadError.message : '')) && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {formError || loadError?.message}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:px-5">
          <h2 className="text-base font-bold text-slate-900">Các hoạt động trong ngày</h2>
          <span className="text-sm text-slate-500">{logs.length} hoạt động</span>
        </div>
        {loadedDate !== selectedDate ? (
          <p role="status" className="px-5 py-10 text-center text-sm text-slate-500">Đang tải nhật ký...</p>
        ) : logs.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Chưa có hoạt động nào trong ngày được chọn.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {logs.map(log => {
              const presentation = actionPresentation[log.action_type];
              return (
                <li key={log.id} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-start sm:gap-4 sm:px-5">
                  <time dateTime={log.created_at} className="shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-slate-500">
                    {formatTimestamp(log.created_at)}
                  </time>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${presentation.badgeClass}`}>
                        {presentation.label}
                      </span>
                      <h3 className="break-words text-sm font-semibold text-slate-900">{log.title}</h3>
                    </div>
                    {log.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{log.description}</p>}
                    <p className="mt-2 break-all text-xs text-slate-500">{log.user_email}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
