import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { KnittingExportSlip, ContractItem, ReceivedGoodsLog } from '../context/AppContext';
import { useApp } from '../context/AppContext';
import { usePersistentFormDraft } from '../hooks/usePersistentFormDraft';
import { useAuth } from '../context/AuthContext';

interface ReceiptSource {
  contract: ContractItem;
  receipt: ReceivedGoodsLog;
  key: string;
}

const getToday = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const getPiecesPerSet = (productCode: string) => {
  const suffix = /\/(\d+)\s*$/.exec(productCode.trim())?.[1];
  const count = Number(suffix);
  return Number.isInteger(count) && count > 1 ? count : 1;
};

const getSizeLabel = (index: number) => `Size ${index + 1}`;

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

const getSizeNames = (contract: ContractItem) => {
  const piecesPerSet = getPiecesPerSet(contract.productCode);
  if (piecesPerSet === 1) return ['Cái'];
  return Array.from({ length: piecesPerSet }, (_, index) => getSizeLabel(index));
};

const getCanonicalSizeName = (rawKey: string, sizeNames: string[]) => {
  const trimmed = String(rawKey || '').trim();
  if (!trimmed || trimmed === 'Bộ') return undefined;
  if (sizeNames.includes(trimmed)) return trimmed;

  const directNumber = Number.parseInt(trimmed, 10);
  if (Number.isInteger(directNumber) && directNumber >= 1 && directNumber <= sizeNames.length) {
    return sizeNames[directNumber - 1];
  }

  const match = trimmed.match(/(\d+)$/)?.[1];
  if (match) {
    const numericIndex = Number.parseInt(match, 10);
    if (numericIndex === 0) return sizeNames[0];
    if (Number.isInteger(numericIndex) && numericIndex >= 1 && numericIndex <= sizeNames.length) {
      return sizeNames[numericIndex - 1];
    }
  }

  return undefined;
};

const getSizeDisplayLabel = (size: string, sizeNames: string[]) => {
  if (sizeNames.length === 1 && sizeNames[0] === 'Cái') return '';
  const componentIndex = sizeNames.indexOf(size);
  if (componentIndex >= 0) return getSizeLabel(componentIndex);
  const rawIndex = Number.parseInt(size.match(/(\d+)$/)?.[1] ?? '', 10);
  if (rawIndex === 0) return getSizeLabel(rawIndex);
  if (Number.isInteger(rawIndex) && rawIndex >= 1 && rawIndex <= sizeNames.length) {
    return getSizeLabel(rawIndex - 1);
  }
  return getSizeLabel(0);
};

const getSizeNameFromKey = (key: string, sizeNames: string[], indexBase: 0 | 1) => {
  if (/^\d+$/.test(key)) {
    const index = Number(key) - indexBase;
    if (index >= 0 && index < sizeNames.length) return sizeNames[index];
  }
  return getCanonicalSizeName(key, sizeNames) || key;
};

const normalizeSizeCounts = (counts: Record<string, number> | undefined, sizeNames: string[]) => {
  const entries = Object.entries(counts || {}).filter(([key]) => key !== 'Bộ');
  const normalized = Object.fromEntries(sizeNames.map(size => [size, 0]));
  const zeroBasedKeys = entries.some(([key]) => /(?:^|\D)0$/.test(key));

  entries.forEach(([key, count], index) => {
    const zeroBasedIndex = zeroBasedKeys ? Number.parseInt(key.match(/(\d+)$/)?.[1] ?? '', 10) : -1;
    const intendedSize = zeroBasedIndex >= 0 && zeroBasedIndex < sizeNames.length
      ? sizeNames[zeroBasedIndex]
      : getCanonicalSizeName(key, sizeNames) ?? sizeNames[Math.min(index, sizeNames.length - 1)] ?? sizeNames[0];
    normalized[intendedSize] = (normalized[intendedSize] || 0) + (Number(count) || 0);
  });

  return normalized;
};

const getCompleteSetsFromCounts = (sizeQuantities: Record<string, number>, sizeNames: string[]) =>
  sizeNames.length > 0
    ? Math.min(...sizeNames.map(size => Number(sizeQuantities[size]) || 0))
    : 0;

const getLooseSizeCounts = (
  addedCounts: Record<string, number>,
  previousCounts: Record<string, number>,
  sizeNames: string[]
) => {
  if (sizeNames.length < 2) {
    return { looseCounts: addedCounts, newlyCompletedSets: 0 };
  }
  const previousCompleteSets = getCompleteSetsFromCounts(previousCounts, sizeNames);
  const combinedCounts = Object.fromEntries(sizeNames.map(size => [
    size,
    (Number(previousCounts[size]) || 0) + (Number(addedCounts[size]) || 0)
  ]));
  const newlyCompletedSets = Math.max(
    0,
    getCompleteSetsFromCounts(combinedCounts, sizeNames) - previousCompleteSets
  );
  const previousLooseCounts = Object.fromEntries(sizeNames.map(size => [
    size,
    Math.max(0, (Number(previousCounts[size]) || 0) - previousCompleteSets)
  ]));

  const looseCounts = Object.fromEntries(sizeNames.map(size => {
    const added = Number(addedCounts[size]) || 0;
    const addedUsedForSets = Math.min(
      added,
      Math.max(0, newlyCompletedSets - previousLooseCounts[size])
    );
    return [size, Math.max(0, added - addedUsedForSets)];
  }));
  return { looseCounts, newlyCompletedSets };
};

const getPreviousSizeCounts = (
  slips: KnittingExportSlip[],
  sourceContractId: number | string,
  sizeNames: string[],
  kind: 'good' | 'defective',
  excludingId?: number | string
) => slips
  .filter(slip =>
    String(slip.id) !== String(excludingId ?? '') &&
    String(slip.sourceContractId) === String(sourceContractId)
  )
  .reduce<Record<string, number>>((totals, slip) => {
    const savedCounts = kind === 'good' ? slip.goodSizeQuantities : slip.defectiveSizeQuantities;
    if (!savedCounts) return totals;
    const normalizedCounts = normalizeSizeCounts(savedCounts, sizeNames);
    sizeNames.forEach(size => {
      totals[size] = (totals[size] || 0) + normalizedCounts[size];
    });
    return totals;
  }, Object.fromEntries(sizeNames.map(size => [size, 0])));

const getCarryForward = (
  slips: KnittingExportSlip[],
  sourceContractId: number | string,
  sizeNames: string[],
  kind: 'good' | 'defective',
  excludingId?: number | string
) => {
  const counts = getPreviousSizeCounts(slips, sourceContractId, sizeNames, kind, excludingId);
  const completedSets = getCompleteSetsFromCounts(counts, sizeNames);
  return Object.fromEntries(sizeNames.map(size => [size, (counts[size] || 0) - completedSets]));
};

