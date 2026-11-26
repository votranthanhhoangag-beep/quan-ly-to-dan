import { parseVietnameseNumber } from './voiceFormParser';

export type AutoVoiceField = {
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  label: string;
  kind: 'search-dropdown' | 'number' | 'text';
  aliases: string[];
};

export type AutoVoiceTab = {
  element: HTMLElement;
  label: string;
  index: number;
  group: HTMLElement;
};

type LocalVoiceResult = { handled: boolean; message?: string };

const normalize = (value: string) => value
  .toLocaleLowerCase('vi')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const synonyms: Array<{ canonical: string; alternatives: string[] }> = [
  { canonical: 'so luong', alternatives: ['sl', 'so luong'] },
  { canonical: 'nguyen vat lieu', alternatives: ['nvl', 'nguyen vat lieu'] },
  { canonical: 'dinh muc', alternatives: ['dm', 'dinh muc'] },
  { canonical: 'ma hang', alternatives: ['ma hang', 'ma san pham', 'ma'] },
  { canonical: 'ma danh muc', alternatives: ['ma danh muc', 'ma'] },
  { canonical: 'ten hang', alternatives: ['ten hang', 'ten san pham'] },
  { canonical: 'ten cong ty doi tac', alternatives: ['ten cong ty doi tac', 'ten cong ty', 'cong ty doi tac', 'doi tac'] },
  { canonical: 'ghi chu', alternatives: ['ghi chu', 'luu y', 'noi dung'] },
  { canonical: 'don gia', alternatives: ['don gia', 'gia'] },
  { canonical: 'so dien thoai', alternatives: ['so dien thoai', 'dien thoai', 'sdt'] }
];

const excludedLabelPatterns = [
  /\bten hang tu nhay\b/u,
  /\bso h d tu sinh\b/u,
  /\bso hop dong tu sinh\b/u,
  /\bthanh tien\b/u,
  /\bso tien con lai\b/u,
  /\btu tinh\b/u,
  /\btu dong tinh\b/u,
  /\bcon lai\b/u
];

export const isSystemCalculatedVoiceLabel = (label: string) =>
  excludedLabelPatterns.some(pattern => pattern.test(normalize(label)));

const getFieldLabels = (field: AutoVoiceField['element']): string[] => {
  const labels = [
    field.getAttribute('data-voice-label') || '',
    field.getAttribute('aria-label') || '',
    ...(field.labels ? Array.from(field.labels, label => label.textContent || '') : []),
    field.closest('label')?.textContent || '',
    field.previousElementSibling?.textContent || '',
    field.getAttribute('placeholder') || '',
    field.getAttribute('name') || ''
  ];

  const parent = field.parentElement;
  if (parent) {
    const controls = parent.querySelectorAll('input, select, textarea');
    if (controls.length === 1) {
      labels.push(...Array.from(parent.querySelectorAll<HTMLElement>('label, span, small, legend, p'))
        .map(element => element.textContent || ''));
    }
  }

  return Array.from(new Set(labels
    .map(label => label.replace(/\s+/g, ' ').trim())
    .filter(label => label.length > 0 && label.length <= 100)));
};

const isVisibleInViewport = (element: HTMLElement) => {
  const style = window.getComputedStyle(element);
  const bounds = element.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' &&
    style.opacity !== '0' && !element.closest('[aria-hidden="true"], [inert]') &&
    bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 &&
    bounds.right > 0 && bounds.top < window.innerHeight && bounds.left < window.innerWidth;
};

const getAliases = (label: string) => {
  const normalizedLabel = normalize(label);
  const result = [normalizedLabel];
  for (const synonym of synonyms) {
    if (synonym.alternatives.some(alias => normalizedLabel.includes(alias))) {
      result.push(...synonym.alternatives, synonym.canonical);
    }
  }
  return Array.from(new Set(result.filter(alias => alias.length >= 2)));
};

