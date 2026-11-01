import React, { useState, useEffect, useRef } from 'react';
import { useApp, type CategoryItem } from '../context/AppContext';
import { filterPhoneDigits, isValidVietnamMobileNumber } from '../utils/vietnamPhone';
import { getLatestMaterialUnitPrice, matchesMaterialNameSearch } from '../utils/materialSearch';
import { usePersistentFormDraft } from '../hooks/usePersistentFormDraft';
import { createUniqueId } from '../utils/uniqueId';
import { useAuth } from '../context/AuthContext';
import { ImageCaptureInput } from './ImageCaptureInput';

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
  id: `contract-material-${Date.now()}-${Math.random()}`,
  materialId: null,
  materialCode: '',
  materialName: '',
  query: '',
  unit: 'kg',
  quantity: '',
  unitPrice: '',
  isDropdownOpen: false
});

interface ActualExportLog {
  id: string;
  exportDate: string;
  actualQty: number;
  note?: string;
}

interface DepositLog {
  id: string;
  depositDate: string;
  amount: number;
  method: 'TIEN_MAT' | 'CHUYEN_KHOAN';
}

interface SubContractSlipData {
  parentContractNo: string;
  productCode: string;
  productName: string;
  groupName: string;
  phone: string;
  zalo: string;
  quantity: number;
  receivedQuantity: number;
  remainingQuantity: number;
  quantityUnit: string;
  unitPrice: number;
  deposit: number;
  totalAmount: number;
  createdAt: Date;
}

interface ContractsManagerProps {
  requestedEditContractId?: string | number | null;
  onEditRequestHandled?: () => void;
}

