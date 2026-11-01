import { useRef, useState, type FormEvent } from 'react';
import type { CategoryItem, ContractItem, DefectiveGoodsImportSlip, SlipItem } from '../context/AppContext';
import { useApp } from '../context/AppContext';
import { usePersistentFormDraft } from '../hooks/usePersistentFormDraft';
import { getLatestMaterialUnitPrice, normalizeMaterialSearch } from '../utils/materialSearch';

interface RepairFormLine {
  id: string;
  productCode: string;
  productName: string;
  quantity: string;
  bundleQuantity: string;
  sizeQuantities: Record<string, string>;
  bundleUnitPrice: string;
  sizeUnitPrices: Record<string, string>;
  itemTypeOption: 'CAI' | 'CA_HAI';
  sourceDefectiveGoodsImportSlipId?: string;
}

interface RepairStockLine {
  id: string;
  productCode: string;
  productName: string;
  quantity: number;
  bundleQuantity: number;
  sizeQuantities: Record<string, number>;
  unitPrice: number;
  bundleUnitPrice?: number;
  sizeUnitPrices?: Record<string, number>;
  amount: number;
  sourceDefectiveGoodsImportSlipId?: number | string;
}

type MaterialUnit = string;

interface AccompanyingMaterial {
  materialId: number;
  materialCode: string;
  materialName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  unit: MaterialUnit;
}

interface AccompanyingMaterialFormRow {
  id: string;
  materialId: number | null;
  materialCode: string;
  materialName: string;
  query: string;
  unit: MaterialUnit;
  quantity: string;
  unitPrice: string;
  isDropdownOpen: boolean;
}

interface StockCounts {
  productCode: string;
  productName: string;
  sizeCount: number;
  sizes: Record<string, number>;
}

type InventoryReportTab = 'stock' | 'repair-export' | 'repair-receipt';

