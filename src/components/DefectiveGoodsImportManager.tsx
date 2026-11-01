import { useMemo, useRef, useState, type FormEvent } from 'react';
import type {
  ContractItem,
  DefectiveGoodsImportSlip,
  KnittingExportSlip,
  ReceivedGoodsLog
} from '../context/AppContext';
import { useApp } from '../context/AppContext';
import { usePersistentFormDraft } from '../hooks/usePersistentFormDraft';

interface ReceiptSource {
  contract: ContractItem;
  receipt: ReceivedGoodsLog;
  key: string;
}

interface DetailLine {
  id: string;
  kind: string;
  quantity: string;
}

interface DefectiveSourceQuantity {
  bundles: number;
  sizes: Record<string, number>;
}

const getToday = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const getPiecesPerSet = (productCode: string) => {
  const count = Number(/\/(\d+)\s*$/.exec(String(productCode || '').trim())?.[1]);
  return Number.isInteger(count) && count > 1 ? count : 1;
};

const getSizeNames = (contract: ContractItem) => {
  const piecesPerSet = getPiecesPerSet(contract.productCode);
  return piecesPerSet > 1
    ? Array.from({ length: piecesPerSet }, (_, index) => `Size ${index + 1}`)
    : ['Cái'];
};

const getReceiptQuantityInContractUnits = (contract: ContractItem, receipt: ReceivedGoodsLog) => {
  const piecesPerSet = getPiecesPerSet(contract.productCode);
  const quantity = Number(receipt.quantity) || 0;
  if (piecesPerSet === 1) return quantity;
  const pieceCounts = Object.entries(receipt.sizeQuantities || {})
    .filter(([size]) => size !== 'Bộ')
    .map(([, count]) => Number(count) || 0);
  const setCount = pieceCounts.length > 0 ? Math.min(...pieceCounts) : 0;
  if (contract.itemTypeOption === 'CAI') return setCount || quantity;
  if (contract.itemTypeOption === 'CA_HAI') return quantity + setCount;
  return quantity;
};

const normalizeSizeCounts = (
  counts: Record<string, number | string> | undefined,
  sizeNames: string[]
) => {
  const normalized = Object.fromEntries(sizeNames.map(size => [size, 0]));
  const entries = Object.entries(counts || {}).filter(([key]) => key !== 'Bộ');
  const zeroBasedKeys = entries.some(([key]) => /(?:^|\D)0$/.test(key));

  entries.forEach(([key, value], entryIndex) => {
    const directIndex = sizeNames.indexOf(key);
    const suffix = Number.parseInt(key.match(/(\d+)$/)?.[1] || '', 10);
    const index = directIndex >= 0
      ? directIndex
      : Number.isInteger(suffix)
        ? (/^\d+$/.test(key) && zeroBasedKeys) || suffix === 0 ? suffix : suffix - 1
        : entryIndex;
    if (index >= 0 && index < sizeNames.length) {
      normalized[sizeNames[index]] += Number(value) || 0;
    }
  });
  return normalized;
};

const getDefectiveSourceQuantity = (
  source: ReceiptSource,
  exports: KnittingExportSlip[],
  sizeNames: string[]
): DefectiveSourceQuantity => {
  const result = { bundles: 0, sizes: Object.fromEntries(sizeNames.map(size => [size, 0])) };
  exports
    .filter(slip =>
      String(slip.sourceContractId) === String(source.contract.id) &&
      String(slip.sourceReceiptId) === String(source.receipt.id)
    )
    .forEach(slip => {
      result.bundles += Number(slip.defectiveBundles) || 0;
      if (slip.defectiveSizeQuantities) {
        const sizes = normalizeSizeCounts(slip.defectiveSizeQuantities, sizeNames);
        sizeNames.forEach(size => { result.sizes[size] += sizes[size]; });
      } else if (Number(slip.defectivePieces) > 0) {
        const eachSize = Number(slip.defectivePieces) / sizeNames.length;
        sizeNames.forEach(size => { result.sizes[size] += eachSize; });
      } else if (!slip.goodSizeQuantities) {
        result.bundles += Math.max(
          0,
          (Number(slip.defectiveContractQuantity) || 0) - (Number(slip.defectiveBundles) || 0)
        );
      }
    });
  return result;
};

const makeDetailLine = (kind: string, quantity = ''): DetailLine => ({
  id: `defective-line-${crypto.randomUUID()}`,
  kind,
  quantity
});

