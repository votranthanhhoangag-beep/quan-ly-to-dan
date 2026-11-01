import { Fragment, useMemo, useRef, useState, type FormEvent } from 'react';
import { useApp, type ContractItem, type ReceivedGoodsLog } from '../context/AppContext';
import { usePersistentFormDraft } from '../hooks/usePersistentFormDraft';
import {
  getContractFinancialSummary,
  getContractMaterialAmount,
  getDebtDueBadge,
  getDebtDueStatus,
  getDateAfterDaysString,
  getTodayDateString,
  isValidDebtDueDate
} from '../utils/contractDebt';

interface ReceiveFormRow {
  id: string;
  contractId: string;
  itemTypeOption: 'BO' | 'CAI' | 'CA_HAI';
  quantity: string;
  paidAmount: string;
  receivedDate: string;
  debtDueDate: string;
  deductDeposit: boolean;
  sizeQuantities: Record<string, string>;
}

interface SavedReceipt {
  contract: ContractItem;
  log: ReceivedGoodsLog;
}

const getToday = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const createRow = (receivedDate = getToday()): ReceiveFormRow => ({
  id: `receive-${Date.now()}-${Math.random()}`,
  contractId: '',
  itemTypeOption: 'BO',
  quantity: '',
  paidAmount: '',
  receivedDate,
  debtDueDate: getDateAfterDaysString(2),
  deductDeposit: false,
  sizeQuantities: {}
});

const formatNumber = (value: number) => value.toLocaleString('vi-VN');
const formatCurrency = (value: number) => `${value.toLocaleString('vi-VN')} đ`;
const getContractUnit = (contract: ContractItem) => {
  const suffix = /\/(\d+)\s*$/.exec(String(contract.productCode || '').trim())?.[1];
  if (suffix) return Number(suffix) === 1 ? 'Cái' : 'Bộ';
  return String(contract.unit || 'Bộ').toLowerCase() === 'cái' ? 'Cái' : 'Bộ';
};
const getProductName = (contract: ContractItem) => {
  const summary = String(contract.summaryText || '');
  const productName = String(contract.productName || '');
  return summary && productName.endsWith(` (${summary})`)
    ? productName.slice(0, -(summary.length + 3))
    : productName;
};
const getIssuedQuantity = (contract: ContractItem) => {
  const exportTotal = (Array.isArray(contract.exportLogs) ? contract.exportLogs : [])
    .reduce((sum, log) => sum + (Number(log.actualQty) || 0), 0);
  return Math.max(Number(contract.totalActualExported) || 0, exportTotal);
};
const getContractAmount = (contract: ContractItem) =>
  Number(contract.totalAmount) || (Number(contract.quantity) || 0) * (Number(contract.unitPrice) || 0);
const getReceiptAmount = (contract: ContractItem, quantity: number, sizeQuantities: Record<string, number>) => {
  const sizeAmount = Object.entries(sizeQuantities).reduce((sum, [sizeName, sizeQuantity]) => {
    if (sizeName === 'Bộ') return sum + sizeQuantity * (Number(contract.unitPrice) || 0);
    const sizePrice = Number(contract.sizePrices?.[sizeName]);
    return sum + sizeQuantity * (sizePrice > 0 ? sizePrice : Number(contract.unitPrice) || 0);
  }, 0);
  return sizeAmount > 0 ? sizeAmount : quantity * (Number(contract.unitPrice) || 0);
};
const getSetSizeKeys = (contract: ContractItem) => {
  const sizeCount = Number(/\/(\d+)\s*$/.exec(String(contract.productCode || '').trim())?.[1]);
  if (!Number.isInteger(sizeCount) || sizeCount <= 1 || sizeCount > 20) return [];
  const configuredSizes = Object.keys(contract.sizeQuantities || {})
    .filter(size => size !== 'Bộ')
    .sort((first, second) => first.localeCompare(second, 'vi', { numeric: true }));
  return Array.from({ length: sizeCount }, (_, index) => configuredSizes[index] || `Cái ${index + 1}`);
};
const getEnteredSizeQuantities = (row: ReceiveFormRow) => {
  const sizes = Object.fromEntries(
    Object.entries(row.sizeQuantities)
      .filter(([, value]) =>
        row.itemTypeOption !== 'BO' &&
        value.trim() &&
        Number.isFinite(Number(value)) &&
        Number(value) > 0
      )
      .map(([key, value]) => [key, Number(value)])
  );
  if ((row.itemTypeOption === 'BO' || row.itemTypeOption === 'CA_HAI') && Number(row.quantity) > 0) {
    sizes['Bộ'] = Number(row.quantity);
  }
  return sizes;
};
const getReceivedBundles = (contract: ContractItem, log: ReceivedGoodsLog) => {
  if (Object.prototype.hasOwnProperty.call(log.sizeQuantities || {}, 'Bộ')) {
    return Number(log.sizeQuantities?.['Bộ']) || 0;
  }
  const sizeCount = Object.values(log.sizeQuantities || {})
    .reduce((sum, quantity) => sum + (Number(quantity) || 0), 0);
  const itemTypeOption = log.itemTypeOption || contract.itemTypeOption;
  return itemTypeOption === 'BO' || itemTypeOption === 'CA_HAI'
    ? Number(log.quantity) || 0
    : sizeCount > 0 ? 0 : Number(log.quantity) || 0;
};
const getTargetPiecesPerSize = (contract: ContractItem, sizeName: string) => {
  const configuredPieceCount = Number(contract.sizeQuantities?.[sizeName]) || 0;
  if (contract.itemTypeOption === 'CA_HAI') {
    return (Number(contract.boQuantity) || 0) + configuredPieceCount;
  }
  if (contract.itemTypeOption === 'CAI') return configuredPieceCount;
  return Number(contract.quantity) || 0;
};
const getReceivedPiecesPerSize = (contract: ContractItem, sizeName: string, excludedLogId: string | null = null) =>
  (Array.isArray(contract.receivedGoodsLogs) ? contract.receivedGoodsLogs : [])
    .filter(log => log.id !== excludedLogId)
    .reduce((sum, log) => sum +
      (Number(log.sizeQuantities?.[sizeName]) || 0) +
      getReceivedBundles(contract, log), 0);
