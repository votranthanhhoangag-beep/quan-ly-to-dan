import type { AuthenticatedUser } from '../context/AuthContext';
import { supabase } from './supabaseClient';

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

const emitAuditError = (message: string) => {
  window.dispatchEvent(new CustomEvent('erp:audit-log-error', { detail: message }));
};

export async function fetchAuditLogs(date: string): Promise<AuditLogEntry[]> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình.');
  const [year, month, day] = date.split('-').map(Number);
  const startOfDay = new Date(year, month - 1, day);
  if (
    !Number.isFinite(startOfDay.getTime()) ||
    startOfDay.getFullYear() !== year ||
    startOfDay.getMonth() !== month - 1 ||
    startOfDay.getDate() !== day
  ) {
    throw new Error('Ngày lọc không hợp lệ.');
  }
  const startOfNextDay = new Date(year, month - 1, day + 1);

  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, event_id, actor_user_id, username, role, action_type, module_name, description, target_id, created_at')
    .gte('created_at', startOfDay.toISOString())
    .lt('created_at', startOfNextDay.toISOString())
    .order('created_at', { ascending: false })
    .limit(1000)
    .abortSignal(AbortSignal.timeout(8000));
  if (error) throw error;

  return (data || []).map(item => ({
    id: item.event_id || `server-${item.id}`,
    timestamp: item.created_at,
    userId: item.actor_user_id,
    username: item.username,
    role: item.role,
    actionType: item.action_type as AuditActionType,
    moduleName: item.module_name,
    description: item.description,
    targetId: item.target_id
  }));
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

  if (!supabase) {
    emitAuditError('Không thể lưu nhật ký thao tác vì Supabase chưa được cấu hình.');
    return entry;
  }

  void (async () => {
    try {
      const { error } = await supabase.rpc('write_audit_log', {
        p_event_id: entry.id,
        p_actor_user_id: entry.userId,
        p_action_type: entry.actionType,
        p_module_name: entry.moduleName,
        p_description: entry.description,
        p_target_id: entry.targetId
      });
      if (error) throw error;
      window.dispatchEvent(new CustomEvent('erp:audit-log-updated'));
    } catch (error) {
      console.error('Không thể ghi nhật ký thao tác lên Supabase:', error);
      emitAuditError('Không thể lưu nhật ký thao tác lên Supabase.');
    }
  })();

  return entry;
};
