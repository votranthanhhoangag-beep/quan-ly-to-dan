import { useMemo, useRef, useState } from 'react';
import type { ContractItem, SlipItem } from '../context/AppContext';
import { useApp } from '../context/AppContext';
import { usePersistentFormDraft } from '../hooks/usePersistentFormDraft';
import { useAuth } from '../context/AuthContext';

interface ReturnFormLine {
  id: string;
  productCode: string;
  sourceContractId: string;
  itemTypeOption: 'CAI' | 'CA_HAI';
  bundleQuantity: string;
  sizeQuantities: Record<string, string>;
}

type CompanyReturnSlip = SlipItem & {
  companyReturnLines: NonNullable<SlipItem['companyReturnLines']>;
};

type CompanyReturnLine = NonNullable<SlipItem['companyReturnLines']>[number];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeCompanyReturnLines = (value: unknown): CompanyReturnLine[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((line, index) => ({
    id: String(line.id || `return-line-${index}`),
    productCode: String(line.productCode || ''),
    productName: String(line.productName || ''),
    itemTypeOption: line.itemTypeOption === 'CA_HAI' ? 'CA_HAI' : 'CAI',
    bundleQuantity: Number(line.bundleQuantity) || 0,
    sizeQuantities: isRecord(line.sizeQuantities)
      ? Object.fromEntries(Object.entries(line.sizeQuantities).map(([size, quantity]) => [size, Number(quantity) || 0]))
      : {},
    quantity: Number(line.quantity) || 0,
    sourceContractId: String(line.sourceContractId || ''),
    sourceContractNo: String(line.sourceContractNo || ''),
    artisanName: String(line.artisanName || ''),
    artisanPhone: String(line.artisanPhone || ''),
    allocations: Array.isArray(line.allocations)
      ? line.allocations.filter(isRecord).map(allocation => ({
          contractId: String(allocation.contractId || ''),
          contractNo: String(allocation.contractNo || ''),
          companyName: String(allocation.companyName || ''),
          quantity: Number(allocation.quantity) || 0
        }))
      : []
  }));
};