export const scanVisibleVoiceFields = (): AutoVoiceField[] => {
  if (typeof document === 'undefined') return [];
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>(
    'dialog[open], [role="dialog"], [aria-modal="true"]'
  )).filter(isVisibleInViewport);
  const root: ParentNode = dialogs[dialogs.length - 1] || document;
  return Array.from(root.querySelectorAll<AutoVoiceField['element']>('input, select, textarea'))
    .flatMap(element => {
      if (element.hasAttribute('data-voice-ignore') || element.disabled ||
        ('readOnly' in element && element.readOnly) ||
        !isVisibleInViewport(element)) return [];
      if (element instanceof HTMLInputElement &&
        ['hidden', 'button', 'submit', 'reset', 'image', 'file', 'checkbox', 'radio'].includes(element.type)) {
        return [];
      }

      const labels = getFieldLabels(element);
      if (labels.some(isSystemCalculatedVoiceLabel)) {
        return [];
      }

      const label = labels[0] || 'ô nhập liệu';
      const normalizedLabel = normalize(labels.join(' '));
      const searchDropdown = element instanceof HTMLSelectElement ||
        element instanceof HTMLInputElement && (
          element.type === 'search' ||
          element.hasAttribute('list') ||
          element.getAttribute('role') === 'combobox' ||
          element.hasAttribute('aria-autocomplete') ||
          element.hasAttribute('data-voice-search-dropdown')
        );
      const phoneField = /\b(dien thoai|sdt|phone|mobile|so zalo)\b/u.test(normalizedLabel);
      const numericField = !phoneField && (
        element instanceof HTMLInputElement &&
          (['number', 'range'].includes(element.type) || ['decimal', 'numeric'].includes(element.inputMode)) ||
        /\b(so luong|sl|dinh muc|dm|don gia|gia|tien|thue|vat|ty le|phan tram|muc tieu)\b/u.test(normalizedLabel)
      );
      const kind = searchDropdown ? 'search-dropdown' : numericField ? 'number' : 'text';

      return [{ element, label, kind, aliases: Array.from(new Set(labels.flatMap(getAliases))) }];
    });
};

export const scanVisibleVoiceTabs = (): AutoVoiceTab[] => {
  if (typeof document === 'undefined') return [];
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>(
    'dialog[open], [role="dialog"], [aria-modal="true"]'
  )).filter(isVisibleInViewport);
  const root: ParentNode = dialogs[dialogs.length - 1] || document;
  const tabGroups = new Map<HTMLElement, AutoVoiceTab[]>();
  const addTab = (element: HTMLElement, group: HTMLElement, index: number, rawLabel: string) => {
    if (!isVisibleInViewport(element) || (element as HTMLButtonElement).disabled ||
      element.getAttribute('aria-disabled') === 'true') return;
    const label = rawLabel.replace(/^\s*.*?\d+\s*[.)]\s*/u, '').trim() || rawLabel.trim();
    const tabs = tabGroups.get(group) || [];
    if (!tabs.some(tab => tab.element === element)) {
      tabs.push({ element, label, index, group });
      tabGroups.set(group, tabs);
    }
  };

  const numberedButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
    .map(element => {
      const rawLabel = element.innerText || element.textContent || '';
      return {
        element,
        rawLabel,
        match: /^(\d+)\s+(.+)$/u.exec(normalize(rawLabel))
      };
    })
    .filter((item): item is { element: HTMLButtonElement; rawLabel: string; match: RegExpExecArray } =>
      Boolean(item.match) && isVisibleInViewport(item.element) && !item.element.disabled);
  const numberedParents = new Set(numberedButtons.map(item => item.element.parentElement)
    .filter((parent): parent is HTMLElement => parent instanceof HTMLElement));
  numberedParents.forEach(parent => {
    const siblings = numberedButtons.filter(item => item.element.parentElement === parent);
    if (siblings.length < 2) return;
    siblings.forEach(item => addTab(
      item.element,
      parent,
      Number(item.match[1]),
      item.rawLabel
    ));
  });

  const semanticTabs = Array.from(root.querySelectorAll<HTMLElement>(
    '[role="tab"], button[aria-selected], button[aria-pressed]'
  )).filter(element => isVisibleInViewport(element) &&
    !(element as HTMLButtonElement).disabled &&
    element.getAttribute('aria-disabled') !== 'true');
  const semanticParents = new Set(semanticTabs.map(element => element.parentElement)
    .filter((parent): parent is HTMLElement => parent instanceof HTMLElement));
  semanticParents.forEach(parent => {
    const siblings = semanticTabs.filter(element => element.parentElement === parent);
    siblings.forEach((element, index) => addTab(
      element,
      parent,
      index + 1,
      element.getAttribute('data-voice-label') ||
        element.getAttribute('aria-label') ||
        element.innerText ||
        element.textContent ||
        ''
    ));
  });

  return Array.from(tabGroups.values()).flat();
};

