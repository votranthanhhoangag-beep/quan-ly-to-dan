import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useApp, type CategoryItem, type ExpenseItem } from '../context/AppContext';
import { usePersistentFormDraft } from '../hooks/usePersistentFormDraft';
import { createUniqueId } from '../utils/uniqueId';
import { useAuth } from '../context/AuthContext';
import { filterPhoneDigits, isValidVietnamMobileNumber } from '../utils/vietnamPhone';
import { getTodayDateString, isValidDebtDueDate } from '../utils/contractDebt';

interface ExpenseFormRow {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  isEditing: boolean;
  sourceCode?: string;
  sourceType?: ExpenseCatalogType;
  sourceNote?: string;
  isSuggestionOpen?: boolean;
}

type ExpenseCatalogType = 'Sản phẩm' | 'Nguyên liệu' | 'Khoản chi';

interface ExpenseCatalogOption {
  id: number | string;
  code: string;
  name: string;
  note: string;
  unit?: string;
  type: ExpenseCatalogType;
}

const createExpenseRow = (): ExpenseFormRow => ({
  id: `expense-line-${Date.now()}-${Math.random()}`,
  name: '',
  quantity: '',
  unit: '',
  unitPrice: '',
  isEditing: true
});

const formatCurrency = (value: number) => `${value.toLocaleString('vi-VN')} đ`;
const getExpenseTax = (expense: ExpenseItem) => {
  const itemsSubtotal = Array.isArray(expense.items)
    ? expense.items.reduce((sum, item) =>
      sum + (Number(item.amount) || (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)), 0)
    : 0;
  const rate = Number(expense.vatRatePercent) || 0;
  const amount = Number(expense.vatAmount) || (itemsSubtotal * rate / 100);
  return { rate, amount };
};
const formatExpenseDate = (value: string | undefined) => {
  if (!value) return '—';
  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      date.getUTCFullYear() === Number(year) &&
      date.getUTCMonth() === Number(month) - 1 &&
      date.getUTCDate() === Number(day)
    ) return `${day}/${month}/${year}`;
  }
  const localDate = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (localDate) return value;
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return value;
  return `${String(parsedDate.getDate()).padStart(2, '0')}/${String(parsedDate.getMonth() + 1).padStart(2, '0')}/${parsedDate.getFullYear()}`;
};
const parseAmount = (value: string) => Number(value.replace(/,/g, ''));
const formatAmountInput = (value: string) => {
  const cleaned = value.replace(/[^\d.]/g, '');
  const decimalIndex = cleaned.indexOf('.');
  const integerPart = (decimalIndex < 0 ? cleaned : cleaned.slice(0, decimalIndex))
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (decimalIndex < 0) return integerPart;
  return `${integerPart}.${cleaned.slice(decimalIndex + 1).replace(/\./g, '')}`;
};

const compressReceiptImage = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Không thể đọc tệp chứng từ đã chọn.'));
  reader.onload = () => {
    if (typeof reader.result !== 'string') {
      reject(new Error('Không thể đọc dữ liệu chứng từ.'));
      return;
    }

    const image = new Image();
    image.onerror = () => reject(new Error('Tệp đã chọn không phải hình ảnh hợp lệ.'));
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Trình duyệt không hỗ trợ xử lý hình ảnh.'));
        return;
      }

      for (const maxDimension of [640, 480, 320, 240, 160]) {
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.7, 0.5, 0.35]) {
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          if (dataUrl.length <= 40000) {
            resolve(dataUrl);
            return;
          }
        }
      }
      reject(new Error('Ảnh chứng từ vẫn quá lớn sau khi nén. Vui lòng chọn ảnh khác.'));
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});

const cardStyle = {
  padding: '16px',
  border: '1px solid #e2e8f0',
  borderRadius: '9px',
  backgroundColor: '#fff'
} as const;

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box' as const,
  padding: '9px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  backgroundColor: '#fff',
  color: '#1e293b'
};

const labelStyle = {
  display: 'block',
  marginBottom: '6px',
  color: '#334155',
  fontSize: '12px',
  fontWeight: 700
};

const isCatalogItem = (item: CategoryItem | null | undefined): item is CategoryItem =>
  item !== null &&
  typeof item === 'object' &&
  typeof item.name === 'string' &&
  typeof item.code === 'string';

