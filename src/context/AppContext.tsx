import React, { createContext, useCallback, useContext, useState, useEffect, useRef } from 'react';
import {
  fetchDataStore,
  saveDataStore
} from '../services/supabaseDataService';
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
    goodQuantity?: number;
    goodBundleQuantity?: number;
    goodSizeQuantities?: Record<string, number>;
    defectiveQuantity?: number;
    defectiveBundleQuantity?: number;
    defectiveSizeQuantities?: Record<string, number>;
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
  contractCode?: string;
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

const APP_DATA_SHEETS = [
  'products',
  'materials',
  'expensesCat',
  'otherExpensesCat',
  'vehicles',
  'slips',
  'expenses',
  'mileageLogs',
  'depositSlips',
  'contracts',
  'knittingExportSlips',
  'defectiveGoodsImportSlips',
  'systemConfig',
  'expenseAllocations'
] as const;

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
  sourceAllocations?: Array<{
    sourceContractId: number | string;
    sourceContractNo: string;
    sourceReceiptId: string;
    quantityPieces: number;
  }>;
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
  is_graded?: boolean;
  totalExportedPieces?: number;
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
  isRefreshing: boolean;
  dataLoadError: string;
  reloadData: () => void;
  reloadDataInBackground: () => void;
  isSystemConfigurationLoaded: boolean;

  addProduct: (item: CategoryItem) => void;
  updateProduct: (item: CategoryItem) => void;
  deleteProduct: (id: number | string) => void;

  addMaterial: (item: CategoryItem) => void;
  updateMaterial: (item: CategoryItem) => void;
  deleteMaterial: (id: number | string) => void;

  addExpenseCat: (item: CategoryItem) => void;
  updateExpenseCat: (item: CategoryItem) => void;
  deleteExpenseCat: (id: number | string) => void;

  addOtherExpenseCat: (item: CategoryItem) => void;
  updateOtherExpenseCat: (item: CategoryItem) => void;
  deleteOtherExpenseCat: (id: number | string) => void;

  addVehicle: (item: VehicleCategoryItem) => void;
  updateVehicle: (item: VehicleCategoryItem) => void;
  deleteVehicle: (id: number | string) => void;

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
  deleteContract: (
    id: number | string,
    contractCode?: string,
    nextContracts?: ContractItem[]
  ) => void;
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

const normalizeCategoryItem = (item: CategoryItem): CategoryItem => ({
  ...item,
  code: String(item.code || '').trim().toLocaleUpperCase('vi'),
  name: String(item.name || '').trim()
});

