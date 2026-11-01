import React, { useRef, useState, useEffect } from 'react';
import { useApp, type CategoryItem, type SlipItem } from '../context/AppContext';
import { ImageCaptureInput } from './ImageCaptureInput';
import FrameStockReport from './FrameStockReport';
import { getLatestMaterialUnitPrice, matchesMaterialNameSearch } from '../utils/materialSearch';
import { usePersistentFormDraft } from '../hooks/usePersistentFormDraft';
import { useAuth } from '../context/AuthContext';

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

const createAccompanyingMaterialRow = (): AccompanyingMaterialFormRow => ({
  id: `material-${Date.now()}-${Math.random()}`,
  materialId: null,
  materialCode: '',
  materialName: '',
  query: '',
  unit: 'kg',
  quantity: '',
  unitPrice: '',
  isDropdownOpen: false
});

interface StockTransaction {
  id: string;
  type: 'NK' | 'NK_KHUNG' | string;
  slipNo: string;
  date: string;
  contractNo: string;
  sourceContractId?: number | string;
  sourceReturnSlipId?: number | string;
  sourceReturnLineId?: string;
  sourceReturnContractId?: number | string;
  craftGroupLeader?: string;
  returnQuantityInContractUnits?: number;
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  partnerName: string;
  partner?: string;
  note: string;
  image?: string;
  imageProof?: string;
  sizeQuantities?: { [key: string]: number | string };
  accompanyingMaterials?: AccompanyingMaterial[];
  companyReturnLines?: SlipItem['companyReturnLines'];
}

type ReturnAllocationEntry = {
  key: string;
  slip: StockTransaction;
  line: NonNullable<SlipItem['companyReturnLines']>[number];
  allocation: NonNullable<SlipItem['companyReturnLines']>[number]['allocations'][number];
  remaining: number;
};

interface FrameReceiptPreview {
  receipt: StockTransaction;
  contract: any;
  issuedQuantity: number;
  returnedBefore: number;
  returnedThisTime: number;
  returnedAfter: number;
}

interface Props {
  onNavigateToTab?: (tabName: string) => void;
  initialTab?: 'ALL' | 'NK_KHUNG' | 'NK' | 'KS_INCOMPLETE' | 'FRAME_STOCK';
  initialFrameReceiptContractId?: string | number | null;
  onInitialFrameReceiptHandled?: () => void;
}

