import { parseVietnameseNumber } from './voiceFormParser';

export { parseVietnameseNumber };

export const normalizeVi = (value: string) => value
  .toLocaleLowerCase('vi')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

type VoiceField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
let lastFocusedFieldEl: VoiceField | null = null;
let selectedRowEl: HTMLTableRowElement | null = null;

if (typeof document !== 'undefined') {
  document.addEventListener('focusin', event => {
    const target = event.target;
    if (target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement) {
      lastFocusedFieldEl = target;
    }
  });
}

const isVisible = (element: HTMLElement) => {
  const style = window.getComputedStyle(element);
  const bounds = element.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' &&
    element.getAttribute('aria-hidden') !== 'true' && bounds.width > 0 && bounds.height > 0 &&
    bounds.bottom > 0 && bounds.right > 0 && bounds.top < window.innerHeight &&
    bounds.left < window.innerWidth;
};

const getVisibleFields = (): VoiceField[] => Array.from(
  document.querySelectorAll<VoiceField>('input, textarea, select')
).filter(field => {
  if (field.disabled || !isVisible(field)) return false;
  if (field instanceof HTMLInputElement &&
    ['hidden', 'button', 'submit', 'reset', 'image', 'file', 'checkbox', 'radio'].includes(field.type)) return false;
  if ((field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) && field.readOnly) return false;
  return true;
});

const getFieldLabels = (field: HTMLElement) => [
  field.getAttribute('data-voice-label') || '',
  field.getAttribute('aria-label') || '',
  ...((field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement ||
    field instanceof HTMLSelectElement) && field.labels
    ? Array.from(field.labels).map(label => label.textContent || '')
    : []),
  field.closest('label')?.textContent || '',
  field.getAttribute('placeholder') || '',
  field.getAttribute('name') || '',
  field.id
].map(label => label.replace(/\s+/g, ' ').trim()).filter(Boolean);

const commonFieldLabels = [
  'số lượng', 'số lượng nhận hôm nay', 'số lượng thực nhận', 'sl thực nhận',
  'số bộ', 'số cái', 'đơn giá', 'thành tiền', 'tổng tiền', 'tiền cọc',
  'tiền trả', 'số tiền trả', 'tên tổ đan', 'tổ đan', 'mã hàng', 'mã sản phẩm',
  'tên hàng', 'tên sản phẩm', 'tên công ty', 'nhà cung cấp', 'người nhận',
  'người giao', 'ghi chú', 'lưu ý', 'nội dung', 'ngày', 'hạn trả nợ',
  'tên danh mục', 'mã danh mục', 'đơn vị tính', 'số điện thoại', 'số zalo',
  'biển số xe', 'khoản chi', 'ngày tháng', 'hạn giao', 'hạn nhận'
];

const getAllFieldLabels = () => Array.from(new Set([
  ...commonFieldLabels,
  ...getVisibleFields().flatMap(getFieldLabels)
])).sort((first, second) => normalizeVi(second).length - normalizeVi(first).length);

const findNamedFieldAssignment = (transcript: string, prefixes: string[]) => {
  let command = transcript.trim();
  for (const prefix of prefixes) {
    const match = new RegExp(`^${prefix}\\s+`, 'iu').exec(command);
    if (match) {
      command = command.slice(match[0].length).trim();
      break;
    }
  }
  const normalizedCommand = normalizeVi(command);
  const labels = getAllFieldLabels().map(label => ({ label, normalized: normalizeVi(label) }));

  for (const { label, normalized: normalizedLabel } of labels) {
    if (!normalizedCommand.startsWith(`${normalizedLabel} `) &&
      !normalizedCommand.startsWith(`${normalizedLabel} la `) &&
      normalizedCommand !== normalizedLabel) continue;

    let sourceOffset = 0;
    while (sourceOffset < command.length &&
      normalizeVi(command.slice(0, sourceOffset)).length < normalizedLabel.length) sourceOffset += 1;
    const value = command.slice(sourceOffset).trim().replace(/^(?:là|la|:)\s*/iu, '');
    if (value) return { label, value };
  }
  return null;
};