const getExportedPhysicalPieces = (
  source: ReceiptSource,
  slips: KnittingExportSlip[],
  piecesPerSet: number,
  excludingId?: number | string
) => slips
  .filter(slip =>
    String(slip.id) !== String(excludingId ?? '') &&
    String(slip.sourceContractId) === String(source.contract.id) &&
    String(slip.sourceReceiptId) === String(source.receipt.id)
  )
  .reduce((sum, slip) => {
    const sizePieceCount = Object.values(slip.goodSizeQuantities || {})
      .reduce((total, count) => total + (Number(count) || 0), 0) +
      Object.values(slip.defectiveSizeQuantities || {})
        .reduce((total, count) => total + (Number(count) || 0), 0);
    const legacyPieceCount = !slip.goodSizeQuantities && !slip.defectiveSizeQuantities
      ? ((Number(slip.goodContractQuantity) || 0) + (Number(slip.defectiveContractQuantity) || 0)) * piecesPerSet
      : 0;
    return sum +
      ((Number(slip.goodBundles) || 0) + (Number(slip.defectiveBundles) || 0)) * piecesPerSet +
      sizePieceCount +
      legacyPieceCount;
  }, 0);

const readAttachments = async (files: File[]) => Promise.all(files.map(file => new Promise<NonNullable<KnittingExportSlip['attachments']>[number]>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result !== 'string') {
      reject(new Error(`Không đọc được file ${file.name}.`));
      return;
    }
    resolve({
      id: crypto.randomUUID(),
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      dataUrl: reader.result
    });
  };
  reader.onerror = () => reject(new Error(`Không đọc được file ${file.name}.`));
  reader.readAsDataURL(file);
})));

const getProductName = (contract: ContractItem) => {
  const summary = String(contract.summaryText || '');
  const productName = String(contract.productName || '');
  return summary && productName.endsWith(` (${summary})`)
    ? productName.slice(0, -(summary.length + 3))
    : productName;
};

const formatNumber = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const formatDate = (value: string) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('vi-VN') : '—';

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box' as const,
  padding: '9px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  backgroundColor: '#fff',
  color: '#1e293b'
};

