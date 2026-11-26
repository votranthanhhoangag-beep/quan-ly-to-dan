import { createContext, useCallback, useContext, type ReactNode } from 'react';
import {
  clickMatchingButton,
  clickMatchingTabOrFilter,
  executeTableRowCommand,
  fillOrSelectDirect,
  selectDropdownOption
} from '../utils/voiceControlActions';
import { useTroLyWake, type TroLyVoiceMode } from '../hooks/useTroLyWake';
import { useAutoFieldScanner } from '../hooks/useAutoFieldScanner';
import {
  getFocusedVoiceFieldLabel,
  processAutoFieldVoiceCommand
} from '../utils/autoFieldScanner';

type VoiceMode = TroLyVoiceMode;

interface VoiceContextValue {
  mode: VoiceMode;
  enabled: boolean;
  error: string;
  heard: string;
  result: string;
  wakeWord: string;
  setWakeWord: (value: string) => void;
  toggle: () => void;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

const normalize = (value: string) => value
  .toLocaleLowerCase('vi')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const destinations: Array<{ tabId: string; phrases: string[]; label: string }> = [
  { tabId: 'inventoryStockReport', phrases: ['bao cao nxt hang dan', 'bao cao nxt'], label: 'Báo cáo NXT hàng đan' },
  { tabId: 'dashboard', phrases: ['trang chu', 'tong quan', 'dashboard'], label: 'Dashboard' },
  { tabId: 'categories', phrases: ['quan ly danh muc', 'danh muc'], label: 'Quản lý danh mục' },
  { tabId: 'contracts', phrases: ['quan ly hop dong', 'quan ly hd dan', 'hop dong', 'hd dan'], label: 'Quản lý hợp đồng' },
  { tabId: 'inventory', phrases: ['bao cao khung son', 'bao cao ton kho', 'ton kho', 'phieu nhap', 'nhap xuat khung son'], label: 'Báo cáo khung sơn' },
  { tabId: 'exportFrame', phrases: ['nhan hang dan', 'nhan hang tu to dan'], label: 'Nhận hàng đan' },
  { tabId: 'knittingExport', phrases: ['xuat hang dan'], label: 'Xuất hàng đan' },
  { tabId: 'defectiveGoodsImport', phrases: ['nhap hang loai', 'hang loi'], label: 'Nhập hàng loại' },
  { tabId: 'materialStockReport', phrases: ['bao cao nguyen phu lieu'], label: 'Báo cáo nguyên phụ liệu' },
  { tabId: 'expenses', phrases: ['quan ly phieu chi', 'phieu chi'], label: 'Quản lý phiếu chi' },
  { tabId: 'vehicles', phrases: ['quan ly xe', 'nhat trinh xe'], label: 'Quản lý xe' },
  { tabId: 'tax', phrases: ['doanh thu va chi phi', 'doanh thu', 'chi phi'], label: 'Doanh thu và chi phí' },
  { tabId: 'systemSettings', phrases: ['cau hinh he thong', 'cai dat he thong'], label: 'Cấu hình hệ thống' },
  { tabId: 'userManagement', phrases: ['quan ly nguoi dung'], label: 'Quản lý người dùng' },
  { tabId: 'auditLogs', phrases: ['lich su thao tac'], label: 'Lịch sử thao tác' }
];

const runAllVoiceTasks = (transcript: string): string | Promise<string> => {
  const normalized = normalize(transcript);
  const directFillResult = fillOrSelectDirect(transcript);
  if (directFillResult) return directFillResult;
  const rowResult = executeTableRowCommand(transcript);
  if (rowResult) return rowResult;
  const tabResult = clickMatchingTabOrFilter(transcript);
  if (tabResult) return tabResult;
  const buttonResult = clickMatchingButton(transcript);
  if (buttonResult) return buttonResult;
  const dropdownResult = selectDropdownOption(transcript);
  if (dropdownResult) return dropdownResult;
  const destination = destinations.find(item => item.phrases.some(phrase =>
    normalized.includes(phrase)
  ));
  if (destination) {
    const request = new CustomEvent<{ tabId: string; accepted: boolean }>('erp:voice-navigation', {
      detail: { tabId: destination.tabId, accepted: false }
    });
    window.dispatchEvent(request);
    return request.detail.accepted
      ? `Đã chuyển đến ${destination.label}.`
      : `Tài khoản hiện không có quyền mở ${destination.label}.`;
  }
  return `Chưa nhận ra lệnh “${transcript}”. Hãy thử “Điền số lượng 300” hoặc “Chọn tổ đan [tên]”.`;
};

export function GlobalVoiceProvider({ children }: { children: ReactNode }) {
  const fields = useAutoFieldScanner();
  const handleTroLyCommand = useCallback(async (transcript: string) => {
    const response = await runAllVoiceTasks(transcript);
    window.dispatchEvent(new CustomEvent('erp:voice-command', { detail: transcript }));
    return response;
  }, []);
  const handleLocalTranscript = useCallback((transcript: string) =>
    processAutoFieldVoiceCommand(transcript, fields), [fields]);
  const getUnrecognizedMessage = useCallback(() =>
    `Nghe chưa rõ — giữ nguyên ${getFocusedVoiceFieldLabel(fields)}, chờ lệnh tiếp theo.`, [fields]);
  const troLy = useTroLyWake({
    onCommand: handleTroLyCommand,
    onLocalTranscript: handleLocalTranscript,
    getUnrecognizedMessage
  });
  const enabled = troLy.mode !== 'off';

  return (
    <VoiceContext.Provider
      value={{
        mode: troLy.mode,
        enabled,
        error: troLy.error,
        heard: troLy.heard,
        result: troLy.result,
        wakeWord: troLy.wakeWord,
        setWakeWord: troLy.setWakeWord,
        toggle: troLy.toggle
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
}

export function GlobalVoiceButton() {
  const voice = useContext(VoiceContext);
  if (!voice) throw new Error('GlobalVoiceButton must be rendered inside GlobalVoiceProvider.');
  const labels: Record<VoiceMode, string> = {
    off: 'Tắt',
    waiting_name: 'Chờ gọi “Trợ lý”',
    listening_command: 'Đang nghe lệnh',
    speaking: 'Đang phản hồi'
  };
  const colors: Record<VoiceMode, string> = {
    off: '#475569',
    waiting_name: '#0f766e',
    listening_command: '#b91c1c',
    speaking: '#7c3aed'
  };
  return (
    <div className="erp-voice-control">
      <button
        type="button"
        className="erp-voice-button"
        onClick={voice.toggle}
        aria-label={voice.enabled ? `Tắt trợ lý giọng nói, trạng thái ${labels[voice.mode]}` : 'Bật trợ lý giọng nói'}
        aria-pressed={voice.enabled}
        style={{ backgroundColor: colors[voice.mode] }}
      >
        <span aria-hidden="true">🎙️</span>
        <span>Trợ lý giọng nói · {labels[voice.mode]}</span>
      </button>
      <details style={{ position: 'relative', fontSize: '11px' }}>
        <summary style={{ cursor: 'pointer', color: '#334155' }}>Từ đánh thức</summary>
        <label style={{ position: 'absolute', right: 0, top: '100%', zIndex: 30, display: 'grid', gap: '5px', width: '190px', padding: '9px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', boxShadow: '0 4px 10px rgb(15 23 42 / 15%)' }}>
          Cụm từ gọi trợ lý
          <input
            type="text"
            value={voice.wakeWord}
            onChange={event => voice.setWakeWord(event.target.value)}
            onBlur={event => voice.setWakeWord(event.target.value.trim() || 'trợ lý')}
            aria-label="Cụm từ đánh thức trợ lý"
            data-voice-ignore="true"
            maxLength={40}
            style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
          />
        </label>
      </details>
      {voice.result && (
        <span role="status" aria-live="polite" className="erp-voice-status">
          {voice.result}
        </span>
      )}
      {voice.error && <span className="erp-voice-error" role="status">{voice.error}</span>}
    </div>
  );
}

export const useGlobalVoice = () => useContext(VoiceContext);
