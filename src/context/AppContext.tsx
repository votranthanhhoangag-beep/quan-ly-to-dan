import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { fetchSheetData, saveSheetData } from '../services/googleService';
import { useAuth, type Permission } from './AuthContext';
import { logAction } from '../services/auditLog';

// === ĐỊNH NGHĨA & EXPORT ĐẦY ĐỦ CÁC INTERFACE ===
export interface CategoryItem {
  id: number;
  code: string;
  name: string;
  note: string;
  unit?: string;
  lowStockLimit?: number;
}

export interface VehicleCategoryItem {
  id: number;
  vehicleName: string;
  modelYear: string;
  plateNo: string;
  insuranceExpiry: string;
  registrationExpiry: string;
  currentKm: number;
  lastOilChangeKm: number;
  maintenanceIntervalKm?: number;
  maintenanceHistory?: Array<{
    id: number;
    date: string;
    odometerKm: number;
  }>;
}

export interface SlipItem {
  id: number | string;
  type: 'NHAP' | 'XUAT' | 'NK' | 'NK_KHUNG' | string;
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
  unit?: string;
  partner?: string;
  partnerName?: string;
  note: string;
  imageProof?: string;
  image?: string;
  sizeQuantities?: { [key: string]: number | string };
  repairLines?: Array<{
    id: string;
    productCode: string;
    productName: string;
    sourceDefectiveGoodsImportSlipId?: number | string;
    quantity: number;
    bundleQuantity: number;
    sizeQuantities: Record<string, number>;
    unitPrice: number;
    bundleUnitPrice?: number;
    sizeUnitPrices?: Record<string, number>;
    amount: number;
  }>;
  repairAdvance?: number;
  repairTotal?: number;
  repairWorkerName?: string;
  repairWorkerZalo?: string;
  sourceRepairSlipId?: number | string;
  repairAdvanceApplied?: number;
  repairMaterialDeducted?: number;
  repairRemainingAmount?: number;
  repairDueDate?: string;
  repairPaymentNote?: string;
  accompanyingMaterials?: Array<{
    materialId: number;
    materialCode: string;
    materialName: string;
    quantity: number;
    unitPrice?: number;
    amount?: number;
    unit: string;
  }>;
  companyReturnLines?: Array<{
    id: string;
    productCode: string;
    productName: string;
    itemTypeOption?: 'CAI' | 'CA_HAI';
    bundleQuantity?: number;
    sizeQuantities?: Record<string, number>;
    quantity: number;
    sourceContractId: number | string;
    sourceContractNo: string;
    artisanName: string;
    artisanPhone: string;
    allocations: Array<{
      contractId: number | string;
      contractNo: string;
      companyName: string;
      quantity: number;
    }>;
  }>;
}

export interface ExpenseItem {
  id: number | string;
  expenseCode?: string;
  category?: string;
  expenseName?: string;
  amount: number;
  date: string;
  handler?: string;
  note: string;
  imageProof?: string;
  imageUrl?: string;
  supplierName?: string;
  supplierAddress?: string;
  supplierTaxCode?: string;
  supplierZalo?: string;
  vatRatePercent?: number;
  vatAmount?: number;
  paymentMethod?: 'Tiền mặt' | 'Chuyển khoản';
  paidAmount?: number;
  nextPaymentDate?: string;
  items?: Array<{
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    unit?: string;
    sourceCode?: string;
    sourceType?: 'Sản phẩm' | 'Nguyên liệu' | 'Khoản chi';
    sourceNote?: string;
  }>;
}

export interface ExpenseAllocation {
  id: string;
  sourceId: string;
  sourceLabel: string;
  date: string;
  totalAmount: number;
  allocations: Array<{
    contractId: number | string;
    amount: number;
  }>;
}

export interface MileageLog {
  id: number;
  plateNo: string;
  vehicleName?: string;
  date?: string;
  monthYear: string;
  trackingMethod: 'Công tơ mét (Ảnh)' | 'Định vị GPS / Google Maps';
  startKm: number;
  endKm: number;
  totalKmRun: number;
  images: string[];
  note: string;
}

export interface DepositSlip {
  id: number | string;
  depositSlipNo: string;
  contractNo: string;
  date: string;
  paymentMethod: 'Tiền mặt' | 'Chuyển khoản';
  amount: number;
  handler: string;
  note: string;
}

export interface ReceivedGoodsLog {
  id: string;
  receivedDate: string;
  quantity: number;
  itemTypeOption?: 'BO' | 'CAI' | 'CA_HAI';
  amount: number;
  deductedDeposit: number;
  deductedMaterialAmount?: number;
  paymentAmount: number;
  paidAmount?: number;
  debtDueDate?: string;
  sizeQuantities?: Record<string, number>;
  note?: string;
}