const getImportSummary = (
  bundleQuantity: number,
  sizeQuantities: Record<string, number>,
  sizeNames: string[],
  isSetProduct: boolean
) => {
  const completedSets = isSetProduct && sizeNames.length
    ? Math.min(...sizeNames.map(size => Number(sizeQuantities[size]) || 0))
    : 0;
  const looseSizes = sizeNames
    .map((size, index) => ({
      size: sizeNames.length > 1 ? `Size ${index + 1}` : 'Cái',
      quantity: Math.max(0, (Number(sizeQuantities[size]) || 0) - completedSets)
    }))
    .filter(item => item.quantity > 0);
  return [
    ...(bundleQuantity + completedSets > 0 ? [`${(bundleQuantity + completedSets).toLocaleString('vi-VN')} Bộ`] : []),
    ...looseSizes.map(item => `${item.quantity.toLocaleString('vi-VN')} cái${item.size === 'Cái' ? '' : ` (${item.size})`}`)
  ].join(' + ') || '0';
};

const formatNumber = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const formatDate = (value: string) => value
  ? new Date(`${value}T00:00:00`).toLocaleDateString('vi-VN')
  : '—';

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box' as const,
  padding: '9px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  backgroundColor: '#fff',
  color: '#1e293b'
};

export default function DefectiveGoodsImportManager() {
  const { formDraftProps, clearDraft, isSubmitting } = usePersistentFormDraft('defective-goods-import-slip');
  const {
    contracts,
    knittingExportSlips,
    defectiveGoodsImportSlips,
    addDefectiveGoodsImportSlip,
    updateDefectiveGoodsImportSlip,
    deleteDefectiveGoodsImportSlip
  } = useApp();
  const [selectedSourceKey, setSelectedSourceKey] = useState('');
  const [date, setDate] = useState(getToday());
  const [companyBContractNo, setCompanyBContractNo] = useState('');
  const [companyBContractId, setCompanyBContractId] = useState('');
  const [detailLines, setDetailLines] = useState<DetailLine[]>([]);
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [printSlip, setPrintSlip] = useState<DefectiveGoodsImportSlip | null>(null);
  const printAreaRef = useRef<HTMLDivElement>(null);

  const receiptSources = useMemo<ReceiptSource[]>(() => contracts
    .filter(contract => contract.contractType === 'SUB')
    .flatMap(contract => (Array.isArray(contract.receivedGoodsLogs) ? contract.receivedGoodsLogs : [])
      .filter(receipt => Number(receipt.quantity) > 0)
      .map(receipt => ({
        contract,
        receipt,
        key: `${contract.id}::${receipt.id}`
      })))
    .sort((first, second) => second.receipt.receivedDate.localeCompare(first.receipt.receivedDate)), [contracts]);

  const selectedSource = receiptSources.find(source => source.key === selectedSourceKey);
  const selectedContract = selectedSource?.contract;
  const piecesPerSet = selectedContract ? getPiecesPerSet(selectedContract.productCode) : 1;
  const isSetProduct = piecesPerSet > 1;
  const sizeNames = selectedContract ? getSizeNames(selectedContract) : [];
  const parentContract = selectedContract
    ? contracts.find(contract =>
      contract.contractType !== 'SUB' &&
      String(contract.contractNo || '').trim() === String(selectedContract.parentContractNo || '').trim() &&
      String(contract.productCode || '').trim().toLowerCase() === String(selectedContract.productCode || '').trim().toLowerCase()
    )
    : undefined;

  const companyBContracts = selectedContract
    ? contracts
      .filter(contract =>
        contract.contractType !== 'SUB' &&
        String(contract.productCode || '').trim().toLowerCase() === selectedContract.productCode.trim().toLowerCase()
      )
      .map(contract => {
        const accepted = knittingExportSlips
          .filter(slip =>
            (slip.companyBContractId !== undefined
              ? String(slip.companyBContractId) === String(contract.id)
              : slip.companyBContractNo === contract.contractNo) &&
            slip.productCode.trim().toLowerCase() === selectedContract.productCode.trim().toLowerCase()
          )
          .reduce((sum, slip) => sum + (Number(slip.goodContractQuantity) || 0), 0);
        return { contract, remaining: Math.max(0, (Number(contract.quantity) || 0) - accepted) };
      })
      .sort((first, second) => first.remaining - second.remaining)
    : [];

  const getAvailableQuantity = (
    source: ReceiptSource,
    targetSizeNames: string[],
    excludingId?: number | string
  ): DefectiveSourceQuantity => {
    const sourceQuantity = getDefectiveSourceQuantity(source, knittingExportSlips, targetSizeNames);
    const alreadyImported = defectiveGoodsImportSlips.filter(slip =>
      String(slip.id) !== String(excludingId ?? '') &&
      String(slip.sourceContractId) === String(source.contract.id) &&
      String(slip.sourceReceiptId) === String(source.receipt.id)
    );
    const importedBundles = alreadyImported.reduce((sum, slip) => sum + (Number(slip.bundleQuantity) || 0), 0);
    const importedSizes = alreadyImported.reduce<Record<string, number>>((totals, slip) => {
      const sizes = normalizeSizeCounts(slip.sizeQuantities, targetSizeNames);
      targetSizeNames.forEach(size => { totals[size] = (totals[size] || 0) + sizes[size]; });
      return totals;
    }, Object.fromEntries(targetSizeNames.map(size => [size, 0])));
    return {
      bundles: Math.max(0, sourceQuantity.bundles - importedBundles),
      sizes: Object.fromEntries(targetSizeNames.map(size => [
        size,
        Math.max(0, sourceQuantity.sizes[size] - importedSizes[size])
      ]))
    };
  };

  const resetForm = () => {
    clearDraft();
    setSelectedSourceKey('');
    setDate(getToday());
    setCompanyBContractNo('');
    setCompanyBContractId('');
    setDetailLines([]);
    setNote('');
    setEditingId(null);
    setError('');
  };

  const createSuggestedLines = (source: ReceiptSource, excludingId?: number | string) => {
    const sourceSizes = getSizeNames(source.contract);
    const available = getAvailableQuantity(source, sourceSizes, excludingId);
    return [
      ...(getPiecesPerSet(source.contract.productCode) > 1
        ? [makeDetailLine('bundle', available.bundles ? String(available.bundles) : '')]
        : []),
      ...sourceSizes.map(size => makeDetailLine(size, available.sizes[size] ? String(available.sizes[size]) : ''))
    ];
  };

  const handleSourceChange = (key: string) => {
    setSelectedSourceKey(key);
    setError('');
    const source = receiptSources.find(item => item.key === key);
    if (!source) {
      setCompanyBContractId('');
      setCompanyBContractNo('');
      setDetailLines([]);
      return;
    }
    const matchingContracts = contracts
      .filter(contract =>
        contract.contractType !== 'SUB' &&
        String(contract.productCode || '').trim().toLowerCase() === source.contract.productCode.trim().toLowerCase()
      )
      .map(contract => {
        const accepted = knittingExportSlips
          .filter(slip =>
            (slip.companyBContractId !== undefined
              ? String(slip.companyBContractId) === String(contract.id)
              : slip.companyBContractNo === contract.contractNo) &&
            slip.productCode.trim().toLowerCase() === source.contract.productCode.trim().toLowerCase()
          )
          .reduce((sum, slip) => sum + (Number(slip.goodContractQuantity) || 0), 0);
        return { contract, remaining: Math.max(0, (Number(contract.quantity) || 0) - accepted) };
      })
      .sort((first, second) => first.remaining - second.remaining);
    const suggestedContract = matchingContracts[0]?.contract;
    setCompanyBContractId(suggestedContract ? String(suggestedContract.id) : '');
    setCompanyBContractNo(suggestedContract?.contractNo || source.contract.parentContractNo || '');
    setDetailLines(createSuggestedLines(source));
  };

  const startEdit = (slip: DefectiveGoodsImportSlip) => {
    const source = receiptSources.find(item =>
      String(item.contract.id) === String(slip.sourceContractId) &&
      String(item.receipt.id) === String(slip.sourceReceiptId)
    );
    if (!source) {
      setActionError(`Không thể sửa ${slip.slipNo}: không tìm thấy phiếu nhận hàng nguồn.`);
      return;
    }
    const editSizes = getSizeNames(source.contract);
    const savedSizes = normalizeSizeCounts(slip.sizeQuantities, editSizes);
    setSelectedSourceKey(source.key);
    setDate(slip.date);
    setCompanyBContractNo(slip.companyBContractNo);
    setCompanyBContractId(slip.companyBContractId === undefined ? '' : String(slip.companyBContractId));
    setDetailLines([
      ...(getPiecesPerSet(source.contract.productCode) > 1
        ? [makeDetailLine('bundle', String(slip.bundleQuantity))]
        : []),
      ...editSizes.map(size => makeDetailLine(size, savedSizes[size] ? String(savedSizes[size]) : ''))
    ]);
    setNote(slip.note || '');
    setEditingId(slip.id);
    setError('');
    setActionError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSource || !selectedContract) {
      setError('Vui lòng chọn phiếu nhận hàng đan làm nguồn nhập.');
      return;
    }
    const quantities = detailLines.map(line => line.quantity.trim() ? Number(line.quantity) : 0);
    if (quantities.some(quantity => !Number.isFinite(quantity) || quantity < 0)) {
      setError('Số lượng nhập phải là số hợp lệ và không được âm.');
      return;
    }

    const bundleQuantity = detailLines.reduce((sum, line) =>
      line.kind === 'bundle' ? sum + (Number(line.quantity) || 0) : sum, 0);
    const sizeQuantities = Object.fromEntries(sizeNames.map(size => [
      size,
      detailLines.reduce((sum, line) =>
        line.kind === size ? sum + (Number(line.quantity) || 0) : sum, 0)
    ]));
    const loosePieceQuantity = Object.values(sizeQuantities).reduce((sum, quantity) => sum + quantity, 0);
    const physicalQuantity = bundleQuantity * piecesPerSet + loosePieceQuantity;
    if (physicalQuantity <= 0) {
      setError('Vui lòng nhập số bộ hoặc số lượng cái theo size lớn hơn 0.');
      return;
    }
    const available = getAvailableQuantity(selectedSource, sizeNames, editingId ?? undefined);
    const remainingPhysicalQuantity = available.bundles * piecesPerSet +
      Object.values(available.sizes).reduce((sum, quantity) => sum + quantity, 0);
    if (physicalQuantity > remainingPhysicalQuantity + Number.EPSILON) {
      setError(`Số lượng nhập (${formatNumber(physicalQuantity)} cái theo size) vượt số hàng loại còn lại từ nguồn (${formatNumber(remainingPhysicalQuantity)} cái).`);
      return;
    }

    const completeSets = isSetProduct && sizeNames.length
      ? Math.min(...sizeNames.map(size => sizeQuantities[size]))
      : 0;
    const quantity = isSetProduct
      ? bundleQuantity + completeSets
      : loosePieceQuantity;
    const id = editingId ?? `NHL-${crypto.randomUUID()}`;
    const existingSlip = editingId === null
      ? undefined
      : defectiveGoodsImportSlips.find(slip => String(slip.id) === String(editingId));
    const slip: DefectiveGoodsImportSlip = {
      id,
      slipNo: existingSlip?.slipNo || `NHL-${date.replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8)}`,
      date,
      sourceContractId: selectedContract.id,
      sourceContractNo: selectedContract.contractNo,
      sourceReceiptId: selectedSource.receipt.id,
      parentContractNo: selectedContract.parentContractNo || '',
      parentCompanyName: String(parentContract?.companyName || parentContract?.company || ''),
      companyBContractId: companyBContractId || undefined,
      companyBContractNo: companyBContractNo.trim(),
      productCode: selectedContract.productCode,
      productName: selectedContract.productName,
      unit: isSetProduct ? 'Bộ' : 'Cái',
      bundleQuantity,
      sizeQuantities,
      piecesPerSet,
      quantity,
      physicalQuantity,
      note: note.trim()
    };

    if (editingId !== null) updateDefectiveGoodsImportSlip(slip);
    else addDefectiveGoodsImportSlip(slip);
    resetForm();
  };

  const handleDelete = (slip: DefectiveGoodsImportSlip) => {
    if (!window.confirm(`Xóa phiếu ${slip.slipNo}?`)) return;
    deleteDefectiveGoodsImportSlip(slip.id);
    if (String(editingId) === String(slip.id)) resetForm();
    setActionError('');
  };

  const getSlipSizes = (slip: DefectiveGoodsImportSlip) => {
    const contract = contracts.find(item => String(item.id) === String(slip.sourceContractId));
    return contract
      ? getSizeNames(contract)
      : Array.from({ length: Number(slip.piecesPerSet) || 1 }, (_, index) =>
        (Number(slip.piecesPerSet) || 1) > 1 ? `Size ${index + 1}` : 'Cái');
  };

  const getSlipSummary = (slip: DefectiveGoodsImportSlip) => {
    const slipSizes = getSlipSizes(slip);
    return getImportSummary(
      Number(slip.bundleQuantity) || 0,
      normalizeSizeCounts(slip.sizeQuantities, slipSizes),
      slipSizes,
      slipSizes.length > 1
    );
  };

  const handleSendToZalo = async (slip: DefectiveGoodsImportSlip) => {
    setActionError('');
    const phone = String(
      contracts.find(contract =>
        slip.companyBContractId !== undefined
          ? String(contract.id) === String(slip.companyBContractId)
          : contract.contractType !== 'SUB' && contract.contractNo === slip.companyBContractNo
      )?.zalo || ''
    ).replace(/\D/g, '');
    const zaloWindow = window.open(phone ? `https://zalo.me/${phone}` : 'https://chat.zalo.me/', '_blank', 'noopener,noreferrer');
    try {
      setPrintSlip(slip);
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (!printAreaRef.current) throw new Error('Không tìm thấy nội dung phiếu để xuất ảnh.');
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(printAreaRef.current, {
        scale: Math.max(2, window.devicePixelRatio || 1),
        backgroundColor: '#ffffff',
        logging: false
      });
      const imageBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Trình duyệt không tạo được ảnh PNG.')), 'image/png');
      });
      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': imageBlob })]);
          window.alert('Đã mở Zalo và sao chép ảnh phiếu. Dán ảnh vào cuộc trò chuyện để gửi.');
          return;
        } catch (clipboardError) {
          console.error('Không thể sao chép ảnh phiếu vào clipboard:', clipboardError);
        }
      }
      const imageUrl = URL.createObjectURL(imageBlob);
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `${slip.slipNo.replace(/[^\w-]+/g, '_')}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1000);
      window.alert('Đã mở Zalo và tải ảnh phiếu xuống. Hãy đính kèm ảnh vừa tải để gửi.');
    } catch (shareError) {
      console.error('Không thể tạo ảnh phiếu nhập hàng loại:', shareError);
      setActionError(shareError instanceof Error ? shareError.message : 'Không thể tạo ảnh phiếu.');
      if (!zaloWindow) setActionError(previous => `${previous} Trình duyệt cũng đã chặn cửa sổ Zalo.`);
    }
  };

  const allSlips = defectiveGoodsImportSlips
    .slice()
    .sort((first, second) => second.date.localeCompare(first.date));
  const currentBundles = detailLines.reduce((sum, line) =>
    line.kind === 'bundle' ? sum + (Number(line.quantity) || 0) : sum, 0);
  const currentSizes = Object.fromEntries(sizeNames.map(size => [
    size,
    detailLines.reduce((sum, line) =>
      line.kind === size ? sum + (Number(line.quantity) || 0) : sum, 0)
  ]));
  const tableHeaderStyle = {
    padding: '9px 10px',
    backgroundColor: '#f1f5f9',
    color: '#475569',
    textAlign: 'left' as const,
    fontSize: '12px',
    whiteSpace: 'nowrap' as const
  };

  return (
    <section style={{ display: 'grid', gap: '18px' }}>
      <header>
        <h2 style={{ margin: '0 0 5px', color: '#0f172a', fontSize: '21px' }}>📥 Nhập Hàng Loại</h2>
        <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
          Nhập lại hàng loại từ phiếu xuất hàng đan; số lượng gợi ý được lấy theo phiếu nguồn và không làm thay đổi đối chiếu Công ty B - A.
        </p>
      </header>

      <form {...formDraftProps} onSubmit={handleSubmit} style={{ display: 'grid', gap: '14px', padding: '16px', border: '1px solid #fecaca', borderRadius: '10px', backgroundColor: '#fff7f7' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <h3 style={{ margin: 0, color: '#b91c1c', fontSize: '15px' }}>{editingId ? '✏️ Sửa Phiếu Nhập Hàng Loại' : '➕ Tạo Phiếu Nhập Hàng Loại'}</h3>
          <button type="button" className="slip-action-button slip-action-print" onClick={resetForm}>
            {editingId !== null ? 'Hủy sửa' : 'Làm mới'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>
            Phiếu nhận hàng đan nguồn
            <select required value={selectedSourceKey} onChange={event => handleSourceChange(event.target.value)} style={inputStyle}>
              <option value="">-- Chọn phiếu đã nhận từ Tổ Đan --</option>
              {receiptSources.map(source => (
                <option key={source.key} value={source.key}>
                  {source.contract.productCode} · {source.contract.craftGroupLeader || 'Tổ Đan'} · {source.contract.contractNo} · nhận {formatDate(source.receipt.receivedDate)} · {formatNumber(getReceiptQuantityInContractUnits(source.contract, source.receipt))} {getPiecesPerSet(source.contract.productCode) > 1 ? 'Bộ' : 'Cái'}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>
            Ngày nhập
            <input type="date" required value={date} onChange={event => setDate(event.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>
            Hợp đồng Công ty B cùng mã hàng
            <select
              value={companyBContractId}
              onChange={event => {
                const nextContract = companyBContracts.find(item => String(item.contract.id) === event.target.value)?.contract;
                setCompanyBContractId(event.target.value);
                if (nextContract) setCompanyBContractNo(nextContract.contractNo);
              }}
              style={inputStyle}
              disabled={!selectedContract || companyBContracts.length === 0}
            >
              <option value="">{companyBContracts.length ? '-- Chọn hợp đồng Công ty B --' : 'Chưa có hợp đồng cùng mã hàng'}</option>
              {companyBContracts.map(({ contract, remaining }) => (
                <option key={contract.id} value={String(contract.id)}>
                  {contract.contractNo} · {contract.companyName || contract.company || contract.partner || 'Đối tác'} · còn {formatNumber(remaining)} {isSetProduct ? 'Bộ' : 'Cái'}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>
            Số HĐ đối chiếu B - A
            <input required value={companyBContractNo} onChange={event => {
              const value = event.target.value;
              setCompanyBContractNo(value);
              const matching = companyBContracts.find(item => item.contract.contractNo === value);
              setCompanyBContractId(matching ? String(matching.contract.id) : '');
            }} placeholder="Tự điền theo hợp đồng đã chọn" style={inputStyle} />
          </label>
        </div>

        {selectedSource && selectedContract && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px', padding: '12px', borderRadius: '8px', backgroundColor: '#fff', border: '1px solid #fecaca', fontSize: '12px' }}>
              <div><strong>Mã hàng:</strong> {selectedContract.productCode}<br /><strong>Tên hàng:</strong> {selectedContract.productName}</div>
              <div><strong>Tổ Đan:</strong> {selectedContract.craftGroupLeader || '—'}<br /><strong>HĐ Tổ Đan:</strong> {selectedContract.contractNo}</div>
              <div><strong>Phiếu nhận:</strong> {formatDate(selectedSource.receipt.receivedDate)}<br /><strong>HĐ Công ty A:</strong> {parentContract?.contractNo || selectedContract.parentContractNo || '—'}</div>
              <div><strong>ĐVT:</strong> {isSetProduct ? 'Bộ + Cái theo size' : 'Cái'}<br /><strong>Hàng loại còn theo nguồn:</strong> {formatNumber(
                getAvailableQuantity(selectedSource, sizeNames, editingId ?? undefined).bundles * piecesPerSet +
                Object.values(getAvailableQuantity(selectedSource, sizeNames, editingId ?? undefined).sizes).reduce((sum, quantity) => sum + quantity, 0)
              )} cái</div>
            </div>

            <div style={{ display: 'grid', gap: '9px', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <strong style={{ color: '#334155', fontSize: '13px' }}>Chi tiết số lượng nhập (đã gợi ý theo hàng loại từ phiếu nguồn)</strong>
                <button type="button" className="slip-action-button slip-action-zalo" onClick={() => setDetailLines(lines => [
                  ...lines,
                  makeDetailLine(isSetProduct ? sizeNames[0] : 'Cái')
                ])}>＋ Thêm dòng</button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: '420px', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={tableHeaderStyle}>Quy cách</th>
                    <th style={tableHeaderStyle}>Số lượng</th>
                    <th style={{ ...tableHeaderStyle, textAlign: 'center' }}>Thao tác</th>
                  </tr></thead>
                  <tbody>
                    {detailLines.map(line => (
                      <tr key={line.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '7px 10px', minWidth: '160px' }}>
                          <select value={line.kind} onChange={event => setDetailLines(lines => lines.map(item =>
                            item.id === line.id ? { ...item, kind: event.target.value } : item
                          ))} style={inputStyle}>
                            {isSetProduct && <option value="bundle">Số bộ nguyên</option>}
                            {sizeNames.map((size, index) => (
                              <option key={size} value={size}>{sizeNames.length > 1 ? `Size ${index + 1}` : 'Cái'}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '7px 10px', minWidth: '140px' }}>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            aria-label={`Số lượng ${line.kind === 'bundle' ? 'bộ nguyên' : line.kind}`}
                            value={line.quantity}
                            onChange={event => setDetailLines(lines => lines.map(item =>
                              item.id === line.id ? { ...item, quantity: event.target.value } : item
                            ))}
                            style={inputStyle}
                          />
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                          <button
                            type="button"
                            className="slip-action-button slip-action-delete"
                            aria-label="Xóa dòng quy cách"
                            onClick={() => setDetailLines(lines => lines.filter(item => item.id !== line.id))}
                          >🗑️ Xóa</button>
                        </td>
                      </tr>
                    ))}
                    {detailLines.length === 0 && <tr><td colSpan={3} style={{ padding: '12px', textAlign: 'center', color: '#64748b' }}>Chưa có dòng quy cách. Bấm “Thêm dòng” để nhập.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: '6px', backgroundColor: '#fff7ed', color: '#7c2d12', fontSize: '12px' }}>
                <strong>Quy cách phiếu này:</strong> {getImportSummary(currentBundles, currentSizes, sizeNames, isSetProduct)}
                <div style={{ marginTop: '4px' }}>
                  Tổng quy đổi: <strong>{formatNumber(isSetProduct
                    ? currentBundles + (sizeNames.length ? Math.min(...sizeNames.map(size => currentSizes[size] || 0)) : 0)
                    : Object.values(currentSizes).reduce((sum, quantity) => sum + quantity, 0))} {isSetProduct ? 'Bộ' : 'Cái'}</strong>
                  {' · '}Tổng thực nhập: <strong>{formatNumber(currentBundles * piecesPerSet + Object.values(currentSizes).reduce((sum, quantity) => sum + quantity, 0))} cái</strong>
                </div>
                {isSetProduct && <div style={{ marginTop: '4px' }}>Các size có số lượng bằng 0 sẽ không hiển thị trong phần quy cách tổng hợp.</div>}
              </div>
            </div>
          </>
        )}

        <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>
          Ghi chú
          <input value={note} onChange={event => setNote(event.target.value)} placeholder="Thông tin bổ sung về hàng nhập" style={inputStyle} />
        </label>
        {error && <div role="alert" style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{error}</div>}
        <button type="submit" disabled={isSubmitting} className="slip-action-button slip-action-edit" style={{ justifySelf: 'start', minHeight: '42px', padding: '10px 16px' }}>
          {isSubmitting ? '⏳ Đang lưu...' : `💾 ${editingId !== null ? 'Lưu sửa phiếu' : 'Lưu phiếu nhập hàng loại'}`}
        </button>
      </form>

      {actionError && <div role="alert" style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{actionError}</div>}
      <section style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#fff' }}>
        <h3 style={{ padding: '14px 16px', margin: 0, color: '#1e293b', fontSize: '15px' }}>Lịch Sử Phiếu Nhập Hàng Loại</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1050px', fontSize: '12px' }}>
          <thead><tr>
            {['Phiếu / Ngày', 'Mã hàng / Tên hàng', 'Tổ đan / Phiếu nguồn', 'HĐ Công ty A', 'HĐ đối chiếu B-A', 'Quy cách nhập', 'Số lượng quy đổi', 'Thao tác'].map(label => (
              <th key={label} style={tableHeaderStyle}>{label}</th>
            ))}
          </tr></thead>
          <tbody>
            {allSlips.map(slip => (
              <tr key={slip.id} style={{ borderTop: '1px solid #e2e8f0', verticalAlign: 'top' }}>
                <td style={{ padding: '10px', whiteSpace: 'nowrap' }}><strong>{slip.slipNo}</strong><br />{formatDate(slip.date)}</td>
                <td style={{ padding: '10px' }}><strong>{slip.productCode}</strong><br />{slip.productName}</td>
                <td style={{ padding: '10px' }}>{slip.sourceContractNo}<br /><small>{slip.sourceReceiptId}</small></td>
                <td style={{ padding: '10px' }}>{slip.parentContractNo || '—'}<br /><small>{slip.parentCompanyName || '—'}</small></td>
                <td style={{ padding: '10px' }}>{slip.companyBContractNo || '—'}</td>
                <td style={{ padding: '10px', color: '#b91c1c', fontWeight: 700 }}>{getSlipSummary(slip)}</td>
                <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>{formatNumber(slip.quantity)} {slip.unit}<br /><small>{formatNumber(slip.physicalQuantity)} cái thực nhập</small></td>
                <td style={{ padding: '10px' }}>
                  <div className="slip-action-buttons">
                    <button type="button" className="slip-action-button slip-action-edit" onClick={() => startEdit(slip)}>✏️ Sửa</button>
                    <button type="button" className="slip-action-button slip-action-delete" onClick={() => handleDelete(slip)}>🗑️ Xóa</button>
                    <button type="button" className="slip-action-button slip-action-print" onClick={() => setPrintSlip(slip)}>🖨️ In / Xuất PDF</button>
                    <button type="button" className="slip-action-button slip-action-zalo" onClick={() => void handleSendToZalo(slip)}>💬 Gửi Zalo</button>
                  </div>
                </td>
              </tr>
            ))}
            {allSlips.length === 0 && <tr><td colSpan={8} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>Chưa có phiếu nhập hàng loại.</td></tr>}
          </tbody>
        </table>
      </section>

      {printSlip && (
        <div role="dialog" aria-modal="true" aria-label="Phiếu nhập hàng loại" style={{ position: 'fixed', inset: 0, zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'rgba(15, 23, 42, .65)' }}>
          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              #defective-import-print-area, #defective-import-print-area * { visibility: visible !important; }
              #defective-import-print-area { position: absolute !important; inset: 0 !important; width: 100% !important; max-width: none !important; margin: 0 !important; padding: 12mm !important; border: 0 !important; box-shadow: none !important; }
              .defective-import-actions { display: none !important; }
              @page { size: A4 portrait; margin: 0; }
            }
          `}</style>
          <div style={{ width: 'min(850px, 96vw)', maxHeight: '94vh', display: 'flex', flexDirection: 'column', overflow: 'auto', borderRadius: '10px', backgroundColor: '#fff', boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>
            <div ref={printAreaRef} id="defective-import-print-area" style={{ padding: '36px', color: '#0f172a', backgroundColor: '#fff' }}>
              <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                <h2 style={{ margin: 0, fontSize: '20px' }}>PHIẾU NHẬP HÀNG LOẠI</h2>
                <div style={{ marginTop: '8px' }}>Số phiếu: <strong>{printSlip.slipNo}</strong> · Ngày {formatDate(printSlip.date)}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <div><strong>Tổ Đan:</strong> {printSlip.sourceContractNo}</div>
                <div><strong>Phiếu nhận nguồn:</strong> {printSlip.sourceReceiptId}</div>
                <div><strong>Hợp đồng Công ty A:</strong> {printSlip.parentContractNo || '—'} ({printSlip.parentCompanyName || '—'})</div>
                <div><strong>HĐ đối chiếu Công ty B - A:</strong> {printSlip.companyBContractNo || '—'}</div>
                <div><strong>Mã hàng:</strong> {printSlip.productCode}</div>
                <div><strong>Tên hàng:</strong> {printSlip.productName}</div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
                <thead><tr>{['Quy cách', 'Số lượng'].map(label => <th key={label} style={{ border: '1px solid #94a3b8', padding: '9px', textAlign: 'left' }}>{label}</th>)}</tr></thead>
                <tbody>
                  <tr><td style={{ border: '1px solid #94a3b8', padding: '9px' }}>{getSlipSummary(printSlip)}</td><td style={{ border: '1px solid #94a3b8', padding: '9px' }}>{formatNumber(printSlip.quantity)} {printSlip.unit} · {formatNumber(printSlip.physicalQuantity)} cái thực nhập</td></tr>
                </tbody>
              </table>
              <div style={{ minHeight: '48px' }}><strong>Ghi chú:</strong> {printSlip.note || '—'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '40px', textAlign: 'center' }}>
                <div><strong>BÊN GIAO</strong><div style={{ height: '70px' }} />Ký, ghi rõ họ tên</div>
                <div><strong>BÊN NHẬN</strong><div style={{ height: '70px' }} />Ký, ghi rõ họ tên</div>
              </div>
            </div>
            <div className="defective-import-actions slip-action-buttons" style={{ justifyContent: 'flex-end', padding: '12px', backgroundColor: '#f8fafc' }}>
              <button type="button" className="slip-action-button slip-action-print" onClick={() => window.print()}>🖨️ In / Lưu PDF</button>
              <button type="button" className="slip-action-button slip-action-zalo" onClick={() => void handleSendToZalo(printSlip)}>💬 Gửi Zalo</button>
              <button type="button" className="slip-action-button slip-action-delete" onClick={() => setPrintSlip(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