const getToday = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const createLine = (): ReturnFormLine => ({
  id: `return-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
  productCode: '',
  sourceContractId: '',
  itemTypeOption: 'CAI',
  bundleQuantity: '',
  sizeQuantities: {}
});

const formatNumber = (value: number) => value.toLocaleString('vi-VN');
const normalized = (value: unknown) => String(value ?? '').trim().toLowerCase();
const getPiecesPerSet = (productCode: unknown) => {
  const count = Number(/\/(\d+)\s*$/.exec(String(productCode ?? '').trim())?.[1]);
  return Number.isInteger(count) && count > 1 && count <= 20 ? count : 1;
};

const getSizeKeys = (productCode: unknown) =>
  Array.from({ length: getPiecesPerSet(productCode) }, (_, index) => `Size ${index + 1}`);

const getLineBreakdown = (line: ReturnFormLine) => {
  const sizeKeys = getSizeKeys(line.productCode);
  const sizeQuantities = Object.fromEntries(sizeKeys.map(size => [
    size,
    Math.max(0, Number(line.sizeQuantities[size]) || 0)
  ]));
  const bundleQuantity = line.itemTypeOption === 'CA_HAI'
    ? Math.max(0, Number(line.bundleQuantity) || 0)
    : 0;
  const loosePieces = Object.values(sizeQuantities).reduce((sum, count) => sum + count, 0);
  const piecesPerSet = getPiecesPerSet(line.productCode);
  return {
    bundleQuantity,
    sizeQuantities,
    quantity: bundleQuantity + loosePieces / piecesPerSet
  };
};

const getSavedLineBreakdown = (line: CompanyReturnLine) => {
  const sizeKeys = getSizeKeys(line.productCode);
  const savedSizes = isRecord(line.sizeQuantities) ? line.sizeQuantities : {};
  const sizeQuantities = Object.fromEntries(sizeKeys.map(size => [
    size,
    Math.max(0, Number(savedSizes[size]) || 0)
  ]));
  const legacyQuantity = Number(line.quantity) || 0;
  const bundleQuantity = Number(line.bundleQuantity) || (
    Object.values(savedSizes).every(value => !(Number(value) > 0)) &&
    getPiecesPerSet(line.productCode) > 1
      ? legacyQuantity
      : 0
  );
  if (getPiecesPerSet(line.productCode) === 1 && Object.values(savedSizes).every(value => !(Number(value) > 0))) {
    sizeQuantities['Size 1'] = legacyQuantity;
  }
  return { bundleQuantity, sizeQuantities };
};

const formatReturnSummary = (bundleQuantity: number, sizeQuantities: Record<string, number>) => [
  bundleQuantity > 0 ? `${formatNumber(bundleQuantity)} bộ` : '',
  ...Object.entries(sizeQuantities)
    .filter(([, quantity]) => Number(quantity) > 0)
    .map(([size, quantity]) => `${formatNumber(Number(quantity))} cái ${size}`)
].filter(Boolean).join(' + ') || '—';

const getReceiptQuantity = (slip: SlipItem, contract: ContractItem) => {
  if (Number.isFinite(Number(slip.returnQuantityInContractUnits))) {
    return Number(slip.returnQuantityInContractUnits) || 0;
  }
  const quantity = Number(slip.quantity) || 0;
  const quantities = isRecord(slip.sizeQuantities) ? slip.sizeQuantities : {};
  const pieces = Object.values(quantities)
    .reduce<number>((sum, value) => sum + (Number(value) || 0), 0);
  const sizeCount = getPiecesPerSet(contract.productCode);
  const unit = String(slip.unit || '').toLowerCase();
  if (unit.includes('bộ (') && pieces > 0) return quantity + pieces / sizeCount;
  if (unit.includes('cái') || unit.includes('từng size')) {
    return (pieces > 0 ? pieces : quantity) / sizeCount;
  }
  return quantity;
};

const isFrameReceipt = (slip: SlipItem) => {
  const type = String(slip.type || '').toUpperCase();
  const slipNo = String(slip.slipNo || '').toUpperCase();
  const isCompanyReceipt = type === 'NK' || type === 'NHAP' || slipNo.startsWith('NK') ||
    (['NK_KHUNG', 'KS'].includes(type) || slipNo.startsWith('KS')) &&
      !slip.sourceContractId && !slip.craftGroupLeader;
  return !isCompanyReceipt &&
    (slipNo.startsWith('KS') || type === 'NK_KHUNG' || type === 'KS');
};

const tableHeaderStyle = {
  padding: '9px',
  backgroundColor: '#f1f5f9',
  color: '#334155',
  textAlign: 'left' as const,
  whiteSpace: 'nowrap' as const
};

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box' as const,
  padding: '8px 9px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  backgroundColor: '#fff',
  color: '#1e293b'
};

export default function FrameCompanyReturnManager() {
  const { hasPermission } = useAuth();
  const { products, contracts, slips, systemConfiguration, addSlip, updateSlip, deleteSlip } = useApp();
  const safeProducts = Array.isArray(products) ? products.filter(isRecord) : [];
  const safeContracts = Array.isArray(contracts) ? contracts.filter(isRecord) : [];
  const safeSlips = Array.isArray(slips) ? slips.filter(isRecord) : [];
  const sourceContracts = useMemo(
    () => safeContracts.filter(contract => contract.contractType === 'SUB'),
    [safeContracts]
  );
  const parentContracts = useMemo(
    () => safeContracts.filter(contract => contract.contractType === 'PARENT' || !contract.contractType),
    [safeContracts]
  );
  const productNames = useMemo(() => {
    const names = new Map<string, string>();
    safeProducts.forEach(product => {
      if (product.code) names.set(normalized(product.code), String(product.name || ''));
    });
    safeContracts.forEach(contract => {
      if (contract.productCode && contract.productName) {
        names.set(normalized(contract.productCode), String(contract.productName));
      }
    });
    safeSlips.forEach(slip => {
      if (slip.productCode && slip.productName) {
        names.set(normalized(slip.productCode), String(slip.productName));
      }
    });
    return names;
  }, [safeProducts, safeContracts, safeSlips]);
  const productCodes = useMemo(() => [...new Set([
    ...safeProducts.map(product => String(product.code || '')),
    ...safeContracts.map(contract => String(contract.productCode || '')),
    ...safeSlips.map(slip => String(slip.productCode || ''))
  ].filter(Boolean))].sort((first, second) => first.localeCompare(second, 'vi', { numeric: true })), [safeProducts, safeContracts, safeSlips]);

  const [date, setDate] = useState(getToday());
  const [lines, setLines] = useState<ReturnFormLine[]>([createLine()]);
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const { formDraftProps, clearDraft } = usePersistentFormDraft<HTMLElement>('frame-company-return');
  const [exportingImage, setExportingImage] = useState(false);
  const [printSlip, setPrintSlip] = useState<CompanyReturnSlip | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const savedSlips = useMemo(() => safeSlips
    .filter((slip): slip is CompanyReturnSlip =>
      slip.type === 'XUAT_KS_TRA_CTY' && Array.isArray(slip.companyReturnLines)
    )
    .map(slip => ({ ...slip, companyReturnLines: normalizeCompanyReturnLines(slip.companyReturnLines) }))
    .slice()
    .sort((first, second) => String(second.date || '').localeCompare(String(first.date || ''))), [safeSlips]);

  const findSourceContract = (contractId: string) =>
    sourceContracts.find(contract => String(contract.id) === contractId);

  const returnedBySource = (contract: ContractItem, productCode: string) => safeSlips
    .filter(slip => isFrameReceipt(slip) && normalized(slip.productCode) === normalized(productCode))
    .filter(slip => {
      if (slip.sourceContractId) return String(slip.sourceContractId) === String(contract.id);
      if (slip.contractNo) return normalized(slip.contractNo) === normalized(contract.contractNo);
      return normalized(slip.craftGroupLeader || slip.partnerName || slip.partner) === normalized(contract.craftGroupLeader);
    })
    .reduce((sum, slip) => sum + getReceiptQuantity(slip, contract), 0);

  const alreadyReturnedBySource = (contract: ContractItem, productCode: string, excludedId = editingId) =>
    savedSlips
      .filter(slip => String(slip.id) !== String(excludedId ?? ''))
      .flatMap(slip => normalizeCompanyReturnLines(slip.companyReturnLines))
      .filter(line =>
        String(line.sourceContractId) === String(contract.id) &&
        normalized(line.productCode) === normalized(productCode)
      )
      .reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);

  const getAvailableFromSource = (contract: ContractItem, productCode: string, excludedId = editingId) =>
    Math.max(0, returnedBySource(contract, productCode) - alreadyReturnedBySource(contract, productCode, excludedId));

  const getCompanyContractBalances = (productCode: string, excludedId = editingId) => {
    return parentContracts.flatMap(parent => {
      if (normalized(parent.productCode) !== normalized(productCode)) return [];
      const children = sourceContracts.filter(contract =>
        normalized(contract.parentContractNo) === normalized(parent.contractNo) &&
        normalized(contract.productCode) === normalized(productCode)
      );
      const exports = children.flatMap(contract =>
        Array.isArray(contract.exportLogs) ? contract.exportLogs.filter(isRecord) : []
      );
      const exported = children.reduce((sum, contract) => {
        const logsTotal = (Array.isArray(contract.exportLogs) ? contract.exportLogs : [])
          .filter(isRecord)
          .reduce((logSum, log) => logSum + (Number(log.actualQty) || 0), 0);
        return sum + Math.max(Number(contract.totalActualExported) || 0, logsTotal);
      }, 0);
      const alreadyReturned = savedSlips
        .filter(slip => String(slip.id) !== String(excludedId ?? ''))
        .flatMap(slip => normalizeCompanyReturnLines(slip.companyReturnLines))
        .flatMap(line => Array.isArray(line.allocations) ? line.allocations : [])
        .filter(allocation => String(allocation.contractId) === String(parent.id))
        .reduce((sum, allocation) => sum + (Number(allocation.quantity) || 0), 0);
      const remaining = Math.max(0, exported - alreadyReturned);
      if (remaining <= 0) return [];
      const latestExportDate = exports.reduce((latest, log) =>
        String(log.exportDate || '') > latest ? String(log.exportDate || '') : latest, '');
      return [{
        contract: parent,
        remaining,
        latestExportDate,
        companyName: parent.companyName || parent.company || parent.partner || 'Công ty'
      }];
    }).sort((first, second) =>
      first.remaining - second.remaining ||
      second.latestExportDate.localeCompare(first.latestExportDate) ||
      String(first.contract.contractNo).localeCompare(String(second.contract.contractNo), 'vi', { numeric: true })
    );
  };

  const resetForm = () => {
    clearDraft();
    setDate(getToday());
    setLines([createLine()]);
    setNote('');
    setEditingId(null);
    setError('');
  };

  const startEdit = (slip: CompanyReturnSlip) => {
    setEditingId(slip.id);
    setDate(String(slip.date || getToday()));
    setNote(String(slip.note || ''));
    setLines(normalizeCompanyReturnLines(slip.companyReturnLines).map(line => {
      const breakdown = getSavedLineBreakdown(line);
      return {
        id: line.id,
        productCode: line.productCode,
        sourceContractId: String(line.sourceContractId),
        itemTypeOption: line.itemTypeOption === 'CA_HAI' || breakdown.bundleQuantity > 0 ? 'CA_HAI' : 'CAI',
        bundleQuantity: String(breakdown.bundleQuantity || ''),
        sizeQuantities: Object.fromEntries(
          Object.entries(breakdown.sizeQuantities).map(([size, quantity]) => [size, quantity ? String(quantity) : ''])
        )
      };
    }));
    setError('');
  };

  const saveSlip = () => {
    if (submissionLock.current) return;
    setError('');
    const validLines = lines.map(line => ({
      line,
      contract: findSourceContract(line.sourceContractId),
      breakdown: getLineBreakdown(line)
    }));
    const invalidLine = validLines.find(({ line, contract, breakdown }) =>
      !line.productCode || !contract ||
      normalized(contract.productCode) !== normalized(line.productCode) ||
      !Number.isFinite(breakdown.quantity) || breakdown.quantity <= 0
    );
    if (invalidLine) {
      setError('Vui lòng chọn đúng mã hàng, hợp đồng tổ đan và nhập số bộ hoặc số cái lẻ lớn hơn 0 cho từng dòng.');
      return;
    }

    const requestedBySource = new Map<string, number>();
    validLines.forEach(({ line, breakdown }) => {
      const key = `${line.sourceContractId}|${normalized(line.productCode)}`;
      requestedBySource.set(key, (requestedBySource.get(key) || 0) + breakdown.quantity);
    });
    for (const [key, requested] of requestedBySource) {
      const [sourceId, productCode] = key.split('|');
      const contract = findSourceContract(sourceId);
      if (!contract) continue;
      const available = getAvailableFromSource(contract, productCode);
      if (requested > available + Number.EPSILON) {
        setError(`Tổ đan ${contract.craftGroupLeader || contract.contractNo} chỉ còn ${formatNumber(available)} khung ${productCode} đã trả về, không đủ ${formatNumber(requested)} khung.`);
        return;
      }
    }

    const priorityLines = validLines.slice().sort((first, second) => {
      const firstContract = first.contract!;
      const secondContract = second.contract!;
      const firstPrior = returnedBySource(firstContract, first.line.productCode) -
        alreadyReturnedBySource(firstContract, first.line.productCode) +
        (requestedBySource.get(`${first.line.sourceContractId}|${normalized(first.line.productCode)}`) || 0);
      const secondPrior = returnedBySource(secondContract, second.line.productCode) -
        alreadyReturnedBySource(secondContract, second.line.productCode) +
        (requestedBySource.get(`${second.line.sourceContractId}|${normalized(second.line.productCode)}`) || 0);
      return firstPrior - secondPrior ||
        String(firstContract.craftGroupLeader || '').localeCompare(String(secondContract.craftGroupLeader || ''), 'vi');
    });
    const remainingByCompany = new Map<string, number>();
    const savedLines: NonNullable<SlipItem['companyReturnLines']> = [];

    for (const { line, contract: source, breakdown } of priorityLines) {
      if (!source) continue;
      const candidates = getCompanyContractBalances(line.productCode);
      let remainingQuantity = breakdown.quantity;
      const allocations: NonNullable<SlipItem['companyReturnLines']>[number]['allocations'] = [];
      for (const candidate of candidates) {
        const contractId = String(candidate.contract.id);
        const available = remainingByCompany.has(contractId)
          ? remainingByCompany.get(contractId)!
          : candidate.remaining;
        const allocated = Math.min(available, remainingQuantity);
        if (allocated <= 0) continue;
        allocations.push({
          contractId: candidate.contract.id,
          contractNo: candidate.contract.contractNo,
          companyName: candidate.companyName,
          quantity: allocated
        });
        remainingByCompany.set(contractId, available - allocated);
        remainingQuantity -= allocated;
        if (remainingQuantity <= Number.EPSILON) break;
      }
      if (remainingQuantity > Number.EPSILON) {
        setError(`Các hợp đồng công ty cho mã ${line.productCode} hiện chỉ còn ${formatNumber(breakdown.quantity - remainingQuantity)} bộ tương đương cần thu hồi; chưa đủ ${formatNumber(breakdown.quantity)} bộ tương đương để lập phiếu.`);
        return;
      }
      savedLines.push({
        id: line.id,
        productCode: line.productCode,
        productName: productNames.get(normalized(line.productCode)) || '',
        itemTypeOption: line.itemTypeOption,
        bundleQuantity: breakdown.bundleQuantity,
        sizeQuantities: breakdown.sizeQuantities,
        quantity: breakdown.quantity,
        sourceContractId: source.id,
        sourceContractNo: source.contractNo,
        artisanName: source.craftGroupLeader || '',
        artisanPhone: source.zalo || source.phone || '',
        allocations
      });
    }

    submissionLock.current = true;
    setIsSubmitting(true);
    const year = date.slice(0, 4);
    const nextSequence = savedSlips.reduce((max, slip) => {
      const match = new RegExp(`^(\\d+)/${year}/XKSKCTY$`).exec(String(slip.slipNo || ''));
      return Math.max(max, Number(match?.[1]) || 0);
    }, 0) + (editingId === null ? 1 : 0);
    const currentSlip = savedSlips.find(slip => String(slip.id) === String(editingId));
    const totalQuantity = savedLines.reduce((sum, line) => sum + line.quantity, 0);
    const firstLine = savedLines[0];
    const slip: CompanyReturnSlip = {
      id: editingId ?? `XKSKCTY-${crypto.randomUUID()}`,
      type: 'XUAT_KS_TRA_CTY',
      slipNo: currentSlip?.slipNo || `${String(nextSequence).padStart(2, '0')}/${year}/XKSKCTY`,
      date,
      contractNo: firstLine?.sourceContractNo || '',
      productCode: firstLine?.productCode || '',
      productName: firstLine?.productName || '',
      quantity: totalQuantity,
      unit: 'Bộ/Cái',
      partner: firstLine?.artisanName || '',
      partnerName: firstLine?.artisanName || '',
      craftGroupLeader: firstLine?.artisanName || '',
      note,
      companyReturnLines: savedLines
    };
    if (editingId === null) addSlip(slip);
    else updateSlip(slip);
    resetForm();
    window.setTimeout(() => {
      submissionLock.current = false;
      setIsSubmitting(false);
    }, 700);
  };

  const openPreview = (slip: CompanyReturnSlip) => {
    setError('');
    setPrintSlip(slip);
  };

  const handlePrint = () => {
    if (!printRef.current) {
      setError('Không tìm thấy nội dung phiếu để in.');
      return;
    }
    window.print();
  };

  const handleExportPng = async () => {
    if (!printSlip || !printRef.current) {
      setError('Không tìm thấy nội dung phiếu để xuất ảnh.');
      return;
    }
    setExportingImage(true);
    setError('');
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(printRef.current, {
        scale: Math.max(2, window.devicePixelRatio || 1),
        backgroundColor: '#ffffff',
        logging: false
      });
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(result => result
          ? resolve(result)
          : reject(new Error('Trình duyệt không tạo được ảnh PNG từ phiếu.')), 'image/png');
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${String(printSlip.slipNo || 'phieu-xuat-khung').replace(/[^\w-]+/g, '_')}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (exportError) {
      console.error('Không thể xuất ảnh phiếu trả khung công ty:', exportError);
      setError(exportError instanceof Error ? exportError.message : 'Không thể tạo ảnh PNG phiếu.');
    } finally {
      setExportingImage(false);
    }
  };

  const updateLine = (id: string, updates: Partial<ReturnFormLine>) =>
    setLines(current => current.map(line => line.id === id ? { ...line, ...updates } : line));

  return (
    <section {...formDraftProps} style={{ padding: '16px', border: '1px solid #cbd5e1', borderRadius: '9px', backgroundColor: '#fff', display: 'grid', gap: '14px' }}>
      <header>
        <h3 style={{ margin: 0, color: '#1e293b', fontSize: '16px' }}>📤 Xuất KS Trả Cty</h3>
        <small style={{ color: '#64748b' }}>Chỉ phân bổ khung đã được tổ đan trả về; phiếu được ưu tiên theo lượng trả của tổ và số khung còn phải thu hồi của từng hợp đồng công ty.</small>
      </header>

      <div style={{ display: 'grid', gap: '12px', padding: '14px', border: '1px solid #bae6fd', borderRadius: '8px', backgroundColor: '#f0f9ff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
          <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Ngày tháng
            <input type="date" value={date} onChange={event => setDate(event.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Ghi chú
            <input value={note} onChange={event => setNote(event.target.value)} placeholder="Tình trạng khung / ghi chú kỹ thuật" style={inputStyle} />
          </label>
        </div>

        {lines.map((line, index) => {
          const source = findSourceContract(line.sourceContractId);
            const breakdown = getLineBreakdown(line);
            const quantity = breakdown.quantity;
            const available = source && line.productCode
              ? getAvailableFromSource(source, line.productCode)
              : 0;
            const candidates = line.productCode ? getCompanyContractBalances(line.productCode) : [];
            const companyCapacity = candidates.reduce((sum, candidate) => sum + candidate.remaining, 0);
            const sizeKeys = getSizeKeys(line.productCode);
          return (
            <div key={line.id} style={{ display: 'grid', gap: '9px', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '7px', backgroundColor: '#fff' }}>
              <strong style={{ color: '#334155', fontSize: '12px' }}>Dòng {index + 1}</strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '9px', alignItems: 'end' }}>
                <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Mã hàng
                  <select value={line.productCode} onChange={event => updateLine(line.id, {
                    productCode: event.target.value,
                    sourceContractId: '',
                    itemTypeOption: 'CAI',
                    bundleQuantity: '',
                    sizeQuantities: {}
                  })} style={inputStyle}>
                    <option value="">-- Chọn mã hàng --</option>
                    {productCodes.map(code => <option key={code} value={code}>{code}</option>)}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Tên hàng
                  <input readOnly value={productNames.get(normalized(line.productCode)) || ''} placeholder="Tự động theo mã hàng" style={{ ...inputStyle, backgroundColor: '#f1f5f9' }} />
                </label>
                <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Hợp đồng tổ đan
                  <select value={line.sourceContractId} onChange={event => updateLine(line.id, { sourceContractId: event.target.value })} style={inputStyle}>
                    <option value="">-- Chọn tổ đan trả khung --</option>
                    {sourceContracts
                      .filter(contract => normalized(contract.productCode) === normalized(line.productCode))
                      .sort((first, second) =>
                        returnedBySource(first, line.productCode) - returnedBySource(second, line.productCode) ||
                        String(first.craftGroupLeader || '').localeCompare(String(second.craftGroupLeader || ''), 'vi')
                      )
                      .map(contract => (
                        <option key={contract.id} value={String(contract.id)}>
                          {contract.contractNo} · {contract.craftGroupLeader || 'Chưa có tên tổ'} · đã trả {formatNumber(returnedBySource(contract, line.productCode))}
                        </option>
                      ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Tên tổ đan
                  <input readOnly value={source?.craftGroupLeader || ''} style={{ ...inputStyle, backgroundColor: '#f1f5f9' }} />
                </label>
                <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Số điện thoại
                  <input readOnly value={source?.zalo || source?.phone || ''} style={{ ...inputStyle, backgroundColor: '#f1f5f9' }} />
                </label>
                {lines.length > 1 && (
                  <button type="button" onClick={() => setLines(current => current.filter(item => item.id !== line.id))} style={{ padding: '8px 10px', border: 0, borderRadius: '6px', backgroundColor: '#fee2e2', color: '#b91c1c', fontWeight: 700, cursor: 'pointer' }}>Xóa dòng</button>
                )}
              </div>
              {line.productCode && (
                <fieldset style={{ display: 'grid', gap: '10px', margin: 0, padding: '12px', border: '1px solid #e2e8f0', borderRadius: '7px' }}>
                  <legend style={{ padding: '0 6px', fontSize: '12px', fontWeight: 700, color: '#334155' }}>Chi tiết số lượng xuất trả</legend>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
                    {([
                      ['CAI', 'Chỉ xuất cái lẻ theo size'],
                      ['CA_HAI', 'Xuất bộ nguyên & cái lẻ']
                    ] as const).map(([option, label]) => (
                      <label key={option} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name={`company-return-mode-${line.id}`}
                          checked={line.itemTypeOption === option}
                          onChange={() => updateLine(line.id, {
                            itemTypeOption: option,
                            bundleQuantity: option === 'CAI' ? '' : line.bundleQuantity
                          })}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  {line.itemTypeOption === 'CA_HAI' && (
                    <label style={{ display: 'grid', gap: '5px', maxWidth: '260px', fontSize: '12px', fontWeight: 700 }}>
                      Số bộ xuất
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={line.bundleQuantity}
                        onChange={event => updateLine(line.id, { bundleQuantity: event.target.value })}
                        style={inputStyle}
                      />
                    </label>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '9px' }}>
                    {sizeKeys.map(size => (
                      <label key={size} style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>
                        Cái lẻ {size}
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={line.sizeQuantities[size] || ''}
                          onChange={event => updateLine(line.id, {
                            sizeQuantities: { ...line.sizeQuantities, [size]: event.target.value }
                          })}
                          style={inputStyle}
                        />
                      </label>
                    ))}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '12px', color: '#475569' }}>
                    Quy đổi: <strong>{formatNumber(quantity)} bộ tương đương</strong>
                    <div>{formatReturnSummary(breakdown.bundleQuantity, breakdown.sizeQuantities)}</div>
                  </div>
                </fieldset>
              )}
              {line.productCode && (
                <small style={{ color: '#475569' }}>
                  Tổ này đã trả còn có thể xuất: <strong>{formatNumber(available)}</strong> · Các hợp đồng công ty còn phải thu: <strong>{formatNumber(companyCapacity)}</strong>
                  {quantity > 0 && quantity > available && <span style={{ color: '#b91c1c', fontWeight: 700 }}> · Vượt số khung tổ đã trả</span>}
                  {quantity > companyCapacity && <span style={{ color: '#b91c1c', fontWeight: 700 }}> · Vượt số khung công ty còn phải thu</span>}
                </small>
              )}
            </div>
          );
        })}

        {error && <div role="alert" style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{error}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <button type="button" onClick={() => setLines(current => [...current, createLine()])} style={{ padding: '9px 12px', border: '1px solid #0284c7', borderRadius: '6px', backgroundColor: '#fff', color: '#0369a1', fontWeight: 700, cursor: 'pointer' }}>＋ Thêm dòng</button>
          <button type="button" onClick={saveSlip} disabled={isSubmitting} style={{ padding: '9px 12px', border: 0, borderRadius: '6px', backgroundColor: isSubmitting ? '#94a3b8' : '#0284c7', color: '#fff', fontWeight: 700, cursor: isSubmitting ? 'wait' : 'pointer' }}>{isSubmitting ? '⏳ Đang lưu...' : editingId === null ? '💾 Lưu phiếu' : '💾 Lưu sửa'}</button>
          {editingId !== null && <button type="button" onClick={resetForm} style={{ padding: '9px 12px', border: '1px solid #94a3b8', borderRadius: '6px', backgroundColor: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer' }}>Hủy sửa</button>}
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '7px' }}>
        <table style={{ width: '100%', minWidth: '1100px', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead><tr>{['Số phiếu / Ngày', 'Mã hàng / Tên hàng', 'Tổ đan trả khung', 'Phân bổ hợp đồng công ty', 'Số lượng', 'Ghi chú', 'Thao tác'].map(label => <th key={label} style={tableHeaderStyle}>{label}</th>)}</tr></thead>
          <tbody>
            {savedSlips.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '18px', textAlign: 'center', color: '#64748b' }}>Chưa có phiếu xuất khung trả công ty.</td></tr>
            ) : savedSlips.map(slip => (
              <tr key={slip.id} style={{ borderTop: '1px solid #e2e8f0', verticalAlign: 'top' }}>
                <td style={{ padding: '9px', whiteSpace: 'nowrap' }}><strong>{slip.slipNo}</strong><br />{slip.date}</td>
                <td style={{ padding: '9px' }}>{slip.companyReturnLines.map(line => {
                  const breakdown = getSavedLineBreakdown(line);
                  return <div key={line.id}><strong>{line.productCode}</strong><br />{line.productName || '—'}<br /><small>{formatReturnSummary(breakdown.bundleQuantity, breakdown.sizeQuantities)}</small></div>;
                })}</td>
                <td style={{ padding: '9px' }}>{slip.companyReturnLines.map(line => <div key={line.id}>{line.sourceContractNo} · {line.artisanName || '—'}<br /><small>{line.artisanPhone || 'Chưa có SĐT'}</small></div>)}</td>
                <td style={{ padding: '9px' }}>{slip.companyReturnLines.map(line => <div key={line.id}>{line.allocations.map(allocation => <div key={allocation.contractId}>{allocation.companyName} · HĐ {allocation.contractNo}: {formatNumber(allocation.quantity)}</div>)}</div>)}</td>
                <td style={{ padding: '9px', textAlign: 'right', fontWeight: 700 }}>{formatNumber(Number(slip.quantity) || 0)} bộ tương đương</td>
                <td style={{ padding: '9px' }}>{slip.note || '—'}</td>
                <td style={{ padding: '9px' }}>
                  <div className="slip-action-buttons">
                    <button type="button" className="slip-action-button slip-action-edit" onClick={() => startEdit(slip)}>✏️ Sửa</button>
                    {hasPermission('manage_settings') && <button type="button" className="slip-action-button slip-action-delete" onClick={() => {
                      if (window.confirm(`Xóa phiếu ${slip.slipNo}?`)) {
                        deleteSlip(slip.id);
                        if (String(editingId) === String(slip.id)) resetForm();
                      }
                    }}>🗑️ Xóa</button>}
                    <button type="button" className="slip-action-button slip-action-print" onClick={() => openPreview(slip)}>🖨️ In phiếu / Xuất ảnh</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {printSlip && (
        <div id="company-frame-return-dialog" role="dialog" aria-modal="true" aria-label="Xem trước phiếu xuất khung trả công ty" style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', gridTemplateRows: 'auto 1fr', padding: '18px', backgroundColor: 'rgba(15, 23, 42, 0.65)' }}>
          <style>{`
            @page { size: A5 portrait; margin: 10mm; }
            @media print {
              body * { visibility: hidden !important; }
              #company-frame-return-print, #company-frame-return-print * { visibility: visible !important; }
              #company-frame-return-dialog, #company-frame-return-preview, .company-frame-return-scroll { display: contents !important; overflow: visible !important; }
              #company-frame-return-print { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; max-width: none !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; }
            }
          `}</style>
          <div id="company-frame-return-preview" style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: '12px', minHeight: 0, width: 'min(100%, 900px)', margin: '0 auto', padding: '14px', borderRadius: '10px', backgroundColor: '#fff' }}>
            <div className="preview-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <strong>Xem trước phiếu · {printSlip.slipNo}</strong>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => void handleExportPng()} disabled={exportingImage} style={{ padding: '9px 12px', border: 0, borderRadius: '6px', backgroundColor: '#0284c7', color: '#fff', fontWeight: 700, cursor: exportingImage ? 'wait' : 'pointer' }}>{exportingImage ? 'Đang xuất ảnh…' : 'Xuất ảnh Zalo (PNG)'}</button>
                <button type="button" onClick={handlePrint} style={{ padding: '9px 12px', border: 0, borderRadius: '6px', backgroundColor: '#0f766e', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>In / Lưu PDF</button>
                <button type="button" onClick={() => setPrintSlip(null)} style={{ padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer' }}>Đóng</button>
              </div>
            </div>
            {error && <div role="alert" style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{error}</div>}
            <div className="company-frame-return-scroll" style={{ minHeight: 0, overflow: 'auto', backgroundColor: '#f1f5f9', padding: '12px' }}>
              <div id="company-frame-return-print" ref={printRef} style={{ boxSizing: 'border-box', width: '100%', maxWidth: '760px', minHeight: '480px', margin: '0 auto', padding: '30px 34px', border: '1px solid #cbd5e1', boxShadow: '0 2px 8px rgba(15,23,42,.12)', color: '#0f172a', backgroundColor: '#fff', fontFamily: 'Arial, sans-serif' }}>
                <header style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '12px', marginBottom: '16px' }}>
                  {systemConfiguration?.logo && <img src={systemConfiguration.logo} alt="Logo xưởng" style={{ display: 'block', maxWidth: '90px', maxHeight: '54px', objectFit: 'contain', margin: '0 auto 8px' }} />}
                  <div style={{ fontSize: '13px', fontWeight: 700 }}>{systemConfiguration?.companyName || 'XƯỞNG SẢN XUẤT'}</div>
                  {systemConfiguration?.address && <div style={{ fontSize: '10px', marginTop: '3px' }}>{systemConfiguration.address}</div>}
                  {systemConfiguration?.phone && <div style={{ fontSize: '10px', marginTop: '3px' }}>Điện thoại: {systemConfiguration.phone}</div>}
                  <h2 style={{ margin: '12px 0 6px', fontSize: '18px' }}>PHIẾU XUẤT KHUNG SƠN TRẢ CÔNG TY</h2>
                  <div>Số phiếu: <strong>{printSlip.slipNo}</strong> · Ngày: {printSlip.date}</div>
                </header>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead><tr>{['Mã hàng', 'Tên hàng', 'Tổ đan trả', 'Công ty / Hợp đồng nhận', 'Số lượng chi tiết'].map(label => <th key={label} style={{ border: '1px solid #94a3b8', padding: '7px', backgroundColor: '#f1f5f9', textAlign: 'left' }}>{label}</th>)}</tr></thead>
                  <tbody>{printSlip.companyReturnLines.map(line => {
                    const breakdown = getSavedLineBreakdown(line);
                    return (
                      <tr key={line.id}>
                        <td style={{ border: '1px solid #94a3b8', padding: '7px' }}>{line.productCode}</td>
                        <td style={{ border: '1px solid #94a3b8', padding: '7px' }}>{line.productName || '—'}</td>
                        <td style={{ border: '1px solid #94a3b8', padding: '7px' }}>{line.sourceContractNo} · {line.artisanName}<br />{line.artisanPhone}</td>
                        <td style={{ border: '1px solid #94a3b8', padding: '7px' }}>{line.allocations.map(allocation => <div key={allocation.contractId}>{allocation.companyName} · HĐ {allocation.contractNo}: {formatNumber(allocation.quantity)}</div>)}</td>
                        <td style={{ border: '1px solid #94a3b8', padding: '7px' }}>{formatReturnSummary(breakdown.bundleQuantity, breakdown.sizeQuantities)}<br /><strong>{formatNumber(line.quantity)} bộ tương đương</strong></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
                <p style={{ fontSize: '11px' }}><strong>Ghi chú:</strong> {printSlip.note || '—'}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '36px', textAlign: 'center', fontSize: '11px' }}>
                  <div style={{ flex: 1 }}>Người giao khung<br /><br /><br />(Ký, ghi rõ họ tên)</div><div style={{ flex: 1 }}>Thủ kho<br /><br /><br />(Ký, ghi rõ họ tên)</div><div style={{ flex: 1 }}>Đại diện công ty<br /><br /><br />(Ký, ghi rõ họ tên)</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
