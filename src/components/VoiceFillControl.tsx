import { useEffect, useRef, useState } from 'react';
import { parseVietnameseNumber } from '../utils/voiceFormParser';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike extends ArrayLike<SpeechRecognitionAlternativeLike> {
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type FormField = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

interface VoiceFillControlProps {
  onTranscript: (transcript: string) => string;
  onFieldFocus?: (field: string, query?: string) => void;
}

const fieldAliases = [
  { field: 'productCode', labels: ['mã sản phẩm', 'mã hàng', 'mã'] },
  { field: 'productName', labels: ['tên sản phẩm', 'tên hàng'] },
  { field: 'companyName', labels: ['tên công ty', 'công ty'] },
  { field: 'groupName', labels: ['tên tổ đan', 'tổ đan'] },
  { field: 'quantity', labels: ['số lượng nhận hôm nay', 'sl nhận hôm nay', 'số lượng thực nhận', 'sl thực nhận', 'số lượng', 'số bộ', 'số cái', 'sl'] },
  { field: 'normPerUnit', labels: ['định mức trên sản phẩm', 'định mức mỗi sản phẩm', 'định mức sản phẩm', 'định mức'] },
  { field: 'unitPrice', labels: ['đơn giá'] },
  { field: 'note', labels: ['ghi chú', 'lưu ý'] },
  { field: 'personName', labels: ['tên thợ', 'người nhận', 'người sửa'] }
].flatMap(item => item.labels.map(label => ({ field: item.field, label })))
  .sort((first, second) => second.label.length - first.label.length);

const normalizeVoiceText = (value: string) => value
  .toLocaleLowerCase('vi')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeProductSearch = (value: string) => normalizeVoiceText(value).replace(/\s/g, '');

const getForm = (element: HTMLElement | null) => element?.closest('form') || null;

const getFieldDescriptionParts = (field: FormField) => {
  const labelText = field.labels ? Array.from(field.labels).map(label => label.textContent || '').join(' ') : '';
  const wrapperLabel = field.closest('label')?.textContent || '';
  const previousText = field.parentElement?.previousElementSibling?.textContent || '';
  const parentText = field.parentElement?.textContent || '';
  return [
    { text: field.getAttribute('aria-label') || '', priority: 5 },
    { text: labelText || wrapperLabel, priority: 5 },
    { text: field.getAttribute('placeholder') || '', priority: 4 },
    { text: previousText, priority: 3 },
    { text: [field.getAttribute('name'), field.id].filter(Boolean).join(' '), priority: 2 },
    { text: parentText, priority: 1 }
  ].filter(part => part.text.trim());
};

const describeField = (field: FormField) => {
  const parts = getFieldDescriptionParts(field);
  return (parts.find(part => part.priority >= 3)?.text || parts[0]?.text || 'Trường nhập liệu')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
};

const getFormFields = (form: HTMLFormElement): FormField[] =>
  Array.from(form.querySelectorAll<FormField>('input, select, textarea')).filter(field => {
    if (field.disabled || field.hidden || field.getAttribute('aria-hidden') === 'true') return false;
    if ((field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) && field.readOnly) return false;
    if (field instanceof HTMLInputElement &&
      ['hidden', 'button', 'submit', 'reset', 'image', 'file', 'checkbox', 'radio'].includes(field.type)) return false;
    return window.getComputedStyle(field).display !== 'none' && window.getComputedStyle(field).visibility !== 'hidden';
  });

const matchFormField = (form: HTMLFormElement, label: string) => {
  const normalizedLabel = normalizeVoiceText(label);
  const candidates = getFormFields(form).flatMap(field => {
    const matches = getFieldDescriptionParts(field)
      .filter(part => normalizeVoiceText(part.text).includes(normalizedLabel))
      .map(part => part.priority);
    return matches.length ? [{ field, score: Math.max(...matches) }] : [];
  });
  return candidates.sort((first, second) => second.score - first.score)[0]?.field;
};

const focusFormField = (field: FormField) => {
  field.dataset.voiceActiveField = 'true';
  field.scrollIntoView({ behavior: 'smooth', block: 'center' });
  field.focus({ preventScroll: true });
};

const dispatchFieldValue = (field: FormField, value: string) => {
  if (field instanceof HTMLSelectElement) {
    const normalizedValue = normalizeVoiceText(value);
    const option = Array.from(field.options).find(item =>
      normalizeVoiceText(item.textContent || item.value) === normalizedValue
    );
    if (value && !option) return false;
    if (option) field.value = option.value;
    else field.selectedIndex = -1;
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  const numeric = field instanceof HTMLInputElement &&
    ['number', 'range'].includes(field.type) ||
    field.getAttribute('inputmode') === 'decimal' ||
    field.getAttribute('inputmode') === 'numeric';
  const parsedNumber = numeric ? parseVietnameseNumber(value) : undefined;
  const nextValue = numeric && parsedNumber !== undefined ? String(parsedNumber) : value;
  const prototype = field instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!valueSetter) return false;
  valueSetter.call(field, nextValue);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
};

const extractFieldCue = (transcript: string) => {
  const withoutPrefix = transcript.trim().replace(/^(?:(?:ô|o|tới|toi|đến|den|trường|truong|field|focus)\s+)+/iu, '');
  const normalized = normalizeVoiceText(withoutPrefix);
  const cue = fieldAliases.find(item =>
    normalized === normalizeVoiceText(item.label) ||
    normalized.startsWith(`${normalizeVoiceText(item.label)} `)
  );
  if (!cue) return null;

  let rawOffset = 0;
  for (const character of withoutPrefix) {
    rawOffset += character.length;
    const normalizedLength = normalizeVoiceText(withoutPrefix.slice(0, rawOffset)).length;
    if (normalizedLength >= normalizeVoiceText(cue.label).length) break;
  }
  return {
    ...cue,
    value: withoutPrefix.slice(rawOffset).trim().replace(/^[,:\s]+/, '')
  };
};

const isNavigationCommand = (transcript: string) => {
  const command = normalizeVoiceText(transcript);
  if (['o tiep theo', 'tiep tuc', 'sang o sau', 'o sau', 'tiep theo'].includes(command)) return 'next';
  if (['o truoc', 'quay lai', 'sang o truoc'].includes(command)) return 'previous';
  if (['xoa o nay', 'xoa truong nay'].includes(command)) return 'clear';
  return null;
};

export default function VoiceFillControl({ onTranscript, onFieldFocus }: VoiceFillControlProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const lastFocusedFieldRef = useRef<FormField | null>(null);
  const lastHandledTranscriptRef = useRef('');
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [message, setMessage] = useState('');
  const [summary, setSummary] = useState('');
  const [focusedFieldName, setFocusedFieldName] = useState('');

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    const form = getForm(rootRef.current);
    if (!form) return;

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !form.contains(target)) return;
      if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      const field = target as FormField;
      form.querySelectorAll('[data-voice-active-field="true"]').forEach(item => {
        item.removeAttribute('data-voice-active-field');
      });
      field.dataset.voiceActiveField = 'true';
      lastFocusedFieldRef.current = field;
      setFocusedFieldName(describeField(field));
    };

    form.addEventListener('focusin', handleFocusIn);
    return () => form.removeEventListener('focusin', handleFocusIn);
  }, []);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    lastFocusedFieldRef.current?.removeAttribute('data-voice-active-field');
  }, []);

  const applyNavigation = (action: 'next' | 'previous' | 'clear') => {
    const form = getForm(rootRef.current);
    if (!form) return 'Không tìm thấy biểu mẫu để điều hướng.';

    const fields = getFormFields(form);
    const currentField = lastFocusedFieldRef.current;
    const currentIndex = currentField ? fields.indexOf(currentField) : -1;
    if (action === 'clear') {
      if (!currentField || !form.contains(currentField)) return 'Hãy chọn ô cần xóa trước.';
      const cleared = dispatchFieldValue(currentField, '');
      return cleared ? `Đã xóa ô ${describeField(currentField)}.` : 'Không thể xóa ô đang chọn.';
    }

    if (!fields.length) return 'Biểu mẫu chưa có ô nhập liệu khả dụng.';
    const nextIndex = action === 'next'
      ? (currentIndex + 1 + fields.length) % fields.length
      : (currentIndex <= 0 ? fields.length - 1 : currentIndex - 1);
    const nextField = fields[nextIndex];
    form.querySelectorAll('[data-voice-active-field="true"]').forEach(item => {
      item.removeAttribute('data-voice-active-field');
    });
    focusFormField(nextField);
    lastFocusedFieldRef.current = nextField;
    setFocusedFieldName(describeField(nextField));
    return `Đã chuyển tới ô ${describeField(nextField)}.`;
  };

  const handleTranscript = (spokenText: string) => {
    const text = spokenText.trim();
    if (!text) return;
    setTranscript(text);

    const navigation = isNavigationCommand(text);
    if (navigation) {
      setSummary(applyNavigation(navigation));
      return;
    }

    const form = getForm(rootRef.current);
    const selectionMatch = /^chọn\s+(.+)$/iu.exec(text);
    if (selectionMatch && form) {
      const requested = selectionMatch[1].trim();
      const normalizedRequest = normalizeVoiceText(requested);
      const ordinalMatch = /^dòng\s+(\d+)$/u.exec(normalizedRequest);
      const options = Array.from(form.querySelectorAll<HTMLElement>('[role="option"]'));
      const selectedOption = ordinalMatch
        ? options[Number(ordinalMatch[1]) - 1]
        : options.find(option => {
          const optionText = normalizeProductSearch(option.textContent || '');
          const query = normalizeProductSearch(requested.replace(/^(?:mã hàng|mã)\s+/iu, ''));
          return query && optionText.includes(query);
        });
      if (selectedOption) {
        const selectedLabel = selectedOption.textContent?.trim() || requested;
        selectedOption.click();
        setSummary(`Đã chọn gợi ý ${selectedLabel}.`);
        return;
      }

      onFieldFocus?.('productCode', requested.replace(/^(?:mã hàng|mã)\s+/iu, ''));
      setSummary('Chưa thấy gợi ý phù hợp. Đang mở danh sách theo từ khóa; hãy thử chọn lại hoặc nói rõ mã hàng.');
      return;
    }

    const fieldCue = extractFieldCue(text);
    if (form && fieldCue && !fieldCue.value) {
      const target = matchFormField(form, fieldCue.label);
      if (!target) {
        setSummary(`Không tìm thấy ô ${fieldCue.label} trong biểu mẫu này.`);
        return;
      }
      form.querySelectorAll('[data-voice-active-field="true"]').forEach(item => {
        item.removeAttribute('data-voice-active-field');
      });
      focusFormField(target);
      lastFocusedFieldRef.current = target;
      setFocusedFieldName(describeField(target));
      onFieldFocus?.(fieldCue.field);
      setSummary(`Đang chọn ô ${describeField(target)}.`);
      return;
    }

    const result = onTranscriptRef.current(text);
    setSummary(result);
    if (form && fieldCue?.value && ['productCode', 'productName'].includes(fieldCue.field)) {
      const productCodeField = matchFormField(form, 'mã hàng');
      if (productCodeField) {
        form.querySelectorAll('[data-voice-active-field="true"]').forEach(item => {
          item.removeAttribute('data-voice-active-field');
        });
        focusFormField(productCodeField);
        lastFocusedFieldRef.current = productCodeField;
        setFocusedFieldName(describeField(productCodeField));
        onFieldFocus?.('productCode', fieldCue.value);
      }
    }
    if (result.startsWith('Chưa nhận ra') && form) {
      if (fieldCue) {
        const target = matchFormField(form, fieldCue.label);
        if (target && dispatchFieldValue(target, fieldCue.value)) {
          form.querySelectorAll('[data-voice-active-field="true"]').forEach(item => {
            item.removeAttribute('data-voice-active-field');
          });
          focusFormField(target);
          lastFocusedFieldRef.current = target;
          setFocusedFieldName(describeField(target));
          setSummary(`Đã điền ô ${describeField(target)}. Vui lòng kiểm tra lại.`);
        }
      } else {
        const target = lastFocusedFieldRef.current;
        if (target && form.contains(target) && dispatchFieldValue(target, text)) {
          setSummary(`Đã điền ô ${describeField(target)}. Vui lòng kiểm tra lại.`);
        }
      }
    }
  };

  const startListening = () => {
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SpeechRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMessage('Trình duyệt chưa hỗ trợ nhập giọng nói. Hãy dùng Chrome hoặc Edge mới nhất.');
      return;
    }

    setMessage('');
    setTranscript('');
    setSummary('');
    lastHandledTranscriptRef.current = '';
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'vi-VN';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.onresult = event => {
        let currentTranscript = '';
        let finalTranscript = '';
        for (let index = 0; index < event.results.length; index += 1) {
          const phrase = event.results[index][0]?.transcript || '';
          currentTranscript += `${phrase} `;
          if (event.results[index].isFinal) finalTranscript += `${phrase} `;
        }
        setTranscript(currentTranscript.trim());
        const finalText = finalTranscript.trim();
        if (finalText && finalText !== lastHandledTranscriptRef.current) {
          lastHandledTranscriptRef.current = finalText;
          handleTranscript(finalText);
        }
      };
      recognition.onerror = event => {
        setIsListening(false);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setMessage('Chưa có quyền dùng micro. Hãy cho phép micro trong cài đặt trình duyệt rồi thử lại.');
        } else if (event.error === 'no-speech') {
          setMessage('Chưa nghe rõ tiếng nói. Hãy thử nói lại gần micro hơn.');
        } else if (event.error !== 'aborted') {
          setMessage('Không thể nhận diện giọng nói lúc này. Hãy thử lại hoặc nhập bằng bàn phím.');
        }
      };
      recognition.onend = () => {
        setIsListening(false);
        if (recognitionRef.current === recognition) recognitionRef.current = null;
      };
      recognitionRef.current = recognition;
      setIsListening(true);
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
      setMessage('Không thể bật micro. Hãy kiểm tra quyền truy cập micro của trình duyệt.');
    }
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const quickMove = (direction: 'next' | 'previous') => {
    setSummary(applyNavigation(direction));
  };

  return (
    <div ref={rootRef} style={{ display: 'grid', gap: '6px', minWidth: 0, maxWidth: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={isListening ? stopListening : startListening}
          aria-pressed={isListening}
          style={{
            padding: '7px 10px',
            border: 0,
            borderRadius: '6px',
            backgroundColor: isListening ? '#dc2626' : '#0f766e',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer',
            animation: isListening ? 'voice-fill-pulse 1.2s ease-in-out infinite' : undefined
          }}
        >
          {isListening ? '⏹ Dừng nghe' : '🎙 Nói để điền'}
        </button>
        <button type="button" onClick={() => quickMove('previous')} aria-label="Chuyển tới ô trước" style={quickButtonStyle}>← Ô trước</button>
        <button type="button" onClick={() => quickMove('next')} aria-label="Chuyển tới ô tiếp theo" style={quickButtonStyle}>Ô tiếp →</button>
        <span style={{ color: isListening ? '#b91c1c' : '#475569', fontSize: '11px', fontWeight: 700 }}>
          vi-VN · {isListening ? 'Đang nghe' : 'Đã dừng'}{focusedFieldName ? ` · Ô: ${focusedFieldName}` : ''}
        </span>
      </div>
      {(isListening || transcript) && (
        <div aria-live="polite" style={{ color: isListening ? '#b91c1c' : '#475569', fontSize: '12px', overflowWrap: 'anywhere' }}>
          {isListening ? transcript || 'Đang chờ bạn nói…' : `Đã nghe: ${transcript}`}
        </div>
      )}
      {message && <div role="status" style={{ color: '#9a3412', fontSize: '12px' }}>{message}</div>}
      {summary && <div role="status" style={{ color: '#166534', fontSize: '12px', fontWeight: 600 }}>{summary}</div>}
      <style>{`
        @keyframes voice-fill-pulse { 50% { opacity: .55; } }
        [data-voice-active-field="true"] {
          outline: 3px solid #f59e0b !important;
          outline-offset: 2px !important;
          scroll-margin-block: 24px;
        }
        @media (max-width: 640px) {
          [data-voice-active-field="true"] {
            outline-width: 3px !important;
          }
        }
      `}</style>
    </div>
  );
}

const quickButtonStyle = {
  padding: '7px 9px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  backgroundColor: '#fff',
  color: '#334155',
  fontSize: '12px',
  fontWeight: 700,
  cursor: 'pointer'
};