const setInputValue = (field: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const prototype = field instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) return false;
  setter.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
};

const numberWords = new Set([
  'khong', 'mot', 'hai', 'ba', 'bon', 'tu', 'nam', 'lam', 'sau', 'bay', 'tam',
  'chin', 'muoi', 'tram', 'ngan', 'nghin', 'trieu', 'ty', 'ruoi', 'dong', 'vnd'
]);

const speechFillers = new Set(['a', 'ah', 'da', 'em', 'la', 'oi', 'thi', 'uh', 'um', 'vang', 'vâng', 'ừm', 'ờ']);

const cleanSpokenText = (value: string) => {
  const words = value.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  while (words.length && speechFillers.has(normalize(words[0]))) words.shift();
  while (words.length && speechFillers.has(normalize(words[words.length - 1]))) words.pop();
  return words.join(' ').replace(/^[,;:.!?]+|[,;:.!?]+$/g, '').trim();
};

const hasRecognizableText = (value: string) =>
  normalize(value).split(' ').some(word => word && !speechFillers.has(word));

const parseNumberValue = (field: AutoVoiceField, rawValue: string): number | undefined => {
  const value = rawValue.trim();
  if (!value) return undefined;
  const numericInput = field.element instanceof HTMLInputElement &&
    ['number', 'range'].includes(field.element.type);
  if (numericInput && !/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/u.test(value)) return undefined;
  if (!numericInput && normalize(value).split(' ').some(token =>
    !numberWords.has(token) && !/^[+-]?\d+(?:[.,]\d+)?$/u.test(token))) return undefined;
  const parsed = parseVietnameseNumber(value);
  if (parsed === undefined || !Number.isFinite(parsed)) return undefined;
  const min = field.element.getAttribute('min');
  const max = field.element.getAttribute('max');
  if (min !== null && parsed < Number(min)) return undefined;
  if (max !== null && parsed > Number(max)) return undefined;
  return parsed;
};

const focusField = (field: AutoVoiceField) => {
  field.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  field.element.focus();
};

let lastNavigationAt = 0;
let lastAssignmentKey = '';
let lastAssignmentAt = 0;
let lastTabCommandKey = '';
let lastTabCommandAt = 0;

const getCurrentFieldLabel = (fields: AutoVoiceField[]) => {
  const active = document.activeElement;
  return fields.find(field => field.element === active)?.label || 'ô hiện tại';
};

const findNamedField = (normalizedCommand: string, rawCommand: string, fields: AutoVoiceField[]) => {
  const candidates = fields.flatMap(field => field.aliases.map(alias => ({ field, alias })))
    .filter(candidate => normalizedCommand === candidate.alias ||
      normalizedCommand.startsWith(`${candidate.alias} `))
    .sort((first, second) => second.alias.length - first.alias.length);
  if (!candidates.length) return null;
  const longest = candidates[0].alias.length;
  const matches = candidates.filter(candidate => candidate.alias.length === longest);
  const focusedMatches = matches.filter(match => match.field.element === document.activeElement);
  const uniqueFields = Array.from(new Set((focusedMatches.length ? focusedMatches : matches)
    .map(match => match.field)));
  if (uniqueFields.length !== 1) return { ambiguous: true as const };
  const alias = (focusedMatches.length ? focusedMatches : matches)[0].alias;
  let sourceOffset = 0;
  while (sourceOffset < rawCommand.length &&
    normalize(rawCommand.slice(0, sourceOffset)).length < alias.length) sourceOffset += 1;
  const value = cleanSpokenText(rawCommand.slice(sourceOffset).trim().replace(/^(?:là|la|:)\s*/iu, ''));
  return { field: uniqueFields[0], value, ambiguous: false as const };
};