const getReceivedQuantity = (contract: ContractItem) =>
  (Array.isArray(contract.receivedGoodsLogs) ? contract.receivedGoodsLogs : [])
    .reduce((sum, log) => sum + (Number(log.quantity) || 0), 0);
const getReceivedQuantityWithoutLog = (contract: ContractItem, excludedLogId: string | null) =>
  (Array.isArray(contract.receivedGoodsLogs) ? contract.receivedGoodsLogs : [])
    .filter(log => log.id !== excludedLogId)
    .reduce((sum, log) => sum + (Number(log.quantity) || 0), 0);
const getDepositedAmount = (contract: ContractItem) => {
  const deposits = (Array.isArray(contract.depositLogs) ? contract.depositLogs : [])
    .reduce((sum, log) => sum + (Number(log.amount) || 0), 0);
  return Math.max(
    Number(contract.requiredDeposit) || 0,
    (Number(contract.initialRequiredDeposit) || 0) + deposits
  );
};
const getPaidAmount = (logs: ReceivedGoodsLog[]) =>
  logs.reduce((sum, log) => sum + (Number(log.paidAmount) || 0), 0);

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

export default function FrameExportManager() {
  const { contracts, updateContract } = useApp();
  const { formDraftProps, clearDraft, isSubmitting } = usePersistentFormDraft('knitting-receipt');
  const subContracts = useMemo(() => contracts
    .filter(contract => contract.contractType === 'SUB')
    .slice()
    .sort((first, second) => {
      const firstId = Number(String(first.id).match(/\d+$/)?.[0]) || 0;
      const secondId = Number(String(second.id).match(/\d+$/)?.[0]) || 0;
      return firstId - secondId;
    }), [contracts]);
  const [rows, setRows] = useState<ReceiveFormRow[]>([createRow()]);
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);
  const [editingSourceContractId, setEditingSourceContractId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [zaloMessage, setZaloMessage] = useState('');
  const [imageReceipt, setImageReceipt] = useState<{ contract: ContractItem; log: ReceivedGoodsLog } | null>(null);
  const imageReceiptRef = useRef<HTMLDivElement>(null);
  const todayDate = getTodayDateString();
  const minimumDebtDueDate = todayDate;

  const receipts: SavedReceipt[] = subContracts.flatMap(contract =>
    (Array.isArray(contract.receivedGoodsLogs) ? contract.receivedGoodsLogs : [])
      .map(log => ({ contract, log }))
  ).sort((first, second) => second.log.receivedDate.localeCompare(first.log.receivedDate));

  const updateRow = (id: string, updates: Partial<ReceiveFormRow>) => {
    setRows(current => current.map(row => row.id === id ? { ...row, ...updates } : row));
  };
  const getNextContract = (contract: ContractItem) => {
    const sameOrder = subContracts.filter(item =>
      String(item.craftGroupLeader || '').trim().toLowerCase() === String(contract.craftGroupLeader || '').trim().toLowerCase() &&
      String(item.productCode || '').trim().toLowerCase() === String(contract.productCode || '').trim().toLowerCase()
    );
    const currentIndex = sameOrder.findIndex(item => String(item.id) === String(contract.id));
    return currentIndex >= 0 ? sameOrder[currentIndex + 1] : undefined;
  };

  const enterEdit = (contractId: number | string, logId: string) => {
    const contract = subContracts.find(item => String(item.id) === String(contractId));
    const log = contract?.receivedGoodsLogs?.find(item => String(item.id) === String(logId));
    if (!contract || !log) {
      setError('Không tìm thấy phiếu nhận hàng cần sửa. Vui lòng tải lại lịch sử và thử lại.');
      return;
    }

    const pieceQuantities = Object.fromEntries(
      Object.entries(log.sizeQuantities || {}).filter(([key]) => key !== 'Bộ')
    );
    const hasBundleQuantity = Object.prototype.hasOwnProperty.call(log.sizeQuantities || {}, 'Bộ');
    setRows([{
      id: `edit-${log.id}`,
      contractId: String(contract.id),
      itemTypeOption: log.itemTypeOption || (hasBundleQuantity
        ? Object.keys(pieceQuantities).length > 0 ? 'CA_HAI' : 'BO'
        : Object.keys(pieceQuantities).length > 0 ? 'CAI' : contract.itemTypeOption || 'BO'),
      quantity: String(log.quantity),
      paidAmount: String(Number(log.paidAmount) || 0),
      receivedDate: log.receivedDate || getToday(),
      debtDueDate: log.debtDueDate || getDateAfterDaysString(2),
      deductDeposit: Number(log.deductedDeposit) > 0,
      sizeQuantities: Object.fromEntries(
        Object.entries(pieceQuantities).map(([key, value]) => [key, String(value)])
      )
    }]);
    setEditingReceiptId(log.id);
    setEditingSourceContractId(String(contract.id));
    setNote(log.note || '');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    clearDraft();
    setRows([createRow()]);
    setEditingReceiptId(null);
    setEditingSourceContractId(null);
    setNote('');
    setError('');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const activeRows = rows.filter(row =>
      row.contractId || row.quantity.trim() || row.paidAmount.trim() ||
      Object.values(row.sizeQuantities).some(value => value.trim())
    );
    if (activeRows.length === 0) {
      setError('Vui lòng thêm một dòng nhận hàng hoặc thanh toán công nợ.');
      return;
    }
    if (activeRows.some(row =>
      !row.contractId ||
      !Number.isFinite(Number(row.quantity)) ||
      Number(row.quantity) < 0 ||
      !Number.isFinite(Number(row.paidAmount || 0)) ||
      Number(row.paidAmount || 0) < 0 ||
      (Number(row.quantity) === 0 && Number(row.paidAmount || 0) === 0 &&
        !(row.itemTypeOption !== 'BO' && Object.values(row.sizeQuantities).some(value => Number(value) > 0))) ||
      !row.receivedDate
    )) {
      setError('Mỗi dòng cần có hợp đồng, ngày nhận hợp lệ và số lượng, cái lẻ hoặc số tiền thanh toán lớn hơn 0.');
      return;
    }
    const updatedContracts = new Map<string, ContractItem>();
    if (editingReceiptId && editingSourceContractId) {
      const sourceContract = contracts.find(contract => String(contract.id) === editingSourceContractId);
      if (sourceContract) {
        updatedContracts.set(editingSourceContractId, {
          ...sourceContract,
          receivedGoodsLogs: (sourceContract.receivedGoodsLogs || [])
            .filter(log => String(log.id) !== String(editingReceiptId))
        });
      }
    }

    for (const row of activeRows) {
      const contract = updatedContracts.get(row.contractId)
        || contracts.find(item => String(item.id) === row.contractId);
      if (!contract) {
        setError('Không tìm thấy hợp đồng Tổ Đan đã chọn. Vui lòng tải lại và thử lại.');
        return;
      }

      const quantity = Number(row.quantity);
      const savedLogs = Array.isArray(contract.receivedGoodsLogs) ? contract.receivedGoodsLogs : [];
      const sizeQuantities = getEnteredSizeQuantities(row);
      const amount = getReceiptAmount(contract, quantity, sizeQuantities);
      const paidAmount = Number(row.paidAmount) || 0;
      const alreadyDeducted = savedLogs.reduce((sum, log) => sum + (Number(log.deductedDeposit) || 0), 0);
      const alreadyDeductedMaterial = savedLogs.reduce((sum, log) => sum + (Number(log.deductedMaterialAmount) || 0), 0);
      const oldReceivedQuantity = savedLogs.reduce((sum, log) => sum + (Number(log.quantity) || 0), 0);
      const oldReceivedAmount = savedLogs.reduce((sum, log) => sum + (Number(log.amount) || 0), 0);
      const projectedQuantity = oldReceivedQuantity + quantity;
      const projectedComplete = Number(contract.quantity) > 0 && projectedQuantity >= Number(contract.quantity);
      const projectedRecognizedAmount = projectedComplete
        ? getContractAmount(contract)
        : oldReceivedAmount + amount;
      const alreadyPaid = getPaidAmount(savedLogs);
      const availableForDeductions = Math.max(
        0,
        projectedRecognizedAmount - alreadyDeducted - alreadyDeductedMaterial - alreadyPaid - paidAmount
      );
      const deductedMaterialAmount = Math.min(
        Math.max(0, getContractMaterialAmount(contract) - alreadyDeductedMaterial),
        availableForDeductions
      );
      const depositAvailable = Math.max(0, getDepositedAmount(contract) - alreadyDeducted);
      const deductibleBalance = Math.max(0, availableForDeductions - deductedMaterialAmount);
      const deductedDeposit = row.deductDeposit
        ? Math.min(depositAvailable, deductibleBalance)
        : 0;
      const projectedOutstanding = Math.max(
        0,
        projectedRecognizedAmount - alreadyDeducted - alreadyDeductedMaterial -
          alreadyPaid - paidAmount - deductedMaterialAmount - deductedDeposit
      );
      if (projectedOutstanding > 0 && (!row.debtDueDate || !isValidDebtDueDate(row.debtDueDate, todayDate))) {
        setError('Khi còn công nợ sau khi trừ tiền công, nguyên phụ liệu và tiền cọc, hạn trả nợ phải lớn hơn ngày hiện tại ít nhất 1 ngày.');
        return;
      }
      const log: ReceivedGoodsLog = {
        id: editingReceiptId && row.id.startsWith('edit-') ? editingReceiptId : `RCV-${row.id}`,
        receivedDate: row.receivedDate,
        quantity,
        itemTypeOption: row.itemTypeOption,
        amount,
        deductedDeposit,
        deductedMaterialAmount,
        paymentAmount: Math.max(0, amount - deductedMaterialAmount - deductedDeposit),
        paidAmount,
        debtDueDate: projectedOutstanding > 0 ? row.debtDueDate : '',
        sizeQuantities,
        note: note.trim()
      };

      updatedContracts.set(row.contractId, {
        ...contract,
        receivedGoodsLogs: [...savedLogs, log]
      });
    }

    updatedContracts.forEach(contract => updateContract(contract));
    resetForm();
    window.alert('Đã lưu phiếu nhận hàng đan.');
  };

  const deleteReceipt = (contract: ContractItem, log: ReceivedGoodsLog) => {
    if (!window.confirm(`Xóa phiếu nhận hàng ngày ${log.receivedDate} của tổ ${contract.craftGroupLeader || ''}?`)) return;
    updateContract({
      ...contract,
      receivedGoodsLogs: (contract.receivedGoodsLogs || []).filter(item => String(item.id) !== String(log.id))
    });
    if (editingReceiptId === log.id) resetForm();
  };

  const sendZaloReceipt = async (contract: ContractItem, log: ReceivedGoodsLog) => {
    const financialSummary = getContractFinancialSummary(contract);
    const unit = getContractUnit(contract).toLowerCase();
    const receivedTotal = getReceivedQuantity(contract);
    const issued = getIssuedQuantity(contract);
    const sizeBreakdown = Object.entries(log.sizeQuantities || {})
      .map(([size, quantity]) => `${size}: ${formatNumber(quantity)}`)
      .join(', ');
    const shareText = [
      'PHIẾU ĐỐI SOÁT NHẬN HÀNG ĐAN',
      `Ngày nhận: ${log.receivedDate}`,
      `Tổ đan: ${contract.craftGroupLeader || '—'}`,
      `Hợp đồng: ${contract.contractNo || '—'}`,
      `Mã hàng: ${contract.productCode || '—'}`,
      `Tên hàng: ${getProductName(contract) || '—'}`,
      `Số lượng nhận đợt này: ${formatNumber(log.quantity)} ${unit}`,
      sizeBreakdown ? `Chi tiết theo size: ${sizeBreakdown}` : '',
      `Đã phát khung: ${formatNumber(issued)} ${unit}`,
      `Đã nhận hàng đan lũy kế: ${formatNumber(receivedTotal)} ${unit}`,
      `Đơn giá: ${formatCurrency(Number(contract.unitPrice) || 0)} / ${unit}`,
      `Thành tiền đợt này: ${formatCurrency(log.amount)}`,
      `Tổng nguyên phụ liệu kèm theo: ${formatCurrency(financialSummary.materialAmount)}`,
      `Nguyên phụ liệu được trừ đợt này: ${formatCurrency(log.deductedMaterialAmount || 0)}`,
      `Tiền cọc được trừ: ${formatCurrency(log.deductedDeposit)}`,
      `Số tiền đã trả đợt này: ${formatCurrency(Number(log.paidAmount) || 0)}`,
      `Tổng đã thanh toán: ${formatCurrency(financialSummary.paidAmount)}`,
      `Công nợ lũy kế còn lại: ${formatCurrency(financialSummary.outstanding)}`,
      financialSummary.debtDueDate ? `Hạn trả nợ: ${financialSummary.debtDueDate}` : '',
      `Trạng thái: ${financialSummary.status}`,
      log.note ? `Ghi chú: ${log.note}` : ''
    ].filter(Boolean).join('\n');

    setZaloMessage(shareText);
    const zaloNumber = String(contract.zalo || contract.phone || '').replace(/\D/g, '');
    window.open(
      zaloNumber ? `https://zalo.me/${zaloNumber}` : 'https://chat.zalo.me/',
      '_blank',
      'noopener,noreferrer'
    );
    setImageReceipt({ contract, log });
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const printArea = imageReceiptRef.current;
      if (!printArea) throw new Error('Không tìm thấy nội dung phiếu để xuất ảnh.');

      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(printArea, {
        scale: Math.max(2, window.devicePixelRatio || 1),
        backgroundColor: '#ffffff',
        logging: false
      });
      const imageBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => blob
          ? resolve(blob)
          : reject(new Error('Trình duyệt không tạo được ảnh PNG từ phiếu.')), 'image/png');
      });
      const fileName = `${String(log.id || 'phieu-nhan-hang-dan').replace(/[^\w-]+/g, '_')}.png`;

      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': imageBlob })]);
          window.alert('Đã mở Zalo và sao chép ảnh phiếu. Dán ảnh vào cuộc trò chuyện để gửi.');
          return;
        } catch (clipboardError) {
          console.error('Không thể sao chép ảnh phiếu vào clipboard; sẽ tải ảnh xuống:', clipboardError);
        }
      }

      const imageUrl = URL.createObjectURL(imageBlob);
      const downloadLink = document.createElement('a');
      downloadLink.href = imageUrl;
      downloadLink.download = fileName;
      downloadLink.click();
      window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1000);
      window.alert('Đã mở Zalo và tải ảnh phiếu PNG xuống. Hãy đính kèm ảnh vừa tải để gửi.');
    } catch (imageError) {
      console.error('Không thể tạo ảnh phiếu nhận hàng đan:', imageError);
      window.alert(imageError instanceof Error
        ? `Đã mở Zalo nhưng không xuất được ảnh phiếu: ${imageError.message}`
        : 'Đã mở Zalo nhưng không xuất được ảnh phiếu. Vui lòng thử lại.');
    }
  };

  const tableHeaderStyle = {
    padding: '9px 10px',
    backgroundColor: '#f1f5f9',
    color: '#475569',
    textAlign: 'left' as const,
    fontSize: '12px'
  };

  return (
    <section style={{ display: 'grid', gap: '18px' }}>
      <header>
        <h2 style={{ margin: '0 0 5px', color: '#0f172a', fontSize: '21px' }}>📥 Nhận Hàng Đan Từ Tổ Đan</h2>
        <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
          Ghi nhận sản phẩm hoàn thành theo hợp đồng, theo dõi khung đã phát và đối soát tiền cọc.
        </p>
      </header>

      <form {...formDraftProps} onSubmit={handleSubmit} style={{ display: 'grid', gap: '15px' }}>
        <section style={{ ...cardStyle, backgroundColor: '#f8fafc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, color: '#1e293b', fontSize: '15px' }}>
              {editingReceiptId ? '✏️ Sửa Phiếu Nhận Hàng' : '➕ Lập Phiếu Nhận Hàng Mới'}
            </h3>
            <button type="button" onClick={() => setRows(current => [...current, createRow()])} style={{ padding: '8px 12px', border: 0, borderRadius: '6px', backgroundColor: '#059669', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              + Thêm dòng hàng
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '1330px', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={tableHeaderStyle}>Tên Tổ Đan / Hợp Đồng</th>
                  <th style={tableHeaderStyle}>Mã Hàng / Tên Hàng</th>
                  <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>ĐVT / Đơn Giá</th>
                  <th style={tableHeaderStyle}>Ngày Nhận</th>
                  <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>SL Nhận</th>
                  <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Thành Tiền</th>
                  <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Số Tiền Trả</th>
                  <th style={tableHeaderStyle}>Hạn Trả Nợ</th>
                  <th style={{ ...tableHeaderStyle, textAlign: 'center' }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const contract = subContracts.find(item => String(item.id) === row.contractId);
                  const quantity = Number(row.quantity) || 0;
                  const enteredSizeQuantities = getEnteredSizeQuantities(row);
                  const amount = contract ? getReceiptAmount(contract, quantity, enteredSizeQuantities) : 0;
                  const paidAmount = Number(row.paidAmount) || 0;
                  const issued = contract ? getIssuedQuantity(contract) : 0;
                  const isEditingThisContract = Boolean(contract && String(contract.id) === editingSourceContractId);
                  const received = contract
                    ? getReceivedQuantityWithoutLog(contract, isEditingThisContract ? editingReceiptId : null)
                    : 0;
                  const previouslyPlanned = contract
                    ? rows.slice(0, index)
                      .filter(previousRow => previousRow.contractId === row.contractId)
                      .reduce((sum, previousRow) => sum + (Number(previousRow.quantity) || 0), 0)
                    : 0;
                  const receivedBeforeRow = received + previouslyPlanned;
                  const projectedReceived = receivedBeforeRow + quantity;
                  const exceedsIssued = Boolean(contract && projectedReceived > issued);
                  const nextContract = contract ? getNextContract(contract) : undefined;
                  const sizeKeys = contract ? getSetSizeKeys(contract) : [];
                  const previousRows = rows.slice(0, index).filter(previousRow => previousRow.contractId === row.contractId);
                  const previousRowQuantity = previousRows.reduce((sum, previousRow) => sum + (Number(previousRow.quantity) || 0), 0);
                  const previousRowValue = previousRows.reduce((sum, previousRow) => {
                    const previousContract = subContracts.find(item => String(item.id) === previousRow.contractId);
                    if (!previousContract) return sum;
                    const previousSizes = getEnteredSizeQuantities(previousRow);
                    return sum + getReceiptAmount(previousContract, Number(previousRow.quantity) || 0, previousSizes);
                  }, 0);
                  const previousRowPayments = previousRows.reduce((sum, previousRow) => sum + (Number(previousRow.paidAmount) || 0), 0);
                  const projectedQuantity = received + previousRowQuantity + quantity;
                  const projectedComplete = Boolean(contract && Number(contract.quantity) > 0 && projectedQuantity >= Number(contract.quantity));
                  const savedLogs = contract
                    ? (Array.isArray(contract.receivedGoodsLogs) ? contract.receivedGoodsLogs : [])
                      .filter(log => !(isEditingThisContract && log.id === editingReceiptId))
                    : [];
                  const existingPaid = getPaidAmount(savedLogs);
                  const existingDeducted = savedLogs.reduce((sum, log) => sum + (Number(log.deductedDeposit) || 0), 0);
                  const existingMaterialDeducted = savedLogs.reduce((sum, log) => sum + (Number(log.deductedMaterialAmount) || 0), 0);
                  const materialOffsets = contract
                    ? previousRows.reduce((offsets, previousRow) => {
                      const previousSizes = getEnteredSizeQuantities(previousRow);
                      const previousAmount = getReceiptAmount(contract, Number(previousRow.quantity) || 0, previousSizes);
                      const amountAfterPayment = Math.max(0, previousAmount - (Number(previousRow.paidAmount) || 0));
                      const materialRemaining = Math.max(
                        0,
                        getContractMaterialAmount(contract) - existingMaterialDeducted - offsets.material
                      );
                      const materialDeducted = Math.min(materialRemaining, amountAfterPayment);
                      const depositAvailable = Math.max(
                        0,
                        getDepositedAmount(contract) - existingDeducted - offsets.deposit
                      );
                      const depositDeducted = previousRow.deductDeposit
                        ? Math.min(depositAvailable, Math.max(0, amountAfterPayment - materialDeducted))
                        : 0;
                      return {
                        material: offsets.material + materialDeducted,
                        deposit: offsets.deposit + depositDeducted
                      };
                    }, { material: 0, deposit: 0 })
                    : { material: 0, deposit: 0 };
                  const stagedRecognized = contract
                    ? projectedComplete
                      ? getContractAmount(contract)
                      : savedLogs.reduce((sum, log) => sum + (Number(log.amount) || 0), 0) + previousRowValue + amount
                    : 0;
                  const availableForDeductions = Math.max(
                    0,
                    stagedRecognized - existingPaid - existingDeducted - existingMaterialDeducted -
                      previousRowPayments - materialOffsets.material - materialOffsets.deposit - paidAmount
                  );
                  const materialAvailable = contract
                    ? Math.max(0, getContractMaterialAmount(contract) - existingMaterialDeducted - materialOffsets.material)
                    : 0;
                  const currentMaterialDeducted = Math.min(materialAvailable, availableForDeductions);
                  const depositAvailable = contract
                    ? Math.max(0, getDepositedAmount(contract) - existingDeducted - materialOffsets.deposit)
                    : 0;
                  const currentDeducted = row.deductDeposit && contract
                    ? Math.min(
                      depositAvailable,
                      Math.max(0, availableForDeductions - currentMaterialDeducted)
                    )
                    : 0;
                  const stagedOutstanding = contract
                    ? Math.max(
                      0,
                      stagedRecognized - existingDeducted - existingMaterialDeducted - currentMaterialDeducted -
                        materialOffsets.material - materialOffsets.deposit - currentDeducted -
                        existingPaid - previousRowPayments - paidAmount
                    )
                    : 0;
                  const requiresDebtDueDate = stagedOutstanding > 0;

                  return (
                    <Fragment key={row.id}>
                    <tr style={{ borderTop: '1px solid #e2e8f0', verticalAlign: 'top' }}>
                      <td style={{ minWidth: '210px', padding: '8px' }}>
                        <select
                          aria-label={`Chọn tổ đan dòng ${index + 1}`}
                          required
                          value={row.contractId}
                          onChange={event => {
                            const selected = subContracts.find(item => String(item.id) === event.target.value);
                            updateRow(row.id, {
                              contractId: event.target.value,
                              itemTypeOption: selected?.itemTypeOption || 'BO',
                              debtDueDate: getDateAfterDaysString(2),
                              sizeQuantities: selected
                                ? Object.fromEntries(getSetSizeKeys(selected).map(key => [key, '']))
                                : {}
                            });
                          }}
                          style={inputStyle}
                        >
                          <option value="">-- Chọn HĐ Tổ Đan --</option>
                          {subContracts.map(item => (
                            <option key={item.id} value={String(item.id)}>
                              {item.craftGroupLeader || 'Tổ chưa đặt tên'} · {item.contractNo} · {item.productCode}
                            </option>
                          ))}
                        </select>
                        {contract && <small style={{ display: 'block', marginTop: '5px', color: '#64748b' }}>HĐ CTY: {contract.parentContractNo || '—'}</small>}
                      </td>
                      <td style={{ minWidth: '200px', padding: '8px', color: '#334155', fontSize: '12px' }}>
                        {contract ? (
                          <>
                            <strong style={{ color: '#1d4ed8' }}>{contract.productCode}</strong>
                            <div>{getProductName(contract) || contract.productName}</div>
                          </>
                        ) : '—'}
                      </td>
                      <td style={{ minWidth: '150px', padding: '8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {contract ? (
                          <>
                            <strong>{getContractUnit(contract)}</strong>
                            <div style={{ marginTop: '4px', color: '#64748b', fontSize: '12px' }}>{formatCurrency(Number(contract.unitPrice) || 0)}</div>
                          </>
                        ) : '—'}
                      </td>
                      <td style={{ minWidth: '140px', padding: '8px' }}>
                        <input type="date" required value={row.receivedDate} onChange={event => updateRow(row.id, { receivedDate: event.target.value })} style={inputStyle} />
                      </td>
                      <td style={{ minWidth: '130px', padding: '8px' }}>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={row.quantity}
                          onChange={event => updateRow(row.id, { quantity: event.target.value })}
                          placeholder={row.itemTypeOption === 'CAI' ? 'SL bộ quy đổi (nếu có)' : 'Số bộ nguyên'}
                          style={{ ...inputStyle, textAlign: 'right', borderColor: exceedsIssued ? '#dc2626' : '#cbd5e1' }}
                        />
                        {contract && (
                          <div style={{ marginTop: '7px', padding: '8px', borderRadius: '6px', backgroundColor: exceedsIssued ? '#fef2f2' : quantity > 0 && projectedReceived === issued ? '#f0fdf4' : '#eff6ff', color: exceedsIssued ? '#b91c1c' : quantity > 0 && projectedReceived === issued ? '#166534' : '#1d4ed8', fontSize: '11px', fontWeight: 700 }}>
                            {quantity > 0 && projectedReceived === issued
                              ? '✓ Đủ HĐ Đan'
                              : projectedReceived < issued
                                ? `Đã nhận ${formatNumber(projectedReceived)} / ${formatNumber(issued)} khung sơn đã phát`
                                : `⚠️ Nhận vượt khung đã phát ${formatNumber(projectedReceived - issued)} ${getContractUnit(contract).toLowerCase()}`}
                          </div>
                        )}
                      </td>
                      <td style={{ minWidth: '155px', padding: '8px', textAlign: 'right', color: '#b91c1c', fontWeight: 800, whiteSpace: 'nowrap' }}>
                        {contract ? formatCurrency(amount) : '—'}
                        {contract && (
                          <>
                            <div style={{ marginTop: '7px', color: '#475569', fontSize: '11px', fontWeight: 600, whiteSpace: 'normal' }}>
                              <div>Nguyên phụ liệu HĐ: {formatCurrency(getContractMaterialAmount(contract))}</div>
                              <div style={{ color: '#0f766e' }}>Tự trừ đợt này: {formatCurrency(currentMaterialDeducted)}</div>
                              <div style={{ color: '#1d4ed8' }}>Dự kiến thực trả: {formatCurrency(Math.max(0, amount - currentMaterialDeducted - currentDeducted))}</div>
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px', marginTop: '8px', color: '#334155', fontSize: '11px', fontWeight: 600, whiteSpace: 'normal', textAlign: 'left' }}>
                              <input type="checkbox" checked={row.deductDeposit} onChange={event => updateRow(row.id, { deductDeposit: event.target.checked })} />
                              Trừ cọc (sẽ trừ {formatCurrency(currentDeducted)}, còn {formatCurrency(depositAvailable)})
                            </label>
                          </>
                        )}
                      </td>
                      <td style={{ minWidth: '160px', padding: '8px' }}>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          aria-label={`Số tiền trả tổ đan dòng ${index + 1}`}
                          value={row.paidAmount}
                          onChange={event => updateRow(row.id, { paidAmount: event.target.value })}
                          placeholder="Số tiền thực trả sau các khoản trừ"
                          style={{ ...inputStyle, textAlign: 'right' }}
                        />
                        {contract && (
                          <small style={{ display: 'block', marginTop: '5px', color: stagedOutstanding > 0 ? '#b91c1c' : '#15803d', textAlign: 'right' }}>
                            {requiresDebtDueDate
                              ? `Công nợ còn lại sau trừ NVL/cọc: ${formatCurrency(stagedOutstanding)}`
                              : projectedComplete ? 'Đã thanh toán đủ' : 'Không còn công nợ lũy kế'}
                          </small>
                        )}
                      </td>
                      <td style={{ minWidth: '155px', padding: '8px' }}>
                        {requiresDebtDueDate ? (
                          <>
                            <input
                              type="date"
                              aria-label={`Hạn trả nợ dòng ${index + 1}`}
                              min={minimumDebtDueDate}
                              required
                              value={row.debtDueDate}
                              onChange={event => updateRow(row.id, { debtDueDate: event.target.value })}
                              style={{ ...inputStyle, borderColor: row.debtDueDate && !isValidDebtDueDate(row.debtDueDate, todayDate) ? '#dc2626' : '#cbd5e1' }}
                            />
                            {row.debtDueDate && !isValidDebtDueDate(row.debtDueDate, todayDate) && (
                              <small role="alert" style={{ display: 'block', marginTop: '4px', color: '#b91c1c' }}>
                                Hạn trả nợ phải lớn hơn ngày hiện tại ít nhất 1 ngày!
                              </small>
                            )}
                          </>
                        ) : contract ? (
                          <small style={{ color: '#15803d', fontWeight: 700 }}>Không phát sinh nợ</small>
                        ) : '—'}
                      </td>
                      <td style={{ minWidth: '80px', padding: '8px', textAlign: 'center' }}>
                        <button type="button" aria-label={`Xóa dòng nhận hàng ${index + 1}`} onClick={() => setRows(current => {
                          const remainingRows = current.filter(item => item.id !== row.id);
                          return remainingRows.length ? remainingRows : [createRow()];
                        })} style={{ padding: '7px 10px', border: 0, borderRadius: '5px', backgroundColor: '#fee2e2', color: '#b91c1c', fontSize: '17px', fontWeight: 800, cursor: 'pointer' }}>
                          −
                        </button>
                      </td>
                    </tr>
                    {contract && sizeKeys.length > 0 && (
                      <tr>
                      <td colSpan={9} style={{ padding: '0 8px 10px' }}>
                          <div style={{ padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#f8fafc' }}>
                            <strong style={{ color: '#475569', fontSize: '11px' }}>
                              Chọn chỉ tiêu nhận hàng · Mã bộ gồm {sizeKeys.length} size
                            </strong>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', margin: '9px 0', fontSize: '11px', fontWeight: 700 }}>
                              {([
                                ['BO', '📦 Chỉ tính bộ'],
                                ['CAI', '🧩 Tách theo cái / từng size'],
                                ['CA_HAI', '🔄 Cả bộ & cái']
                              ] as const).map(([option, label]) => (
                                <label key={option} style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                                  <input
                                    type="radio"
                                    name={`itemType-${row.id}`}
                                    checked={row.itemTypeOption === option}
                                    onChange={() => updateRow(row.id, { itemTypeOption: option })}
                                  />
                                  {label}
                                </label>
                              ))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginTop: '8px' }}>
                              {sizeKeys.map((sizeName, sizeIndex) => (
                                <label key={sizeName} style={{ color: '#475569', fontSize: '11px' }}>
                                  Size {sizeIndex + 1}
                                  {row.itemTypeOption !== 'BO' && (
                                    <input
                                      type="number"
                                      min="0"
                                      step="any"
                                      value={row.sizeQuantities[sizeName] || ''}
                                      onChange={event => updateRow(row.id, { sizeQuantities: { ...row.sizeQuantities, [sizeName]: event.target.value } })}
                                      placeholder="Số cái lẻ"
                                      style={{ ...inputStyle, marginTop: '4px' }}
                                    />
                                  )}
                                  {(() => {
                                    const priorPieces = previousRows.reduce((sum, previousRow) => {
                                      const bundles = previousRow.itemTypeOption === 'BO' || previousRow.itemTypeOption === 'CA_HAI'
                                        ? Number(previousRow.quantity) || 0
                                        : 0;
                                      const loosePieces = previousRow.itemTypeOption === 'BO'
                                        ? 0
                                        : Number(previousRow.sizeQuantities[sizeName]) || 0;
                                      return sum + bundles + loosePieces;
                                    }, 0);
                                    const currentBundles = row.itemTypeOption === 'BO' || row.itemTypeOption === 'CA_HAI'
                                      ? quantity
                                      : 0;
                                    const targetPieces = getTargetPiecesPerSize(contract, sizeName);
                                    const receivedPieces = getReceivedPiecesPerSize(
                                      contract,
                                      sizeName,
                                      isEditingThisContract ? editingReceiptId : null
                                    );
                                    const remainingPieces = Math.max(
                                      0,
                                      targetPieces - receivedPieces - priorPieces - currentBundles -
                                        (row.itemTypeOption === 'BO' ? 0 : Number(row.sizeQuantities[sizeName]) || 0)
                                    );
                                    return (
                                      <small style={{ display: 'block', marginTop: '4px', color: remainingPieces > 0 ? '#b91c1c' : '#15803d', fontWeight: 700 }}>
                                        Còn thiếu sau đợt này: {formatNumber(remainingPieces)} cái
                                      </small>
                                    );
                                  })()}
                                </label>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {contract && exceedsIssued && nextContract && (
                      <tr>
                        <td colSpan={9} style={{ padding: '0 8px 10px' }}>
                          <div role="alert" style={{ padding: '9px 11px', border: '1px solid #fdba74', borderRadius: '6px', backgroundColor: '#fff7ed', color: '#9a3412', fontSize: '12px' }}>
                            Số nhận vượt khung đã phát. Hợp đồng tiếp theo cùng tổ và mã hàng: <strong>{nextContract.contractNo}</strong> · {nextContract.productCode}.
                            <button type="button" onClick={() => {
                              const availableQty = Math.max(0, issued - receivedBeforeRow);
                              const excessQty = Math.max(0, quantity - availableQty);
                              updateRow(row.id, { quantity: String(availableQty) });
                              setRows(current => [...current, {
                                ...createRow(row.receivedDate),
                                contractId: String(nextContract.id),
                                quantity: String(excessQty),
                                sizeQuantities: Object.fromEntries(Object.keys(nextContract.sizeQuantities || {}).map(key => [key, '']))
                              }]);
                            }} style={{ marginLeft: '8px', padding: '4px 8px', border: 0, borderRadius: '4px', backgroundColor: '#c2410c', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                              Chia phần vượt sang HĐ tiếp
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section style={cardStyle}>
          <label style={{ display: 'block', color: '#334155', fontSize: '12px', fontWeight: 700 }}>
            Ghi Chú Phiếu Nhận
            <textarea value={note} onChange={event => setNote(event.target.value)} rows={2} style={{ ...inputStyle, marginTop: '6px', resize: 'vertical' }} placeholder="Ghi chú đợt nhận, chất lượng hoặc thông tin đối soát..." />
          </label>
        </section>

        {error && <div role="alert" style={{ padding: '10px 12px', border: '1px solid #fecaca', borderRadius: '6px', backgroundColor: '#fef2f2', color: '#b91c1c', fontSize: '13px' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '9px', flexWrap: 'wrap' }}>
          {editingReceiptId && <button type="button" onClick={resetForm} style={{ padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer' }}>Hủy sửa</button>}
          <button type="submit" disabled={isSubmitting || subContracts.length === 0} style={{ padding: '10px 16px', border: 0, borderRadius: '6px', backgroundColor: isSubmitting || subContracts.length === 0 ? '#94a3b8' : '#0284c7', color: '#fff', fontWeight: 800, cursor: isSubmitting ? 'wait' : 'pointer' }}>
            {isSubmitting ? '⏳ Đang lưu...' : `💾 ${editingReceiptId ? 'Cập Nhật Phiếu Nhận' : 'Lưu Phiếu Nhận'}`}
          </button>
        </div>
        {subContracts.length === 0 && <div role="status" style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#fff7ed', color: '#9a3412', fontSize: '13px' }}>Chưa có HĐ Tổ Đan. Hãy tạo hợp đồng trước khi lập phiếu nhận hàng.</div>}
      </form>

      <section style={cardStyle}>
        <h3 style={{ margin: '0 0 12px', color: '#1e293b', fontSize: '15px' }}>📋 Lịch Sử Nhận Hàng Đan</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '1700px', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr>
                {['Ngày', 'Tổ Đan / HĐ', 'Mã Hàng', 'SL Nhận đợt này', 'Lũy kế SL / HĐ', 'Đơn Giá', 'Tiền công', 'Trừ nguyên phụ liệu', 'Trừ cọc', 'Đã Trả đợt này', 'Đã Trả lũy kế', 'Công Nợ lũy kế', 'Hạn trả nợ', 'Trạng thái', 'Thao Tác'].map(header => (
                  <th key={header} style={tableHeaderStyle}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {receipts.length > 0 ? receipts.map(({ contract, log }) => {
                const summary = getContractFinancialSummary(contract);
                const dueBadge = getDebtDueBadge(getDebtDueStatus(summary.debtDueDate, summary.outstanding));
                return (
                <tr key={`${contract.id}-${log.id}`} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>{log.receivedDate}</td>
                  <td style={{ padding: '9px 10px' }}>{contract.craftGroupLeader || '—'}<br /><small>{contract.contractNo}</small></td>
                  <td style={{ padding: '9px 10px' }}>{contract.productCode}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNumber(log.quantity)} {getContractUnit(contract).toLowerCase()}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{formatNumber(summary.receivedQuantity)} / {formatNumber(summary.totalQuantity)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(Number(contract.unitPrice) || 0)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{formatCurrency(log.amount)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap', color: '#0f766e', fontWeight: 700 }}>{formatCurrency(Number(log.deductedMaterialAmount) || 0)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(log.deductedDeposit)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap', color: '#1d4ed8', fontWeight: 700 }}>{formatCurrency(Number(log.paidAmount) || 0)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{formatCurrency(summary.paidAmount)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap', color: summary.outstanding > 0 ? '#b91c1c' : '#15803d', fontWeight: 800 }}>{formatCurrency(summary.outstanding)}</td>
                  <td style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: summary.debtDueDate ? '#b91c1c' : '#64748b' }}>
                    {summary.debtDueDate || '—'}
                    {dueBadge && (
                      <span style={{ display: 'block', width: 'fit-content', marginTop: '5px', padding: '3px 7px', borderRadius: '999px', color: dueBadge.color, backgroundColor: dueBadge.backgroundColor, fontWeight: 800 }}>
                        {dueBadge.label}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: summary.outstanding > 0 && summary.complete ? '#b91c1c' : '#15803d', fontWeight: 700 }}>{summary.status}</td>
                  <td style={{ padding: '9px 10px' }}>
                    <div className="slip-action-buttons">
                      <button type="button" className="slip-action-button slip-action-edit" onClick={() => enterEdit(contract.id, log.id)}>✏️ Sửa</button>
                      <button type="button" className="slip-action-button slip-action-delete" onClick={() => deleteReceipt(contract, log)}>🗑️ Xóa</button>
                      <button type="button" className="slip-action-button slip-action-zalo" title="Tạo ảnh phiếu và mở Zalo để gửi" onClick={() => void sendZaloReceipt(contract, log)}>📲 Tạo Phiếu Gửi Zalo</button>
                    </div>
                  </td>
                </tr>
              );
              }) : (
                <tr><td colSpan={14} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>Chưa có phiếu nhận hàng đan nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {zaloMessage && (
          <div style={{ marginTop: '14px', padding: '12px', border: '1px solid #bae6fd', borderRadius: '7px', backgroundColor: '#f0f9ff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <strong style={{ color: '#075985', fontSize: '13px' }}>Nội dung phiếu đối soát gửi Zalo</strong>
              <button type="button" onClick={() => setZaloMessage('')} style={{ border: 0, background: 'transparent', color: '#64748b', cursor: 'pointer' }}>Đóng</button>
            </div>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: '#334155', fontSize: '12px' }}>{zaloMessage}</pre>
          </div>
        )}
        {imageReceipt && (
          <div
            ref={imageReceiptRef}
            aria-hidden="true"
            style={{ position: 'fixed', left: '-10000px', top: 0, width: '760px', padding: '32px 40px', color: '#0f172a', backgroundColor: '#fff', fontFamily: 'Arial, sans-serif' }}
          >
            <header style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '1px' }}>LỤC BÌNH CRAFTS</div>
              <h2 style={{ margin: '8px 0 4px', fontSize: '21px' }}>PHIẾU ĐỐI SOÁT NHẬN HÀNG ĐAN</h2>
              <div style={{ fontSize: '13px' }}>Ngày lập phiếu: {imageReceipt.log.receivedDate}</div>
            </header>
            <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontSize: '14px' }}>
              <div><strong>Tổ đan:</strong> {imageReceipt.contract.craftGroupLeader || '—'}</div>
              <div><strong>Hợp đồng:</strong> {imageReceipt.contract.contractNo || '—'}</div>
              <div><strong>Mã hàng:</strong> {imageReceipt.contract.productCode || '—'}</div>
              <div><strong>Tên hàng:</strong> {getProductName(imageReceipt.contract) || '—'}</div>
              <div><strong>Số lượng nhận đợt này:</strong> {formatNumber(imageReceipt.log.quantity)} {getContractUnit(imageReceipt.contract).toLowerCase()}</div>
              <div><strong>Đơn giá:</strong> {formatCurrency(Number(imageReceipt.contract.unitPrice) || 0)} / {getContractUnit(imageReceipt.contract).toLowerCase()}</div>
              <div><strong>Đã phát khung:</strong> {formatNumber(getIssuedQuantity(imageReceipt.contract))} {getContractUnit(imageReceipt.contract).toLowerCase()}</div>
              <div><strong>Đã nhận lũy kế:</strong> {formatNumber(getReceivedQuantity(imageReceipt.contract))} {getContractUnit(imageReceipt.contract).toLowerCase()}</div>
              <div><strong>Tiền công đợt này:</strong> {formatCurrency(imageReceipt.log.amount)}</div>
              <div><strong>Tổng nguyên phụ liệu:</strong> {formatCurrency(getContractFinancialSummary(imageReceipt.contract).materialAmount)}</div>
              <div><strong>Nguyên phụ liệu trừ đợt này:</strong> {formatCurrency(imageReceipt.log.deductedMaterialAmount || 0)}</div>
              <div><strong>Tiền cọc được trừ:</strong> {formatCurrency(imageReceipt.log.deductedDeposit)}</div>
              <div><strong>Đã trả đợt này:</strong> {formatCurrency(Number(imageReceipt.log.paidAmount) || 0)}</div>
              <div><strong>Công nợ lũy kế:</strong> {formatCurrency(getContractFinancialSummary(imageReceipt.contract).outstanding)}</div>
              {Object.entries(imageReceipt.log.sizeQuantities || {}).map(([size, quantity]) => (
                <div key={size}><strong>{size}:</strong> {formatNumber(quantity)}</div>
              ))}
              {imageReceipt.log.note && <div style={{ gridColumn: '1 / -1' }}><strong>Ghi chú:</strong> {imageReceipt.log.note}</div>}
            </section>
          </div>
        )}
      </section>
    </section>
  );
}
