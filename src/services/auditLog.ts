import type { AuthenticatedUser } from '../context/AuthContext';
import { supabase } from './supabaseClient';

const AUDIT_STORAGE_KEY = 'erp_audit_logs';
const PENDING_AUDIT_KEY = 'erp_pending_audit_logs';
const MAX_LOCAL_AUDIT_RECORDS = 1000;
let auditFlush: Promise<void> | null = null;

export type AuditActionType = 'CREATE' | 'UPDATE' | 'DELETE';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  username: string;
  role: string;
  actionType: AuditActionType;
  moduleName: string;
  description: string;
  targetId: string;
}

const createEventId = () => globalThis.crypto?.randomUUID?.() ||
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.random() * 16 | 0;
    return (character === 'x' ? random : (random & 0x3 | 0x8)).toString(16);
  });

export const readAuditLogs = (): AuditLogEntry[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(AUDIT_STORAGE_KEY) || '[]');
    if (!Array.isArray(value)) throw new Error('Dữ liệu nhật ký cục bộ không đúng định dạng.');
    return value.filter((item): item is AuditLogEntry =>
      item !== null &&
      typeof item === 'object' &&
      typeof item.timestamp === 'string' &&
      typeof item.username === 'string' &&
      typeof item.moduleName === 'string' &&
      typeof item.actionType === 'string'
    );
  } catch (error) {
    console.error('Không thể đọc nhật ký thao tác:', error);
    return [];
  }
};

const readPendingAuditLogs = (): AuditLogEntry[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PENDING_AUDIT_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item): item is AuditLogEntry =>
      item !== null && typeof item === 'object' &&
      typeof item.id === 'string' && typeof item.timestamp === 'string' &&
      typeof item.actionType === 'string' && typeof item.moduleName === 'string'
    ) : [];
  } catch (error) {
    console.error('Không thể đọc hàng đợi nhật ký thao tác:', error);
    return [];
  }
};

const writePendingAuditLogs = (entries: AuditLogEntry[]) => {
  try {
    if (entries.length) localStorage.setItem(PENDING_AUDIT_KEY, JSON.stringify(entries));
    else localStorage.removeItem(PENDING_AUDIT_KEY);
  } catch (error) {
    console.error('Không thể lưu hàng đợi nhật ký thao tác:', error);
    window.dispatchEvent(new CustomEvent('erp:audit-log-error', {
      detail: 'Không thể lưu hàng đợi nhật ký trên thiết bị.'
    }));
  }
};

const flushPendingAuditLogs = async () => {
  if (auditFlush) return auditFlush;
  if (!supabase || !navigator.onLine) return;
  auditFlush = (async () => {
    while (navigator.onLine) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const entry = readPendingAuditLogs().find(item => item.userId === user.id);
      if (!entry) return;
      const { error } = await supabase.rpc('write_audit_log', {
        p_event_id: entry.id,
        p_actor_user_id: entry.userId,
        p_action_type: entry.actionType,
        p_module_name: entry.moduleName,
        p_description: entry.description,
        p_target_id: entry.targetId
      }).abortSignal(AbortSignal.timeout(8000));
      if (error) throw error;
      writePendingAuditLogs(readPendingAuditLogs().filter(item => item.id !== entry.id));
    }
  })().catch(error => {
    console.error('Không thể đồng bộ hàng đợi nhật ký lên Supabase:', error);
    window.dispatchEvent(new CustomEvent('erp:audit-log-error', {
      detail: 'Nhật ký được giữ trên thiết bị nhưng chưa đồng bộ được lên Supabase.'
    }));
  }).finally(() => {
    auditFlush = null;
  });
  return auditFlush;
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushPendingAuditLogs(); });
  window.addEventListener('erp:auth-ready', () => { void flushPendingAuditLogs(); });
}

export const logAction = (
  user: AuthenticatedUser,
  actionType: AuditActionType,
  moduleName: string,
  description: string,
  targetId: string | number
) => {
  const entry: AuditLogEntry = {
    id: createEventId(),
    timestamp: new Date().toISOString(),
    userId: user.id,
    username: user.username,
    role: user.role,
    actionType,
    moduleName,
    description,
    targetId: String(targetId)
  };

  try {
    const logs = readAuditLogs();
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify([entry, ...logs].slice(0, MAX_LOCAL_AUDIT_RECORDS)));
    window.dispatchEvent(new CustomEvent('erp:audit-log-updated'));
  } catch (error) {
    console.error('Không thể lưu nhật ký thao tác trên thiết bị:', error);
    window.dispatchEvent(new CustomEvent('erp:audit-log-error', {
      detail: 'Không thể lưu nhật ký trên thiết bị. Hãy kiểm tra dung lượng trình duyệt.'
    }));
  }

  if (supabase) {
    const pending = readPendingAuditLogs();
    if (!pending.some(item => item.id === entry.id)) {
      writePendingAuditLogs([entry, ...pending]);
    }
    void flushPendingAuditLogs();
  }
  return entry;
};