export interface ContractItem {
  id: number | string;
  stt: number;
  contractType?: 'PARENT' | 'SUB';
  parentContractNo?: string;
  company?: string;
  companyName?: string;
  partner?: string;
  craftGroupLeader?: string;
  contractNo: string;
  productCode: string;
  productName: string;
  unit: string;
  quantity: number;
  totalQty?: number;
  unitType?: 'Bộ' | 'Cái' | 'Cả Bộ lẫn Cái';
  unitPrice: number;
  totalAmount: number;
  requiredDeposit: number;
  depositDate?: string;
  depositReceivedAt?: string;
  dueDate?: string;
  vatRatePercent?: number;
  totalActualExported?: number;
  initialRequiredDeposit?: number;
  depositLogs?: Array<{
    id: string;
    depositDate: string;
    amount: number;
    method: 'TIEN_MAT' | 'CHUYEN_KHOAN';
  }>;
  receivedGoodsLogs?: ReceivedGoodsLog[];
  itemTypeOption?: 'BO' | 'CAI' | 'CA_HAI';
  boQuantity?: number | string;
  sizeQuantities?: Record<string, number | string>;
  sizePrices?: Record<string, number | string>;
  phone?: string;
  zalo?: string;
  houseNumber?: string;
  ward?: string;
  province?: string;
  fullAddress?: string;
  summaryText?: string;
  isLiquidated?: boolean;
  exportLogs?: Array<{
    id?: number | string;
    actualQty: number;
    exportDate?: string;
    note?: string;
  }>;
  accompanyingMaterials?: Array<{
    materialId: number;
    materialCode: string;
    materialName: string;
    quantity: number;
    unitPrice?: number;
    amount?: number;
    unit: string;
  }>;
  accompanyingMaterialsIssuedDate?: string;
  contractImage?: string;
  note?: string;
}

export interface SystemConfiguration {
  companyName: string;
  address: string;
  phone: string;
  taxCode: string;
  email: string;
  logo: string;
}

const normalizeSystemConfiguration = (value: unknown): SystemConfiguration | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const stringValue = (key: keyof SystemConfiguration) =>
    typeof record[key] === 'string' ? String(record[key]) : '';

  return {
    companyName: stringValue('companyName'),
    address: stringValue('address'),
    phone: stringValue('phone'),
    taxCode: stringValue('taxCode'),
    email: stringValue('email'),
    logo: stringValue('logo')
  };
};

const normalizeRecordArray = <T,>(value: unknown): T[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is T =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
  );
};

const RECEIVED_GOODS_STORAGE_KEY = 'erp_nhan_hang_dan_data';
const KNITTING_EXPORT_STORAGE_KEY = 'erp_xuat_hang_dan_data';
const EXPENSE_STORAGE_KEY = 'erp_expenses_data';

interface ReceivedGoodsHistoryRecord {
  contractId: number | string;
  logs: ReceivedGoodsLog[];
}

const readLocalStorageArray = <T,>(key: string): T[] | null => {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === null) return null;
    return normalizeRecordArray<T>(JSON.parse(stored));
  } catch (error) {
    console.error(`Không thể đọc dữ liệu localStorage (${key}):`, error);
    return null;
  }
};

const fetchExpensesWithLocalFallback = async () => {
  try {
    return await fetchSheetData('expenses');
  } catch (error) {
    const localExpenses = readLocalStorageArray<ExpenseItem>(EXPENSE_STORAGE_KEY);
    if (localExpenses === null) throw error;
    console.warn('Không thể tải Phiếu Chi từ máy chủ; đang khôi phục bản lưu trên thiết bị.', error);
    window.dispatchEvent(new CustomEvent('erp:sync-status', {
      detail: {
        status: 'offline',
        message: 'Không truy cập được máy chủ. Phiếu Chi đang được khôi phục từ bản lưu trên thiết bị.'
      }
    }));
    return localExpenses;
  }
};

const mergeExpenseRecords = (remote: ExpenseItem[], local: ExpenseItem[]) => {
  const records = new Map<string, ExpenseItem>();
  remote.forEach(expense => records.set(String(expense.id), expense));
  local.forEach(expense => records.set(String(expense.id), expense));
  return Array.from(records.values());
};