const navigationCommand = (command: string) => {
  if (/^(?:o )?(?:tiep theo|sau|ke tiep)$/u.test(command)) return 'next';
  if (/^(?:o )?(?:truoc|phia truoc)$/u.test(command)) return 'previous';
  return null;
};

const tabNameAliases: Array<{ label: string; aliases: string[] }> = [
  { label: 'tao hd cty', aliases: ['tao hd cong ty', 'tao hop dong cong ty', 'hop dong cong ty'] },
  { label: 'tao hd to dan', aliases: ['tao hop dong to dan', 'hop dong to dan'] },
  { label: 'phu luc gia', aliases: ['phu luc gia sl', 'phu luc gia va so luong'] },
  { label: 'quan ly khung', aliases: ['quan ly khung to dan', 'khung to dan'] },
  { label: 'bang theo doi nhan', aliases: ['bang theo doi nhan chi coc', 'theo doi nhan chi coc', 'nhan chi coc'] }
];

const tabAliases = (label: string) => {
  const normalizedLabel = normalize(label);
  return [
    normalizedLabel,
    ...tabNameAliases.flatMap(item =>
      normalizedLabel.includes(item.label) ? [item.label, ...item.aliases] : [])
  ];
};

const processTabVoiceCommand = (command: string): LocalVoiceResult | null => {
  const commandPrefix = /^(?:(?:chuyen sang|chuyen qua|chuyen toi|qua|mo|chon|xem)\s+)/u;
  const hasActionPrefix = commandPrefix.test(command);
  if (!hasActionPrefix && !/^tab\s/u.test(command)) return null;
  const prefixRemoved = command.replace(commandPrefix, '');
  const numericMatch = /^(?:tab\s+)?(?:so\s+)?(\d+)$/u.exec(prefixRemoved);
  const tabs = scanVisibleVoiceTabs();
  if (!tabs.length) return null;

  let matches: AutoVoiceTab[];
  if (numericMatch) {
    const index = Number(numericMatch[1]);
    const groups = new Map<HTMLElement, AutoVoiceTab[]>();
    tabs.forEach(tab => groups.set(tab.group, [...(groups.get(tab.group) || []), tab]));
    const availableGroups = Array.from(groups.values()).filter(group =>
      group.some(tab => tab.index === index));
    const activeGroups = availableGroups.filter(group => group.some(tab =>
      tab.element.getAttribute('aria-selected') === 'true' ||
      tab.element.getAttribute('aria-pressed') === 'true'));
    const candidateGroups = activeGroups.length ? activeGroups : availableGroups;
    if (candidateGroups.length !== 1) {
      return {
        handled: true,
        message: candidateGroups.length
          ? 'Có nhiều nhóm tab đang mở — hãy gọi tên tab cần chuyển.'
          : `Không tìm thấy tab ${index} trên màn hình hiện tại.`
      };
    }
    matches = candidateGroups[0].filter(tab => tab.index === index);
  } else {
    const query = prefixRemoved.replace(/^tab\s+/u, '').replace(/^so\s+/u, '').trim();
    if (!query) return null;
    const normalizedQuery = normalize(query);
    const candidates = tabs.flatMap(tab =>
      tabAliases(tab.label).map(alias => ({ tab, alias }))
    );
    const exact = candidates.filter(candidate => candidate.alias === normalizedQuery);
    const matched = exact.length ? exact : candidates.filter(candidate =>
      candidate.alias.includes(normalizedQuery) || normalizedQuery.includes(candidate.alias));
    matches = Array.from(new Set(matched.map(candidate => candidate.tab)));
  }

  if (matches.length !== 1) {
    return matches.length
      ? { handled: true, message: `Có nhiều tab khớp với “${prefixRemoved}”. Hãy nói rõ tên tab.` }
      : null;
  }

  const tab = matches[0];
  const commandKey = `${tab.group.textContent || ''}:${tab.index}:${tab.label}`;
  const now = Date.now();
  if (commandKey === lastTabCommandKey && now - lastTabCommandAt < 1200) {
    return { handled: true, message: `Đã chuyển sang ${tab.label}.` };
  }
  tab.element.click();
  lastTabCommandKey = commandKey;
  lastTabCommandAt = now;
  return { handled: true, message: `Đã chuyển sang ${tab.label}.` };
};