const getToday = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const getDefaultDueDate = () => {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 2);
  return `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;
};

const getPiecesPerSet = (productCode: string) => {
  const count = Number(/\/(\d+)\s*$/.exec(String(productCode || '').trim())?.[1]);
  return Number.isInteger(count) && count > 1 && count <= 20 ? count : 1;
};

const getSizeKeys = (contract: ContractItem | undefined, sizeCount: number) => {
  const configuredSizes = contract?.sizeQuantities;
  const configured = Object.keys(
    configuredSizes && typeof configuredSizes === 'object' ? configuredSizes : {}
  )
    .filter(size => size !== 'Bộ')
    .sort((first, second) => first.localeCompare(second, 'vi', { numeric: true }));
  return Array.from({ length: sizeCount }, (_, index) => configured[index] || `Cái ${index + 1}`);
};

const normalizeSizeCounts = (
  quantities: Record<string, number | string> | undefined,
  sizeKeys: string[]
) => {
  const normalized = Object.fromEntries(sizeKeys.map((_, index) => [`Cái ${index + 1}`, 0]));
  const safeQuantities = quantities && typeof quantities === 'object' ? quantities : {};
  Object.entries(safeQuantities).forEach(([key, value]) => {
    if (key === 'Bộ') return;
    const exactIndex = sizeKeys.indexOf(key);
    const suffixIndex = /(?:Cái|Size)\s*(\d+)$/i.exec(key)?.[1];
    const numericIndex = /^\d+$/.test(key) ? key : undefined;
    const index = exactIndex >= 0
      ? exactIndex
      : /^cái$/i.test(key) ? 0
      : numericIndex !== undefined
        ? Number(numericIndex) === 0 ? 0 : Number(numericIndex) - 1
        : suffixIndex ? Number(suffixIndex) - 1 : -1;
    const targetKey = `Cái ${index + 1}`;
    if (index >= 0 && index < sizeKeys.length) {
      normalized[targetKey] += Number(value) || 0;
    }
  });
  return normalized;
};

const createRepairLine = (): RepairFormLine => ({
  id: `repair-line-${crypto.randomUUID()}`,
  productCode: '',
  productName: '',
  quantity: '',
  bundleQuantity: '',
  sizeQuantities: {},
  bundleUnitPrice: '',
  sizeUnitPrices: {},
  itemTypeOption: 'CAI'
});

const createAccompanyingMaterialRow = (): AccompanyingMaterialFormRow => ({
  id: `repair-material-${crypto.randomUUID()}`,
  materialId: null,
  materialCode: '',
  materialName: '',
  query: '',
  unit: 'kg',
  quantity: '',
  unitPrice: '',
  isDropdownOpen: false
});

const formatNumber = (value: number) =>
  value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const formatCurrency = (value: number) => `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} đ`;
const getAccompanyingMaterialAmount = (materials: SlipItem['accompanyingMaterials']) =>
  (Array.isArray(materials) ? materials : []).reduce((sum, material) => {
    const savedAmount = Number(material.amount);
    const amount = material.amount !== undefined && Number.isFinite(savedAmount)
      ? savedAmount
      : (Number(material.quantity) || 0) * (Number(material.unitPrice) || 0);
    return sum + amount;
  }, 0);
const parseFormattedNumber = (value: string) => Number(value.replace(/,/g, ''));
const formatNumberInput = (value: string) => {
  const cleaned = value.replace(/[^\d.]/g, '');
  const [whole, ...decimalParts] = cleaned.split('.');
  const formattedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimalParts.length ? `${formattedWhole}.${decimalParts.join('')}` : formattedWhole;
};
const getRepairLineAmount = (line: RepairStockLine) => {
  if (!line || typeof line !== 'object') return 0;
  if (line.bundleUnitPrice === undefined && line.sizeUnitPrices === undefined) {
    return Number(line.amount) || 0;
  }
  const legacyUnitPrice = Number(line.unitPrice) || 0;
  const bundleUnitPrice = Number(line.bundleUnitPrice ?? legacyUnitPrice);
  const sizeUnitPrices = line.sizeUnitPrices && typeof line.sizeUnitPrices === 'object'
    ? line.sizeUnitPrices
    : {};
  const bundleAmount = (Number(line.bundleQuantity) || 0) * bundleUnitPrice;
  const sizeAmount = Object.entries(line.sizeQuantities || {}).reduce((sum, [size, quantity]) => (
    sum + (Number(quantity) || 0) * (Number(sizeUnitPrices[size] ?? legacyUnitPrice) || 0)
  ), 0);
  const singleSizeAmount = getPiecesPerSet(line.productCode) === 1 && !Object.values(line.sizeQuantities || {}).some(value => Number(value) > 0)
    ? (Number(line.quantity) || 0) * (Number(sizeUnitPrices['Cái 1'] ?? legacyUnitPrice) || 0)
    : 0;
  return bundleAmount + sizeAmount + singleSizeAmount;
};
const getRepairFormLineAmount = (line: RepairFormLine) => {
  const piecesPerSet = getPiecesPerSet(line.productCode);
  const bundleAmount = (line.itemTypeOption === 'CA_HAI' ? Number(line.bundleQuantity) || 0 : 0) *
    (parseFormattedNumber(line.bundleUnitPrice) || 0);
  const sizeAmount = piecesPerSet === 1
    ? (Number(line.quantity) || 0) * (parseFormattedNumber(line.sizeUnitPrices['Cái 1'] || '') || 0)
    : Object.entries(line.sizeQuantities).reduce((sum, [size, quantity]) =>
      sum + (Number(quantity) || 0) * (parseFormattedNumber(line.sizeUnitPrices[size] || '') || 0), 0);
  return bundleAmount + sizeAmount;
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

export default function InventoryStockReport() {
  const repairDraft = usePersistentFormDraft('repair-export-slip');
  const repairReceiptDraft = usePersistentFormDraft('repair-receipt-slip');
  const {
    products: productsData,
    materials: materialsData,
    contracts: contractsData,
    slips: slipsData,
    knittingExportSlips: knittingExportSlipsData,
    defectiveGoodsImportSlips: defectiveGoodsImportSlipsData,
    expenses: expensesData,
    systemConfiguration,
    addSlip,
    updateSlip,
    deleteSlip
  } = useApp();
  const products = Array.isArray(productsData) ? productsData.filter(Boolean) : [];
  const materials = Array.isArray(materialsData) ? materialsData.filter(Boolean) : [];
  const contracts = Array.isArray(contractsData) ? contractsData.filter(Boolean) : [];
  const slips = Array.isArray(slipsData) ? slipsData.filter(Boolean) : [];
  const knittingExportSlips = Array.isArray(knittingExportSlipsData) ? knittingExportSlipsData.filter(Boolean) : [];
  const defectiveGoodsImportSlips = Array.isArray(defectiveGoodsImportSlipsData)
    ? defectiveGoodsImportSlipsData.filter(Boolean)
    : [];
  const expenses = Array.isArray(expensesData) ? expensesData.filter(Boolean) : [];
  const [reportMonth, setReportMonth] = useState(getToday().slice(0, 7));
  const [activeReportTab, setActiveReportTab] = useState<InventoryReportTab>('stock');
  const [date, setDate] = useState(getToday());
  const [advance, setAdvance] = useState('');
  const [reason, setReason] = useState('');
  const [repairWorkerName, setRepairWorkerName] = useState('');
  const [repairWorkerZalo, setRepairWorkerZalo] = useState('');
  const [lines, setLines] = useState<RepairFormLine[]>([createRepairLine()]);
  const [accompanyingMaterials, setAccompanyingMaterials] = useState<AccompanyingMaterialFormRow[]>([
    createAccompanyingMaterialRow()
  ]);
  const [editingSlipId, setEditingSlipId] = useState<number | string | null>(null);
  const [error, setError] = useState('');
  const [shareSlip, setShareSlip] = useState<SlipItem | null>(null);
  const [exportingRepairImage, setExportingRepairImage] = useState(false);
  const sharePrintRef = useRef<HTMLDivElement>(null);
  const [receiptSourceSlipId, setReceiptSourceSlipId] = useState('');
  const [receiptDate, setReceiptDate] = useState(getToday());
  const [receiptDueDate, setReceiptDueDate] = useState('');
  const [receiptPaymentNote, setReceiptPaymentNote] = useState('');
  const [receiptLines, setReceiptLines] = useState<RepairFormLine[]>([]);
  const [receiptError, setReceiptError] = useState('');
  const [editingReceiptId, setEditingReceiptId] = useState<number | string | null>(null);

  const repairSlips = slips.filter(slip => slip?.type === 'XUAT_SUA_KHOAN');
  const repairReceiptSlips = slips.filter(slip => slip?.type === 'NHAN_SUA_KHOAN');
  const companyFrameReturnSlips = slips.filter(slip =>
    slip?.type === 'XUAT_KS_TRA_CTY' && Array.isArray(slip.companyReturnLines)
  );
  const repairWorkerOptions = Array.from(new Map(
    contracts
      .filter(contract => contract.contractType === 'SUB' && contract.craftGroupLeader?.trim())
      .map(contract => {
        const name = String(contract.craftGroupLeader).trim();
        return [name.toLowerCase(), {
          name,
          phone: String(contract.zalo || contract.phone || '').trim()
        }] as const;
      })
  ).values());
  const productNames = new Map<string, string>();
  products.forEach(product => {
    if (product.code) productNames.set(product.code.trim().toLowerCase(), product.name);
  });
  contracts.forEach(contract => {
    if (contract.productCode) {
      productNames.set(contract.productCode.trim().toLowerCase(), contract.productName || '');
    }
  });
  slips.forEach(slip => {
    if (slip.productCode) {
      productNames.set(slip.productCode.trim().toLowerCase(), slip.productName || '');
    }
  });

  const newSlipNo = (() => {
    const year = date.slice(0, 4);
    const sequence = repairSlips.reduce((max, slip) => {
      const match = new RegExp(`^(\\d+)/${year}/SK$`).exec(slip.slipNo);
      return Math.max(max, Number(match?.[1]) || 0);
    }, 0) + 1;
    return `${String(sequence).padStart(2, '0')}/${year}/SK`;
  })();

  const updateLine = (id: string, updates: Partial<RepairFormLine>) => {
    setLines(current => current.map(line => line.id === id ? { ...line, ...updates } : line));
  };

  const getDefectiveImportRepairAvailability = (
    source: DefectiveGoodsImportSlip,
    excludingRepairId?: number | string
  ) => {
    const sizeCount = getPiecesPerSet(source.productCode);
    const sizeKeys = Array.from({ length: sizeCount }, (_, index) => `Cái ${index + 1}`);
    const importedSizes = normalizeSizeCounts(source.sizeQuantities, sizeKeys);
    if (sizeCount === 1 && importedSizes['Cái 1'] === 0) {
      importedSizes['Cái 1'] = Number(source.quantity) || 0;
    }
    const used = { bundles: 0, sizes: Object.fromEntries(sizeKeys.map(size => [size, 0])) };
    repairSlips
      .filter(slip => String(slip.id) !== String(excludingRepairId ?? ''))
      .flatMap(getRepairLines)
      .filter(line =>
        String(line.sourceDefectiveGoodsImportSlipId || '') === String(source.id) &&
        line.productCode.trim().toLowerCase() === source.productCode.trim().toLowerCase()
      )
      .forEach(line => {
        used.bundles += Number(line.bundleQuantity) || 0;
        const lineSizes = normalizeSizeCounts(line.sizeQuantities, sizeKeys);
        sizeKeys.forEach(size => { used.sizes[size] += lineSizes[size]; });
        if (sizeCount === 1 && Object.values(line.sizeQuantities || {}).every(quantity => Number(quantity) === 0)) {
          used.sizes['Cái 1'] += Number(line.quantity) || 0;
        }
      });
    return {
      bundles: Math.max(0, (Number(source.bundleQuantity) || 0) - used.bundles),
      sizes: Object.fromEntries(sizeKeys.map(size => [
        size,
        Math.max(0, importedSizes[size] - used.sizes[size])
      ]))
    };
  };

  const getDraftAwareDefectiveImportAvailability = (
    source: DefectiveGoodsImportSlip,
    excludingLineId: string
  ) => {
    const availability = getDefectiveImportRepairAvailability(source, editingSlipId ?? undefined);
    const sizeKeys = Object.keys(availability.sizes);
    lines
      .filter(line =>
        line.id !== excludingLineId &&
        String(line.sourceDefectiveGoodsImportSlipId || '') === String(source.id)
      )
      .forEach(line => {
        availability.bundles = Math.max(0, availability.bundles - (Number(line.bundleQuantity) || 0));
        const lineSizes = normalizeSizeCounts(line.sizeQuantities, sizeKeys);
        sizeKeys.forEach(size => {
          availability.sizes[size] = Math.max(0, availability.sizes[size] - lineSizes[size]);
        });
        if (sizeKeys.length === 1 && Object.values(line.sizeQuantities).every(quantity => Number(quantity) === 0)) {
          availability.sizes['Cái 1'] = Math.max(
            0,
            availability.sizes['Cái 1'] - (Number(line.quantity) || 0)
          );
        }
      });
    return availability;
  };

  const selectDefectiveImportSource = (line: RepairFormLine, sourceId: string) => {
    const source = defectiveGoodsImportSlips.find(item => String(item.id) === sourceId);
    if (!source) {
      updateLine(line.id, { sourceDefectiveGoodsImportSlipId: undefined });
      return;
    }
    const availability = getDraftAwareDefectiveImportAvailability(source, line.id);
    const sizeCount = getPiecesPerSet(source.productCode);
    updateLine(line.id, {
      sourceDefectiveGoodsImportSlipId: String(source.id),
      productCode: source.productCode,
      productName: source.productName,
      quantity: sizeCount === 1 ? String(availability.sizes['Cái 1'] || 0) : '0',
      bundleQuantity: String(availability.bundles || 0),
      sizeQuantities: sizeCount === 1
        ? {}
        : Object.fromEntries(
          Object.entries(availability.sizes).map(([size, quantity]) => [size, String(quantity)])
        ),
      itemTypeOption: sizeCount > 1 ? 'CA_HAI' : 'CAI'
    });
  };

  const getRepairLines = (slip: SlipItem): RepairStockLine[] => {
    if (!slip || typeof slip !== 'object') return [];
    if (Array.isArray(slip.repairLines)) {
      return slip.repairLines.filter(line => line && typeof line === 'object').map((line, index) => {
        const sizeQuantities = line.sizeQuantities && typeof line.sizeQuantities === 'object'
          ? line.sizeQuantities
          : {};
        const sizeUnitPrices = line.sizeUnitPrices && typeof line.sizeUnitPrices === 'object'
          ? line.sizeUnitPrices
          : undefined;
        return {
          id: String(line.id || `repair-line-${slip.id}-${index}`),
          productCode: String(line.productCode || ''),
          productName: String(line.productName || ''),
          sourceDefectiveGoodsImportSlipId: line.sourceDefectiveGoodsImportSlipId,
          quantity: Number(line.quantity) || 0,
          bundleQuantity: Number(line.bundleQuantity) || 0,
          sizeQuantities: normalizeSizeCounts(
            sizeQuantities,
            Array.from({ length: getPiecesPerSet(String(line.productCode || '')) }, (_, sizeIndex) => `Cái ${sizeIndex + 1}`)
          ),
          unitPrice: Number(line.unitPrice) || 0,
          bundleUnitPrice: line.bundleUnitPrice === undefined ? undefined : Number(line.bundleUnitPrice) || 0,
          sizeUnitPrices: sizeUnitPrices
            ? Object.fromEntries(Object.entries(sizeUnitPrices).map(([size, price]) => [size, Number(price) || 0]))
            : undefined,
          amount: Number(line.amount) || 0
        };
      });
    }
    return [{
      id: String(slip.id),
      productCode: slip.productCode,
      productName: slip.productName,
      sourceDefectiveGoodsImportSlipId: undefined,
      quantity: Number(slip.quantity) || 0,
      bundleQuantity: 0,
      sizeQuantities: normalizeSizeCounts(slip.sizeQuantities, Array.from(
        { length: getPiecesPerSet(slip.productCode) },
        (_, index) => `Cái ${index + 1}`
      )),
      unitPrice: 0,
      amount: Number(slip.repairTotal) || 0
    }];
  };

  const getRepairReceiptProgress = (sourceSlipId: number | string, excludingReceiptId?: number | string | null) => {
    const progress = new Map<string, { bundles: number; sizes: Record<string, number> }>();
    let advanceApplied = 0;
    let materialApplied = 0;
    repairReceiptSlips
      .filter(receipt =>
        String(receipt.sourceRepairSlipId || '') === String(sourceSlipId) &&
        String(receipt.id) !== String(excludingReceiptId ?? '')
      )
      .forEach(receipt => {
        advanceApplied += Number(receipt.repairAdvanceApplied) || 0;
        materialApplied += Number(receipt.repairMaterialDeducted) || 0;
        getRepairLines(receipt).forEach(line => {
          const code = line.productCode.trim().toLowerCase();
          const current = progress.get(code) || { bundles: 0, sizes: {} };
          current.bundles += Number(line.bundleQuantity) || 0;
          const lineSizes = line.sizeQuantities || {};
          Object.entries(lineSizes).forEach(([size, quantity]) => {
            current.sizes[size] = (current.sizes[size] || 0) + (Number(quantity) || 0);
          });
          if (
            getPiecesPerSet(line.productCode) === 1 &&
            Object.values(lineSizes).every(quantity => Number(quantity) === 0)
          ) {
            current.sizes['Cái 1'] = (current.sizes['Cái 1'] || 0) + (Number(line.quantity) || 0);
          }
          progress.set(code, current);
        });
      });
    return { progress, advanceApplied, materialApplied };
  };

  const getRepairSourceLines = (slip: SlipItem) => {
    const byCode = new Map<string, RepairStockLine>();
    const priceTotals = new Map<string, {
      bundleQuantity: number;
      bundleAmount: number;
      sizeQuantities: Record<string, number>;
      sizeAmounts: Record<string, number>;
    }>();
    getRepairLines(slip).forEach(line => {
      const code = line.productCode.trim().toLowerCase();
      const sizeCount = getPiecesPerSet(line.productCode);
      const current = byCode.get(code) || {
        id: line.id,
        productCode: line.productCode,
        productName: line.productName,
        quantity: 0,
        bundleQuantity: 0,
        sizeQuantities: Object.fromEntries(Array.from({ length: sizeCount }, (_, index) => [`Cái ${index + 1}`, 0])),
        unitPrice: 0,
        bundleUnitPrice: 0,
        sizeUnitPrices: Object.fromEntries(Array.from({ length: sizeCount }, (_, index) => [`Cái ${index + 1}`, 0])),
        amount: 0
      };
      const totals = priceTotals.get(code) || {
        bundleQuantity: 0,
        bundleAmount: 0,
        sizeQuantities: {},
        sizeAmounts: {}
      };
      const sourceBundlePrice = Number(line.bundleUnitPrice ??
        ((Number(line.unitPrice) || 0) * (line.bundleUnitPrice === undefined ? sizeCount : 1))) || 0;
      totals.bundleQuantity += Number(line.bundleQuantity) || 0;
      totals.bundleAmount += (Number(line.bundleQuantity) || 0) * sourceBundlePrice;
      current.bundleQuantity += Number(line.bundleQuantity) || 0;
      Object.entries(line.sizeQuantities || {}).forEach(([size, quantity]) => {
        current.sizeQuantities[size] = (current.sizeQuantities[size] || 0) + (Number(quantity) || 0);
        const sizeQuantity = Number(quantity) || 0;
        const sizePrice = Number(line.sizeUnitPrices?.[size] ?? line.unitPrice) || 0;
        totals.sizeQuantities[size] = (totals.sizeQuantities[size] || 0) + sizeQuantity;
        totals.sizeAmounts[size] = (totals.sizeAmounts[size] || 0) + sizeQuantity * sizePrice;
      });
      if (sizeCount === 1 && Object.values(line.sizeQuantities || {}).every(quantity => Number(quantity) === 0)) {
        const sizeQuantity = Number(line.quantity) || 0;
        const sizePrice = Number(line.sizeUnitPrices?.['Cái 1'] ?? line.unitPrice) || 0;
        current.quantity += sizeQuantity;
        current.sizeQuantities['Cái 1'] = (current.sizeQuantities['Cái 1'] || 0) + sizeQuantity;
        totals.sizeQuantities['Cái 1'] = (totals.sizeQuantities['Cái 1'] || 0) + sizeQuantity;
        totals.sizeAmounts['Cái 1'] = (totals.sizeAmounts['Cái 1'] || 0) + sizeQuantity * sizePrice;
      }
      if (!current.productName && line.productName) current.productName = line.productName;
      byCode.set(code, current);
      priceTotals.set(code, totals);
    });
    return Array.from(byCode.entries()).map(([code, line]) => {
      const totals = priceTotals.get(code) || {
        bundleQuantity: 0,
        bundleAmount: 0,
        sizeQuantities: {},
        sizeAmounts: {}
      };
      const bundleUnitPrice = totals.bundleQuantity > 0
        ? totals.bundleAmount / totals.bundleQuantity
        : 0;
      const sizeUnitPrices = Object.fromEntries(Object.keys(line.sizeQuantities).map(size => [
        size,
        (totals.sizeQuantities[size] || 0) > 0
          ? (totals.sizeAmounts[size] || 0) / totals.sizeQuantities[size]
          : 0
      ]));
      return {
        ...line,
        bundleUnitPrice,
        sizeUnitPrices,
        unitPrice: sizeUnitPrices['Cái 1'] || 0
      };
    });
  };

  const getReceiptLineBreakdown = (line: RepairFormLine) => {
    const sizeCount = getPiecesPerSet(line.productCode);
    if (sizeCount === 1) {
      return {
        bundleQuantity: 0,
        sizeQuantities: { 'Cái 1': Number(line.quantity) || 0 },
        quantity: Number(line.quantity) || 0
      };
    }
    const sizeKeys = Array.from({ length: sizeCount }, (_, index) => `Cái ${index + 1}`);
    const looseSizes = Object.fromEntries(sizeKeys.map(size => [
      size,
      Math.max(0, Number(line.sizeQuantities?.[size]) || 0)
    ]));
    const groupedBundles = Math.min(...Object.values(looseSizes));
    const directBundles = line.itemTypeOption === 'CA_HAI'
      ? Math.max(0, Number(line.bundleQuantity) || 0)
      : 0;
    const sizeQuantities = Object.fromEntries(sizeKeys.map(size => [
      size,
      Math.max(0, looseSizes[size] - groupedBundles)
    ]));
    const bundleQuantity = directBundles + groupedBundles;
    return {
      bundleQuantity,
      sizeQuantities,
      quantity: bundleQuantity * sizeCount + Object.values(sizeQuantities).reduce((sum, value) => sum + value, 0)
    };
  };

  const getReceiptLineAmount = (line: RepairFormLine) => {
    const breakdown = getReceiptLineBreakdown(line);
    const bundleAmount = breakdown.bundleQuantity * (parseFormattedNumber(line.bundleUnitPrice) || 0);
    const sizeAmount = Object.entries(breakdown.sizeQuantities).reduce((sum, [size, quantity]) => (
      sum + quantity * (parseFormattedNumber(line.sizeUnitPrices?.[size] || '') || 0)
    ), 0);
    return bundleAmount + sizeAmount;
  };

  const buildStock = (excludeRepairId?: number | string, monthFilter = reportMonth) => {
    const stock = new Map<string, StockCounts>();
    const getEntry = (productCode: string, productName = '', contract?: ContractItem) => {
      const code = String(productCode || '').trim();
      if (!code) return undefined;
      const key = code.toLowerCase();
      const sizeCount = getPiecesPerSet(code);
      let entry = stock.get(key);
      if (!entry) {
        entry = {
          productCode: code,
          productName: productName || productNames.get(key) || '',
          sizeCount,
          sizes: Object.fromEntries(Array.from({ length: sizeCount }, (_, index) => [`Cái ${index + 1}`, 0]))
        };
        stock.set(key, entry);
      } else if (!entry.productName && productName) {
        entry.productName = productName;
      }
      if (contract && sizeCount > 1) {
        getSizeKeys(contract, sizeCount).forEach((sizeKey, index) => {
          const canonical = `Cái ${index + 1}`;
          if (entry && sizeKey !== canonical && entry.sizes[canonical] === undefined) {
            entry.sizes[canonical] = 0;
          }
        });
      }
      return entry;
    };
    const addSizes = (entry: StockCounts | undefined, quantities: Record<string, number>, factor: number) => {
      if (!entry) return;
      Object.entries(quantities).forEach(([key, count]) => {
        entry.sizes[key] = (entry.sizes[key] || 0) + count * factor;
      });
    };
    const addBundles = (entry: StockCounts | undefined, count: number, factor: number) => {
      if (!entry || count <= 0) return;
      Object.keys(entry.sizes).forEach(size => {
        entry.sizes[size] += count * factor;
      });
    };
    const buckets = {
      opening: new Map<string, StockCounts>(),
      incoming: new Map<string, StockCounts>(),
      outgoing: new Map<string, StockCounts>()
    };
    products.forEach(product => getEntry(product.code, product.name));
    contracts.forEach(contract => getEntry(contract.productCode, contract.productName, contract));
    slips.filter(slip => slip.type !== 'XUAT_SUA_KHOAN')
      .forEach(slip => getEntry(slip.productCode, slip.productName));
    knittingExportSlips.forEach(slip => getEntry(slip.productCode, slip.productName));
    defectiveGoodsImportSlips.forEach(slip => getEntry(slip.productCode, slip.productName));

    const addMovement = (
      bucket: Map<string, StockCounts>,
      code: string,
      name: string,
      contract: ContractItem | undefined,
      quantities: Record<string, number>,
      bundles: number,
      ordinaryQuantity: number,
      direction: number
    ) => {
      const entry = getEntry(code, name, contract);
      if (!entry) return;
      const target = bucket.get(code.toLowerCase()) || {
        ...entry,
        sizes: Object.fromEntries(Object.keys(entry.sizes).map(size => [size, 0]))
      };
      if (entry.sizeCount > 1) {
        addBundles(target, bundles, direction);
        addSizes(target, quantities, direction);
      } else {
        target.sizes['Cái 1'] = (target.sizes['Cái 1'] || 0) + ordinaryQuantity * direction;
      }
      bucket.set(code.toLowerCase(), target);
    };

    contracts.forEach(contract => {
      const sizeCount = getPiecesPerSet(contract.productCode);
      (Array.isArray(contract.receivedGoodsLogs) ? contract.receivedGoodsLogs : []).filter(Boolean).forEach(log => {
        const month = String(log.receivedDate || '').slice(0, 7);
        const beforeMonth = Boolean(monthFilter && month < monthFilter);
        if (monthFilter && month > monthFilter) return;
        const bucket = beforeMonth ? buckets.opening : buckets.incoming;
        const sizes = normalizeSizeCounts(log.sizeQuantities, getSizeKeys(contract, sizeCount));
        const detailCount = Object.values(sizes).reduce((sum, count) => sum + count, 0);
        const explicitBundles = Number(log.sizeQuantities?.['Bộ']) || 0;
        const itemTypeOption = log.itemTypeOption || contract.itemTypeOption;
        const bundles = sizeCount > 1
          ? explicitBundles || (itemTypeOption === 'CA_HAI' || itemTypeOption === 'BO'
            ? Number(log.quantity) || 0
            : detailCount > 0 ? 0 : Number(log.quantity) || 0)
          : 0;
        addMovement(bucket, contract.productCode, contract.productName, contract, sizes, bundles, Number(log.quantity) || 0, 1);
      });
    });

    const sourceContracts = new Map(contracts.map(contract => [String(contract.id), contract]));
    knittingExportSlips.forEach(slip => {
      const month = String(slip.date || '').slice(0, 7);
      const beforeMonth = Boolean(monthFilter && month < monthFilter);
      if (monthFilter && month > monthFilter) return;
      const bucket = beforeMonth ? buckets.opening : buckets.outgoing;
      const contract = sourceContracts.get(String(slip.sourceContractId));
      const sizeCount = getPiecesPerSet(slip.productCode);
      const sizeKeys = getSizeKeys(contract, sizeCount);
      const goodSizes = normalizeSizeCounts(slip.goodSizeQuantities, sizeKeys);
      const defectiveSizes = normalizeSizeCounts(slip.defectiveSizeQuantities, sizeKeys);
      const combinedSizes = Object.fromEntries(Object.keys(goodSizes).map(size => [
        size,
        (goodSizes[size] || 0) + (defectiveSizes[size] || 0)
      ]));
      const bundles = (Number(slip.goodBundles) || 0) + (Number(slip.defectiveBundles) || 0);
      const legacyPieces = !slip.goodSizeQuantities && !slip.defectiveSizeQuantities
        ? (Number(slip.goodPieces) || 0) + (Number(slip.defectivePieces) || 0)
        : 0;
      const ordinaryExport = sizeCount === 1
        ? Object.values(slip.goodSizeQuantities || {}).reduce((sum, count) => sum + (Number(count) || 0), 0) +
          Object.values(slip.defectiveSizeQuantities || {}).reduce((sum, count) => sum + (Number(count) || 0), 0) ||
          (Number(slip.goodPieces) || 0) + (Number(slip.defectivePieces) || 0)
        : legacyPieces;
      if (sizeCount > 1 && legacyPieces > 0 && bundles === 0) {
        const eachSize = legacyPieces / sizeCount;
        Object.keys(combinedSizes).forEach(size => { combinedSizes[size] += eachSize; });
      }
      addMovement(bucket, slip.productCode, slip.productName, contract, combinedSizes, bundles, ordinaryExport, 1);
    });

    defectiveGoodsImportSlips.forEach(slip => {
      const month = String(slip.date || '').slice(0, 7);
      const beforeMonth = Boolean(monthFilter && month < monthFilter);
      if (monthFilter && month > monthFilter) return;
      const bucket = beforeMonth ? buckets.opening : buckets.incoming;
      const contract = sourceContracts.get(String(slip.sourceContractId));
      const sizeCount = getPiecesPerSet(slip.productCode);
      const sizeKeys = getSizeKeys(contract, sizeCount);
      const sizes = normalizeSizeCounts(slip.sizeQuantities, sizeKeys);
      addMovement(
        bucket,
        slip.productCode,
        slip.productName,
        contract,
        sizes,
        Number(slip.bundleQuantity) || 0,
        sizeCount === 1 ? Number(slip.quantity) || 0 : 0,
        1
      );
    });

    companyFrameReturnSlips.forEach(slip => {
      const month = String(slip.date || '').slice(0, 7);
      const beforeMonth = Boolean(monthFilter && month < monthFilter);
      if (monthFilter && month > monthFilter) return;
      const bucket = beforeMonth ? buckets.opening : buckets.outgoing;
      (slip.companyReturnLines || []).forEach(line => {
        const sizeCount = getPiecesPerSet(line.productCode);
        const rawSizes = line.sizeQuantities && typeof line.sizeQuantities === 'object'
          ? line.sizeQuantities
          : {};
        const hasSavedSizes = Object.values(rawSizes).some(quantity => Number(quantity) > 0);
        const legacyBundles = sizeCount > 1 && !hasSavedSizes
          ? Number(line.quantity) || 0
          : 0;
        const bundles = Number(line.bundleQuantity) || legacyBundles;
        const sizes = normalizeSizeCounts(rawSizes, getSizeKeys(
          contracts.find(contract =>
            String(contract.productCode || '').trim().toLowerCase() === line.productCode.trim().toLowerCase()
          ),
          sizeCount
        ));
        const looseQuantity = Object.values(sizes).reduce((sum, count) => sum + count, 0);
        const ordinaryQuantity = sizeCount === 1
          ? bundles + (hasSavedSizes ? looseQuantity : legacyBundles ? 0 : Number(line.quantity) || 0)
          : 0;
        addMovement(
          bucket,
          line.productCode,
          line.productName,
          contracts.find(contract =>
            String(contract.productCode || '').trim().toLowerCase() === line.productCode.trim().toLowerCase()
          ),
          sizes,
          bundles,
          ordinaryQuantity,
          1
        );
      });
    });

    repairSlips.filter(slip => String(slip.id) !== String(excludeRepairId ?? '')).forEach(slip => {
      const month = String(slip.date || '').slice(0, 7);
      const beforeMonth = Boolean(monthFilter && month < monthFilter);
      if (monthFilter && month > monthFilter) return;
      const bucket = beforeMonth ? buckets.opening : buckets.outgoing;
      getRepairLines(slip).forEach(line => {
        const contract = contracts.find(item =>
          String(item.productCode || '').trim().toLowerCase() === line.productCode.trim().toLowerCase()
        );
        const sizeCount = getPiecesPerSet(line.productCode);
        const sizes = normalizeSizeCounts(line.sizeQuantities, getSizeKeys(contract, sizeCount));
        addMovement(bucket, line.productCode, line.productName, contract, sizes, line.bundleQuantity, line.quantity, 1);
      });
    });

    repairReceiptSlips.forEach(slip => {
      const month = String(slip.date || '').slice(0, 7);
      const beforeMonth = Boolean(monthFilter && month < monthFilter);
      if (monthFilter && month > monthFilter) return;
      const bucket = beforeMonth ? buckets.opening : buckets.incoming;
      getRepairLines(slip).forEach(line => {
        const contract = contracts.find(item =>
          String(item.productCode || '').trim().toLowerCase() === line.productCode.trim().toLowerCase()
        );
        const sizeCount = getPiecesPerSet(line.productCode);
        const sizes = normalizeSizeCounts(line.sizeQuantities, getSizeKeys(contract, sizeCount));
        addMovement(bucket, line.productCode, line.productName, contract, sizes, line.bundleQuantity, line.quantity, 1);
      });
    });

    const result = Array.from(stock.values()).map(entry => {
      const key = entry.productCode.toLowerCase();
      const opening = buckets.opening.get(key)?.sizes || {};
      const incoming = buckets.incoming.get(key)?.sizes || {};
      const outgoing = buckets.outgoing.get(key)?.sizes || {};
      const endingSizes = Object.fromEntries(Object.keys(entry.sizes).map(size => [
        size,
        (opening[size] || 0) + (incoming[size] || 0) - (outgoing[size] || 0)
      ]));
      const openingTotal = Object.values(opening).reduce((sum, count) => sum + count, 0);
      const incomingTotal = Object.values(incoming).reduce((sum, count) => sum + count, 0);
      const outgoingTotal = Object.values(outgoing).reduce((sum, count) => sum + count, 0);
      return {
        ...entry,
        opening: openingTotal,
        incoming: incomingTotal,
        outgoing: outgoingTotal,
        endingSizes
      };
    }).sort((first, second) => first.productCode.localeCompare(second.productCode, 'vi', { numeric: true }));

    const current = new Map(result.map(row => [
      row.productCode.toLowerCase(),
      { ...row, sizes: row.endingSizes }
    ]));
    return { rows: result, current };
  };

  const report = buildStock();

  const selectedRepairSource = repairSlips.find(slip => String(slip.id) === receiptSourceSlipId);
  const sourceRepairLines = selectedRepairSource ? getRepairSourceLines(selectedRepairSource) : [];
  const {
    progress: receiptProgress,
    advanceApplied: priorAdvanceApplied,
    materialApplied: priorMaterialApplied
  } = selectedRepairSource
    ? getRepairReceiptProgress(selectedRepairSource.id, editingReceiptId)
    : {
      progress: new Map<string, { bundles: number; sizes: Record<string, number> }>(),
      advanceApplied: 0,
      materialApplied: 0
    };
  const receiptAdvanceAvailable = Math.max(
    0,
    (Number(selectedRepairSource?.repairAdvance) || 0) - priorAdvanceApplied
  );
  const receiptMaterialTotal = getAccompanyingMaterialAmount(selectedRepairSource?.accompanyingMaterials);
  const receiptMaterialAvailable = Math.max(0, receiptMaterialTotal - priorMaterialApplied);
  const receiptTotal = receiptLines.reduce((sum, line) => sum + getReceiptLineAmount(line), 0);
  const receiptMaterialDeducted = Math.min(receiptTotal, receiptMaterialAvailable);
  const receiptAdvanceDeducted = Math.min(
    Math.max(0, receiptTotal - receiptMaterialDeducted),
    receiptAdvanceAvailable
  );
  const receiptRemainingAmount = Math.max(0, receiptTotal - receiptMaterialDeducted - receiptAdvanceDeducted);
  const receiptSlipNo = (() => {
    const editingSlip = repairReceiptSlips.find(slip => String(slip.id) === String(editingReceiptId ?? ''));
    if (editingSlip) return editingSlip.slipNo;
    const year = receiptDate.slice(0, 4);
    const sequence = repairReceiptSlips.reduce((max, slip) => {
      const match = new RegExp(`^(\\d+)/${year}/NSK$`).exec(String(slip.slipNo || ''));
      return Math.max(max, Number(match?.[1]) || 0);
    }, 0) + 1;
    return `${String(sequence).padStart(2, '0')}/${year}/NSK`;
  })();

  const receiptOverageWarnings = receiptLines.flatMap(line => {
    if (!selectedRepairSource) return [];
    const code = line.productCode.trim().toLowerCase();
    const sourceLine = sourceRepairLines.find(item => item.productCode.trim().toLowerCase() === code);
    if (!sourceLine) return [`${line.productCode || 'Mã hàng'} không thuộc phiếu xuất sửa khoán đã chọn.`];
    const sizeCount = getPiecesPerSet(line.productCode);
    const prior = receiptProgress.get(code) || { bundles: 0, sizes: {} };
    const current = getReceiptLineBreakdown(line);
    const warnings: string[] = [];

    if (sizeCount === 1) {
      if (current.quantity + (prior.sizes['Cái 1'] || 0) > sourceLine.quantity + Number.EPSILON) {
        warnings.push(`Cảnh báo: Số lượng nhập lại ${line.productCode} lớn hơn số lượng đã xuất!`);
      }
      return warnings;
    }

    const sourceLooseCounts = Object.values(sourceLine.sizeQuantities || {});
    const bundlesPossibleFromLoose = sourceLooseCounts.length > 0 ? Math.min(...sourceLooseCounts) : 0;
    const maximumBundles = sourceLine.bundleQuantity + bundlesPossibleFromLoose;
    if (current.bundleQuantity + prior.bundles > maximumBundles + Number.EPSILON) {
      warnings.push(`Cảnh báo: Số bộ nhập lại của ${line.productCode} lớn hơn số bộ đã xuất hoặc có thể ghép từ hàng lẻ!`);
    }
    let totalExported = sourceLine.bundleQuantity * sizeCount;
    let totalAlreadyReceived = prior.bundles * sizeCount;
    let totalReceivedNow = current.bundleQuantity * sizeCount;
    for (let index = 0; index < sizeCount; index += 1) {
      const size = `Cái ${index + 1}`;
      const looseExported = sourceLine.sizeQuantities[size] || 0;
      const maximum = sourceLine.bundleQuantity + looseExported;
      const alreadyReceived = prior.bundles + (prior.sizes[size] || 0);
      const receivedNow = current.bundleQuantity + (current.sizeQuantities[size] || 0);
      totalExported += looseExported;
      totalAlreadyReceived += prior.sizes[size] || 0;
      totalReceivedNow += current.sizeQuantities[size] || 0;
      if (alreadyReceived + receivedNow > maximum + Number.EPSILON) {
        warnings.push(`Cảnh báo: Số lượng nhập lại của ${line.productCode} ${size} lớn hơn số lượng đã xuất!`);
      }
    }
    if (
      totalAlreadyReceived + totalReceivedNow > totalExported + Number.EPSILON &&
      warnings.length === 0
    ) {
      warnings.push(`Cảnh báo: Tổng số lượng nhập lại của ${line.productCode} lớn hơn tổng số lượng đã xuất!`);
    }
    return warnings;
  });

  const displayedReceiptDueDate = receiptRemainingAmount > 0
    ? receiptDueDate || getDefaultDueDate()
    : '';

  const handleReceiptSourceChange = (sourceId: string) => {
    repairReceiptDraft.clearDraft();
    setEditingReceiptId(null);
    setReceiptSourceSlipId(sourceId);
    setReceiptDate(getToday());
    setReceiptDueDate('');
    setReceiptPaymentNote('');
    setReceiptError('');
    const source = repairSlips.find(slip => String(slip.id) === sourceId);
    const sourceLines = source ? getRepairSourceLines(source) : [];
    setReceiptLines(sourceLines.map(line => {
      const sizeCount = getPiecesPerSet(line.productCode);
      return {
        id: `repair-receipt-line-${crypto.randomUUID()}`,
        productCode: line.productCode,
        productName: line.productName,
        quantity: '',
        bundleQuantity: '',
        sizeQuantities: Object.fromEntries(Array.from({ length: sizeCount }, (_, index) => [`Cái ${index + 1}`, ''])),
        bundleUnitPrice: formatNumberInput(String(line.bundleUnitPrice || 0)),
        sizeUnitPrices: Object.fromEntries(Array.from({ length: sizeCount }, (_, index) => {
          const size = `Cái ${index + 1}`;
          return [size, formatNumberInput(String(line.sizeUnitPrices?.[size] || 0))];
        })),
        itemTypeOption: line.bundleQuantity > 0 ? 'CA_HAI' : 'CAI'
      };
    }));
  };

  const startEditRepairReceipt = (slip: SlipItem) => {
    const sourceSlipId = String(slip.sourceRepairSlipId || '');
    const source = repairSlips.find(item => String(item.id) === sourceSlipId);
    if (!source) {
      setReceiptError('Không tìm thấy phiếu xuất sửa khoán đối ứng để sửa phiếu nhận này.');
      return;
    }
    setEditingReceiptId(slip.id);
    setReceiptSourceSlipId(sourceSlipId);
    setReceiptDate(slip.date || getToday());
    setReceiptDueDate(slip.repairDueDate || '');
    setReceiptPaymentNote(slip.repairPaymentNote || slip.note || '');
    setReceiptLines(getRepairLines(slip).map(line => ({
      id: line.id,
      productCode: line.productCode,
      productName: line.productName,
      quantity: String(getPiecesPerSet(line.productCode) === 1 ? line.quantity : 0),
      bundleQuantity: String(line.bundleQuantity || 0),
      sizeQuantities: Object.fromEntries(
        Object.entries(line.sizeQuantities || {}).map(([size, quantity]) => [size, String(quantity)])
      ),
      bundleUnitPrice: formatNumberInput(String(
        line.bundleUnitPrice ?? (Number(line.unitPrice) || 0) * getPiecesPerSet(line.productCode)
      )),
      sizeUnitPrices: Object.fromEntries(Array.from(
        { length: getPiecesPerSet(line.productCode) },
        (_, index) => {
          const size = `Cái ${index + 1}`;
          return [size, formatNumberInput(String(line.sizeUnitPrices?.[size] ?? line.unitPrice ?? 0))];
        }
      )),
      itemTypeOption: line.bundleQuantity > 0 ? 'CA_HAI' : 'CAI'
    })));
    setReceiptError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteRepairReceipt = (slip: SlipItem) => {
    if (!window.confirm(`Xóa phiếu nhận hàng sửa khoán ${slip.slipNo}? Số liệu tồn kho và lũy kế liên quan sẽ được cập nhật lại.`)) return;
    deleteSlip(slip.id);
    if (String(editingReceiptId) === String(slip.id)) handleReceiptSourceChange('');
  };

  const updateReceiptLine = (id: string, updates: Partial<RepairFormLine>) => {
    setReceiptLines(current => current.map(line => line.id === id ? { ...line, ...updates } : line));
  };

  const handleSaveRepairReceipt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRepairSource || !receiptDate || receiptLines.length === 0) {
      setReceiptError('Vui lòng chọn phiếu xuất sửa khoán và nhập ngày nhận hàng.');
      return;
    }
    if (receiptOverageWarnings.length > 0) {
      setReceiptError(receiptOverageWarnings[0]);
      return;
    }
    const parsedLines = receiptLines.map(line => {
      const sizeCount = getPiecesPerSet(line.productCode);
      const breakdown = getReceiptLineBreakdown(line);
      const { bundleQuantity, sizeQuantities, quantity } = breakdown;
      const sizeUnitPrices = Object.fromEntries(Array.from({ length: sizeCount }, (_, index) => {
        const size = `Cái ${index + 1}`;
        return [size, parseFormattedNumber(line.sizeUnitPrices[size] || '') || 0];
      }));
      const bundleUnitPrice = parseFormattedNumber(line.bundleUnitPrice || '') || 0;
      const amount = getReceiptLineAmount(line);
      return {
        ...line,
        sizeCount,
        quantity,
        bundleQuantity,
        sizeQuantities,
        sizeUnitPrices,
        bundleUnitPrice,
        unitPrice: sizeUnitPrices['Cái 1'] || 0,
        amount
      };
    });
    if (parsedLines.some(line =>
      line.quantity < 0 ||
      line.bundleQuantity < 0 ||
      Object.values(line.sizeQuantities).some(value => !Number.isFinite(value) || value < 0) ||
      line.quantity <= 0
    )) {
      setReceiptError('Vui lòng nhập số lượng nhận và đơn giá hợp lệ cho từng bộ/size có phát sinh.');
      return;
    }
    const sourceLinesByCode = new Map(sourceRepairLines.map(line => [line.productCode.trim().toLowerCase(), line]));
    const overReceived = parsedLines.some(line => {
      const code = line.productCode.trim().toLowerCase();
      const sourceLine = sourceLinesByCode.get(code);
      if (!sourceLine) return true;
      const previous = receiptProgress.get(code) || { bundles: 0, sizes: {} };
      if (line.sizeCount === 1) return line.quantity + previous.sizes['Cái 1'] > sourceLine.quantity + Number.EPSILON;
      return Array.from({ length: line.sizeCount }, (_, index) => {
        const size = `Cái ${index + 1}`;
        const exported = sourceLine.bundleQuantity + (sourceLine.sizeQuantities[size] || 0);
        const alreadyReceived = previous.bundles + (previous.sizes[size] || 0);
        const receivedNow = line.bundleQuantity + (line.sizeQuantities[size] || 0);
        return alreadyReceived + receivedNow > exported + Number.EPSILON;
      }).some(Boolean);
    });
    if (overReceived) {
      setReceiptError('Số lượng nhận vượt quá số lượng đã xuất sửa còn thiếu theo bộ hoặc size.');
      return;
    }

    const total = parsedLines.reduce((sum, line) => sum + line.amount, 0);
    const materialToApply = Math.min(total, receiptMaterialAvailable);
    const advanceToApply = Math.min(Math.max(0, total - materialToApply), receiptAdvanceAvailable);
    const remaining = Math.max(0, total - materialToApply - advanceToApply);
    const repairLines: RepairStockLine[] = parsedLines.map(line => ({
      id: line.id,
      productCode: line.productCode,
      productName: line.productName,
      quantity: line.quantity,
      bundleQuantity: line.bundleQuantity,
      sizeQuantities: line.sizeQuantities,
      unitPrice: line.unitPrice,
      bundleUnitPrice: line.bundleUnitPrice,
      sizeUnitPrices: line.sizeUnitPrices,
      amount: line.amount
    }));
    const workerName = selectedRepairSource.repairWorkerName || selectedRepairSource.partnerName || selectedRepairSource.partner || '';
    const slip: SlipItem = {
      id: editingReceiptId ?? `NSK-${crypto.randomUUID()}`,
      type: 'NHAN_SUA_KHOAN',
      slipNo: receiptSlipNo,
      date: receiptDate,
      contractNo: selectedRepairSource.slipNo,
      sourceRepairSlipId: selectedRepairSource.id,
      productCode: repairLines.length === 1 ? repairLines[0].productCode : 'Nhiều mã hàng',
      productName: repairLines.length === 1 ? repairLines[0].productName : `${repairLines.length} mã hàng`,
      quantity: repairLines.reduce((sum, line) => sum + line.quantity, 0),
      unit: 'Cái',
      partnerName: workerName,
      partner: workerName,
      repairWorkerName: workerName,
      repairWorkerZalo: selectedRepairSource.repairWorkerZalo || '',
      note: receiptPaymentNote.trim(),
      repairLines,
      repairTotal: total,
      repairMaterialDeducted: materialToApply,
      repairAdvanceApplied: advanceToApply,
      repairRemainingAmount: remaining,
      repairDueDate: remaining > 0 ? displayedReceiptDueDate : '',
      repairPaymentNote: receiptPaymentNote.trim()
    };
    if (editingReceiptId !== null) updateSlip(slip);
    else addSlip(slip);
    repairReceiptDraft.clearDraft();
    handleReceiptSourceChange('');
    setReceiptDate(getToday());
  };

  const currentStockForCode = (code: string, excludingId?: number | string) => {
    const key = code.trim().toLowerCase();
    const availableStock = buildStock(excludingId, '').current.get(key);
    return availableStock?.sizes || {};
  };

  const updateRepairLineCode = (line: RepairFormLine, productCode: string) => {
    const productName = productNames.get(productCode.trim().toLowerCase()) || '';
    const sizeCount = getPiecesPerSet(productCode);
    const linkedSource = defectiveGoodsImportSlips.find(source =>
      String(source.id) === String(line.sourceDefectiveGoodsImportSlipId || '')
    );
    updateLine(line.id, {
      productCode,
      productName,
      sourceDefectiveGoodsImportSlipId: linkedSource &&
        linkedSource.productCode.trim().toLowerCase() === productCode.trim().toLowerCase()
        ? line.sourceDefectiveGoodsImportSlipId
        : undefined,
      sizeQuantities: Object.fromEntries(Array.from({ length: sizeCount }, (_, index) => [
        `Cái ${index + 1}`,
        line.sizeQuantities[`Cái ${index + 1}`] || ''
      ])),
      sizeUnitPrices: Object.fromEntries(Array.from({ length: sizeCount }, (_, index) => [
        `Cái ${index + 1}`,
        line.sizeUnitPrices[`Cái ${index + 1}`] || ''
      ]))
    });
  };

  const resetForm = () => {
    repairDraft.clearDraft();
    setDate(getToday());
    setAdvance('');
    setReason('');
    setRepairWorkerName('');
    setRepairWorkerZalo('');
    setLines([createRepairLine()]);
    setAccompanyingMaterials([createAccompanyingMaterialRow()]);
    setEditingSlipId(null);
    setError('');
  };

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const activeLines = lines.filter(line => line.productCode.trim());
    if (!date || !repairWorkerName.trim() || activeLines.length === 0) {
      setError('Vui lòng nhập ngày, tên thợ sửa khoán và thêm ít nhất một mã hàng.');
      return;
    }
    const zaloDigits = repairWorkerZalo.replace(/\D/g, '');
    if (zaloDigits && !/^0\d{9}$/.test(zaloDigits)) {
      setError('Số điện thoại Zalo không hợp lệ. Vui lòng nhập đủ 10 chữ số và bắt đầu bằng số 0.');
      return;
    }
    const materialRowsWithInput = accompanyingMaterials.filter(row =>
      row.query.trim() || row.quantity.trim() || row.unitPrice.trim() || row.materialId !== null
    );
    if (materialRowsWithInput.some(row =>
      row.materialId === null ||
      !Number.isFinite(Number(row.quantity)) || Number(row.quantity) <= 0 ||
      !row.unitPrice.trim() ||
      !Number.isFinite(parseFormattedNumber(row.unitPrice)) ||
      parseFormattedNumber(row.unitPrice) < 0
    )) {
      setError('Vui lòng chọn nguyên phụ liệu, nhập số lượng lớn hơn 0 và đơn giá hợp lệ cho từng dòng.');
      return;
    }
    const savedAccompanyingMaterials: AccompanyingMaterial[] = materialRowsWithInput.flatMap(row => {
      if (row.materialId === null) return [];
      const material = materials.find((item: CategoryItem) => item.id === row.materialId);
      const quantity = Number(row.quantity);
      const unitPrice = parseFormattedNumber(row.unitPrice);
      return [{
        materialId: row.materialId,
        materialCode: material?.code || row.materialCode,
        materialName: material?.name || row.materialName,
        quantity,
        unitPrice,
        amount: quantity * unitPrice,
        unit: row.unit
      }];
    });
    const invalidPrices = activeLines.some(line => {
      const piecesPerSet = getPiecesPerSet(line.productCode);
      const hasBundle = piecesPerSet > 1 && line.itemTypeOption === 'CA_HAI' && Number(line.bundleQuantity) > 0;
      const hasSingleSizeQuantity = piecesPerSet === 1 && Number(line.quantity) > 0;
      const hasUnpricedSize = piecesPerSet > 1 && Object.entries(line.sizeQuantities).some(
        ([size, quantity]) => Number(quantity) > 0 &&
          (!line.sizeUnitPrices[size]?.trim() ||
            !Number.isFinite(parseFormattedNumber(line.sizeUnitPrices[size])) ||
            parseFormattedNumber(line.sizeUnitPrices[size]) < 0)
      );
      const singleSizePrice = parseFormattedNumber(line.sizeUnitPrices['Cái 1'] || '');
      const bundlePrice = parseFormattedNumber(line.bundleUnitPrice || '');
      return hasUnpricedSize ||
        (hasSingleSizeQuantity && (!line.sizeUnitPrices['Cái 1']?.trim() || !Number.isFinite(singleSizePrice) || singleSizePrice < 0)) ||
        (hasBundle && (!line.bundleUnitPrice.trim() || !Number.isFinite(bundlePrice) || bundlePrice < 0));
    });
    if (invalidPrices) {
      setError('Vui lòng nhập đơn giá hợp lệ cho từng bộ nguyên và size có số lượng xuất.');
      return;
    }
    const parsedLines: RepairStockLine[] = activeLines.map(line => {
      const piecesPerSet = getPiecesPerSet(line.productCode);
      const quantity = Number(line.quantity) || 0;
      const bundleQuantity = piecesPerSet > 1 && line.itemTypeOption === 'CA_HAI'
        ? Number(line.bundleQuantity) || 0
        : 0;
      const sizeQuantities = Object.fromEntries(Object.entries(line.sizeQuantities)
        .map(([size, value]) => [size, Number(value) || 0]));
      const physicalQuantity = piecesPerSet > 1
        ? bundleQuantity * piecesPerSet + Object.values(sizeQuantities).reduce((sum, value) => sum + value, 0)
        : quantity;
      const bundleUnitPrice = parseFormattedNumber(line.bundleUnitPrice) || 0;
      const sizeUnitPrices = Object.fromEntries(Array.from({ length: piecesPerSet }, (_, index) => {
        const size = `Cái ${index + 1}`;
        return [size, parseFormattedNumber(line.sizeUnitPrices[size] || '') || 0];
      }));
      const unitPrice = sizeUnitPrices['Cái 1'] || 0;
      const amount = (bundleQuantity * bundleUnitPrice) +
        (piecesPerSet === 1
          ? quantity * unitPrice
          : Object.entries(sizeQuantities).reduce((sum, [size, sizeQuantity]) => (
            sum + sizeQuantity * (sizeUnitPrices[size] || 0)
          ), 0));
      return {
        id: line.id,
        productCode: line.productCode.trim(),
        productName: productNames.get(line.productCode.trim().toLowerCase()) || line.productName,
        sourceDefectiveGoodsImportSlipId: line.sourceDefectiveGoodsImportSlipId || undefined,
        quantity: piecesPerSet === 1 ? quantity : physicalQuantity,
        bundleQuantity,
        sizeQuantities,
        unitPrice,
        bundleUnitPrice,
        sizeUnitPrices,
        amount
      };
    });
    if (parsedLines.some(line =>
      !Number.isFinite(line.unitPrice) || line.unitPrice < 0 ||
      !Number.isFinite(line.bundleUnitPrice) || (line.bundleUnitPrice || 0) < 0 ||
      Object.values(line.sizeUnitPrices || {}).some(value => !Number.isFinite(value) || value < 0) ||
      line.quantity < 0 || line.bundleQuantity < 0 ||
      Object.values(line.sizeQuantities).some(value => !Number.isFinite(value) || value < 0) ||
      (line.quantity <= 0 && line.bundleQuantity <= 0 &&
        Object.values(line.sizeQuantities).every(value => value <= 0))
    )) {
      setError('Số lượng và đơn giá sửa phải là số hợp lệ, số lượng cần lớn hơn 0.');
      return;
    }
    if (parsedLines.some(line =>
      line.sourceDefectiveGoodsImportSlipId &&
      !defectiveGoodsImportSlips.some(source =>
        String(source.id) === String(line.sourceDefectiveGoodsImportSlipId) &&
        source.productCode.trim().toLowerCase() === line.productCode.trim().toLowerCase()
      )
    )) {
      setError('Một nguồn phiếu nhập hàng loại không còn tồn tại hoặc không khớp mã hàng. Vui lòng chọn lại nguồn.');
      return;
    }

    const requiredByCode = new Map<string, Record<string, number>>();
    parsedLines.forEach(line => {
      const code = line.productCode.toLowerCase();
      const sizeCount = getPiecesPerSet(line.productCode);
      const required = requiredByCode.get(code) || Object.fromEntries(
        Array.from({ length: sizeCount }, (_, index) => [`Cái ${index + 1}`, 0])
      );
      if (sizeCount > 1) {
        Object.keys(required).forEach(size => { required[size] += line.bundleQuantity; });
        Object.entries(line.sizeQuantities).forEach(([size, quantity]) => {
          required[size] = (required[size] || 0) + quantity;
        });
      } else {
        required['Cái 1'] = (required['Cái 1'] || 0) + line.quantity;
      }
      requiredByCode.set(code, required);
    });
    for (const [code, required] of requiredByCode) {
      const available = currentStockForCode(code, editingSlipId ?? undefined);
      if (Object.entries(required).some(([size, quantity]) => quantity > (available[size] || 0) + Number.EPSILON)) {
        setError(`Mã hàng ${code.toUpperCase()} không đủ tồn theo size để xuất sửa khoán.`);
        return;
      }
    }
    const requiredByImport = new Map<string, { bundles: number; sizes: Record<string, number>; source: DefectiveGoodsImportSlip }>();
    parsedLines.forEach(line => {
      if (!line.sourceDefectiveGoodsImportSlipId) return;
      const source = defectiveGoodsImportSlips.find(item =>
        String(item.id) === String(line.sourceDefectiveGoodsImportSlipId)
      );
      if (!source || source.productCode.trim().toLowerCase() !== line.productCode.trim().toLowerCase()) return;
      const sizeCount = getPiecesPerSet(line.productCode);
      const key = String(source.id);
      const required = requiredByImport.get(key) || {
        bundles: 0,
        sizes: Object.fromEntries(Array.from({ length: sizeCount }, (_, index) => [`Cái ${index + 1}`, 0])),
        source
      };
      required.bundles += Number(line.bundleQuantity) || 0;
      const lineSizes = normalizeSizeCounts(line.sizeQuantities, Object.keys(required.sizes));
      Object.keys(required.sizes).forEach(size => {
        required.sizes[size] += lineSizes[size] || 0;
      });
      if (sizeCount === 1 && Object.values(line.sizeQuantities).every(quantity => Number(quantity) === 0)) {
        required.sizes['Cái 1'] += Number(line.quantity) || 0;
      }
      requiredByImport.set(key, required);
    });
    for (const { source, bundles, sizes } of requiredByImport.values()) {
      const available = getDefectiveImportRepairAvailability(source, editingSlipId ?? undefined);
      if (bundles > available.bundles + Number.EPSILON ||
        Object.entries(sizes).some(([size, quantity]) => quantity > (available.sizes[size] || 0) + Number.EPSILON)) {
        setError(`Phiếu nhập hàng loại ${source.slipNo} không đủ số lượng theo bộ/size đã chọn.`);
        return;
      }
    }
    const parsedAdvance = parseFormattedNumber(advance) || 0;
    if (!Number.isFinite(parsedAdvance) || parsedAdvance < 0) {
      setError('Tạm ứng phải là số hợp lệ, không được âm.');
      return;
    }
    const total = parsedLines.reduce((sum, line) => sum + line.amount, 0);
    const slip: SlipItem = {
      id: editingSlipId ?? `SK-${crypto.randomUUID()}`,
      type: 'XUAT_SUA_KHOAN',
      slipNo: editingSlipId
        ? repairSlips.find(item => String(item.id) === String(editingSlipId))?.slipNo || newSlipNo
        : newSlipNo,
      date,
      contractNo: '',
      productCode: parsedLines.length === 1 ? parsedLines[0].productCode : 'Nhiều mã hàng',
      productName: parsedLines.length === 1 ? parsedLines[0].productName : `${parsedLines.length} mã hàng`,
      quantity: parsedLines.reduce((sum, line) => sum + line.quantity, 0),
      unit: 'Cái',
      partnerName: repairWorkerName.trim(),
      partner: repairWorkerName.trim(),
      repairWorkerName: repairWorkerName.trim(),
      repairWorkerZalo: repairWorkerZalo.trim(),
      note: reason.trim(),
      repairLines: parsedLines,
      repairTotal: total,
      repairAdvance: parsedAdvance,
      accompanyingMaterials: savedAccompanyingMaterials
    };
    if (editingSlipId !== null) updateSlip(slip);
    else addSlip(slip);
    resetForm();
  };

  const startEdit = (slip: SlipItem) => {
    const savedLines = getRepairLines(slip);
    setLines(savedLines.map(line => ({
      id: line.id,
      productCode: line.productCode,
      productName: line.productName,
      quantity: String(getPiecesPerSet(line.productCode) === 1 ? line.quantity : 0),
      bundleQuantity: String(line.bundleQuantity || 0),
      sizeQuantities: Object.fromEntries(Object.entries(line.sizeQuantities || {}).map(([size, quantity]) => [size, String(quantity)])),
      bundleUnitPrice: formatNumberInput(String(
        line.bundleUnitPrice ??
        (Number(line.unitPrice || 0) * (line.bundleQuantity > 0 ? getPiecesPerSet(line.productCode) : 1))
      )),
      sizeUnitPrices: Object.fromEntries(Array.from(
        { length: getPiecesPerSet(line.productCode) },
        (_, index) => {
          const size = `Cái ${index + 1}`;
          return [size, formatNumberInput(String(line.sizeUnitPrices?.[size] ?? line.unitPrice ?? 0))];
        }
      )),
      itemTypeOption: line.bundleQuantity > 0 ? 'CA_HAI' : 'CAI',
      sourceDefectiveGoodsImportSlipId: line.sourceDefectiveGoodsImportSlipId === undefined
        ? undefined
        : String(line.sourceDefectiveGoodsImportSlipId)
    })));
    setDate(slip.date || getToday());
    setAdvance(formatNumberInput(String(slip.repairAdvance || 0)));
    setRepairWorkerName(slip.repairWorkerName || slip.partnerName || slip.partner || '');
    setRepairWorkerZalo(slip.repairWorkerZalo || '');
    setReason(slip.note || '');
    setAccompanyingMaterials(Array.isArray(slip.accompanyingMaterials) && slip.accompanyingMaterials.length
      ? slip.accompanyingMaterials.map((material, index) => ({
        id: `${slip.id}-material-${index}`,
        materialId: material.materialId,
        materialCode: material.materialCode,
        materialName: material.materialName,
        query: `${material.materialCode} - ${material.materialName}`,
        unit: material.unit,
        quantity: String(material.quantity),
        unitPrice: formatNumberInput(String(material.unitPrice ?? 0)),
        isDropdownOpen: false
      }))
      : [createAccompanyingMaterialRow()]);
    setEditingSlipId(slip.id);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (slip: SlipItem) => {
    if (!window.confirm(`Xóa phiếu sửa khoán ${slip.slipNo}?`)) return;
    deleteSlip(slip.id);
    if (String(editingSlipId) === String(slip.id)) resetForm();
  };

  const handleSendToZalo = async (slip: SlipItem) => {
    setShareSlip(slip);
    const sourceSlip = repairSlips.find(item => String(item.id) === String(slip.sourceRepairSlipId || ''));
    const phone = String(slip.repairWorkerZalo || sourceSlip?.repairWorkerZalo || '').replace(/\D/g, '');
    const zaloUrl = phone ? `https://zalo.me/${phone}` : 'https://chat.zalo.me/';
    window.open(zaloUrl, '_blank', 'noopener,noreferrer');
    let messageCopied = false;
    try {
      await navigator.clipboard.writeText(getRepairSlipMessage(slip));
      messageCopied = true;
    } catch (clipboardError) {
      console.error('Không thể sao chép nội dung phiếu sửa khoán:', clipboardError);
    }
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (!sharePrintRef.current) throw new Error('Không tìm thấy nội dung phiếu để xuất ảnh.');
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(sharePrintRef.current, {
        scale: Math.max(2, window.devicePixelRatio || 1),
        backgroundColor: '#ffffff',
        logging: false
      });
      const imageBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => blob
          ? resolve(blob)
          : reject(new Error('Trình duyệt không tạo được ảnh PNG từ phiếu.')), 'image/png');
      });
      const imageUrl = URL.createObjectURL(imageBlob);
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `${slip.slipNo.replace(/[^\w-]+/g, '_')}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1000);
      window.alert(messageCopied
        ? 'Đã mở Zalo, sao chép nội dung phiếu và tải ảnh PNG xuống. Hãy dán nội dung, sau đó đính kèm ảnh để gửi.'
        : 'Đã mở Zalo và tải ảnh phiếu PNG xuống. Không thể tự sao chép nội dung; vui lòng sao chép nội dung phiếu từ bản in/lịch sử.');
    } catch (shareError) {
      console.error('Không thể tạo ảnh phiếu sửa khoán:', shareError);
      window.alert(shareError instanceof Error ? shareError.message : 'Không thể tạo ảnh phiếu sửa khoán.');
    }
  };

  const getRepairSlipMessage = (slip: SlipItem) => {
    if (slip.type === 'NHAN_SUA_KHOAN') {
      const sourceSlip = repairSlips.find(item => String(item.id) === String(slip.sourceRepairSlipId || ''));
      const workerName = slip.repairWorkerName || slip.partnerName || slip.partner || sourceSlip?.repairWorkerName || '—';
      const workerPhone = slip.repairWorkerZalo || sourceSlip?.repairWorkerZalo || '—';
      const receiptDetails = getRepairLines(slip).map(line => {
        const piecesPerSet = getPiecesPerSet(line.productCode);
        const quantities = [
          ...(piecesPerSet > 1 && Number(line.bundleQuantity) > 0
            ? [`${formatNumber(Number(line.bundleQuantity))} bộ`]
            : []),
          ...Object.entries(line.sizeQuantities || {})
            .filter(([, quantity]) => Number(quantity) > 0)
            .map(([size, quantity]) => `${formatNumber(Number(quantity))} cái ${size.replace('Cái ', 'Size ')}`),
          ...(piecesPerSet === 1 && !Object.values(line.sizeQuantities || {}).some(value => Number(value) > 0)
            ? [`${formatNumber(Number(line.quantity) || 0)} cái Size 1`]
            : [])
        ];
        return `${line.productCode}${line.productName ? ` - ${line.productName}` : ''}: ${quantities.join(' + ') || '—'} · ${formatCurrency(getRepairLineAmount(line))}`;
      });
      const sourceMaterialTotal = getAccompanyingMaterialAmount(sourceSlip?.accompanyingMaterials);
      return [
        'PHIẾU NHẬN HÀNG SỬA KHOÁN',
        `Số phiếu: ${slip.slipNo}`,
        `Ngày nhận: ${slip.date}`,
        `Phiếu xuất đối ứng: ${sourceSlip?.slipNo || slip.contractNo || '—'}`,
        `Thợ sửa: ${workerName}`,
        `Zalo: ${workerPhone}`,
        'Số lượng nhận:',
        ...receiptDetails,
        `Tiền công: ${formatCurrency(Number(slip.repairTotal) || 0)}`,
        `Tổng nguyên phụ liệu theo phiếu xuất: ${formatCurrency(sourceMaterialTotal)}`,
        `Nguyên phụ liệu đã trừ: ${formatCurrency(Number(slip.repairMaterialDeducted) || 0)} / ${formatCurrency(sourceMaterialTotal)}`,
        `Tạm ứng đã trừ: ${formatCurrency(Number(slip.repairAdvanceApplied) || 0)}`,
        `Còn phải thanh toán: ${formatCurrency(Number(slip.repairRemainingAmount) || 0)}`,
        `Hạn trả nợ: ${slip.repairDueDate || '—'}`,
        `Ghi chú: ${slip.repairPaymentNote || slip.note || '—'}`
      ].join('\n');
    }

    const details = getRepairLines(slip).map(line => {
      const piecesPerSet = getPiecesPerSet(line.productCode);
      const sizeDetails = Object.entries(line.sizeQuantities || {})
        .filter(([, quantity]) => Number(quantity) > 0)
        .map(([size, quantity]) => `${formatNumber(Number(quantity))} cái ${size}`)
        .join(', ');
      const bundles = Number(line.bundleQuantity) > 0
        ? `${formatNumber(Number(line.bundleQuantity))} bộ`
        : '';
      const priceDetails = [
        Number(line.bundleQuantity) > 0
          ? `Giá bộ: ${formatCurrency(Number(line.bundleUnitPrice ?? line.unitPrice) || 0)}`
          : '',
        ...Object.entries(line.sizeQuantities || {})
          .filter(([, quantity]) => Number(quantity) > 0)
          .map(([size]) => `${size}: ${formatCurrency(Number(line.sizeUnitPrices?.[size] ?? line.unitPrice) || 0)}/cái`)
      ].filter(Boolean);
      return [
        `${line.productCode}${line.productName ? ` - ${line.productName}` : ''}`,
        [bundles, sizeDetails || (piecesPerSet === 1 ? `${formatNumber(line.quantity)} cái` : '')]
          .filter(Boolean)
          .join(' + '),
        `Đơn giá: ${priceDetails.join(' · ') || `${formatCurrency(Number(line.unitPrice) || 0)}/cái`}`,
        `Tiền công: ${formatCurrency(getRepairLineAmount(line))}`
      ].join('\n');
    });
    const materialDetails = (Array.isArray(slip.accompanyingMaterials) ? slip.accompanyingMaterials : [])
      .map(material =>
        `${material.materialName || material.materialCode}: ${formatNumber(Number(material.quantity) || 0)} ${material.unit} × ${formatCurrency(Number(material.unitPrice) || 0)} = ${formatCurrency(getAccompanyingMaterialAmount([material]))}`
      );
    return [
      'PHIẾU XUẤT SỬA KHOÁN BÊN NGOÀI',
      `Số phiếu: ${slip.slipNo}`,
      `Ngày: ${slip.date}`,
      `Người nhận sửa: ${slip.repairWorkerName || slip.partnerName || slip.partner || '—'}`,
      `Zalo: ${slip.repairWorkerZalo || '—'}`,
      'Chi tiết:',
      ...details,
      'Nguyên phụ liệu kèm theo:',
      ...(materialDetails.length ? materialDetails : ['Không có']),
      `Tổng tiền công: ${formatCurrency(Number(slip.repairTotal) || 0)}`,
      `Tổng nguyên phụ liệu: ${formatCurrency(getAccompanyingMaterialAmount(slip.accompanyingMaterials))}`,
      `Tạm ứng: ${formatCurrency(Number(slip.repairAdvance) || 0)}`,
      `Ghi chú: ${slip.note || '—'}`
    ].join('\n');
  };

  const handlePrintSlip = (slip: SlipItem) => {
    setError('');
    setShareSlip(slip);
  };

  const handlePrintPreview = () => {
    if (!sharePrintRef.current) {
      setError('Không tìm thấy nội dung phiếu để in.');
      return;
    }
    window.print();
  };

  const handleExportRepairPng = async () => {
    if (!shareSlip || !sharePrintRef.current) {
      setError('Không tìm thấy nội dung phiếu để xuất ảnh.');
      return;
    }
    setExportingRepairImage(true);
    setError('');
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(sharePrintRef.current, {
        scale: Math.max(2, window.devicePixelRatio || 1),
        backgroundColor: '#ffffff',
        logging: false
      });
      const imageBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => blob
          ? resolve(blob)
          : reject(new Error('Trình duyệt không tạo được ảnh PNG từ phiếu.')), 'image/png');
      });
      const imageUrl = URL.createObjectURL(imageBlob);
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `${String(shareSlip.slipNo || 'phieu-sua-khoan').replace(/[^\w-]+/g, '_')}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1000);
    } catch (exportError) {
      console.error('Không thể xuất ảnh phiếu sửa khoán:', exportError);
      setError(exportError instanceof Error ? exportError.message : 'Không thể tạo ảnh PNG phiếu sửa khoán.');
    } finally {
      setExportingRepairImage(false);
    }
  };

  const tableHeaderStyle = {
    padding: '9px',
    backgroundColor: '#f1f5f9',
    color: '#334155',
    textAlign: 'left' as const,
    whiteSpace: 'nowrap' as const
  };
  const repairLabourTotal = lines.reduce((sum, line) => sum + getRepairFormLineAmount(line), 0);
  const repairMaterialTotal = accompanyingMaterials.reduce(
    (sum, row) => sum + (Number(row.quantity) || 0) * (parseFormattedNumber(row.unitPrice) || 0),
    0
  );
  const repairAdvanceTotal = parseFormattedNumber(advance) || 0;
  const repairSettlementPreview = Math.max(0, repairLabourTotal - repairMaterialTotal - repairAdvanceTotal);
  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <nav aria-label="Điều hướng Báo cáo NXT và sửa khoán" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '9px', backgroundColor: '#f8fafc' }}>
        {([
          ['stock', 'Báo Cáo Nhập - Xuất - Tồn'],
          ['repair-export', 'Phiếu Xuất Sửa Khoán'],
          ['repair-receipt', 'Phiếu Nhập Hàng Sửa']
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeReportTab === tab}
            onClick={() => setActiveReportTab(tab)}
            style={{
              padding: '9px 14px',
              border: 0,
              borderRadius: '6px',
              backgroundColor: activeReportTab === tab ? '#0f766e' : 'transparent',
              color: activeReportTab === tab ? '#fff' : '#334155',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {activeReportTab === 'stock' && (
      <section style={{ padding: '16px', border: '1px solid #cbd5e1', borderRadius: '9px', backgroundColor: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
          <div>
            <h3 style={{ margin: 0, color: '#1e293b', fontSize: '16px' }}>📊 Báo Cáo Nhập - Xuất - Tồn</h3>
            <small style={{ color: '#64748b' }}>Số liệu Nhập/Xuất theo tháng; tồn đầu là số dư trước tháng được chọn.</small>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700 }}>
            Tháng báo cáo
            <input type="month" value={reportMonth} onChange={event => setReportMonth(event.target.value)} style={inputStyle} />
          </label>
        </div>
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '7px' }}>
          <table style={{ width: '100%', minWidth: '1100px', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '12px' }}>
            <colgroup>
              <col style={{ width: '12%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead>
              <tr>
                {['Mã Hàng', 'Tên Hàng', 'Tồn Đầu', 'Nhập', 'Xuất', 'Tồn Cuối (Bộ)', 'Lẻ Của Bộ (Cái)', 'Ghi Chú'].map((label, index) => (
                  <th
                    key={label}
                    scope="col"
                    style={{
                      ...tableHeaderStyle,
                      textAlign: index >= 2 && index <= 6 ? 'right' : 'left'
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '18px', textAlign: 'center', color: '#64748b' }}>Chưa có dữ liệu nhập, xuất hoặc tồn.</td></tr>
              ) : report.rows.map(row => {
                const sizes = Object.entries(row.endingSizes);
                const allEnding = sizes.reduce((sum, [, count]) => sum + count, 0);
                const hasSet = row.sizeCount > 1;
                const completeSets = hasSet ? Math.max(0, Math.floor(Math.min(...sizes.map(([, count]) => count)) + Number.EPSILON)) : 0;
                const loose = hasSet ? Object.fromEntries(sizes.map(([size, count]) => [size, Math.max(0, count - completeSets)])) : {};
                const looseCount = Object.values(loose).reduce((sum, count) => sum + count, 0);
                const looseDescription = Object.entries(loose)
                  .filter(([, count]) => count > 0)
                  .map(([size, count]) => `${formatNumber(count)} cái (Size ${size.replace('Cái ', '')})`)
                  .join(', ');
                const unit = hasSet ? 'Bộ' : 'Cái';
                return (
                  <tr key={row.productCode} style={{ borderTop: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '9px', fontWeight: 700 }}>{row.productCode}</td>
                    <td style={{ padding: '9px' }}>{row.productName || '—'}</td>
                    <td style={{ padding: '9px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(row.opening / row.sizeCount)} {unit}</td>
                    <td style={{ padding: '9px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(row.incoming / row.sizeCount)} {unit}</td>
                    <td style={{ padding: '9px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(row.outgoing / row.sizeCount)} {unit}</td>
                    <td style={{ padding: '9px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{hasSet ? `${formatNumber(completeSets)} Bộ` : `${formatNumber(allEnding)} Cái`}</td>
                    <td style={{ padding: '9px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{hasSet ? formatNumber(looseCount) : '—'}</td>
                    <td style={{ padding: '9px', textAlign: 'left', color: looseDescription ? '#b45309' : '#64748b', overflowWrap: 'anywhere' }}>{looseDescription ? `Tồn lẻ: ${looseDescription}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {(activeReportTab === 'repair-export' || activeReportTab === 'repair-receipt') && (
      <section style={{ padding: '16px', border: '1px solid #cbd5e1', borderRadius: '9px', backgroundColor: '#fff' }}>
        {activeReportTab === 'repair-export' && <>
        <h3 style={{ margin: '0 0 12px', color: '#1e293b', fontSize: '16px' }}>🧾 Phiếu Xuất Sửa Khoán Bên Ngoài</h3>
        <form {...repairDraft.formDraftProps} onSubmit={handleSave} style={{ display: 'grid', gap: '12px', padding: '14px', border: editingSlipId ? '2px solid #f59e0b' : '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
            <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Tên thợ / Người sửa khoán
              <input
                list="repair-worker-options"
                required
                value={repairWorkerName}
                onChange={event => {
                  const name = event.target.value;
                  setRepairWorkerName(name);
                  const matchingWorker = repairWorkerOptions.find(worker => worker.name.toLowerCase() === name.trim().toLowerCase());
                  setRepairWorkerZalo(matchingWorker?.phone || '');
                }}
                placeholder="Chọn thợ cũ hoặc nhập tên mới"
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Số điện thoại Zalo
              <input
                type="tel"
                inputMode="tel"
                value={repairWorkerZalo}
                onChange={event => setRepairWorkerZalo(event.target.value)}
                placeholder="Nhập số điện thoại Zalo"
                style={inputStyle}
              />
              {repairWorkerZalo.trim() && !/^0\d{9}$/.test(repairWorkerZalo.replace(/\D/g, '')) && (
                <small role="alert" style={{ color: '#b91c1c', fontSize: '11px', fontWeight: 600 }}>
                  Số điện thoại chưa hợp lệ. Vui lòng nhập đủ 10 chữ số và bắt đầu bằng số 0.
                </small>
              )}
            </label>
            <datalist id="repair-worker-options">
              {repairWorkerOptions.map(worker => (
                <option key={worker.name} value={worker.name}>{worker.phone}</option>
              ))}
            </datalist>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
            <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Số phiếu
              <input readOnly value={editingSlipId ? repairSlips.find(slip => String(slip.id) === String(editingSlipId))?.slipNo || newSlipNo : newSlipNo} style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Ngày tháng
              <input required type="date" value={date} onChange={event => setDate(event.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Tạm ứng
              <input type="text" inputMode="decimal" value={advance} onChange={event => setAdvance(formatNumberInput(event.target.value))} style={inputStyle} />
            </label>
          </div>

          <section style={{ padding: '14px', border: '2px solid #0f766e', borderRadius: '8px', backgroundColor: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
              <strong style={{ color: '#0f766e', fontSize: '14px' }}>Nguyên Phụ Liệu Kèm Theo</strong>
              <button
                type="button"
                onClick={() => setAccompanyingMaterials(rows => [...rows, createAccompanyingMaterialRow()])}
                style={{ padding: '7px 12px', border: 0, borderRadius: '5px', backgroundColor: '#0f766e', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                + Thêm dòng
              </button>
            </div>
            <datalist id="nguyen-lieu-list">
              {materials.map((material: CategoryItem) => (
                <option key={material.id} value={material.name} label={material.code} />
              ))}
            </datalist>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: '900px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 2fr) minmax(100px, .7fr) minmax(100px, .8fr) minmax(130px, 1fr) minmax(140px, 1fr) 42px', gap: '8px', color: '#475569', fontSize: '12px', fontWeight: 700 }}>
                  <span>Nguyên vật liệu</span>
                  <span>Đơn vị tính</span>
                  <span>Số lượng</span>
                  <span>Đơn giá (VNĐ)</span>
                  <span>Thành tiền (VNĐ)</span>
                  <span />
                </div>
                {accompanyingMaterials.map(row => {
                  const amount = (Number(row.quantity) || 0) * (parseFormattedNumber(row.unitPrice) || 0);
                  return (
                    <div key={row.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 2fr) minmax(100px, .7fr) minmax(100px, .8fr) minmax(130px, 1fr) minmax(140px, 1fr) 42px', gap: '8px', alignItems: 'start', marginTop: '8px' }}>
                      <div>
                        <input
                          type="text"
                          list="nguyen-lieu-list"
                          autoComplete="off"
                          aria-label="Tìm nguyên vật liệu sửa khoán"
                          placeholder="Gõ tên nguyên vật liệu..."
                          value={row.query}
                          onChange={event => {
                            const query = event.target.value;
                            const selectedMaterial = materials.find(material =>
                              normalizeMaterialSearch(material.name) === normalizeMaterialSearch(query.trim())
                            );
                            setAccompanyingMaterials(rows => rows.map(item => item.id === row.id
                              ? selectedMaterial
                                ? {
                                  ...item,
                                  materialId: selectedMaterial.id,
                                  materialCode: selectedMaterial.code,
                                  materialName: selectedMaterial.name,
                                  query: selectedMaterial.name,
                                  unit: selectedMaterial.unit || item.unit,
                                  unitPrice: formatNumberInput(String(getLatestMaterialUnitPrice(selectedMaterial, slips, expenses) || '')),
                                  isDropdownOpen: false
                                }
                                : {
                                  ...item,
                                  query,
                                  materialId: null,
                                  materialCode: '',
                                  materialName: '',
                                  unitPrice: '',
                                  isDropdownOpen: true
                                }
                              : item));
                          }}
                          style={inputStyle}
                        />
                      </div>
                      <select
                        aria-label="Đơn vị tính nguyên phụ liệu sửa khoán"
                        value={row.unit}
                        onChange={event => setAccompanyingMaterials(rows => rows.map(item =>
                          item.id === row.id ? { ...item, unit: event.target.value as MaterialUnit } : item
                        ))}
                        style={inputStyle}
                      >
                        {[...new Set(['kg', 'lọn', 'bó', 'cái', ...materials.map((material: CategoryItem) => material.unit).filter(Boolean), row.unit])].map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        aria-label="Số lượng nguyên phụ liệu sửa khoán"
                        placeholder="Số lượng"
                        value={row.quantity}
                        onChange={event => setAccompanyingMaterials(rows => rows.map(item =>
                          item.id === row.id ? { ...item, quantity: event.target.value } : item
                        ))}
                        style={inputStyle}
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label="Đơn giá nguyên phụ liệu sửa khoán"
                        placeholder="Đơn giá"
                        value={row.unitPrice}
                        onChange={event => setAccompanyingMaterials(rows => rows.map(item =>
                          item.id === row.id ? { ...item, unitPrice: formatNumberInput(event.target.value) } : item
                        ))}
                        style={inputStyle}
                      />
                      <div style={{ ...inputStyle, minHeight: '35px', backgroundColor: '#f8fafc', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {formatCurrency(amount)}
                      </div>
                      <button
                        type="button"
                        aria-label="Xóa dòng nguyên phụ liệu sửa khoán"
                        onClick={() => setAccompanyingMaterials(rows => {
                          const remaining = rows.filter(item => item.id !== row.id);
                          return remaining.length ? remaining : [createAccompanyingMaterialRow()];
                        })}
                        style={{ padding: '8px 10px', border: 0, borderRadius: '5px', backgroundColor: '#fee2e2', color: '#b91c1c', fontSize: '17px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        −
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {lines.map(line => {
            const piecesPerSet = getPiecesPerSet(line.productCode);
            const sizeKeys = Array.from({ length: piecesPerSet }, (_, sizeIndex) => `Cái ${sizeIndex + 1}`);
            const matchingDefectiveImports = defectiveGoodsImportSlips
              .filter(source => source.productCode.trim().toLowerCase() === line.productCode.trim().toLowerCase())
              .sort((first, second) => second.date.localeCompare(first.date));
            const selectedDefectiveImport = matchingDefectiveImports.find(source =>
              String(source.id) === String(line.sourceDefectiveGoodsImportSlipId || '')
            );
            const selectedImportAvailability = selectedDefectiveImport
              ? getDraftAwareDefectiveImportAvailability(selectedDefectiveImport, line.id)
              : undefined;
            const physicalQuantity = piecesPerSet > 1
              ? (line.itemTypeOption === 'CA_HAI' ? (Number(line.bundleQuantity) || 0) * piecesPerSet : 0) +
                Object.values(line.sizeQuantities).reduce((sum, value) => sum + (Number(value) || 0), 0)
              : Number(line.quantity) || 0;
            const bundleAmount = (line.itemTypeOption === 'CA_HAI' ? Number(line.bundleQuantity) || 0 : 0) *
              (parseFormattedNumber(line.bundleUnitPrice) || 0);
            const sizeAmount = piecesPerSet === 1
              ? (Number(line.quantity) || 0) * (parseFormattedNumber(line.sizeUnitPrices['Cái 1'] || '') || 0)
              : Object.entries(line.sizeQuantities).reduce((sum, [size, quantity]) => (
                sum + (Number(quantity) || 0) * (parseFormattedNumber(line.sizeUnitPrices[size] || '') || 0)
              ), 0);
            const amount = bundleAmount + sizeAmount;
            return (
              <div key={line.id} style={{ display: 'grid', gap: '9px', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '7px', backgroundColor: '#fff' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '9px', alignItems: 'end' }}>
                  <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Mã hàng
                    <input list="repair-stock-product-codes" required value={line.productCode} onChange={event => updateRepairLineCode(line, event.target.value)} style={inputStyle} />
                  </label>
                  <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Tên hàng
                    <input readOnly value={productNames.get(line.productCode.trim().toLowerCase()) || line.productName} style={inputStyle} />
                  </label>
                  <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Nguồn hàng loại nhập kho
                    <select
                      value={line.sourceDefectiveGoodsImportSlipId || ''}
                      onChange={event => selectDefectiveImportSource(line, event.target.value)}
                      disabled={!line.productCode.trim() || matchingDefectiveImports.length === 0}
                      style={inputStyle}
                    >
                      <option value="">
                        {matchingDefectiveImports.length ? '-- Chọn phiếu nhập hàng loại --' : 'Chưa có phiếu nhập hàng loại cho mã này'}
                      </option>
                      {matchingDefectiveImports.map(source => {
                        const available = getDraftAwareDefectiveImportAvailability(source, line.id);
                        const remainingPieces = available.bundles * getPiecesPerSet(source.productCode) +
                          Object.values(available.sizes).reduce((sum, quantity) => sum + quantity, 0);
                        return (
                          <option key={source.id} value={String(source.id)} disabled={remainingPieces <= 0}>
                            {source.slipNo} · {source.date} · còn {formatNumber(remainingPieces)} cái
                          </option>
                        );
                      })}
                    </select>
                    {selectedDefectiveImport && selectedImportAvailability && (
                      <small style={{ color: '#0f766e', fontWeight: 600 }}>
                        Nguồn {selectedDefectiveImport.slipNo}: còn {formatNumber(selectedImportAvailability.bundles)} bộ
                        {Object.entries(selectedImportAvailability.sizes)
                          .filter(([, quantity]) => quantity > 0)
                          .map(([size, quantity]) => ` · ${size.replace('Cái ', 'Size ')}: ${formatNumber(quantity)} cái`)}
                      </small>
                    )}
                  </label>
                  {piecesPerSet === 1 && (
                    <>
                      <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Số lượng xuất (Cái)
                        <input required type="number" min="0" step="any" value={line.quantity} onChange={event => updateLine(line.id, { quantity: event.target.value })} style={inputStyle} />
                      </label>
                      <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Đơn giá Cái lẻ Size 1
                        <input required type="text" inputMode="decimal" value={line.sizeUnitPrices['Cái 1'] || ''} onChange={event => updateLine(line.id, { sizeUnitPrices: { ...line.sizeUnitPrices, 'Cái 1': formatNumberInput(event.target.value) } })} style={inputStyle} />
                      </label>
                    </>
                  )}
                  {lines.length > 1 && (
                    <button type="button" onClick={() => setLines(current => current.filter(item => item.id !== line.id))} style={{ padding: '8px', border: 0, borderRadius: '6px', backgroundColor: '#fee2e2', color: '#b91c1c', fontWeight: 700, cursor: 'pointer' }}>Xóa dòng</button>
                  )}
                </div>
                {piecesPerSet > 1 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                    <strong style={{ gridColumn: '1 / -1', fontSize: '12px', color: '#475569' }}>Chọn hình thức xuất sửa · Mã bộ gồm {piecesPerSet} size</strong>
                    <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '12px', fontWeight: 700 }}>
                      {([
                        ['CAI', 'Chỉ sửa cái lẻ theo size'],
                        ['CA_HAI', 'Sửa nguyên bộ & cái lẻ']
                      ] as const).map(([option, label]) => (
                        <label key={option} style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name={`repair-item-type-${line.id}`}
                            checked={line.itemTypeOption === option}
                            onChange={() => updateLine(line.id, { itemTypeOption: option })}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    {line.itemTypeOption === 'CA_HAI' && (
                      <>
                        <label style={{ display: 'grid', gap: '4px', fontSize: '12px', fontWeight: 700 }}>
                          Số bộ nguyên
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.bundleQuantity}
                            onChange={event => updateLine(line.id, { bundleQuantity: event.target.value })}
                            style={inputStyle}
                          />
                        </label>
                        <label style={{ display: 'grid', gap: '4px', fontSize: '12px', fontWeight: 700 }}>
                          Đơn giá Bộ nguyên
                          <input
                            type="text"
                            inputMode="decimal"
                            value={line.bundleUnitPrice}
                            onChange={event => updateLine(line.id, { bundleUnitPrice: formatNumberInput(event.target.value) })}
                            style={inputStyle}
                          />
                        </label>
                      </>
                    )}
                    {sizeKeys.map(size => (
                      <div key={size} style={{ display: 'grid', gap: '6px' }}>
                        <label style={{ display: 'grid', gap: '4px', fontSize: '12px', fontWeight: 700 }}>{size.replace('Cái ', 'Cái lẻ Size ')}
                          <input type="number" min="0" step="any" value={line.sizeQuantities[size] || ''} onChange={event => updateLine(line.id, { sizeQuantities: { ...line.sizeQuantities, [size]: event.target.value } })} style={inputStyle} />
                        </label>
                        <label style={{ display: 'grid', gap: '4px', fontSize: '11px', fontWeight: 700 }}>Đơn giá Cái lẻ {size.replace('Cái ', 'Size ')}
                          <input
                            type="text"
                            inputMode="decimal"
                            value={line.sizeUnitPrices[size] || ''}
                            onChange={event => updateLine(line.id, { sizeUnitPrices: { ...line.sizeUnitPrices, [size]: formatNumberInput(event.target.value) } })}
                            style={inputStyle}
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ textAlign: 'right', fontSize: '12px', color: '#475569' }}>
                  ĐVT: {piecesPerSet > 1 ? (line.itemTypeOption === 'CA_HAI' ? 'Bộ & cái lẻ' : 'Cái lẻ theo size') : 'Cái'} · Số cái xuất: {formatNumber(physicalQuantity)} · Thành tiền: <strong>{formatCurrency(amount)}</strong>
                </div>
              </div>
            );
          })}
          <datalist id="repair-stock-product-codes">
            {[...new Set([
              ...products.map(product => product.code),
              ...contracts.map(contract => contract.productCode),
              ...slips.map(slip => slip.productCode),
              ...defectiveGoodsImportSlips.map(slip => slip.productCode)
            ].filter(Boolean))].map(code => <option key={code} value={code} />)}
          </datalist>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
            <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Ghi chú / Lý do lỗi
              <textarea rows={2} value={reason} onChange={event => setReason(event.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
            </label>
            <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', padding: '12px', borderRadius: '7px', backgroundColor: '#ecfdf5', fontSize: '13px' }}>
              <div>Tổng tiền công sửa: <strong>{formatCurrency(repairLabourTotal)}</strong></div>
              <div>Tổng nguyên phụ liệu: <strong>{formatCurrency(repairMaterialTotal)}</strong></div>
              <div>Tạm ứng: <strong>{formatCurrency(repairAdvanceTotal)}</strong></div>
              <div>Ước tính thực trả: <strong style={{ color: '#0f766e' }}>{formatCurrency(repairSettlementPreview)}</strong></div>
            </div>
          </div>
          {error && <div role="alert" style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{error}</div>}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setLines(current => [...current, createRepairLine()])} style={{ padding: '9px 12px', border: 0, borderRadius: '6px', backgroundColor: '#0f766e', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>＋ Thêm dòng</button>
            <button type="submit" disabled={repairDraft.isSubmitting} style={{ padding: '9px 12px', border: 0, borderRadius: '6px', backgroundColor: repairDraft.isSubmitting ? '#94a3b8' : '#2563eb', color: '#fff', fontWeight: 700, cursor: repairDraft.isSubmitting ? 'wait' : 'pointer' }}>{repairDraft.isSubmitting ? '⏳ Đang lưu...' : editingSlipId ? 'Lưu sửa' : 'Lưu Phiếu Sửa Khoán'}</button>
            <button type="button" onClick={resetForm} style={{ padding: '9px 12px', border: 0, borderRadius: '6px', backgroundColor: '#64748b', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Làm mới / Tạo phiếu mới</button>
          </div>
        </form>
        </>}

        {activeReportTab === 'repair-receipt' && <>
        <section style={{ marginTop: '16px', padding: '14px', border: '1px solid #99f6e4', borderRadius: '8px', backgroundColor: '#f0fdfa' }}>
          <h4 style={{ margin: '0 0 12px', color: '#115e59', fontSize: '15px' }}>{editingReceiptId ? '✏️ Sửa Phiếu Nhận Hàng Sửa Khoán' : '📥 Phiếu Nhận Hàng Sửa Khoán'}</h4>
          <form {...repairReceiptDraft.formDraftProps} onSubmit={handleSaveRepairReceipt} style={{ display: 'grid', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
              <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Phiếu xuất sửa khoán đối ứng
                <select disabled={editingReceiptId !== null} value={receiptSourceSlipId} onChange={event => handleReceiptSourceChange(event.target.value)} style={inputStyle}>
                  <option value="">Chọn phiếu đã xuất sửa</option>
                  {repairSlips.map(slip => (
                    <option key={slip.id} value={String(slip.id)}>
                      {slip.slipNo} · {slip.repairWorkerName || slip.partnerName || slip.partner || 'Chưa rõ thợ'} · {slip.date}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Số phiếu nhận
                <input readOnly value={receiptSlipNo} style={inputStyle} />
              </label>
              <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Ngày nhận
                <input required type="date" value={receiptDate} onChange={event => setReceiptDate(event.target.value)} style={inputStyle} />
              </label>
            </div>

            {selectedRepairSource && (
              <>
                <div style={{ overflowX: 'auto', border: '1px solid #99f6e4', borderRadius: '7px', backgroundColor: '#fff' }}>
                  <table style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr>{['Mã hàng', 'Lũy kế đã nhận', 'Còn thiếu để nhận đủ'].map(label => (
                        <th key={label} style={tableHeaderStyle}>{label}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {sourceRepairLines.map(sourceLine => {
                        const code = sourceLine.productCode.trim().toLowerCase();
                        const prior = receiptProgress.get(code) || { bundles: 0, sizes: {} };
                        const sizeCount = getPiecesPerSet(sourceLine.productCode);
                        const currentLine = receiptLines.find(line => line.productCode.trim().toLowerCase() === code);
                        const currentBreakdown = currentLine ? getReceiptLineBreakdown(currentLine) : { bundleQuantity: 0, sizeQuantities: {}, quantity: 0 };
                        const currentBundles = currentBreakdown.bundleQuantity;
                        const receivedBundles = prior.bundles + currentBundles;
                        const missingBundles = Math.max(0, sourceLine.bundleQuantity - receivedBundles);
                        const sizeRows = Array.from({ length: sizeCount }, (_, index) => {
                          const size = `Cái ${index + 1}`;
                          const exported = sizeCount === 1
                            ? sourceLine.quantity
                            : sourceLine.bundleQuantity + (sourceLine.sizeQuantities[size] || 0);
                          const currentLoose = Number(currentBreakdown.sizeQuantities[size]) || 0;
                          const currentOrdinary = sizeCount === 1 ? Number(currentLine?.quantity) || 0 : 0;
                          const returned = sizeCount === 1
                            ? (prior.sizes[size] || 0) + currentOrdinary
                            : prior.bundles + (prior.sizes[size] || 0) + currentBundles + currentLoose;
                          return { size, returned, missing: Math.max(0, exported - returned) };
                        });
                        return (
                          <tr key={sourceLine.productCode} style={{ borderTop: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '9px', fontWeight: 700 }}>{sourceLine.productCode}<br /><small>{sourceLine.productName}</small></td>
                            <td style={{ padding: '9px' }}>
                              {sizeCount > 1 && receivedBundles > 0 && <div>{formatNumber(receivedBundles)} bộ</div>}
                              {sizeRows.filter(row => row.returned > 0).map(row => <div key={row.size}>{row.size}: {formatNumber(row.returned)} cái</div>)}
                            </td>
                            <td style={{ padding: '9px', color: missingBundles > 0 || sizeRows.some(row => row.missing > 0) ? '#b91c1c' : '#15803d', fontWeight: 700 }}>
                              {sizeCount > 1 && missingBundles > 0 && <div>{formatNumber(missingBundles)} bộ</div>}
                              {sizeRows.filter(row => row.missing > 0).map(row => <div key={row.size}>{row.size}: {formatNumber(row.missing)} cái</div>)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {receiptLines.map(line => {
                  const sizeCount = getPiecesPerSet(line.productCode);
                  const sizeKeys = Array.from({ length: sizeCount }, (_, index) => `Cái ${index + 1}`);
                  const sourceLine = sourceRepairLines.find(item => item.productCode.trim().toLowerCase() === line.productCode.trim().toLowerCase());
                  const prior = receiptProgress.get(line.productCode.trim().toLowerCase()) || { bundles: 0, sizes: {} };
                  const breakdown = getReceiptLineBreakdown(line);
                  const directBundles = line.itemTypeOption === 'CA_HAI' ? Number(line.bundleQuantity) || 0 : 0;
                  const maxBundles = Math.max(0, (sourceLine?.bundleQuantity || 0) - prior.bundles);
                  const missingBundlesAfterThis = Math.max(0, (sourceLine?.bundleQuantity || 0) - prior.bundles - breakdown.bundleQuantity);
                  const returnedUnits = breakdown.quantity;
                  const quantityBreakdown = [
                    ...(sizeCount > 1 && breakdown.bundleQuantity > 0
                      ? [`${formatNumber(breakdown.bundleQuantity)} bộ`]
                      : []),
                    ...(sizeCount > 1
                      ? sizeKeys
                        .filter(size => (Number(breakdown.sizeQuantities[size]) || 0) > 0)
                        .map(size => `${formatNumber(Number(breakdown.sizeQuantities[size]))} ${size.replace('Cái ', 'cái Size ')}`)
                      : returnedUnits > 0
                        ? [`${formatNumber(returnedUnits)} cái Size 1`]
                        : [])
                  ];
                  return (
                    <div key={line.id} style={{ display: 'grid', gap: '9px', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '7px', backgroundColor: '#fff' }}>
                      <strong>{line.productCode} · {line.productName}</strong>
                      {sizeCount > 1 ? (
                        <>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '12px', fontWeight: 700 }}>
                            {([
                              ['CAI', 'Chỉ nhận cái lẻ theo size'],
                              ['CA_HAI', 'Nhận bộ nguyên & cái lẻ']
                            ] as const).map(([option, label]) => (
                              <label key={option} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <input
                                  type="radio"
                                  name={`receipt-type-${line.id}`}
                                  checked={line.itemTypeOption === option}
                                  onChange={() => updateReceiptLine(line.id, { itemTypeOption: option })}
                                />
                                {label}
                              </label>
                            ))}
                          </div>
                          {line.itemTypeOption === 'CA_HAI' && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
                              {(() => {
                                const bundleProgress = prior.bundles + breakdown.bundleQuantity;
                                const bundleDetails = [
                                  ...(bundleProgress > 0 ? [`Lũy kế: ${formatNumber(bundleProgress)} bộ`] : []),
                                  ...(missingBundlesAfterThis > 0 ? [`Còn thiếu: ${formatNumber(missingBundlesAfterThis)} bộ`] : [])
                                ];
                                return <label style={{ display: 'grid', gap: '4px', fontSize: '12px', fontWeight: 700 }}>Số bộ nhận
                                <input type="number" min="0" max={maxBundles} step="any" value={line.bundleQuantity} onChange={event => updateReceiptLine(line.id, { bundleQuantity: event.target.value })} style={inputStyle} />
                                {bundleDetails.length > 0 && <small>{bundleDetails.join(' · ')}</small>}
                              </label>;
                              })()}
                            </div>
                          )}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
                            {sizeKeys.map(size => {
                              const exported = (sourceLine?.bundleQuantity || 0) + (sourceLine?.sizeQuantities[size] || 0);
                              const alreadyReceived = prior.bundles + (prior.sizes[size] || 0);
                              const missing = Math.max(0, exported - alreadyReceived - directBundles);
                              const cumulativeReceived = alreadyReceived +
                                breakdown.bundleQuantity +
                                (Number(breakdown.sizeQuantities[size]) || 0);
                              const missingAfterThis = Math.max(0, exported - cumulativeReceived);
                              const sizeDetails = [
                                ...(cumulativeReceived > 0 ? [`Lũy kế: ${formatNumber(cumulativeReceived)}`] : []),
                                ...(missingAfterThis > 0 ? [`Còn thiếu: ${formatNumber(missingAfterThis)}`] : [])
                              ];
                              return (
                                <div key={size}>
                                  <label style={{ display: 'grid', gap: '4px', fontSize: '12px', fontWeight: 700 }}>Nhận cái lẻ {size.replace('Cái ', 'Size ')}
                                    <input type="number" min="0" max={missing} step="any" value={line.sizeQuantities[size] || ''} onChange={event => updateReceiptLine(line.id, { sizeQuantities: { ...line.sizeQuantities, [size]: event.target.value } })} style={inputStyle} />
                                    {sizeDetails.length > 0 && <small>{sizeDetails.join(' · ')}</small>}
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
                          {(() => {
                            const cumulative = (prior.sizes['Cái 1'] || 0) + (Number(line.quantity) || 0);
                            const missing = Math.max(0, (sourceLine?.quantity || 0) - cumulative);
                            const singleSizeDetails = [
                              ...(cumulative > 0 ? [`Lũy kế: ${formatNumber(cumulative)}`] : []),
                              ...(missing > 0 ? [`Còn thiếu: ${formatNumber(missing)}`] : [])
                            ];
                            return <label style={{ display: 'grid', gap: '4px', fontSize: '12px', fontWeight: 700 }}>Số lượng nhận
                            <input type="number" min="0" max={Math.max(0, (sourceLine?.quantity || 0) - (prior.sizes['Cái 1'] || 0))} step="any" value={line.quantity} onChange={event => updateReceiptLine(line.id, { quantity: event.target.value })} style={inputStyle} />
                            {singleSizeDetails.length > 0 && <small>{singleSizeDetails.join(' · ')}</small>}
                          </label>;
                          })()}
                        </div>
                      )}
                      <div style={{ textAlign: 'right', fontSize: '12px', color: '#475569' }}>
                        Số lượng nhận đợt này: {quantityBreakdown.join(' + ') || '—'} · Thành tiền: <strong>{formatCurrency(getReceiptLineAmount(line))}</strong>
                      </div>
                    </div>
                  );
                })}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px', padding: '12px', borderRadius: '7px', backgroundColor: '#ecfdf5' }}>
                  <div>Tiền công sửa khoán: <strong>{formatCurrency(receiptTotal)}</strong></div>
                  <div>Tổng nguyên phụ liệu HĐ: <strong>{formatCurrency(receiptMaterialTotal)}</strong></div>
                  <div>Trừ nguyên phụ liệu: <strong>{formatCurrency(receiptMaterialDeducted)}</strong></div>
                  <div>Nguyên phụ liệu còn chờ trừ: <strong>{formatCurrency(Math.max(0, receiptMaterialAvailable - receiptMaterialDeducted))}</strong></div>
                  <div>Trừ tiền tạm ứng: <strong>{formatCurrency(receiptAdvanceDeducted)}</strong></div>
                  <div>Tạm ứng còn chờ trừ: <strong>{formatCurrency(Math.max(0, receiptAdvanceAvailable - receiptAdvanceDeducted))}</strong></div>
                  <div>Còn lại phải thanh toán: <strong style={{ color: receiptRemainingAmount > 0 ? '#b91c1c' : '#15803d' }}>{formatCurrency(receiptRemainingAmount)}</strong></div>
                </div>
                {receiptRemainingAmount > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                    <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Hạn trả nợ
                      <input required type="date" value={displayedReceiptDueDate} onChange={event => setReceiptDueDate(event.target.value)} style={inputStyle} />
                    </label>
                  </div>
                )}
                <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>Ghi chú thanh toán
                  <textarea rows={2} value={receiptPaymentNote} onChange={event => setReceiptPaymentNote(event.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
                </label>
                <small style={{ color: '#64748b' }}>Đơn giá bộ/size lấy từ phiếu xuất. Nguyên phụ liệu được trừ trước, sau đó mới trừ tạm ứng; phần khấu trừ chưa dùng hết sẽ được chuyển sang đợt nhận tiếp theo.</small>
              </>
            )}
            {receiptError && <div role="alert" style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{receiptError}</div>}
            {receiptOverageWarnings.length > 0 && (
              <div role="alert" style={{ display: 'grid', gap: '4px', padding: '10px 12px', border: '1px solid #fca5a5', borderRadius: '6px', backgroundColor: '#fef2f2', color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>
                {receiptOverageWarnings.map(warning => <div key={warning}>{warning}</div>)}
                <div>Không thể lưu phiếu cho đến khi điều chỉnh số lượng không vượt quá phiếu xuất.</div>
              </div>
            )}
            <button type="submit" disabled={repairReceiptDraft.isSubmitting || !selectedRepairSource || receiptOverageWarnings.length > 0} style={{ justifySelf: 'start', padding: '9px 12px', border: 0, borderRadius: '6px', backgroundColor: repairReceiptDraft.isSubmitting || !selectedRepairSource || receiptOverageWarnings.length > 0 ? '#94a3b8' : '#0f766e', color: '#fff', fontWeight: 700, cursor: repairReceiptDraft.isSubmitting ? 'wait' : selectedRepairSource && receiptOverageWarnings.length === 0 ? 'pointer' : 'not-allowed' }}>
              {repairReceiptDraft.isSubmitting ? '⏳ Đang lưu...' : editingReceiptId !== null ? 'Cập Nhật Phiếu Nhận Hàng Sửa Khoán' : 'Lưu Phiếu Nhận Hàng Sửa Khoán'}
            </button>
            {editingReceiptId !== null && (
              <button type="button" onClick={() => handleReceiptSourceChange('')} style={{ justifySelf: 'start', padding: '8px 11px', border: '1px solid #94a3b8', borderRadius: '6px', backgroundColor: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer' }}>
                Hủy sửa
              </button>
            )}
          </form>

          <div style={{ overflowX: 'auto', marginTop: '14px', border: '1px solid #e2e8f0', borderRadius: '7px', backgroundColor: '#fff' }}>
            <table style={{ width: '100%', minWidth: '1180px', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead><tr>{['Số phiếu / Ngày', 'Phiếu xuất đối ứng', 'Người sửa', 'Tiền công', 'Trừ nguyên phụ liệu', 'Tạm ứng trừ', 'Còn phải trả', 'Hạn trả nợ', 'Ghi chú', 'Thao tác'].map(label => <th key={label} style={tableHeaderStyle}>{label}</th>)}</tr></thead>
              <tbody>
                {repairReceiptSlips.length === 0 ? (
                  <tr><td colSpan={10} style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>Chưa có phiếu nhận hàng sửa khoán.</td></tr>
                ) : repairReceiptSlips.map(slip => {
                  const source = repairSlips.find(item => String(item.id) === String(slip.sourceRepairSlipId || ''));
                  return (
                    <tr key={slip.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '9px' }}><strong>{slip.slipNo}</strong><br />{slip.date}</td>
                      <td style={{ padding: '9px' }}>{source?.slipNo || slip.contractNo || '—'}</td>
                      <td style={{ padding: '9px' }}>{slip.repairWorkerName || slip.partnerName || slip.partner || '—'}</td>
                      <td style={{ padding: '9px', textAlign: 'right' }}>{formatCurrency(Number(slip.repairTotal) || 0)}</td>
                      <td style={{ padding: '9px', textAlign: 'right', color: '#0f766e' }}>{formatCurrency(Number(slip.repairMaterialDeducted) || 0)}</td>
                      <td style={{ padding: '9px', textAlign: 'right' }}>{formatCurrency(Number(slip.repairAdvanceApplied) || 0)}</td>
                      <td style={{ padding: '9px', textAlign: 'right', color: Number(slip.repairRemainingAmount) > 0 ? '#b91c1c' : '#15803d' }}>{formatCurrency(Number(slip.repairRemainingAmount) || 0)}</td>
                      <td style={{ padding: '9px' }}>{slip.repairDueDate || '—'}</td>
                      <td style={{ padding: '9px' }}>{slip.repairPaymentNote || slip.note || '—'}</td>
                      <td style={{ padding: '9px' }}>
                        <div className="slip-action-buttons">
                          <button type="button" className="slip-action-button slip-action-edit" onClick={() => startEditRepairReceipt(slip)}>✏️ Sửa</button>
                          <button type="button" className="slip-action-button slip-action-delete" onClick={() => handleDeleteRepairReceipt(slip)}>🗑️ Xóa</button>
                          <button type="button" className="slip-action-button slip-action-zalo" onClick={() => void handleSendToZalo(slip)}>💬 Gửi Zalo</button>
                          <button type="button" className="slip-action-button slip-action-print" onClick={() => void handlePrintSlip(slip)}>🖨️ In Phiếu</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        </>}

        {activeReportTab === 'repair-export' && <>
        <div style={{ overflowX: 'auto', marginTop: '14px', border: '1px solid #e2e8f0', borderRadius: '7px' }}>
          <table style={{ width: '100%', minWidth: '1250px', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead><tr>{['Số Phiếu / Ngày', 'Người nhận sửa / Zalo', 'Mã hàng / Tên hàng', 'Chi tiết xuất sửa', 'Thành tiền công', 'Nguyên phụ liệu kèm theo', 'Tạm ứng', 'Ghi chú / Lý do', 'Thao tác'].map(label => <th key={label} style={tableHeaderStyle}>{label}</th>)}</tr></thead>
            <tbody>
              {repairSlips.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: '18px', textAlign: 'center', color: '#64748b' }}>Chưa có phiếu sửa khoán.</td></tr>
              ) : repairSlips.map(slip => (
                <tr key={slip.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '9px', whiteSpace: 'nowrap' }}><strong>{slip.slipNo}</strong><br />{slip.date}</td>
                  <td style={{ padding: '9px' }}>{slip.repairWorkerName || slip.partnerName || slip.partner || '—'}<br /><small>{slip.repairWorkerZalo || 'Chưa có Zalo'}</small></td>
                  <td style={{ padding: '9px' }}>{getRepairLines(slip).map(line => <div key={line.id}><strong>{line.productCode}</strong> · {line.productName}</div>)}</td>
                  <td style={{ padding: '9px' }}>{getRepairLines(slip).map(line => {
                    const piecesPerSet = getPiecesPerSet(line.productCode);
                    const sourceSlip = defectiveGoodsImportSlips.find(source =>
                      String(source.id) === String(line.sourceDefectiveGoodsImportSlipId || '')
                    );
                    const sizeSummary = Object.entries(line.sizeQuantities || {})
                      .filter(([, count]) => Number(count) > 0)
                      .map(([size, count]) => `${formatNumber(Number(count))} cái (Size ${size.replace(/\D/g, '')})`)
                      .join(', ');
                    const bundleSummary = piecesPerSet > 1 && Number(line.bundleQuantity) > 0
                      ? `${formatNumber(line.bundleQuantity)} Bộ`
                      : '';
                    return (
                      <div key={line.id}>
                        {[bundleSummary, sizeSummary || (piecesPerSet === 1 ? `${formatNumber(line.quantity)} cái` : '')].filter(Boolean).join(' · ') || '—'}
                        {sourceSlip && <small style={{ display: 'block', color: '#0f766e' }}>Nguồn: {sourceSlip.slipNo}</small>}
                      </div>
                    );
                  })}</td>
                  <td style={{ padding: '9px', textAlign: 'right' }}>{formatCurrency(Number(slip.repairTotal) || 0)}</td>
                  <td style={{ padding: '9px', minWidth: '220px' }}>
                    {Array.isArray(slip.accompanyingMaterials) && slip.accompanyingMaterials.length > 0
                      ? <>
                        {slip.accompanyingMaterials.map((material, index) => (
                          <div key={`${material.materialId}-${index}`} style={{ whiteSpace: 'nowrap' }}>
                            {material.materialName || material.materialCode}: {formatNumber(Number(material.quantity) || 0)} {material.unit}
                            {' × '}{formatCurrency(Number(material.unitPrice) || 0)}
                            {' = '}<strong>{formatCurrency(getAccompanyingMaterialAmount([material]))}</strong>
                          </div>
                        ))}
                        <div style={{ marginTop: '5px', color: '#0f766e', fontWeight: 700 }}>
                          Tổng: {formatCurrency(getAccompanyingMaterialAmount(slip.accompanyingMaterials))}
                        </div>
                      </>
                      : <span style={{ color: '#94a3b8' }}>—</span>}
                  </td>
                  <td style={{ padding: '9px', textAlign: 'right' }}>{formatCurrency(Number(slip.repairAdvance) || 0)}</td>
                  <td style={{ padding: '9px' }}>{slip.note || '—'}</td>
                  <td style={{ padding: '9px' }}>
                    <div className="slip-action-buttons">
                      <button type="button" className="slip-action-button slip-action-edit" onClick={() => startEdit(slip)}>✏️ Sửa</button>
                      <button type="button" className="slip-action-button slip-action-delete" onClick={() => handleDelete(slip)}>🗑️ Xóa</button>
                      <button type="button" className="slip-action-button slip-action-zalo" onClick={() => void handleSendToZalo(slip)}>💬 Gửi Zalo</button>
                      <button type="button" className="slip-action-button slip-action-print" onClick={() => void handlePrintSlip(slip)}>🖨️ In Phiếu</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>}
      </section>
      )}

      {shareSlip && (
        <div id="repair-slip-dialog" role="dialog" aria-modal="true" aria-label="Xem trước phiếu sửa khoán" style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', gridTemplateRows: 'auto 1fr', padding: '18px', backgroundColor: 'rgba(15, 23, 42, 0.65)' }}>
        <style>{`
          @page { size: A5 portrait; margin: 10mm; }
          @media print {
            body * { visibility: hidden !important; }
            #repair-slip-print-area, #repair-slip-print-area * { visibility: visible !important; }
            #repair-slip-dialog, #repair-slip-preview, .repair-slip-scroll { display: contents !important; overflow: visible !important; }
            #repair-slip-print-area { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; max-width: none !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; }
          }
        `}</style>
        <div id="repair-slip-preview" style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: '12px', minHeight: 0, width: 'min(100%, 900px)', margin: '0 auto', padding: '14px', borderRadius: '10px', backgroundColor: '#fff' }}>
          <div className="preview-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <strong>Xem trước phiếu · {shareSlip.slipNo}</strong>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => void handleExportRepairPng()} disabled={exportingRepairImage} style={{ padding: '9px 12px', border: 0, borderRadius: '6px', backgroundColor: '#0284c7', color: '#fff', fontWeight: 700, cursor: exportingRepairImage ? 'wait' : 'pointer' }}>{exportingRepairImage ? 'Đang xuất ảnh…' : 'Xuất ảnh Zalo (PNG)'}</button>
              <button type="button" onClick={handlePrintPreview} style={{ padding: '9px 12px', border: 0, borderRadius: '6px', backgroundColor: '#0f766e', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>In / Lưu PDF</button>
              <button type="button" onClick={() => setShareSlip(null)} style={{ padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer' }}>Đóng</button>
            </div>
          </div>
          {error && <div role="alert" style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{error}</div>}
          <div className="repair-slip-scroll" style={{ minHeight: 0, overflow: 'auto', backgroundColor: '#f1f5f9', padding: '12px' }}>
          <div id="repair-slip-print-area" ref={sharePrintRef} style={{ boxSizing: 'border-box', width: '100%', maxWidth: '760px', minHeight: '480px', margin: '0 auto', padding: '30px 34px', border: '1px solid #cbd5e1', boxShadow: '0 2px 8px rgba(15,23,42,.12)', color: '#0f172a', backgroundColor: '#fff', fontFamily: 'Arial, sans-serif' }}>
          <header style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '12px', marginBottom: '16px' }}>
            {systemConfiguration?.logo && <img src={systemConfiguration.logo} alt="Logo xưởng" style={{ display: 'block', maxWidth: '90px', maxHeight: '54px', objectFit: 'contain', margin: '0 auto 8px' }} />}
            <div style={{ fontSize: '13px', fontWeight: 700 }}>{systemConfiguration?.companyName || 'XƯỞNG SẢN XUẤT'}</div>
            {systemConfiguration?.address && <div style={{ fontSize: '10px', marginTop: '3px' }}>{systemConfiguration.address}</div>}
            {systemConfiguration?.phone && <div style={{ fontSize: '10px', marginTop: '3px' }}>Điện thoại: {systemConfiguration.phone}</div>}
            <h2 style={{ margin: '12px 0 6px', fontSize: '18px' }}>{shareSlip.type === 'NHAN_SUA_KHOAN' ? 'PHIẾU NHẬN HÀNG SỬA KHOÁN' : 'PHIẾU XUẤT SỬA KHOÁN'}</h2>
            <div>Số phiếu: <strong>{shareSlip.slipNo}</strong> · Ngày: {shareSlip.date}</div>
          </header>
          <p><strong>Người nhận sửa:</strong> {shareSlip.repairWorkerName || shareSlip.partnerName || shareSlip.partner || '—'} · <strong>Zalo:</strong> {shareSlip.repairWorkerZalo || repairSlips.find(item => String(item.id) === String(shareSlip.sourceRepairSlipId || ''))?.repairWorkerZalo || '—'}</p>
          {shareSlip.type === 'NHAN_SUA_KHOAN' ? (
            <p><strong>Phiếu xuất đối ứng:</strong> {repairSlips.find(item => String(item.id) === String(shareSlip.sourceRepairSlipId || ''))?.slipNo || shareSlip.contractNo || '—'}</p>
          ) : null}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead><tr>{(shareSlip.type === 'NHAN_SUA_KHOAN'
              ? ['Mã hàng', 'Tên hàng', 'Số lượng nhận quy đổi', 'Thành tiền']
              : ['Mã hàng', 'Tên hàng', 'Số lượng / Size lỗi', 'Đơn giá theo bộ / size', 'Thành tiền']
            ).map(label => <th key={label} style={{ border: '1px solid #94a3b8', padding: '8px' }}>{label}</th>)}</tr></thead>
            <tbody>{getRepairLines(shareSlip).map(line => {
              const piecesPerSet = getPiecesPerSet(line.productCode);
              const sizeDetails = Object.entries(line.sizeQuantities || {})
                .filter(([, quantity]) => Number(quantity) > 0)
                .map(([size, quantity]) => `${formatNumber(Number(quantity))} cái Size ${size.replace(/\D/g, '')}`)
                .join(', ');
              return (
              <tr key={line.id}>
                <td style={{ border: '1px solid #94a3b8', padding: '8px' }}>{line.productCode}</td>
                <td style={{ border: '1px solid #94a3b8', padding: '8px' }}>{line.productName}</td>
                <td style={{ border: '1px solid #94a3b8', padding: '8px' }}>
                  {[
                    Number(line.bundleQuantity) > 0 ? `${formatNumber(line.bundleQuantity)} Bộ` : '',
                    sizeDetails || (piecesPerSet === 1 ? `${formatNumber(line.quantity)} cái` : '')
                  ].filter(Boolean).join(' · ') || '—'}
                  {shareSlip.type === 'XUAT_SUA_KHOAN' && line.sourceDefectiveGoodsImportSlipId && (
                    <>
                      <br />
                      <small style={{ color: '#0f766e' }}>
                        Nguồn nhập loại: {defectiveGoodsImportSlips.find(source =>
                          String(source.id) === String(line.sourceDefectiveGoodsImportSlipId)
                        )?.slipNo || 'Không còn tồn tại'}
                      </small>
                    </>
                  )}
                </td>
                {shareSlip.type !== 'NHAN_SUA_KHOAN' && <td style={{ border: '1px solid #94a3b8', padding: '8px' }}>
                  {Number(line.bundleQuantity) > 0 && <>Bộ: {formatCurrency(Number(line.bundleUnitPrice ?? line.unitPrice) || 0)}<br /></>}
                  {Object.entries(line.sizeQuantities || {}).filter(([, quantity]) => Number(quantity) > 0).map(([size]) => (
                    <div key={size}>{size}: {formatCurrency(Number(line.sizeUnitPrices?.[size] ?? line.unitPrice) || 0)}</div>
                  ))}
                  {getPiecesPerSet(line.productCode) === 1 && `Cái 1: ${formatCurrency(Number(line.sizeUnitPrices?.['Cái 1'] ?? line.unitPrice) || 0)}`}
                </td>}
                <td style={{ border: '1px solid #94a3b8', padding: '8px' }}>{formatCurrency(getRepairLineAmount(line))}</td>
              </tr>
              );
            })}</tbody>
          </table>
          {shareSlip.type === 'NHAN_SUA_KHOAN' ? (
            <>
            <p><strong>Tiền công:</strong> {formatCurrency(Number(shareSlip.repairTotal) || 0)} · <strong>Nguyên phụ liệu đã trừ:</strong> {formatCurrency(Number(shareSlip.repairMaterialDeducted) || 0)} · <strong>Tạm ứng đã trừ:</strong> {formatCurrency(Number(shareSlip.repairAdvanceApplied) || 0)}</p>
              <p><strong>Còn phải thanh toán:</strong> {formatCurrency(Number(shareSlip.repairRemainingAmount) || 0)} · <strong>Hạn trả nợ:</strong> {shareSlip.repairDueDate || '—'}</p>
              <p><strong>Ghi chú:</strong> {shareSlip.repairPaymentNote || shareSlip.note || '—'}</p>
            </>
          ) : (
            <>
            <p><strong>Nguyên phụ liệu kèm theo:</strong></p>
            {Array.isArray(shareSlip.accompanyingMaterials) && shareSlip.accompanyingMaterials.length > 0
              ? shareSlip.accompanyingMaterials.map((material, index) => (
                <p key={`${material.materialId}-${index}`} style={{ margin: '4px 0' }}>
                  {material.materialName || material.materialCode}: {formatNumber(Number(material.quantity) || 0)} {material.unit}
                  {' × '}{formatCurrency(Number(material.unitPrice) || 0)}
                  {' = '}{formatCurrency(getAccompanyingMaterialAmount([material]))}
                </p>
              ))
              : <p style={{ margin: '4px 0' }}>Không có</p>}
            <p><strong>Tổng tiền công:</strong> {formatCurrency(Number(shareSlip.repairTotal) || 0)} · <strong>Tổng nguyên phụ liệu:</strong> {formatCurrency(getAccompanyingMaterialAmount(shareSlip.accompanyingMaterials))} · <strong>Tạm ứng:</strong> {formatCurrency(Number(shareSlip.repairAdvance) || 0)}</p>
            <p><strong>Ghi chú / Lý do lỗi:</strong> {shareSlip.note || '—'}</p>
          </>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '36px', textAlign: 'center', fontSize: '11px' }}>
            <div style={{ flex: 1 }}>Người giao / nhận<br /><br /><br />(Ký, ghi rõ họ tên)</div>
            <div style={{ flex: 1 }}>Thủ kho<br /><br /><br />(Ký, ghi rõ họ tên)</div>
            <div style={{ flex: 1 }}>Người sửa khoán<br /><br /><br />(Ký, ghi rõ họ tên)</div>
          </div>
          </div>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
