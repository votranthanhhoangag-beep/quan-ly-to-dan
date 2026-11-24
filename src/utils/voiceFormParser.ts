export interface VoiceFormFields {
  productCode?: string;
  productName?: string;
  companyName?: string;
  quantity?: number;
  normPerUnit?: number;
  unit?: 'Bộ' | 'Cái';
  unitPrice?: number;
  totalAmount?: number;
  paidAmount?: number;
  deposit?: number;
  groupName?: string;
  personName?: string;
  category?: string;
  note?: string;
}

const numberWords: Record<string, number> = {
  khong: 0,
  mot: 1,
  hai: 2,
  ba: 3,
  bon: 4,
  tu: 4,
  nam: 5,
  lam: 5,
  sau: 6,
  bay: 7,
  tam: 8,
  chin: 9
};

const fieldLabels: Array<{ field: keyof VoiceFormFields; labels: string[] }> = [
  { field: 'productCode', labels: ['mã sản phẩm', 'mã hàng', 'mã', 'code'] },
  { field: 'productName', labels: ['tên sản phẩm', 'tên hàng'] },
  { field: 'companyName', labels: ['tên công ty', 'công ty'] },
  { field: 'normPerUnit', labels: ['định mức trên sản phẩm', 'định mức mỗi sản phẩm', 'định mức sản phẩm', 'định mức'] },
  { field: 'quantity', labels: ['số lượng nhận hôm nay', 'sl nhận hôm nay', 'số lượng thực nhận', 'sl thực nhận', 'số lượng', 'số bộ', 'số cái', 'sl'] },
  { field: 'unitPrice', labels: ['đơn giá', 'giá'] },
  { field: 'paidAmount', labels: ['số tiền trả', 'tiền trả', 'đã trả'] },
  { field: 'totalAmount', labels: ['thành tiền', 'tổng tiền', 'tổng cộng'] },
  { field: 'deposit', labels: ['tiền cọc', 'đặt cọc', 'cọc'] },
  { field: 'groupName', labels: ['tên tổ đan', 'tổ đan', 'tổ'] },
  { field: 'personName', labels: ['nhà cung cấp', 'tên cơ sở', 'người chi', 'người nhận', 'người giao', 'đối tác', 'hộ đan', 'thợ'] },
  { field: 'category', labels: ['khoản chi', 'danh mục'] },
  { field: 'note', labels: ['ghi chú', 'lưu ý', 'nội dung'] }
];

const orderedLabels = fieldLabels.flatMap(item =>
  item.labels.map(label => ({ field: item.field, label }))
).sort((first, second) => second.label.length - first.label.length);

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeNumericToken = (token: string) => {
  const separators = token.match(/[.,]/g) || [];
  if (separators.length === 0) return Number(token);
  const lastSeparatorIndex = Math.max(token.lastIndexOf(','), token.lastIndexOf('.'));
  const decimalLength = token.length - lastSeparatorIndex - 1;
  if (decimalLength === 3 && separators.length > 0) return Number(token.replace(/[.,]/g, ''));
  return Number(token.slice(0, lastSeparatorIndex).replace(/[.,]/g, '') + '.' + token.slice(lastSeparatorIndex + 1));
};

