import { useEffect } from 'react';
import type {
  AssistantDestination,
  AssistantReminder,
  AssistantReminderGroup
} from '../utils/aiAssistantAnalyzer';

const groupDetails: Record<AssistantReminderGroup, {
  title: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
}> = {
  urgent: {
    title: 'Cần xử lý gấp',
    color: '#991b1b',
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca'
  },
  upcoming: {
    title: 'Sắp tới hạn',
    color: '#92400e',
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a'
  },
  coordination: {
    title: 'Gợi ý điều phối',
    color: '#1e40af',
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe'
  }
};

const greetingForHour = (hour: number) => {
  if (hour < 12) return 'Chào buổi sáng';
  if (hour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
};

interface AssistantNavigationProps {
  reminder: AssistantReminder;
  onNavigate: (reminder: AssistantReminder) => void;
  canNavigate: (destination: AssistantDestination) => boolean;
}

function ReminderCard({ reminder, onNavigate, canNavigate }: AssistantNavigationProps) {
  const canOpen = canNavigate(reminder.destination);
  return (
    <article
      style={{
        padding: '12px',
        border: `1px solid ${groupDetails[reminder.group].borderColor}`,
        borderRadius: '9px',
        backgroundColor: '#fff',
        display: 'grid',
        gap: '8px'
      }}
    >
      <strong style={{ color: groupDetails[reminder.group].color, lineHeight: 1.4 }}>
        {reminder.title}
      </strong>
      <p style={{ margin: 0, color: '#475569', fontSize: '13px', lineHeight: 1.5 }}>
        {reminder.detail}
      </p>
      <button
        type="button"
        disabled={!canOpen}
        onClick={() => onNavigate(reminder)}
        title={canOpen ? 'Mở màn hình quản lý liên quan' : 'Tài khoản hiện không có quyền truy cập màn hình này'}
        style={{
          justifySelf: 'start',
          padding: '7px 11px',
          border: 0,
          borderRadius: '6px',
          backgroundColor: canOpen ? '#1d4ed8' : '#cbd5e1',
          color: '#fff',
          fontWeight: 700,
          cursor: canOpen ? 'pointer' : 'not-allowed'
        }}
      >
        Xem chi tiết
      </button>
    </article>
  );
}

export function AssistantHeaderButton({
  count,
  onClick
}: {
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Mở Trợ lý AI, ${count} việc cần chú ý`}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '7px',
        padding: '7px 12px',
        border: '1px solid #bfdbfe',
        borderRadius: '8px',
        backgroundColor: '#eff6ff',
        color: '#1e40af',
        fontWeight: 800,
        cursor: 'pointer',
        whiteSpace: 'nowrap'
      }}
    >
      <span aria-hidden="true">✨</span>
      Trợ lý AI
      {count > 0 && (
        <span
          aria-hidden="true"
          style={{
            minWidth: '19px',
            height: '19px',
            padding: '0 4px',
            display: 'inline-grid',
            placeItems: 'center',
            boxSizing: 'border-box',
            borderRadius: '999px',
            backgroundColor: '#dc2626',
            color: '#fff',
            fontSize: '11px',
            lineHeight: 1
          }}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

export function AssistantDashboardCard({
  reminders,
  onOpen
}: {
  reminders: AssistantReminder[];
  onOpen: () => void;
}) {
  const counts = reminders.reduce((result, reminder) => {
    result[reminder.group] += 1;
    return result;
  }, { urgent: 0, upcoming: 0, coordination: 0 });

  return (
    <section
      aria-label="Tóm tắt Trợ lý AI"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px',
        padding: '16px 18px',
        border: '1px solid #bfdbfe',
        borderRadius: '12px',
        background: 'linear-gradient(115deg, #eff6ff, #f8fafc)'
      }}
    >
      <div style={{ minWidth: 0 }}>
        <strong style={{ color: '#1e3a8a', fontSize: '15px' }}>✨ Trợ lý AI Nhắc Việc &amp; Điều Phối</strong>
        <p style={{ margin: '5px 0 0', color: '#475569', fontSize: '13px', lineHeight: 1.5 }}>
          {reminders.length === 0
            ? 'Hiện chưa phát hiện đầu việc cần chú ý.'
            : `${counts.urgent} việc gấp · ${counts.upcoming} sắp tới hạn · ${counts.coordination} gợi ý điều phối`}
        </p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        style={{
          padding: '9px 13px',
          border: 0,
          borderRadius: '7px',
          backgroundColor: '#1d4ed8',
          color: '#fff',
          fontWeight: 800,
          cursor: 'pointer'
        }}
      >
        Xem {reminders.length} việc cần chú ý
      </button>
    </section>
  );
}

export function AIAssistantPanel({
  open,
  reminders,
  onClose,
  onNavigate,
  canNavigate
}: {
  open: boolean;
  reminders: AssistantReminder[];
  onClose: () => void;
  onNavigate: (reminder: AssistantReminder) => void;
  canNavigate: (destination: AssistantDestination) => boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const now = new Date();
  const counts = reminders.reduce((result, reminder) => {
    result[reminder.group] += 1;
    return result;
  }, { urgent: 0, upcoming: 0, coordination: 0 });
  const sections: AssistantReminderGroup[] = ['urgent', 'upcoming', 'coordination'];

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3000,
        display: 'flex',
        justifyContent: 'flex-end',
        padding: '12px',
        boxSizing: 'border-box',
        backgroundColor: 'rgba(15, 23, 42, 0.42)'
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-assistant-title"
        onClick={event => event.stopPropagation()}
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: 'min(560px, 100%)',
          maxHeight: '100%',
          borderRadius: '14px',
          backgroundColor: '#f8fafc',
          boxShadow: '0 20px 50px rgba(15, 23, 42, 0.28)',
          overflow: 'hidden'
        }}
      >
        <header style={{ padding: '18px', backgroundColor: '#0f172a', color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <div>
              <h2 id="ai-assistant-title" style={{ margin: 0, fontSize: '18px' }}>✨ Trợ lý AI Nhắc Việc &amp; Điều Phối</h2>
              <p style={{ margin: '8px 0 0', color: '#cbd5e1', fontSize: '13px' }}>
                {greetingForHour(now.getHours())}. {reminders.length === 0
                  ? 'Các dữ liệu hiện có chưa cho thấy đầu việc cần chú ý.'
                  : `Đang có ${reminders.length} việc cần chú ý: ${counts.urgent} việc gấp, ${counts.upcoming} hợp đồng sắp tới hạn và ${counts.coordination} gợi ý điều phối.`}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng Trợ lý AI"
              style={{
                flexShrink: 0,
                width: '34px',
                height: '34px',
                border: '1px solid #475569',
                borderRadius: '7px',
                backgroundColor: '#1e293b',
                color: '#fff',
                fontSize: '18px',
                cursor: 'pointer'
              }}
            >
              ×
            </button>
          </div>
        </header>
        <div style={{ padding: '14px', overflowY: 'auto', display: 'grid', alignContent: 'start', gap: '16px' }}>
          {sections.map(group => {
            const groupReminders = reminders.filter(reminder => reminder.group === group);
            if (groupReminders.length === 0) return null;
            const details = groupDetails[group];
            return (
              <section key={group} aria-label={details.title}>
                <h3 style={{ margin: '0 0 9px', padding: '8px 10px', borderRadius: '7px', backgroundColor: details.backgroundColor, color: details.color, fontSize: '14px' }}>
                  {details.title} <span>({groupReminders.length})</span>
                </h3>
                <div style={{ display: 'grid', gap: '9px' }}>
                  {groupReminders.map(reminder => (
                    <ReminderCard
                      key={reminder.id}
                      reminder={reminder}
                      onNavigate={onNavigate}
                      canNavigate={canNavigate}
                    />
                  ))}
                </div>
              </section>
            );
          })}
          {reminders.length === 0 && (
            <p role="status" style={{ margin: 0, padding: '18px', borderRadius: '9px', backgroundColor: '#fff', color: '#475569', textAlign: 'center' }}>
              Chưa có nhắc việc nào. Trợ lý sẽ cập nhật khi dữ liệu trong hệ thống thay đổi.
            </p>
          )}
          <p style={{ margin: 0, color: '#64748b', fontSize: '11px', lineHeight: 1.5 }}>
            Phân tích trực tiếp trên dữ liệu đã tải; không dùng API bên ngoài. Nhắc cọc chỉ xuất hiện khi chưa ghi nhận khoản cọc, vì hệ thống chưa lưu hạn mức cọc mục tiêu riêng.
          </p>
        </div>
      </aside>
    </div>
  );
}