export const ExpenseForm = () => {
  const { hasPermission } = useAuth();
  const { expenses = [], products, materials, expensesCat, otherExpensesCat, addExpense, updateExpense, deleteExpense } = useApp();
  const safeExpenses = (Array.isArray(expenses) ? expenses : []).filter(
    (expense): expense is ExpenseItem => expense !== null && typeof expense === 'object'
  );
  const [items, setItems] = useState<ExpenseFormRow[]>([createExpenseRow()]);
  const [supplierName, setSupplierName] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [supplierTaxCode, setSupplierTaxCode] = useState('');
  const [supplierZalo, setSupplierZalo] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => getTodayDateString());
  const [editingExpenseId, setEditingExpenseId] = useState<number | string | null>(null);
  const [vatRatePercent, setVatRatePercent] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Tiền mặt' | 'Chuyển khoản'>('Chuyển khoản');
  const [paidAmountOverride, setPaidAmountOverride] = useState<string | null>(null);
  const [nextPaymentDate, setNextPaymentDate] = useState('');
  const [note, setNote] = useState('');
  const [receiptImage, setReceiptImage] = useState('');
  const [receiptPreview, setReceiptPreview] = useState('');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const submissionLock = useRef(false);
  const { formDraftProps, clearDraft } = usePersistentFormDraft('expense-form');
  const [error, setError] = useState('');
  const invalidSupplierZalo = Boolean(supplierZalo && !isValidVietnamMobileNumber(supplierZalo));
  const todayDate = getTodayDateString();
  const minimumPaymentDate = todayDate;
  const catalogOptions = useMemo<ExpenseCatalogOption[]>(() => [
    ...(Array.isArray(products) ? products : []).filter(isCatalogItem).map(item => ({ ...item, type: 'Sản phẩm' as const })),
    ...(Array.isArray(materials) ? materials : []).filter(isCatalogItem).map(item => ({ ...item, type: 'Nguyên liệu' as const })),
    ...(Array.isArray(expensesCat) ? expensesCat : []).filter(isCatalogItem).map(item => ({ ...item, type: 'Khoản chi' as const })),
    ...(Array.isArray(otherExpensesCat) ? otherExpensesCat : []).filter(isCatalogItem).map(item => ({ ...item, type: 'Khoản chi' as const }))
  ].filter(item => item.name.trim()).sort((first, second) =>
    first.name.localeCompare(second.name, 'vi', { sensitivity: 'base', numeric: true }) ||
    first.code.localeCompare(second.code, 'vi', { sensitivity: 'base', numeric: true }) ||
    first.type.localeCompare(second.type, 'vi', { sensitivity: 'base' })
  ), [products, materials, expensesCat, otherExpensesCat]);

  const subtotal = items.reduce((sum, item) =>
    sum + (Number(item.quantity) || 0) * (parseAmount(item.unitPrice) || 0), 0);
  const vatRate = vatRatePercent.trim() ? Number(vatRatePercent) : 0;
  const vat = subtotal * vatRate / 100;
  const totalAmount = subtotal + vat;
  const paidAmount = paidAmountOverride ?? formatAmountInput(String(totalAmount));
  const paid = parseAmount(paidAmount) || 0;
  const outstanding = totalAmount - paid;
  const hasOutstanding = outstanding > 0;
  const invalidNextPaymentDate = hasOutstanding && (
    !nextPaymentDate ||
    (editingExpenseId === null && !isValidDebtDueDate(nextPaymentDate, todayDate))
  );
  const enteredItems = items.filter(item =>
    item.name.trim() || item.quantity.trim() || item.unitPrice.trim()
  );

  const updateItem = (id: string, updates: Partial<ExpenseFormRow>) => {
    setItems(current => current.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const addItem = () => {
    setPaidAmountOverride(null);
    setItems(current => [
      ...current.map(item => ({ ...item, isEditing: false })),
      createExpenseRow()
    ]);
  };

  const removeItem = (id: string) => {
    setPaidAmountOverride(null);
    setItems(current => {
      const remaining = current.filter(item => item.id !== id);
      return remaining.length ? remaining : [createExpenseRow()];
    });
  };

  const handleReceiptImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Vui lòng chọn tệp hình ảnh cho chứng từ.');
      return;
    }

    setError('');
    setIsProcessingImage(true);
    try {
      const imageData = await compressReceiptImage(file);
      setReceiptImage(imageData);
      setReceiptPreview(imageData);
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : 'Không thể xử lý ảnh chứng từ.');
    } finally {
      setIsProcessingImage(false);
    }
  };

  const resetForm = () => {
    clearDraft();
    setItems([createExpenseRow()]);
    setSupplierName('');
    setSupplierAddress('');
    setSupplierTaxCode('');
    setSupplierZalo('');
    setExpenseDate(getTodayDateString());
    setEditingExpenseId(null);
    setVatRatePercent('');
    setPaymentMethod('Chuyển khoản');
    setPaidAmountOverride(null);
    setNextPaymentDate('');
    setNote('');
    setReceiptImage('');
    setReceiptPreview('');
    setError('');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (enteredItems.length === 0) {
      setError('Vui lòng thêm ít nhất một dòng hàng hóa hoặc khoản chi.');
      return;
    }
    if (supplierZalo && !isValidVietnamMobileNumber(supplierZalo)) {
      setError('Số Zalo phải có đúng 10 chữ số và bắt đầu bằng đầu số di động hợp lệ tại Việt Nam.');
      return;
    }
    if (invalidNextPaymentDate) {
      setError('Hạn trả nợ phải lớn hơn ngày hiện tại ít nhất 1 ngày!');
      return;
    }
    if (enteredItems.some(item =>
      !item.name.trim() ||
      !Number.isFinite(Number(item.quantity)) ||
      Number(item.quantity) <= 0 ||
      !Number.isFinite(parseAmount(item.unitPrice)) ||
      parseAmount(item.unitPrice) < 0
    )) {
      setError('Mỗi dòng cần có tên hàng, số lượng lớn hơn 0 và đơn giá hợp lệ.');
      return;
    }
    if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100 || !Number.isFinite(paid) || paid < 0) {
      setError('Thuế suất GTGT phải từ 0% đến 100% và số tiền đã thanh toán phải là số không âm hợp lệ.');
      return;
    }

    if (submissionLock.current) return;
    submissionLock.current = true;
    setIsSaving(true);
    try {
      const savedItems = enteredItems.map(item => {
        const quantity = Number(item.quantity);
        const unitPrice = parseAmount(item.unitPrice);
        return {
          id: item.id,
          name: item.name.trim(),
          quantity,
          unit: item.unit.trim(),
          unitPrice,
          amount: quantity * unitPrice,
          sourceCode: item.sourceCode,
          sourceType: item.sourceType,
          sourceNote: item.sourceNote
        };
      });
      const category = savedItems.length === 1 ? savedItems[0].name : 'Nhiều khoản chi';
      const newExpense: ExpenseItem = {
        id: editingExpenseId ?? createUniqueId('EXP-'),
        date: expenseDate,
        category,
        expenseName: category,
        amount: totalAmount,
        note: note.trim(),
        imageUrl: receiptImage,
        imageProof: receiptImage,
        supplierName: supplierName.trim(),
        supplierAddress: supplierAddress.trim(),
        supplierTaxCode: supplierTaxCode.trim(),
        supplierZalo: supplierZalo.trim(),
        vatAmount: vat,
        vatRatePercent: vatRate,
        paymentMethod,
        paidAmount: paid,
        nextPaymentDate: hasOutstanding ? nextPaymentDate : '',
        items: savedItems
      };

      if (editingExpenseId !== null) updateExpense(newExpense);
      else addExpense(newExpense);
      resetForm();
      window.alert(editingExpenseId !== null ? 'Đã cập nhật phiếu chi thành công.' : 'Đã lưu phiếu chi thành công.');
    } catch (saveError) {
      console.error('Lỗi khi lưu phiếu chi:', saveError);
      setError('Không thể lưu phiếu chi. Vui lòng thử lại.');
    } finally {
      window.setTimeout(() => {
        submissionLock.current = false;
        setIsSaving(false);
      }, 700);
    }
  };

  const handleEditExpense = (expenseId: number | string) => {
    const expense = safeExpenses.find(item => String(item.id) === String(expenseId));
    if (!expense) {
      setError('Không tìm thấy phiếu chi cần sửa. Vui lòng tải lại danh sách và thử lại.');
      return;
    }

    const savedItems = Array.isArray(expense.items) && expense.items.length > 0
      ? expense.items.map(item => ({
        id: item.id || `expense-line-${Date.now()}-${Math.random()}`,
        name: item.name || '',
        quantity: String(item.quantity ?? ''),
        unit: item.unit || '',
        unitPrice: formatAmountInput(String(item.unitPrice ?? 0)),
        isEditing: true,
        sourceCode: item.sourceCode,
        sourceType: item.sourceType,
        sourceNote: item.sourceNote
      }))
      : [{
        id: createExpenseRow().id,
        name: expense.expenseName || expense.category || '',
        quantity: '1',
        unit: '',
        unitPrice: formatAmountInput(String(Number(expense.amount) || 0)),
        isEditing: true
      }];

    setItems(savedItems);
    setSupplierName(expense.supplierName || expense.handler || '');
    setSupplierAddress(expense.supplierAddress || '');
    setSupplierTaxCode(expense.supplierTaxCode || '');
    setSupplierZalo(expense.supplierZalo || '');
    setExpenseDate(expense.date || getTodayDateString());
    setVatRatePercent(String(Number(expense.vatRatePercent) || 0));
    setPaymentMethod(expense.paymentMethod || 'Chuyển khoản');
    setPaidAmountOverride(formatAmountInput(String(
      expense.paidAmount === undefined ? Number(expense.amount) || 0 : Number(expense.paidAmount) || 0
    )));
    setNextPaymentDate(
      (Number(expense.amount) || 0) - (Number(expense.paidAmount) || 0) > 0
        ? expense.nextPaymentDate || ''
        : ''
    );
    setNote(expense.note || '');
    const image = expense.imageUrl || expense.imageProof || '';
    setReceiptImage(image);
    setReceiptPreview(image);
    setEditingExpenseId(expense.id);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteExpense = (expense: ExpenseItem) => {
    if (!window.confirm(`Bạn có chắc muốn xóa phiếu chi ngày ${expense.date || '—'} của ${expense.supplierName || expense.handler || 'đối tác này'}?`)) return;
    deleteExpense(expense.id);
    if (editingExpenseId !== null && String(editingExpenseId) === String(expense.id)) resetForm();
  };

  return (
    <section style={{ display: 'grid', gap: '18px' }}>
      <header>
        <h2 style={{ margin: '0 0 5px', color: '#0f172a', fontSize: '21px' }}>{editingExpenseId !== null ? '✏️ Sửa Phiếu Chi' : '💸 Thêm Khoản Chi Phí Mới'}</h2>
        <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
          Lập một phiếu cho nhiều mặt hàng, vật tư hoặc khoản chi và theo dõi thanh toán.
        </p>
      </header>

      <form {...formDraftProps} onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
        <section style={{ ...cardStyle, backgroundColor: '#f8fafc' }}>
          <h3 style={{ margin: '0 0 14px', color: '#1e293b', fontSize: '15px' }}>1. Thông Tin Cơ Sở / Đối Tác</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
            <label>
              <span style={labelStyle}>Tên Cơ Sở / Đối Tác</span>
              <input value={supplierName} onChange={event => setSupplierName(event.target.value)} style={inputStyle} placeholder="Tên nhà cung cấp / đối tác" />
            </label>
            <label>
              <span style={labelStyle}>Mã Số Thuế (MST)</span>
              <input value={supplierTaxCode} onChange={event => setSupplierTaxCode(event.target.value)} style={inputStyle} placeholder="Mã số thuế" />
            </label>
            <label>
              <span style={labelStyle}>Số Zalo</span>
              <input
                type="tel"
                inputMode="numeric"
                value={supplierZalo}
                onChange={event => setSupplierZalo(filterPhoneDigits(event.target.value))}
                aria-invalid={invalidSupplierZalo}
                style={{ ...inputStyle, borderColor: invalidSupplierZalo ? '#dc2626' : '#cbd5e1' }}
                placeholder="Số Zalo liên hệ"
              />
              {invalidSupplierZalo && <small role="alert" style={{ display: 'block', marginTop: '5px', color: '#dc2626', fontWeight: 700 }}>Số Zalo phải có đúng 10 chữ số hợp lệ.</small>}
            </label>
            <label>
              <span style={labelStyle}>Ngày Chi</span>
              <input type="date" required value={expenseDate} onChange={event => setExpenseDate(event.target.value)} style={inputStyle} />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <span style={labelStyle}>Địa Chỉ</span>
              <input value={supplierAddress} onChange={event => setSupplierAddress(event.target.value)} style={inputStyle} placeholder="Địa chỉ cơ sở / đối tác" />
            </label>
          </div>
        </section>

        <section style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '15px 16px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <div>
              <h3 style={{ margin: '0 0 3px', color: '#1e293b', fontSize: '15px' }}>2. Chi Tiết Hàng Hóa / Khoản Chi</h3>
              <small style={{ color: '#64748b' }}>Có thể thêm nhiều mặt hàng trong cùng một phiếu chi.</small>
            </div>
            <button type="button" onClick={addItem} style={{ padding: '8px 12px', border: 0, borderRadius: '6px', backgroundColor: '#059669', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              + Thêm dòng
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '900px', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9', color: '#475569', textAlign: 'left' }}>
                  <th style={{ width: '210px', padding: '10px 12px' }}>Tên Mặt Hàng / Vật Tư / Khoản Chi</th>
                  <th style={{ width: '105px', padding: '10px 12px', textAlign: 'right' }}>Số Lượng</th>
                  <th style={{ width: '100px', padding: '10px 12px', textAlign: 'center' }}>ĐVT</th>
                  <th style={{ width: '140px', padding: '10px 12px', textAlign: 'right' }}>Đơn Giá</th>
                  <th style={{ width: '145px', padding: '10px 12px', textAlign: 'right' }}>Thành Tiền</th>
                  <th style={{ width: '130px', padding: '10px 12px', textAlign: 'center' }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const lineTotal = (Number(item.quantity) || 0) * (parseAmount(item.unitPrice) || 0);
                  const query = item.name.trim().toLowerCase();
                  const matchingSuggestions = catalogOptions.filter(option =>
                    option.name.toLowerCase().includes(query)
                  );
                  const suggestions = query
                    ? matchingSuggestions.sort((first, second) => {
                      const firstStartsWith = first.name.toLowerCase().startsWith(query);
                      const secondStartsWith = second.name.toLowerCase().startsWith(query);
                      return Number(secondStartsWith) - Number(firstStartsWith) ||
                        first.name.localeCompare(second.name, 'vi', { sensitivity: 'base', numeric: true }) ||
                        first.code.localeCompare(second.code, 'vi', { sensitivity: 'base', numeric: true });
                    })
                    : matchingSuggestions;
                  return (
                    <tr key={item.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ position: 'relative' }}>
                          <input
                            aria-label={`Tên mặt hàng dòng ${index + 1}`}
                            role="combobox"
                            aria-autocomplete="list"
                            aria-expanded={Boolean(item.isEditing && item.isSuggestionOpen)}
                            aria-controls={`expense-catalog-options-${item.id}`}
                            value={item.name}
                            onFocus={() => updateItem(item.id, { isSuggestionOpen: true })}
                            onChange={event => updateItem(item.id, {
                              name: event.target.value,
                              sourceCode: undefined,
                              sourceType: undefined,
                              sourceNote: undefined,
                              isSuggestionOpen: true
                            })}
                            onBlur={() => updateItem(item.id, { isSuggestionOpen: false })}
                            disabled={!item.isEditing}
                            required={item.isEditing}
                            placeholder="Gõ để tìm sản phẩm, nguyên liệu hoặc khoản chi"
                            style={{ ...inputStyle, backgroundColor: item.isEditing ? '#fff' : '#f8fafc' }}
                          />
                          {item.isEditing && item.isSuggestionOpen && (
                            <div
                              id={`expense-catalog-options-${item.id}`}
                              role="listbox"
                              style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                zIndex: 30,
                                maxHeight: '320px',
                                overflowY: 'auto',
                                overscrollBehavior: 'contain',
                                scrollBehavior: 'smooth',
                                backgroundColor: '#fff',
                                border: '1px solid #cbd5e1',
                                borderRadius: '6px',
                                boxShadow: '0 6px 16px rgba(15, 23, 42, 0.16)'
                              }}
                            >
                              {suggestions.map(option => (
                                  <button
                                    key={`${option.type}-${option.id}`}
                                    type="button"
                                    role="option"
                                    aria-selected={item.sourceCode === option.code && item.sourceType === option.type}
                                    onMouseDown={event => event.preventDefault()}
                                    onClick={() => updateItem(item.id, {
                                      name: option.name,
                                      sourceCode: option.code,
                                      sourceType: option.type,
                                      sourceNote: option.note,
                                      unit: option.unit || '',
                                      isSuggestionOpen: false
                                    })}
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      gap: '10px',
                                      width: '100%',
                                      padding: '9px 10px',
                                      border: 0,
                                      borderBottom: '1px solid #f1f5f9',
                                      backgroundColor: '#fff',
                                      color: '#1e293b',
                                      textAlign: 'left',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <span title={option.name} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{option.name}</span>
                                    <small style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{option.type}</small>
                                  </button>
                                ))}
                              {suggestions.length === 0 && (
                                <div style={{ padding: '10px', color: '#64748b', fontSize: '12px' }}>
                                  Không tìm thấy mục phù hợp. Bạn vẫn có thể nhập tên tự do.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <input
                          aria-label={`Số lượng dòng ${index + 1}`}
                          type="number"
                          min="0.001"
                          step="any"
                          value={item.quantity}
                          onChange={event => {
                            setPaidAmountOverride(null);
                            updateItem(item.id, { quantity: event.target.value });
                          }}
                          disabled={!item.isEditing}
                          required={item.isEditing}
                          placeholder="0"
                          style={{ ...inputStyle, textAlign: 'right', backgroundColor: item.isEditing ? '#fff' : '#f8fafc' }}
                        />
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <input
                          aria-label={`Đơn vị tính dòng ${index + 1}`}
                          list="expense-unit-options"
                          value={item.unit}
                          onChange={event => updateItem(item.id, { unit: event.target.value })}
                          disabled={!item.isEditing}
                          required={item.isEditing}
                          placeholder="Chọn hoặc nhập"
                          style={{ ...inputStyle, paddingLeft: '7px', paddingRight: '7px', backgroundColor: item.isEditing ? '#fff' : '#f8fafc' }}
                        />
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <input
                          aria-label={`Đơn giá dòng ${index + 1}`}
                          type="text"
                          inputMode="decimal"
                          value={item.unitPrice}
                          onChange={event => {
                            setPaidAmountOverride(null);
                            updateItem(item.id, { unitPrice: formatAmountInput(event.target.value) });
                          }}
                          disabled={!item.isEditing}
                          required={item.isEditing}
                          placeholder="0"
                          style={{ ...inputStyle, textAlign: 'right', backgroundColor: item.isEditing ? '#fff' : '#f8fafc' }}
                        />
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#b91c1c', fontWeight: 700 }}>
                        {formatCurrency(lineTotal)}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '5px' }}>
                          <button
                            type="button"
                            onClick={() => updateItem(item.id, { isEditing: !item.isEditing })}
                            aria-label={`${item.isEditing ? 'Hoàn tất sửa' : 'Sửa'} dòng ${index + 1}`}
                            style={{ padding: '6px 8px', border: 0, borderRadius: '5px', backgroundColor: item.isEditing ? '#dcfce7' : '#dbeafe', color: item.isEditing ? '#166534' : '#1d4ed8', fontWeight: 700, cursor: 'pointer' }}
                          >
                            {item.isEditing ? 'Xong' : 'Sửa'}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            aria-label={`Xóa dòng ${index + 1}`}
                            style={{ padding: '6px 9px', border: 0, borderRadius: '5px', backgroundColor: '#fee2e2', color: '#b91c1c', fontWeight: 800, cursor: 'pointer' }}
                          >
                            −
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #cbd5e1', backgroundColor: '#f8fafc' }}>
                  <td colSpan={4} style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 700 }}>Cộng tiền hàng</td>
                  <td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 800 }}>{formatCurrency(subtotal)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
            <datalist id="expense-unit-options">
              {['cái', 'bộ', 'kg', 'lít', 'lọn', 'con', 'cuộn', 'chiếc', 'mét', 'tấm', 'thùng', 'bao', 'chai', 'hộp'].map(unit => (
                <option key={unit} value={unit} />
              ))}
            </datalist>
          </div>
        </section>

        <section style={cardStyle}>
          <h3 style={{ margin: '0 0 14px', color: '#1e293b', fontSize: '15px' }}>3. Thuế Và Thanh Toán</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
            <label>
              <span style={labelStyle}>Phần Trăm Thuế GTGT (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                step="any"
                inputMode="decimal"
                value={vatRatePercent}
                onChange={event => {
                  setPaidAmountOverride(null);
                  setVatRatePercent(event.target.value);
                }}
                style={inputStyle}
                placeholder="0"
              />
              <small style={{ color: '#64748b' }}>Để trống tương đương 0%. Thuế được tính trên tổng tiền hàng.</small>
            </label>
            <label>
              <span style={labelStyle}>Hình Thức Thanh Toán</span>
              <select
                value={paymentMethod}
                onChange={event => setPaymentMethod(event.target.value as 'Tiền mặt' | 'Chuyển khoản')}
                style={inputStyle}
              >
                <option value="Chuyển khoản">Chuyển khoản</option>
                <option value="Tiền mặt">Tiền mặt</option>
              </select>
              <small style={{ color: '#64748b' }}>Toàn bộ số tiền đã thanh toán được ghi nhận theo hình thức này.</small>
            </label>
            <label>
              <span style={labelStyle}>Số Tiền Đã Thanh Toán (VNĐ)</span>
              <input
                type="text"
                inputMode="decimal"
                value={paidAmount}
                onChange={event => {
                  const amount = formatAmountInput(event.target.value);
                  setPaidAmountOverride(amount);
                  if (totalAmount - (parseAmount(amount) || 0) <= 0) setNextPaymentDate('');
                }}
                style={inputStyle}
                placeholder="0"
              />
              <small style={{ color: '#64748b' }}>Mặc định bằng tổng số tiền; có thể sửa nếu thanh toán một phần.</small>
            </label>
            {hasOutstanding && (
              <label>
                <span style={labelStyle}>Hạn Thanh Toán Tiếp Theo</span>
                <input
                  type="date"
                  required
                  min={minimumPaymentDate}
                  value={nextPaymentDate}
                  onChange={event => setNextPaymentDate(event.target.value)}
                  aria-invalid={invalidNextPaymentDate}
                  style={{ ...inputStyle, borderColor: invalidNextPaymentDate ? '#dc2626' : '#cbd5e1' }}
                />
                {invalidNextPaymentDate && editingExpenseId === null && nextPaymentDate && <small role="alert" style={{ color: '#b91c1c', fontWeight: 700 }}>Hạn trả nợ phải lớn hơn ngày hiện tại ít nhất 1 ngày!</small>}
              </label>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px', marginTop: '14px' }}>
            <div style={{ padding: '12px', borderRadius: '7px', backgroundColor: '#f8fafc' }}>
              <small style={{ color: '#64748b', fontWeight: 700 }}>TỔNG TIỀN HÀNG</small>
              <div style={{ marginTop: '4px', color: '#334155', fontWeight: 800 }}>{formatCurrency(subtotal)}</div>
            </div>
            <div style={{ padding: '12px', borderRadius: '7px', backgroundColor: '#fff7ed' }}>
              <small style={{ color: '#9a3412', fontWeight: 700 }}>THUẾ GTGT ({vatRate.toLocaleString('vi-VN')}%)</small>
              <div style={{ marginTop: '4px', color: '#c2410c', fontWeight: 800 }}>{formatCurrency(vat)}</div>
            </div>
            <div style={{ padding: '12px', borderRadius: '7px', backgroundColor: '#eff6ff' }}>
              <small style={{ color: '#1e40af', fontWeight: 700 }}>TỔNG SỐ TIỀN</small>
              <div style={{ marginTop: '4px', color: '#1d4ed8', fontSize: '17px', fontWeight: 900 }}>{formatCurrency(totalAmount)}</div>
            </div>
            <div style={{ padding: '12px', borderRadius: '7px', backgroundColor: '#f0fdf4' }}>
              <small style={{ color: '#166534', fontWeight: 700 }}>CÒN LẠI CHƯA THANH TOÁN</small>
              <div style={{ marginTop: '4px', color: outstanding >= 0 ? '#15803d' : '#b91c1c', fontSize: '17px', fontWeight: 900 }}>{formatCurrency(outstanding)}</div>
            </div>
          </div>
        </section>

        <section style={{ ...cardStyle, backgroundColor: '#f8fafc' }}>
          <h3 style={{ margin: '0 0 14px', color: '#1e293b', fontSize: '15px' }}>4. Ghi Chú & Chứng Từ</h3>
          <label style={{ display: 'block', marginBottom: '12px' }}>
            <span style={labelStyle}>Ghi Chú</span>
            <textarea rows={3} value={note} onChange={event => setNote(event.target.value)} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Diễn giải nội dung phiếu chi, điều khoản hoặc thông tin bổ sung..." />
          </label>
          <label style={{ display: 'block' }}>
            <span style={labelStyle}>Đính Kèm Chứng Từ / Hóa Đơn</span>
            <input type="file" accept="image/*" onChange={handleReceiptImage} disabled={isProcessingImage} style={{ display: 'block', width: '100%', fontSize: '13px' }} />
          </label>
          {isProcessingImage && <p role="status" style={{ color: '#2563eb', fontSize: '12px' }}>Đang xử lý và nén ảnh...</p>}
          {receiptPreview && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
              <img src={receiptPreview} alt="Xem trước chứng từ phiếu chi" style={{ width: '96px', height: '96px', objectFit: 'cover', border: '1px solid #cbd5e1', borderRadius: '7px' }} />
              <button type="button" onClick={() => { setReceiptImage(''); setReceiptPreview(''); }} style={{ padding: '7px 10px', border: '1px solid #fecaca', borderRadius: '5px', backgroundColor: '#fff', color: '#b91c1c', fontWeight: 700, cursor: 'pointer' }}>
                Xóa ảnh
              </button>
            </div>
          )}
        </section>

        {error && <div role="alert" style={{ padding: '11px 13px', border: '1px solid #fecaca', borderRadius: '7px', backgroundColor: '#fef2f2', color: '#b91c1c', fontSize: '13px' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '9px', flexWrap: 'wrap' }}>
          <button type="button" onClick={resetForm} style={{ padding: '11px 16px', border: '1px solid #cbd5e1', borderRadius: '7px', backgroundColor: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer' }}>
            {editingExpenseId !== null ? 'Hủy Sửa' : 'Làm Mới'}
          </button>
          <button type="submit" disabled={isSaving || isProcessingImage || invalidSupplierZalo || invalidNextPaymentDate} style={{ padding: '11px 18px', border: 0, borderRadius: '7px', backgroundColor: isSaving || isProcessingImage || invalidSupplierZalo || invalidNextPaymentDate ? '#94a3b8' : '#dc2626', color: '#fff', fontWeight: 800, cursor: isSaving || isProcessingImage || invalidSupplierZalo || invalidNextPaymentDate ? 'wait' : 'pointer' }}>
            {isSaving ? 'Đang lưu phiếu...' : editingExpenseId !== null ? '💾 Cập Nhật Phiếu Chi' : '💾 Lưu Phiếu Chi'}
          </button>
        </div>
      </form>

      <section style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, color: '#1e293b', fontSize: '15px' }}>Danh Sách Phiếu Chi</h3>
          <strong style={{ color: '#b91c1c' }}>
            Tổng chi đã lập: {formatCurrency(safeExpenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0))}
          </strong>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '980px', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9', color: '#475569' }}>
                <th style={{ padding: '9px' }}>Ngày Chi</th>
                <th style={{ padding: '9px' }}>Cơ Sở / Đối Tác</th>
                <th style={{ padding: '9px' }}>Chi Tiết</th>
                <th style={{ padding: '9px', textAlign: 'right' }}>Tổng Tiền</th>
                <th style={{ padding: '9px', textAlign: 'right' }}>Đã Thanh Toán</th>
                <th style={{ padding: '9px', textAlign: 'right' }}>Còn Lại</th>
                <th style={{ padding: '9px' }}>Hẹn Thanh Toán</th>
                <th style={{ padding: '9px', textAlign: 'center' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {safeExpenses.length > 0 ? safeExpenses.map((expense, index) => {
                const itemDetails = Array.isArray(expense.items) && expense.items.length > 0
                  ? expense.items.map(item => `${item.name} (${Number(item.quantity).toLocaleString('vi-VN')}${item.unit ? ` ${item.unit}` : ''} × ${formatCurrency(Number(item.unitPrice) || 0)})`).join(', ')
                  : expense.expenseName || expense.category || expense.note || '—';
                const { rate: taxRate, amount: taxAmount } = getExpenseTax(expense);
                const details = taxAmount > 0
                  ? `${itemDetails} + Thuế${taxRate > 0 ? ` ${taxRate.toLocaleString('vi-VN')}%` : ''} (${formatCurrency(taxAmount)})`
                  : itemDetails;
                const expensePaid = Number(expense.paidAmount) || 0;
                const expenseTotal = Number(expense.amount) || 0;
                return (
                  <tr key={expense.id || index} style={{ borderTop: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '9px', whiteSpace: 'nowrap' }}>{formatExpenseDate(expense.date)}</td>
                    <td style={{ padding: '9px' }}>{expense.supplierName || expense.handler || '—'}</td>
                    <td style={{ padding: '9px', maxWidth: '360px' }}>{details}</td>
                    <td style={{ padding: '9px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{formatCurrency(expenseTotal)}</td>
                    <td style={{ padding: '9px', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(expensePaid)}</td>
                    <td style={{ padding: '9px', textAlign: 'right', whiteSpace: 'nowrap', color: expenseTotal - expensePaid > 0 ? '#b91c1c' : '#15803d', fontWeight: 700 }}>{formatCurrency(expenseTotal - expensePaid)}</td>
                    <td style={{ padding: '9px', whiteSpace: 'nowrap' }}>
                      {(expenseTotal - expensePaid > 0 && expense.nextPaymentDate)
                        ? formatExpenseDate(expense.nextPaymentDate)
                        : '—'}
                    </td>
                    <td style={{ padding: '9px' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                        <button type="button" onClick={() => handleEditExpense(expense.id)} style={{ padding: '6px 9px', border: 0, borderRadius: '5px', backgroundColor: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Sửa</button>
                        {hasPermission('delete_expenses') && <button type="button" onClick={() => handleDeleteExpense(expense)} style={{ padding: '6px 9px', border: 0, borderRadius: '5px', backgroundColor: '#dc2626', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Xóa</button>}
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={8} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>Chưa có phiếu chi nào được lưu.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
};