export const parseVietnameseNumber = (input: string): number | undefined => {
  const cleaned = input.toLocaleLowerCase('vi')
    .replace(/việt nam đồng|đồng|vnd|vnđ|₫/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return undefined;

  const tokens = cleaned.match(/\d+(?:[.,]\d+)*|[a-zà-ỹ]+/giu) || [];
  let total = 0;
  let section = 0;
  let pending: number | undefined;
  let found = false;

  for (const token of tokens) {
    if (/^\d/.test(token)) {
      const value = normalizeNumericToken(token);
      if (!Number.isFinite(value)) continue;
      pending = value;
      found = true;
      continue;
    }

    const word = token.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
    if (Object.prototype.hasOwnProperty.call(numberWords, word)) {
      pending = numberWords[word];
      found = true;
      continue;
    }

    if (token === 'mươi') {
      section += (pending ?? 1) * 10;
      pending = undefined;
      found = true;
      continue;
    }
    if (token === 'mười') {
      section += 10;
      pending = undefined;
      found = true;
      continue;
    }
    if (word === 'tram') {
      section += (pending ?? 1) * 100;
      pending = undefined;
      found = true;
      continue;
    }
    const scale = word === 'ngan' || word === 'nghin' || word === 'k'
      ? 1_000
      : word === 'trieu'
        ? 1_000_000
        : word === 'ty'
          ? 1_000_000_000
          : 0;
    if (scale) {
      total += (section + (pending ?? 0)) * scale;
      section = 0;
      pending = undefined;
      found = true;
    }
  }

  if (!found) return undefined;
  const result = total + section + (pending || 0);
  return Number.isFinite(result) ? result : undefined;
};

const extractVoiceFields = (transcript: string): Partial<Record<keyof VoiceFormFields, string>> => {
  const labels = orderedLabels.map(item => escapeRegex(item.label)).join('|');
  const cuePattern = new RegExp(`(^|[\\s,;])(${labels})(?:\\s*(?:là|:))?\\s*`, 'giu');
  const cues: Array<{ field: keyof VoiceFormFields; cueStart: number; valueStart: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = cuePattern.exec(transcript)) !== null) {
    const matchedLabel = match[2].toLocaleLowerCase('vi');
    const field = orderedLabels.find(item => item.label === matchedLabel)?.field;
    if (field) {
      cues.push({
        field,
        cueStart: match.index + match[1].length,
        valueStart: cuePattern.lastIndex
      });
    }
  }

  const result: Partial<Record<keyof VoiceFormFields, string>> = {};
  cues.forEach((cue, index) => {
    const nextCueStart = cues[index + 1]?.cueStart ?? transcript.length;
    const rawValue = transcript.slice(cue.valueStart, nextCueStart)
      .split(/[.!?;]/, 1)[0]
      .trim()
      .replace(/^[,:\s]+|[,:\s]+$/g, '');
    if (rawValue && result[cue.field] === undefined) result[cue.field] = rawValue;
  });
  return result;
};

const parseNumberField = (value?: string) => value
  ? parseVietnameseNumber(value.replace(/(?:\s+|\/)(?:(?:mỗi|một)\s+)?(?:cái|bộ)(?:\s|$).*$/i, ''))
  : undefined;

export const parseVietnameseFormSpeech = (transcript: string): VoiceFormFields => {
  const raw = extractVoiceFields(transcript);
  const result: VoiceFormFields = {};
  const productCode = raw.productCode?.replace(/\s+/g, '').match(/[a-z0-9][a-z0-9-]*(?:\/\d+)?/i)?.[0];
  if (productCode) result.productCode = productCode.toUpperCase();
  if (raw.productName) result.productName = raw.productName;
  if (raw.companyName) result.companyName = raw.companyName;

  const quantity = parseNumberField(raw.quantity);
  if (quantity !== undefined) {
    result.quantity = quantity;
  }
  const normPerUnit = parseNumberField(raw.normPerUnit);
  if (normPerUnit !== undefined) result.normPerUnit = normPerUnit;
  const unitHint = [raw.quantity, raw.unitPrice, raw.totalAmount]
    .find(value => value && /(?:bộ|cái)/i.test(value));
  if (unitHint?.toLocaleLowerCase('vi').includes('bộ')) result.unit = 'Bộ';
  else if (unitHint?.toLocaleLowerCase('vi').includes('cái')) result.unit = 'Cái';
  const unitPrice = parseNumberField(raw.unitPrice);
  if (unitPrice !== undefined) result.unitPrice = unitPrice;
  const totalAmount = parseNumberField(raw.totalAmount);
  if (totalAmount !== undefined) result.totalAmount = totalAmount;
  const paidAmount = parseNumberField(raw.paidAmount);
  if (paidAmount !== undefined) result.paidAmount = paidAmount;
  const deposit = parseNumberField(raw.deposit);
  if (deposit !== undefined) result.deposit = deposit;
  if (raw.groupName) result.groupName = raw.groupName;
  if (raw.personName) result.personName = raw.personName;
  if (raw.category) result.category = raw.category;
  if (raw.note) result.note = raw.note;
  return result;
};
