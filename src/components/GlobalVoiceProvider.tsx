import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { parseVietnameseNumber } from '../utils/voiceFormParser';

type VoiceMode = 'sleeping' | 'wake' | 'command' | 'responding';

interface RecognitionResultLike {
  isFinal: boolean;
  0?: { transcript: string };
}

interface RecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type RecognitionConstructor = new () => RecognitionLike;

interface VoiceContextValue {
  mode: VoiceMode;
  enabled: boolean;
  error: string;
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

const wakePhrases = ['tro ly oi', 'luc binh oi'];
const stopPhrases = ['ngung', 'tam dung', 'thoi khong thao tac nua'];
const destinations: Array<{ tabId: string; phrases: string[]; label: string }> = [
  { tabId: 'inventoryStockReport', phrases: ['bao cao nxt hang dan', 'bao cao nxt'], label: 'Báo cáo NXT hàng đan' },
  { tabId: 'dashboard', phrases: ['trang chu', 'tong quan', 'dashboard'], label: 'Dashboard' },
  { tabId: 'categories', phrases: ['quan ly danh muc', 'danh muc'], label: 'Quản lý danh mục' },
  { tabId: 'contracts', phrases: ['quan ly hop dong', 'quan ly hd dan', 'hop dong'], label: 'Quản lý hợp đồng' },
  { tabId: 'inventory', phrases: ['bao cao khung son', 'bao cao ton kho', 'ton kho', 'phieu nhap'], label: 'Báo cáo khung sơn' },
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
  'người giao', 'ghi chú', 'lưu ý', 'nội dung', 'ngày', 'hạn trả nợ'
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

const getFieldValue = (transcript: string) => {
  const cleaned = transcript.trim().replace(/^(?:điền|nhập|cập nhật)\s+/iu, '');
  const normalized = normalize(cleaned);
  for (const alias of fieldAliases) {
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

const executeCommand = (transcript: string): string | Promise<string> => {
  const normalized = normalize(transcript);
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
    const field = fieldAliases.find(alias => normalized.includes(normalize(alias)));
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

const playWakeTone = (audioContext: AudioContext | null) => {
  const AudioContextConstructor = window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!audioContext && !AudioContextConstructor) return;
  try {
    const context = audioContext || (AudioContextConstructor ? new AudioContextConstructor() : null);
    if (!context) return;
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.value = 0.06;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  } catch {
    // Speech synthesis remains the audible confirmation if Web Audio is unavailable.
  }
};

export function GlobalVoiceProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<VoiceMode>('sleeping');
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState('');
  const modeRef = useRef<VoiceMode>('sleeping');
  const enabledRef = useRef(false);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const pendingSpeechRef = useRef<{ text: string; nextMode: VoiceMode } | null>(null);
  const startRecognitionRef = useRef<() => void>(() => undefined);
  const processingRef = useRef(false);

  useEffect(() => () => {
    enabledRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    window.speechSynthesis?.cancel();
    void audioContextRef.current?.close();
  }, []);

  const updateMode = useCallback((nextMode: VoiceMode) => {
    modeRef.current = nextMode;
    setMode(nextMode);
  }, []);

  const beginPendingSpeech = useCallback(() => {
    const pending = pendingSpeechRef.current;
    if (!pending) return;
    pendingSpeechRef.current = null;
    const synthesis = window.speechSynthesis;
    if (!synthesis) {
      setError('Trình duyệt chưa hỗ trợ đọc phản hồi bằng giọng nói.');
      updateMode(pending.nextMode);
      if (enabledRef.current) startRecognitionRef.current();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(pending.text);
    utterance.lang = 'vi-VN';
    const vietnameseVoice = synthesis.getVoices().find(voice =>
      voice.lang.toLocaleLowerCase().startsWith('vi')
    );
    if (vietnameseVoice) utterance.voice = vietnameseVoice;
    utterance.onend = () => {
      if (!enabledRef.current) return;
      updateMode(pending.nextMode);
      startRecognitionRef.current();
    };
    utterance.onerror = () => {
      if (!enabledRef.current) return;
      setError('Không thể phát phản hồi giọng nói.');
      updateMode(pending.nextMode);
      startRecognitionRef.current();
    };
    synthesis.speak(utterance);
  }, [updateMode]);

  const speak = useCallback((text: string, nextMode: VoiceMode) => {
    pendingSpeechRef.current = { text, nextMode };
    updateMode('responding');
    const recognition = recognitionRef.current;
    if (recognition) recognition.stop();
    else beginPendingSpeech();
  }, [beginPendingSpeech, updateMode]);

  const processTranscript = useCallback(async (transcript: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    const spoken = normalize(transcript);
    if (modeRef.current === 'wake') {
      if (!wakePhrases.some(phrase => spoken.includes(phrase))) {
        processingRef.current = false;
        return;
      }
      playWakeTone(audioContextRef.current);
      speak('Dạ em nghe đây, anh cần thao tác gì ạ?', 'command');
      processingRef.current = false;
      return;
    }

    if (stopPhrases.some(phrase => spoken === phrase || spoken.includes(phrase))) {
      speak('Dạ, em tạm ngưng. Gọi em khi anh cần nhé.', 'wake');
      processingRef.current = false;
      return;
    }

    try {
      const response = await executeCommand(transcript);
      window.dispatchEvent(new CustomEvent('erp:voice-command', { detail: transcript }));
      speak(response, 'command');
    } catch (commandError) {
      const message = commandError instanceof Error ? commandError.message : 'Lỗi không xác định.';
      setError(`Không thể thực hiện lệnh: ${message}`);
      speak('Em gặp lỗi khi thực hiện thao tác. Anh vui lòng thử lại.', 'command');
    } finally {
      processingRef.current = false;
    }
  }, [speak]);

  const startRecognition = useCallback(() => {
    if (!enabledRef.current || recognitionRef.current || modeRef.current === 'responding') return;
    const speechWindow = window as Window & {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError('Trình duyệt này chưa hỗ trợ nhận diện giọng nói. Hãy dùng Chrome hoặc Edge mới nhất.');
      enabledRef.current = false;
      setEnabled(false);
      updateMode('sleeping');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'vi-VN';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = event => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result.isFinal ? result[0]?.transcript?.trim() : '';
        if (transcript) {
          void processTranscript(transcript);
          break;
        }
      }
    };
    recognition.onerror = event => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('Không có quyền sử dụng micro. Hãy cấp quyền trong trình duyệt rồi bật trợ lý lại.');
        enabledRef.current = false;
        setEnabled(false);
        updateMode('sleeping');
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setError(`Không thể nhận diện giọng nói (${event.error}).`);
      }
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (pendingSpeechRef.current) {
        beginPendingSpeech();
      } else if (enabledRef.current && modeRef.current !== 'responding') {
        window.setTimeout(() => startRecognitionRef.current(), 180);
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (startError) {
      recognitionRef.current = null;
      setError(startError instanceof Error ? `Không thể bật micro: ${startError.message}` : 'Không thể bật micro.');
      enabledRef.current = false;
      setEnabled(false);
      updateMode('sleeping');
    }
  }, [beginPendingSpeech, processTranscript, updateMode]);

  startRecognitionRef.current = startRecognition;

  const toggle = useCallback(() => {
    if (enabledRef.current) {
      enabledRef.current = false;
      setEnabled(false);
      pendingSpeechRef.current = null;
      window.speechSynthesis?.cancel();
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      updateMode('sleeping');
      setError('');
      return;
    }
    setError('');
    enabledRef.current = true;
    setEnabled(true);
    const AudioContextConstructor = window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextConstructor && !audioContextRef.current) {
      try {
        audioContextRef.current = new AudioContextConstructor();
        void audioContextRef.current.resume().catch(() => undefined);
      } catch {
        audioContextRef.current = null;
      }
    }
    updateMode('wake');
    startRecognitionRef.current();
  }, [updateMode]);

  return (
    <VoiceContext.Provider value={{ mode, enabled, error, toggle }}>
      {children}
    </VoiceContext.Provider>
  );
}

export function GlobalVoiceButton() {
  const voice = useContext(VoiceContext);
  if (!voice) throw new Error('GlobalVoiceButton must be rendered inside GlobalVoiceProvider.');
  const labels: Record<VoiceMode, string> = {
    sleeping: 'Ngủ',
    wake: 'Chờ gọi tên',
    command: 'Đang nghe lệnh',
    responding: 'Đang phản hồi'
  };
  const colors: Record<VoiceMode, string> = {
    sleeping: '#475569',
    wake: '#0f766e',
    command: '#b91c1c',
    responding: '#7c3aed'
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