const findFieldByLabel = (label: string) => {
  const query = normalizeVi(label);
  if (!query) return { field: null, ambiguous: false };
  const matches = getVisibleFields().flatMap(field => {
    const labels = getFieldLabels(field).map(fieldLabel => normalizeVi(fieldLabel));
    const best = labels.reduce((score, fieldLabel) => {
      if (fieldLabel === query) return Math.max(score, 3);
      if (fieldLabel.startsWith(query) || query.startsWith(fieldLabel)) return Math.max(score, 2);
      if (fieldLabel.includes(query)) return Math.max(score, 1);
      return score;
    }, 0);
    return best ? [{ field, score: best }] : [];
  }).sort((first, second) => second.score - first.score);
  if (!matches.length) return { field: null, ambiguous: false };
  const best = matches[0].score;
  const bestMatches = matches.filter(match => match.score === best);
  return bestMatches.length === 1
    ? { field: bestMatches[0].field, ambiguous: false }
    : { field: null, ambiguous: true };
};

const focusField = (field: VoiceField, label: string) => {
  field.scrollIntoView({ behavior: 'smooth', block: 'center' });
  field.focus();
  lastFocusedFieldEl = field;
  return `Đã tới ô ${label}.`;
};

const setFieldValue = (field: VoiceField, value: string, label: string) => {
  lastFocusedFieldEl = field;
  if (field instanceof HTMLSelectElement) {
    const normalizedValue = normalizeVi(value);
    const options = Array.from(field.options);
    const exact = options.filter(option => normalizeVi(option.textContent || option.value) === normalizedValue);
    const matches = exact.length ? exact : options.filter(option => {
      const optionLabel = normalizeVi(option.textContent || option.value);
      return optionLabel.includes(normalizedValue) || normalizedValue.includes(optionLabel);
    });
    if (matches.length !== 1) {
      return matches.length
        ? `Có nhiều lựa chọn phù hợp với “${value}” trong “${label}”.`
        : `Không tìm thấy “${value}” trong danh sách “${label}”.`;
    }
    field.value = matches[0].value;
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return `Đã chọn “${matches[0].textContent?.trim() || value}”.`;
  }

  const normalizedLabel = normalizeVi(label);
  const isPhoneNumber = /(dien thoai|so zalo|phone|mobile)/u.test(normalizedLabel);
  const numericField = field instanceof HTMLInputElement &&
    (['number', 'range'].includes(field.type) ||
      ['decimal', 'numeric'].includes(field.inputMode));
  const numericLabel = /(so|tien|luong|vat|thue|don gia|gia|ty le|phan tram|quantity|amount|price|rate)/u.test(normalizedLabel);
  const numeric = !isPhoneNumber && (numericField || numericLabel);
  const parsed = numeric ? parseVietnameseNumber(value) : undefined;
  const nextValue = parsed !== undefined ? String(parsed) : value;
  const prototype = field instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) return `Không thể điền ô “${label}”.`;
  setter.call(field, nextValue);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
  return `Đã điền ${label} ${nextValue}.`;
};

const moveToField = (transcript: string) => {
  const normalizedCommand = normalizeVi(transcript);
  const match = /^(?:di chuyen toi o|toi o|chuyen toi o|vao o)\s+(.+)$/u.exec(normalizedCommand);
  if (!match) return null;
  const requestedLabel = match[1].trim();
  const { field, ambiguous } = findFieldByLabel(requestedLabel);
  if (!field) {
    return ambiguous
      ? `Có nhiều ô khớp với “${requestedLabel}”. Hãy nói rõ tên ô hơn.`
      : `Không tìm thấy ô “${requestedLabel}” đang hiển thị.`;
  }
  return focusField(field, requestedLabel);
};

