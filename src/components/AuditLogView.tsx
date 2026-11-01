import { useEffect, useState } from 'react';
import { readAuditLogs, type AuditLogEntry } from '../services/auditLog';
import { supabase } from '../services/supabaseClient';

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
  const [logs, setLogs] = useState<AuditLogEntry[]>(readAuditLogs);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    const refresh = () => setLogs(readAuditLogs());
    window.addEventListener('erp:audit-log-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('erp:audit-log-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('audit_logs')
          .select('id, event_id, actor_user_id, username, role, action_type, module_name, description, target_id, created_at')
          .order('created_at', { ascending: false })
          .limit(1000);
        if (!active) return;
        if (error) {
          console.error('Không thể tải nhật ký từ Supabase:', error);
          setServerError('Không thể tải nhật ký máy chủ. Đang hiển thị nhật ký cục bộ.');
          return;
        }
        const cloudLogs: AuditLogEntry[] = (data || []).map(item => ({
          id: item.event_id || `server-${item.id}`,
          timestamp: item.created_at,
          userId: item.actor_user_id,
          username: item.username,
          role: item.role,
          actionType: item.action_type as AuditLogEntry['actionType'],
          moduleName: item.module_name,
          description: item.description,
          targetId: item.target_id
        }));
        const localLogs = readAuditLogs();
        const merged = new Map<string, AuditLogEntry>();
        [...cloudLogs, ...localLogs].forEach(log => {
          const key = log.id || `${log.timestamp}|${log.userId}|${log.actionType}|${log.moduleName}|${log.targetId}`;
          if (!merged.has(key)) merged.set(key, log);
        });
        setLogs(Array.from(merged.values()).sort((first, second) =>
          second.timestamp.localeCompare(first.timestamp)
        ));
        setServerError('');
      } catch (error) {
        if (!active) return;
        console.error('Không thể truy vấn nhật ký Supabase:', error);
        setServerError('Không thể tải nhật ký máy chủ. Đang hiển thị nhật ký cục bộ.');
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <section style={{ display: 'grid', gap: '14px' }}>
      <header>
        <h2 style={{ margin: '0 0 5px', color: '#0f172a', fontSize: '21px' }}>Lịch Sử Thao Tác Hệ Thống</h2>
        <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>Nhật ký được hiển thị mới nhất trước. Bản cục bộ giới hạn 1.000 sự kiện.</p>
        {serverError && <p role="alert" style={{ margin: '8px 0 0', color: '#b91c1c', fontSize: '13px' }}>{serverError}</p>}
      </header>
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '9px', backgroundColor: '#fff' }}>
        <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', fontSize: '13px' }}>
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
            {logs.length === 0 && <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>Chưa có thao tác được ghi nhận trên thiết bị này.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const cellStyle = { padding: '9px 10px', color: '#334155', verticalAlign: 'top' as const };