const saveLocalStorageArray = <T,>(key: string, value: T[]) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Không thể lưu dữ liệu localStorage (${key}):`, error);
    window.dispatchEvent(new CustomEvent('erp:sync-status', {
      detail: {
        status: 'error',
        message: 'Không thể lưu dữ liệu tạm trên thiết bị. Hãy sao chép thông tin quan trọng trước khi tải lại trang.'
      }
    }));
  }
};

const restoreReceivedGoodsHistory = (
  contracts: ContractItem[],
  history: ReceivedGoodsHistoryRecord[] | null
) => {
  if (!history) return contracts;
  const logsByContract = new Map(history.map(record => [
    String(record.contractId),
    Array.isArray(record.logs) ? record.logs : []
  ]));
  return contracts.map(contract => {
    const key = String(contract.id);
    return logsByContract.has(key)
      ? { ...contract, receivedGoodsLogs: logsByContract.get(key) }
      : contract;
  });
};

export interface FrameExportItem {
  id: number | string;
  contractNo: string;
  artisanName: string;
  productCode: string;
  exportQty: number;
}

export interface KnittingExportSlip {
  id: number | string;
  slipNo: string;
  date: string;
  sourceContractId: number | string;
  sourceContractNo: string;
  sourceReceiptId: string;
  parentContractNo: string;
  parentCompanyName: string;
  companyBContractId?: number | string;
  companyBContractNo: string;
  productCode: string;
  productName: string;
  unit: 'Bộ' | 'Cái';
  goodBundles: number;
  goodPieces: number;
  goodSizeQuantities?: Record<string, number>;
  defectiveBundles: number;
  defectivePieces: number;
  defectiveSizeQuantities?: Record<string, number>;
  piecesPerSet: number;
  goodContractQuantity: number;
  defectiveContractQuantity: number;
  note: string;
  attachments?: Array<{
    id: string;
    name: string;
    mimeType: string;
    dataUrl: string;
  }>;
}

export interface DefectiveGoodsImportSlip {
  id: number | string;
  slipNo: string;
  date: string;
  sourceContractId: number | string;
  sourceContractNo: string;
  sourceReceiptId: string;
  parentContractNo: string;
  parentCompanyName: string;
  companyBContractId?: number | string;
  companyBContractNo: string;
  productCode: string;
  productName: string;
  unit: 'Bộ' | 'Cái';
  bundleQuantity: number;
  sizeQuantities: Record<string, number>;
  piecesPerSet: number;
  quantity: number;
  physicalQuantity: number;
  note: string;
}

// === INTERFACE CONTEXT NÂNG CẤP DÙNG CHUNG HỆ THỐNG ===
interface AppContextType {
  products: CategoryItem[];
  materials: CategoryItem[];
  expensesCat: CategoryItem[];
  otherExpensesCat: CategoryItem[];
  vehicles: VehicleCategoryItem[];
  slips: SlipItem[];
  inventoryLogs: SlipItem[]; // Alias cho đồng bộ quản lý kho
  expenses: ExpenseItem[];
  expenseAllocations: ExpenseAllocation[];
  mileageLogs: MileageLog[];
  depositSlips: DepositSlip[];
  contracts: ContractItem[];
  frameExports: FrameExportItem[];
  knittingExportSlips: KnittingExportSlip[];
  defectiveGoodsImportSlips: DefectiveGoodsImportSlip[];
  systemConfiguration: SystemConfiguration | null;
  isDataLoaded: boolean;
  dataLoadError: string;
  retryDataLoad: () => void;
  isSystemConfigurationLoaded: boolean;

  addProduct: (item: CategoryItem) => void;
  updateProduct: (item: CategoryItem) => void;
  deleteProduct: (id: number) => void;

  addMaterial: (item: CategoryItem) => void;
  updateMaterial: (item: CategoryItem) => void;
  deleteMaterial: (id: number) => void;

  addExpenseCat: (item: CategoryItem) => void;
  updateExpenseCat: (item: CategoryItem) => void;
  deleteExpenseCat: (id: number) => void;

  addOtherExpenseCat: (item: CategoryItem) => void;
  updateOtherExpenseCat: (item: CategoryItem) => void;
  deleteOtherExpenseCat: (id: number) => void;

  addVehicle: (item: VehicleCategoryItem) => void;
  updateVehicle: (item: VehicleCategoryItem) => void;
  deleteVehicle: (id: number) => void;

  // PHIẾU KHO
  addSlip: (slip: SlipItem) => void;
  updateSlip: (slip: SlipItem) => void;
  deleteSlip: (id: number | string) => void;
  addInventoryLog: (slip: SlipItem) => void;
  updateInventoryLog: (slip: SlipItem) => void;
  deleteInventoryLog: (id: number | string) => void;

  addExpense: (expense: ExpenseItem) => void;
  updateExpense: (expense: ExpenseItem) => void;
  deleteExpense: (id: number | string) => void;
  saveExpenseAllocation: (allocation: ExpenseAllocation) => void;

  addMileageLog: (log: MileageLog) => void;
  updateMileageLog: (log: MileageLog) => void;
  deleteMileageLog: (id: number) => void;
  addDepositSlip: (slip: DepositSlip) => void;

  addContract: (item: ContractItem) => void;
  updateContract: (item: ContractItem) => void;
  deleteContract: (id: number | string) => void;
  addKnittingExportSlip: (slip: KnittingExportSlip) => void;
  updateKnittingExportSlip: (slip: KnittingExportSlip) => void;
  deleteKnittingExportSlip: (id: number | string) => void;
  addDefectiveGoodsImportSlip: (slip: DefectiveGoodsImportSlip) => void;
  updateDefectiveGoodsImportSlip: (slip: DefectiveGoodsImportSlip) => void;
  deleteDefectiveGoodsImportSlip: (id: number | string) => void;
  saveSystemConfiguration: (configuration: SystemConfiguration) => void;
  deleteSystemConfiguration: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const DEFAULT_EXPENSE_CATEGORIES: CategoryItem[] = [
  { id: 1, code: 'EXPCAT-01', name: 'Xăng', note: 'Chi phí xăng xe vận chuyển' },
  { id: 2, code: 'EXPCAT-02', name: 'Dầu', note: 'Chi phí dầu máy, nhiên liệu' },
  { id: 3, code: 'EXPCAT-03', name: 'Nhân công', note: 'Tiền công thợ đan, lao động' },
  { id: 4, code: 'EXPCAT-04', name: 'Băng keo', note: 'Vật tư đóng gói' },
  { id: 5, code: 'EXPCAT-05', name: 'Điện', note: 'Chi phí điện sản xuất & sinh hoạt' },
  { id: 6, code: 'EXPCAT-06', name: 'Nước', note: 'Chi phí nước sử dụng' },
  { id: 7, code: 'EXPCAT-07', name: 'Internet', note: 'Cước dịch vụ Internet' },
  { id: 8, code: 'EXPCAT-08', name: 'Nhà xưởng', note: 'Chi phí mặt bằng, thuê xưởng' },
  { id: 9, code: 'EXPCAT-09', name: 'Mạng di động', note: 'Cước điện thoại liên lạc' },
  { id: 10, code: 'EXPCAT-10', name: 'Kéo', note: 'Dụng cụ, kéo cắt' },
  { id: 11, code: 'EXPCAT-11', name: 'Mua lục bình', note: 'Nguyên liệu lục bình đan' },
  { id: 12, code: 'EXPCAT-12', name: 'Nan cong tre', note: 'Nguyên liệu nan tre cong' },
  { id: 13, code: 'EXPCAT-13', name: 'Khác', note: 'Các khoản chi phí phát sinh khác' },
];

const normalizeCategoryItem = (item: CategoryItem): CategoryItem => ({
  ...item,
  code: String(item.code || '').trim().toLocaleUpperCase('vi'),
  name: String(item.name || '').trim()
});

const sortCategoryItemsAZ = (items: CategoryItem[]) =>
  items
    .map(normalizeCategoryItem)
    .sort((first, second) =>
      first.name.localeCompare(second.name, 'vi', { sensitivity: 'base', numeric: true }) ||
      first.code.localeCompare(second.code, 'vi', { sensitivity: 'base', numeric: true })
    );

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, hasPermission } = useAuth();
  const [products, setProducts] = useState<CategoryItem[]>([]);
  const [materials, setMaterials] = useState<CategoryItem[]>([]);
  const [expensesCat, setExpensesCat] = useState<CategoryItem[]>(DEFAULT_EXPENSE_CATEGORIES);
  const [otherExpensesCat, setOtherExpensesCat] = useState<CategoryItem[]>([]);
  const [vehicles, setVehicles] = useState<VehicleCategoryItem[]>([]);
  const [slips, setSlips] = useState<SlipItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [expenseAllocations, setExpenseAllocations] = useState<ExpenseAllocation[]>([]);
  const [mileageLogs, setMileageLogs] = useState<MileageLog[]>([]);
  const [depositSlips, setDepositSlips] = useState<DepositSlip[]>([]);
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [knittingExportSlips, setKnittingExportSlips] = useState<KnittingExportSlip[]>([]);
  const [defectiveGoodsImportSlips, setDefectiveGoodsImportSlips] = useState<DefectiveGoodsImportSlip[]>([]);
  const [systemConfiguration, setSystemConfiguration] = useState<SystemConfiguration | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [dataLoadError, setDataLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isSystemConfigurationLoaded, setIsSystemConfigurationLoaded] = useState(false);
  const frameExports: FrameExportItem[] = (Array.isArray(contracts) ? contracts : [])
    .filter((contract): contract is ContractItem =>
      contract !== null && typeof contract === 'object'
    )
    .flatMap(contract => (Array.isArray(contract.exportLogs) ? contract.exportLogs : [])
      .filter(log => log !== null && typeof log === 'object')
      .map((log, index) => ({
        id: log.id ?? `${contract.id}-${index}`,
        contractNo: contract.contractNo || '',
        artisanName: contract.craftGroupLeader || '',
        productCode: contract.productCode || '',
        exportQty: Number(log.actualQty) || 0
      }))
    );

  const isLoaded = useRef<boolean>(false);

  useEffect(() => {
    async function initData() {
      setIsDataLoaded(false);
      setDataLoadError('');
      setIsSystemConfigurationLoaded(false);
      isLoaded.current = false;
      try {
        const [p, m, ec, otherEc, v, s, exp, ml, ds, ct, knittingExports, defectiveImports, config, allocations] = await Promise.all([
          fetchSheetData('products'),
          fetchSheetData('materials'),
          fetchSheetData('expensesCat'),
          fetchSheetData('otherExpensesCat'),
          fetchSheetData('vehicles'),
          fetchSheetData('slips'),
          fetchExpensesWithLocalFallback(),
          fetchSheetData('mileageLogs'),
          fetchSheetData('depositSlips'),
          fetchSheetData('contracts'),
          fetchSheetData('knittingExportSlips'),
          fetchSheetData('defectiveGoodsImportSlips'),
          fetchSheetData('systemConfig'),
          fetchSheetData('expenseAllocations')
        ]);

        setProducts(sortCategoryItemsAZ(normalizeRecordArray<CategoryItem>(p)));
        setMaterials(sortCategoryItemsAZ(normalizeRecordArray<CategoryItem>(m)));
        const expenseCategories = normalizeRecordArray<CategoryItem>(ec);
        setExpensesCat(sortCategoryItemsAZ(expenseCategories.length ? expenseCategories : DEFAULT_EXPENSE_CATEGORIES));
        setOtherExpensesCat(sortCategoryItemsAZ(normalizeRecordArray<CategoryItem>(otherEc)));
        setVehicles(normalizeRecordArray<VehicleCategoryItem>(v));
        setSlips(normalizeRecordArray<SlipItem>(s));
        const remoteExpenses = normalizeRecordArray<ExpenseItem>(exp);
        const localExpenses = readLocalStorageArray<ExpenseItem>(EXPENSE_STORAGE_KEY) || [];
        setExpenses(mergeExpenseRecords(remoteExpenses, localExpenses));
        setExpenseAllocations(normalizeRecordArray<ExpenseAllocation>(allocations));
        setMileageLogs(normalizeRecordArray<MileageLog>(ml));
        setDepositSlips(normalizeRecordArray<DepositSlip>(ds));
        const contractRecords = normalizeRecordArray<ContractItem>(ct);
        const receivedGoodsHistory = readLocalStorageArray<ReceivedGoodsHistoryRecord>(RECEIVED_GOODS_STORAGE_KEY);
        setContracts(restoreReceivedGoodsHistory(contractRecords, receivedGoodsHistory));
        setKnittingExportSlips(
          readLocalStorageArray<KnittingExportSlip>(KNITTING_EXPORT_STORAGE_KEY)
            ?? normalizeRecordArray<KnittingExportSlip>(knittingExports)
        );
        setDefectiveGoodsImportSlips(normalizeRecordArray<DefectiveGoodsImportSlip>(defectiveImports));
        const systemConfigurations = normalizeRecordArray<unknown>(config);
        setSystemConfiguration(normalizeSystemConfiguration(systemConfigurations[0]));
      } catch (e) {
        console.error("Lỗi khi tải dữ liệu ban đầu từ Google Sheets:", e);
        setDataLoadError(e instanceof Error ? e.message : 'Không thể tải dữ liệu từ hệ thống.');
        return;
      }

      isLoaded.current = true;
      setIsDataLoaded(true);
      setIsSystemConfigurationLoaded(true);
    }
    initData();
  }, [loadAttempt]);

  const retryDataLoad = () => setLoadAttempt(attempt => attempt + 1);

  useEffect(() => { if (isLoaded.current) saveSheetData('products', products); }, [products]);
  useEffect(() => { if (isLoaded.current) saveSheetData('materials', materials); }, [materials]);
  useEffect(() => { if (isLoaded.current) saveSheetData('expensesCat', expensesCat); }, [expensesCat]);
  useEffect(() => { if (isLoaded.current) saveSheetData('otherExpensesCat', otherExpensesCat); }, [otherExpensesCat]);
  useEffect(() => { if (isLoaded.current) saveSheetData('vehicles', vehicles); }, [vehicles]);
  useEffect(() => { if (isLoaded.current) saveSheetData('slips', slips); }, [slips]);
  useEffect(() => {
    if (!isLoaded.current) return;
    saveLocalStorageArray(EXPENSE_STORAGE_KEY, expenses);
    void saveSheetData('expenses', expenses);
  }, [expenses]);
  useEffect(() => { if (isLoaded.current) saveSheetData('expenseAllocations', expenseAllocations); }, [expenseAllocations]);
  useEffect(() => { if (isLoaded.current) saveSheetData('mileageLogs', mileageLogs); }, [mileageLogs]);
  useEffect(() => { if (isLoaded.current) saveSheetData('depositSlips', depositSlips); }, [depositSlips]);
  useEffect(() => { if (isLoaded.current) saveSheetData('contracts', contracts); }, [contracts]);
  useEffect(() => {
    if (!isLoaded.current) return;
    saveLocalStorageArray(RECEIVED_GOODS_STORAGE_KEY, contracts
      .filter(contract => contract.contractType === 'SUB')
      .map(contract => ({
        contractId: contract.id,
        logs: Array.isArray(contract.receivedGoodsLogs) ? contract.receivedGoodsLogs : []
      })));
  }, [contracts]);
  useEffect(() => {
    if (!isLoaded.current) return;
    saveLocalStorageArray(KNITTING_EXPORT_STORAGE_KEY, knittingExportSlips);
    saveSheetData('knittingExportSlips', knittingExportSlips);
  }, [knittingExportSlips]);
  useEffect(() => {
    if (isLoaded.current) saveSheetData('defectiveGoodsImportSlips', defectiveGoodsImportSlips);
  }, [defectiveGoodsImportSlips]);
  useEffect(() => {
    if (isLoaded.current) {
      saveSheetData('systemConfig', systemConfiguration ? [systemConfiguration] : []);
    }
  }, [systemConfiguration]);

  const sortAZ = <T extends Record<string, any>>(list: T[], key: keyof T): T[] => {
    return [...list].sort((a, b) => String(a[key]).localeCompare(String(b[key]), 'vi', { sensitivity: 'base' }));
  };

  const canWrite = (permission: Permission) => {
    if (hasPermission(permission)) return true;
    const message = 'Tài khoản hiện tại không có quyền thực hiện thao tác này.';
    console.warn(message, { permission, user: user?.username });
    window.dispatchEvent(new CustomEvent('erp:permission-denied', { detail: message }));
    return false;
  };

  const addProduct = (item: CategoryItem) => { if (canWrite('manage_settings')) setProducts(prev => sortCategoryItemsAZ([...prev, item])); };
  const updateProduct = (item: CategoryItem) => { if (canWrite('manage_settings')) setProducts(prev => sortCategoryItemsAZ(prev.map(p => Number(p.id) === Number(item.id) ? item : p))); };
  const deleteProduct = (id: number) => { if (canWrite('manage_settings')) setProducts(prev => sortCategoryItemsAZ(prev.filter(p => Number(p.id) !== Number(id)))); };

  const addMaterial = (item: CategoryItem) => { if (canWrite('manage_settings')) setMaterials(prev => sortCategoryItemsAZ([...prev, item])); };
  const updateMaterial = (item: CategoryItem) => { if (canWrite('manage_settings')) setMaterials(prev => sortCategoryItemsAZ(prev.map(m => Number(m.id) === Number(item.id) ? item : m))); };
  const deleteMaterial = (id: number) => { if (canWrite('manage_settings')) setMaterials(prev => sortCategoryItemsAZ(prev.filter(m => Number(m.id) !== Number(id)))); };

  const addExpenseCat = (item: CategoryItem) => { if (canWrite('manage_settings')) setExpensesCat(prev => sortCategoryItemsAZ([...prev, item])); };
  const updateExpenseCat = (item: CategoryItem) => { if (canWrite('manage_settings')) setExpensesCat(prev => sortCategoryItemsAZ(prev.map(e => Number(e.id) === Number(item.id) ? item : e))); };
  const deleteExpenseCat = (id: number) => { if (canWrite('manage_settings')) setExpensesCat(prev => sortCategoryItemsAZ(prev.filter(e => Number(e.id) !== Number(id)))); };

  const addOtherExpenseCat = (item: CategoryItem) => { if (canWrite('manage_settings')) setOtherExpensesCat(prev => sortCategoryItemsAZ([...prev, item])); };
  const updateOtherExpenseCat = (item: CategoryItem) => { if (canWrite('manage_settings')) setOtherExpensesCat(prev => sortCategoryItemsAZ(prev.map(e => Number(e.id) === Number(item.id) ? item : e))); };
  const deleteOtherExpenseCat = (id: number) => { if (canWrite('manage_settings')) setOtherExpensesCat(prev => sortCategoryItemsAZ(prev.filter(e => Number(e.id) !== Number(id)))); };

  const addVehicle = (item: VehicleCategoryItem) => { if (canWrite('manage_settings')) setVehicles(prev => sortAZ([...prev, item], 'vehicleName')); };
  const updateVehicle = (item: VehicleCategoryItem) => { if (canWrite('manage_settings')) setVehicles(prev => sortAZ(prev.map(v => Number(v.id) === Number(item.id) ? item : v), 'vehicleName')); };
  const deleteVehicle = (id: number) => { if (canWrite('manage_settings')) setVehicles(prev => prev.filter(v => Number(v.id) !== Number(id))); };

  // XỬ LÝ PHIẾU KHO (ĐỒNG BỘ TRỰC TIẾP LÊN HỆ THỐNG & TỰ ĐỘNG LƯU SHEET)
  const getSlipWritePermission = (slip: SlipItem): Permission =>
    slip.type === 'XUAT_KS_TRA_CTY' ||
    (String(slip.type).includes('KS') && String(slip.type).includes('TRA'))
      ? 'manage_frame_returns'
      : 'manage_settings';
  const getSlipModuleName = (slip: SlipItem) =>
    String(slip.type).includes('KS') || String(slip.type).includes('KHUNG')
      ? 'Báo cáo NXT Khung Sơn'
      : String(slip.type).includes('SUA_KHOAN')
        ? 'Báo cáo NXT & Sửa Khoán'
        : 'Phiếu Kho';
  const isMaterialExpense = (expense: ExpenseItem) =>
    Array.isArray(expense.items) && expense.items.some(item => item.sourceType === 'Nguyên liệu');
  const getExpenseModuleName = (expense: ExpenseItem) =>
    isMaterialExpense(expense) ? 'Báo cáo NXT Nguyên Phụ Liệu / Phiếu Chi' : 'Phiếu Chi';
  const changedFields = <T extends object>(before: T, after: T, fieldNames: Partial<Record<keyof T, string>>) =>
    (Object.keys(fieldNames) as Array<keyof T>)
      .filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      .map(key => fieldNames[key])
      .filter((name): name is string => Boolean(name));

  const addSlip = (slip: SlipItem) => {
    if (!canWrite(getSlipWritePermission(slip))) return;
    setSlips(prev => [slip, ...prev]);
    if (user) logAction(user, 'CREATE', getSlipModuleName(slip), `Tạo phiếu ${slip.slipNo || slip.type}: ${slip.productCode}, SL ${slip.quantity}`, slip.id);
  };
  const updateSlip = (slip: SlipItem) => {
    if (!canWrite(getSlipWritePermission(slip))) return;
    const existing = slips.find(item => String(item.id) === String(slip.id));
    setSlips(prev => prev.map(s => String(s.id) === String(slip.id) ? slip : s));
    if (existing && user) logAction(user, 'UPDATE', getSlipModuleName(slip), `Cập nhật phiếu ${slip.slipNo || slip.type}: ${slip.productCode}, SL ${slip.quantity}`, slip.id);
  };
// HÀM XÓA PHIẾU CHUẨN XÁC (HỖ TRỢ XÓA THEO ID HOẶC SỐ PHIẾU)
  const deleteSlip = (targetKey: number | string) => {
    const existing = slips.find(s => String(s.id) === String(targetKey) || String(s.slipNo) === String(targetKey));
    if (existing && !canWrite('manage_settings')) return;
    setSlips(prev => prev.filter(s => 
      String(s.id) !== String(targetKey) && String(s.slipNo) !== String(targetKey)
    ));
    if (existing && user) logAction(user, 'DELETE', getSlipModuleName(existing), `Xóa phiếu ${existing.slipNo || existing.type}: ${existing.productCode}`, existing.id);
  };

  const addExpense = (expense: ExpenseItem) => {
    if (!canWrite('manage_expenses')) return;
    const nextExpenses = [expense, ...expenses.filter(item => String(item.id) !== String(expense.id))];
    saveLocalStorageArray(EXPENSE_STORAGE_KEY, nextExpenses);
    setExpenses(nextExpenses);
    if (user) {
      logAction(
        user,
        'CREATE',
        getExpenseModuleName(expense),
        `Tạo phiếu chi ${expense.expenseCode || expense.expenseName || expense.id}, số tiền ${Number(expense.amount) || 0}`,
        expense.id
      );
    }
  };
  const updateExpense = (expense: ExpenseItem) => {
    if (!canWrite('manage_expenses')) return;
    const existing = expenses.find(item => String(item.id) === String(expense.id));
    const nextExpenses = existing
      ? expenses.map(item => String(item.id) === String(expense.id) ? expense : item)
      : [expense, ...expenses];
    saveLocalStorageArray(EXPENSE_STORAGE_KEY, nextExpenses);
    setExpenses(nextExpenses);
    if (existing && user) {
      const changed = changedFields(existing, expense, {
        date: 'ngày', amount: 'số tiền', vatRatePercent: 'thuế suất VAT',
        vatAmount: 'tiền thuế', category: 'khoản mục', expenseName: 'tên khoản chi',
        items: 'danh sách mặt hàng', note: 'ghi chú'
      });
      logAction(user, 'UPDATE', getExpenseModuleName(expense), `Cập nhật phiếu chi ${expense.expenseCode || expense.expenseName || expense.id}; thay đổi: ${changed.join(', ') || 'không đổi trường theo dõi'}`, expense.id);
    }
  };
  const deleteExpense = (id: number | string) => {
    if (!canWrite('delete_expenses')) return;
    const existing = expenses.find(item => String(item.id) === String(id));
    const nextExpenses = expenses.filter(item => String(item.id) !== String(id));
    saveLocalStorageArray(EXPENSE_STORAGE_KEY, nextExpenses);
    setExpenses(nextExpenses);
    if (existing && user) logAction(user, 'DELETE', getExpenseModuleName(existing), `Xóa phiếu chi ${existing.expenseCode || existing.expenseName || id}, số tiền ${Number(existing.amount) || 0}`, id);
  };
  const saveExpenseAllocation = (allocation: ExpenseAllocation) => {
    if (!canWrite('manage_expenses')) return;
    setExpenseAllocations(prev => {
    const exists = prev.some(item => item.sourceId === allocation.sourceId);
    return exists
      ? prev.map(item => item.sourceId === allocation.sourceId ? allocation : item)
      : [...prev, allocation];
    });
  };

  const addMileageLog = (log: MileageLog) => {
    setMileageLogs(prev => [log, ...prev]);
    setVehicles(prev => prev.map(v => v.plateNo === log.plateNo ? { ...v, currentKm: log.endKm } : v));
  };
  const updateMileageLog = (log: MileageLog) => {
    const previousLog = mileageLogs.find(item => item.id === log.id);
    setMileageLogs(prev => prev.map(item => item.id === log.id ? log : item));
    const affectedPlates = new Set([previousLog?.plateNo, log.plateNo].filter(Boolean));
    const nextLogs = mileageLogs.map(item => item.id === log.id ? log : item);
    setVehicles(prev => prev.map(vehicle => {
      if (!affectedPlates.has(vehicle.plateNo)) return vehicle;
      const relatedLogs = nextLogs
        .filter(item => item.plateNo === vehicle.plateNo)
        .sort((first, second) => String(second.date || '').localeCompare(String(first.date || '')));
      return relatedLogs[0] ? { ...vehicle, currentKm: Number(relatedLogs[0].endKm) || 0 } : vehicle;
    }));
  };
  const deleteMileageLog = (id: number) => {
    const deletedLog = mileageLogs.find(item => item.id === id);
    setMileageLogs(prev => prev.filter(item => item.id !== id));
    if (!deletedLog) return;
    setVehicles(prev => prev.map(vehicle => {
      if (vehicle.plateNo !== deletedLog.plateNo) return vehicle;
      const remainingLogs = mileageLogs
        .filter(item => item.id !== id && item.plateNo === vehicle.plateNo)
        .sort((first, second) => String(second.date || '').localeCompare(String(first.date || '')));
      return remainingLogs[0]
        ? { ...vehicle, currentKm: Number(remainingLogs[0].endKm) || 0 }
        : vehicle;
    }));
  };

  const addDepositSlip = (slip: DepositSlip) => {
    if (!canWrite('manage_contracts')) return;
    setDepositSlips(prev => [slip, ...prev]);
    if (user) logAction(user, 'CREATE', 'HĐ Cty', `Ghi nhận tiền cọc ${slip.amount} cho ${slip.contractNo}`, slip.id);
  };

  const getContractModule = (item: ContractItem) =>
    item.contractType === 'SUB' ? 'HĐ Tổ Đan' : 'HĐ Cty';
  const addContract = (item: ContractItem) => {
    if (!canWrite('manage_contracts')) return;
    setContracts(prev => [item, ...prev]);
    if (user) logAction(user, 'CREATE', getContractModule(item), `Tạo hợp đồng ${item.contractNo}: ${item.productCode}, SL ${item.quantity}`, item.id);
  };
  const updateContract = (item: ContractItem) => {
    const existing = contracts.find(contract => String(contract.id) === String(item.id));
    const { receivedGoodsLogs: previousReceipts, ...previousContract } = existing || {} as ContractItem;
    const { receivedGoodsLogs: nextReceipts, ...nextContract } = item;
    const onlyReceivedGoodsChanged = Boolean(existing) &&
      JSON.stringify(previousContract) === JSON.stringify(nextContract) &&
      JSON.stringify(previousReceipts) !== JSON.stringify(nextReceipts);
    if (!canWrite(onlyReceivedGoodsChanged ? 'manage_knitting_receipts' : 'manage_contracts')) return;
    setContracts(prev => prev.map(c => String(c.id) === String(item.id) ? item : c));
    if (existing && user) {
      logAction(
        user,
        'UPDATE',
        getContractModule(item),
        onlyReceivedGoodsChanged
          ? `Cập nhật nhận hàng/công nợ tổ đan ${item.contractNo}`
          : `Cập nhật hợp đồng ${item.contractNo}; thay đổi: ${changedFields(existing, item, {
            quantity: 'số lượng', unitPrice: 'đơn giá', totalAmount: 'thành tiền',
            requiredDeposit: 'tiền cọc', dueDate: 'hạn giao', depositDate: 'ngày nhận cọc',
            companyName: 'công ty', craftGroupLeader: 'tổ đan', accompanyingMaterials: 'nguyên phụ liệu'
          }).join(', ') || 'không đổi trường theo dõi'}`,
        item.id
      );
    }
  };
  const deleteContract = (id: number | string) => {
    if (!canWrite('delete_contracts')) return;
    const existing = contracts.find(item => String(item.id) === String(id));
    setContracts(prev => prev.filter(c => String(c.id) !== String(id)));
    if (existing && user) logAction(user, 'DELETE', getContractModule(existing), `Xóa hợp đồng ${existing.contractNo}`, id);
  };
  const addKnittingExportSlip = (slip: KnittingExportSlip) => {
    if (!canWrite('manage_knitting_exports')) return;
    setKnittingExportSlips(prev => [slip, ...prev]);
    if (user) logAction(user, 'CREATE', 'Xuất Hàng Đan', `Tạo phiếu ${slip.slipNo}`, slip.id);
  };
  const updateKnittingExportSlip = (slip: KnittingExportSlip) => {
    if (!canWrite('manage_knitting_exports')) return;
    const existing = knittingExportSlips.find(item => String(item.id) === String(slip.id));
    setKnittingExportSlips(prev => prev.map(item => String(item.id) === String(slip.id) ? slip : item));
    if (existing && user) logAction(user, 'UPDATE', 'Xuất Hàng Đan', `Cập nhật phiếu ${slip.slipNo}`, slip.id);
  };
  const deleteKnittingExportSlip = (id: number | string) => {
    if (!canWrite('delete_knitting_exports')) return;
    const existing = knittingExportSlips.find(item => String(item.id) === String(id));
    setKnittingExportSlips(prev => prev.filter(item => String(item.id) !== String(id)));
    if (existing && user) logAction(user, 'DELETE', 'Xuất Hàng Đan', `Xóa phiếu ${existing.slipNo}`, id);
  };
  const addDefectiveGoodsImportSlip = (slip: DefectiveGoodsImportSlip) => {
    if (!canWrite('manage_contracts')) return;
    setDefectiveGoodsImportSlips(prev => [slip, ...prev]);
    if (user) logAction(user, 'CREATE', 'Nhập Hàng Loại', `Tạo phiếu ${slip.slipNo}`, slip.id);
  };
  const updateDefectiveGoodsImportSlip = (slip: DefectiveGoodsImportSlip) => {
    if (!canWrite('manage_contracts')) return;
    const existing = defectiveGoodsImportSlips.find(item => String(item.id) === String(slip.id));
    setDefectiveGoodsImportSlips(prev => prev.map(item => String(item.id) === String(slip.id) ? slip : item));
    if (existing && user) logAction(user, 'UPDATE', 'Nhập Hàng Loại', `Cập nhật phiếu ${slip.slipNo}`, slip.id);
  };
  const deleteDefectiveGoodsImportSlip = (id: number | string) => {
    if (!canWrite('manage_contracts')) return;
    const existing = defectiveGoodsImportSlips.find(item => String(item.id) === String(id));
    setDefectiveGoodsImportSlips(prev => prev.filter(item => String(item.id) !== String(id)));
    if (existing && user) logAction(user, 'DELETE', 'Nhập Hàng Loại', `Xóa phiếu ${existing.slipNo}`, id);
  };
  const saveSystemConfiguration = (configuration: SystemConfiguration) => {
    if (canWrite('manage_settings')) setSystemConfiguration(configuration);
  };
  const deleteSystemConfiguration = () => {
    if (canWrite('manage_settings')) setSystemConfiguration(null);
  };

  return (
    <AppContext.Provider
      value={{
        products, materials, expensesCat, otherExpensesCat, vehicles,
        slips, 
        inventoryLogs: slips, // CHÍNH XÁC: Liên kết inventoryLogs với slips
        expenses, expenseAllocations, mileageLogs, depositSlips, contracts, frameExports, knittingExportSlips, defectiveGoodsImportSlips, systemConfiguration, isDataLoaded, dataLoadError, retryDataLoad, isSystemConfigurationLoaded,
        addProduct, updateProduct, deleteProduct,
        addMaterial, updateMaterial, deleteMaterial,
        addExpenseCat, updateExpenseCat, deleteExpenseCat,
        addOtherExpenseCat, updateOtherExpenseCat, deleteOtherExpenseCat,
        addVehicle, updateVehicle, deleteVehicle,
        addSlip, updateSlip, deleteSlip,
        addInventoryLog: addSlip,          // CHÍNH XÁC: Liên kết addInventoryLog
        updateInventoryLog: updateSlip,   // CHÍNH XÁC: Liên kết updateInventoryLog
        deleteInventoryLog: deleteSlip,   // CHÍNH XÁC: Liên kết deleteInventoryLog
        addExpense, updateExpense, deleteExpense, saveExpenseAllocation, addMileageLog, updateMileageLog, deleteMileageLog, addDepositSlip,
        addContract, updateContract, deleteContract, addKnittingExportSlip, updateKnittingExportSlip,
        deleteKnittingExportSlip, addDefectiveGoodsImportSlip, updateDefectiveGoodsImportSlip,
        deleteDefectiveGoodsImportSlip, saveSystemConfiguration, deleteSystemConfiguration
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp phải được sử dụng trong AppProvider');
  return context;
};