const sortCategoryItemsAZ = (items: CategoryItem[] = []) =>
  (Array.isArray(items) ? items : [])
    .filter((item): item is CategoryItem => Boolean(item) && typeof item === 'object')
    .map(normalizeCategoryItem)
    .sort((first, second) =>
      first.name.localeCompare(second.name, 'vi', { sensitivity: 'base', numeric: true }) ||
      first.code.localeCompare(second.code, 'vi', { sensitivity: 'base', numeric: true })
    );

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, hasPermission } = useAuth();
  const [products, setProducts] = useState<CategoryItem[]>([]);
  const [materials, setMaterials] = useState<CategoryItem[]>([]);
  const [expensesCat, setExpensesCat] = useState<CategoryItem[]>([]);
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dataLoadError, setDataLoadError] = useState('');
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
  const loadedUserId = useRef<string | null>(null);
  const persistenceEffectsMounted = useRef(false);
  const suppressedSaveSnapshots = useRef(new Map<string, unknown>());
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isBackgroundLoad, setIsBackgroundLoad] = useState(false);

  const applySheetSnapshot = useCallback((sheetName: string, rawValue: unknown[]) => {
    if (!user?.id) return;
    switch (sheetName) {
      case 'products': {
        const value = sortCategoryItemsAZ(normalizeRecordArray<CategoryItem>(rawValue));
        suppressedSaveSnapshots.current.set(sheetName, value);
        setProducts(value);
        break;
      }
      case 'materials': {
        const value = sortCategoryItemsAZ(normalizeRecordArray<CategoryItem>(rawValue));
        suppressedSaveSnapshots.current.set(sheetName, value);
        setMaterials(value);
        break;
      }
      case 'expensesCat': {
        const categories = normalizeRecordArray<CategoryItem>(rawValue);
        const value = sortCategoryItemsAZ(categories);
        suppressedSaveSnapshots.current.set(sheetName, value);
        setExpensesCat(value);
        break;
      }
      case 'otherExpensesCat': {
        const value = sortCategoryItemsAZ(normalizeRecordArray<CategoryItem>(rawValue));
        suppressedSaveSnapshots.current.set(sheetName, value);
        setOtherExpensesCat(value);
        break;
      }
      case 'vehicles': {
        const value = normalizeRecordArray<VehicleCategoryItem>(rawValue);
        suppressedSaveSnapshots.current.set(sheetName, value);
        setVehicles(value);
        break;
      }
      case 'slips': {
        const value = normalizeRecordArray<SlipItem>(rawValue);
        suppressedSaveSnapshots.current.set(sheetName, value);
        setSlips(value);
        break;
      }
      case 'expenses': {
        const value = normalizeRecordArray<ExpenseItem>(rawValue);
        suppressedSaveSnapshots.current.set(sheetName, value);
        setExpenses(value);
        break;
      }
      case 'mileageLogs': {
        const value = normalizeRecordArray<MileageLog>(rawValue);
        suppressedSaveSnapshots.current.set(sheetName, value);
        setMileageLogs(value);
        break;
      }
      case 'depositSlips': {
        const value = normalizeRecordArray<DepositSlip>(rawValue);
        suppressedSaveSnapshots.current.set(sheetName, value);
        setDepositSlips(value);
        break;
      }
      case 'contracts': {
        const value = normalizeRecordArray<ContractItem>(rawValue);
        suppressedSaveSnapshots.current.set(sheetName, value);
        setContracts(value);
        break;
      }
      case 'knittingExportSlips': {
        const value = normalizeRecordArray<KnittingExportSlip>(rawValue);
        suppressedSaveSnapshots.current.set(sheetName, value);
        setKnittingExportSlips(value);
        break;
      }
      case 'defectiveGoodsImportSlips': {
        const value = normalizeRecordArray<DefectiveGoodsImportSlip>(rawValue);
        suppressedSaveSnapshots.current.set(sheetName, value);
        setDefectiveGoodsImportSlips(value);
        break;
      }
      case 'systemConfig': {
        const value = normalizeSystemConfiguration(normalizeRecordArray<unknown>(rawValue)[0]);
        suppressedSaveSnapshots.current.set(sheetName, value);
        setSystemConfiguration(value);
        break;
      }
      case 'expenseAllocations': {
        const value = normalizeRecordArray<ExpenseAllocation>(rawValue);
        suppressedSaveSnapshots.current.set(sheetName, value);
        setExpenseAllocations(value);
        break;
      }
    }
  }, [user?.id]);

  const applyAvailableSnapshots = useCallback((snapshots: Map<string, unknown[]>) => {
    snapshots.forEach((value, sheetName) => applySheetSnapshot(sheetName, value));
  }, [applySheetSnapshot]);

  useEffect(() => {
    let active = true;
    let fetchInFlight = false;
    const userId = user?.id;

    async function initData(isBackground = false) {
      if (fetchInFlight) return;
      fetchInFlight = true;
      const wasLoaded = isLoaded.current && loadedUserId.current === userId;
      if (!isBackground) {
        setIsRefreshing(true);
        if (!wasLoaded) setIsDataLoaded(false);
        setDataLoadError('');
        setIsSystemConfigurationLoaded(false);
      }
      if (!userId) {
        isLoaded.current = false;
        loadedUserId.current = null;
        if (!isBackground) setIsRefreshing(false);
        fetchInFlight = false;
        return;
      }
      if (!wasLoaded) {
        isLoaded.current = false;
        loadedUserId.current = null;
        suppressedSaveSnapshots.current.clear();
      }

      let failed = false;
      try {
        const entries = await Promise.all(APP_DATA_SHEETS.map(async sheetName =>
          [sheetName, await fetchDataStore(sheetName, userId)] as const
        ));
        if (!active) return;
        applyAvailableSnapshots(new Map(entries));
        setDataLoadError('');
      } catch (e) {
        if (!active) return;
        failed = true;
        console.error('Lỗi khi tải dữ liệu ban đầu từ Supabase:', e);
        setDataLoadError(e instanceof Error ? e.message : 'Không thể tải dữ liệu từ hệ thống.');
        if (wasLoaded) {
          setIsSystemConfigurationLoaded(true);
          window.dispatchEvent(new CustomEvent('erp:sync-status', {
            detail: { status: 'error', message: 'Không thể làm mới dữ liệu từ Supabase.' }
          }));
        }
      } finally {
        fetchInFlight = false;
        if (active && !isBackground) setIsRefreshing(false);
      }

      if (!active || failed) return;
      isLoaded.current = true;
      loadedUserId.current = userId;
      setIsDataLoaded(true);
      setIsSystemConfigurationLoaded(true);
    }
    void initData(isBackgroundLoad);

    const intervalId = userId
      ? window.setInterval(() => {
        if (document.visibilityState === 'visible' && navigator.onLine) void initData(true);
      }, 5000)
      : null;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void initData(true);
    };
    if (userId) document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      if (intervalId !== null) window.clearInterval(intervalId);
      if (userId) document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [applyAvailableSnapshots, isBackgroundLoad, loadAttempt, user?.id]);

  const reloadData = useCallback(() => {
    setIsBackgroundLoad(false);
    setLoadAttempt(attempt => attempt + 1);
  }, []);
  const reloadDataInBackground = useCallback(() => {
    setIsBackgroundLoad(true);
    setLoadAttempt(attempt => attempt + 1);
  }, []);

  const shouldPersistSnapshot = useCallback((sheetName: string, value: unknown) => {
    if (!user?.id || !isLoaded.current || !persistenceEffectsMounted.current) return false;
    if (suppressedSaveSnapshots.current.get(sheetName) !== value) return true;
    suppressedSaveSnapshots.current.delete(sheetName);
    return false;
  }, [user]);
  const persistDataStoreSnapshot = useCallback((sheetName: string, value: unknown[]) => {
    if (!user?.id) return;
    window.dispatchEvent(new CustomEvent('erp:sync-status', {
      detail: { status: 'syncing', message: `Đang lưu ${sheetName} lên Supabase...` }
    }));
    void saveDataStore(sheetName, user.id, value).then(remoteValue => {
      applySheetSnapshot(sheetName, remoteValue);
      setDataLoadError('');
      window.dispatchEvent(new CustomEvent('erp:sync-status', {
        detail: { status: 'synced', message: `Đã lưu thành công lên Supabase lúc ${new Date().toLocaleTimeString('vi-VN')}` }
      }));
    }).catch(error => {
      console.error(`Không thể lưu dữ liệu Supabase (${sheetName}):`, error);
      const message = error instanceof Error ? error.message : 'Không thể lưu dữ liệu lên Supabase.';
      setDataLoadError(message);
      window.dispatchEvent(new CustomEvent('erp:sync-status', {
        detail: { status: 'error', message: `Không thể lưu dữ liệu ${sheetName} lên Supabase: ${message}` }
      }));
    });
  }, [applySheetSnapshot, user]);

  useEffect(() => { if (shouldPersistSnapshot('products', products)) persistDataStoreSnapshot('products', products); }, [products, shouldPersistSnapshot, persistDataStoreSnapshot]);
  useEffect(() => { if (shouldPersistSnapshot('materials', materials)) persistDataStoreSnapshot('materials', materials); }, [materials, shouldPersistSnapshot, persistDataStoreSnapshot]);
  useEffect(() => { if (shouldPersistSnapshot('expensesCat', expensesCat)) persistDataStoreSnapshot('expensesCat', expensesCat); }, [expensesCat, shouldPersistSnapshot, persistDataStoreSnapshot]);
  useEffect(() => { if (shouldPersistSnapshot('otherExpensesCat', otherExpensesCat)) persistDataStoreSnapshot('otherExpensesCat', otherExpensesCat); }, [otherExpensesCat, shouldPersistSnapshot, persistDataStoreSnapshot]);
  useEffect(() => { if (shouldPersistSnapshot('vehicles', vehicles)) persistDataStoreSnapshot('vehicles', vehicles); }, [vehicles, shouldPersistSnapshot, persistDataStoreSnapshot]);
  useEffect(() => { if (shouldPersistSnapshot('slips', slips)) persistDataStoreSnapshot('slips', slips); }, [slips, shouldPersistSnapshot, persistDataStoreSnapshot]);
  useEffect(() => {
    if (!shouldPersistSnapshot('expenses', expenses)) return;
    persistDataStoreSnapshot('expenses', expenses);
  }, [expenses, shouldPersistSnapshot, persistDataStoreSnapshot]);
  useEffect(() => { if (shouldPersistSnapshot('expenseAllocations', expenseAllocations)) persistDataStoreSnapshot('expenseAllocations', expenseAllocations); }, [expenseAllocations, shouldPersistSnapshot, persistDataStoreSnapshot]);
  useEffect(() => { if (shouldPersistSnapshot('mileageLogs', mileageLogs)) persistDataStoreSnapshot('mileageLogs', mileageLogs); }, [mileageLogs, shouldPersistSnapshot, persistDataStoreSnapshot]);
  useEffect(() => { if (shouldPersistSnapshot('depositSlips', depositSlips)) persistDataStoreSnapshot('depositSlips', depositSlips); }, [depositSlips, shouldPersistSnapshot, persistDataStoreSnapshot]);
  useEffect(() => { if (shouldPersistSnapshot('contracts', contracts)) persistDataStoreSnapshot('contracts', contracts); }, [contracts, shouldPersistSnapshot, persistDataStoreSnapshot]);
  useEffect(() => {
    if (!shouldPersistSnapshot('knittingExportSlips', knittingExportSlips)) return;
    persistDataStoreSnapshot('knittingExportSlips', knittingExportSlips);
  }, [knittingExportSlips, shouldPersistSnapshot, persistDataStoreSnapshot]);
  useEffect(() => { if (shouldPersistSnapshot('defectiveGoodsImportSlips', defectiveGoodsImportSlips)) persistDataStoreSnapshot('defectiveGoodsImportSlips', defectiveGoodsImportSlips); }, [defectiveGoodsImportSlips, shouldPersistSnapshot, persistDataStoreSnapshot]);
  useEffect(() => {
    if (shouldPersistSnapshot('systemConfig', systemConfiguration)) {
      persistDataStoreSnapshot('systemConfig', systemConfiguration ? [systemConfiguration] : []);
    }
  }, [systemConfiguration, shouldPersistSnapshot, persistDataStoreSnapshot]);
  useEffect(() => {
    persistenceEffectsMounted.current = true;
  }, []);

  const sortAZ = <T extends object>(list: T[], key: keyof T): T[] => {
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
  const updateProduct = (item: CategoryItem) => { if (canWrite('manage_settings')) setProducts(prev => sortCategoryItemsAZ(prev.map(p => String(p.id) === String(item.id) ? item : p))); };
  const deleteProduct = (id: number | string) => { if (canWrite('manage_settings')) setProducts(prev => prev.filter(p => String(p.id) !== String(id))); };

  const addMaterial = (item: CategoryItem) => { if (canWrite('manage_settings')) setMaterials(prev => sortCategoryItemsAZ([...prev, item])); };
  const updateMaterial = (item: CategoryItem) => { if (canWrite('manage_settings')) setMaterials(prev => sortCategoryItemsAZ(prev.map(m => String(m.id) === String(item.id) ? item : m))); };
  const deleteMaterial = (id: number | string) => { if (canWrite('manage_settings')) setMaterials(prev => prev.filter(m => String(m.id) !== String(id))); };

  const addExpenseCat = (item: CategoryItem) => { if (canWrite('manage_settings')) setExpensesCat(prev => sortCategoryItemsAZ([...prev, item])); };
  const updateExpenseCat = (item: CategoryItem) => { if (canWrite('manage_settings')) setExpensesCat(prev => sortCategoryItemsAZ(prev.map(e => String(e.id) === String(item.id) ? item : e))); };
  const deleteExpenseCat = (id: number | string) => { if (canWrite('manage_settings')) setExpensesCat(prev => prev.filter(e => String(e.id) !== String(id))); };

  const addOtherExpenseCat = (item: CategoryItem) => { if (canWrite('manage_settings')) setOtherExpensesCat(prev => sortCategoryItemsAZ([...prev, item])); };
  const updateOtherExpenseCat = (item: CategoryItem) => { if (canWrite('manage_settings')) setOtherExpensesCat(prev => sortCategoryItemsAZ(prev.map(e => String(e.id) === String(item.id) ? item : e))); };
  const deleteOtherExpenseCat = (id: number | string) => { if (canWrite('manage_settings')) setOtherExpensesCat(prev => prev.filter(e => String(e.id) !== String(id))); };

  const addVehicle = (item: VehicleCategoryItem) => { if (canWrite('manage_settings')) setVehicles(prev => sortAZ([...prev, item], 'vehicleName')); };
  const updateVehicle = (item: VehicleCategoryItem) => { if (canWrite('manage_settings')) setVehicles(prev => sortAZ(prev.map(v => String(v.id) === String(item.id) ? item : v), 'vehicleName')); };
  const deleteVehicle = (id: number | string) => { if (canWrite('manage_settings')) setVehicles(prev => prev.filter(v => String(v.id) !== String(id))); };

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
    if (!user?.id) return;
    const nextExpenses = [expense, ...expenses.filter(item => String(item.id) !== String(expense.id))];
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
    if (!user?.id) return;
    const existing = expenses.find(item => String(item.id) === String(expense.id));
    const nextExpenses = existing
      ? expenses.map(item => String(item.id) === String(expense.id) ? expense : item)
      : [expense, ...expenses];
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
    if (!user?.id) return;
    const existing = expenses.find(item => String(item.id) === String(id));
    const nextExpenses = expenses.filter(item => String(item.id) !== String(id));
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
  const deleteContract = (
    id: number | string,
    contractCode?: string,
    nextContracts?: ContractItem[]
  ) => {
    if (!canWrite('delete_contracts')) return;
    const normalizedContractCode = String(contractCode || '').trim().toLocaleLowerCase('vi');
    const matchesContract = (item: ContractItem) => {
      const itemCode = String(item.contractCode || item.contractNo || '').trim().toLocaleLowerCase('vi');
      return String(item.id) === String(id) ||
        Boolean(normalizedContractCode && itemCode === normalizedContractCode);
    };
    const existing = contracts.find(matchesContract);
    setContracts(prev => nextContracts ?? prev.filter(item => !matchesContract(item)));
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
        expenses, expenseAllocations, mileageLogs, depositSlips, contracts, frameExports, knittingExportSlips, defectiveGoodsImportSlips, systemConfiguration, isDataLoaded, isRefreshing, dataLoadError, reloadData, reloadDataInBackground, isSystemConfigurationLoaded,
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