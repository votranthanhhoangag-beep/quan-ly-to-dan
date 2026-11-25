import { useEffect, useRef, useState } from 'react';
import { parseVietnameseNumber } from '../utils/voiceFormParser';
import { useGlobalVoice } from './GlobalVoiceProvider';

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
  onNavigation?: (action: 'next' | 'previous' | 'clear') => string;
}

const fieldAliases = [
  { field: 'productCode', labels: ['mã sản phẩm', 'mã hàng', 'mã'] },
  { field: 'productName', labels: ['tên sản phẩm', 'tên hàng'] },
  { field: 'categoryCode', labels: ['mã danh mục', 'mã'] },
  { field: 'categoryName', labels: ['tên danh mục', 'tên'] },
  { field: 'unit', labels: ['đơn vị tính mặc định', 'đơn vị tính', 'đơn vị'] },
  { field: 'normPerUnit', labels: ['định mức nguyên vật liệu', 'định mức trên sản phẩm', 'định mức mỗi sản phẩm', 'định mức sản phẩm', 'định mức'] },
  { field: 'materialName', labels: ['nguyên vật liệu', 'nguyên phụ liệu'] },
  { field: 'receivedQuantity', labels: ['sl nhận hôm nay', 'số lượng nhận hôm nay', 'sl thực nhận', 'số lượng thực nhận', 'số lượng nhận', 'nhận hôm nay'] },
  { field: 'quantity', labels: ['số lượng', 'số bộ', 'số cái', 'sl'] },
  { field: 'unitPrice', labels: ['đơn giá', 'giá'] },
  { field: 'deposit', labels: ['tiền cọc', 'đặt cọc', 'số tiền cọc', 'cọc'] },
  { field: 'paidAmount', labels: ['đã trả', 'tiền trả', 'số tiền trả', 'thanh toán'] },
  { field: 'totalAmount', labels: ['thành tiền', 'tổng tiền', 'tổng cộng'] },
  { field: 'remainingAmount', labels: ['số tiền còn lại', 'còn lại'] },
  { field: 'contractNo', labels: ['số hợp đồng', 'hđ cty', 'hđ tổ đan', 'số hđ'] },
  { field: 'companyName', labels: ['tên công ty', 'công ty', 'nhà cung cấp', 'đối tác'] },
  { field: 'groupName', labels: ['tên tổ đan', 'tổ đan'] },
  { field: 'personName', labels: ['tên thợ', 'người nhận', 'người giao', 'người sửa', 'hộ đan'] },
  { field: 'phone', labels: ['số điện thoại', 'điện thoại', 'sdt'] },
  { field: 'zalo', labels: ['zalo', 'số zalo'] },
  { field: 'date', labels: ['ngày tháng', 'ngày'] },
  { field: 'dueDate', labels: ['hạn đan', 'hạn nhận', 'hạn giao', 'hạn'] },
  { field: 'lowStockLimit', labels: ['hạn mức tồn kho tối thiểu', 'hạn mức tồn kho', 'tồn kho tối thiểu'] },
  { field: 'vehicleName', labels: ['tên xe'] },
  { field: 'plateNo', labels: ['biển số xe', 'biển số'] },
  { field: 'modelYear', labels: ['đời xe', 'năm sản xuất'] },
  { field: 'note', labels: ['ghi chú', 'lưu ý', 'nội dung'] },
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

const findProductSuggestions = (options: HTMLElement[], query: string, ordinal?: number) => {
  if (ordinal !== undefined) {
    const option = options[ordinal - 1];
    return option ? [option] : [];
  }
  const normalizedQuery = normalizeProductSearch(query);
  return normalizedQuery
    ? options.filter(option => normalizeProductSearch(option.textContent || '').includes(normalizedQuery))
    : [];
};

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

const isProductCodeField = (field: FormField) => getFieldDescriptionParts(field)
  .some(part => normalizeVoiceText(part.text).includes('ma hang'));

const findExactProductSuggestion = (options: HTMLElement[], query: string) => {
  const normalizedQuery = normalizeProductSearch(query);
  if (!normalizedQuery) return [];
  return options.filter(option =>
    normalizeProductSearch(option.dataset.productCode || '') === normalizedQuery ||
    normalizeProductSearch(option.dataset.productName || '') === normalizedQuery
  );
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
    const description = getFieldDescriptionParts(field)
      .map(part => normalizeVoiceText(part.text))
      .join(' ');
    if (
      /(tu dong|tu nhay|tu sinh|he thong|thanh tien|tong tien|con lai|khong the sua|read only)/iu.test(description)
    ) return false;
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

const openDatalistSuggestions = (field: FormField, query?: string) => {
  if (!(field instanceof HTMLInputElement)) return false;
  const listId = field.getAttribute('list');
  if (!listId) return false;
  const datalist = document.getElementById(listId);
  if (!(datalist instanceof HTMLDataListElement)) return false;
  const options = Array.from(datalist.options);
  if (query?.trim()) {
    const normalizedQuery = normalizeProductSearch(query);
    const exact = options.find(option =>
      normalizeProductSearch(option.value) === normalizedQuery ||
      normalizeProductSearch(option.textContent || '') === normalizedQuery
    );
    const partial = options.find(option =>
      normalizeProductSearch(option.value).includes(normalizedQuery) ||
      normalizeProductSearch(option.textContent || '').includes(normalizedQuery)
    );
    const match = exact || partial;
    if (match) dispatchFieldValue(field, match.value);
  }
  if ('showPicker' in field) {
    try {
      (field as HTMLInputElement & { showPicker: () => void }).showPicker();
    } catch {
      // Browsers may reject showPicker until a direct user gesture.
    }
  }
  return true;
};

const matchCurrentOrFirstField = (
  form: HTMLFormElement,
  label: string,
  currentField: FormField | null
) => {
  const normalizedLabel = normalizeVoiceText(label);
  const currentMatches = currentField && form.contains(currentField) &&
    getFieldDescriptionParts(currentField).some(part =>
      normalizeVoiceText(part.text).includes(normalizedLabel)
    );
  return currentMatches ? currentField : matchFormField(form, label);
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

export default function VoiceFillControl({ onTranscript, onFieldFocus, onNavigation }: VoiceFillControlProps) {
  const globalVoice = useGlobalVoice();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const onFieldFocusRef = useRef(onFieldFocus);
  const onNavigationRef = useRef(onNavigation);
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
    onFieldFocusRef.current = onFieldFocus;
  }, [onFieldFocus]);

  useEffect(() => {
    onNavigationRef.current = onNavigation;
  }, [onNavigation]);

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

  useEffect(() => {
    if (!globalVoice?.enabled) return;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, [globalVoice?.enabled]);

  const applyNavigation = (action: 'next' | 'previous' | 'clear') => {
    const form = getForm(rootRef.current);
    if (!form) {
      return onNavigationRef.current?.(action) || 'Không tìm thấy biểu mẫu để điều hướng.';
    }

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
    const selectionMatch = /^(?:chọn|chon)\s+(.+)$/iu.exec(text);
    if (selectionMatch && form) {
      const requested = selectionMatch[1].trim();
      const normalizedRequest = normalizeVoiceText(requested);
      const ordinalMatch = /^dong\s+(\d+)$/u.exec(normalizedRequest);
      const options = Array.from(form.querySelectorAll<HTMLElement>(
        '[data-voice-suggestions="product-code"] [role="option"]'
      ));
      const query = requested.replace(/^(?:(?:mã hàng|ma hang)|mã|ma)\s+/iu, '');
      const matchingOptions = findProductSuggestions(
        options,
        query,
        ordinalMatch ? Number(ordinalMatch[1]) : undefined
      );
      const selectedOption = matchingOptions.length === 1 ? matchingOptions[0] : undefined;
      if (selectedOption) {
        const selectedLabel = selectedOption.textContent?.trim() || requested;
        selectedOption.click();
        setSummary(`Đã chọn gợi ý ${selectedLabel}.`);
        return;
      }
      if (matchingOptions.length > 1) {
        setSummary(`Có ${matchingOptions.length} gợi ý phù hợp. Hãy nói “chọn dòng 1” hoặc chạm chọn.`);
        return;
      }

      const productCodeField = matchCurrentOrFirstField(form, 'mã hàng', lastFocusedFieldRef.current);
      if (productCodeField) {
        form.querySelectorAll('[data-voice-active-field="true"]').forEach(item => {
          item.removeAttribute('data-voice-active-field');
        });
        focusFormField(productCodeField);
        lastFocusedFieldRef.current = productCodeField;
        setFocusedFieldName(describeField(productCodeField));
      }
      const filterQuery = ordinalMatch
        ? undefined
        : requested.replace(/^(?:(?:mã hàng|ma hang)|mã|ma)\s+/iu, '');
      onFieldFocusRef.current?.('productCode', filterQuery);
      setSummary('Đang mở danh sách gợi ý để chọn…');
      window.setTimeout(() => {
        const refreshedForm = getForm(rootRef.current);
        const refreshedOptions = refreshedForm
          ? Array.from(refreshedForm.querySelectorAll<HTMLElement>(
            '[data-voice-suggestions="product-code"] [role="option"]'
          ))
          : [];
        const refreshedMatches = findProductSuggestions(
          refreshedOptions,
          filterQuery || '',
          ordinalMatch ? Number(ordinalMatch[1]) : undefined
        );
        const matchingOption = refreshedMatches.length === 1 ? refreshedMatches[0] : undefined;
        if (matchingOption) {
          const selectedLabel = matchingOption.textContent?.trim() || requested;
          matchingOption.click();
          setSummary(`Đã chọn gợi ý ${selectedLabel}.`);
        } else if (refreshedMatches.length > 1) {
          setSummary(`Có ${refreshedMatches.length} gợi ý phù hợp. Hãy nói “chọn dòng 1” hoặc chạm chọn.`);
        } else {
          setSummary('Chưa thấy gợi ý phù hợp. Hãy thử từ khóa khác hoặc chạm vào một dòng trong danh sách.');
        }
      }, 0);
      return;
    }

    const fieldCue = extractFieldCue(text);
    if (form && fieldCue && !fieldCue.value) {
      const target = matchCurrentOrFirstField(form, fieldCue.label, lastFocusedFieldRef.current);
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
      onFieldFocusRef.current?.(fieldCue.field);
      openDatalistSuggestions(target);
      setSummary(`Đang chọn ô ${describeField(target)}.`);
      return;
    }

    if (form && fieldCue?.value && ['productCode', 'productName'].includes(fieldCue.field)) {
      const productCodeField = matchCurrentOrFirstField(form, 'mã hàng', lastFocusedFieldRef.current);
      if (productCodeField) {
        form.querySelectorAll('[data-voice-active-field="true"]').forEach(item => {
          item.removeAttribute('data-voice-active-field');
        });
        focusFormField(productCodeField);
        lastFocusedFieldRef.current = productCodeField;
        setFocusedFieldName(describeField(productCodeField));
        onFieldFocusRef.current?.('productCode', fieldCue.value);
        openDatalistSuggestions(productCodeField, fieldCue.value);
      }
    }

    const result = onTranscriptRef.current(text);
    setSummary(result);
    if (result.startsWith('Chưa nhận ra') && form) {
      const currentField = fieldCue
        ? matchCurrentOrFirstField(form, fieldCue.label, lastFocusedFieldRef.current)
        : lastFocusedFieldRef.current;
      if (currentField && form.contains(currentField) && isProductCodeField(currentField) &&
        onFieldFocusRef.current) {
        const query = fieldCue?.value || text;
        form.querySelectorAll('[data-voice-active-field="true"]').forEach(item => {
          item.removeAttribute('data-voice-active-field');
        });
        focusFormField(currentField);
        lastFocusedFieldRef.current = currentField;
        setFocusedFieldName(describeField(currentField));
        onFieldFocusRef.current('productCode', query);
        setSummary('Đang lọc gợi ý mã hàng…');
        window.setTimeout(() => {
          const refreshedForm = getForm(rootRef.current);
          const refreshedOptions = refreshedForm
            ? Array.from(refreshedForm.querySelectorAll<HTMLElement>(
              '[data-voice-suggestions="product-code"] [role="option"]'
            ))
            : [];
          const exactMatches = findExactProductSuggestion(refreshedOptions, query);
          if (exactMatches.length === 1) {
            const selectedLabel = exactMatches[0].textContent?.trim() || query;
            exactMatches[0].click();
            setSummary(`Đã chọn gợi ý ${selectedLabel}.`);
          } else if (exactMatches.length > 1) {
            setSummary(`Có ${exactMatches.length} gợi ý trùng khớp. Hãy chọn trực tiếp hoặc nói “chọn dòng 1”.`);
          } else {
            setSummary('Danh sách đã được lọc. Chạm chọn mã phù hợp hoặc nói “chọn [mã hàng]”.');
          }
        }, 0);
        return;
      }

      if (fieldCue) {
        const target = matchCurrentOrFirstField(form, fieldCue.label, lastFocusedFieldRef.current);
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
        {!globalVoice?.enabled && (
          <>
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
          </>
        )}
        <span style={{ color: isListening || (globalVoice?.enabled && (globalVoice.mode === 'listening_command' || globalVoice.mode === 'speaking')) ? '#b91c1c' : '#475569', fontSize: '11px', fontWeight: 700, overflowWrap: 'break-word' }}>
          vi-VN · {globalVoice?.enabled
            ? globalVoice.mode === 'speaking'
              ? 'Đang phản hồi'
              : globalVoice.mode === 'waiting_name'
                ? 'Chờ gọi “Trợ lý”'
                : 'Đang nghe lệnh'
            : isListening ? 'Đang nghe' : 'Đã dừng'}
          {!globalVoice?.enabled && focusedFieldName ? ` · Ô: ${focusedFieldName}` : ''}
        </span>
      </div>
      {globalVoice?.enabled || (globalVoice?.heard && globalVoice.result) ? (
        <>
          {globalVoice?.heard && (
            <div aria-live="polite" style={{ color: '#475569', fontSize: '12px', overflowWrap: 'anywhere' }}>
              Đã nghe: {globalVoice.heard}
            </div>
          )}
          {globalVoice?.result && (
            <div role="status" style={{ color: '#166534', fontSize: '12px', fontWeight: 600, overflowWrap: 'anywhere' }}>
              {globalVoice.result}
            </div>
          )}
        </>
      ) : (isListening || transcript) && (
        <div aria-live="polite" style={{ color: isListening ? '#b91c1c' : '#475569', fontSize: '12px', overflowWrap: 'anywhere' }}>
          {isListening ? transcript || 'Đang chờ bạn nói…' : `Đã nghe: ${transcript}`}
        </div>
      )}
      {globalVoice?.enabled && globalVoice.error && <div role="status" style={{ color: '#9a3412', fontSize: '12px' }}>{globalVoice.error}</div>}
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