const clearFieldCommand = (command: string, rawCommand: string, fields: AutoVoiceField[]): LocalVoiceResult | null => {
  const match = /^xoa(?:\s+(.+))?$/u.exec(command);
  if (!match) return null;
  const rawTarget = rawCommand.replace(/^xóa\b/iu, '').trim();
  let target = match[1] || '';
  if (/^(?:dong|muc)\b/u.test(target)) return null;

  target = target
    .replace(/^(?:(?:o|truong|noi dung|chu|gia tri)\s+)+/u, '')
    .replace(/\s+(?:o nay|nay)$/u, '')
    .trim();

  const genericTarget = !target || /^(?:o|truong|noi dung|chu|gia tri|nay|o nay|truong nay)$/u.test(target);
  let field: AutoVoiceField | undefined;
  if (genericTarget) {
    field = fields.find(item => item.element === document.activeElement);
  } else {
    const namedField = findNamedField(target, target, fields);
    if (namedField?.ambiguous) {
      return { handled: true, message: 'Chưa xác định được ô cần xóa — giữ nguyên dữ liệu, hãy nói rõ tên ô.' };
    }
    if (namedField && !namedField.value) field = namedField.field;
  }

  if (!field) {
    return {
      handled: true,
      message: genericTarget
        ? 'Không có ô nào đang focus — hãy chọn ô hoặc nói “xóa ô [tên ô]”.'
        : `Không tìm thấy ô “${rawTarget}” đang hiển thị — dữ liệu được giữ nguyên.`
    };
  }

  focusField(field);
  if (field.element instanceof HTMLSelectElement) {
    field.element.selectedIndex = -1;
    field.element.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (!setInputValue(field.element, '')) {
    return { handled: true, message: `Không thể xóa nội dung ${field.label} — dữ liệu được giữ nguyên.` };
  }
  lastAssignmentKey = '';
  lastAssignmentAt = 0;
  return { handled: true, message: `Đã xóa nội dung ${field.label} — chờ lệnh tiếp theo.` };
};

export const processAutoFieldVoiceCommand = (
  transcript: string,
  fields: AutoVoiceField[]
): LocalVoiceResult => {
  const rawCommand = transcript.trim().replace(/^(?:nhập|điền|cập nhật|nhap|dien|cap nhat)\s+/iu, '');
  const command = normalize(rawCommand);
  const clearResult = clearFieldCommand(command, rawCommand, fields);
  if (clearResult) return clearResult;
  const tabResult = processTabVoiceCommand(command);
  if (tabResult) return tabResult;
  const navigation = navigationCommand(command);
  if (navigation) {
    const now = Date.now();
    if (now - lastNavigationAt < 300) return { handled: true, message: 'Đang xử lý lệnh điều hướng.' };
    lastNavigationAt = now;
    if (!fields.length) {
      return { handled: true, message: 'Nghe chưa rõ — không có ô nhập liệu đang hiển thị, chờ lệnh tiếp theo.' };
    }
    const activeIndex = fields.findIndex(field => field.element === document.activeElement);
    const targetIndex = navigation === 'next'
      ? activeIndex < 0 ? 0 : (activeIndex + 1) % fields.length
      : activeIndex < 0 ? fields.length - 1 : (activeIndex - 1 + fields.length) % fields.length;
    focusField(fields[targetIndex]);
    return { handled: true, message: `Đã chuyển tới ô ${fields[targetIndex].label}.` };
  }

  const rowSelection = /^(?:chon )?(?:dong|hang) (\d+)$/u.exec(command);
  if (rowSelection) {
    const rowIndex = Number(rowSelection[1]) - 1;
    const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>('tbody tr'))
      .filter(row => isVisibleInViewport(row));
    const row = rows[rowIndex];
    if (!row) return { handled: true, message: `Không tìm thấy dòng ${rowIndex + 1} đang hiển thị.` };
    document.querySelectorAll('[data-voice-selected-row="true"]')
      .forEach(selected => selected.removeAttribute('data-voice-selected-row'));
    row.setAttribute('data-voice-selected-row', 'true');
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return { handled: true, message: `Đã chọn dòng ${rowIndex + 1}.` };
  }

  const assignment = findNamedField(command, rawCommand, fields);
  if (!assignment) {
    const activeField = fields.find(field => field.element === document.activeElement);
    if (!activeField || !['text', 'search-dropdown'].includes(activeField.kind) ||
      /^(?:mo|chon|bam|di den|chuyen den|quan ly|bao cao|trang chu|ngung|tam dung|xoa|sua|them|luu|dong|huy)\b/u.test(command)) {
      return { handled: false };
    }
    const value = cleanSpokenText(rawCommand);
    if (!value || !hasRecognizableText(value)) {
      return {
        handled: true,
        message: `Nghe chưa rõ — giữ nguyên ${activeField.label}, chờ lệnh tiếp theo.`
      };
    }
    return applyTextValue(activeField, value);
  }
  if (assignment.ambiguous) {
    return { handled: true, message: 'Nghe chưa rõ — tên ô khớp nhiều trường, giữ nguyên dữ liệu và chờ lệnh tiếp theo.' };
  }
  if (!assignment.value) {
    return { handled: true, message: `Nghe chưa rõ — giữ nguyên ${assignment.field.label}, chờ lệnh tiếp theo.` };
  }

  const assignmentKey = `${assignment.field.label}:${assignment.value}`;
  const now = Date.now();
  if (assignmentKey === lastAssignmentKey && now - lastAssignmentAt < 500) {
    return { handled: true, message: `Đã điền ${assignment.field.label}.` };
  }

  const field = assignment.field;
  const value = assignment.value;
  if (field.kind === 'number') {
    const parsed = parseNumberValue(field, value);
    if (parsed === undefined) {
      return { handled: true, message: `Nghe chưa rõ — giá trị không hợp lệ cho ${field.label}, giữ nguyên và chờ lệnh tiếp theo.` };
    }
    return applyTextValue(field, String(parsed));
  } else if (field.kind === 'search-dropdown') {
    if (field.element instanceof HTMLSelectElement) {
      focusField(field);
      const query = normalize(value);
      const options = Array.from(field.element.options).filter(option =>
        normalize(option.textContent || option.value).includes(query));
      if (options.length !== 1) {
        const message = options.length
          ? `Có nhiều lựa chọn phù hợp với “${value}” trong “${field.label}”.`
          : `Không tìm thấy lựa chọn “${value}” trong “${field.label}”.`;
        return { handled: true, message: `Nghe chưa rõ — ${message} Giữ nguyên ô và chờ lệnh tiếp theo.` };
      }
      field.element.value = options[0].value;
      field.element.dispatchEvent(new Event('change', { bubbles: true }));
      lastAssignmentKey = assignmentKey;
      lastAssignmentAt = now;
      return { handled: true, message: `Đã chọn “${options[0].textContent?.trim() || value}”.` };
    }
    return applyTextValue(field, value, `Đã lọc ${field.label} theo “${value}”.`);
  }

  return applyTextValue(field, value);
};

