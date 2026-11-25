import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { parseVietnameseNumber } from '../utils/voiceFormParser';
import {
  clickMatchingButton,
  clickMatchingTabOrFilter,
  fillOrSelectDirect,
  selectDropdownOption
} from '../utils/voiceControlActions';
import { useTroLyWake, type TroLyVoiceMode } from '../hooks/useTroLyWake';

type VoiceMode = TroLyVoiceMode;

interface VoiceContextValue {
  mode: VoiceMode;
  enabled: boolean;
  error: string;
  heard: string;
  result: string;
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

const fieldAliases = [
  'số lượng nhận hôm nay', 'số lượng thực nhận', 'sl thực nhận', 'số lượng',
  'số bộ', 'số cái', 'đơn giá', 'thành tiền', 'tổng tiền', 'tiền cọc',
  'tiền trả', 'số tiền trả', 'tên tổ đan', 'tổ đan', 'mã hàng', 'mã sản phẩm',
  'tên hàng', 'tên sản phẩm', 'tên công ty', 'nhà cung cấp', 'người nhận',
  'người giao', 'ghi chú', 'lưu ý', 'nội dung', 'ngày', 'hạn trả nợ',
  'tên danh mục', 'mã danh mục', 'đơn vị tính', 'số điện thoại', 'biển số xe',
  'khoản chi', 'ngày tháng', 'hạn giao', 'hạn nhận'
].sort((a, b) => normalize(b).length - normalize(a).length);

type VoiceField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const isVisible = (element: HTMLElement) => {
  const style = window.getComputedStyle(element);
  const bounds = element.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' &&
    element.getAttribute('aria-hidden') !== 'true' && bounds.width > 0 && bounds.height > 0 &&
    bounds.bottom > 0 && bounds.right > 0 && bounds.top < window.innerHeight &&
    bounds.left < window.innerWidth;
};

const fieldDescription = (field: VoiceField) => {
  const labels = field.labels ? Array.from(field.labels).map(label => label.textContent || '') : [];
  return [
    field.getAttribute('aria-label') || '',
    ...labels,
    field.closest('label')?.textContent || '',
    field.getAttribute('placeholder') || '',
    field.parentElement?.previousElementSibling?.textContent || '',
    field.parentElement?.textContent || '',
    field.getAttribute('name') || '',
    field.id
  ].join(' ');
};

const visibleFields = (): VoiceField[] => Array.from(
  document.querySelectorAll<VoiceField>('input, textarea, select')
).filter(field => {
  if (field.disabled || !isVisible(field)) return false;
  if (field instanceof HTMLInputElement &&
    ['hidden', 'button', 'submit', 'reset', 'image', 'file', 'checkbox', 'radio'].includes(field.type)) return false;
  if ((field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) && field.readOnly) return false;
  return true;
});

const getFieldLabels = (field: VoiceField) => [
  ...(field.labels ? Array.from(field.labels).map(label => label.textContent || '') : []),
  field.closest('label')?.textContent || '',
  field.getAttribute('aria-label') || '',
  field.getAttribute('placeholder') || '',
  field.parentElement?.previousElementSibling?.textContent || '',
  field.getAttribute('name') || '',
  field.id
].map(label => label.replace(/\s+/g, ' ').trim()).filter(Boolean);

const getVoiceFieldAliases = (selectOnly = false) => Array.from(new Set([
  ...fieldAliases,
  ...visibleFields()
    .filter(field => !selectOnly || field instanceof HTMLSelectElement)
    .flatMap(getFieldLabels)
])).sort((first, second) => normalize(second).length - normalize(first).length);

const getDropdownAliases = () => {
  const customDropdowns = Array.from(document.querySelectorAll<HTMLElement>(
    '[role="combobox"], [aria-haspopup="listbox"], input[readonly]'
  )).filter(isVisible);
  return Array.from(new Set([
    ...getVoiceFieldAliases(true),
    ...customDropdowns.flatMap(control => [
      control.getAttribute('aria-label') || '',
      control.getAttribute('placeholder') || '',
      control.closest('label')?.textContent || '',
      control.parentElement?.previousElementSibling?.textContent || ''
    ].map(label => label.replace(/\s+/g, ' ').trim()).filter(Boolean))
  ])).sort((first, second) => normalize(second).length - normalize(first).length);
};

const getFieldValue = (transcript: string) => {
  const cleaned = transcript.trim().replace(/^(?:điền|nhập|cập nhật)\s+/iu, '');
  const normalized = normalize(cleaned);
  for (const alias of getVoiceFieldAliases()) {
    const normalizedAlias = normalize(alias);
    if (!normalized.startsWith(`${normalizedAlias} `) && normalized !== normalizedAlias) continue;

    let sourceOffset = 0;
    while (sourceOffset < cleaned.length &&
      normalize(cleaned.slice(0, sourceOffset)).length < normalizedAlias.length) sourceOffset += 1;
    return { alias, value: cleaned.slice(sourceOffset).trim().replace(/^(?:là|:)\s*/iu, '') };
  }
  return null;
};

const setFieldValue = (field: VoiceField, value: string) => {
  if (field instanceof HTMLSelectElement) {
    const query = normalize(value);
    const options = Array.from(field.options);
    const exactOptions = options.filter(option =>
      normalize(option.textContent || option.value) === query
    );
    const partialOptions = options.filter(option => {
      const optionText = normalize(option.textContent || option.value);
      return optionText.includes(query) || query.includes(optionText);
    });
    const matches = exactOptions.length ? exactOptions : partialOptions;
    if (matches.length !== 1) return false;
    field.value = matches[0].value;
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  const numeric = field instanceof HTMLInputElement &&
    (['number', 'range'].includes(field.type) || ['decimal', 'numeric'].includes(field.inputMode));
  const parsed = numeric ? parseVietnameseNumber(value) : undefined;
  const nextValue = parsed !== undefined ? String(parsed) : value;
  const prototype = field instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) return false;
  setter.call(field, nextValue);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
};

const selectVisibleOption = (query: string) => {
  const normalizedQuery = normalize(query);
  const options = Array.from(document.querySelectorAll<HTMLElement>(
    '[role="option"], [role="menuitem"], [data-voice-suggestions="product-code"] [role="option"]'
  )).filter(isVisible);
  const exactMatches = options.filter(option => {
    const label = normalize(option.textContent || option.getAttribute('aria-label') || '');
    return label === normalizedQuery;
  });
  const matches = exactMatches.length ? exactMatches : options.filter(option => {
    const label = normalize(option.textContent || option.getAttribute('aria-label') || '');
    return label.includes(normalizedQuery);
  });
  if (matches.length !== 1) return null;
  const label = matches[0].textContent?.trim() || query;
  matches[0].click();
  return label;
};

const findCustomDropdown = (fieldLabel: string) => {
  const controls = Array.from(document.querySelectorAll<HTMLElement>(
    '[role="combobox"], [role="button"], [aria-haspopup="listbox"], input[readonly], button'
  )).filter(isVisible);
  const query = normalize(fieldLabel);
  return controls.find(control => normalize([
    control.textContent || '',
    control.getAttribute('aria-label') || '',
    control.getAttribute('placeholder') || '',
    control.parentElement?.textContent || '',
    control.parentElement?.previousElementSibling?.textContent || ''
  ].join(' ')).includes(query));
};

const fillField = (alias: string, value: string) => {
  const target = normalize(alias);
  const matches = visibleFields().map(field => {
    const description = normalize(fieldDescription(field));
    return {
      field,
      score: description === target ? 3 : description.includes(target) ? 1 : 0
    };
  }).filter(item => item.score > 0);
  const focused = document.activeElement;
  const focusedMatch = matches.find(item => item.field === focused);
  const best = focusedMatch?.field || matches.sort((first, second) => second.score - first.score)[0]?.field;
  if (!best) return `Không tìm thấy ô “${alias}” đang hiển thị.`;
  if (best instanceof HTMLSelectElement) {
    return setFieldValue(best, value)
      ? `Đã chọn “${best.selectedOptions[0]?.textContent?.trim() || value}”.`
      : `Không tìm thấy lựa chọn “${value}” phù hợp trong danh sách.`;
  }
  return setFieldValue(best, value)
    ? `Đã điền ${alias} ${value}.`
    : `Không thể điền ô “${alias}”.`;
};

const selectDropdownValue = (query: string, fieldLabel: string) => {
  const selects = visibleFields().filter((field): field is HTMLSelectElement =>
    field instanceof HTMLSelectElement
  );
  const normalizedLabel = normalize(fieldLabel);
  const matchingSelect = selects.find(select =>
    normalize(fieldDescription(select)).includes(normalizedLabel)
  );
  if (matchingSelect && setFieldValue(matchingSelect, query)) {
    return `Đã chọn ${matchingSelect.selectedOptions[0]?.textContent?.trim() || query}.`;
  }

  const existingOption = selectVisibleOption(query);
  if (existingOption) return `Đã chọn ${existingOption}.`;

  const trigger = findCustomDropdown(fieldLabel);
  if (!trigger) return `Không tìm thấy danh sách “${fieldLabel}” đang hiển thị.`;
  trigger.click();
  return new Promise<string>(resolve => {
    window.setTimeout(() => {
      const selected = selectVisibleOption(query);
      resolve(selected ? `Đã chọn ${selected}.` : `Đã mở danh sách “${fieldLabel}” nhưng không tìm thấy “${query}”.`);
    }, 250);
  });
};

const visibleActionTargets = () => Array.from(document.querySelectorAll<HTMLElement>(
  'button, [role="button"], [role="tab"], input[type="submit"], a[role="button"]'
)).filter(element => isVisible(element) &&
  !(element as HTMLButtonElement).disabled &&
  element.getAttribute('aria-disabled') !== 'true');

const controlLabel = (element: HTMLElement) => normalize([
  element.textContent || '',
  element.getAttribute('aria-label') || '',
  element.getAttribute('title') || '',
  element instanceof HTMLInputElement ? element.value : ''
].join(' '));

const clickMatchingControl = (query: string) => {
  const normalizedQuery = normalize(query);
  const controls = visibleActionTargets();
  const exact = controls.filter(control => controlLabel(control) === normalizedQuery);
  const matches = exact.length ? exact : controls.filter(control =>
    controlLabel(control).includes(normalizedQuery)
  );
  if (matches.length !== 1) {
    return matches.length
      ? `Có nhiều thao tác khớp với “${query}”. Hãy nói rõ tên nút hoặc tab.`
      : `Không tìm thấy nút hoặc tab “${query}” đang hiển thị.`;
  }
  const label = matches[0].textContent?.trim() || matches[0].getAttribute('aria-label') || query;
  matches[0].click();
  return `Đã chọn “${label}”.`;
};

const executeUiCommand = (normalized: string) => {
  const tabPrefix = normalized.startsWith('chon tab ')
    ? 'chon tab '
    : normalized.startsWith('xem ')
      ? 'xem '
      : '';
  if (tabPrefix) return clickMatchingControl(normalized.slice(tabPrefix.length));

  const actions: Array<{ phrases: string[]; targets: string[] }> = [
    { phrases: ['them muc moi', 'them moi'], targets: ['thêm mới', 'tạo mới', 'thêm'] },
    { phrases: ['luu lai', 'luu'], targets: ['lưu', 'cập nhật'] },
    { phrases: ['huy bo', 'huy'], targets: ['hủy', 'đóng'] },
    { phrases: ['lam moi', 'tai lai'], targets: ['làm mới', 'tải lại', 'refresh'] },
    { phrases: ['trang tiep', 'trang tiep theo'], targets: ['trang tiếp', 'tiếp theo', 'next page', 'next'] },
    { phrases: ['trang truoc', 'trang truoc do'], targets: ['trang trước', 'trước đó', 'previous page', 'previous'] }
  ];
  const action = actions.find(item => item.phrases.includes(normalized));
  if (!action) return null;
  const matches = action.targets.flatMap(target => {
    const query = normalize(target);
    return visibleActionTargets().filter(control =>
      controlLabel(control).includes(query)
    );
  });
  const uniqueMatches = Array.from(new Set(matches));
  if (uniqueMatches.length !== 1) {
    return uniqueMatches.length
      ? 'Có nhiều nút phù hợp. Hãy nói rõ tên nút cần bấm.'
      : `Không tìm thấy nút thao tác “${action.phrases[0]}” đang hiển thị.`;
  }
  const label = uniqueMatches[0].textContent?.trim() ||
    uniqueMatches[0].getAttribute('aria-label') || action.phrases[0];
  uniqueMatches[0].click();
  return `Đã bấm “${label}”.`;
};

const executeCommand = (transcript: string): string | Promise<string> => {
  const normalized = normalize(transcript);
  const tabResult = clickMatchingTabOrFilter(transcript);
  if (tabResult) return tabResult;
  const buttonResult = clickMatchingButton(transcript);
  if (buttonResult) return buttonResult;
  const dropdownResult = selectDropdownOption(transcript);
  if (dropdownResult) return dropdownResult;
  const directFillResult = fillOrSelectDirect(transcript);
  if (directFillResult) return directFillResult;
  const uiCommand = executeUiCommand(normalized);
  if (uiCommand) return uiCommand;
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
  if (normalized.startsWith('chon ')) {
    const query = transcript.trim().replace(/^(?:chọn|chon)\s+/iu, '');
    const field = getDropdownAliases().find(alias =>
      normalized.startsWith(`chon ${normalize(alias)} `)
    );
    const optionQuery = field
      ? query.replace(new RegExp(`^${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'iu'), '').trim()
      : query;
    return selectDropdownValue(optionQuery, field || 'danh sách');
  }

  const fieldValue = getFieldValue(transcript);
  if (fieldValue?.value) return fillField(fieldValue.alias, fieldValue.value);

  const focused = document.activeElement;
  if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) {
    if (isVisible(focused) && !focused.readOnly && setFieldValue(focused, transcript)) {
      return `Đã điền ô ${fieldDescription(focused).trim() || 'đang chọn'}.`;
    }
  }
  return `Chưa nhận ra lệnh “${transcript}”. Hãy thử “Điền số lượng 300” hoặc “Chọn tổ đan [tên]”.`;
};

export function GlobalVoiceProvider({ children }: { children: ReactNode }) {
  const handleTroLyCommand = useCallback(async (transcript: string) => {
    const response = await executeCommand(transcript);
    window.dispatchEvent(new CustomEvent('erp:voice-command', { detail: transcript }));
    return response;
  }, []);
  const troLy = useTroLyWake({ onCommand: handleTroLyCommand });
  const enabled = troLy.mode !== 'off';

  return (
    <VoiceContext.Provider
      value={{
        mode: troLy.mode,
        enabled,
        error: troLy.error,
        heard: troLy.heard,
        result: troLy.result,
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
      {voice.error && <span className="erp-voice-error" role="status">{voice.error}</span>}
    </div>
  );
}

export const useGlobalVoice = () => useContext(VoiceContext);