const findVisibleRow = (query: string) => {
  const normalizedQuery = normalizeVi(query);
  if (!normalizedQuery) return { row: null, ambiguous: false };
  const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>('tbody tr'))
    .filter(isVisible);
  const matches = rows.map(row => {
    const text = normalizeVi(row.innerText || row.textContent || '');
    const score = text === normalizedQuery ? 3 : text.includes(normalizedQuery) ? 2 : 0;
    return { row, score };
  }).filter(item => item.score > 0).sort((first, second) => second.score - first.score);
  if (!matches.length) return { row: null, ambiguous: false };
  const bestScore = matches[0].score;
  const bestMatches = matches.filter(item => item.score === bestScore);
  return bestMatches.length === 1
    ? { row: bestMatches[0].row, ambiguous: false }
    : { row: null, ambiguous: true };
};

const selectTableRow = (row: HTMLTableRowElement, label: string) => {
  if (selectedRowEl && selectedRowEl !== row) {
    selectedRowEl.removeAttribute('data-voice-selected-row');
  }
  selectedRowEl = row;
  row.dataset.voiceSelectedRow = 'true';
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return `Đã chọn dòng ${label}.`;
};

const clickRowAction = (row: HTMLTableRowElement, action: 'sua' | 'xoa') => {
  const buttons = Array.from(row.querySelectorAll<HTMLElement>(
    'button, [role="button"], a[role="button"]'
  )).filter(element => isVisible(element) &&
    !(element as HTMLButtonElement).disabled &&
    element.getAttribute('aria-disabled') !== 'true');
  const button = buttons.find(element => {
    const label = normalizeVi([
      element.textContent || '',
      element.getAttribute('aria-label') || '',
      element.getAttribute('title') || '',
      element.getAttribute('data-voice-label') || ''
    ].join(' '));
    return action === 'sua'
      ? /\bsua\b/u.test(label) || /\bedit\b/u.test(label)
      : /\bxoa\b/u.test(label) || /\bdelete\b/u.test(label);
  });
  if (!button) return `Không tìm thấy nút ${action === 'sua' ? 'Sửa' : 'Xóa'} trong dòng đã chọn.`;
  button.click();
  return `Đã ${action === 'sua' ? 'bấm Sửa' : 'bấm Xóa'} dòng đã chọn.`;
};

export const executeTableRowCommand = (transcript: string): string | null => {
  const command = normalizeVi(transcript);
  const rowAction = /^(sua|xoa)(?: ma)?\s+(.+)$/u.exec(command);
  if (rowAction) {
    const requested = rowAction[2];
    const { row, ambiguous } = findVisibleRow(requested);
    if (!row) {
      return ambiguous
        ? `Có nhiều dòng khớp với “${requested}”. Hãy nói rõ mã hoặc tên.`
        : `Không tìm thấy dòng “${requested}” đang hiển thị.`;
    }
    selectTableRow(row, requested);
    return clickRowAction(row, rowAction[1] as 'sua' | 'xoa');
  }

  if (command === 'sua' || command === 'xoa') {
    if (!selectedRowEl || !document.contains(selectedRowEl)) {
      return 'Hãy chọn một dòng trước.';
    }
    return clickRowAction(selectedRowEl, command);
  }

  const rowSelection = /^(?:mo ma|chon dong|tim)\s+(.+)$/u.exec(command);
  if (!rowSelection) return null;
  const requested = rowSelection[1];
  const { row, ambiguous } = findVisibleRow(requested);
  if (!row) {
    return ambiguous
      ? `Có nhiều dòng khớp với “${requested}”. Hãy nói rõ mã hoặc tên.`
      : `Không tìm thấy dòng “${requested}” đang hiển thị.`;
  }
  return selectTableRow(row, requested);
};

const visibleControls = (selector: string) => Array.from(
  document.querySelectorAll<HTMLElement>(selector)
).filter(element => isVisible(element) &&
  !(element as HTMLButtonElement).disabled &&
  element.getAttribute('aria-disabled') !== 'true');