export default function InventoryManager({
  onNavigateToTab,
  initialTab = 'NK_KHUNG',
  initialFrameReceiptContractId,
  onInitialFrameReceiptHandled
}: Props) {
  const { user } = useAuth();
  const isWarehouseUser = user?.role === 'kho_to_dan';
  const appContext = useApp() as any;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const { formDraftProps, clearDraft } = usePersistentFormDraft('inventory-report-transaction');
  const { 
    contracts = [], 
    materials = [],
    slips = [],
    inventoryLogs = [], 
    addInventoryLog, 
    addSlip,
    updateInventoryLog, 
    updateSlip,
    deleteInventoryLog,
    deleteSlip
  } = appContext || {};

  const masterLogs = (Array.isArray(inventoryLogs) && inventoryLogs.length > 0
    ? inventoryLogs
    : Array.isArray(slips) ? slips : [])
    .filter((item: unknown): item is StockTransaction =>
      Boolean(item) && typeof item === 'object'
    );
  const contractItems = Array.isArray(contracts)
    ? contracts.filter((item: unknown) => Boolean(item) && typeof item === 'object')
    : [];
  const materialItems = Array.isArray(materials)
    ? materials.filter((item: unknown) => Boolean(item) && typeof item === 'object')
    : [];

  const handleAdd = (payload: any) => {
    if (addInventoryLog) addInventoryLog(payload);
    else if (addSlip) addSlip(payload);
  };

  const handleUpdate = (payload: any) => {
    if (updateInventoryLog) updateInventoryLog(payload);
    else if (updateSlip) updateSlip(payload);
  };

  // HÀM XÓA ĐÃ ĐƯỢC CHUẨN HÓA ĐỂ ĐẢM BẢO XÓA THÀNH CÔNG TỪ MỌI NGUỒN CONTEXT
  const handleDelete = (id: any) => {
    if (deleteInventoryLog) deleteInventoryLog(id);
    if (deleteSlip) deleteSlip(id);
  };

  const getTodayISO = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getYear2Digits = () => {
    return new Date().getFullYear().toString().slice(-2);
  };

  const minDateString = getTodayISO();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState<boolean>(true);

  const [transType, setTransType] = useState<'NK_KHUNG' | 'NK'>('NK_KHUNG');
  const [slipNo, setSlipNo] = useState<string>('');
  const [transDate, setTransDate] = useState<string>(minDateString);
  const [contractNo, setContractNo] = useState<string>('');
  const [selectedWeavingGroup, setSelectedWeavingGroup] = useState<string>('');
  const [selectedSubContractId, setSelectedSubContractId] = useState<string>('');
  const [selectedReturnAllocationKey, setSelectedReturnAllocationKey] = useState('');
  const [selectedProductCode, setSelectedProductCode] = useState<string>('');
  const [productName, setProductName] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('1');
  const [partnerName, setPartnerName] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [transactionImage, setTransactionImage] = useState<string>('');

  const [unitOption, setUnitOption] = useState<'BO' | 'CAI' | 'CA_HAI'>('BO');
  const [sizeQuantities, setSizeQuantities] = useState<{ [key: string]: string }>({});
  const [accompanyingMaterials, setAccompanyingMaterials] = useState<AccompanyingMaterialFormRow[]>([
    createAccompanyingMaterialRow()
  ]);

  const [activeTab, setActiveTab] = useState<'ALL' | 'NK_KHUNG' | 'NK' | 'KS_INCOMPLETE' | 'FRAME_STOCK'>(initialTab);
  useEffect(() => {
    if (isWarehouseUser) {
      setActiveTab('FRAME_STOCK');
      setShowForm(false);
    }
  }, [isWarehouseUser]);
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterKeyword, setFilterKeyword] = useState<string>('');
  const [weavingGroupQuery, setWeavingGroupQuery] = useState<string>('');
  const [isSupplementalFrameReceipt, setIsSupplementalFrameReceipt] = useState(false);
  const [historyContract, setHistoryContract] = useState<any | null>(null);
  const [enlargedProofImage, setEnlargedProofImage] = useState<string>('');
  const [frameReceiptPreview, setFrameReceiptPreview] = useState<FrameReceiptPreview | null>(null);
  const frameReceiptPrintAreaRef = useRef<HTMLDivElement>(null);

  const parentContracts = contractItems.filter((c: any) => c.contractType === 'PARENT' || !c.contractType);
  const subContracts = contractItems.filter((c: any) => c.contractType === 'SUB' && !c.isLiquidated);
  const weavingGroups: string[] = Array.from(new Set<string>(
    subContracts.map((contract: any) => String(contract.craftGroupLeader || '').trim()).filter(Boolean)
  ));
  const matchingWeavingGroups = weavingGroups.filter(groupName =>
    groupName.toLowerCase().includes(weavingGroupQuery.trim().toLowerCase())
  );
  const selectedSubContract = subContracts.find((contract: any) =>
    String(contract.id) === selectedSubContractId
  );
  const getMaxSizesFromCode = (codeStr: string): number => {
    if (!codeStr) return 1;
    if (codeStr.includes('/')) {
      const parts = codeStr.trim().split('/');
      const lastPart = parts[parts.length - 1];
      const num = parseInt(lastPart, 10);
      if (!isNaN(num) && num > 1 && num <= 20) return num;
    }
    return 1;
  };
  const getReceiptContractQuantity = (log: StockTransaction, contract?: any) => {
    const quantity = Number(log.quantity) || 0;
    const pieces = Object.values(log.sizeQuantities || {})
      .reduce<number>((sum, value) => sum + (Number(value) || 0), 0);
    const sizesPerSet = getMaxSizesFromCode(String(contract?.productCode || log.productCode || selectedProductCode)) || 1;
    const unit = String(log.unit || '').toLowerCase();
    if (typeof log.returnQuantityInContractUnits === 'number' && Number.isFinite(log.returnQuantityInContractUnits)) {
      return Number(log.returnQuantityInContractUnits);
    }
    if (unit.includes('bộ (') && pieces > 0) return quantity + pieces / sizesPerSet;
    if (unit.includes('cái') || unit.includes('từng size')) {
      return (pieces > 0 ? pieces : quantity) / sizesPerSet;
    }
    return quantity;
  };
  const returnAllocationEntries: ReturnAllocationEntry[] = masterLogs
    .filter(slip => slip.type === 'XUAT_KS_TRA_CTY' && Array.isArray(slip.companyReturnLines))
    .flatMap(slip => (Array.isArray(slip.companyReturnLines) ? slip.companyReturnLines : [])
      .filter(line => line && Array.isArray(line.allocations))
      .flatMap(line => line.allocations
        .filter(allocation => allocation && Number(allocation.quantity) > 0)
        .map(allocation => {
          const key = JSON.stringify([slip.id, line.id, allocation.contractId]);
          const received = masterLogs
            .filter(receipt =>
              receipt.sourceReturnSlipId !== undefined &&
              String(receipt.sourceReturnSlipId) === String(slip.id) &&
              String(receipt.sourceReturnLineId || '') === String(line.id) &&
              String(receipt.sourceReturnContractId || '') === String(allocation.contractId)
            )
            .reduce((sum: number, receipt: StockTransaction) =>
              sum + getReceiptContractQuantity(receipt, undefined), 0);
          const receivedExcludingCurrent = received - masterLogs
            .filter(receipt =>
              String(receipt.id) === String(editingId) &&
              String(receipt.sourceReturnSlipId) === String(slip.id) &&
              String(receipt.sourceReturnLineId || '') === String(line.id) &&
              String(receipt.sourceReturnContractId || '') === String(allocation.contractId)
            )
            .reduce((sum: number, receipt: StockTransaction) =>
              sum + getReceiptContractQuantity(receipt, undefined), 0);
          const remaining = Math.max(0, (Number(allocation.quantity) || 0) - receivedExcludingCurrent);
          return {
            key,
            slip,
            line,
            allocation,
            remaining: remaining <= 1e-8 ? 0 : remaining
          };
        })));
  const availableReturnAllocations = returnAllocationEntries.filter(entry =>
    entry.remaining > 1e-8 || entry.key === selectedReturnAllocationKey
  );
  const selectedReturnAllocation = returnAllocationEntries.find(
    entry => entry.key === selectedReturnAllocationKey
  );
  const maxAllowedSizes = Math.max(
    getMaxSizesFromCode(selectedProductCode),
    Object.keys(selectedReturnAllocation?.line.sizeQuantities || {}).length || 1
  );
  const isSetProduct = selectedSubContract
    ? selectedSubContract.itemTypeOption === 'BO' ||
      selectedSubContract.itemTypeOption === 'CA_HAI' ||
      maxAllowedSizes > 1 ||
      selectedProductCode.toLowerCase().includes('bộ')
    : selectedReturnAllocation?.line.itemTypeOption === 'CA_HAI' ||
      maxAllowedSizes > 1 || selectedProductCode.toLowerCase().includes('bộ');
  const returnSlipReceiptMode = transType === 'NK_KHUNG' && Boolean(selectedReturnAllocation);
  const frameReceiptMode = transType === 'NK_KHUNG' && !isSupplementalFrameReceipt && !returnSlipReceiptMode;
  const trackedFrameReceiptMode = frameReceiptMode || returnSlipReceiptMode;
  const receiptUnitLabel = maxAllowedSizes > 1
    ? 'bộ quy đổi'
    : String(selectedSubContract?.unit || 'Bộ').toLowerCase() === 'cái' ? 'cái' : 'bộ';
  const companyProductCodes = Array.from(new Set(parentContracts.map((c: any) => c.productCode).filter(Boolean)));

  const isCompanyFrameReceipt = (item: StockTransaction) => {
    if (!item || typeof item !== 'object') return false;
    if (item.sourceReturnSlipId || item.sourceContractId || item.craftGroupLeader) return false;
    const slip = String(item.slipNo || '').toUpperCase();
    const type = String(item.type || '').toUpperCase();
    const contractNoKey = String(item.contractNo || '').trim().toLocaleLowerCase('vi');
    const productCodeKey = String(item.productCode || '').trim().toLocaleLowerCase('vi');
    const linkedSubContract = subContracts.some((contract: any) =>
      (item.sourceContractId && String(contract.id) === String(item.sourceContractId)) ||
      (
        contractNoKey &&
        String(contract.contractNo || '').trim().toLocaleLowerCase('vi') === contractNoKey &&
        String(contract.productCode || '').trim().toLocaleLowerCase('vi') === productCodeKey
      )
    );
    if (linkedSubContract) return false;

    const linkedCompanyContract = parentContracts.some((contract: any) =>
      contractNoKey &&
      String(contract.contractNo || '').trim().toLocaleLowerCase('vi') === contractNoKey &&
      String(contract.productCode || '').trim().toLocaleLowerCase('vi') === productCodeKey
    );
    if (linkedCompanyContract) return true;

    const partner = String(item.partnerName || item.partner || '').trim().toLocaleLowerCase('vi');
    const hasCompanyPartner = /\b(cty|công ty|cong ty|artex)\b/i.test(partner);
    if (hasCompanyPartner) return true;
    if (partner) return false;

    const hasCompanyReference = /\b(artex|hđ|hd)\b/i.test(`${item.contractNo || ''} ${item.slipNo || ''}`);
    if (hasCompanyReference) return true;
    return type === 'NK' || type === 'NHAP' || slip.startsWith('NK');
  };

  // TÌM HỢP ĐỒNG ĐỂ TÍNH SỐ LƯỢNG CÒN LẠI
  const matchedContract = transType === 'NK_KHUNG' && !isSupplementalFrameReceipt
    ? selectedSubContract
    : transType === 'NK'
    ? parentContracts.find((c: any) =>
    (contractNo && String(c.contractNo || '').trim().toLowerCase() === contractNo.trim().toLowerCase()) ||
    (!contractNo && String(c.productCode || '').trim().toLowerCase() === selectedProductCode.trim().toLowerCase())
    )
    : undefined;

  const frameIssuedQuantity = selectedSubContract
    ? Math.max(
      Number(selectedSubContract.totalActualExported) || 0,
      (Array.isArray(selectedSubContract.exportLogs) ? selectedSubContract.exportLogs : [])
        .reduce((sum: number, log: any) => sum + (Number(log.actualQty) || 0), 0)
    )
    : 0;
  const totalContractQty = returnSlipReceiptMode
    ? Number(selectedReturnAllocation?.allocation.quantity) || 0
    : transType === 'NK_KHUNG' && !isSupplementalFrameReceipt
    ? frameIssuedQuantity
    : transType === 'NK' && matchedContract
      ? Number(matchedContract.quantity || 0)
      : 0;

  const totalReceivedQty = (returnSlipReceiptMode
    ? masterLogs.filter(log =>
      String(log.sourceReturnSlipId || '') === String(selectedReturnAllocation?.slip.id || '') &&
      String(log.sourceReturnLineId || '') === String(selectedReturnAllocation?.line.id || '') &&
      String(log.sourceReturnContractId || '') === String(selectedReturnAllocation?.allocation.contractId || '') &&
      String(log.id) !== String(editingId)
    )
    : masterLogs
    .filter((l: any) => {
      const isRelevantReceipt = transType === 'NK' ? isCompanyFrameReceipt(l) :
        transType === 'NK_KHUNG' && !isCompanyFrameReceipt(l) &&
          (String(l.slipNo || '').toUpperCase().startsWith('KS') || l.type === 'NK_KHUNG' || l.type === 'KS');
      const matchCode = String(l.productCode || '').trim().toLowerCase() === selectedProductCode.trim().toLowerCase();
      const matchContract = transType === 'NK_KHUNG' && !isSupplementalFrameReceipt && selectedSubContract
        ? (
          String(l.sourceContractId || '') === String(selectedSubContract.id) ||
          (
            !l.sourceContractId &&
            String(l.contractNo || '').trim().toLowerCase() === String(selectedSubContract.contractNo || '').trim().toLowerCase()
          )
        )
        : contractNo ? String(l.contractNo || '').trim().toLowerCase() === contractNo.trim().toLowerCase() : true;
      return isRelevantReceipt && matchCode && matchContract &&
        (transType !== 'NK_KHUNG' || isSupplementalFrameReceipt ||
          !selectedSubContract ||
          String(l.sourceContractId || '') === String(selectedSubContract.id) ||
          (
            !l.sourceContractId &&
            (
              (
                String(l.contractNo || '').trim().toLowerCase() === String(selectedSubContract.contractNo || '').trim().toLowerCase() &&
                Boolean(l.contractNo)
              ) ||
              (
                !l.contractNo &&
                String(l.craftGroupLeader || '').trim().toLowerCase() === String(selectedSubContract.craftGroupLeader || '').trim().toLowerCase()
              )
            )
          )) &&
        String(l.id) !== String(editingId);
    }))
    .reduce((sum: number, l: StockTransaction) => sum + (
      trackedFrameReceiptMode
        ? getReceiptContractQuantity(l, selectedSubContract || matchedContract)
        : Number(l.quantity) || 0
    ), 0);

  const remainingQty = totalContractQty > 0 ? Math.max(0, totalContractQty - totalReceivedQty) : 0;
  const enteredSizeQuantity = Object.values(sizeQuantities)
    .reduce<number>((sum, value) => sum + (Number(value) || 0), 0);
  const currentReturnQuantity = trackedFrameReceiptMode && isSetProduct
    ? unitOption === 'BO'
      ? Number(quantity) || 0
      : unitOption === 'CAI'
        ? enteredSizeQuantity / maxAllowedSizes
        : (Number(quantity) || 0) + enteredSizeQuantity / maxAllowedSizes
    : Number(quantity) || 0;
  const remainingAfterCurrentReturn = Math.max(0, totalContractQty - totalReceivedQty - currentReturnQuantity);
  const isFrameReceiptOverLimit = trackedFrameReceiptMode &&
    (Boolean(selectedSubContract) || returnSlipReceiptMode) &&
    currentReturnQuantity > remainingQty + (returnSlipReceiptMode ? 1e-8 : 0);
  const isCompanyReceiptOverLimit = transType === 'NK' &&
    totalContractQty > 0 &&
    currentReturnQuantity > remainingQty;

  useEffect(() => {
    if (initialFrameReceiptContractId === undefined || initialFrameReceiptContractId === null) return;
    const contract = parentContracts.find(
      (item: any) => String(item.id) === String(initialFrameReceiptContractId)
    );
    if (!contract) return;
    const contractNoKey = String(contract.contractNo || '').trim().toLowerCase();
    const codeKey = String(contract.productCode || '').trim().toLowerCase();
    const received = masterLogs
      .filter((log: any) => {
        if (!isCompanyFrameReceipt(log)) return false;
        const logContractNo = String(log.contractNo || '').trim().toLowerCase();
        if (logContractNo) return logContractNo === contractNoKey;
        const matchingContracts = parentContracts.filter(
          (item: any) => String(item.productCode || '').trim().toLowerCase() === codeKey
        );
        return matchingContracts.length === 1 &&
          String(log.productCode || '').trim().toLowerCase() === codeKey;
      })
      .reduce((sum: number, log: any) => sum + getReceiptContractQuantity(log, contract), 0);
    const remaining = Math.max(0, (Number(contract.quantity) || 0) - received);

    setEditingId(null);
    setIsSupplementalFrameReceipt(true);
    setTransType('NK');
    setTransDate(getTodayISO());
    setContractNo(String(contract.contractNo || ''));
    setSelectedWeavingGroup('');
    setWeavingGroupQuery('');
    setSelectedSubContractId('');
    setSelectedReturnAllocationKey('');
    setSelectedProductCode(String(contract.productCode || ''));
    setProductName(String(contract.productName || ''));
    setPartnerName(String(contract.companyName || contract.company || ''));
    setQuantity(String(remaining || ''));
    setNote('');
    setTransactionImage('');
    setSizeQuantities({});
    setAccompanyingMaterials([createAccompanyingMaterialRow()]);
    setShowForm(true);
    setActiveTab('NK_KHUNG');
    onInitialFrameReceiptHandled?.();
  }, [initialFrameReceiptContractId, contracts, masterLogs, onInitialFrameReceiptHandled]);

  useEffect(() => {
    if (selectedProductCode && isSetProduct) {
      const newMap: { [key: string]: string } = {};
      const contractSizeKeys = Object.keys(
        selectedSubContract?.sizeQuantities || selectedReturnAllocation?.line.sizeQuantities || {}
      );
      const sizeKeys = contractSizeKeys.length
        ? contractSizeKeys
        : Array.from({ length: maxAllowedSizes }, (_, index) => `Cái ${index + 1}`);
      sizeKeys.forEach(sizeName => {
        newMap[sizeName] = selectedReturnAllocation && !editingId
          ? ''
          : sizeQuantities[sizeName] || '';
      });
      setSizeQuantities(newMap);
    }
  }, [selectedProductCode, isSetProduct, selectedSubContractId, selectedReturnAllocationKey, editingId]);

  const generateSlipNo = (type: 'NK' | 'NK_KHUNG', partner: string) => {
    const yearShort = getYear2Digits();
    const cleanPartner = partner 
      ? partner.toUpperCase().replace(/(CTY|CÔNG TY|CP|CỔ PHẦN|TNHH)/g, '').trim().split(/\s+/)[0] || 'ARTEX' 
      : 'ARTEX';
      
    const count = masterLogs.filter((l: any) => {
      const s = String(l.slipNo || '').toUpperCase();
      const t = String(l.type || '').toUpperCase();
      if (type === 'NK_KHUNG') return s.startsWith('KS') || t === 'NK_KHUNG' || t === 'KS';
      return s.startsWith('NK') || t === 'NK' || t === 'NHAP';
    }).length + 1;
    
    const seq = count < 10 ? `0${count}` : `${count}`;

    if (type === 'NK_KHUNG') {
      return `KS-${seq}-${cleanPartner}-${yearShort}`;
    } else if (type === 'NK') {
      return `NK-${seq}/${yearShort}`;
    }
    return `NK-${seq}/${yearShort}`;
  };

  useEffect(() => {
    if (!editingId) {
      setSlipNo(generateSlipNo(transType, partnerName));
    }
  }, [transType, partnerName, editingId, masterLogs]);

  const handleProductSelect = (code: string) => {
    setSelectedProductCode(code);
    if (!code.trim()) return;

    const matched = parentContracts.find((c: any) => String(c.productCode || '').trim().toLowerCase() === code.trim().toLowerCase());
    
    if (matched) {
      setProductName(matched.productName || '');
      setContractNo(matched.contractNo || '');
      if (matched.companyName && matched.companyName !== 'Nội bộ Tổ Đan') {
        setPartnerName(matched.companyName);
      }
    } else {
      const confirmJump = window.confirm(
        `⚠️ Mã hàng [${code}] chưa có trong danh sách Hợp Đồng CTY!\n\n` +
        `Bạn có muốn chuyển sang giao diện "Tạo HĐ CTY" để tạo hợp đồng trước không?`
      );

      if (confirmJump) {
        if (onNavigateToTab) {
          onNavigateToTab('PARENT');
        } else {
          alert('Vui lòng chọn Tab "1. Tạo HĐ CTY" ở menu chính để khởi tạo hợp đồng này!');
        }
      }
    }
  };

  const handleReset = () => {
    clearDraft();
    setEditingId(null);
    setIsSupplementalFrameReceipt(false);
    setSelectedReturnAllocationKey('');
    setSelectedProductCode('');
    setProductName('');
    setContractNo('');
    setSelectedWeavingGroup('');
    setWeavingGroupQuery('');
    setSelectedSubContractId('');
    setQuantity('1');
    setNote('');
    setTransactionImage('');
    setPartnerName('');
    setSizeQuantities({});
    setAccompanyingMaterials([createAccompanyingMaterialRow()]);
    setTransDate(getTodayISO());
    setTransType('NK_KHUNG');
  };

  const handleEditItem = (item: StockTransaction) => {
    setEditingId(item.id);
    const isCompanyReceipt = isCompanyFrameReceipt(item);
    const isReturnSlipReceipt = Boolean(item.sourceReturnSlipId);
    const isFrameReceipt = !isCompanyReceipt && isKhungItem(item);
    const linkedSubContract = isReturnSlipReceipt ? undefined : subContracts.find((contract: any) =>
      (item.sourceContractId && String(contract.id) === String(item.sourceContractId)) ||
      (
        String(contract.contractNo || '').trim().toLowerCase() === String(item.contractNo || '').trim().toLowerCase() &&
        String(contract.productCode || '').trim().toLowerCase() === String(item.productCode || '').trim().toLowerCase()
      )
    );
    setIsSupplementalFrameReceipt(!isReturnSlipReceipt && ((isFrameReceipt && !linkedSubContract) ||
      (isCompanyReceipt && (item.type === 'NK_KHUNG' || String(item.slipNo).toUpperCase().startsWith('KS')))));
    setSelectedReturnAllocationKey(isReturnSlipReceipt
      ? JSON.stringify([item.sourceReturnSlipId, item.sourceReturnLineId || '', item.sourceReturnContractId || ''])
      : '');
    setSelectedWeavingGroup(linkedSubContract ? String(linkedSubContract.craftGroupLeader || '') : item.craftGroupLeader || '');
    setWeavingGroupQuery(linkedSubContract ? String(linkedSubContract.craftGroupLeader || '') : item.craftGroupLeader || '');
    setSelectedSubContractId(linkedSubContract ? String(linkedSubContract.id) : '');
    setTransType(isReturnSlipReceipt ? 'NK_KHUNG' : isCompanyReceipt ? 'NK' : isFrameReceipt ? 'NK_KHUNG' : item.type as any);
    setSlipNo(item.slipNo);
    setTransDate(item.date);
    setContractNo(item.contractNo || '');
    setSelectedProductCode(item.productCode || '');
    setProductName(item.productName || '');
    setQuantity(String(item.quantity || 1));
    setPartnerName(item.partnerName || item.partner || '');
    setNote(item.note || '');
    setTransactionImage(item.image || item.imageProof || '');
    setAccompanyingMaterials(Array.isArray(item.accompanyingMaterials) && item.accompanyingMaterials.length
      ? item.accompanyingMaterials.filter(Boolean).map((material, index) => ({
      id: `${item.id}-material-${index}`,
      materialId: material.materialId,
      materialCode: material.materialCode,
      materialName: material.materialName,
      query: `${material.materialCode} - ${material.materialName}`,
      unit: material.unit,
      quantity: String(material.quantity),
      unitPrice: String(Number(material.unitPrice) || 0),
      isDropdownOpen: false
    })) : [createAccompanyingMaterialRow()]);
    setShowForm(true);

    if (item.unit?.includes('Cả Bộ') || item.unit?.includes('Bộ (')) {
      setUnitOption('CA_HAI');
    } else if (item.unit?.includes('Từng Size') || item.unit?.includes('Cái')) {
      setUnitOption('CAI');
    } else {
      setUnitOption('BO');
    }

    if (item.sizeQuantities) {
      const strMap: { [key: string]: string } = {};
      Object.keys(item.sizeQuantities).forEach(k => {
        strMap[k] = String(item.sizeQuantities![k]);
      });
      setSizeQuantities(strMap);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

const handleSaveTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (submissionLock.current) return;
    if (!selectedProductCode) {
      alert('Vui lòng chọn hoặc nhập Mã Hàng!');
      return;
    }
    if (transType === 'NK_KHUNG' && !isSupplementalFrameReceipt && !returnSlipReceiptMode && !selectedSubContract) {
      alert('Vui lòng chọn Tên Tổ Đan và hợp đồng/mã hàng tương ứng trước khi nhập khung.');
      return;
    }
    if (frameReceiptMode && !weavingGroups.some(group =>
      group.trim().toLowerCase() === selectedWeavingGroup.trim().toLowerCase()
    )) {
      alert('Vui lòng chọn Tổ Đan từ danh sách hợp đồng đang hoạt động.');
      return;
    }
    if ((frameReceiptMode || returnSlipReceiptMode) && totalContractQty <= 0) {
      alert('Hợp đồng Tổ Đan chưa ghi nhận số khung đã phát. Chưa thể lập phiếu nhận khung.');
      return;
    }

    let totalQtyNum = Number(quantity) || 0;
    let finalUnit = 'Cái';
    let detailParts: string[] = [];

    if (isSetProduct) {
      if (unitOption === 'BO') {
        finalUnit = 'Bộ';
      } else if (unitOption === 'CAI' || unitOption === 'CA_HAI') {
        let caiTotal = 0;
        Object.keys(sizeQuantities).forEach(s => {
          const q = Number(sizeQuantities[s]) || 0;
          if (q > 0) {
            caiTotal += q;
            detailParts.push(`${q} ${s.toLowerCase()}`);
          }
        });

        if (unitOption === 'CAI') {
          totalQtyNum = caiTotal > 0 ? caiTotal : totalQtyNum;
          finalUnit = detailParts.length > 0 ? detailParts.join(', ') : 'Cái (Từng Size)';
        } else {
          finalUnit = `Bộ (${totalQtyNum} bộ) + [${detailParts.join(', ')}]`;
        }
      }
    }

    if ((trackedFrameReceiptMode ? currentReturnQuantity : totalQtyNum) <= 0) {
      alert('Số lượng phải lớn hơn 0!');
      return;
    }
    if (trackedFrameReceiptMode && isSetProduct && unitOption === 'CAI' && enteredSizeQuantity <= 0) {
      alert('Vui lòng nhập số lượng khung trả theo từng cái/size.');
      return;
    }

    const rowsWithInput = accompanyingMaterials.filter(row =>
      row.query.trim() || row.quantity.trim() || row.unitPrice.trim() || row.materialId !== null
    );
    if (rowsWithInput.some(row =>
      row.materialId === null ||
      !Number.isFinite(Number(row.quantity)) || Number(row.quantity) <= 0 ||
      !row.unitPrice.trim() || !Number.isFinite(Number(row.unitPrice)) || Number(row.unitPrice) < 0
    )) {
      alert('Vui lòng chọn nguyên phụ liệu, nhập số lượng lớn hơn 0 và đơn giá hợp lệ cho từng dòng!');
      return;
    }
    const savedAccompanyingMaterials: AccompanyingMaterial[] = rowsWithInput.flatMap(row => {
      if (row.materialId === null) return [];
      const material = materialItems.find((item: CategoryItem) => item.id === row.materialId);
      return [{
        materialId: row.materialId,
        materialCode: material?.code || row.materialCode,
        materialName: material?.name || row.materialName,
        quantity: Number(row.quantity),
        unitPrice: Number(row.unitPrice),
        amount: Number(row.quantity) * Number(row.unitPrice),
        unit: row.unit
      }];
    });

    // Chặn số lượng nhập vượt quá số khung đã phát trong hợp đồng tương ứng.
    const quantityToValidate = trackedFrameReceiptMode ? currentReturnQuantity : totalQtyNum;
    const allowedMax = remainingQty;
    if ((transType === 'NK' || transType === 'NK_KHUNG') &&
      totalContractQty > 0 && quantityToValidate > allowedMax + (returnSlipReceiptMode ? 1e-8 : 0)) {
      alert(
        `❌ KHÔNG THỂ LƯU PHIẾU!\n\n` +
        `• Tổng số lượng theo Hợp đồng: ${totalContractQty}\n` +
        `• Đã nhận trước đó: ${totalReceivedQty}\n` +
        `• Còn lại chưa nhận: ${remainingQty}\n\n` +
        `Số lượng bạn nhập vượt quá hạn mức còn lại của hợp đồng!`
      );
      return;
    }

    const finalSlipNo = slipNo || generateSlipNo(transType, partnerName);
    submissionLock.current = true;
    setIsSubmitting(true);

    const payload: StockTransaction = {
      id: editingId || `TRANS-${crypto.randomUUID()}`,
      type: transType,
      slipNo: finalSlipNo,
      date: transDate,
      contractNo,
      sourceContractId: transType === 'NK_KHUNG' && frameReceiptMode
        ? selectedSubContract?.id
        : undefined,
      sourceReturnSlipId: returnSlipReceiptMode ? selectedReturnAllocation?.slip.id : undefined,
      sourceReturnLineId: returnSlipReceiptMode ? String(selectedReturnAllocation?.line.id || '') : undefined,
      sourceReturnContractId: returnSlipReceiptMode ? selectedReturnAllocation?.allocation.contractId : undefined,
      craftGroupLeader: transType === 'NK_KHUNG' && frameReceiptMode
        ? String(selectedSubContract?.craftGroupLeader || selectedWeavingGroup)
        : returnSlipReceiptMode ? String(selectedReturnAllocation?.line.artisanName || '') : undefined,
      returnQuantityInContractUnits: trackedFrameReceiptMode
        ? currentReturnQuantity
        : undefined,
      productCode: selectedProductCode,
      productName,
      quantity: totalQtyNum,
      unit: finalUnit,
      partnerName,
      partner: partnerName,
      note,
      image: transactionImage,
      imageProof: transactionImage,
      sizeQuantities: (isSetProduct && (unitOption === 'CAI' || unitOption === 'CA_HAI')) ? sizeQuantities : undefined,
      accompanyingMaterials: savedAccompanyingMaterials
    };

    const savedAsFrameReturn = frameReceiptMode && Boolean(selectedSubContract);
    if (editingId) {
      handleUpdate(payload);
    } else {
      handleAdd(payload);
    }
    clearDraft();

    if (savedAsFrameReturn && selectedSubContract) {
      setFrameReceiptPreview({
        receipt: payload,
        contract: selectedSubContract,
        issuedQuantity: totalContractQty,
        returnedBefore: totalReceivedQty,
        returnedThisTime: currentReturnQuantity,
        returnedAfter: totalReceivedQty + currentReturnQuantity
      });
      setActiveTab('NK_KHUNG');
    } else {
      alert(`✅ Đã lưu phiếu [${finalSlipNo}] vào hệ thống thành công!`);
      handleReset();
      setActiveTab(isSupplementalFrameReceipt ? 'KS_INCOMPLETE' : transType === 'NK_KHUNG' ? 'NK_KHUNG' : transType);
    }
    window.setTimeout(() => {
      submissionLock.current = false;
      setIsSubmitting(false);
    }, 700);
  };

  const formatDateVN = (dateStr: string) => {
    if (!dateStr) return '';
    const normalizedDate = String(dateStr);
    const parts = normalizedDate.split('T')[0].split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return normalizedDate;
  };

  const isKhungItem = (i: any) => {
    if (!i) return false;
    if (i.sourceReturnSlipId || i.sourceContractId || i.craftGroupLeader) return true;
    const slip = String(i.slipNo || '').toUpperCase();
    const type = String(i.type || '').toUpperCase();
    if (isCompanyFrameReceipt(i)) return false;
    return slip.startsWith('KS') || type === 'NK_KHUNG' || type === 'KS';
  };

  const isNKItem = (i: any) => {
    if (!i) return false;
    return isCompanyFrameReceipt(i) && !i.sourceReturnSlipId;
  };

  const managedReceiptLogs = masterLogs.filter(item => isNKItem(item) || isKhungItem(item));
  const countAll = managedReceiptLogs.length;
  const countKhungSon = managedReceiptLogs.filter(isKhungItem).length;
  const countNK = managedReceiptLogs.filter(isNKItem).length;

  const getContractFrameLogs = (contract: any) => {
    const contractNoKey = String(contract.contractNo || '').trim().toLowerCase();
    const codeKey = String(contract.productCode || '').trim().toLowerCase();
    return masterLogs
      .filter((log: any) => {
        if (!isCompanyFrameReceipt(log)) return false;
        const logContractNo = String(log.contractNo || '').trim().toLowerCase();
        if (logContractNo) return logContractNo === contractNoKey;
        const matchingContracts = parentContracts.filter(
          (parent: any) => String(parent.productCode || '').trim().toLowerCase() === codeKey
        );
        return matchingContracts.length === 1 &&
          String(log.productCode || '').trim().toLowerCase() === codeKey;
      })
      .sort((a: any, b: any) =>
        String(a.date || '').localeCompare(String(b.date || '')) ||
        String(a.slipNo || '').localeCompare(String(b.slipNo || ''))
      );
  };

  const getSubContractForReceipt = (item: StockTransaction) => subContracts.find((contract: any) =>
    (item.sourceContractId && String(contract.id) === String(item.sourceContractId)) ||
    (
      Boolean(item.contractNo) &&
      String(contract.contractNo || '').trim().toLowerCase() === String(item.contractNo || '').trim().toLowerCase() &&
      String(contract.productCode || '').trim().toLowerCase() === String(item.productCode || '').trim().toLowerCase()
    ) ||
    (
      !item.contractNo &&
      String(contract.craftGroupLeader || '').trim().toLowerCase() ===
        String(item.craftGroupLeader || item.partnerName || item.partner || '').trim().toLowerCase() &&
      String(contract.productCode || '').trim().toLowerCase() === String(item.productCode || '').trim().toLowerCase()
    )
  );

  const getReturnedQuantityForSubContract = (contract: any) => masterLogs
    .filter((log: StockTransaction) => {
      if (log.sourceReturnSlipId) return false;
      if (!isKhungItem(log)) return false;
      if (log.sourceContractId) return String(log.sourceContractId) === String(contract.id);
      const sameCode = String(log.productCode || '').trim().toLowerCase() ===
        String(contract.productCode || '').trim().toLowerCase();
      if (!sameCode) return false;
      if (log.contractNo) {
        return String(log.contractNo).trim().toLowerCase() === String(contract.contractNo || '').trim().toLowerCase();
      }
      return String(log.craftGroupLeader || log.partnerName || log.partner || '').trim().toLowerCase() ===
        String(contract.craftGroupLeader || '').trim().toLowerCase();
    })
    .reduce((sum: number, log: StockTransaction) => sum + getReceiptContractQuantity(log, contract), 0);

  const handleSendFrameReceiptToZalo = async (
    item: StockTransaction,
    contractOverride?: any,
    receiptStats?: { issued: number; returned: number }
  ) => {
    window.open('https://chat.zalo.me/', '_blank', 'noopener,noreferrer');

    const linkedContract = contractOverride || getSubContractForReceipt(item);
    const contract = linkedContract || {
      craftGroupLeader: item.craftGroupLeader || item.partnerName || item.partner || '',
      contractNo: item.contractNo || '',
      parentContractNo: item.contractNo || '',
      productCode: item.productCode || '',
      productName: item.productName || '',
      unit: item.unit || 'Bộ'
    };
    const issuedQuantity = receiptStats?.issued ?? (linkedContract
      ? Math.max(
        Number(contract.totalActualExported) || 0,
        (Array.isArray(contract.exportLogs) ? contract.exportLogs : [])
          .reduce((sum: number, log: any) => sum + (Number(log.actualQty) || 0), 0)
      )
      : 0);
    const returnedAfter = receiptStats?.returned ?? (
      linkedContract ? getReturnedQuantityForSubContract(contract) : 0
    );
    const returnedThisTime = item.returnQuantityInContractUnits !== undefined
      ? Number(item.returnQuantityInContractUnits) || 0
      : getReceiptContractQuantity(item, contract);
    const returnedBefore = Math.max(0, returnedAfter - returnedThisTime);

    setFrameReceiptPreview({
      receipt: item,
      contract,
      issuedQuantity,
      returnedBefore,
      returnedThisTime,
      returnedAfter
    });
    try {
      if (!frameReceiptPrintAreaRef.current) {
        await new Promise<void>(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
      }
      const previewElement = frameReceiptPrintAreaRef.current;
      if (!previewElement) {
        throw new Error('Không tìm thấy nội dung xem trước để xuất ảnh phiếu.');
      }

      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(previewElement, {
        scale: Math.max(2, window.devicePixelRatio || 1),
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        onclone: (_document, clonedElement) => {
          clonedElement.style.height = `${previewElement.scrollHeight}px`;
          clonedElement.style.maxHeight = 'none';
          clonedElement.style.overflow = 'visible';
        }
      });
      const imageBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('Trình duyệt không tạo được ảnh PNG từ phiếu.'));
        }, 'image/png');
      });
      const imageFileName = `${String(item.slipNo || 'phieu-nhap-khung').replace(/[^\w-]+/g, '_')}.png`;

      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': imageBlob })
          ]);
          window.alert('Đã mở Zalo và sao chép ảnh phiếu vào clipboard. Hãy dán ảnh trong cuộc trò chuyện để gửi.');
          return;
        } catch (clipboardError) {
          console.error('Không thể sao chép ảnh phiếu vào clipboard; sẽ tải ảnh xuống:', clipboardError);
        }
      }

      const imageUrl = URL.createObjectURL(imageBlob);
      const downloadLink = document.createElement('a');
      downloadLink.href = imageUrl;
      downloadLink.download = imageFileName;
      downloadLink.click();
      window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1000);
      window.alert('Đã mở Zalo và tải ảnh phiếu PNG xuống. Hãy đính kèm ảnh vừa tải để gửi.');
    } catch (imageError) {
      console.error('Không thể xuất ảnh phiếu nhập khung:', imageError);
      window.alert(imageError instanceof Error
        ? `Đã mở Zalo nhưng không xuất được ảnh phiếu: ${imageError.message}`
        : 'Đã mở Zalo nhưng không xuất được ảnh phiếu. Vui lòng thử lại.');
    }
  };

  const frameContractProgress: Array<{
    contract: any;
    receiptLogs: any[];
    receivedQty: number;
    contractQty: number;
    remainingQty: number;
    isComplete: boolean;
  }> = parentContracts.map((contract: any) => {
    const receiptLogs = getContractFrameLogs(contract);
    const receivedQty = receiptLogs.reduce(
      (sum: number, log: any) => sum + getReceiptContractQuantity(log, contract),
      0
    );
    const contractQty = Number(contract.quantity) || 0;
    return {
      contract,
      receiptLogs,
      receivedQty,
      contractQty,
      remainingQty: Math.max(0, contractQty - receivedQty),
      isComplete: contractQty > 0 && receivedQty >= contractQty
    };
  });
  const incompleteFrameContracts = frameContractProgress.filter(progress => progress.remainingQty > 0);
  const selectedContractReceiptCount = matchedContract ? getContractFrameLogs(matchedContract).length : 0;

  const startSupplementalFrameReceipt = (contract: any) => {
    setEditingId(null);
    setIsSupplementalFrameReceipt(true);
    setTransType('NK');
    setTransDate(getTodayISO());
    setContractNo(String(contract.contractNo || ''));
    setSelectedProductCode(String(contract.productCode || ''));
    setProductName(String(contract.productName || ''));
    setPartnerName(String(contract.companyName || contract.company || contract.partner || ''));
    setQuantity('1');
    setNote('');
    setTransactionImage('');
    setSizeQuantities({});
    setShowForm(true);
    setActiveTab('KS_INCOMPLETE');
  };

  const filteredLogs = managedReceiptLogs.filter((item: StockTransaction) => {
    if (activeTab === 'KS_INCOMPLETE') return false;
    if (activeTab === 'NK_KHUNG' && !isKhungItem(item)) return false;
    if (activeTab === 'NK' && !isNKItem(item)) return false;

    if (filterDate && !String(item.date || '').includes(filterDate)) return false;

    if (filterKeyword) {
      const kw = filterKeyword.toLowerCase();
      return (
        String(item.slipNo || '').toLowerCase().includes(kw) ||
        String(item.productCode || '').toLowerCase().includes(kw) ||
        String(item.productName || '').toLowerCase().includes(kw) ||
        String(item.partnerName || item.partner || '').toLowerCase().includes(kw) ||
        String(item.contractNo || '').toLowerCase().includes(kw)
      );
    }
    return true;
  });

  return (
    <div style={{ padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>
          📦 Quản Lý Phiếu Nhập
        </h2>
        <button
          type="button"
          onClick={() => { setShowForm(!showForm); if (showForm) handleReset(); }}
          hidden={activeTab === 'FRAME_STOCK' || isWarehouseUser}
          style={{ padding: '8px 16px', backgroundColor: showForm ? '#dc2626' : '#10b981', color: '#fff', fontWeight: 'bold', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px' }}
        >
          {showForm ? '✖ Đóng Form' : activeTab === 'NK_KHUNG' ? '＋ Thêm Phiếu Nhập KS' : '＋ Lập Phiếu Nhập / Xuất Mới'}
        </button>
      </div>

      <datalist id="companyProductList">
        {companyProductCodes.map((code: any, idx: number) => (
          <option key={idx} value={code} />
        ))}
      </datalist>
      <datalist id="weavingGroupList">
        {matchingWeavingGroups.map(groupName => <option key={groupName} value={groupName} />)}
      </datalist>

      {/* FORM LẬP / SỬA PHIẾU */}
      {showForm && activeTab !== 'FRAME_STOCK' && (
        <form {...formDraftProps} onSubmit={handleSaveTransaction} style={{ backgroundColor: editingId ? '#fffbe3' : '#f8fafc', padding: '20px', borderRadius: '10px', border: editingId ? '2px solid #f59e0b' : '1px solid #cbd5e1', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: editingId ? '#b45309' : '#0369a1', margin: 0 }}>
              {editingId
                ? `✏️ Cập Nhật Phiếu [${slipNo}]`
                : isSupplementalFrameReceipt
                  ? `📥 Nhập khung lần ${selectedContractReceiptCount + 1} · ${contractNo}`
                    : transType === 'NK_KHUNG'
                      ? '➕ Nhập KS Cty - Tổ Đan - Nhập KS Trả Lại'
                      : '➕ Lập Phiếu Kho Mới'}
            </h3>
            {editingId && (
              <button type="button" onClick={handleReset} style={{ padding: '4px 12px', backgroundColor: '#64748b', color: '#fff', fontSize: '12px', fontWeight: 'bold', borderRadius: '4px', border: 'none', cursor: 'pointer' }}>
                ❌ Hủy Chế Độ Sửa
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>Loại Phiếu:</label>
              <select
                value={transType}
                onChange={e => {
                  setTransType(e.target.value as any);
                  setSelectedReturnAllocationKey('');
                  setIsSupplementalFrameReceipt(false);
                }}
                disabled={isSupplementalFrameReceipt}
                style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '2px solid #0284c7', fontWeight: 'bold', fontSize: '13px', backgroundColor: '#fff', boxSizing: 'border-box' }}
              >
                <option value="NK">📥 Nhập Khung Từ CTY (NK)</option>
                <option value="NK_KHUNG">📥 Nhập KS Cty - Tổ Đan - Nhập KS Trả Lại</option>
              </select>
            </div>

            {transType === 'NK_KHUNG' && !isSupplementalFrameReceipt && (
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: '#7c3aed' }}>
                  Phiếu trả khung cần nhập:
                </label>
                <select
                  value={selectedReturnAllocationKey}
                  onChange={event => {
                    const key = event.target.value;
                    setSelectedReturnAllocationKey(key);
                    setSelectedSubContractId('');
                    if (!key) return;
                    const entry = returnAllocationEntries.find(option => option.key === key);
                    if (!entry) return;
                    setSelectedWeavingGroup('');
                    setWeavingGroupQuery('');
                    setContractNo(String(entry.allocation.contractNo || ''));
                    setSelectedProductCode(String(entry.line.productCode || ''));
                    setProductName(String(entry.line.productName || ''));
                    setPartnerName(String(entry.allocation.companyName || ''));
                    setUnitOption('BO');
                    setQuantity(String(entry.remaining));
                    setSizeQuantities(Object.fromEntries(
                      Object.keys(entry.line.sizeQuantities || {}).map(size => [size, ''])
                    ));
                  }}
                  style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '2px solid #7c3aed', backgroundColor: '#fff', fontWeight: 'bold', color: '#7c3aed', boxSizing: 'border-box' }}
                >
                  <option value="">-- Chọn phiếu trả khung (chỉ hiện phiếu còn số lượng) --</option>
                  {availableReturnAllocations.map(entry => (
                    <option key={entry.key} value={entry.key}>
                      {entry.slip.slipNo} · {entry.line.productCode} · {entry.line.artisanName || 'Tổ đan'} → {entry.allocation.companyName || 'Công ty'} · HĐ {entry.allocation.contractNo || '—'} · Còn {entry.remaining.toLocaleString()} bộ
                    </option>
                  ))}
                </select>
                {availableReturnAllocations.length === 0 && (
                  <small style={{ display: 'block', marginTop: '5px', color: '#64748b' }}>
                    Không còn phiếu trả khung nào chưa nhập đủ. Có thể tiếp tục nhập trực tiếp từ tổ đan bên dưới.
                  </small>
                )}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>Số Phiếu (Tự sinh):</label>
              <input
                type="text"
                readOnly
                value={slipNo}
                style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 'bold', color: '#0369a1', backgroundColor: '#e0f2fe', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>

            {returnSlipReceiptMode && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: '#7c3aed' }}>Tổ Đan trả khung:</label>
                <input
                  type="text"
                  readOnly
                  value={String(selectedReturnAllocation?.line.artisanName || '')}
                  style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#f5f3ff', color: '#7c3aed', fontWeight: 'bold', boxSizing: 'border-box' }}
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: '#047857' }}>📅 Ngày Nhận Khung:</label>
              <input
                type="date"
                required
                value={transDate}
                onChange={e => setTransDate(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #10b981', fontWeight: 'bold', fontSize: '13px', backgroundColor: '#fff', color: '#047857', boxSizing: 'border-box' }}
              />
            </div>

            {frameReceiptMode && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: '#7c3aed' }}>Tên Tổ Đan:</label>
                <input
                  type="search"
                  list="weavingGroupList"
                  autoComplete="off"
                  placeholder="Gõ để tìm Tổ Đan..."
                  required
                  value={weavingGroupQuery}
                  onChange={event => {
                    const query = event.target.value;
                    setWeavingGroupQuery(query);
                    setSelectedWeavingGroup(query);
                    setSelectedSubContractId('');
                    setContractNo('');
                    setSelectedProductCode('');
                    setProductName('');
                    setPartnerName(query);
                    setSizeQuantities({});
                    setQuantity('1');
                  }}
                  style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontWeight: 'bold', color: '#7c3aed', boxSizing: 'border-box' }}
                />
                {weavingGroups.length === 0 && <small style={{ display: 'block', marginTop: '5px', color: '#b91c1c' }}>Chưa có hợp đồng Tổ Đan đang hoạt động.</small>}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>{frameReceiptMode ? 'Số Hợp Đồng Đan:' : 'Mã Hợp Đồng CTY:'}</label>
              <input
                type="text"
                readOnly={frameReceiptMode || returnSlipReceiptMode || isSupplementalFrameReceipt}
                placeholder={frameReceiptMode ? 'Tự động theo Tổ Đan và Mã Hàng' : 'VD: HĐ-03-ARTEX-26'}
                value={contractNo}
                onChange={e => setContractNo(e.target.value)}
                style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 'bold', color: '#1e40af', backgroundColor: frameReceiptMode || returnSlipReceiptMode ? '#eff6ff' : '#fff', boxSizing: 'border-box' }}
              />
            </div>

          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: '#7c3aed' }}>{frameReceiptMode ? 'Mã Hàng / Hợp Đồng:' : 'Mặt Hàng (Từ HĐ Cty):'}</label>
              {frameReceiptMode ? (
                <select
                  required
                  value={selectedSubContractId}
                  disabled={!weavingGroups.some(group =>
                    group.trim().toLowerCase() === selectedWeavingGroup.trim().toLowerCase()
                  )}
                  onChange={event => {
                    const selected = subContracts.find((contract: any) => String(contract.id) === event.target.value);
                    setSelectedSubContractId(event.target.value);
                    setSelectedProductCode(String(selected?.productCode || ''));
                    setProductName(String(selected?.productName || ''));
                    setContractNo(String(selected?.contractNo || ''));
                    setPartnerName(String(selected?.craftGroupLeader || selectedWeavingGroup));
                    setSelectedWeavingGroup(String(selected?.craftGroupLeader || selectedWeavingGroup));
                    setWeavingGroupQuery(String(selected?.craftGroupLeader || selectedWeavingGroup));
                    const option = selected?.itemTypeOption || 'BO';
                    setUnitOption(option === 'CAI' || option === 'CA_HAI' ? option : 'BO');
                    setSizeQuantities(Object.fromEntries(
                      Object.keys(selected?.sizeQuantities || {}).map(sizeName => [sizeName, ''])
                    ));
                    setQuantity('1');
                  }}
                  style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '2px solid #7c3aed', backgroundColor: '#fff', fontWeight: 'bold', color: '#7c3aed', fontSize: '13px', boxSizing: 'border-box' }}
                >
                  <option value="">-- Chọn Mã Hàng / HĐ Đan --</option>
                  {subContracts
                    .filter((contract: any) =>
                      String(contract.craftGroupLeader || '').trim().toLowerCase() === selectedWeavingGroup.trim().toLowerCase()
                    )
                    .map((contract: any) => (
                      <option key={contract.id} value={String(contract.id)}>
                        {contract.productCode} · {contract.contractNo}
                      </option>
                    ))}
                </select>
              ) : (
                <input
                  type="text"
                  required
                  readOnly={returnSlipReceiptMode || isSupplementalFrameReceipt}
                  list={isSupplementalFrameReceipt ? undefined : 'companyProductList'}
                  placeholder="Gõ hoặc chọn Mã Hàng..."
                  value={selectedProductCode}
                  onChange={e => handleProductSelect(e.target.value)}
                  style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '2px solid #7c3aed', fontWeight: 'bold', color: '#7c3aed', fontSize: '13px', boxSizing: 'border-box' }}
                />
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>Tên Mặt Hàng:</label>
              <input
                type="text"
                readOnly
                value={productName}
                placeholder="Tên tự nhảy..."
                style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#e2e8f0', color: '#334155', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>{frameReceiptMode ? 'Tổ Đan:' : 'Cty Đối Tác / Tổ Đan:'}</label>
              <input
                type="text"
                readOnly={frameReceiptMode || returnSlipReceiptMode || isSupplementalFrameReceipt}
                placeholder="VD: Cty Artex..."
                value={partnerName}
                onChange={e => setPartnerName(e.target.value)}
                style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 'bold', color: '#047857', fontSize: '13px', backgroundColor: frameReceiptMode || returnSlipReceiptMode ? '#f0fdf4' : '#fff', boxSizing: 'border-box' }}
              />
            </div>

            {trackedFrameReceiptMode ? (
              <div style={{ gridColumn: '1 / -1', padding: '12px', borderRadius: '8px', border: `1px solid ${isFrameReceiptOverLimit ? '#fca5a5' : '#bbf7d0'}`, backgroundColor: isFrameReceiptOverLimit ? '#fef2f2' : '#f0fdf4' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '8px' }}>
                  {[
                    { label: returnSlipReceiptMode ? 'TỔNG SỐ THEO PHIẾU TRẢ' : 'TỔNG KHUNG ĐÃ PHÁT', value: totalContractQty },
                    { label: 'ĐÃ NHẬP TRƯỚC ĐÓ', value: totalReceivedQty },
                    { label: 'LẦN NÀY THỰC NHẬN', value: currentReturnQuantity },
                    { label: returnSlipReceiptMode ? 'CÒN PHẢI NHẬP' : 'SỐ KHUNG Ở TỔ ĐAN', value: remainingAfterCurrentReturn }
                  ].map(metric => (
                    <div key={metric.label} style={{ padding: '8px 10px', borderRadius: '6px', backgroundColor: '#fff' }}>
                      <small style={{ display: 'block', color: '#475569', fontSize: '10px', fontWeight: 800 }}>{metric.label}</small>
                      <strong style={{ display: 'block', marginTop: '4px', color: isFrameReceiptOverLimit && (metric.label === 'SỐ KHUNG Ở TỔ ĐAN' || metric.label === 'CÒN PHẢI NHẬP') ? '#dc2626' : '#166534', fontSize: '17px' }}>
                        {Number(metric.value).toLocaleString()} {receiptUnitLabel}
                      </strong>
                    </div>
                  ))}
                </div>
                {isFrameReceiptOverLimit && (
                  <div role="alert" style={{ marginTop: '9px', color: '#b91c1c', fontSize: '13px', fontWeight: 800 }}>
                    Số lượng nhập ({currentReturnQuantity.toLocaleString()}) vượt quá số còn trên {returnSlipReceiptMode ? 'phiếu trả khung' : 'hợp đồng tổ đan'} ({remainingQty.toLocaleString()} {receiptUnitLabel}). Không thể lưu phiếu.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ backgroundColor: '#f0fdf4', padding: '8px 10px', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#166534', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Tổng HĐ: <b>{totalContractQty}</b></span>
                  <span>Đã nhận: <b>{totalReceivedQty}</b></span>
                </div>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#dc2626', marginTop: '4px' }}>
                  Chưa nhận: <b>{remainingQty}</b> bộ
                </div>
              </div>
            )}

            {!(trackedFrameReceiptMode && isSetProduct && unitOption === 'CAI') && <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>
                {trackedFrameReceiptMode && unitOption === 'CA_HAI'
                  ? 'Số Lượng Bộ Lần Này:'
                  : isSetProduct && unitOption === 'BO' ? 'Số Lượng Lần Này:' : 'Số Lượng:'}
              </label>
              <input
                type="number"
                required={!(trackedFrameReceiptMode && unitOption === 'CA_HAI')}
                min={trackedFrameReceiptMode && unitOption === 'CA_HAI' ? '0' : '1'}
                step={trackedFrameReceiptMode ? 'any' : undefined}
                max={totalContractQty > 0
                  ? Math.max(0, remainingQty - (trackedFrameReceiptMode && unitOption === 'CA_HAI' ? enteredSizeQuantity / maxAllowedSizes : 0))
                  : undefined}
                inputMode="numeric"
                pattern="[0-9]*"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                style={{ width: '100%', padding: '9px', borderRadius: '6px', border: `1px solid ${isFrameReceiptOverLimit ? '#dc2626' : '#cbd5e1'}`, fontWeight: 'bold', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>}
          </div>

          <section style={{ backgroundColor: '#fff', padding: '16px', borderRadius: '8px', border: '2px solid #0f766e', marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <strong style={{ color: '#0f766e', fontSize: '15px' }}>Nguyên Phụ Liệu Kèm Theo</strong>
              <button
                type="button"
                onClick={() => setAccompanyingMaterials(rows => [...rows, createAccompanyingMaterialRow()])}
                style={{ padding: '7px 12px', border: 'none', borderRadius: '5px', backgroundColor: '#0f766e', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
              >
                + Thêm dòng
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 2fr) minmax(90px, .7fr) minmax(100px, .8fr) minmax(120px, 1fr) minmax(140px, 1fr) 42px', gap: '8px', marginBottom: '6px', color: '#475569', fontSize: '12px', fontWeight: 'bold' }}>
              <span>Nguyên vật liệu</span>
              <span>Đơn vị tính</span>
              <span>Số lượng</span>
              <span>Đơn giá (VNĐ)</span>
              <span>Thành tiền (VNĐ)</span>
              <span />
            </div>
            {accompanyingMaterials.map(row => {
              const suggestions = materialItems.filter((material: CategoryItem) =>
                matchesMaterialNameSearch(material, row.query)
              );
              return (
                <div key={row.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 2fr) minmax(90px, .7fr) minmax(100px, .8fr) minmax(120px, 1fr) minmax(140px, 1fr) 42px', gap: '8px', alignItems: 'start', marginTop: '8px' }}>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="search"
                      autoComplete="off"
                      aria-label="Tìm nguyên vật liệu"
                      placeholder="Gõ tên nguyên vật liệu..."
                      value={row.query}
                      onFocus={() => setAccompanyingMaterials(rows => rows.map(item =>
                        item.id === row.id ? { ...item, isDropdownOpen: true } : item
                      ))}
                      onBlur={() => setAccompanyingMaterials(rows => rows.map(item =>
                        item.id === row.id ? { ...item, isDropdownOpen: false } : item
                      ))}
                      onChange={event => setAccompanyingMaterials(rows => rows.map(item => item.id === row.id
                        ? { ...item, query: event.target.value, materialId: null, materialCode: '', materialName: '', unitPrice: '', isDropdownOpen: true }
                        : item))}
                      style={{ width: '100%', padding: '9px', border: '1px solid #94a3b8', borderRadius: '5px', boxSizing: 'border-box' }}
                    />
                    {row.isDropdownOpen && (
                      <div role="listbox" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, maxHeight: '180px', overflowY: 'auto', backgroundColor: '#fff', border: '1px solid #94a3b8', borderRadius: '5px', boxShadow: '0 4px 12px rgba(15, 23, 42, .15)' }}>
                        {suggestions.length ? suggestions.map((material: CategoryItem) => (
                          <button
                            key={material.id}
                            type="button"
                            role="option"
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => setAccompanyingMaterials(rows => rows.map(item => item.id === row.id
                              ? {
                                ...item,
                                materialId: material.id,
                                materialCode: material.code,
                                materialName: material.name,
                                query: material.name,
                                unit: material.unit || item.unit,
                                unitPrice: String(getLatestMaterialUnitPrice(material, slips, Array.isArray(appContext.expenses) ? appContext.expenses : []) || ''),
                                isDropdownOpen: false
                              }
                              : item))}
                            style={{ display: 'block', width: '100%', padding: '9px 10px', border: 0, borderBottom: '1px solid #e2e8f0', background: '#fff', color: '#1e293b', textAlign: 'left', cursor: 'pointer' }}
                          >
                            {material.name}
                          </button>
                        )) : <div style={{ padding: '9px 10px', color: '#64748b', fontSize: '12px' }}>Không tìm thấy nguyên vật liệu phù hợp.</div>}
                      </div>
                    )}
                  </div>
                  <select
                    aria-label="Đơn vị tính nguyên phụ liệu"
                    value={row.unit}
                    onChange={event => setAccompanyingMaterials(rows => rows.map(item =>
                      item.id === row.id ? { ...item, unit: event.target.value as MaterialUnit } : item
                    ))}
                    style={{ width: '100%', padding: '9px', border: '1px solid #94a3b8', borderRadius: '5px', backgroundColor: '#fff' }}
                  >
                    {[...new Set(['kg', 'lọn', 'bó', 'cái', ...materialItems.map((material: CategoryItem) => material.unit).filter(Boolean), row.unit])].map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    aria-label="Số lượng nguyên phụ liệu"
                    placeholder="Nhập số lượng"
                    value={row.quantity}
                    onChange={event => setAccompanyingMaterials(rows => rows.map(item =>
                      item.id === row.id ? { ...item, quantity: event.target.value } : item
                    ))}
                    style={{ width: '100%', padding: '9px', border: '1px solid #94a3b8', borderRadius: '5px', boxSizing: 'border-box' }}
                  />
                  <input
                    type="number"
                    min="0"
                    step="any"
                    aria-label="Đơn giá nguyên phụ liệu"
                    placeholder="Nhập đơn giá"
                    value={row.unitPrice}
                    onChange={event => setAccompanyingMaterials(rows => rows.map(item =>
                      item.id === row.id ? { ...item, unitPrice: event.target.value } : item
                    ))}
                    style={{ width: '100%', padding: '9px', border: '1px solid #94a3b8', borderRadius: '5px', boxSizing: 'border-box' }}
                  />
                  <div aria-label="Thành tiền nguyên phụ liệu" style={{ minHeight: '37px', padding: '9px', border: '1px solid #e2e8f0', borderRadius: '5px', boxSizing: 'border-box', backgroundColor: '#f8fafc', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {((Number(row.quantity) || 0) * (Number(row.unitPrice) || 0)).toLocaleString('vi-VN')} đ
                  </div>
                  <button
                    type="button"
                    aria-label="Xóa dòng nguyên phụ liệu"
                    onClick={() => setAccompanyingMaterials(rows => {
                      const remainingRows = rows.filter(item => item.id !== row.id);
                      return remainingRows.length ? remainingRows : [createAccompanyingMaterialRow()];
                    })}
                    style={{ padding: '8px 10px', border: 'none', borderRadius: '5px', backgroundColor: '#fee2e2', color: '#b91c1c', fontSize: '17px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    −
                  </button>
                </div>
              );
            })}
            <div style={{ marginTop: '12px', padding: '11px 12px', borderRadius: '6px', backgroundColor: '#f0fdfa', color: '#0f766e', textAlign: 'right', fontWeight: 700 }}>
              Tổng giá trị nguyên phụ liệu: {accompanyingMaterials.reduce(
                (total, row) => total + (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0),
                0
              ).toLocaleString('vi-VN')} đ
            </div>
          </section>

          {/* CẤU HÌNH ĐƠN VỊ TÍNH VÀ NHẬP LẺ THEO SIZE */}
          {isSetProduct && (
            <div style={{ backgroundColor: '#ffffff', padding: '14px', borderRadius: '8px', border: '2px solid #0284c7', marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#0369a1', marginBottom: '8px' }}>
                ⚙️ PHÂN LOẠI ĐƠN VỊ TÍNH (Mã hàng BỘ gồm {maxAllowedSizes} Cái/Size):
              </label>

              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>
                  <input type="radio" name="unitOpt" checked={unitOption === 'BO'} onChange={() => setUnitOption('BO')} /> 📦 Chỉ Tính Theo BỘ
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>
                  <input type="radio" name="unitOpt" checked={unitOption === 'CAI'} onChange={() => setUnitOption('CAI')} /> 🧩 Tách Theo CÁI (Từng Size)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>
                  <input type="radio" name="unitOpt" checked={unitOption === 'CA_HAI'} onChange={() => setUnitOption('CA_HAI')} /> 🔄 Cả BỘ & CÁI
                </label>
              </div>

              {(unitOption === 'CAI' || unitOption === 'CA_HAI') && (
                <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', backgroundColor: '#f0f9ff', padding: '12px', borderRadius: '6px', border: '1px dashed #7dd3fc' }}>
                  {Array.from({ length: maxAllowedSizes }).map((_, idx) => {
                    const sName = `Cái ${idx + 1}`;
                    return (
                      <div key={idx} style={{ backgroundColor: '#fff', padding: '8px', borderRadius: '6px', border: '1px solid #bae6fd' }}>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#0284c7', display: 'block', marginBottom: '4px' }}>{sName}:</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="SL cái..."
                          value={sizeQuantities[sName] || ''}
                          onChange={e => setSizeQuantities({ ...sizeQuantities, [sName]: e.target.value })}
                          style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 'bold', boxSizing: 'border-box' }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '16px', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>
                {trackedFrameReceiptMode ? 'Ghi Chú / Tình Trạng Khung Trả Về:' : 'Ghi Chú Phiếu:'}
              </label>
              <textarea
                placeholder={trackedFrameReceiptMode
                  ? 'Mô tả tình trạng khung: sứt mối hàn, móp mép, cong vênh, biến dạng...'
                  : 'Nhập ghi chú chi tiết đợt giao...'}
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
                style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', resize: 'vertical' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>📷 Chứng Từ / Hình Ảnh Đính Kèm:</label>
              <ImageCaptureInput onImageCaptured={url => setTransactionImage(url)} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="submit" disabled={isSubmitting || isFrameReceiptOverLimit || isCompanyReceiptOverLimit} style={{ padding: '10px 24px', backgroundColor: isSubmitting || isFrameReceiptOverLimit || isCompanyReceiptOverLimit ? '#94a3b8' : editingId ? '#d97706' : '#0284c7', color: '#fff', fontWeight: 'bold', borderRadius: '6px', border: 'none', cursor: isSubmitting || isFrameReceiptOverLimit || isCompanyReceiptOverLimit ? 'not-allowed' : 'pointer', fontSize: '13px' }}>
              {isSubmitting ? '⏳ Đang lưu...' : editingId ? '💾 Lưu Cập Nhật Phiếu' : transType === 'NK_KHUNG' ? '💾 Lưu Phiếu' : '💾 Lưu Phiếu Kho'}
            </button>
            <button type="button" onClick={handleReset} style={{ padding: '10px 20px', backgroundColor: '#64748b', color: '#fff', fontWeight: 'bold', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px' }}>
              Hủy / Làm Mới
            </button>
          </div>
        </form>
      )}

      {/* TAB BÁO CÁO & BẢNG THÔNG TIN PHIẾU KHO */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {!isWarehouseUser && <button type="button" onClick={() => setActiveTab('ALL')} style={{ padding: '8px 14px', fontWeight: 'bold', fontSize: '13px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: activeTab === 'ALL' ? '#1e293b' : '#f1f5f9', color: activeTab === 'ALL' ? '#fff' : '#475569' }}>
              📋 Tất Cả ({countAll})
            </button>}
            {!isWarehouseUser && <button type="button" onClick={() => { setActiveTab('NK_KHUNG'); setTransType('NK_KHUNG'); setIsSupplementalFrameReceipt(false); setSelectedReturnAllocationKey(''); }} style={{ padding: '8px 14px', fontWeight: 'bold', fontSize: '13px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: activeTab === 'NK_KHUNG' ? '#0284c7' : '#f1f5f9', color: activeTab === 'NK_KHUNG' ? '#fff' : '#475569' }}>
              📥 Nhập KS Cty - Tổ Đan - Nhập KS Trả Lại ({countKhungSon})
            </button>}
            {!isWarehouseUser && <button type="button" onClick={() => setActiveTab('KS_INCOMPLETE')} style={{ padding: '8px 14px', fontWeight: 'bold', fontSize: '13px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: activeTab === 'KS_INCOMPLETE' ? '#b91c1c' : '#fef2f2', color: activeTab === 'KS_INCOMPLETE' ? '#fff' : '#991b1b' }}>
              ⚠️ Khung Sơn Chưa Nhận Đủ ({incompleteFrameContracts.length})
            </button>}
            {!isWarehouseUser && <button type="button" onClick={() => setActiveTab('NK')} style={{ padding: '8px 14px', fontWeight: 'bold', fontSize: '13px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: activeTab === 'NK' ? '#16a34a' : '#f1f5f9', color: activeTab === 'NK' ? '#fff' : '#475569' }}>
              📥 Nhập Khung Từ CTY ({countNK})
            </button>}
            <button type="button" onClick={() => setActiveTab('FRAME_STOCK')} style={{ padding: '8px 14px', fontWeight: 'bold', fontSize: '13px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: activeTab === 'FRAME_STOCK' ? '#7c3aed' : '#f1f5f9', color: activeTab === 'FRAME_STOCK' ? '#fff' : '#475569' }}>
              📊 Báo Cáo NXT Khung Sơn
            </button>
          </div>

          <div style={{ display: activeTab === 'FRAME_STOCK' ? 'none' : 'flex', gap: '10px' }}>
            <input
              type="month"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
            />
            <input
              type="text"
              placeholder="Lọc theo Mã hoặc Tên hàng..."
              value={filterKeyword}
              onChange={e => setFilterKeyword(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', width: '220px' }}
            />
          </div>
        </div>

        {activeTab === 'FRAME_STOCK' && <FrameStockReport />}

        {activeTab === 'KS_INCOMPLETE' && (
          <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #fecaca', marginBottom: '16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#fef2f2', borderBottom: '2px solid #fecaca' }}>
                  <th style={{ padding: '10px' }}>Số HĐ CTY</th>
                  <th style={{ padding: '10px' }}>Mã Hàng / Tên Hàng</th>
                  <th style={{ padding: '10px' }}>Cty Đối Tác</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>SL HĐ</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Đã Nhận</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Còn Thiếu</th>
                  <th style={{ padding: '10px', textAlign: 'center' }}>Số Lần Nhận</th>
                  <th style={{ padding: '10px', textAlign: 'center' }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {incompleteFrameContracts.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '20px', textAlign: 'center', color: '#166534', fontWeight: 'bold' }}>
                      ✅ Tất cả hợp đồng công ty đã nhận đủ khung sơn.
                    </td>
                  </tr>
                ) : incompleteFrameContracts.map(({ contract, receiptLogs, receivedQty, contractQty, remainingQty }) => (
                  <tr key={contract.id} style={{ borderBottom: '1px solid #fee2e2' }}>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: '#1e40af' }}>{contract.contractNo || '—'}</td>
                    <td style={{ padding: '10px' }}>
                      <strong style={{ color: '#7c3aed' }}>[{contract.productCode}]</strong> {contract.productName || ''}
                    </td>
                    <td style={{ padding: '10px' }}>{contract.companyName || contract.company || '—'}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>{contractQty.toLocaleString()}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#0369a1' }}>{receivedQty.toLocaleString()}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#dc2626' }}>{remainingQty.toLocaleString()}</td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <button type="button" onClick={() => setHistoryContract(contract)} style={{ padding: '5px 9px', border: '1px solid #93c5fd', borderRadius: '6px', backgroundColor: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontWeight: 'bold' }}>
                        Đã nhận {receiptLogs.length} lần
                      </button>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <button type="button" onClick={() => startSupplementalFrameReceipt(contract)} style={{ padding: '6px 10px', border: 'none', borderRadius: '6px', backgroundColor: '#0284c7', color: '#fff', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        📥 Nhập khung lần {receiptLogs.length + 1}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: activeTab === 'KS_INCOMPLETE' || activeTab === 'FRAME_STOCK' ? 'none' : undefined, overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '10px' }}>Số Phiếu</th>
                <th style={{ padding: '10px' }}>Ngày Nhận</th>
                <th style={{ padding: '10px' }}>Mã Hợp Đồng</th>
                <th style={{ padding: '10px' }}>Mã & Tên Hàng</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Số Lượng</th>
                <th style={{ padding: '10px' }}>Nguyên Phụ Liệu Kèm Theo</th>
                <th style={{ padding: '10px' }}>Đơn Vị Tính</th>
                <th style={{ padding: '10px' }}>Đối Tác / Tổ Đan</th>
                <th style={{ padding: '10px' }}>Ghi Chú</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
                    Chưa có phiếu kho nào phát sinh!
                  </td>
                </tr>
              ) : (
                filteredLogs.map((item: StockTransaction) => {
                  const isKhung = isKhungItem(item);
                  const isNK = isNKItem(item);
                  const isReturnSlipReceipt = Boolean(item.sourceReturnSlipId);
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: isKhung ? '#0284c7' : isNK ? '#16a34a' : '#dc2626' }}>
                        {item.slipNo}
                      </td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#047857' }}>{formatDateVN(item.date)}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#1e40af' }}>{item.contractNo || '—'}</td>
                      <td style={{ padding: '10px' }}>
                        <span style={{ fontWeight: 'bold', color: '#7c3aed' }}>[{item.productCode}]</span> {item.productName}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#b45309' }}>
                        {Number(item.quantity || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px', color: '#0f766e', fontSize: '12px' }}>
                        {Array.isArray(item.accompanyingMaterials) && item.accompanyingMaterials.length
                          ? item.accompanyingMaterials.filter(Boolean).map(material =>
                            `${material.materialCode ? `${material.materialCode} - ` : ''}${material.materialName} ${Number(material.quantity).toLocaleString()} ${material.unit}`
                          ).join('; ')
                          : '—'}
                      </td>
                      <td style={{ padding: '10px', fontSize: '12px', fontWeight: '600' }}>{item.unit}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#334155' }}>{item.partnerName || item.partner || '—'}</td>
                      <td style={{ padding: '10px', color: '#64748b', fontSize: '12px' }}>{item.note || '—'}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <div className="slip-action-buttons">
                          <button
                            type="button"
                            className="slip-action-button slip-action-edit"
                            onClick={() => handleEditItem(item)}
                          >
                            ✏️ Sửa
                          </button>
                          {isKhung && !isReturnSlipReceipt && (
                            <button
                              type="button"
                              className="slip-action-button slip-action-zalo"
                              onClick={() => void handleSendFrameReceiptToZalo(item)}
                              title="Sao chép nội dung và mở cuộc trò chuyện Zalo của Tổ Đan"
                            >
                              📲 Gửi Zalo
                            </button>
                          )}
                          <button
                            type="button"
                            className="slip-action-button slip-action-delete"
                            onClick={() => {
                              if (window.confirm(`Bạn có chắc chắn muốn xóa phiếu [${item.slipNo}] này không?`)) {
                                handleDelete(item.id || item.slipNo);
                              }
                            }}
                          >
                            🗑️ Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {historyContract && (
        <div onClick={() => setHistoryContract(null)} style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backgroundColor: 'rgba(15, 23, 42, 0.65)' }}>
          <section onClick={event => event.stopPropagation()} style={{ width: '100%', maxWidth: '900px', maxHeight: '85vh', overflowY: 'auto', padding: '22px', borderRadius: '10px', backgroundColor: '#fff', boxShadow: '0 20px 50px rgba(15, 23, 42, 0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', marginBottom: '18px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#0369a1', fontSize: '18px' }}>📋 Lịch Sử Nhập Khung Từ CTY</h3>
                <div style={{ marginTop: '6px', color: '#334155', fontSize: '13px' }}>
                  <strong>HĐ:</strong> {historyContract.contractNo || '—'} · <strong>Mã:</strong> {historyContract.productCode || '—'} · {historyContract.productName || ''}
                </div>
              </div>
              <button type="button" onClick={() => setHistoryContract(null)} style={{ border: 0, borderRadius: '6px', padding: '7px 11px', backgroundColor: '#e2e8f0', cursor: 'pointer', fontWeight: 'bold' }}>Đóng</button>
            </div>
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9' }}>
                    <th style={{ padding: '9px' }}>Lần</th>
                    <th style={{ padding: '9px' }}>Ngày Tháng</th>
                    <th style={{ padding: '9px' }}>Mã Hàng</th>
                    <th style={{ padding: '9px' }}>Số HĐ</th>
                    <th style={{ padding: '9px', textAlign: 'right' }}>Số Lượng</th>
                    <th style={{ padding: '9px' }}>Ghi Chú</th>
                    <th style={{ padding: '9px' }}>Chứng Từ / Hình Ảnh</th>
                  </tr>
                </thead>
                <tbody>
                  {getContractFrameLogs(historyContract).length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: '18px', textAlign: 'center', color: '#64748b' }}>Chưa có đợt nhập khung nào được ghi nhận.</td></tr>
                  ) : getContractFrameLogs(historyContract).map((log: any, index: number) => {
                    const proofImage = log.image || log.imageProof;
                    return (
                      <tr key={log.id || log.slipNo || index} style={{ borderTop: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '9px', fontWeight: 'bold' }}>Lần {index + 1}</td>
                        <td style={{ padding: '9px' }}>{formatDateVN(log.date)}</td>
                        <td style={{ padding: '9px', color: '#7c3aed', fontWeight: 'bold' }}>{log.productCode || historyContract.productCode}</td>
                        <td style={{ padding: '9px', color: '#1e40af', fontWeight: 'bold' }}>{log.contractNo || historyContract.contractNo || '—'}</td>
                        <td style={{ padding: '9px', textAlign: 'right', fontWeight: 'bold' }}>{Number(log.quantity || 0).toLocaleString()} {log.unit || 'bộ'}</td>
                        <td style={{ padding: '9px', color: '#475569' }}>{log.note || '—'}</td>
                        <td style={{ padding: '9px' }}>
                          {proofImage ? (
                            <button type="button" onClick={() => setEnlargedProofImage(proofImage)} style={{ padding: 0, border: 0, background: 'none', cursor: 'zoom-in' }} title="Bấm để phóng to ảnh chứng từ">
                              <img src={proofImage} alt={`Chứng từ nhập khung lần ${index + 1}`} style={{ display: 'block', width: '72px', height: '56px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                            </button>
                          ) : <span style={{ color: '#94a3b8' }}>Không có ảnh</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {frameReceiptPreview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Xem trước phiếu nhập khung sơn từ tổ đan"
          style={{ position: 'fixed', inset: 0, zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'rgba(15, 23, 42, 0.65)' }}
        >
          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              #frame-receipt-print-area, #frame-receipt-print-area * { visibility: visible !important; }
              #frame-receipt-print-area {
                position: absolute !important;
                inset: 0 !important;
                width: 100% !important;
                max-width: none !important;
                margin: 0 !important;
                padding: 12mm !important;
                border: 0 !important;
                box-shadow: none !important;
              }
              .frame-receipt-modal-actions { display: none !important; }
              @page { size: A4 portrait; margin: 0; }
            }
          `}</style>
          <div style={{ width: 'min(900px, 96vw)', maxHeight: '94vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: '12px', backgroundColor: '#e2e8f0', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
            <div
              id="frame-receipt-print-area"
              ref={frameReceiptPrintAreaRef}
              style={{ overflowY: 'auto', padding: '32px 40px', color: '#0f172a', backgroundColor: '#fff', fontFamily: 'Arial, sans-serif' }}
            >
              <header style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '20px' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '1px' }}>LỤC BÌNH CRAFTS</div>
                <h2 style={{ margin: '8px 0 4px', fontSize: '21px' }}>PHIẾU NHẬP KHUNG SƠN TỪ TỔ ĐAN</h2>
                <div style={{ fontSize: '13px' }}>Ngày lập phiếu: {formatDateVN(getTodayISO())}</div>
              </header>

              <section style={{ marginBottom: '18px' }}>
                <h3 style={{ margin: '0 0 10px', paddingBottom: '6px', borderBottom: '1px solid #64748b', fontSize: '15px' }}>I. THÔNG TIN GIAO NHẬN</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontSize: '14px' }}>
                  <div><strong>Số phiếu:</strong> {frameReceiptPreview.receipt.slipNo}</div>
                  <div><strong>Ngày nhận khung:</strong> {formatDateVN(frameReceiptPreview.receipt.date)}</div>
                  <div><strong>Tên tổ đan:</strong> {frameReceiptPreview.contract.craftGroupLeader || frameReceiptPreview.contract.weavingTeamName || frameReceiptPreview.contract.contractorName || frameReceiptPreview.receipt.partnerName || '—'}</div>
                  <div><strong>Số điện thoại / Zalo:</strong> {frameReceiptPreview.contract.zalo || frameReceiptPreview.contract.phone || '—'}</div>
                  <div><strong>Mã hợp đồng công ty:</strong> {frameReceiptPreview.contract.parentContractNo || frameReceiptPreview.contract.contractNo || '—'}</div>
                  <div><strong>Mã hàng:</strong> {frameReceiptPreview.receipt.productCode || frameReceiptPreview.contract.productCode || '—'}</div>
                  <div style={{ gridColumn: '1 / -1' }}><strong>Tên sản phẩm:</strong> {frameReceiptPreview.receipt.productName || frameReceiptPreview.contract.productName || '—'}</div>
                </div>
              </section>

              <section style={{ marginBottom: '18px' }}>
                <h3 style={{ margin: '0 0 10px', paddingBottom: '6px', borderBottom: '1px solid #64748b', fontSize: '15px' }}>II. CHI TIẾT SỐ LƯỢNG &amp; TÌNH TRẠNG KHUNG</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <tbody>
                    {([
                      ['Tổng số lượng đã phát', frameReceiptPreview.issuedQuantity, frameReceiptPreview.contract.unit || 'Bộ'],
                      ['Số lượng đã trả trước đó', frameReceiptPreview.returnedBefore, frameReceiptPreview.contract.unit || 'Bộ'],
                      ['Lần trả này (quy đổi theo hợp đồng)', frameReceiptPreview.returnedThisTime, frameReceiptPreview.contract.unit || 'Bộ'],
                      ['Số lượng thực tế nhập kho', frameReceiptPreview.receipt.quantity, frameReceiptPreview.receipt.unit || 'Cái'],
                      ['Số khung ở tổ đan', Math.max(0, frameReceiptPreview.issuedQuantity - frameReceiptPreview.returnedBefore - frameReceiptPreview.returnedThisTime), frameReceiptPreview.contract.unit || 'Bộ']
                    ] as Array<[string, number, string]>).map(([label, quantity, unit]) => (
                      <tr key={label as string}>
                        <th style={{ width: '68%', padding: '8px 10px', border: '1px solid #94a3b8', textAlign: 'left', fontWeight: 600 }}>{label}</th>
                        <td style={{ padding: '8px 10px', border: '1px solid #94a3b8', textAlign: 'right' }}>{Number(quantity) || 0} {unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section style={{ minHeight: '76px', marginBottom: '24px' }}>
                <h3 style={{ margin: '0 0 10px', paddingBottom: '6px', borderBottom: '1px solid #64748b', fontSize: '15px' }}>III. TÌNH TRẠNG KHUNG LỖI / GHI CHÚ</h3>
                <div style={{ minHeight: '42px', whiteSpace: 'pre-wrap', fontSize: '14px' }}>{frameReceiptPreview.receipt.note || 'Không có ghi chú.'}</div>
              </section>

              <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '32px', textAlign: 'center', fontSize: '14px' }}>
                <div><strong>BÊN GIAO</strong><div style={{ marginTop: '4px' }}>(Đại diện công ty)</div><div style={{ height: '80px' }} /><div>Ký, ghi rõ họ tên</div></div>
                <div><strong>BÊN NHẬN</strong><div style={{ marginTop: '4px' }}>(Tổ đan)</div><div style={{ height: '80px' }} /><div>Ký, ghi rõ họ tên</div></div>
              </section>
            </div>
            <div className="frame-receipt-modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '14px 18px', backgroundColor: '#f8fafc' }}>
              <button type="button" onClick={() => window.print()} style={{ padding: '10px 14px', border: 0, borderRadius: '7px', backgroundColor: '#0f766e', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>🖨️ In Phiếu / Lưu PDF</button>
              <button
                type="button"
                onClick={() => void handleSendFrameReceiptToZalo(
                  frameReceiptPreview.receipt,
                  frameReceiptPreview.contract,
                  { issued: frameReceiptPreview.issuedQuantity, returned: frameReceiptPreview.returnedAfter }
                )}
                style={{ padding: '10px 14px', border: 0, borderRadius: '7px', backgroundColor: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >📱 Tạo Ảnh Phiếu &amp; Mở Zalo</button>
              <button
                type="button"
                onClick={() => {
                  setFrameReceiptPreview(null);
                  handleReset();
                  setActiveTab('NK_KHUNG');
                  setShowForm(true);
                }}
                style={{ padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '7px', backgroundColor: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer' }}
              >❌ Đóng / Tạo Mới</button>
            </div>
          </div>
        </div>
      )}

      {enlargedProofImage && (
        <div onClick={() => setEnlargedProofImage('')} style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'rgba(0, 0, 0, 0.85)' }}>
          <button type="button" onClick={() => setEnlargedProofImage('')} style={{ position: 'absolute', top: '18px', right: '18px', padding: '8px 12px', border: 0, borderRadius: '6px', backgroundColor: '#fff', color: '#111827', fontWeight: 'bold', cursor: 'pointer' }}>✕ Đóng</button>
          <img src={enlargedProofImage} alt="Ảnh chứng từ được phóng to" onClick={event => event.stopPropagation()} style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '6px' }} />
        </div>
      )}
    </div>
  );
};