export const ContractsManager: React.FC<ContractsManagerProps> = ({
  requestedEditContractId,
  onEditRequestHandled
}) => {
  const { user, hasPermission } = useAuth();
  const isWarehouseUser = user?.role === 'kho_to_dan';
  const appContext = useApp() as any;
  const {
    products,
    materials,
    contracts,
    slips = [],
    expenses = [],
    depositSlips = [],
    addContract,
    updateContract,
    deleteContract
  } = appContext;
  
  const today = new Date();
  const minDateString = today.toISOString().split('T')[0];

  // Hàm chuyển đổi ngày an toàn cho thẻ input type="date" (luôn trả về YYYY-MM-DD)
  const formatInputDate = (dateStr: string) => {
    if (!dateStr) return minDateString;
    if (dateStr.includes('T')) {
      dateStr = dateStr.split('T')[0];
    }
    const parts = dateStr.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return dateStr; // Đã đúng định dạng YYYY-MM-DD
    }
    if (parts.length === 3 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`; // Đổi từ DD-MM-YYYY sang YYYY-MM-DD
    }
    const localDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateStr);
    if (localDate) {
      return `${localDate[3]}-${localDate[2].padStart(2, '0')}-${localDate[1].padStart(2, '0')}`;
    }
    return minDateString;
  };

  // Hàm hiển thị định dạng Việt Nam DD-MM-YYYY
  const formatDateVN = (dateStr: string) => {
    if (!dateStr) return '';
    if (dateStr.includes('T')) {
      dateStr = dateStr.split('T')[0];
    }
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      return `${parts[0]}-${parts[1]}-${parts[2]}`;
    }
    return dateStr;
  };

  const subtractDaysFromDate = (dateStr: string, days: number) => {
    const normalizedDate = dateStr.split('T')[0];
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizedDate);
    if (!match) return '';

    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    date.setDate(date.getDate() - days);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatCurrency = (val: number | string) => {
    const num = Number(val) || 0;
    return num.toLocaleString('vi-VN');
  };

  const formatParentDepositDate = (value: unknown) => {
    if (value === null || value === undefined || value === '') return '';
    const rawDate = String(value).trim();
    const datePart = rawDate.split('T')[0];
    const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
    if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
    const localDate = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(datePart);
    if (localDate) return `${localDate[1].padStart(2, '0')}/${localDate[2].padStart(2, '0')}/${localDate[3]}`;
    const parsedDate = new Date(rawDate);
    return Number.isNaN(parsedDate.getTime()) ? '' : parsedDate.toLocaleDateString('vi-VN');
  };

  const getParentDepositDate = (item: any) => {
    const dateKeys = new Set([
      'depositdate',
      'dateofdeposit',
      'depositreceiveddate',
      'ngaynhancoc',
      'ngaycoc',
      'depositreceivedat',
      'datereceiveddeposit'
    ]);
    const candidates: unknown[] = [];
    const collectDates = (record: unknown, depth = 0, isDepositContext = false) => {
      if (!record || typeof record !== 'object' || depth > 2) return;
      Object.entries(record).forEach(([key, value]) => {
        const normalizedKey = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const nestedDepositContext = isDepositContext ||
          normalizedKey.includes('deposit') ||
          normalizedKey.includes('coc');
        if (dateKeys.has(normalizedKey) || (isDepositContext && ['date', 'ngay'].includes(normalizedKey))) {
          candidates.push(value);
        } else if (value && typeof value === 'object') {
          collectDates(value, depth + 1, nestedDepositContext);
        }
      });
    };
    collectDates(item);
    (Array.isArray(item.depositLogs) ? item.depositLogs : [])
      .filter((log: any) => Number(log.amount) > 0)
      .forEach((log: any) => candidates.push(log.depositDate));

    const matchedDepositSlips = (Array.isArray(depositSlips) ? depositSlips : [])
      .filter((slip: any) =>
        String(slip.contractNo || '').trim().toLowerCase() ===
          String(item.contractNo || '').trim().toLowerCase() &&
        Number(slip.amount) > 0
      )
      .sort((first: any, second: any) =>
        String(first.date || '').localeCompare(String(second.date || ''))
      );
    matchedDepositSlips.forEach((slip: any) => candidates.push(slip.date));

    for (const candidate of candidates) {
      const formatted = formatParentDepositDate(candidate);
      if (formatted) return formatted;
    }
    return '';
  };

  const handleDepositChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/\D/g, '');
    setRequiredDeposit(rawVal);
  };

  const [activeTab, setActiveTab] = useState<'PARENT' | 'SUB' | 'REVISION' | 'FRAME_MGMT' | 'DEPOSIT_TRACKING'>(isWarehouseUser ? 'SUB' : 'PARENT');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const { formDraftProps, clearDraft } = usePersistentFormDraft(
    `contracts-${activeTab === 'SUB' ? 'sub' : 'parent'}`
  );
  const [listTab, setListTab] = useState<'PARENT_LIST' | 'SUB_LIST'>(isWarehouseUser ? 'SUB_LIST' : 'PARENT_LIST');
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [depositTrackingProductFilter, setDepositTrackingProductFilter] = useState('');
  const [depositTrackingSubContractFilter, setDepositTrackingSubContractFilter] = useState('');

  // Filter state
  const [frameSearchKw, setFrameSearchKw] = useState<string>('');
  const [frameStatusFilter, setFrameStatusFilter] = useState<'ALL' | 'INCOMPLETE' | 'COMPLETED'>('INCOMPLETE');
  const [frameExportContract, setFrameExportContract] = useState<any | null>(null);
  const [frameExportDate, setFrameExportDate] = useState<string>(minDateString);
  const [frameExportQty, setFrameExportQty] = useState<string>('');
  const [frameContractQty, setFrameContractQty] = useState<string>('');
  const [frameDepositAmount, setFrameDepositAmount] = useState<string>('');
  const [frameDepositMethod, setFrameDepositMethod] = useState<'TIEN_MAT' | 'CHUYEN_KHOAN'>('CHUYEN_KHOAN');
  const [isProductCodeDropdownOpen, setIsProductCodeDropdownOpen] = useState(false);

  // State HĐ CTY
  const [companyName, setCompanyName] = useState<string>('');
  const [parentContractNo, setParentContractNo] = useState<string>('');
  const [depositDateParent, setDepositDateParent] = useState<string>(minDateString);
  const [companyVatRatePercent, setCompanyVatRatePercent] = useState('');
  const depositInputRef = useRef<HTMLInputElement>(null);

  // State HĐ TỔ ĐAN
  const [productCode, setProductCode] = useState<string>('');
  const [selectedParentNo, setSelectedParentNo] = useState<string>('');
  const [productName, setProductName] = useState<string>('');
  const [craftGroupLeader, setCraftGroupLeader] = useState<string>('');
  const [houseNumber, setHouseNumber] = useState<string>('');
  const [ward, setWard] = useState<string>('');
  const [province, setProvince] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [zalo, setZalo] = useState<string>('');
  const [requiredDeposit, setRequiredDeposit] = useState<string>('');
  const [depositMethod, setDepositMethod] = useState<'TIEN_MAT' | 'CHUYEN_KHOAN'>('TIEN_MAT');

  // Cấu hình BỘ / CÁI THEO SIZE / CẢ HAI
  const [itemTypeOption, setItemTypeOption] = useState<'BO' | 'CAI' | 'CA_HAI'>('BO');
  const [sizeQuantities, setSizeQuantities] = useState<{ [key: string]: string }>({});
  const [sizePrices, setSizePrices] = useState<{ [key: string]: string }>({});
  const [boQuantity, setBoQuantity] = useState<string>('');
  const [subContractMaterials, setSubContractMaterials] = useState<AccompanyingMaterialFormRow[]>([
    createAccompanyingMaterialRow()
  ]);

  const [unit, setUnit] = useState<string>('Bộ');
  const [quantity, setQuantity] = useState<string>('');
  const [unitPrice, setUnitPrice] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>(minDateString);
  const [contractImage, setContractImage] = useState<string>('');
  const [note, setNote] = useState<string>('');

  // Số lượng HĐ Tổ Đan & Tiến độ nhận khung
  const [contractQty, setContractQty] = useState<string>('1000');
  const [exportLogs, setExportLogs] = useState<ActualExportLog[]>([]);
  const [newDate, setNewDate] = useState<string>(minDateString);
  const [newQty, setNewQty] = useState<string>('');
  const [newNote, setNewNote] = useState<string>('');

  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [subContractSlipData, setSubContractSlipData] = useState<SubContractSlipData | null>(null);
  const isSubContractSlipOpen = subContractSlipData !== null;

  useEffect(() => {
    if (!isSubContractSlipOpen && !frameExportContract) return;

    const handleModalKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setSubContractSlipData(null);
      setFrameExportContract(null);
    };

    window.addEventListener('keydown', handleModalKeyDown);
    return () => window.removeEventListener('keydown', handleModalKeyDown);
  }, [isSubContractSlipOpen, frameExportContract]);

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

  const getUnitFromProductCode = (codeStr: string): string | undefined => {
    const suffix = /\/(\d+)\s*$/.exec(codeStr.trim())?.[1];
    if (!suffix) return undefined;

    const sizeCount = Number(suffix);
    if (sizeCount === 1) return 'Cái';
    if (sizeCount > 1) return 'Bộ';
    return undefined;
  };

  const maxAllowedSizes = getMaxSizesFromCode(productCode);
  const isSinglePieceProduct = /\/1\s*$/.test(productCode.trim())
    || (maxAllowedSizes === 1 && unit.toLowerCase() === 'cái');
  const isSetItem = !isSinglePieceProduct && (maxAllowedSizes > 1 || unit.toLowerCase() === 'bộ');

  // Tính toán Thành Tiền & Số tiền còn lại cho HĐ Cty
  const parentQtyNum = Number(quantity) || 0;
  const parentPriceNum = Number(unitPrice) || 0;
  const parentTotalAmount = parentQtyNum * parentPriceNum;
  const parentDepositNum = Number(requiredDeposit) || 0;
  const parentRemainingAmount = Math.max(0, parentTotalAmount - parentDepositNum);

  // Danh sách hợp đồng
  const parentContractsList = (contracts || []).filter((c: any) => c.contractType === 'PARENT' || !c.contractType);
  const subContractsList = (contracts || []).filter((c: any) => c.contractType === 'SUB');
  const selectedParentContract = parentContractsList.find(
    (contract: any) => String(contract.contractNo || '') === String(selectedParentNo)
  );
  const parentDueDate = selectedParentContract?.dueDate
    ? formatInputDate(selectedParentContract.dueDate)
    : '';
  const isSubDueDateInvalid = Boolean(parentDueDate && dueDate >= parentDueDate);
  const isSubPhoneInvalid = !isValidVietnamMobileNumber(phone);
  const isSubZaloInvalid = !isValidVietnamMobileNumber(zalo);
  const parentProductCodeList = Array.from(new Set<string>(
    (contracts || [])
      .filter((contract: any) => contract.contractType === 'PARENT')
      .map((contract: any) => String(contract.productCode || '').trim())
      .filter(Boolean)
  ));

  const uniqueProductCodeList = Array.from(new Set<string>(
    [
      ...(products || []).map((p: any) => p.code || p.id),
      ...(contracts || []).map((c: any) => c.productCode)
    ]
      .map(code => String(code || '').trim())
      .filter(Boolean)
  ));
  const productCodeOptions = activeTab === 'SUB' ? parentProductCodeList : uniqueProductCodeList;
  const filteredProductCodeOptions = productCodeOptions.filter(code =>
    code.toLowerCase().includes(productCode.trim().toLowerCase())
  );

  const handleProductCodeSelect = (codeStr: string) => {
    setProductCode(codeStr);
    setUnit(getUnitFromProductCode(codeStr) || 'Bộ');
    const cleanCode = codeStr.trim().toLowerCase();
    if (!cleanCode) {
      setProductName('');
      return;
    }

    const matchedProduct = (products || []).find(
      (p: any) => String(p.code || p.id || '').trim().toLowerCase() === cleanCode
    );
    const matchedContract = (contracts || []).find(
      (c: any) => String(c.productCode || '').trim().toLowerCase() === cleanCode
    );

    if (matchedProduct && (matchedProduct.name || matchedProduct.productName)) {
      setProductName(matchedProduct.name || matchedProduct.productName);
    } else if (matchedContract && matchedContract.productName) {
      setProductName(matchedContract.productName.split(' ')[0]);
    } else {
      setProductName('');
    }

    const matchedParent = parentContractsList.find((p: any) => String(p.productCode || '').trim().toLowerCase() === cleanCode);
    if (matchedParent) {
      setSelectedParentNo(matchedParent.contractNo);
      if (matchedParent.dueDate) {
        setDueDate(subtractDaysFromDate(formatInputDate(matchedParent.dueDate), 4) || minDateString);
      } else setDueDate(minDateString);
      if (matchedParent.unitPrice) setUnitPrice(String(matchedParent.unitPrice));
      if (matchedParent.quantity) setContractQty(String(matchedParent.quantity));
    }
  };

  const handleSubProductCodeSelect = (codeStr: string) => {
    setProductCode(codeStr);
    const cleanCode = codeStr.trim().toLowerCase();
    const matchedParent = (contracts || []).find(
      (contract: any) =>
        contract.contractType === 'PARENT' &&
        String(contract.productCode || '').trim().toLowerCase() === cleanCode
    );

    if (!matchedParent) {
      setSelectedParentNo('');
      setProductName('');
      setDueDate(minDateString);
      return;
    }

    setSelectedParentNo(matchedParent.contractNo || '');
    setProductName(matchedParent.productName || '');
    setUnit(getUnitFromProductCode(codeStr) || matchedParent.unit || 'Bộ');
    if (matchedParent.dueDate) {
      setDueDate(subtractDaysFromDate(formatInputDate(matchedParent.dueDate), 4) || minDateString);
    } else setDueDate(minDateString);
    if (matchedParent.unitPrice) setUnitPrice(String(matchedParent.unitPrice));
    if (matchedParent.quantity) setContractQty(String(matchedParent.quantity));
  };

  const selectProductCodeOption = (code: string) => {
    if (activeTab === 'SUB') handleSubProductCodeSelect(code);
    else handleProductCodeSelect(code);
    setIsProductCodeDropdownOpen(false);
  };

  useEffect(() => {
    if (productCode && isSetItem) {
      const max = getMaxSizesFromCode(productCode);
      const newQtyMap: { [key: string]: string } = {};
      const newPriceMap: { [key: string]: string } = {};
      for (let i = 1; i <= max; i++) {
        const sName = `Cái ${i}`;
        newQtyMap[sName] = sizeQuantities[sName] || '';
        newPriceMap[sName] = sizePrices[sName] || '';
      }
      setSizeQuantities(newQtyMap);
      setSizePrices(newPriceMap);
    }
  }, [productCode, isSetItem]);

  const calculateExactTotal = () => {
    const defaultUnitPrice = Number(unitPrice) || 0;
    const targetQty = Number(contractQty) || 0;

    if (!isSetItem || itemTypeOption === 'BO') {
      const unitText = isSetItem ? 'bộ' : 'cái';
      return { 
        summaryText: `${targetQty} ${unitText}`, 
        totalAmount: targetQty * defaultUnitPrice 
      };
    }

    const sizes = Object.keys(sizeQuantities);
    let totalCaiMoney = 0;
    const summaryParts: string[] = [];

    if (itemTypeOption === 'CA_HAI') {
      const baseBo = Number(boQuantity) || 0;
      if (baseBo > 0) summaryParts.push(`${baseBo} bộ`);
    }

    sizes.forEach(s => {
      const qty = Number(sizeQuantities[s]) || 0;
      if (qty > 0) {
        summaryParts.push(`${qty} ${s.toLowerCase()}`);
        const p = Number(sizePrices[s]) > 0 ? Number(sizePrices[s]) : defaultUnitPrice;
        totalCaiMoney += qty * p;
      }
    });

    const boMoney = (itemTypeOption === 'CA_HAI' ? (Number(boQuantity) || 0) : 0) * defaultUnitPrice;
    const totalAmount = boMoney + totalCaiMoney;
    const summaryText = summaryParts.length > 0 ? summaryParts.join(', ') : `${targetQty} bộ`;

    return { summaryText, totalAmount: totalAmount || (targetQty * defaultUnitPrice) };
  };

  const { summaryText, totalAmount: calculatedTotalAmount } = calculateExactTotal();
  const accompanyingMaterialTotal = subContractMaterials.reduce(
    (total, row) => total + (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0),
    0
  );

  const safeExportLogs = Array.isArray(exportLogs) ? exportLogs : [];
  const savedExportedTotal = safeExportLogs.reduce((sum, item) => sum + (Number(item.actualQty) || 0), 0);
  const inputNewQtyNum = Number(newQty) || 0;
  const totalActualExported = savedExportedTotal + inputNewQtyNum;

  const targetContractQtyNum = Number(contractQty) || 0;
  const remainingQty = Math.max(0, targetContractQtyNum - totalActualExported);
  const isExceeded = totalActualExported > targetContractQtyNum;

  const depositNum = Number(requiredDeposit) || 0;
  const remainingPaymentAmount = Math.max(
    0,
    calculatedTotalAmount - depositNum - accompanyingMaterialTotal
  );

  const generatedSubNo = () => {
    let cleanParent = selectedParentNo ? selectedParentNo.replace(/[^a-zA-Z0-9]/g, '') : 'HDTD';
    let cleanLeader = craftGroupLeader ? craftGroupLeader.trim().replace(/\s+/g, '').toUpperCase() : 'TO';
    return `${cleanParent}-${cleanLeader}`;
  };

  const handleOpenSubContractSlip = (contract: any) => {
    const logs = Array.isArray(contract.exportLogs) ? contract.exportLogs : [];
    const contractQuantity = Number(contract.quantity) || 0;
    const receivedQuantity = contract.totalActualExported !== undefined && contract.totalActualExported !== null
      ? Number(contract.totalActualExported) || 0
      : logs.reduce((sum: number, log: ActualExportLog) => sum + (Number(log.actualQty) || 0), 0);
    const contractUnitPrice = Number(contract.unitPrice) || 0;
    const contractTotalAmount = contract.totalAmount !== undefined && contract.totalAmount !== null
      ? Number(contract.totalAmount) || 0
      : contractQuantity * contractUnitPrice;
    const contractSummary = String(contract.summaryText || '');
    const storedProductName = String(contract.productName || '');
    const normalizedProductName = contractSummary && storedProductName.endsWith(` (${contractSummary})`)
      ? storedProductName.slice(0, -(contractSummary.length + 3))
      : storedProductName;
    const quantityUnit = String(contract.unit || (
      contract.itemTypeOption === 'CAI' && getMaxSizesFromCode(String(contract.productCode || '')) === 1
        ? 'Cái'
        : 'Bộ'
    )).toLowerCase() === 'cái' ? 'cái' : 'bộ';

    setSubContractSlipData({
      parentContractNo: String(contract.parentContractNo || ''),
      productCode: String(contract.productCode || ''),
      productName: normalizedProductName,
      groupName: String(contract.craftGroupLeader || ''),
      phone: String(contract.phone || ''),
      zalo: String(contract.zalo || ''),
      quantity: contractQuantity,
      receivedQuantity,
      remainingQuantity: Math.max(0, contractQuantity - receivedQuantity),
      quantityUnit,
      unitPrice: contractUnitPrice,
      deposit: Number(contract.requiredDeposit) || 0,
      totalAmount: contractTotalAmount,
      createdAt: new Date()
    });
  };

  const handleShareSubContractSlipToZalo = async () => {
    if (!subContractSlipData) return;

    const formData = subContractSlipData;
    const phoneNumber = formData.phone.replace(/\D/g, '');
    if (phoneNumber) window.open(`https://zalo.me/${phoneNumber}`, '_blank', 'noopener,noreferrer');

    const shareText = [
      'PHIẾU HỢP ĐỒNG TỔ ĐAN - LỤC BÌNH CRAFTS',
      `Ngày lập: ${formData.createdAt.toLocaleDateString('vi-VN')}`,
      `Số HĐ Cty truy vết: ${formData.parentContractNo || '—'}`,
      `Mã hàng: ${formData.productCode || '—'}`,
      `Tên sản phẩm: ${formData.productName || '—'}`,
      `Tên tổ đan: ${formData.groupName || '—'}`,
      `SĐT: ${formData.phone || '—'}${formData.zalo ? ` | Zalo: ${formData.zalo}` : ''}`,
      `Số lượng giao: ${formatCurrency(formData.quantity)} ${formData.quantityUnit}`,
      `Số lượng đã nhận: ${formatCurrency(formData.receivedQuantity)} ${formData.quantityUnit}`,
      `Số lượng còn lại: ${formatCurrency(formData.remainingQuantity)} ${formData.quantityUnit}`,
      `Đơn giá: ${formatCurrency(formData.unitPrice)} VNĐ`,
      `Tiền cọc: ${formatCurrency(formData.deposit)} VNĐ`,
      `Thành tiền: ${formatCurrency(formData.totalAmount)} VNĐ`
    ].join('\n');

    try {
      await navigator.clipboard.writeText(shareText);
      alert('Đã copy nội dung phiếu. Bạn có thể dán vào cuộc trò chuyện Zalo.');
    } catch {
      alert('Không thể sao chép phiếu. Vui lòng kiểm tra quyền truy cập Clipboard của trình duyệt.');
    }
  };

  const getLowestCompanyUnitPrice = (code: string): number | null => {
    if (!code) return null;
    const cleanCode = code.trim().toLowerCase();
    const matched = parentContractsList.filter((c: any) => String(c.productCode || '').trim().toLowerCase() === cleanCode && Number(c.unitPrice) > 0);
    if (matched.length === 0) return null;
    return Math.min(...matched.map((c: any) => Number(c.unitPrice)));
  };

  const lowestCompanyPrice = getLowestCompanyUnitPrice(productCode);
  const currentSubUnitPrice = Number(unitPrice) || 0;
  const isPriceHigherThanCompany = lowestCompanyPrice !== null && currentSubUnitPrice >= lowestCompanyPrice;

  const existingCompanyNames = Array.from(
    new Set((contracts || []).map((c: any) => c.companyName || c.company).filter((name: string) => name && name !== 'Nội bộ Tổ Đan'))
  );

  const autoGenerateParentNo = (compName: string = companyName): string => {
    const yearShort = new Date().getFullYear().toString().slice(-2);
    const count = parentContractsList.length + 1;
    const seq = count < 10 ? `0${count}` : `${count}`;
    const compCode = compName ? compName.toUpperCase().replace(/(CTY|CÔNG TY|CP|CỔ PHẦN|TNHH)/g, '').trim().split(/\s+/)[0] || 'CTY' : 'CTY';
    return `HĐ-${seq}-${compCode}-${yearShort}`;
  };

  useEffect(() => {
    if (!editingId && activeTab === 'PARENT') {
      setParentContractNo(autoGenerateParentNo(companyName));
    }
  }, [activeTab, companyName, editingId]);

  const resetForm = () => {
    clearDraft();
    setIsProductCodeDropdownOpen(false);
    setSubContractSlipData(null);
    setFrameExportContract(null);
    setCompanyName('');
    setParentContractNo(autoGenerateParentNo(''));
    setSelectedParentNo('');
    setProductCode('');
    setProductName('');
    setCraftGroupLeader('');
    setHouseNumber('');
    setWard('');
    setProvince('');
    setPhone('');
    setZalo('');
    setRequiredDeposit('');
    setDepositMethod('TIEN_MAT');
    setDepositDateParent(minDateString);
    setCompanyVatRatePercent('');
    setItemTypeOption('BO');
    setSizeQuantities({});
    setSizePrices({});
    setBoQuantity('');
    setSubContractMaterials([createAccompanyingMaterialRow()]);
    setUnit('Bộ');
    setQuantity('');
    setUnitPrice('');
    setContractQty('1000');
    setExportLogs([]);
    setNewQty('');
    setNewNote('');
    setDueDate(minDateString);
    setContractImage('');
    setNote('');
    setEditingId(null);
  };

  const openFrameExportModal = (item: any) => {
    setFrameExportContract(item);
    setFrameExportDate(minDateString);
    setFrameExportQty('');
    setFrameContractQty(String(Number(item.quantity) || 0));
    setFrameDepositAmount('');
    setFrameDepositMethod('CHUYEN_KHOAN');
  };

  const getFrameReceiptTotal = (contract: any) => {
    const logs: ActualExportLog[] = Array.isArray(contract.exportLogs) ? contract.exportLogs : [];
    const loggedTotal = logs.reduce((sum, log) => sum + (Number(log.actualQty) || 0), 0);
    return Math.max(Number(contract.totalActualExported) || 0, loggedTotal);
  };

  const getReceiptQuantityInContractUnits = (slip: any, productCode: string) => {
    if (Number.isFinite(Number(slip.returnQuantityInContractUnits))) {
      return Number(slip.returnQuantityInContractUnits);
    }
    const quantity = Number(slip.quantity) || 0;
    const sizeQuantities = slip.sizeQuantities && typeof slip.sizeQuantities === 'object'
      ? slip.sizeQuantities
      : {};
    const entries = Object.entries(sizeQuantities);
    const bundles = entries
      .filter(([size]) => String(size).toLowerCase() === 'bộ')
      .reduce((sum, [, count]) => sum + (Number(count) || 0), 0);
    const loosePieces = entries
      .filter(([size]) => String(size).toLowerCase() !== 'bộ')
      .reduce((sum, [, count]) => sum + (Number(count) || 0), 0);
    const sizesPerSet = getMaxSizesFromCode(productCode) || 1;
    const unit = String(slip.unit || '').toLowerCase();
    if (bundles > 0 || unit.includes('bộ (')) return (bundles || quantity) + loosePieces / sizesPerSet;
    if (unit.includes('cái') || unit.includes('từng size')) {
      return (loosePieces || quantity) / sizesPerSet;
    }
    return quantity;
  };

  const getParentReturnedTotal = (contract: any) =>
    (Array.isArray(slips) ? slips : [])
      .filter((slip: any) => String(slip.type || '').toUpperCase() === 'XUAT_KS_TRA_CTY')
      .flatMap((slip: any) => Array.isArray(slip.companyReturnLines) ? slip.companyReturnLines : [])
      .reduce((sum: number, line: any) => {
        const sameProduct = String(line.productCode || '').trim().toLowerCase() ===
          String(contract.productCode || '').trim().toLowerCase();
        if (!sameProduct) return sum;
        const allocations = Array.isArray(line.allocations) ? line.allocations : [];
        const contractAllocations = allocations.filter((allocation: any) =>
          String(allocation.contractId) === String(contract.id) ||
          (
            !allocation.contractId &&
            String(allocation.contractNo || '').trim().toLowerCase() ===
              String(contract.contractNo || '').trim().toLowerCase()
          )
        );
        if (contractAllocations.length) {
          return sum + contractAllocations.reduce(
            (allocationSum: number, allocation: any) => allocationSum + (Number(allocation.quantity) || 0),
            0
          );
        }
        return String(line.sourceContractNo || '').trim().toLowerCase() ===
          String(contract.contractNo || '').trim().toLowerCase()
          ? sum + (Number(line.quantity) || 0)
          : sum;
      }, 0);

  const getParentReceivedTotal = (contract: any) => Math.max(
    0,
    (Array.isArray(slips) ? slips : [])
      .filter((slip: any) => {
        const type = String(slip.type || '').toUpperCase();
        const slipNo = String(slip.slipNo || '').toUpperCase();
        if (slip.sourceReturnSlipId || slip.sourceContractId || slip.craftGroupLeader) return false;
        if (type !== 'NK' && type !== 'NHAP' && !slipNo.startsWith('NK') && !slipNo.startsWith('KS')) return false;
        return String(slip.productCode || '').trim().toLowerCase() ===
            String(contract.productCode || '').trim().toLowerCase() &&
          String(slip.contractNo || '').trim().toLowerCase() ===
            String(contract.contractNo || '').trim().toLowerCase();
      })
      .reduce((sum: number, slip: any) =>
        sum + getReceiptQuantityInContractUnits(slip, String(contract.productCode || '')), 0) -
      getParentReturnedTotal(contract)
  );

  const getReturnedFrameTotal = (contract: any) => {
    const receiptSlips = (Array.isArray(slips) ? slips : [])
      .filter((slip: any) => {
        const slipNo = String(slip.slipNo || '').toUpperCase();
        const type = String(slip.type || '').toUpperCase();
        const isCompanyReceipt = type === 'NK' || type === 'NHAP' || slipNo.startsWith('NK') ||
          ((type === 'NK_KHUNG' || type === 'KS' || slipNo.startsWith('KS')) &&
            !slip.sourceContractId && !slip.craftGroupLeader);
        const isFrameReceipt = !isCompanyReceipt &&
          (slipNo.startsWith('KS') || ['NK_KHUNG', 'KS'].includes(type));
        if (!isFrameReceipt) return false;
        if (slip.sourceContractId) return String(slip.sourceContractId) === String(contract.id);
        return (
          String(slip.contractNo || '').trim().toLowerCase() === String(contract.contractNo || '').trim().toLowerCase() &&
          String(slip.productCode || '').trim().toLowerCase() === String(contract.productCode || '').trim().toLowerCase()
        ) || (
          !slip.contractNo &&
          String(slip.craftGroupLeader || slip.partnerName || slip.partner || '').trim().toLowerCase() ===
            String(contract.craftGroupLeader || '').trim().toLowerCase() &&
          String(slip.productCode || '').trim().toLowerCase() === String(contract.productCode || '').trim().toLowerCase()
        );
      });
    const getReceiptQuantity = (slip: any) =>
      getReceiptQuantityInContractUnits(slip, String(contract.productCode || ''));
    const standaloneReceipts = receiptSlips
      .filter((slip: any) => !slip.sourceReturnSlipId)
      .reduce((sum: number, slip: any) => sum + getReceiptQuantity(slip), 0);
    const productKey = String(contract.productCode || '').trim().toLowerCase();
    const returnLineTotals = (Array.isArray(slips) ? slips : [])
      .filter((slip: any) => String(slip.type || '').toUpperCase() === 'XUAT_KS_TRA_CTY')
      .flatMap((slip: any) => (Array.isArray(slip.companyReturnLines) ? slip.companyReturnLines : [])
        .filter((line: any) =>
          String(line.sourceContractId) === String(contract.id) &&
          String(line.productCode || '').trim().toLowerCase() === productKey
        )
        .map((line: any) => {
          const linkedReceiptQuantity = receiptSlips
            .filter((receipt: any) =>
              String(receipt.sourceReturnSlipId) === String(slip.id) &&
              String(receipt.sourceReturnLineId || '') === String(line.id || '')
            )
            .reduce((sum: number, receipt: any) => sum + getReceiptQuantity(receipt), 0);
          return Math.max(Number(line.quantity) || 0, linkedReceiptQuantity);
        }))
      .reduce((sum: number, quantity: number) => sum + quantity, 0);
    return standaloneReceipts + returnLineTotals;
  };

  const getNetFrameAtGroupTotal = (contract: any) =>
    Math.max(0, getFrameReceiptTotal(contract) - getReturnedFrameTotal(contract));

  const saveFrameExportBatch = () => {
    if (!frameExportContract) return;

    const priorLogs: ActualExportLog[] = Array.isArray(frameExportContract.exportLogs)
      ? frameExportContract.exportLogs
      : [];
    const priorGrossIssued = getFrameReceiptTotal(frameExportContract);
    const priorReceived = Math.max(0, priorGrossIssued - getReturnedFrameTotal(frameExportContract));
    const previousContractQty = Number(frameExportContract.quantity) || 0;
    const newContractQty = Math.max(previousContractQty, Number(frameContractQty) || 0, priorReceived);
    const batchQty = Number(frameExportQty) || 0;
    const remainingBeforeBatch = Math.max(0, newContractQty - priorReceived);
    const batchDeposit = Number(frameDepositAmount) || 0;

    if (batchQty < 0 || batchDeposit < 0) {
      alert('Số lượng xuất và tiền cọc không được âm.');
      return;
    }
    if (batchQty > remainingBeforeBatch) {
      alert(`Số lượng xuất vượt phần còn lại (${formatCurrency(remainingBeforeBatch)}). Hãy tăng tổng số lượng hợp đồng nếu cần.`);
      return;
    }
    if (batchQty === 0 && batchDeposit === 0 && newContractQty === previousContractQty) {
      alert('Vui lòng nhập số lượng khung xuất hoặc tiền cọc của đợt này.');
      return;
    }

    const depositLogs: DepositLog[] = Array.isArray(frameExportContract.depositLogs)
      ? frameExportContract.depositLogs
      : [];
    const priorLaterDeposits = depositLogs.reduce((sum, log) => sum + (Number(log.amount) || 0), 0);
    const initialDeposit = frameExportContract.initialRequiredDeposit !== undefined
      ? Number(frameExportContract.initialRequiredDeposit) || 0
      : Math.max(0, (Number(frameExportContract.requiredDeposit) || 0) - priorLaterDeposits);
    const nextExportLogs = batchQty > 0
      ? [...priorLogs, {
          id: createUniqueId('deposit-'),
          exportDate: frameExportDate || minDateString,
          actualQty: batchQty,
          note: `Xuất khung lần ${priorLogs.length + 1}`
        }]
      : priorLogs;
    const nextDepositLogs = batchDeposit > 0
      ? [...depositLogs, {
          id: createUniqueId('deposit-'),
          depositDate: frameExportDate || minDateString,
          amount: batchDeposit,
          method: frameDepositMethod
        }]
      : depositLogs;
    const nextReceivedTotal = priorGrossIssued + batchQty;
    const nextDepositTotal = initialDeposit + nextDepositLogs.reduce((sum, log) => sum + (Number(log.amount) || 0), 0);

    updateContract({
      ...frameExportContract,
      quantity: newContractQty,
      totalActualExported: nextReceivedTotal,
      exportLogs: nextExportLogs,
      initialRequiredDeposit: initialDeposit,
      requiredDeposit: nextDepositTotal,
      depositLogs: nextDepositLogs,
      depositMethod: batchDeposit > 0 ? frameDepositMethod : frameExportContract.depositMethod
    });
    setFrameExportContract(null);
    alert('Đã lưu đợt xuất khung và cập nhật tiền cọc thành công!');
  };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    if (item.contractType === 'SUB') {
      setActiveTab('SUB');
      setSelectedParentNo(item.parentContractNo || '');
      setCraftGroupLeader(item.craftGroupLeader || '');
      setProductCode(item.productCode || '');
      setProductName((item.productName || '').split(' (')[0]);
      setHouseNumber(item.houseNumber || '');
      setWard(item.ward || '');
      setProvince(item.province || '');
      setPhone(item.phone || '');
      setZalo(item.zalo || '');
      setRequiredDeposit(String(item.requiredDeposit || ''));
      setDepositMethod(item.depositMethod || 'TIEN_MAT');
      setItemTypeOption(item.itemTypeOption || 'BO');
      setSizeQuantities(item.sizeQuantities || {});
      setSizePrices(item.sizePrices || {});
      setBoQuantity(item.boQuantity || '');
      setSubContractMaterials(Array.isArray(item.accompanyingMaterials) && item.accompanyingMaterials.length > 0
        ? item.accompanyingMaterials.map((material: AccompanyingMaterial, index: number) => ({
          id: `${item.id}-material-${index}`,
          materialId: material.materialId,
          materialCode: material.materialCode,
          materialName: material.materialName,
          query: `${material.materialCode} - ${material.materialName}`,
          unit: material.unit,
          quantity: String(material.quantity),
          unitPrice: String(Number(material.unitPrice) || 0),
          isDropdownOpen: false
        }))
        : [createAccompanyingMaterialRow()]);
      if (item.quantity) setContractQty(String(item.quantity));
      if (Array.isArray(item.exportLogs)) setExportLogs(item.exportLogs);
    } else {
      setActiveTab('PARENT');
      setCompanyName(item.companyName || item.company || '');
      setParentContractNo(item.contractNo);
      setProductCode(item.productCode || '');
      setProductName(item.productName || '');
      setCompanyVatRatePercent(String(Number(item.vatRatePercent) || 0));
      setRequiredDeposit(String(item.requiredDeposit || ''));
      setDepositMethod(item.depositMethod || 'TIEN_MAT');
      setDepositDateParent(formatInputDate(getParentDepositDate(item) || minDateString));
    }
    setUnit(getUnitFromProductCode(String(item.productCode || '')) || item.unit || 'Bộ');
    setQuantity(String(item.quantity || 0));
    setUnitPrice(String(item.unitPrice || 0));
    setDueDate(formatInputDate(item.dueDate || minDateString));
    setContractImage(item.contractImage || '');
    setNote(item.note || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (requestedEditContractId === undefined || requestedEditContractId === null) return;
    const contract = (contracts || []).find(
      (item: any) => String(item.id) === String(requestedEditContractId)
    );
    if (!contract) {
      onEditRequestHandled?.();
      return;
    }
    handleEdit(contract);
    window.requestAnimationFrame(() => depositInputRef.current?.focus());
    onEditRequestHandled?.();
  }, [requestedEditContractId, contracts]);

  const handleDelete = (item: any) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa Hợp đồng [${item.contractNo}]?`)) {
      deleteContract(item.id);
      alert('🗑️ Đã xóa hợp đồng thành công!');
      if (editingId === item.id) resetForm();
    }
  };

  const filterList = (list: any[]) => {
    const kw = searchKeyword.trim().toLowerCase();
    if (!kw) return list;
    return list.filter((item: any) => {
      const pCode = String(item.productCode || '').toLowerCase();
      const pName = String(item.productName || '').toLowerCase();
      const leader = String(item.craftGroupLeader || '').toLowerCase();
      const cNo = String(item.contractNo || '').toLowerCase();
      const parentNo = String(item.parentContractNo || '').toLowerCase();
      return pCode.includes(kw) || pName.includes(kw) || leader.includes(kw) || cNo.includes(kw) || parentNo.includes(kw);
    });
  };

  const filteredParentContracts = filterList(parentContractsList);
  const filteredSubContracts = filterList(subContractsList);

  const depositTrackingRows = (() => {
    const parentByContractNo = new Map<string, any>();
    subContractsList.forEach((subContract: any) => {
      const parentNo = String(subContract.parentContractNo || '').trim().toLowerCase();
      if (parentNo && !parentByContractNo.has(parentNo)) {
        const parent = parentContractsList.find(
          (item: any) => String(item.contractNo || '').trim().toLowerCase() === parentNo
        );
        if (parent) parentByContractNo.set(parentNo, parent);
      }
    });

    const rows: Array<{ parent: any | null; subContract: any | null; parentKey: string }> = [];
    const linkedSubContractIds = new Set<string>();

    parentContractsList.forEach((parent: any) => {
      const parentNo = String(parent.contractNo || '').trim().toLowerCase();
      const linkedSubContracts = subContractsList.filter(
        (subContract: any) => parentNo && String(subContract.parentContractNo || '').trim().toLowerCase() === parentNo
      );

      if (linkedSubContracts.length === 0) {
        rows.push({ parent, subContract: null, parentKey: String(parent.id) });
        return;
      }

      linkedSubContracts.forEach((subContract: any) => {
        linkedSubContractIds.add(String(subContract.id));
        rows.push({ parent, subContract, parentKey: String(parent.id) });
      });
    });

    subContractsList.forEach((subContract: any) => {
      if (linkedSubContractIds.has(String(subContract.id))) return;
      const parentNo = String(subContract.parentContractNo || '').trim().toLowerCase();
      const parent = parentNo ? parentByContractNo.get(parentNo) || null : null;
      rows.push({
        parent,
        subContract,
        parentKey: parent ? String(parent.id) : `unlinked-${subContract.id}`
      });
    });

    const productFilter = depositTrackingProductFilter.trim().toLowerCase();
    const subContractFilter = depositTrackingSubContractFilter.trim().toLowerCase();
    return rows.filter(({ parent, subContract }) => {
      const productCodeMatches = !productFilter || [
        parent?.productCode,
        subContract?.productCode
      ].some((value: unknown) => String(value || '').toLowerCase().includes(productFilter));
      const subContractNoMatches = !subContractFilter
        || String(subContract?.contractNo || '').toLowerCase().includes(subContractFilter);
      return productCodeMatches && subContractNoMatches;
    });
  })();

  const depositTrackingTotals = depositTrackingRows.reduce(
    (totals, { parent, subContract, parentKey }) => {
      if (parent && !totals.countedParents.has(parentKey)) {
        totals.income += Number(parent.requiredDeposit) || 0;
        totals.countedParents.add(parentKey);
      }

      if (subContract) {
        const depositLogs: DepositLog[] = Array.isArray(subContract.depositLogs) ? subContract.depositLogs : [];
        const initialDeposit = subContract.initialRequiredDeposit !== undefined
          ? Number(subContract.initialRequiredDeposit) || 0
          : Math.max(0, (Number(subContract.requiredDeposit) || 0) - depositLogs.reduce(
            (sum, log) => sum + (Number(log.amount) || 0),
            0
          ));
        const loggedTotal = initialDeposit + depositLogs.reduce(
          (sum, log) => sum + (Number(log.amount) || 0),
          0
        );
        totals.expense += Math.max(Number(subContract.requiredDeposit) || 0, loggedTotal);
      }

      return totals;
    },
    { income: 0, expense: 0, countedParents: new Set<string>() }
  );

  const exportedSubContracts = subContractsList.filter((item: any) => {
    const logs = Array.isArray(item.exportLogs) ? item.exportLogs : [];
    const totalRec = getNetFrameAtGroupTotal(item);
    const target = Number(item.quantity) || 0;
    
    if (logs.length === 0 && totalRec <= 0) return false;

    const isCompleted = totalRec >= target && target > 0;
    if (frameStatusFilter === 'INCOMPLETE' && isCompleted) return false;
    if (frameStatusFilter === 'COMPLETED' && !isCompleted) return false;

    const kw = frameSearchKw.trim().toLowerCase();
    if (!kw) return true;

    const pCode = String(item.productCode || '').toLowerCase();
    const leader = String(item.craftGroupLeader || '').toLowerCase();
    return pCode.includes(kw) || leader.includes(kw);
  });

  const frameModalExportLogs: ActualExportLog[] = Array.isArray(frameExportContract?.exportLogs)
    ? frameExportContract.exportLogs
    : [];
  const frameModalDepositLogs: DepositLog[] = Array.isArray(frameExportContract?.depositLogs)
    ? frameExportContract.depositLogs
    : [];
  const frameModalReceived = frameExportContract ? getNetFrameAtGroupTotal(frameExportContract) : 0;
  const frameModalContractQty = frameExportContract ? Number(frameExportContract.quantity) || 0 : 0;
  const frameModalTotalQty = Math.max(frameModalContractQty, Number(frameContractQty) || 0, frameModalReceived);
  const frameModalRemaining = Math.max(0, frameModalTotalQty - frameModalReceived);
  const remainingBeforeNewBatch = Math.max(0, targetContractQtyNum - savedExportedTotal);
  const frameModalLaterDeposits = frameModalDepositLogs.reduce((sum, log) => sum + (Number(log.amount) || 0), 0);
  const frameModalInitialDeposit = frameExportContract
    ? frameExportContract.initialRequiredDeposit !== undefined
      ? Number(frameExportContract.initialRequiredDeposit) || 0
      : Math.max(0, (Number(frameExportContract.requiredDeposit) || 0) - frameModalLaterDeposits)
    : 0;

  return (
    <div style={{ padding: '16px', backgroundColor: '#ffffff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', width: '100%', boxSizing: 'border-box' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e293b', marginBottom: '16px' }}>
        {isWarehouseUser ? '🧺 Danh Sách Hợp Đồng Tổ Đan' : '📋 Quản Lý HĐ CTY & HĐ TỔ ĐAN (Truy Vết Theo Mã Hàng)'}
      </h2>

      {!isWarehouseUser && <datalist id="companyList">
        {existingCompanyNames.map((comp: any, idx: number) => <option key={idx} value={comp} />)}
      </datalist>}

      {/* Menu Tabs */}
      {!isWarehouseUser && <div style={{ display: 'flex', gap: '10px', borderBottom: '2px solid #e2e8f0', marginBottom: '20px', paddingBottom: '10px', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => { resetForm(); setActiveTab('PARENT'); }} style={{ padding: '8px 16px', fontWeight: 'bold', fontSize: '13px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: activeTab === 'PARENT' ? '#2563eb' : '#f1f5f9', color: activeTab === 'PARENT' ? '#ffffff' : '#475569' }}>
          🏢 1. Tạo HĐ CTY
        </button>
        <button type="button" onClick={() => { resetForm(); setActiveTab('SUB'); }} style={{ padding: '8px 16px', fontWeight: 'bold', fontSize: '13px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: activeTab === 'SUB' ? '#7c3aed' : '#f1f5f9', color: activeTab === 'SUB' ? '#ffffff' : '#475569' }}>
          🧺 2. Tạo HĐ TỔ ĐAN (Chọn Mã Hàng)
        </button>
        <button type="button" onClick={() => { resetForm(); setActiveTab('REVISION'); }} style={{ padding: '8px 16px', fontWeight: 'bold', fontSize: '13px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: activeTab === 'REVISION' ? '#d97706' : '#f1f5f9', color: activeTab === 'REVISION' ? '#ffffff' : '#475569' }}>
          🔄 3. Phụ Lục Giá & SL
        </button>
        <button type="button" onClick={() => { resetForm(); setActiveTab('FRAME_MGMT'); }} style={{ padding: '8px 16px', fontWeight: 'bold', fontSize: '13px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: activeTab === 'FRAME_MGMT' ? '#0284c7' : '#f1f5f9', color: activeTab === 'FRAME_MGMT' ? '#ffffff' : '#475569' }}>
          📦 4. Quản Lý Khung Tổ Đan
        </button>
        <button type="button" onClick={() => { resetForm(); setActiveTab('DEPOSIT_TRACKING'); }} style={{ padding: '8px 16px', fontWeight: 'bold', fontSize: '13px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: activeTab === 'DEPOSIT_TRACKING' ? '#059669' : '#f1f5f9', color: activeTab === 'DEPOSIT_TRACKING' ? '#ffffff' : '#475569' }}>
          💰 5. Bảng Theo Dõi Nhận &amp; Chi Cọc
        </button>
      </div>}

      {/* FORM 1: HĐ CTY */}
      {activeTab === 'PARENT' && hasPermission('manage_contracts') && (
        <form {...formDraftProps} onSubmit={(e) => {
          e.preventDefault();
          if (submissionLock.current) return;
          submissionLock.current = true;
          setIsSubmitting(true);
          const qty = Number(quantity) || 0;
          const price = Number(unitPrice) || 0;
          const existingParent = (contracts || []).find((item: any) =>
            String(item.id) === String(editingId) ||
            (!editingId && String(item.contractNo || '') === String(parentContractNo || ''))
          );
          const previousDeposit = Number(existingParent?.requiredDeposit) || 0;
          const depositReceivedAt = depositNum > 0
            ? depositNum > previousDeposit || !existingParent?.depositReceivedAt
              ? new Date().toISOString()
              : existingParent.depositReceivedAt
            : undefined;
          const payload = {
            id: editingId || createUniqueId('CTR-P-'),
            contractType: 'PARENT',
            companyName,
            contractNo: parentContractNo || autoGenerateParentNo(companyName),
            productCode,
            productName,
            unit,
            quantity: qty,
            unitPrice: price,
            totalAmount: parentTotalAmount,
            requiredDeposit: depositNum,
            depositReceivedAt,
            depositMethod,
            depositDate: depositDateParent,
            remainingPayment: parentRemainingAmount,
            dueDate,
            vatRatePercent: Number(companyVatRatePercent) || 0,
            contractImage,
            note
          };
          if (editingId) updateContract(payload);
          else addContract(payload);
          alert('💾 Lưu HĐ CTY thành công!');
          resetForm();
          window.setTimeout(() => {
            submissionLock.current = false;
            setIsSubmitting(false);
          }, 700);
        }} style={{ display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1d4ed8', margin: 0 }}>
              {editingId ? '✏️ Cập Nhật HĐ CTY' : '➕ Tạo HĐ CTY Mới'}
            </h3>
            <button type="button" onClick={resetForm} style={{ padding: '6px 14px', backgroundColor: '#10b981', color: '#fff', fontWeight: 'bold', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px' }}>➕ Làm Mới</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>Tên Công Ty Đối Tác:</label>
              <input type="text" required list="companyList" placeholder="VD: CTY CP ARTEX ĐỒNG THÁP" value={companyName} onChange={e => { setCompanyName(e.target.value); if (!editingId) setParentContractNo(autoGenerateParentNo(e.target.value)); }} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>Số HĐ CTY (Tự sinh):</label>
              <input type="text" required value={parentContractNo} onChange={e => setParentContractNo(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 'bold', color: '#1e40af', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>Mã Hàng (Có sổ xuống) & Tên Hàng:</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ width: '45%' }}>
                  <input
                    type="text"
                    required
                    autoComplete="off"
                    placeholder="Mã..."
                    value={productCode}
                    onFocus={() => setIsProductCodeDropdownOpen(true)}
                    onBlur={() => setIsProductCodeDropdownOpen(false)}
                    onChange={e => {
                      handleProductCodeSelect(e.target.value);
                      setIsProductCodeDropdownOpen(true);
                    }}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '2px solid #2563eb', fontWeight: 'bold', boxSizing: 'border-box' }}
                  />
                  {isProductCodeDropdownOpen && filteredProductCodeOptions.length > 0 && (
                    <div role="listbox" style={{ maxHeight: '200px', overflowY: 'auto', backgroundColor: '#fff', border: '1px solid #94a3b8', borderRadius: '6px', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.12)' }}>
                      {filteredProductCodeOptions.map(code => (
                        <button
                          key={code}
                          type="button"
                          role="option"
                          aria-selected={code.toLowerCase() === productCode.trim().toLowerCase()}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => selectProductCodeOption(code)}
                          style={{ display: 'block', width: '100%', padding: '9px 12px', border: 0, borderBottom: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#1e293b', textAlign: 'left', cursor: 'pointer', fontWeight: '600' }}
                        >
                          {code}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="Tên sản phẩm tự nhảy..."
                  value={productName}
                  onChange={e => setProductName(e.target.value)}
                  style={{ width: '55%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>
                Số lượng ({getUnitFromProductCode(productCode) || unit}) &amp; Đơn giá ({getUnitFromProductCode(productCode) || unit}):
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="number" inputMode="numeric" pattern="[0-9]*" placeholder={`SL (${getUnitFromProductCode(productCode) || unit})`} value={quantity} onChange={e => setQuantity(e.target.value)} style={{ width: '50%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                <input type="text" inputMode="decimal" pattern="[0-9.,]*" placeholder="Đơn giá" value={unitPrice ? formatCurrency(unitPrice) : ''} onChange={e => setUnitPrice(e.target.value.replace(/\D/g, ''))} style={{ width: '50%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: '#15803d' }}>📊 Thành Tiền Tổng:</label>
              <input
                type="text"
                readOnly
                value={`${formatCurrency(parentTotalAmount)} VNĐ`}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #86efac', fontSize: '14px', fontWeight: 'bold', color: '#15803d', backgroundColor: '#f0fdf4', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>Thuế GTGT đầu ra (%):</label>
              <input
                type="number"
                min="0"
                max="100"
                step="any"
                value={companyVatRatePercent}
                onChange={event => setCompanyVatRatePercent(event.target.value)}
                placeholder="Nhập thuế suất nếu có"
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ backgroundColor: '#fef2f2', padding: '10px', borderRadius: '6px', border: '1px solid #fca5a5' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: '#dc2626' }}>💰 Tiền Cọc Cty (VNĐ):</label>
              <input
                type="text"
                ref={depositInputRef}
                inputMode="decimal"
                pattern="[0-9.,]*"
                placeholder="VD: 500,000"
                value={depositNum > 0 ? depositNum.toLocaleString('vi-VN') : requiredDeposit}
                onChange={handleDepositChange}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #f87171', fontSize: '14px', fontWeight: 'bold', color: '#dc2626', backgroundColor: '#fff', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: '10px', marginTop: '6px', fontSize: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input type="radio" name="depositMethodParent" checked={depositMethod === 'TIEN_MAT'} onChange={() => setDepositMethod('TIEN_MAT')} /> Tiền mặt
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input type="radio" name="depositMethodParent" checked={depositMethod === 'CHUYEN_KHOAN'} onChange={() => setDepositMethod('CHUYEN_KHOAN')} /> Chuyển khoản
                </label>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: '#1e40af' }}>💵 Số Tiền Còn Lại:</label>
              <input
                type="text"
                readOnly
                value={`${formatCurrency(parentRemainingAmount)} VNĐ`}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '14px', fontWeight: 'bold', color: '#1e40af', backgroundColor: '#eff6ff', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: '#047857' }}>📅 Ngày Nhận Cọc:</label>
              <input
                type="date"
                value={depositDateParent}
                onChange={e => setDepositDateParent(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #10b981', borderRadius: '6px', fontWeight: 'bold', color: '#047857', backgroundColor: '#fff', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>Hạn Đan ({formatDateVN(dueDate)}):</label>
              <input type="date" required min={minDateString} value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 'bold' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>Ghi chú HĐ:</label>
              <input type="text" placeholder="Ghi chú chi tiết..." value={note} onChange={e => setNote(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
            </div>

            <div>
              <ImageCaptureInput onImageCaptured={url => setContractImage(url)} />
            </div>
          </div>

          <button type="submit" disabled={isSubmitting} style={{ padding: '12px', backgroundColor: isSubmitting ? '#94a3b8' : '#2563eb', color: '#fff', fontWeight: 'bold', fontSize: '14px', borderRadius: '6px', border: 'none', cursor: isSubmitting ? 'wait' : 'pointer' }}>
            {isSubmitting ? '⏳ Đang lưu...' : '💾 Lưu HĐ CTY'}
          </button>
        </form>
      )}
{/* 📋 Danh Sách Hợp Đồng CTY Đã Tạo ({Array.isArray(contracts) ? contracts.filter((c: any) => c.contractType === 'PARENT').length : 0})
        </h3>

        <div style={{ overflowX: 'auto' }}>
  <table style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '10px' }}>Số HĐ CTY</th>
                <th style={{ padding: '10px' }}>Tên Công Ty</th>
                <th style={{ padding: '10px' }}>Mã & Tên Hàng</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Số Lượng (ĐVT theo Mã Hàng)</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Đơn Giá</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Thành Tiền</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Tiền Cọc</th>
                <th style={{ padding: '10px' }}>Hạn Đan</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const parentList = Array.isArray(contracts) ? contracts.filter((c: any) => c.contractType === 'PARENT') : [];

                if (parentList.length === 0) {
                  return (
                    <tr>
                      <td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
                        Chưa có hợp đồng CTY nào được tạo!
                      </td>
                    </tr>
                  );
                }

                return parentList.map((item: any, idx: number) => (
                  <tr key={item.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: '#2563eb' }}>{item.contractNo}</td>
                    <td style={{ padding: '10px', fontWeight: '600' }}>{item.companyName}</td>
                    <td style={{ padding: '10px' }}>
                      <span style={{ fontWeight: 'bold', color: '#7c3aed' }}>[{item.productCode}]</span> {item.productName}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>
                      {Number(item.quantity || 0).toLocaleString()} {getUnitFromProductCode(String(item.productCode || '')) || item.unit || 'Bộ'}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>{Number(item.unitPrice || 0).toLocaleString()} đ</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#16a34a' }}>
                      {Number(item.totalAmount || 0).toLocaleString()} đ
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', color: '#d97706' }}>
                      {Number(item.requiredDeposit || 0).toLocaleString()} đ
                    </td>
                    <td style={{ padding: '10px' }}>{formatDateVN(item.dueDate)}</td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof setEditingId === 'function') setEditingId(item.id);
                          // Điền lại dữ liệu vào form khi bấm sửa
                          if (typeof setCompanyName === 'function') setCompanyName(item.companyName || '');
                          if (typeof setParentContractNo === 'function') setParentContractNo(item.contractNo || '');
                          if (typeof setProductCode === 'function') setProductCode(item.productCode || '');
                          if (typeof setUnit === 'function') setUnit(getUnitFromProductCode(String(item.productCode || '')) || item.unit || 'Bộ');
                          if (typeof setProductName === 'function') setProductName(item.productName || '');
                          if (typeof setQuantity === 'function') setQuantity(item.quantity || '');
                          if (typeof setUnitPrice === 'function') setUnitPrice(item.unitPrice || '');
                          if (typeof setCompanyVatRatePercent === 'function') setCompanyVatRatePercent(String(Number(item.vatRatePercent) || 0));
                          if (typeof setDueDate === 'function') setDueDate(item.dueDate || '');
                        }}
                        style={{ padding: '4px 8px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '4px', fontSize: '12px' }}
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('Bạn có chắc chắn muốn xóa hợp đồng này?')) {
                            if (typeof deleteContract === 'function') deleteContract(item.id);
                          }
                        }}
                        style={{ padding: '4px 8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                      >
                        Xóa
                      </button>
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      </div>
      {/* FORM 2: HĐ TỔ ĐAN */}
      {activeTab === 'SUB' && hasPermission('manage_contracts') && (
        <form {...formDraftProps} onSubmit={(e) => {
          e.preventDefault();
          if (submissionLock.current) return;
          if (!productCode) { alert('Vui lòng nhập hoặc chọn Mã Hàng!'); return; }
          if (!selectedParentNo) { alert('Mã hàng này chưa được gắn với HĐ Cty nào. Vui lòng tạo HĐ Cty trước!'); return; }
          if (isSubDueDateInvalid) return;
          if (isPriceHigherThanCompany) { alert('⚠️ Đơn giá giao tổ đan không được cao hơn giá cty!'); return; }

          if (isSubPhoneInvalid || isSubZaloInvalid) {
            alert('⚠️ Số điện thoại và Zalo phải có đúng 10 chữ số, bắt đầu bằng đầu số di động hợp lệ tại Việt Nam!');
            return;
          }

          const cleanPhone = phone;
          const cleanZalo = zalo;

          if (depositNum > calculatedTotalAmount) { alert('⚠️ Tiền cọc cao hơn số thành tiền!'); return; }

          if (isExceeded) {
            alert(`⛔ CHẶN LƯU VƯỢT SỐ LƯỢNG HỢP ĐỒNG ĐAN!\n\n- Tổng SL HĐ: ${targetContractQtyNum}\n- Đã nhận trước đó: ${savedExportedTotal}\n- Đang nhập hôm nay: ${inputNewQtyNum}\n- Vượt quá hạn mức hợp đồng!`);
            return;
          }

          const materialRowsWithInput = subContractMaterials.filter(row =>
            row.query.trim() || row.quantity.trim() || row.materialId !== null
          );
          if (materialRowsWithInput.some(row =>
            row.materialId === null ||
            !Number.isFinite(Number(row.quantity)) || Number(row.quantity) <= 0 ||
            !Number.isFinite(Number(row.unitPrice || 0)) || Number(row.unitPrice || 0) < 0
          )) {
            alert('Vui lòng chọn nguyên phụ liệu, nhập số lượng lớn hơn 0 và đơn giá hợp lệ cho từng dòng!');
            return;
          }
          submissionLock.current = true;
          setIsSubmitting(true);
          const savedSubContractMaterials: AccompanyingMaterial[] = materialRowsWithInput.flatMap(row => {
            if (row.materialId === null) return [];
            const material = materials.find((item: CategoryItem) => item.id === row.materialId);
            return [{
              materialId: row.materialId,
              materialCode: material?.code || row.materialCode,
              materialName: material?.name || row.materialName,
              quantity: Number(row.quantity),
              unitPrice: Number(row.unitPrice) || 0,
              amount: Number(row.quantity) * (Number(row.unitPrice) || 0),
              unit: row.unit
            }];
          });

          let updatedLogs = [...exportLogs];
          if (inputNewQtyNum > 0) {
            updatedLogs.push({
              id: createUniqueId('deposit-'),
              exportDate: newDate || minDateString,
              actualQty: inputNewQtyNum,
              note: newNote || `Nhận ngày ${formatDateVN(newDate)}`
            });
          }
          
          const existingSubContract = editingId
            ? (contracts || []).find((contract: any) => String(contract.id) === String(editingId))
            : null;
          const existingDepositLogs: DepositLog[] = Array.isArray(existingSubContract?.depositLogs)
            ? existingSubContract.depositLogs
            : [];
          const existingLaterDeposits = existingDepositLogs.reduce((sum, log) => sum + (Number(log.amount) || 0), 0);
          const initialDeposit = existingSubContract?.initialRequiredDeposit !== undefined
            ? Number(existingSubContract.initialRequiredDeposit) || 0
            : Math.max(0, (Number(existingSubContract?.requiredDeposit) || depositNum) - existingLaterDeposits);
          const preservedReceivedTotal = Math.max(
            totalActualExported,
            Number(existingSubContract?.totalActualExported) || 0,
            updatedLogs.reduce((sum, log) => sum + (Number(log.actualQty) || 0), 0)
          );
          const payload = {
            id: editingId || createUniqueId('CTR-S-'),
            contractType: 'SUB',
            parentContractNo: selectedParentNo,
            companyName: 'Nội bộ Tổ Đan',
            productCode,
            productName: `${productName} (${summaryText})`,
            craftGroupLeader,
            houseNumber,
            ward,
            province,
            fullAddress: [houseNumber, ward, province].filter(Boolean).join(', '),
            phone: cleanPhone,
            zalo: cleanZalo,
            requiredDeposit: existingSubContract
              ? Math.max(depositNum, initialDeposit + existingLaterDeposits)
              : depositNum,
            depositMethod,
            itemTypeOption: !isSetItem ? 'CAI' : itemTypeOption,
            sizeQuantities: !isSetItem ? {} : sizeQuantities,
            sizePrices: !isSetItem ? {} : sizePrices,
            boQuantity: !isSetItem ? '' : boQuantity,
            contractNo: generatedSubNo(),
            quantity: Math.max(targetContractQtyNum, Number(existingSubContract?.quantity) || 0, preservedReceivedTotal),
            totalActualExported: preservedReceivedTotal,
            exportLogs: updatedLogs,
            initialRequiredDeposit: initialDeposit,
            depositLogs: existingDepositLogs,
            summaryText,
            unitPrice: Number(unitPrice) || 0,
            unit: isSetItem ? 'Bộ' : 'Cái',
            totalAmount: calculatedTotalAmount,
            dueDate,
            contractImage,
            accompanyingMaterials: savedSubContractMaterials,
            accompanyingMaterialsIssuedDate: existingSubContract?.accompanyingMaterialsIssuedDate ||
              (editingId ? undefined : minDateString)
          };
          if (editingId) updateContract(payload);
          else addContract(payload);
          alert(`🧺 Lưu Hợp Đồng Tổ Đan thành công!`);
          resetForm();
          window.setTimeout(() => {
            submissionLock.current = false;
            setIsSubmitting(false);
          }, 700);
        }} style={{ display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: '#faf5ff', padding: '20px', borderRadius: '8px', border: '1px solid #e9d5ff', marginBottom: '24px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#6d28d9', margin: 0, textTransform: 'uppercase' }}>
              👜 HĐ TỔ ĐAN
            </h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" onClick={resetForm} style={{ padding: '6px 14px', backgroundColor: '#10b981', color: '#fff', fontWeight: 'bold', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px' }}>➕ Làm Mới</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: '#7c3aed' }}>1. Mã Hàng (Có sổ xuống):</label>
              <div>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="Gõ hoặc chọn mã hàng..."
                  value={productCode}
                  onFocus={() => setIsProductCodeDropdownOpen(true)}
                  onBlur={() => setIsProductCodeDropdownOpen(false)}
                  onChange={e => {
                    handleSubProductCodeSelect(e.target.value);
                    setIsProductCodeDropdownOpen(true);
                  }}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '2px solid #7c3aed', fontSize: '14px', fontWeight: 'bold', backgroundColor: '#fff', boxSizing: 'border-box' }}
                />
                {isProductCodeDropdownOpen && filteredProductCodeOptions.length > 0 && (
                  <div role="listbox" style={{ maxHeight: '200px', overflowY: 'auto', backgroundColor: '#fff', border: '1px solid #94a3b8', borderRadius: '6px', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.12)' }}>
                    {filteredProductCodeOptions.map(code => (
                      <button
                        key={code}
                        type="button"
                        role="option"
                        aria-selected={code.toLowerCase() === productCode.trim().toLowerCase()}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => selectProductCodeOption(code)}
                        style={{ display: 'block', width: '100%', padding: '9px 12px', border: 0, borderBottom: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#1e293b', textAlign: 'left', cursor: 'pointer', fontWeight: '600' }}
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: '#1e40af' }}>2. HĐ Cty Được Truy Vết (Tự Động):</label>
              <input
                type="text"
                readOnly
                value={selectedParentNo ? `${selectedParentNo} (Đã khớp hệ thống)` : '⚠️ Chưa khớp mã với HĐ Cty nào'}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', backgroundColor: selectedParentNo ? '#eff6ff' : '#fef2f2', fontWeight: 'bold', color: selectedParentNo ? '#1e40af' : '#dc2626', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>Tên Hàng (Tự nhảy):</label>
              <input type="text" placeholder="Tên sản phẩm..." value={productName} onChange={e => setProductName(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }} />
            </div>
          </div>

          {isSetItem && maxAllowedSizes > 1 && (
            <div style={{ backgroundColor: '#ffffff', padding: '14px', borderRadius: '8px', border: '2px solid #7c3aed' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#6b21a8', marginBottom: '8px' }}>
                ⚙️ PHÂN LOẠI LỌC THEO CHỈ TIÊU (Mã hàng là BỘ gồm {maxAllowedSizes} Cái/Size):
              </label>
              
              <div style={{ display: 'flex', gap: '20px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#1e293b' }}>
                  <input type="radio" name="itemTypeOpt" checked={itemTypeOption === 'BO'} onChange={() => setItemTypeOption('BO')} /> 📦 Chỉ Tính Theo BỘ
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#1e293b' }}>
                  <input type="radio" name="itemTypeOpt" checked={itemTypeOption === 'CAI'} onChange={() => setItemTypeOption('CAI')} /> 🧩 Tách Theo CÁI (Từng Size)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#1e293b' }}>
                  <input type="radio" name="itemTypeOpt" checked={itemTypeOption === 'CA_HAI'} onChange={() => setItemTypeOption('CA_HAI')} /> 🔄 Cả BỘ & CÁI
                </label>
              </div>

              {(itemTypeOption === 'CAI' || itemTypeOption === 'CA_HAI') && (
                <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', backgroundColor: '#faf5ff', padding: '12px', borderRadius: '6px', border: '1px dashed #d8b4fe' }}>
                  {itemTypeOption === 'CA_HAI' && (
                    <div style={{ gridColumn: '1 / -1', marginBottom: '6px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#6b21a8' }}>Số Lượng Bộ Gốc:</label>
                      <input type="number" inputMode="numeric" pattern="[0-9]*" placeholder="Số lượng bộ..." value={boQuantity} onChange={e => setBoQuantity(e.target.value)} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                    </div>
                  )}

                  {Array.from({ length: maxAllowedSizes }).map((_, idx) => {
                    const sName = `Cái ${idx + 1}`;
                    return (
                      <div key={idx} style={{ backgroundColor: '#fff', padding: '8px', borderRadius: '6px', border: '1px solid #e9d5ff' }}>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#7c3aed', display: 'block', marginBottom: '4px' }}>{sName}:</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <input
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="SL cái..."
                            value={sizeQuantities[sName] || ''}
                            onChange={e => setSizeQuantities({ ...sizeQuantities, [sName]: e.target.value })}
                            style={{ width: '50%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                          />
                          <input
                            type="text"
                            inputMode="decimal"
                            pattern="[0-9.,]*"
                            placeholder="Đơn giá cái..."
                            value={sizePrices[sName] ? formatCurrency(sizePrices[sName]) : ''}
                            onChange={e => setSizePrices({ ...sizePrices, [sName]: e.target.value.replace(/\D/g, '') })}
                            style={{ width: '50%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>Tên Tổ Đan:</label>
              <input type="text" required placeholder="VD: TRANG" value={craftGroupLeader} onChange={e => setCraftGroupLeader(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 'bold', color: '#7c3aed' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>Địa chỉ:</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input type="text" placeholder="Số nhà" value={houseNumber} onChange={e => setHouseNumber(e.target.value)} style={{ width: '35%', padding: '8px 4px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                <input type="text" placeholder="Xã" value={ward} onChange={e => setWard(e.target.value)} style={{ width: '30%', padding: '8px 4px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                <input type="text" placeholder="Tỉnh" value={province} onChange={e => setProvince(e.target.value)} style={{ width: '35%', padding: '8px 4px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>SĐT / Zalo (Đúng 10 số):</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input type="tel" inputMode="numeric" placeholder="SĐT 10 số" value={phone} onChange={e => setPhone(filterPhoneDigits(e.target.value))} aria-invalid={isSubPhoneInvalid} style={{ width: '50%', padding: '8px', border: `1px solid ${isSubPhoneInvalid ? '#dc2626' : '#cbd5e1'}`, borderRadius: '6px', fontSize: '12px' }} />
                <input type="tel" inputMode="numeric" placeholder="Zalo 10 số" value={zalo} onChange={e => setZalo(filterPhoneDigits(e.target.value))} aria-invalid={isSubZaloInvalid} style={{ width: '50%', padding: '8px', border: `1px solid ${isSubZaloInvalid ? '#dc2626' : '#cbd5e1'}`, borderRadius: '6px', fontSize: '12px' }} />
              </div>
              {(isSubPhoneInvalid || isSubZaloInvalid) && (
                <div role="alert" style={{ marginTop: '6px', color: '#dc2626', fontSize: '12px', fontWeight: 700 }}>
                  {isSubPhoneInvalid && 'Số điện thoại phải có đúng 10 chữ số hợp lệ.'}
                  {isSubPhoneInvalid && isSubZaloInvalid && ' '}
                  {isSubZaloInvalid && 'Số Zalo phải có đúng 10 chữ số hợp lệ.'}
                </div>
              )}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>
                Hạn Đan Tổ Đan{parentDueDate ? ` (Hạn HĐ Cty: ${formatDateVN(parentDueDate)})` : ''}:
              </label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                style={{ width: '100%', padding: '8px', border: `1px solid ${isSubDueDateInvalid ? '#dc2626' : '#cbd5e1'}`, borderRadius: '6px', fontWeight: 'bold', boxSizing: 'border-box' }}
              />
              {isSubDueDateInvalid && (
                <div role="alert" style={{ color: '#dc2626', fontSize: '12px', fontWeight: '600', marginTop: '6px' }}>
                  Hạn đan Tổ Đan phải sớm hơn Hạn đan HĐ Cty để kịp tiến độ giao hàng!
                </div>
              )}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>Tiền Cọc (VNĐ):</label>
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9.,]*"
                placeholder="VD: 500,000"
                value={depositNum > 0 ? depositNum.toLocaleString('vi-VN') : requiredDeposit}
                onChange={handleDepositChange}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', fontWeight: 'bold', color: '#dc2626', backgroundColor: '#fff', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: '10px', marginTop: '6px', fontSize: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input type="radio" name="depositMethodSub" checked={depositMethod === 'TIEN_MAT'} onChange={() => setDepositMethod('TIEN_MAT')} /> Tiền mặt
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input type="radio" name="depositMethodSub" checked={depositMethod === 'CHUYEN_KHOAN'} onChange={() => setDepositMethod('CHUYEN_KHOAN')} /> Chuyển khoản
                </label>
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: '#fffbe3', padding: '14px', borderRadius: '8px', border: '1px solid #fde68a' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#b45309', marginBottom: '6px' }}>
              🎯 TỔNG SỐ LƯỢNG HỢP ĐỒNG TỔ ĐAN ({isSetItem ? 'Số lượng Bộ' : 'Số lượng Cái'} giao đan):
            </label>
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              required
              placeholder="Nhập số lượng giao đan..."
              value={contractQty}
              onChange={e => setContractQty(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '2px solid #d97706', fontSize: '16px', fontWeight: 'bold', color: '#b45309', backgroundColor: '#fff', boxSizing: 'border-box' }}
            />
          </div>

          {/* Cấu hình đợt nhận hàng */}
          <div style={{ backgroundColor: '#ffffff', padding: '14px', borderRadius: '8px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b' }}>📦 TIẾN ĐỘ NHẬN KHUNG (Gõ số lượng nhận hôm nay):</span>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '10px', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#334155' }}>Ngày nhận ({formatDateVN(newDate)}):</label>
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#334155' }}>SL nhận hôm nay:</label>
                <input type="number" inputMode="numeric" pattern="[0-9]*" min="0" max={remainingBeforeNewBatch} placeholder="SL..." value={newQty} onChange={e => setNewQty(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '2px solid #7c3aed', fontSize: '13px', fontWeight: 'bold', backgroundColor: '#fff' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#334155' }}>Ghi chú đợt nhận:</label>
                <input type="text" placeholder="Ghi chú đợt..." value={newNote} onChange={e => setNewNote(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
              </div>
            </div>

            <div style={{ padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #bbf7d0' }}>
              <div>
                <span>Tiến độ đã nhận: </span>
                <span style={{ color: '#059669', fontSize: '18px', fontWeight: '800' }}>{totalActualExported} / {targetContractQtyNum}</span>
                <span style={{ fontSize: '13px', color: '#047857', fontWeight: '600', marginLeft: '4px' }}>{isSetItem ? 'bộ' : 'cái'}</span>
              </div>
              <div>
                <span>Còn lại chưa nhận: </span>
                <span style={{ color: remainingQty === 0 ? '#059669' : '#2563eb', fontSize: '18px', fontWeight: '800' }}>{remainingQty}</span>
                <span style={{ fontSize: '13px', color: '#1d4ed8', fontWeight: '600', marginLeft: '4px' }}>{isSetItem ? 'bộ' : 'cái'}</span>
              </div>
            </div>
          </div>

          <section style={{ backgroundColor: '#fff', padding: '16px', borderRadius: '8px', border: '2px solid #0f766e' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <strong style={{ color: '#0f766e', fontSize: '14px' }}>Nguyên Phụ Liệu Kèm Theo</strong>
              <button
                type="button"
                onClick={() => setSubContractMaterials(rows => [...rows, createAccompanyingMaterialRow()])}
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
            {subContractMaterials.map(row => {
              const suggestions = (materials || []).filter((material: CategoryItem) =>
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
                      onFocus={() => setSubContractMaterials(rows => rows.map(item =>
                        item.id === row.id ? { ...item, isDropdownOpen: true } : item
                      ))}
                      onBlur={() => setSubContractMaterials(rows => rows.map(item =>
                        item.id === row.id ? { ...item, isDropdownOpen: false } : item
                      ))}
                      onChange={event => setSubContractMaterials(rows => rows.map(item => item.id === row.id
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
                            onClick={() => setSubContractMaterials(rows => rows.map(item => item.id === row.id
                              ? {
                                ...item,
                                materialId: material.id,
                                materialCode: material.code,
                                materialName: material.name,
                                query: material.name,
                                unit: material.unit || item.unit,
                                unitPrice: String(getLatestMaterialUnitPrice(material, slips, expenses) || ''),
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
                    onChange={event => setSubContractMaterials(rows => rows.map(item =>
                      item.id === row.id ? { ...item, unit: event.target.value as MaterialUnit } : item
                    ))}
                    style={{ width: '100%', padding: '9px', border: '1px solid #94a3b8', borderRadius: '5px', backgroundColor: '#fff' }}
                  >
                    {[...new Set(['kg', 'lọn', 'bó', 'cái', ...materials.map((material: CategoryItem) => material.unit).filter(Boolean), row.unit])].map(option => (
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
                    onChange={event => setSubContractMaterials(rows => rows.map(item =>
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
                    onChange={event => setSubContractMaterials(rows => rows.map(item =>
                      item.id === row.id ? { ...item, unitPrice: event.target.value } : item
                    ))}
                    style={{ width: '100%', padding: '9px', border: '1px solid #94a3b8', borderRadius: '5px', boxSizing: 'border-box' }}
                  />
                  <div aria-label="Thành tiền nguyên phụ liệu" style={{ minHeight: '37px', padding: '9px', border: '1px solid #e2e8f0', borderRadius: '5px', boxSizing: 'border-box', backgroundColor: '#f8fafc', textAlign: 'right', fontWeight: 700 }}>
                    {((Number(row.quantity) || 0) * (Number(row.unitPrice) || 0)).toLocaleString('vi-VN')} đ
                  </div>
                  <button
                    type="button"
                    aria-label="Xóa dòng nguyên phụ liệu"
                    onClick={() => setSubContractMaterials(rows => {
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
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>Đơn Giá ({isSetItem ? 'Bộ' : 'Cái'}) (VNĐ):</label>
              <input type="text" inputMode="decimal" pattern="[0-9.,]*" placeholder="Đơn giá" value={unitPrice ? formatCurrency(unitPrice) : ''} onChange={e => setUnitPrice(e.target.value.replace(/\D/g, ''))} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 'bold' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>Thành Tiền Tổng:</label>
              <input type="text" readOnly value={`${formatCurrency(calculatedTotalAmount)} VNĐ`} style={{ width: '100%', padding: '8px', backgroundColor: '#f0fdf4', fontWeight: 'bold', color: '#15803d', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>Tổng nguyên phụ liệu:</label>
              <input type="text" readOnly value={`${formatCurrency(accompanyingMaterialTotal)} VNĐ`} style={{ width: '100%', padding: '8px', backgroundColor: '#f0fdfa', fontWeight: 'bold', color: '#0f766e', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>Thanh toán sau cọc:</label>
              <input type="text" readOnly value={`${formatCurrency(remainingPaymentAmount)} VNĐ`} style={{ width: '100%', padding: '8px', backgroundColor: '#eff6ff', fontWeight: 'bold', color: '#1e40af', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
              <small style={{ display: 'block', marginTop: '5px', color: '#475569' }}>
                {formatCurrency(calculatedTotalAmount)} − cọc {formatCurrency(depositNum)} − nguyên phụ liệu {formatCurrency(accompanyingMaterialTotal)}
              </small>
            </div>
          </div>

          <button type="submit" disabled={isSubmitting || isPriceHigherThanCompany || isSubDueDateInvalid || isSubPhoneInvalid || isSubZaloInvalid} style={{ padding: '14px', backgroundColor: isSubmitting || isPriceHigherThanCompany || isSubDueDateInvalid || isSubPhoneInvalid || isSubZaloInvalid ? '#94a3b8' : '#7c3aed', color: '#fff', fontWeight: 'bold', fontSize: '15px', borderRadius: '8px', border: 'none', cursor: isSubmitting || isPriceHigherThanCompany || isSubDueDateInvalid || isSubPhoneInvalid || isSubZaloInvalid ? 'not-allowed' : 'pointer' }}>
            {isSubmitting ? '⏳ Đang lưu...' : '💾 Lưu Hợp Đồng Tổ Đan'}
          </button>
        </form>
      )}

      {activeTab === 'SUB' && isSubContractSlipOpen && subContractSlipData && (
        <div
          className="sub-contract-slip-overlay"
          onClick={() => setSubContractSlipData(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backgroundColor: 'rgba(15, 23, 42, 0.65)' }}
        >
          <style>{`
            @media print {
              @page { size: A4; margin: 16mm; }
              body * { visibility: hidden !important; }
              .sub-contract-slip-overlay,
              .sub-contract-slip-overlay * { visibility: visible !important; }
              .sub-contract-slip-overlay {
                position: absolute !important;
                inset: 0 !important;
                display: block !important;
                padding: 0 !important;
                overflow: visible !important;
                background: #fff !important;
              }
              .sub-contract-slip-paper {
                width: 100% !important;
                max-width: none !important;
                min-height: 0 !important;
                padding: 0 !important;
                border: 0 !important;
                box-shadow: none !important;
              }
              .sub-contract-slip-actions { display: none !important; }
            }
          `}</style>
          <section
            className="sub-contract-slip-paper"
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '820px', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', backgroundColor: '#fff', padding: '40px 48px', borderRadius: '8px', boxShadow: '0 20px 50px rgba(15, 23, 42, 0.3)', color: '#172033', boxSizing: 'border-box' }}
          >
            <header style={{ textAlign: 'center', borderBottom: '2px solid #1e293b', paddingBottom: '18px', marginBottom: '24px' }}>
              <div style={{ fontSize: '15px', fontWeight: '800', letterSpacing: '2px' }}>LỤC BÌNH CRAFTS</div>
              <h2 style={{ fontSize: '25px', fontWeight: '800', margin: '14px 0 8px', letterSpacing: '1px' }}>PHIẾU HỢP ĐỒNG TỔ ĐAN</h2>
              <div style={{ fontSize: '14px' }}>Ngày lập: {subContractSlipData.createdAt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
            </header>

            <section style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '800', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '12px' }}>I. THÔNG TIN HỢP ĐỒNG</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', fontSize: '14px' }}>
                <div><strong>Số hợp đồng công ty truy vết:</strong> {subContractSlipData.parentContractNo || '—'}</div>
                <div><strong>Mã hàng:</strong> {subContractSlipData.productCode || '—'}</div>
                <div><strong>Tên sản phẩm:</strong> {subContractSlipData.productName || '—'}</div>
                <div><strong>Tên tổ đan:</strong> {subContractSlipData.groupName || '—'}</div>
                <div><strong>Số điện thoại:</strong> {subContractSlipData.phone || '—'}</div>
                <div><strong>Zalo:</strong> {subContractSlipData.zalo || '—'}</div>
              </div>
            </section>

            <section style={{ marginBottom: '36px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '800', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '12px' }}>II. SỐ LƯỢNG VÀ TÀI CHÍNH</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <tbody>
                  {[
                    ['Tổng số lượng giao', `${formatCurrency(subContractSlipData.quantity)} ${subContractSlipData.quantityUnit}`],
                    ['Số lượng đã nhận', `${formatCurrency(subContractSlipData.receivedQuantity)} ${subContractSlipData.quantityUnit}`],
                    ['Số lượng còn lại', `${formatCurrency(subContractSlipData.remainingQuantity)} ${subContractSlipData.quantityUnit}`],
                    [`Đơn giá (${subContractSlipData.quantityUnit})`, `${formatCurrency(subContractSlipData.unitPrice)} VNĐ`],
                    ['Tiền cọc', `${formatCurrency(subContractSlipData.deposit)} VNĐ`],
                    ['Thành tiền tổng cộng', `${formatCurrency(subContractSlipData.totalAmount)} VNĐ`]
                  ].map(([label, value]) => (
                    <tr key={label}>
                      <td style={{ border: '1px solid #cbd5e1', padding: '10px 12px', fontWeight: label === 'Thành tiền tổng cộng' ? '800' : '500', backgroundColor: '#f8fafc' }}>{label}</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: label === 'Thành tiền tổng cộng' ? '#166534' : '#172033' }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', textAlign: 'center', marginTop: '48px', fontSize: '14px' }}>
              <div>
                <strong>Bên Giao</strong>
                <div style={{ fontSize: '12px', marginTop: '3px' }}>(Đại diện công ty)</div>
                <div style={{ height: '90px' }} />
                <div>............................</div>
              </div>
              <div>
                <strong>Bên Nhận</strong>
                <div style={{ fontSize: '12px', marginTop: '3px' }}>(Tổ đan)</div>
                <div style={{ height: '90px' }} />
                <div>{subContractSlipData.groupName || '............................'}</div>
              </div>
            </section>

            <div className="sub-contract-slip-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap', marginTop: '32px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
              <button type="button" onClick={() => window.print()} style={{ padding: '9px 14px', backgroundColor: '#475569', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>🖨️ In Phiếu / Lưu PDF</button>
              <button type="button" onClick={handleShareSubContractSlipToZalo} style={{ padding: '9px 14px', backgroundColor: '#2563eb', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>📲 Gửi Zalo (Mở Chat &amp; Copy)</button>
              <button type="button" onClick={() => setSubContractSlipData(null)} style={{ padding: '9px 14px', backgroundColor: '#dc2626', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>❌ Đóng</button>
            </div>
          </section>
        </div>
      )}

      {/* TAB 4: QUẢN LÝ XUẤT KHUNG TỔ ĐAN */}
      {activeTab === 'FRAME_MGMT' && (
        <div style={{ backgroundColor: '#f0f9ff', padding: '20px', borderRadius: '8px', border: '1px solid #bae6fd', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>
              📦 Danh Sách Hợp Đồng Tổ Đan Đã Xuất Khung
            </h3>
            
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={frameStatusFilter}
                onChange={e => setFrameStatusFilter(e.target.value as any)}
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #0284c7', fontSize: '13px', fontWeight: 'bold', color: '#0369a1', backgroundColor: '#fff' }}
              >
                <option value="INCOMPLETE">⚠️ Chưa Xuất Đủ Khung</option>
                <option value="COMPLETED">✅ Đã Xuất Đủ Khung</option>
                <option value="ALL">📋 Tất Cả Đã Xuất Khung</option>
              </select>

              <input
                type="text"
                placeholder="🔍 Tìm theo Mã Hàng hoặc Tên Tổ Đan..."
                value={frameSearchKw}
                onChange={e => setFrameSearchKw(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', width: '260px' }}
              />
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
  <table style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#e0f2fe', borderBottom: '2px solid #7dd3fc' }}>
                  <th style={{ padding: '10px' }}>Mã Hàng</th>
                  <th style={{ padding: '10px' }}>Tên Tổ Đan</th>
                  <th style={{ padding: '10px' }}>Lần Xuất Đầu (Lần 1)</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>SL Hợp Đồng</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Tổng Khung Phát</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Đang Ở Tổ (Sau Thu Hồi)</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Còn Thiếu</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Đã Thu Hồi</th>
                  <th style={{ padding: '10px', textAlign: 'center' }}>Trạng Thái Khung</th>
                  <th style={{ padding: '10px', textAlign: 'center' }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {exportedSubContracts.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
                      Không tìm thấy hợp đồng nào phù hợp với bộ lọc!
                    </td>
                  </tr>
                ) : (
                  exportedSubContracts.map((item: any) => {
                    const logs = Array.isArray(item.exportLogs) ? item.exportLogs : [];
                    const firstLog = logs[0];
                    const grossIssued = getFrameReceiptTotal(item);
                    const returned = getReturnedFrameTotal(item);
                    const totalRec = Math.max(0, grossIssued - returned);
                    const target = Number(item.quantity) || 0;
                    const remain = Math.max(0, target - totalRec);
                    const isCompleted = totalRec >= target;

                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: '#7c3aed' }}>{item.productCode}</td>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: '#1e293b' }}>{item.craftGroupLeader}</td>
                        <td style={{ padding: '10px', fontSize: '12px' }}>
                          {firstLog ? `${formatDateVN(firstLog.exportDate)} (${firstLog.actualQty} ${String(item.unit || 'Bộ').toLowerCase()})` : '—'}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#b45309' }}>{target.toLocaleString()}</td>
                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#64748b' }}>{grossIssued.toLocaleString()}</td>
                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#059669' }}>{totalRec.toLocaleString()}</td>
                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: remain > 0 ? '#dc2626' : '#059669' }}>
                          {remain.toLocaleString()}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#0369a1' }}>{returned.toLocaleString()}</td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', backgroundColor: isCompleted ? '#dcfce7' : '#fef3c7', color: isCompleted ? '#15803d' : '#b45309' }}>
                            {isCompleted ? '✅ Đã Đủ Khung' : `⚠️ Còn thiếu ${remain}`}
                          </span>
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <button type="button" onClick={() => openFrameExportModal(item)} style={{ padding: '4px 8px', backgroundColor: '#e0f2fe', color: '#0369a1', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>✏️ Xuất thêm khung</button>
                        </td>
                      </tr>
                    );
                  })
                )}

              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'DEPOSIT_TRACKING' && (
        <section style={{ padding: '20px', borderRadius: '8px', border: '1px solid #a7f3d0', backgroundColor: '#f0fdf4' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ margin: '0 0 6px', color: '#047857', fontSize: '18px', fontWeight: '800' }}>
              Bảng Theo Dõi Nhận &amp; Chi Cọc
            </h3>
            <p style={{ margin: 0, color: '#475569', fontSize: '13px' }}>
              Tiền thu lấy từ cọc HĐ Cty; tiền chi gồm cọc ban đầu và các đợt cọc bổ sung cho Tổ Đan.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: '700', color: '#334155' }}>
              Lọc theo Mã Hàng
              <input
                type="search"
                value={depositTrackingProductFilter}
                onChange={e => setDepositTrackingProductFilter(e.target.value)}
                placeholder="Nhập mã hàng..."
                style={{ padding: '9px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#fff' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: '700', color: '#334155' }}>
              Lọc theo Số HĐ Đan
              <input
                type="search"
                value={depositTrackingSubContractFilter}
                onChange={e => setDepositTrackingSubContractFilter(e.target.value)}
                placeholder="Nhập số HĐ Đan..."
                style={{ padding: '9px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#fff' }}
              />
            </label>
          </div>

          <div style={{ overflowX: 'auto', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
            <table style={{ width: '100%', minWidth: '820px', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead style={{ backgroundColor: '#ecfdf5', color: '#065f46' }}>
                <tr>
                  <th style={{ padding: '11px' }}>Số HĐ Cty</th>
                  <th style={{ padding: '11px' }}>Số HĐ Đan &amp; Mã Hàng</th>
                  <th style={{ padding: '11px', textAlign: 'right' }}>Số Tiền Thu (Nhận từ Cty)</th>
                  <th style={{ padding: '11px', textAlign: 'right' }}>Số Tiền Chi (Tổ Đan)</th>
                  <th style={{ padding: '11px' }}>Ghi Chú</th>
                </tr>
              </thead>
              <tbody>
                {depositTrackingRows.map(({ parent, subContract, parentKey }, index) => {
                  const companyDeposit = parent
                    && depositTrackingRows.findIndex(row => row.parentKey === parentKey) === index
                    ? Number(parent.requiredDeposit) || 0
                    : 0;
                  const depositLogs: DepositLog[] = Array.isArray(subContract?.depositLogs) ? subContract.depositLogs : [];
                  const initialDeposit = subContract?.initialRequiredDeposit !== undefined
                    ? Number(subContract.initialRequiredDeposit) || 0
                    : Math.max(0, (Number(subContract?.requiredDeposit) || 0) - depositLogs.reduce(
                      (sum, log) => sum + (Number(log.amount) || 0),
                      0
                    ));
                  const loggedExpense = initialDeposit + depositLogs.reduce(
                    (sum, log) => sum + (Number(log.amount) || 0),
                    0
                  );
                  const subContractExpense = subContract
                    ? Math.max(Number(subContract.requiredDeposit) || 0, loggedExpense)
                    : 0;
                  const noteText = [parent?.note, subContract?.note].filter(Boolean).join(' · ');

                  return (
                    <tr key={`${parentKey}-${subContract?.id || 'company'}-${index}`} style={{ borderTop: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px', fontWeight: '700', color: '#2563eb' }}>
                        {parent?.contractNo || subContract?.parentContractNo || '—'}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <div style={{ fontWeight: '700', color: '#7c3aed' }}>{subContract?.contractNo || '—'}</div>
                        <div style={{ color: '#475569' }}>{subContract?.productCode || parent?.productCode || '—'}</div>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: '700', color: '#047857', whiteSpace: 'nowrap' }}>
                        {formatCurrency(companyDeposit)} VNĐ
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: '700', color: '#b91c1c', whiteSpace: 'nowrap' }}>
                        {formatCurrency(subContractExpense)} VNĐ
                      </td>
                      <td style={{ padding: '10px', color: '#475569' }}>{noteText || '—'}</td>
                    </tr>
                  );
                })}
                {depositTrackingRows.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                      Không có hợp đồng phù hợp với điều kiện lọc.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot style={{ backgroundColor: '#f8fafc', fontWeight: '800' }}>
                <tr>
                  <td colSpan={2} style={{ padding: '12px', textAlign: 'right' }}>TỔNG CỘNG</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#047857', whiteSpace: 'nowrap' }}>
                    {formatCurrency(depositTrackingTotals.income)} VNĐ
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#b91c1c', whiteSpace: 'nowrap' }}>
                    {formatCurrency(depositTrackingTotals.expense)} VNĐ
                  </td>
                  <td style={{ padding: '12px', color: depositTrackingTotals.income - depositTrackingTotals.expense < 0 ? '#b91c1c' : '#047857', whiteSpace: 'nowrap' }}>
                    Còn Lại: {formatCurrency(depositTrackingTotals.income - depositTrackingTotals.expense)} VNĐ
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'FRAME_MGMT' && frameExportContract && (
        <div
          onClick={() => setFrameExportContract(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'rgba(15, 23, 42, 0.65)' }}
        >
          <section
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '900px', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', padding: '24px', borderRadius: '10px', backgroundColor: '#fff', boxShadow: '0 20px 50px rgba(15, 23, 42, 0.3)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#0369a1' }}>📦 Xuất thêm khung theo đợt</h3>
              <button type="button" onClick={() => setFrameExportContract(null)} style={{ padding: '6px 12px', border: 'none', borderRadius: '5px', backgroundColor: '#e2e8f0', cursor: 'pointer', fontWeight: 'bold' }}>Đóng</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', padding: '14px', marginBottom: '18px', borderRadius: '8px', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd' }}>
              <div><strong>Tên Tổ Đan:</strong> {frameExportContract.craftGroupLeader || '—'}</div>
              <div><strong>Mã Hàng:</strong> {frameExportContract.productCode || '—'}</div>
              <div><strong>Tên Hàng:</strong> {String(frameExportContract.productName || '').replace(` (${frameExportContract.summaryText || ''})`, '') || '—'}</div>
              <div><strong>Số HĐ Cty truy vết:</strong> {frameExportContract.parentContractNo || '—'}</div>
            </div>

            <section style={{ marginBottom: '18px' }}>
              <h4 style={{ margin: '0 0 10px', color: '#334155' }}>💰 Quản lý tiền cọc</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px', alignItems: 'end' }}>
                <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: '#fff7ed', border: '1px solid #fed7aa' }}>
                  <div style={{ fontSize: '12px', color: '#9a3412' }}>Đã cọc lần 1</div>
                  <strong style={{ color: '#c2410c' }}>{formatCurrency(frameModalInitialDeposit)} VNĐ</strong>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold' }}>Tiền cọc đợt này (lần {frameModalDepositLogs.length + 2}):</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9.,]*"
                    value={frameDepositAmount ? formatCurrency(frameDepositAmount) : ''}
                    onChange={e => setFrameDepositAmount(e.target.value.replace(/\D/g, ''))}
                    placeholder="Nhập tiền cọc..."
                    style={{ width: '100%', padding: '9px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold' }}>Phương thức:</label>
                  <select value={frameDepositMethod} onChange={e => setFrameDepositMethod(e.target.value as 'TIEN_MAT' | 'CHUYEN_KHOAN')} style={{ width: '100%', padding: '9px', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#fff' }}>
                    <option value="CHUYEN_KHOAN">Chuyển khoản</option>
                    <option value="TIEN_MAT">Tiền mặt</option>
                  </select>
                </div>
              </div>
              <div style={{ marginTop: '10px', fontSize: '12px', color: '#475569' }}>
                Tổng tiền cọc: <strong>{formatCurrency(frameModalInitialDeposit + frameModalLaterDeposits + (Number(frameDepositAmount) || 0))} VNĐ</strong>
                {frameModalDepositLogs.map((log, index) => (
                  <div key={log.id}>Lần cọc {index + 2}: {formatCurrency(log.amount)} VNĐ ({formatDateVN(log.depositDate)})</div>
                ))}
              </div>
            </section>

            <section style={{ marginBottom: '18px' }}>
              <h4 style={{ margin: '0 0 10px', color: '#334155' }}>📋 Lịch sử xuất khung</h4>
              <div style={{ maxHeight: '150px', overflowY: 'auto', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#f8fafc' }}>
                {frameModalExportLogs.length > 0 ? frameModalExportLogs.map((log, index) => (
                  <div key={log.id} style={{ padding: '4px 0' }}>
                    Lần {index + 1}: đã nhận <strong>{formatCurrency(log.actualQty)} {String(frameExportContract.unit || 'Bộ').toLowerCase()}</strong>
                    {log.exportDate ? ` — ${formatDateVN(log.exportDate)}` : ''}
                    {log.note ? ` (${log.note})` : ''}
                  </div>
                )) : frameModalReceived > 0 ? (
                  <div>Đã ghi nhận trước đây: <strong>{formatCurrency(frameModalReceived)} {String(frameExportContract.unit || 'Bộ').toLowerCase()}</strong></div>
                ) : (
                  <div style={{ color: '#64748b', fontStyle: 'italic' }}>Chưa có lần xuất khung nào.</div>
                )}
                <strong>Tổng số lần đã nhận: {frameModalExportLogs.length || (frameModalReceived > 0 ? 1 : 0)}; tổng đã xuất: {formatCurrency(frameModalReceived)} {String(frameExportContract.unit || 'Bộ').toLowerCase()}</strong>
              </div>
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px', alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold' }}>Tổng số lượng hợp đồng:</label>
                <input type="number" inputMode="numeric" pattern="[0-9]*" min={Math.max(frameModalContractQty, frameModalReceived)} value={frameContractQty} onChange={e => setFrameContractQty(e.target.value)} style={{ width: '100%', padding: '9px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} />
                <small style={{ color: '#64748b' }}>Không thể giảm dưới số lượng hợp đồng hoặc số đã nhận được ghi nhận ({formatCurrency(Math.max(frameModalContractQty, frameModalReceived))}).</small>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold' }}>Ngày xuất đợt này:</label>
                <input type="date" value={frameExportDate} onChange={e => setFrameExportDate(e.target.value)} style={{ width: '100%', padding: '9px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold' }}>Số lượng khung đợt này:</label>
                <input type="number" inputMode="numeric" pattern="[0-9]*" min="0" max={frameModalRemaining} value={frameExportQty} onChange={e => setFrameExportQty(e.target.value)} placeholder="Nhập số lượng xuất..." style={{ width: '100%', padding: '9px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ marginTop: '10px', padding: '10px', borderRadius: '6px', backgroundColor: '#f0fdf4', color: '#166534', fontWeight: 'bold' }}>
              Đợt nhận thứ {frameModalExportLogs.length + 1} · Tổng đã xuất sau đợt này: {formatCurrency(frameModalReceived + (Number(frameExportQty) || 0))} · Còn thiếu: {formatCurrency(Math.max(0, frameModalRemaining - (Number(frameExportQty) || 0)))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button type="button" onClick={() => setFrameExportContract(null)} style={{ padding: '9px 14px', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer' }}>Hủy</button>
              <button type="button" onClick={saveFrameExportBatch} style={{ padding: '9px 14px', border: 'none', borderRadius: '6px', backgroundColor: '#0284c7', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>💾 Lưu đợt</button>
            </div>
          </section>
        </div>
      )}

      {/* DANH SÁCH BẢNG HỢP ĐỒNG BÊN DƯỚI */}
      <div style={{ marginTop: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {!isWarehouseUser && <button type="button" onClick={() => setListTab('PARENT_LIST')} style={{ padding: '8px 16px', fontWeight: 'bold', borderRadius: '6px 6px 0 0', border: '1px solid #cbd5e1', borderBottom: listTab === 'PARENT_LIST' ? '3px solid #2563eb' : '1px solid #cbd5e1', backgroundColor: listTab === 'PARENT_LIST' ? '#dbeafe' : '#f8fafc', color: listTab === 'PARENT_LIST' ? '#1e40af' : '#64748b', cursor: 'pointer' }}>
              🏢 HĐ CTY ({filteredParentContracts.length})
            </button>}
            <button type="button" onClick={() => setListTab('SUB_LIST')} style={{ padding: '8px 16px', fontWeight: 'bold', borderRadius: '6px 6px 0 0', border: '1px solid #cbd5e1', borderBottom: listTab === 'SUB_LIST' ? '3px solid #7c3aed' : '1px solid #cbd5e1', backgroundColor: listTab === 'SUB_LIST' ? '#f3e8ff' : '#f8fafc', color: listTab === 'SUB_LIST' ? '#6b21a8' : '#64748b', cursor: 'pointer' }}>
              🧺 HĐ TỔ ĐAN ({filteredSubContracts.length})
            </button>
          </div>
          <input type="text" placeholder="Tìm theo Mã hàng / HĐ..." value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', width: '240px' }} />
        </div>

        {listTab === 'PARENT_LIST' && !isWarehouseUser && (
          <div style={{ overflowX: 'auto' }}>
  <table style={{ width: '100%', minWidth: '1500px', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#eff6ff', borderBottom: '2px solid #93c5fd' }}>
                  <th style={{ padding: '10px' }}>Mã Hàng</th>
                  <th style={{ padding: '10px' }}>Số HĐ CTY</th>
                  <th style={{ padding: '10px' }}>Công Ty</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>SL Hợp Đồng</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Đã Nhận / Đã Giao</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Tiền Cọc Đã Nhận</th>
                  <th style={{ padding: '10px' }}>Ngày Nhận Cọc</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Thành Tiền</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Còn Lại Thanh Toán</th>
                  <th style={{ padding: '10px' }}>Hạn Giao Hàng</th>
                  <th style={{ padding: '10px', textAlign: 'center' }}>Trạng Thái</th>
                  <th style={{ padding: '10px', textAlign: 'center' }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredParentContracts.map((item: any) => {
                  const tAmt = Number(item.totalAmount) || (Number(item.quantity) * Number(item.unitPrice)) || 0;
                  const depAmt = Number(item.requiredDeposit) || 0;
                  const remAmt = Math.max(0, tAmt - depAmt);
                  const targetQty = Number(item.quantity) || 0;
                  const receivedQty = getParentReceivedTotal(item);
                  const isQuantityComplete = targetQty > 0 && receivedQty >= targetQty;
                  const isPaymentComplete = remAmt <= 0;
                  const isContractComplete = isQuantityComplete && isPaymentComplete;
                  const dueDate = String(item.dueDate || '').slice(0, 10);
                  const dueMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
                  const dueLabel = dueMatch ? `${dueMatch[3]}/${dueMatch[2]}/${dueMatch[1]}` : '—';
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const parsedDueDate = dueMatch
                    ? new Date(Number(dueMatch[1]), Number(dueMatch[2]) - 1, Number(dueMatch[3]))
                    : null;
                  const daysUntilDue = parsedDueDate
                    ? Math.ceil((parsedDueDate.getTime() - today.getTime()) / 86400000)
                    : null;
                  const isOverdue = !isQuantityComplete && daysUntilDue !== null && daysUntilDue < 0;
                  const isNearDue = !isQuantityComplete && daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 3;

                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#7c3aed' }}>{item.productCode}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#1e40af' }}>{item.contractNo}</td>
                      <td style={{ padding: '10px', fontWeight: '600' }}>{item.companyName}</td>
                      <td style={{ padding: '10px', textAlign: 'right', whiteSpace: 'nowrap' }}>{targetQty.toLocaleString()} {getUnitFromProductCode(String(item.productCode || '')) || item.unit || 'Bộ'}</td>
                      <td style={{ padding: '10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <strong style={{ color: isQuantityComplete ? '#15803d' : '#c2410c' }}>
                          {receivedQty.toLocaleString()} / {targetQty.toLocaleString()}
                        </strong>
                        <div style={{ color: '#64748b', fontSize: '11px', marginTop: '3px' }}>
                          {targetQty > 0 ? `${Math.min(100, Math.round(receivedQty / targetQty * 100))}%` : '—'}
                        </div>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, color: depAmt > 0 ? '#15803d' : '#64748b' }}>
                        {depAmt > 0 ? `${formatCurrency(depAmt)} đ` : '—'}
                      </td>
                      <td style={{ padding: '10px', whiteSpace: 'nowrap', fontWeight: 600, color: '#047857' }}>
                        {getParentDepositDate(item) || '—'}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#15803d' }}>
                        {tAmt > 0 ? `${formatCurrency(tAmt)} VNĐ` : '—'}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800, color: remAmt > 0 ? '#b91c1c' : '#15803d' }}>
                        {formatCurrency(remAmt)} đ
                      </td>
                      <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          color: isOverdue ? '#b91c1c' : isNearDue ? '#c2410c' : '#334155',
                          fontWeight: isOverdue || isNearDue ? 800 : 600
                        }}>
                          {dueLabel}
                        </span>
                        {(isOverdue || isNearDue) && (
                          <div style={{ marginTop: '3px', color: isOverdue ? '#b91c1c' : '#c2410c', fontSize: '11px', fontWeight: 700 }}>
                            {isOverdue ? `Trễ ${Math.abs(daysUntilDue || 0)} ngày` : daysUntilDue === 0 ? 'Đến hạn hôm nay' : `Còn ${daysUntilDue} ngày`}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '5px 8px',
                          borderRadius: '999px',
                          backgroundColor: isContractComplete ? '#dcfce7' : '#ffedd5',
                          color: isContractComplete ? '#15803d' : '#c2410c',
                          fontSize: '11px',
                          fontWeight: 800,
                          whiteSpace: 'nowrap'
                        }}>
                          {isContractComplete ? 'Đã thanh toán đủ / Hoàn thành' : 'Chưa thanh toán đủ'}
                        </span>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <div className="slip-action-buttons">
                          <button
                            type="button"
                            className="slip-action-button slip-action-zalo"
                            onClick={() => {
                              const phone = String(item.zalo || item.phone || '').replace(/\D/g, '');
                              if (!phone) {
                                alert('Hợp đồng chưa có số điện thoại/Zalo của công ty.');
                                return;
                              }
                              window.open(`https://zalo.me/${phone}`, '_blank', 'noopener,noreferrer');
                            }}
                          >
                            📲 Gửi Zalo
                          </button>
                          <button type="button" className="slip-action-button slip-action-edit" onClick={() => handleEdit(item)}>✏️ Sửa</button>
                          {hasPermission('delete_contracts') && <button type="button" className="slip-action-button slip-action-delete" onClick={() => handleDelete(item)}>🗑️ Xóa</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {listTab === 'SUB_LIST' && (
          <div style={{ overflowX: 'auto' }}>
  <table style={{ width: '100%', minWidth: isWarehouseUser ? '750px' : '1050px', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#faf5ff', borderBottom: '2px solid #d8b4fe' }}>
                  <th style={{ padding: '10px' }}>Mã Hàng</th>
                  <th style={{ padding: '10px' }}>Truy Vết HĐ Cty</th>
                  <th style={{ padding: '10px' }}>Tổ Đan</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>SL Hợp Đồng</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Đang Ở Tổ</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Đang Ở Tổ / Tổng Khung Phát</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Còn Lại</th>
                  {!isWarehouseUser && <>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Tiền Cọc Đã Nhận</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Còn Lại Thanh Toán</th>
                    <th style={{ padding: '10px', textAlign: 'center' }}>Trạng Thái Thanh Toán</th>
                  </>}
                  <th style={{ padding: '10px' }}>Hạn Đan</th>
                  {!isWarehouseUser && <th style={{ padding: '10px' }}>Nguyên Phụ Liệu Kèm Theo</th>}
                  {!isWarehouseUser && <th style={{ padding: '10px', textAlign: 'center' }}>Thao Tác</th>}
                </tr>
              </thead>
              <tbody>
                {filteredSubContracts.map((item: any) => {
                  const grossIssued = getFrameReceiptTotal(item);
                  const returnedFrames = getReturnedFrameTotal(item);
                  const itemRec = Math.max(0, grossIssued - returnedFrames);
                  const itemTarget = Number(item.quantity) || 0;
                  const itemRemain = Math.max(0, itemTarget - itemRec);
                  const issueComplete = itemTarget > 0 && itemRec >= itemTarget;
                  const depositLogs = Array.isArray(item.depositLogs) ? item.depositLogs : [];
                  const laterDeposits = depositLogs.reduce(
                    (sum: number, log: DepositLog) => sum + (Number(log.amount) || 0),
                    0
                  );
                  const depositReceived = item.initialRequiredDeposit !== undefined
                    ? (Number(item.initialRequiredDeposit) || 0) + laterDeposits
                    : Math.max(Number(item.requiredDeposit) || 0, laterDeposits);
                  const completionRatio = itemTarget > 0
                    ? Math.min(1, itemRec / itemTarget)
                    : 0;
                  const contractTotal = Number(item.totalAmount) > 0
                    ? Number(item.totalAmount)
                    : itemTarget * (Number(item.unitPrice) || 0);
                  const issuedMaterialTotal = (Array.isArray(item.accompanyingMaterials)
                    ? item.accompanyingMaterials
                    : []).reduce((sum: number, material: AccompanyingMaterial) => {
                    const quantity = Number(material.quantity) || 0;
                    const unitPrice = Number(material.unitPrice) || 0;
                    const amount = Number(material.amount) > 0
                      ? Number(material.amount)
                      : quantity * unitPrice;
                    return sum + amount;
                  }, 0);
                  const remainingPayment = Math.max(
                    0,
                    contractTotal * completionRatio -
                      depositReceived -
                      issuedMaterialTotal * completionRatio
                  );
                  const paymentComplete = issueComplete && remainingPayment <= 0;
                  const dueDate = String(item.dueDate || '').slice(0, 10);
                  const dueMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
                  const dueLabel = dueMatch ? `${dueMatch[3]}/${dueMatch[2]}/${dueMatch[1]}` : '—';
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const parsedDueDate = dueMatch
                    ? new Date(Number(dueMatch[1]), Number(dueMatch[2]) - 1, Number(dueMatch[3]))
                    : null;
                  const daysUntilDue = parsedDueDate
                    ? Math.ceil((parsedDueDate.getTime() - today.getTime()) / 86400000)
                    : null;
                  const isKnittingComplete = issueComplete;
                  const deadlineWarning = !isKnittingComplete && daysUntilDue !== null && daysUntilDue <= 3;
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#7c3aed' }}>{item.productCode}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#1e40af' }}>{item.parentContractNo || '—'}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold' }}>{item.craftGroupLeader}</td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#b45309' }}>{itemTarget.toLocaleString()}</td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#059669' }}>{itemRec.toLocaleString()}</td>
                      <td style={{ padding: '10px', textAlign: 'right' }}>
                        <strong style={{ color: issueComplete ? '#15803d' : '#c2410c' }}>
                          {itemRec.toLocaleString()} / {grossIssued.toLocaleString()}
                        </strong>
                        <div style={{ marginTop: '3px', fontSize: '11px', color: '#64748b' }}>
                          Đã thu hồi: {returnedFrames.toLocaleString()}
                        </div>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#2563eb' }}>{itemRemain.toLocaleString()}</td>
                      {!isWarehouseUser && <>
                      <td style={{ padding: '10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, color: depositReceived > 0 ? '#15803d' : '#64748b' }}>
                        {depositReceived > 0 ? `${formatCurrency(depositReceived)} đ` : '—'}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800, color: remainingPayment > 0 ? '#b91c1c' : '#15803d' }}>
                        {formatCurrency(remainingPayment)} đ
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '5px 8px',
                          borderRadius: '999px',
                          backgroundColor: paymentComplete ? '#dcfce7' : '#ffedd5',
                          color: paymentComplete ? '#15803d' : '#c2410c',
                          fontSize: '11px',
                          fontWeight: 800
                        }}>
                          {paymentComplete ? 'Đã Thanh Toán Đủ' : 'Chưa Thanh Toán Đủ'}
                        </span>
                      </td>
                      </>}
                      <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          color: deadlineWarning ? (daysUntilDue !== null && daysUntilDue < 0 ? '#b91c1c' : '#c2410c') : '#334155',
                          fontWeight: deadlineWarning ? 800 : 600
                        }}>
                          {dueLabel}
                        </span>
                        {deadlineWarning && (
                          <div style={{
                            marginTop: '3px',
                            color: daysUntilDue !== null && daysUntilDue < 0 ? '#b91c1c' : '#c2410c',
                            fontSize: '11px',
                            fontWeight: 700
                          }}>
                            {daysUntilDue !== null && daysUntilDue < 0
                              ? `Trễ ${Math.abs(daysUntilDue)} ngày`
                              : daysUntilDue === 0 ? 'Đến hạn hôm nay' : `Còn ${daysUntilDue} ngày`}
                          </div>
                        )}
                      </td>
                      {!isWarehouseUser && <td style={{ padding: '10px', minWidth: '180px' }}>
                        {Array.isArray(item.accompanyingMaterials) && item.accompanyingMaterials.length > 0
                          ? item.accompanyingMaterials.map((material: AccompanyingMaterial, index: number) => (
                            <div key={`${material.materialId}-${index}`} style={{ whiteSpace: 'nowrap' }}>
                              {material.materialName || material.materialCode}: {Number(material.quantity).toLocaleString()} {material.unit}
                              {' · '}{(Number(material.unitPrice) || 0).toLocaleString('vi-VN')} đ/{material.unit}
                              {' = '}<strong>{(Number(material.amount) || Number(material.quantity) * (Number(material.unitPrice) || 0)).toLocaleString('vi-VN')} đ</strong>
                            </div>
                          ))
                          : <span style={{ color: '#94a3b8' }}>—</span>}
                      </td>}
                      {!isWarehouseUser && <td style={{ padding: '10px', textAlign: 'center' }}>
                        <div className="slip-action-buttons">
                          <button type="button" className="slip-action-button slip-action-zalo" onClick={() => handleOpenSubContractSlip(item)}>📲 Gửi Zalo</button>
                          <button type="button" className="slip-action-button slip-action-edit" onClick={() => handleEdit(item)}>✏️ Sửa</button>
                          {hasPermission('delete_contracts') && <button type="button" className="slip-action-button slip-action-delete" onClick={() => handleDelete(item)}>🗑️ Xóa</button>}
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab('FRAME_MGMT');
                              openFrameExportModal(item);
                            }}
                            disabled={itemTarget > 0 && itemRec >= itemTarget}
                            title={itemTarget > 0 && itemRec >= itemTarget ? 'Số khung đang ở tổ đã đủ theo hợp đồng.' : 'Mở nhanh form xuất khung tiếp theo.'}
                            style={{
                              padding: '6px 9px',
                              border: 0,
                              borderRadius: '5px',
                              backgroundColor: itemTarget > 0 && itemRec >= itemTarget ? '#e2e8f0' : '#0284c7',
                              color: itemTarget > 0 && itemRec >= itemTarget ? '#94a3b8' : '#fff',
                              fontWeight: 700,
                              cursor: itemTarget > 0 && itemRec >= itemTarget ? 'not-allowed' : 'pointer',
                              opacity: itemTarget > 0 && itemRec >= itemTarget ? 0.7 : 1
                            }}
                          >
                            📦 Xuất Khung Tiếp Theo
                          </button>
                        </div>
                      </td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};