export default function KnittingExportManager() {
  const { formDraftProps, clearDraft, isSubmitting } = usePersistentFormDraft('knitting-export-slip');
  const { hasPermission } = useAuth();
  const {
    contracts,
    knittingExportSlips,
    addKnittingExportSlip,
    updateKnittingExportSlip,
    deleteKnittingExportSlip
  } = useApp();
  const [selectedSourceKey, setSelectedSourceKey] = useState('');
  const [date, setDate] = useState(getToday());
  const [companyBContractNo, setCompanyBContractNo] = useState('');
  const [companyBContractId, setCompanyBContractId] = useState('');
  const [goodBundles, setGoodBundles] = useState('');
  const [goodSizeQuantities, setGoodSizeQuantities] = useState<Record<string, string>>({});
  const [defectiveBundles, setDefectiveBundles] = useState('');
  const [defectiveSizeQuantities, setDefectiveSizeQuantities] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [attachments, setAttachments] = useState<NonNullable<KnittingExportSlip['attachments']>>([]);
  const [attachmentSlip, setAttachmentSlip] = useState<KnittingExportSlip | null>(null);
  const [showQuantities, setShowQuantities] = useState(false);
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [error, setError] = useState('');
  const [printSlip, setPrintSlip] = useState<KnittingExportSlip | null>(null);
  const [actionError, setActionError] = useState('');
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
  const parentContract = selectedContract
    ? contracts.find(contract =>
      contract.contractType !== 'SUB' &&
      String(contract.contractNo || '').trim() === String(selectedContract.parentContractNo || '').trim() &&
      String(contract.productCode || '').trim().toLowerCase() === String(selectedContract.productCode || '').trim().toLowerCase()
    )
    : undefined;
  const sizeNames = selectedContract ? getSizeNames(selectedContract) : [];
  const goodCarryForward = selectedContract
    ? getCarryForward(knittingExportSlips, selectedContract.id, sizeNames, 'good', editingId ?? undefined)
    : {};
  const defectiveCarryForward = selectedContract
    ? getCarryForward(knittingExportSlips, selectedContract.id, sizeNames, 'defective', editingId ?? undefined)
    : {};
  const goodPreviousSizeTotals = selectedContract
    ? getPreviousSizeCounts(knittingExportSlips, selectedContract.id, sizeNames, 'good', editingId ?? undefined)
    : {};
  const defectivePreviousSizeTotals = selectedContract
    ? getPreviousSizeCounts(knittingExportSlips, selectedContract.id, sizeNames, 'defective', editingId ?? undefined)
    : {};
  const getAcceptedQuantityForCompanyContract = (companyContractId: number | string, contractNo: string, productCode: string) => {
    const linkedSlips = knittingExportSlips.filter(slip =>
      (slip.companyBContractId !== undefined
        ? String(slip.companyBContractId) === String(companyContractId)
        : slip.companyBContractNo === contractNo) &&
      slip.productCode.trim().toLowerCase() === productCode.trim().toLowerCase()
    );
    return Array.from(new Set(linkedSlips.map(slip => String(slip.sourceContractId))))
      .reduce((total, sourceContractId) => {
        const sourceContract = contracts.find(contract => String(contract.id) === sourceContractId);
        const sourceSizeNames = sourceContract ? getSizeNames(sourceContract) : [];
        const sourceSlips = linkedSlips.filter(slip => String(slip.sourceContractId) === sourceContractId);
        const bundles = sourceSlips.reduce((sum, slip) => sum + (Number(slip.goodBundles) || 0), 0);
        const sizeTotals = getPreviousSizeCounts(linkedSlips, sourceContractId, sourceSizeNames, 'good');
        const legacyQuantity = sourceSlips
          .filter(slip => !slip.goodSizeQuantities)
          .reduce((sum, slip) => sum + (Number(slip.goodContractQuantity) || 0), 0);
        return total + bundles + getCompleteSetsFromCounts(sizeTotals, sourceSizeNames) + legacyQuantity;
      }, 0);
  };
  const companyBContracts = (() => {
    if (!selectedContract) return [];
    return contracts
      .filter(contract =>
        contract.contractType !== 'SUB' &&
        String(contract.productCode || '').trim().toLowerCase() === selectedContract.productCode.trim().toLowerCase()
      )
      .map(contract => {
        const exportedGood = getAcceptedQuantityForCompanyContract(
          contract.id,
          contract.contractNo,
          selectedContract.productCode
        );
        const remaining = Math.max(0, (Number(contract.quantity) || 0) - exportedGood);
        return { contract, remaining };
      })
      .sort((first, second) => first.remaining - second.remaining);
  })();

  const acceptedByParent = (contractNo: string, productCode: string, excludingId?: number | string) =>
    Array.from(new Set(knittingExportSlips
      .filter(slip =>
        String(slip.id) !== String(excludingId ?? '') &&
        slip.parentContractNo === contractNo &&
        slip.productCode.trim().toLowerCase() === productCode.trim().toLowerCase()
      )
      .map(slip => String(slip.sourceContractId))))
      .reduce((total, sourceContractId) => {
        const sourceContract = contracts.find(contract => String(contract.id) === sourceContractId);
        const sourceSlips = knittingExportSlips.filter(slip =>
          String(slip.id) !== String(excludingId ?? '') &&
          String(slip.sourceContractId) === sourceContractId
        );
        const sourceSizeNames = sourceContract ? getSizeNames(sourceContract) : [];
        const bundles = sourceSlips.reduce((sum, slip) => sum + (Number(slip.goodBundles) || 0), 0);
        const sizeTotals = getPreviousSizeCounts(sourceSlips, sourceContractId, sourceSizeNames, 'good');
        const legacyQuantity = sourceSlips
          .filter(slip => !slip.goodSizeQuantities)
          .reduce((sum, slip) => sum + (Number(slip.goodContractQuantity) || 0), 0);
        return total + bundles + getCompleteSetsFromCounts(sizeTotals, sourceSizeNames) + legacyQuantity;
      }, 0);

  const resetForm = () => {
    clearDraft();
    setSelectedSourceKey('');
    setDate(getToday());
    setCompanyBContractNo('');
    setCompanyBContractId('');
    setGoodBundles('');
    setGoodSizeQuantities({});
    setDefectiveBundles('');
    setDefectiveSizeQuantities({});
    setNote('');
    setAttachments([]);
    setShowQuantities(false);
    setEditingId(null);
    setError('');
  };

  const handleSourceChange = (key: string) => {
    setSelectedSourceKey(key);
    setError('');
    const source = receiptSources.find(item => item.key === key);
    if (!source) {
      setCompanyBContractId('');
      setCompanyBContractNo('');
      setGoodBundles('');
      setGoodSizeQuantities({});
      setDefectiveBundles('');
      setDefectiveSizeQuantities({});
      return;
    }

    const matchingContracts = contracts
      .filter(contract =>
        contract.contractType !== 'SUB' &&
        String(contract.productCode || '').trim().toLowerCase() === source.contract.productCode.trim().toLowerCase()
      )
      .map(contract => {
        const exportedGood = knittingExportSlips
          .filter(slip =>
            (slip.companyBContractId !== undefined
              ? String(slip.companyBContractId) === String(contract.id)
              : slip.companyBContractNo === contract.contractNo) &&
            slip.productCode.trim().toLowerCase() === source.contract.productCode.trim().toLowerCase()
          )
          .reduce((sum, slip) => sum + slip.goodContractQuantity, 0);
        return { contract, remaining: Math.max(0, (Number(contract.quantity) || 0) - exportedGood) };
      })
      .sort((first, second) => first.remaining - second.remaining);
    const suggested = matchingContracts[0]?.contract;
    setCompanyBContractId(suggested ? String(suggested.id) : '');
    setCompanyBContractNo(suggested?.contractNo || source.contract.parentContractNo || '');
    setGoodBundles('');
    setGoodSizeQuantities(Object.fromEntries(getSizeNames(source.contract).map(size => [size, ''])));
    setDefectiveBundles('');
    setDefectiveSizeQuantities(Object.fromEntries(getSizeNames(source.contract).map(size => [size, ''])));
  };

  const startEdit = (slipId: number | string) => {
    const slip = knittingExportSlips.find(item => String(item.id) === String(slipId));
    if (!slip) {
      setActionError('Không tìm thấy phiếu xuất hàng đan cần sửa. Vui lòng tải lại lịch sử và thử lại.');
      return;
    }
    const source = receiptSources.find(item =>
      String(item.contract.id) === String(slip.sourceContractId) &&
      String(item.receipt.id) === slip.sourceReceiptId
    );
    if (!source) {
      setActionError(`Không thể sửa ${slip.slipNo}: không tìm thấy phiếu nhận hàng nguồn.`);
      return;
    }
    const editSizeNames = getSizeNames(source.contract);
    const savedGoodSizes = normalizeSizeCounts(slip.goodSizeQuantities, editSizeNames);
    const savedDefectiveSizes = normalizeSizeCounts(slip.defectiveSizeQuantities, editSizeNames);
    setSelectedSourceKey(source.key);
    setDate(slip.date);
    setCompanyBContractNo(slip.companyBContractNo);
    setCompanyBContractId(slip.companyBContractId === undefined ? '' : String(slip.companyBContractId));
    setGoodBundles(String(slip.goodBundles));
    setGoodSizeQuantities(Object.fromEntries(
      editSizeNames.map(size => [
        size,
        String(slip.goodSizeQuantities ? savedGoodSizes[size] : slip.goodPieces / editSizeNames.length)
      ])
    ));
    setDefectiveBundles(String(slip.defectiveBundles));
    setDefectiveSizeQuantities(Object.fromEntries(
      editSizeNames.map(size => [
        size,
        String(slip.defectiveSizeQuantities ? savedDefectiveSizes[size] : slip.defectivePieces / editSizeNames.length)
      ])
    ));
    setNote(slip.note);
    setAttachments(slip.attachments || []);
    setShowQuantities(true);
    setEditingId(slip.id);
    setError('');
    setActionError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSource || !selectedContract) {
      setError('Vui lòng chọn đúng phiếu nhận hàng đan làm nguồn xuất.');
      return;
    }
    const allSizeValues = [...Object.values(goodSizeQuantities), ...Object.values(defectiveSizeQuantities)];
    const values = [goodBundles, defectiveBundles, ...allSizeValues].map(value => value.trim() ? Number(value) : 0);
    if (values.some(value => !Number.isFinite(value) || value < 0)) {
      setError('Số lượng Đạt/Loại phải là số hợp lệ, không được âm.');
      return;
    }
    const goodBundleCount = Number(goodBundles) || 0;
    const defectiveBundleCount = Number(defectiveBundles) || 0;
    const goodSizeCounts = Object.fromEntries(sizeNames.map(size => [size, Number(goodSizeQuantities[size]) || 0]));
    const defectiveSizeCounts = Object.fromEntries(sizeNames.map(size => [size, Number(defectiveSizeQuantities[size]) || 0]));
    const goodPieceCount = Object.values(goodSizeCounts).reduce((sum, count) => sum + count, 0);
    const defectivePieceCount = Object.values(defectiveSizeCounts).reduce((sum, count) => sum + count, 0);
    const previousGoodSizeTotals = selectedContract
      ? getPreviousSizeCounts(knittingExportSlips, selectedContract.id, sizeNames, 'good', editingId ?? undefined)
      : {};
    const previousDefectiveSizeTotals = selectedContract
      ? getPreviousSizeCounts(knittingExportSlips, selectedContract.id, sizeNames, 'defective', editingId ?? undefined)
      : {};
    const priorGoodCompleteSets = getCompleteSetsFromCounts(previousGoodSizeTotals, sizeNames);
    const priorDefectiveCompleteSets = getCompleteSetsFromCounts(previousDefectiveSizeTotals, sizeNames);
    const goodContractQuantity = isSetProduct
      ? goodBundleCount + getCompleteSetsFromCounts(
        Object.fromEntries(sizeNames.map(size => [size, (previousGoodSizeTotals[size] || 0) + goodSizeCounts[size]])),
        sizeNames
      ) - priorGoodCompleteSets
      : goodPieceCount;
    const defectiveContractQuantity = isSetProduct
      ? defectiveBundleCount + getCompleteSetsFromCounts(
        Object.fromEntries(sizeNames.map(size => [size, (previousDefectiveSizeTotals[size] || 0) + defectiveSizeCounts[size]])),
        sizeNames
      ) - priorDefectiveCompleteSets
      : defectivePieceCount;
    if (goodContractQuantity + defectiveContractQuantity <= 0) {
      setError('Nhập số lượng Hàng Đạt hoặc Hàng Loại lớn hơn 0.');
      return;
    }
    const setSizeCount = isSetProduct ? piecesPerSet : 1;
    const availablePieces = getReceiptQuantityInContractUnits(selectedSource.contract, selectedSource.receipt) * setSizeCount;
    const alreadyExportedPieces = getExportedPhysicalPieces(
      selectedSource,
      knittingExportSlips,
      setSizeCount,
      editingId ?? undefined
    );
    const currentPhysicalPieces = (goodBundleCount + defectiveBundleCount) * setSizeCount + goodPieceCount + defectivePieceCount;
    const remainingPieces = Math.max(0, availablePieces - alreadyExportedPieces);
    if (currentPhysicalPieces > remainingPieces + Number.EPSILON) {
      setError(`Số lượng thực xuất (${formatNumber(currentPhysicalPieces)} cái theo size) vượt tồn khả dụng của phiếu nhận (${formatNumber(remainingPieces)} cái).`);
      return;
    }

    const newSlipId = `XHD-${crypto.randomUUID()}`;
    const slip: KnittingExportSlip = {
      id: editingId ?? newSlipId,
      slipNo: editingId
        ? knittingExportSlips.find(item => String(item.id) === String(editingId))?.slipNo || newSlipId
        : `XHD-${date.replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8)}`,
      date,
      sourceContractId: selectedContract.id,
      sourceContractNo: selectedContract.contractNo,
      sourceReceiptId: selectedSource.receipt.id,
      parentContractNo: selectedContract.parentContractNo || '',
      parentCompanyName: String(parentContract?.companyName || parentContract?.company || ''),
      companyBContractId: companyBContractId || undefined,
      companyBContractNo: companyBContractNo.trim(),
      productCode: selectedContract.productCode,
      productName: getProductName(selectedContract),
      unit: isSetProduct ? 'Bộ' : 'Cái',
      goodBundles: isSetProduct ? goodBundleCount : 0,
      goodPieces: goodPieceCount,
      goodSizeQuantities: goodSizeCounts,
      defectiveBundles: isSetProduct ? defectiveBundleCount : 0,
      defectivePieces: defectivePieceCount,
      defectiveSizeQuantities: defectiveSizeCounts,
      piecesPerSet,
      goodContractQuantity,
      defectiveContractQuantity,
      note: note.trim(),
      attachments
    };

    if (editingId !== null) updateKnittingExportSlip(slip);
    else addKnittingExportSlip(slip);
    resetForm();
  };

  const handleAttachmentChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    if (selectedFiles.length === 0) return;
    const unsupported = selectedFiles.find(file =>
      !file.type.startsWith('image/') && file.type !== 'application/pdf'
    );
    if (unsupported) {
      setError(`Định dạng ${unsupported.name} chưa được hỗ trợ. Chỉ nhận ảnh hoặc PDF.`);
      return;
    }
    const oversized = selectedFiles.find(file => file.size > 2 * 1024 * 1024);
    if (oversized) {
      setError(`File ${oversized.name} vượt quá 2 MB. Vui lòng chọn file nhỏ hơn để lưu cùng phiếu.`);
      return;
    }

    try {
      const newAttachments = await readAttachments(selectedFiles);
      setAttachments(current => [...current, ...newAttachments]);
      setError('');
    } catch (attachmentError) {
      console.error('Không thể đọc chứng từ đính kèm:', attachmentError);
      setError(attachmentError instanceof Error ? attachmentError.message : 'Không thể đọc chứng từ đính kèm.');
    }
  };

  const handleSlipAttachmentChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    if (!attachmentSlip || selectedFiles.length === 0) return;
    const unsupported = selectedFiles.find(file =>
      !file.type.startsWith('image/') && file.type !== 'application/pdf'
    );
    if (unsupported) {
      setActionError(`Định dạng ${unsupported.name} chưa được hỗ trợ. Chỉ nhận ảnh hoặc PDF.`);
      return;
    }
    const oversized = selectedFiles.find(file => file.size > 2 * 1024 * 1024);
    if (oversized) {
      setActionError(`File ${oversized.name} vượt quá 2 MB. Vui lòng chọn file nhỏ hơn.`);
      return;
    }
    try {
      const newAttachments = await readAttachments(selectedFiles);
      const updatedSlip = { ...attachmentSlip, attachments: [...(attachmentSlip.attachments || []), ...newAttachments] };
      updateKnittingExportSlip(updatedSlip);
      setAttachmentSlip(updatedSlip);
      setActionError('');
    } catch (attachmentError) {
      console.error('Không thể đọc chứng từ đính kèm:', attachmentError);
      setActionError(attachmentError instanceof Error ? attachmentError.message : 'Không thể đọc chứng từ đính kèm.');
    }
  };

  const removeSlipAttachment = (attachmentId: string) => {
    if (!attachmentSlip) return;
    const updatedSlip = {
      ...attachmentSlip,
      attachments: (attachmentSlip.attachments || []).filter(attachment => attachment.id !== attachmentId)
    };
    updateKnittingExportSlip(updatedSlip);
    setAttachmentSlip(updatedSlip);
  };

  const handleDelete = (slip: KnittingExportSlip) => {
    if (!window.confirm(`Xóa phiếu ${slip.slipNo}?`)) return;
    deleteKnittingExportSlip(slip.id);
    if (String(editingId) === String(slip.id)) resetForm();
    setActionError('');
  };

  const handleSendToZalo = async (slip: KnittingExportSlip) => {
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
      console.error('Không thể tạo ảnh phiếu xuất hàng đan:', shareError);
      setActionError(shareError instanceof Error ? shareError.message : 'Không thể tạo ảnh phiếu.');
      if (!zaloWindow) setActionError(previous => `${previous} Trình duyệt cũng đã chặn cửa sổ Zalo.`);
    }
  };

  const allSlips = knittingExportSlips.slice().sort((first, second) => second.date.localeCompare(first.date));
  const issuedQuantity = selectedSource
    ? getReceiptQuantityInContractUnits(selectedSource.contract, selectedSource.receipt)
    : 0;
  const currentGoodQuantity = isSetProduct
    ? (Number(goodBundles) || 0) +
      getCompleteSetsFromCounts(Object.fromEntries(sizeNames.map(size => [
        size,
        (goodPreviousSizeTotals[size] || 0) + (Number(goodSizeQuantities[size]) || 0)
      ])), sizeNames) -
      getCompleteSetsFromCounts(goodPreviousSizeTotals, sizeNames)
    : Object.values(goodSizeQuantities).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const currentDefectiveQuantity = isSetProduct
    ? (Number(defectiveBundles) || 0) +
      getCompleteSetsFromCounts(Object.fromEntries(sizeNames.map(size => [
        size,
        (defectivePreviousSizeTotals[size] || 0) + (Number(defectiveSizeQuantities[size]) || 0)
      ])), sizeNames) -
      getCompleteSetsFromCounts(defectivePreviousSizeTotals, sizeNames)
    : Object.values(defectiveSizeQuantities).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const totalGoodForParent = selectedContract
    ? acceptedByParent(selectedContract.parentContractNo || '', selectedContract.productCode, editingId ?? undefined) +
      currentGoodQuantity
    : 0;
  const progressQuantity = parentContract ? Number(parentContract.quantity) || 0 : 0;
  const progressPercent = progressQuantity > 0 ? Math.min(100, totalGoodForParent / progressQuantity * 100) : 0;
  const sourceAvailablePieces = selectedSource
    ? getReceiptQuantityInContractUnits(selectedSource.contract, selectedSource.receipt) * (isSetProduct ? piecesPerSet : 1)
    : 0;
  const sourceExportedPieces = selectedSource
    ? getExportedPhysicalPieces(selectedSource, knittingExportSlips, isSetProduct ? piecesPerSet : 1, editingId ?? undefined)
    : 0;
  const sizeReconciliationRows = sizeNames.map(size => ({
    size,
    goodCarry: goodCarryForward[size] || 0,
    goodTotal: (goodCarryForward[size] || 0) + (Number(goodSizeQuantities[size]) || 0),
    defectiveCarry: defectiveCarryForward[size] || 0,
    defectiveTotal: (defectiveCarryForward[size] || 0) + (Number(defectiveSizeQuantities[size]) || 0)
  }));
  const goodTargetSizeCount = sizeReconciliationRows.length
    ? Math.floor(Math.min(...sizeReconciliationRows.map(row => row.goodTotal))) + 1
    : 0;
  const defectiveTargetSizeCount = sizeReconciliationRows.length
    ? Math.floor(Math.min(...sizeReconciliationRows.map(row => row.defectiveTotal))) + 1
    : 0;
  const displayedStockAfterCurrent = Math.max(
    0,
    sourceAvailablePieces - sourceExportedPieces -
      ((Number(goodBundles) || 0) + (Number(defectiveBundles) || 0)) * (isSetProduct ? piecesPerSet : 1) -
      Object.values(goodSizeQuantities).reduce((sum, value) => sum + (Number(value) || 0), 0) -
      Object.values(defectiveSizeQuantities).reduce((sum, value) => sum + (Number(value) || 0), 0)
  );
  const getSizeBreakdown = (
    quantities: Record<string, number> | undefined,
    total: number,
    sizeNames: string[]
  ) => {
    const entries = Object.entries(quantities || {}).filter(([, quantity]) => Number(quantity) > 0);
    if (entries.length === 0) return total > 0 ? `${formatNumber(total)} cái` : '';
    const indexBase = entries.some(([key]) => key === '0') ? 0 : 1;
    return entries.map(([size, quantity]) => {
      const sizeName = getSizeNameFromKey(size, sizeNames, indexBase);
      const sizeLabel = getSizeDisplayLabel(sizeName, sizeNames);
      return `${formatNumber(Number(quantity))} cái${sizeLabel ? ` (${sizeLabel})` : ''}`;
    }).join(', ');
  };
  const getQuantitySummary = (
    bundles: number,
    quantities: Record<string, number> | undefined,
    sizeNames: string[],
    previousCounts: Record<string, number> = Object.fromEntries(sizeNames.map(size => [size, 0]))
  ) => {
    const normalizedQuantities = normalizeSizeCounts(quantities, sizeNames);
    const { looseCounts, newlyCompletedSets } = getLooseSizeCounts(normalizedQuantities, previousCounts, sizeNames);
    const loosePieceCount = Object.values(looseCounts).reduce((sum, count) => sum + count, 0);
    const totalBundles = bundles + newlyCompletedSets;
    const summaryParts = [
      ...(totalBundles > 0 ? [`${formatNumber(totalBundles)} Bộ`] : []),
      getSizeBreakdown(looseCounts, loosePieceCount, sizeNames)
    ].filter(Boolean);
    return summaryParts.join(' + ') || '0 cái';
  };
  const getSlipPreviousSizeCounts = (slip: KnittingExportSlip, kind: 'good' | 'defective') => {
    const slipIndex = knittingExportSlips.findIndex(item => String(item.id) === String(slip.id));
    const earlierSlips = knittingExportSlips.filter((item, index) =>
      String(item.sourceContractId) === String(slip.sourceContractId) &&
      (item.date < slip.date || (item.date === slip.date && index > slipIndex))
    );
    return getPreviousSizeCounts(
      earlierSlips,
      slip.sourceContractId,
      getSlipSizeNames(slip),
      kind
    );
  };
  const getSlipSizeNames = (slip: KnittingExportSlip) => {
    const sourceContract = contracts.find(contract => String(contract.id) === String(slip.sourceContractId));
    if (sourceContract) return getSizeNames(sourceContract);
    const savedSizeCount = Object.keys(slip.goodSizeQuantities || slip.defectiveSizeQuantities || {})
      .filter(size => size !== 'Bộ').length;
    const piecesPerSet = Number(slip.piecesPerSet) || savedSizeCount;
    return piecesPerSet > 1
      ? Array.from({ length: piecesPerSet }, (_, index) => getSizeLabel(index))
      : ['Cái'];
  };
  const currentGoodSizeCounts = Object.fromEntries(
    sizeNames.map(size => [size, Number(goodSizeQuantities[size]) || 0])
  );
  const currentDefectiveSizeCounts = Object.fromEntries(
    sizeNames.map(size => [size, Number(defectiveSizeQuantities[size]) || 0])
  );
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
        <h2 style={{ margin: '0 0 5px', color: '#0f172a', fontSize: '21px' }}>📤 Xuất Hàng Đan</h2>
        <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
          Bàn giao thành phẩm cho Công ty B từ hàng đã nhận tại phiếu Nhận Hàng Đan; chỉ Hàng Đạt được tính vào tiến độ hợp đồng.
        </p>
      </header>

      <form {...formDraftProps} onSubmit={handleSubmit} style={{ display: 'grid', gap: '14px', padding: '16px', border: '1px solid #bfdbfe', borderRadius: '10px', backgroundColor: '#eff6ff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <h3 style={{ margin: 0, color: '#1e40af', fontSize: '15px' }}>{editingId ? '✏️ Sửa Phiếu Xuất Hàng Đan' : '➕ Tạo Phiếu Mới'}</h3>
          <button type="button" onClick={resetForm} style={{ padding: '7px 10px', border: 0, borderRadius: '6px', cursor: 'pointer' }}>
            {editingId !== null ? 'Hủy sửa' : 'Tạo Phiếu Mới'}
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
            Ngày xuất
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
            <small style={{ fontWeight: 400, color: '#64748b' }}>Danh sách cùng mã hàng được xếp theo số lượng còn thiếu ít nhất.</small>
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

        {selectedContract && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px', padding: '12px', borderRadius: '8px', backgroundColor: '#fff', border: '1px solid #dbeafe', fontSize: '12px' }}>
            <div><strong>Mã hàng:</strong> {selectedContract.productCode}<br /><strong>Tên hàng:</strong> {getProductName(selectedContract) || selectedContract.productName}</div>
            <div><strong>HĐ Tổ Đan:</strong> {selectedContract.contractNo}<br /><strong>Phiếu nhận:</strong> {selectedSource?.receipt.receivedDate ? formatDate(selectedSource.receipt.receivedDate) : '—'}</div>
            <div><strong>HĐ Công ty A:</strong> {parentContract?.contractNo || selectedContract.parentContractNo || '—'}<br /><strong>Công ty:</strong> {parentContract?.companyName || parentContract?.company || '—'}</div>
            <div><strong>SL đã nhận:</strong> {formatNumber(issuedQuantity)} {isSetProduct ? 'Bộ quy đổi' : 'Cái'}<br /><strong>ĐVT xuất:</strong> {isSetProduct ? 'Bộ + Cái theo size' : 'Cái'}<br /><strong>Tồn vật lý khả dụng:</strong> {formatNumber(Math.max(0, sourceAvailablePieces - sourceExportedPieces))} cái</div>
          </div>
        )}

        <button type="button" onClick={() => setShowQuantities(value => !value)} disabled={!selectedContract} style={{ justifySelf: 'start', padding: '9px 13px', border: 0, borderRadius: '6px', backgroundColor: selectedContract ? '#2563eb' : '#94a3b8', color: '#fff', fontWeight: 700, cursor: selectedContract ? 'pointer' : 'not-allowed' }}>
          Ghi Hàng Đạt - Loại
        </button>

        {showQuantities && selectedContract && (
          <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '8px', backgroundColor: '#fff' }}>
            {isSetProduct && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(160px, 1fr))', gap: '10px', padding: '12px', backgroundColor: '#f8fafc' }}>
                <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Đạt · Số Bộ nguyên bộ
                  <input type="number" min="0" step="any" value={goodBundles} onChange={event => setGoodBundles(event.target.value)} style={inputStyle} />
                </label>
                <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Loại · Số Bộ nguyên bộ
                  <input type="number" min="0" step="any" value={defectiveBundles} onChange={event => setDefectiveBundles(event.target.value)} style={inputStyle} />
                </label>
              </div>
            )}
            <table style={{ width: '100%', minWidth: '500px', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={tableHeaderStyle}>{isSetProduct ? 'Size 1' : 'ĐVT'}</th>
                  <th style={{ ...tableHeaderStyle, color: '#166534' }}>Đạt · Cái</th>
                  <th style={{ ...tableHeaderStyle, color: '#b91c1c' }}>Loại · Cái</th>
                </tr>
              </thead>
              <tbody>
                {sizeNames.map((size, sizeIndex) => {
                  const sizeLabel = isSetProduct ? getSizeLabel(sizeIndex) : getSizeDisplayLabel(size, sizeNames);
                  return (
                  <tr key={size} style={{ borderTop: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '9px 10px', fontWeight: 700 }}>{sizeLabel}</td>
                    <td style={{ padding: '7px 10px' }}>
                      <input aria-label={`Số lượng đạt ${sizeLabel}`} type="number" min="0" step="any" value={goodSizeQuantities[size] || ''} onChange={event => setGoodSizeQuantities(current => ({ ...current, [size]: event.target.value }))} style={{ ...inputStyle, borderColor: '#86efac' }} />
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <input aria-label={`Số lượng loại ${sizeLabel}`} type="number" min="0" step="any" value={defectiveSizeQuantities[size] || ''} onChange={event => setDefectiveSizeQuantities(current => ({ ...current, [size]: event.target.value }))} style={{ ...inputStyle, borderColor: '#fca5a5' }} />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ padding: '10px 12px', color: '#475569', fontSize: '12px', backgroundColor: '#f8fafc' }}>
              Quy đổi Đạt: <strong style={{ color: '#166534' }}>{formatNumber(currentGoodQuantity)} {isSetProduct ? 'Bộ' : 'Cái'}</strong>
              {' · '}Loại: <strong style={{ color: '#b91c1c' }}>{formatNumber(currentDefectiveQuantity)} {isSetProduct ? 'Bộ' : 'Cái'}</strong>
              <div style={{ marginTop: '5px' }}>
                <strong>Chi tiết phiếu này:</strong>{' '}
                Đạt: {getQuantitySummary(Number(goodBundles) || 0, currentGoodSizeCounts, sizeNames, goodPreviousSizeTotals)}
                {' · '}Loại: {getQuantitySummary(Number(defectiveBundles) || 0, currentDefectiveSizeCounts, sizeNames, defectivePreviousSizeTotals)}
              </div>
              {isSetProduct && (
                <div style={{ marginTop: '8px' }}>
                  <strong>Đối soát phần lẻ đã ghi nhớ theo hợp đồng Tổ Đan:</strong>
                  <div style={{ marginTop: '5px', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(100px, 1fr))', gap: '6px' }}>
                    {sizeReconciliationRows.map((row, sizeIndex) => (
                      <div key={row.size} style={{ padding: '7px', borderRadius: '5px', backgroundColor: '#fff', border: '1px solid #e2e8f0' }}>
                        <strong>{getSizeLabel(sizeIndex)}</strong>
                        <div>Đạt cũ {formatNumber(row.goodCarry)} + mới {formatNumber(Number(goodSizeQuantities[row.size]) || 0)}</div>
                        <div style={{ color: '#166534' }}>Còn thiếu để đủ bộ: {formatNumber(Math.max(0, goodTargetSizeCount - row.goodTotal))}</div>
                        <div>Loại cũ {formatNumber(row.defectiveCarry)} + mới {formatNumber(Number(defectiveSizeQuantities[row.size]) || 0)}</div>
                        <div style={{ color: '#b91c1c' }}>Còn thiếu để đủ bộ: {formatNumber(Math.max(0, defectiveTargetSizeCount - row.defectiveTotal))}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '6px' }}>
                    Bộ lẻ được cộng dồn riêng cho Đạt và Loại; số bộ mới hoàn thành được tính theo min giữa các size.
                    {' '}Tồn sau phiếu này ước tính: {formatNumber(displayedStockAfterCurrent)} cái.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>
          Ghi chú
          <input value={note} onChange={event => setNote(event.target.value)} placeholder="Thông tin bổ sung về giao hàng" style={inputStyle} />
        </label>
        <div style={{ display: 'grid', gap: '8px', padding: '12px', border: '1px dashed #94a3b8', borderRadius: '8px', backgroundColor: '#fff' }}>
          <label style={{ fontSize: '12px', fontWeight: 700 }}>📎 Đính kèm hồ sơ giao hàng (ảnh / PDF, tối đa 2 MB mỗi file)
            <input type="file" accept="image/*,application/pdf" multiple onChange={event => void handleAttachmentChange(event)} style={{ display: 'block', marginTop: '7px', fontSize: '12px' }} />
          </label>
          {attachments.map(attachment => (
            <div key={attachment.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px' }}>
              <a href={attachment.dataUrl} target="_blank" rel="noreferrer" download={attachment.name}>{attachment.name}</a>
              <button type="button" onClick={() => setAttachments(current => current.filter(item => item.id !== attachment.id))} style={{ cursor: 'pointer' }}>Gỡ</button>
            </div>
          ))}
        </div>

        {parentContract && (
          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#f0fdf4', color: '#166534', fontSize: '12px' }}>
            <strong>Tiến độ Công ty A (chỉ tính Hàng Đạt):</strong> {formatNumber(totalGoodForParent)} / {formatNumber(progressQuantity)} {isSetProduct ? 'Bộ' : 'Cái'}
            <div style={{ height: '7px', marginTop: '8px', borderRadius: '99px', backgroundColor: '#dcfce7', overflow: 'hidden' }}>
              <div style={{ width: `${progressPercent}%`, height: '100%', backgroundColor: '#16a34a' }} />
            </div>
            <div style={{ marginTop: '5px' }}>Hoàn thành {progressPercent.toFixed(1)}% · Doanh thu đạt tạm tính theo đơn giá HĐ: {(Math.min(totalGoodForParent, progressQuantity) * (Number(parentContract.unitPrice) || 0)).toLocaleString('vi-VN')} đ</div>
          </div>
        )}

        {error && <div role="alert" style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{error}</div>}
        <button type="submit" disabled={isSubmitting} style={{ justifySelf: 'start', padding: '10px 16px', border: 0, borderRadius: '7px', backgroundColor: isSubmitting ? '#94a3b8' : '#1d4ed8', color: '#fff', fontWeight: 800, cursor: isSubmitting ? 'wait' : 'pointer' }}>
          {isSubmitting ? '⏳ Đang lưu...' : editingId ? 'Lưu Phiếu' : 'Lưu Phiếu Xuất'}
        </button>
      </form>

      <section style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#fff' }}>
        <h3 style={{ padding: '14px 16px', margin: 0, color: '#1e293b', fontSize: '15px' }}>Lịch Sử Phiếu Xuất Hàng Đan</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1040px' }}>
          <thead><tr>{['Phiếu / Ngày', 'Mã hàng', 'HĐ Công ty A', 'Đạt', 'Loại', 'HĐ đối chiếu B-A', 'Chứng từ', 'Thao tác'].map(label => <th key={label} style={tableHeaderStyle}>{label}</th>)}</tr></thead>
          <tbody>
            {allSlips.map(slip => (
              <tr key={slip.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                <td style={{ padding: '10px', whiteSpace: 'nowrap' }}><strong>{slip.slipNo}</strong><br /><small>{formatDate(slip.date)}</small></td>
                <td style={{ padding: '10px' }}><strong>{slip.productCode}</strong><br /><small>{slip.productName}</small></td>
                <td style={{ padding: '10px' }}>{slip.parentContractNo || '—'}<br /><small>{slip.parentCompanyName || '—'}</small></td>
                <td style={{ padding: '10px', color: '#166534', fontWeight: 700 }}>{formatNumber(slip.goodContractQuantity)} {slip.unit}<br /><small>{getQuantitySummary(slip.goodBundles, slip.goodSizeQuantities, getSlipSizeNames(slip), getSlipPreviousSizeCounts(slip, 'good'))}</small></td>
                <td style={{ padding: '10px', color: '#b91c1c' }}>{formatNumber(slip.defectiveContractQuantity)} {slip.unit}<br /><small>{getQuantitySummary(slip.defectiveBundles, slip.defectiveSizeQuantities, getSlipSizeNames(slip), getSlipPreviousSizeCounts(slip, 'defective'))}</small></td>
                <td style={{ padding: '10px' }}>{slip.companyBContractNo || '—'}</td>
                <td style={{ padding: '10px', textAlign: 'center' }}>{slip.attachments?.length || 0}</td>
                <td style={{ padding: '10px' }}>
                  <div className="slip-action-buttons">
                    <button type="button" className="slip-action-button slip-action-edit" onClick={() => startEdit(slip.id)}>✏️ Sửa</button>
                    {hasPermission('delete_knitting_exports') && <button type="button" className="slip-action-button slip-action-delete" onClick={() => handleDelete(slip)}>🗑️ Xóa</button>}
                    <button type="button" className="slip-action-button slip-action-files" onClick={() => { setAttachmentSlip(slip); setActionError(''); }}>📎 Mở Files / Đính kèm chứng từ</button>
                    <button type="button" className="slip-action-button slip-action-print" onClick={() => { setPrintSlip(slip); setActionError(''); }}>🖨️ In Phiếu / Lưu PDF</button>
                    <button type="button" className="slip-action-button slip-action-zalo" onClick={() => void handleSendToZalo(slip)}>💬 Gửi Zalo</button>
                  </div>
                </td>
              </tr>
            ))}
            {allSlips.length === 0 && <tr><td colSpan={8} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>Chưa có phiếu xuất hàng đan.</td></tr>}
          </tbody>
        </table>
      </section>

      {actionError && <div role="alert" style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{actionError}</div>}

      {attachmentSlip && (
        <div role="dialog" aria-modal="true" aria-label={`Chứng từ phiếu ${attachmentSlip.slipNo}`} style={{ position: 'fixed', inset: 0, zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'rgba(15, 23, 42, .65)' }}>
          <section style={{ width: 'min(720px, 96vw)', maxHeight: '90vh', overflowY: 'auto', padding: '20px', borderRadius: '10px', backgroundColor: '#fff', boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>Files / Chứng từ · {attachmentSlip.slipNo}</h3>
              <button type="button" onClick={() => setAttachmentSlip(null)} style={{ cursor: 'pointer' }}>Đóng</button>
            </div>
            <label style={{ display: 'block', marginBottom: '14px', fontSize: '12px', fontWeight: 700 }}>
              Chọn ảnh hoặc PDF để đính kèm (tối đa 2 MB mỗi file)
              <input type="file" accept="image/*,application/pdf" multiple onChange={event => void handleSlipAttachmentChange(event)} style={{ display: 'block', marginTop: '7px', fontSize: '12px' }} />
            </label>
            {(attachmentSlip.attachments || []).length === 0 && (
              <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>Phiếu chưa có file chứng từ đính kèm.</p>
            )}
            <div style={{ display: 'grid', gap: '10px' }}>
              {(attachmentSlip.attachments || []).map(attachment => (
                <div key={attachment.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '7px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    {attachment.mimeType.startsWith('image/') && <img src={attachment.dataUrl} alt={attachment.name} style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '5px' }} />}
                    <a href={attachment.dataUrl} target="_blank" rel="noreferrer" download={attachment.name} style={{ overflowWrap: 'anywhere' }}>{attachment.name}</a>
                  </div>
                  <button type="button" onClick={() => removeSlipAttachment(attachment.id)} style={{ cursor: 'pointer' }}>Gỡ file</button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {printSlip && (
        <div role="dialog" aria-modal="true" aria-label="Phiếu xuất hàng đan" style={{ position: 'fixed', inset: 0, zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'rgba(15, 23, 42, .65)' }}>
          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              #knitting-export-print-area, #knitting-export-print-area * { visibility: visible !important; }
              #knitting-export-print-area { position: absolute !important; inset: 0 !important; width: 100% !important; max-width: none !important; margin: 0 !important; padding: 12mm !important; border: 0 !important; box-shadow: none !important; }
              .knitting-export-actions { display: none !important; }
              @page { size: A4 portrait; margin: 0; }
            }
          `}</style>
          <div style={{ width: 'min(850px, 96vw)', maxHeight: '94vh', display: 'flex', flexDirection: 'column', overflow: 'auto', borderRadius: '10px', backgroundColor: '#fff', boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>
            <div ref={printAreaRef} id="knitting-export-print-area" style={{ padding: '36px', color: '#0f172a', backgroundColor: '#fff' }}>
              <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                <h2 style={{ margin: 0, fontSize: '20px' }}>PHIẾU XUẤT HÀNG ĐAN</h2>
                <div style={{ marginTop: '8px' }}>Số phiếu: <strong>{printSlip.slipNo}</strong> · Ngày {formatDate(printSlip.date)}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <div><strong>Hàng nhận từ Tổ Đan:</strong> {printSlip.sourceContractNo}</div>
                <div><strong>Hợp đồng Công ty A:</strong> {printSlip.parentContractNo || '—'} ({printSlip.parentCompanyName || '—'})</div>
                <div><strong>Mã hàng:</strong> {printSlip.productCode}</div>
                <div><strong>Tên hàng:</strong> {printSlip.productName}</div>
                <div><strong>HĐ đối chiếu Công ty B - A:</strong> {printSlip.companyBContractNo || '—'}</div>
                <div><strong>ĐVT:</strong> {printSlip.unit}</div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
                <thead><tr>{['Phân loại', 'Bộ', 'Cái', 'Quy đổi'].map(label => <th key={label} style={{ border: '1px solid #94a3b8', padding: '9px', textAlign: 'left' }}>{label}</th>)}</tr></thead>
                <tbody>
                  <tr><td style={{ border: '1px solid #94a3b8', padding: '9px' }}>Hàng Đạt<br /><small>{getQuantitySummary(printSlip.goodBundles, printSlip.goodSizeQuantities, getSlipSizeNames(printSlip), getSlipPreviousSizeCounts(printSlip, 'good'))}</small></td><td style={{ border: '1px solid #94a3b8', padding: '9px' }}>{formatNumber(printSlip.goodBundles)}</td><td style={{ border: '1px solid #94a3b8', padding: '9px' }}>{formatNumber(printSlip.goodPieces)}</td><td style={{ border: '1px solid #94a3b8', padding: '9px' }}>{formatNumber(printSlip.goodContractQuantity)} {printSlip.unit}</td></tr>
                  <tr><td style={{ border: '1px solid #94a3b8', padding: '9px' }}>Hàng Loại<br /><small>{getQuantitySummary(printSlip.defectiveBundles, printSlip.defectiveSizeQuantities, getSlipSizeNames(printSlip), getSlipPreviousSizeCounts(printSlip, 'defective'))}</small></td><td style={{ border: '1px solid #94a3b8', padding: '9px' }}>{formatNumber(printSlip.defectiveBundles)}</td><td style={{ border: '1px solid #94a3b8', padding: '9px' }}>{formatNumber(printSlip.defectivePieces)}</td><td style={{ border: '1px solid #94a3b8', padding: '9px' }}>{formatNumber(printSlip.defectiveContractQuantity)} {printSlip.unit}</td></tr>
                </tbody>
              </table>
              <div style={{ minHeight: '48px' }}><strong>Ghi chú:</strong> {printSlip.note || '—'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '40px', textAlign: 'center' }}>
                <div><strong>BÊN GIAO</strong><div style={{ height: '70px' }} />Ký, ghi rõ họ tên</div>
                <div><strong>BÊN NHẬN (CÔNG TY B)</strong><div style={{ height: '70px' }} />Ký, ghi rõ họ tên</div>
              </div>
            </div>
            <div className="knitting-export-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '9px', padding: '12px', backgroundColor: '#f8fafc' }}>
              <button type="button" onClick={() => window.print()} style={{ padding: '9px 12px', cursor: 'pointer' }}>In Phiếu / Lưu PDF</button>
              <button type="button" onClick={() => void handleSendToZalo(printSlip)} style={{ padding: '9px 12px', cursor: 'pointer' }}>Gửi Zalo</button>
              <button type="button" onClick={() => setPrintSlip(null)} style={{ padding: '9px 12px', cursor: 'pointer' }}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