const controlLabel = (element: HTMLElement) => normalizeVi([
  element.textContent || '',
  element.getAttribute('data-voice-label') || '',
  element.getAttribute('aria-label') || '',
  element.getAttribute('title') || '',
  element instanceof HTMLInputElement ? element.value : ''
].join(' '));

const clickUniqueControl = (query: string, selector: string, kind: string) => {
  const normalizedQuery = normalizeVi(query);
  if (!normalizedQuery) return `Hãy nói rõ tên ${kind} cần chọn.`;
  const controls = visibleControls(selector);
  const exact = controls.filter(control => controlLabel(control) === normalizedQuery);
  const matches = exact.length ? exact : controls.filter(control =>
    controlLabel(control).includes(normalizedQuery)
  );
  const unique = Array.from(new Set(matches));
  if (unique.length !== 1) {
    return unique.length
      ? `Có nhiều ${kind} khớp với “${query}”. Hãy nói rõ hơn.`
      : `Không tìm thấy ${kind} “${query}” đang hiển thị.`;
  }
  const label = unique[0].textContent?.trim() || unique[0].getAttribute('aria-label') || query;
  unique[0].click();
  return `Đã chọn “${label}”.`;
};

export const clickMatchingTabOrFilter = (transcript: string): string | null => {
  const command = normalizeVi(transcript);
  const prefixes = [
    'chuyen qua tab ',
    'chuyen tab ',
    'mo tab ',
    'chon tab ',
    'xem danh muc ',
    'loc theo ',
    'xem '
  ];
  const prefix = prefixes.find(candidate => command.startsWith(candidate));
  const query = prefix ? command.slice(prefix.length).trim() : command;
  const tabs = visibleControls('button, [role="tab"], [role="button"]');
  if (!tabs.some(tab => controlLabel(tab) === query || controlLabel(tab).includes(query))) return null;
  return clickUniqueControl(query, 'button, [role="tab"], [role="button"]', 'tab hoặc bộ lọc');
};

const buttonActions: Array<{ phrases: string[]; targets: string[] }> = [
  { phrases: ['them muc moi', 'them moi'], targets: ['thêm mục mới', 'thêm mới', 'tạo mới'] },
  { phrases: ['luu', 'luu lai'], targets: ['lưu', 'lưu lại', 'cập nhật'] },
  { phrases: ['huy', 'huy bo'], targets: ['hủy', 'đóng'] },
  { phrases: ['lam moi', 'tai lai'], targets: ['làm mới', 'tải lại', 'refresh'] },
  { phrases: ['trang tiep', 'trang sau', 'trang tiep theo'], targets: ['trang tiếp', 'trang sau', 'tiếp theo', 'next page', 'next'] },
  { phrases: ['trang truoc', 'trang truoc do'], targets: ['trang trước', 'trước đó', 'previous page', 'previous'] },
  { phrases: ['xoa', 'xoa muc'], targets: ['xóa', 'xóa mục', 'delete'] }
];

export const clickMatchingButton = (transcript: string): string | null => {
  const command = normalizeVi(transcript).replace(/^(?:bam|nhan|click)\s+/, '');
  const action = buttonActions.find(item => item.phrases.includes(command));
  if (!action) return null;
  const buttons = visibleControls('button, [role="button"], input[type="submit"], a[role="button"]');
  const matches = action.targets.flatMap(target => {
    const normalizedTarget = normalizeVi(target);
    return buttons.filter(button => controlLabel(button).includes(normalizedTarget));
  });
  const unique = Array.from(new Set(matches));
  if (unique.length !== 1) {
    return unique.length
      ? 'Có nhiều nút phù hợp. Hãy nói rõ tên nút cần bấm.'
      : `Không tìm thấy nút “${action.phrases[0]}” đang hiển thị.`;
  }
  const label = unique[0].textContent?.trim() || unique[0].getAttribute('aria-label') || action.phrases[0];
  unique[0].click();
  return `Đã bấm “${label}”.`;
};

