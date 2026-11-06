import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAuditLogs, type AuditLogEntry } from '../services/auditLog';

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const actionLabels: Record<string, string> = {
  CREATE: 'Tạo mới',
  UPDATE: 'Chỉnh sửa',
  DELETE: 'Xóa'
};

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN');
};

export default function AuditLogView() {
  const [selectedDate, setSelectedDate] = useState(() => toDateInputValue(new Date()));
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [serverError, setServerError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setIsLoading(true);
    setServerError('');
    try {
      const results = await fetchAuditLogs(selectedDate);
      if (currentRequestId === requestId.current) setLogs(results);
    } catch (error) {
      if (currentRequestId !== requestId.current) return;
      console.error('Không thể tải nhật ký từ Supabase:', error);
      setServerError(error instanceof Error
        ? `Không thể tải nhật ký từ Supabase: ${error.message}`
        : 'Không thể tải nhật ký từ Supabase.');
    } finally {
      if (currentRequestId === requestId.current) setIsLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refresh(), 0);
    window.addEventListener('erp:audit-log-updated', refresh);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener('erp:audit-log-updated', refresh);
    };
  }, [refresh]);

  const selectRelativeDate = (daysAgo: number) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const value = toDateInputValue(date);
    if (value === selectedDate) {
      void refresh();
    } else {
      setSelectedDate(value);
    }
  };

  return (
    <section style={{ display: 'grid', gap: '14px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: '0 0 5px', color: '#0f172a', fontSize: '21px' }}>Lịch Sử Thao Tác Hệ Thống</h2>
          <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>Nhật ký trong ngày được truy vấn trực tiếp từ Supabase, mới nhất trước.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <label htmlFor="audit-log-date" style={{ color: '#334155', fontSize: '13px', fontWeight: 700 }}>Ngày:</label>
          <input
            id="audit-log-date"
            type="date"
            required
            value={selectedDate}
            onChange={event => setSelectedDate(event.target.value)}
            style={{ minHeight: '36px', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#334155' }}
          />
          <button
            type="button"
            onClick={() => selectRelativeDate(0)}
            style={dateButtonStyle}
          >
            Hôm nay
          </button>
          <button
            type="button"
            onClick={() => selectRelativeDate(1)}
            style={dateButtonStyle}
          >
            Hôm qua
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isLoading}
            style={{ ...dateButtonStyle, cursor: isLoading ? 'wait' : 'pointer' }}
          >
            {isLoading ? 'Đang tải...' : 'Làm mới'}
          </button>
        </div>
        {serverError && <p role="alert" style={{ flexBasis: '100%', margin: 0, color: '#b91c1c', fontSize: '13px' }}>{serverError}</p>}
      </header>
      <div className="block touch-pan-x select-none overflow-x-auto w-full shadow-sm rounded-lg border border-gray-200 erp-table-scroll" style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '9px', backgroundColor: '#fff' }}>
        <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', fontSize: '13px' }} className="min-w-[950px] w-full">
          <thead>
            <tr>
              {['Thời gian', 'Người thực hiện', 'Vai trò', 'Thao tác', 'Phân hệ', 'Mã đối tượng', 'Chi tiết'].map(label => (
                <th key={label} style={{ padding: '10px', textAlign: 'left', color: '#334155', backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={cellStyle}>{formatTimestamp(log.timestamp)}</td>
                <td style={cellStyle}>{log.username}</td>
                <td style={cellStyle}>{log.role}</td>
                <td style={cellStyle}>{actionLabels[log.actionType] || log.actionType}</td>
                <td style={cellStyle}>{log.moduleName}</td>
                <td style={cellStyle}>{log.targetId}</td>
                <td style={cellStyle}>{log.description}</td>
              </tr>
            ))}
            {!isLoading && logs.length === 0 && !serverError && <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>Chưa có thao tác được ghi nhận.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const dateButtonStyle = {
  minHeight: '36px',
  padding: '7px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  backgroundColor: '#fff',
  color: '#334155',
  fontWeight: 700,
  cursor: 'pointer'
};

const cellStyle = { padding: '9px 10px', color: '#334155', verticalAlign: 'top' as const };