const applyTextValue = (
  field: AutoVoiceField,
  value: string,
  successMessage = `Đã điền ${field.label} ${value}.`
): LocalVoiceResult => {
  const assignmentKey = `${field.label}:${value}`;
  const now = Date.now();
  if (assignmentKey === lastAssignmentKey && now - lastAssignmentAt < 500) {
    return { handled: true, message: successMessage };
  }
  focusField(field);
  if (!(field.element instanceof HTMLInputElement || field.element instanceof HTMLTextAreaElement) ||
    !setInputValue(field.element, value)) {
    return {
      handled: true,
      message: `Nghe chưa rõ — không thể cập nhật ${field.label}, giữ nguyên và chờ lệnh tiếp theo.`
    };
  }
  if (field.element instanceof HTMLInputElement && field.element.hasAttribute('list') &&
    document.getElementById(field.element.getAttribute('list') || '') instanceof HTMLDataListElement &&
    'showPicker' in field.element) {
    try {
      field.element.showPicker();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotAllowedError')) throw error;
    }
  }
  lastAssignmentKey = assignmentKey;
  lastAssignmentAt = now;
  return { handled: true, message: successMessage };
};

export const getFocusedVoiceFieldLabel = (fields: AutoVoiceField[]) =>
  getCurrentFieldLabel(fields);