export const selectDropdownOption = (transcript: string): string | Promise<string> | null => {
  const command = transcript.trim().replace(/^(?:chọn|chon)\s+/iu, '');
  if (command === transcript.trim()) return null;

  const assignment = findNamedFieldAssignment(command, []);
  const optionQuery = assignment?.value || command;
  const fieldLabel = assignment?.label || '';
  const selects = getVisibleFields().filter((field): field is HTMLSelectElement =>
    field instanceof HTMLSelectElement);
  const select = fieldLabel
    ? selects.find(field => getFieldLabels(field).some(label =>
      normalizeVi(label).includes(normalizeVi(fieldLabel))))
    : undefined;
  if (select) return setFieldValue(select, optionQuery, fieldLabel);

  const options = visibleControls('[role="option"], [data-voice-option]');
  const query = normalizeVi(optionQuery);
  const exact = options.filter(option => controlLabel(option) === query);
  const matches = exact.length ? exact : options.filter(option => controlLabel(option).includes(query));
  const unique = Array.from(new Set(matches));
  if (unique.length === 1) {
    const label = unique[0].textContent?.trim() || optionQuery;
    unique[0].click();
    return `Đã chọn “${label}”.`;
  }
  if (unique.length > 1) return `Có nhiều lựa chọn khớp với “${optionQuery}”.`;

  const customDropdowns = visibleControls(
    '[role="combobox"], [aria-haspopup="listbox"], input[readonly]'
  );
  const dropdown = fieldLabel
    ? customDropdowns.find(control => controlLabel(control).includes(normalizeVi(fieldLabel)) ||
      getFieldLabels(control).some(label => normalizeVi(label).includes(normalizeVi(fieldLabel))))
    : undefined;
  if (!dropdown) return `Không tìm thấy lựa chọn “${optionQuery}” đang hiển thị.`;
  dropdown.click();
  return new Promise(resolve => {
    window.setTimeout(() => {
      const visibleOptions = visibleControls('[role="option"], [data-voice-option]');
      const exactOptions = visibleOptions.filter(option => controlLabel(option) === query);
      const candidates = exactOptions.length
        ? exactOptions
        : visibleOptions.filter(option => controlLabel(option).includes(query));
      if (candidates.length === 1) {
        const label = candidates[0].textContent?.trim() || optionQuery;
        candidates[0].click();
        resolve(`Đã chọn “${label}”.`);
      } else {
        resolve(`Không tìm thấy lựa chọn duy nhất “${optionQuery}”.`);
      }
    }, 250);
  });
};

export const fillOrSelectDirect = (transcript: string): string | null => {
  const focusCommand = moveToField(transcript);
  if (focusCommand) return focusCommand;
  const assignment = findNamedFieldAssignment(transcript, ['điền', 'nhập', 'cập nhật']);
  if (assignment) {
    const { field, ambiguous } = findFieldByLabel(assignment.label);
    if (!field) {
      return ambiguous
        ? `Có nhiều ô khớp với “${assignment.label}”. Hãy nói rõ tên ô hơn.`
        : `Không tìm thấy ô “${assignment.label}” đang hiển thị.`;
    }
    return setFieldValue(field, assignment.value, assignment.label);
  }

  const bareValueMatch = /^(?:điền|nhập)\s+(.+)$/iu.exec(transcript.trim());
  if (!bareValueMatch) return null;
  const activeElement = document.activeElement;
  const activeField = activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement
    ? activeElement
    : null;
  const field = activeField && getVisibleFields().includes(activeField)
    ? activeField
    : lastFocusedFieldEl && getVisibleFields().includes(lastFocusedFieldEl)
      ? lastFocusedFieldEl
      : null;
  if (!field) return 'Hãy chọn ô cần điền hoặc nói “di chuyển tới ô [tên ô]”.';
  const label = getFieldLabels(field)[0] || 'đang chọn';
  return setFieldValue(field, bareValueMatch[1].trim(), label);
};
