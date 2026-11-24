import { useMemo, useState, type ReactNode } from 'react';
import { useApp, type CategoryItem, type VehicleCategoryItem } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { saveDataStore } from '../services/supabaseDataService';
import { formatVehicleExpiryDate as formatVehicleDate } from '../utils/vehicleExpiry';
import { recordVehicleMaintenance } from '../utils/vehicleMaintenance';
import VoiceFillControl from './VoiceFillControl';
import { parseVietnameseNumber, parseVietnameseFormSpeech } from '../utils/voiceFormParser';

const formatVehicleDateInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits.length === 2 ? `${digits}/` : digits;
  const day = digits.slice(0, 2);
  if (digits.length <= 4) return `${day}/${digits.slice(2)}`;
  return `${day}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const parseVehicleDate = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const getTodayISODate = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const normalizeVoiceCommand = (value: string) => value
  .toLocaleLowerCase('vi')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const extractSpokenFieldValue = (transcript: string, labels: string[]) => {
  const normalizedTranscript = normalizeVoiceCommand(transcript);
  const normalizedLabels = labels.map(normalizeVoiceCommand).sort((a, b) => b.length - a.length);
  for (const label of normalizedLabels) {
    const match = new RegExp(`(?:^|\\s)${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?::|là)?\\s*(.+)$`, 'iu').exec(normalizedTranscript);
    if (match?.[1]) return match[1].trim();
  }
  return '';
};

const formatSpokenDate = (transcript: string) => {
  const direct = transcript.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (direct) return `${direct[1].padStart(2, '0')}/${direct[2].padStart(2, '0')}/${direct[3]}`;
  const compact = transcript.match(/(\d{8})/);
  if (compact) {
    const digits = compact[1];
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }
  const spoken = transcript.match(/(\d{1,2})\s*(?:ngày|tháng)\s*(\d{1,2})(?:\s*(?:tháng|năm)\s*(\d{4})|\s*năm\s*(\d{4}))/i);
  if (spoken) {
    const day = spoken[1];
    const month = spoken[2];
    const year = spoken[3] || spoken[4];
    if (year) return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }
  return '';
};

const parseMaterialNormSpeech = (transcript: string) => {
  const normalized = normalizeVoiceCommand(transcript);
  const materialMatch = /(?:nguyen vat lieu|nguyen phu lieu|vat lieu)\s+(.+?)(?=\s+(?:dinh muc|don vi)\s+|$)/iu.exec(normalized);
  const normMatch = /(?:dinh muc(?: tren san pham| moi san pham| san pham)?|dm)\s+(.+?)(?=\s+(?:nguyen vat lieu|nguyen phu lieu|don vi)\s+|$)/iu.exec(normalized);
  const unitMatch = /(?:don vi tinh nguyen vat lieu|don vi nguyen vat lieu|don vi)\s+(.+?)(?=\s+(?:dinh muc|nguyen vat lieu|nguyen phu lieu)\s+|$)/iu.exec(normalized);
  const materialText = materialMatch?.[1]?.replace(/\b(?:dinh muc|don vi)\b.*$/iu, '').trim();
  const normText = normMatch?.[1]?.replace(/\b(?:nguyen vat lieu|nguyen phu lieu|don vi)\b.*$/iu, '').trim();
  const unitText = unitMatch?.[1]?.replace(/\b(?:dinh muc|nguyen vat lieu|nguyen phu lieu)\b.*$/iu, '').trim();
  return {
    material: materialText || '',
    norm: normText || '',
    unit: unitText || ''
  };
};

export default function CategoryManager() {
  const { user, hasPermission } = useAuth();
  const {
    products,
    materials,
    expensesCat,
    otherExpensesCat,
    vehicles,
    mileageLogs,
    addProduct,
    updateProduct,
    deleteProduct,
    addMaterial,
    updateMaterial,
    deleteMaterial,
    addExpenseCat,
    updateExpenseCat,
    deleteExpenseCat,
    addOtherExpenseCat,
    updateOtherExpenseCat,
    deleteOtherExpenseCat,
    addVehicle,
    updateVehicle,
    deleteVehicle,
    reloadDataInBackground
  } = useApp();

  const [activeTab, setActiveTab] = useState<'hanghoa' | 'nguyenvatlieu' | 'chiphi' | 'xe' | 'chikhac'>('hanghoa');

  // Modal / Form States
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form chung (Hàng hóa, NVL, Chi phí)
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [note, setNote] = useState('');
  const [lowStockLimit, setLowStockLimit] = useState('');
  const [materialNormRows, setMaterialNormRows] = useState<Array<{
    materialId: number | null;
    materialCode: string;
    materialName: string;
    query: string;
    unit: string;
    normPerUnit: string;
  }>>([]);
  const materialNormOptions = useMemo(() => materials.slice().sort((a, b) =>
    a.name.localeCompare(b.name, 'vi', { sensitivity: 'base', numeric: true })
  ), [materials]);

  // Form Xe
  const [vehicleName, setVehicleName] = useState('');
  const [modelYear, setModelYear] = useState('');
  const [plateNo, setPlateNo] = useState('');
  const [insuranceExpiry, setInsuranceExpiry] = useState('');
  const [registrationExpiry, setRegistrationExpiry] = useState('');
  const [currentKm, setCurrentKm] = useState<number>(0);
  const [lastOilChangeKm, setLastOilChangeKm] = useState<number>(0);
  const [maintenanceIntervalKm, setMaintenanceIntervalKm] = useState('');
  const todayISODate = getTodayISODate();
  const parsedInsuranceExpiry = parseVehicleDate(insuranceExpiry);
  const parsedRegistrationExpiry = parseVehicleDate(registrationExpiry);
  const insuranceExpiryError = !insuranceExpiry.trim()
    ? 'Ngày hết hạn bảo hiểm là bắt buộc.'
    : parsedInsuranceExpiry === null
      ? 'Vui lòng nhập ngày bảo hiểm theo định dạng DD/MM/YYYY hợp lệ.'
      : parsedInsuranceExpiry < todayISODate
        ? 'Cảnh báo: Ngày hết hạn bảo hiểm không được nhỏ hơn ngày hiện tại!'
        : '';
  const registrationExpiryError = !registrationExpiry.trim()
    ? 'Ngày hết hạn đăng kiểm là bắt buộc.'
    : parsedRegistrationExpiry === null
      ? 'Vui lòng nhập ngày đăng kiểm theo định dạng DD/MM/YYYY hợp lệ.'
      : parsedRegistrationExpiry < todayISODate
        ? 'Cảnh báo: Ngày hết hạn đăng kiểm không được nhỏ hơn ngày hiện tại!'
        : '';
  const hasInvalidVehicleExpiry = Boolean(insuranceExpiryError || registrationExpiryError);

  const handleOpenForm = (item?: CategoryItem | VehicleCategoryItem) => {
    if (item) {
      setEditingId(item.id);
      if (activeTab === 'xe') {
        const v = item as VehicleCategoryItem;
        setVehicleName(v.vehicleName);
        setModelYear(v.modelYear);
        setPlateNo(v.plateNo);
        setInsuranceExpiry(formatVehicleDate(v.insuranceExpiry));
        setRegistrationExpiry(formatVehicleDate(v.registrationExpiry));
        setCurrentKm(v.currentKm || 0);
        setLastOilChangeKm(v.lastOilChangeKm || 0);
        setMaintenanceIntervalKm(v.maintenanceIntervalKm ? String(v.maintenanceIntervalKm) : '');
      } else {
        const g = item as CategoryItem;
        setCode(g.code);
        setName(g.name);
        setUnit(g.unit || '');
        setNote(g.note);
        setLowStockLimit(activeTab === 'nguyenvatlieu' && Number.isFinite(Number(g.lowStockLimit))
          ? String(g.lowStockLimit ?? '')
          : '');
        setMaterialNormRows(activeTab === 'hanghoa'
          ? (Array.isArray(g.materialNorms) ? g.materialNorms : []).map(norm => ({
            materialId: norm.materialId,
            materialCode: norm.materialCode,
            materialName: norm.materialName,
            query: `${norm.materialCode ? `${norm.materialCode} - ` : ''}${norm.materialName}`.trim(),
            unit: norm.unit || '',
            normPerUnit: String(norm.normPerUnit ?? '')
          }))
          : []);
      }
    } else {
      setEditingId(null);
      setCode('');
      setName('');
      setUnit('');
      setNote('');
      setLowStockLimit('');
      setMaterialNormRows([]);
      setVehicleName('');
      setModelYear('');
      setPlateNo('');
      setInsuranceExpiry('');
      setRegistrationExpiry('');
      setCurrentKm(0);
      setLastOilChangeKm(0);
      setMaintenanceIntervalKm('');
    }
    setShowModal(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (activeTab === 'xe') {
      if (!vehicleName || !plateNo) {
        alert('⚠️ Vui lòng nhập Tên xe và Biển số xe!');
        return;
      }
      const insuranceDate = parseVehicleDate(insuranceExpiry);
      const registrationDate = parseVehicleDate(registrationExpiry);
      if (!insuranceDate || !registrationDate) {
        alert(`⚠️ ${insuranceExpiryError || registrationExpiryError}`);
        return;
      }
      if (insuranceDate < todayISODate || registrationDate < todayISODate) {
        alert('⚠️ Ngày hết hạn bảo hiểm và đăng kiểm phải lớn hơn hoặc bằng ngày hiện tại!');
        return;
      }
      const intervalValue = maintenanceIntervalKm.trim() ? Number(maintenanceIntervalKm) : undefined;
      if (intervalValue !== undefined && (!Number.isFinite(intervalValue) || intervalValue <= 0)) {
        alert('⚠️ Định mức Km bảo dưỡng phải là số lớn hơn 0.');
        return;
      }
      const vehicleItem: VehicleCategoryItem = {
        id: editingId || Date.now(),
        vehicleName,
        modelYear,
        plateNo,
        insuranceExpiry: insuranceDate,
        registrationExpiry: registrationDate,
        currentKm,
        lastOilChangeKm,
        maintenanceIntervalKm: intervalValue,
        maintenanceHistory: (vehicles.find(vehicle => vehicle.id === editingId)?.maintenanceHistory || [])
          .filter(record =>
            record !== null &&
            typeof record === 'object' &&
            typeof record.date === 'string' &&
            Number.isFinite(Number(record.odometerKm))
          )
      };
      if (editingId) {
        updateVehicle(vehicleItem);
      } else {
        addVehicle(vehicleItem);
      }
    } else {
      if ((!code && activeTab !== 'chikhac') || !name) {
        alert(activeTab === 'chikhac'
          ? '⚠️ Vui lòng nhập Tên danh mục!'
          : '⚠️ Vui lòng nhập Mã và Tên danh mục!');
        return;
      }
      const minimumStock = lowStockLimit.trim() ? Number(lowStockLimit) : undefined;
      if (activeTab === 'nguyenvatlieu' &&
        minimumStock !== undefined &&
        (!Number.isFinite(minimumStock) || minimumStock < 0)) {
        alert('⚠️ Hạn mức tồn kho phải là số không âm hợp lệ.');
        return;
      }
      if (activeTab === 'hanghoa' && materialNormRows.some(row => {
        const hasInput = Boolean(row.query.trim() || row.materialName.trim() || row.normPerUnit.trim());
        const parsedNorm = Number(String(row.normPerUnit).trim().replace(',', '.'));
        return hasInput && (!row.materialName.trim() || !Number.isFinite(parsedNorm) || parsedNorm <= 0);
      })) {
        alert('⚠️ Vui lòng chọn nguyên vật liệu và nhập định mức hợp lệ cho từng dòng.');
        return;
      }
      const itemId = editingId || Date.now();
      const materialNorms = activeTab === 'hanghoa'
        ? materialNormRows.flatMap(row => {
          const normPerUnit = Number(String(row.normPerUnit).trim().replace(',', '.'));
          const material = materialNormOptions.find(item => item.id === row.materialId);
          if (!row.materialName.trim() || !Number.isFinite(normPerUnit) || normPerUnit <= 0) return [];
          return [{
            materialId: material?.id ?? row.materialId ?? 0,
            materialCode: material?.code || row.materialCode,
            materialName: material?.name || row.materialName.trim(),
            unit: row.unit.trim() || material?.unit || '',
            normPerUnit
          }];
        })
        : undefined;
      const catItem: CategoryItem = {
        id: itemId,
        code: activeTab === 'chikhac' && !editingId ? `CHIKHAC-${itemId}` : code,
        name,
        unit: activeTab === 'chikhac' ? '' : unit.trim(),
        note,
        ...(activeTab === 'nguyenvatlieu' ? { lowStockLimit: minimumStock } : {}),
        ...(materialNorms ? { materialNorms } : {})
      };

      if (activeTab === 'hanghoa') {
        if (editingId) updateProduct(catItem);
        else addProduct(catItem);
      } else if (activeTab === 'nguyenvatlieu') {
        if (editingId) updateMaterial(catItem);
        else addMaterial(catItem);
      } else if (activeTab === 'chiphi') {
        if (editingId) updateExpenseCat(catItem);
        else addExpenseCat(catItem);
      } else if (activeTab === 'chikhac') {
        if (editingId) updateOtherExpenseCat(catItem);
        else addOtherExpenseCat(catItem);
      }
    }

    setShowModal(false);
  };

  const handleDelete = async (id: number | string) => {
    if (!window.confirm('❓ Bạn có chắc chắn muốn xóa mục này không?')) return;
    if (!hasPermission('manage_settings')) {
      window.dispatchEvent(new CustomEvent('erp:permission-denied', {
        detail: 'Tài khoản hiện tại không có quyền thực hiện thao tác này.'
      }));
      return;
    }
    if (!user?.id) {
      alert('Không thể xóa vì chưa xác định được tài khoản đang đăng nhập.');
      return;
    }

    let sheetName: string;
    let items: Array<CategoryItem | VehicleCategoryItem>;
    let deleteItem: () => void;
    switch (activeTab) {
      case 'hanghoa':
        sheetName = 'products';
        items = products;
        deleteItem = () => deleteProduct(id);
        break;
      case 'nguyenvatlieu':
        sheetName = 'materials';
        items = materials;
        deleteItem = () => deleteMaterial(id);
        break;
      case 'chiphi':
        sheetName = 'expensesCat';
        items = expensesCat;
        deleteItem = () => deleteExpenseCat(id);
        break;
      case 'xe':
        sheetName = 'vehicles';
        items = vehicles;
        deleteItem = () => deleteVehicle(id);
        break;
      case 'chikhac':
        sheetName = 'otherExpensesCat';
        items = otherExpensesCat;
        deleteItem = () => deleteOtherExpenseCat(id);
        break;
    }

    const nextItems = items.filter(item => String(item.id) !== String(id));
    if (nextItems.length === items.length) return;

    try {
      await saveDataStore(sheetName, user.id, nextItems);
      deleteItem();
      reloadDataInBackground();
      alert('✅ Đã xóa mục và lưu thành công lên cơ sở dữ liệu.');
    } catch (error) {
      console.error(`Không thể lưu trạng thái xóa (${sheetName}):`, error);
      const message = error instanceof Error ? error.message : String(error);
      alert(`❌ Không thể xóa mục. Dữ liệu chưa được cập nhật trong cơ sở dữ liệu.\nChi tiết: ${message}`);
    }
  };

  const handleRecordMaintenance = (vehicle: VehicleCategoryItem) => {
    const latestLogKm = (Array.isArray(mileageLogs) ? mileageLogs : [])
      .filter(log => log && log.plateNo === vehicle.plateNo)
      .reduce((latest, log) => Math.max(latest, Number(log.endKm) || 0), 0);
    const currentOdometerKm = Math.max(Number(vehicle.currentKm) || 0, latestLogKm);
    if (!window.confirm(`Xác nhận xe ${vehicle.plateNo} đã thay nhớt/bảo dưỡng tại ${currentOdometerKm} km?`)) return;
    updateVehicle(recordVehicleMaintenance(vehicle, currentOdometerKm));
  };

  const categoryColumns: Array<{
    key: string;
    label: string;
    render: (item: CategoryItem, index: number) => ReactNode;
  }> = [
    { key: 'stt', label: 'STT', render: (_item, index) => index + 1 },
    { key: 'code', label: 'Mã Danh Mục', render: item => item.code },
    { key: 'name', label: 'Tên Danh Mục', render: item => item.name },
    ...(activeTab === 'hanghoa' ? [{
      key: 'materialNorms',
      label: 'Định Mức Nguyên Phụ Liệu',
      render: (item: CategoryItem) => {
        const norms = Array.isArray(item.materialNorms) ? item.materialNorms : [];
        return norms.length > 0
          ? <div style={{ display: 'grid', gap: '3px', minWidth: '220px' }}>{norms.map(norm => (
            <span key={`${norm.materialId}-${norm.materialCode}-${norm.materialName}`}>
              {norm.materialName}: <strong>{Number(norm.normPerUnit).toLocaleString('vi-VN')} {norm.unit}</strong> / sản phẩm
            </span>
          ))}</div>
          : <span style={{ color: '#64748b' }}>Chưa cấu hình</span>;
      }
    }] : []),
    { key: 'note', label: 'Ghi Chú', render: item => item.note },
    {
      key: 'actions',
      label: 'Thao Tác',
      render: item => (
        <div style={{ textAlign: 'center' }}>
          <button data-category-row-action="edit" onClick={() => handleOpenForm(item)} style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', marginRight: '4px' }}>Sửa</button>
          <button onClick={() => handleDelete(item.id)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>Xóa</button>
        </div>
      )
    }
  ];
  const visibleCategoryColumns = activeTab === 'chikhac'
    ? categoryColumns.filter(column => column.key !== 'code')
    : categoryColumns;
  const categoryList = useMemo(() => [...(
    activeTab === 'hanghoa' ? products
      : activeTab === 'nguyenvatlieu' ? materials
        : activeTab === 'chiphi' ? expensesCat
          : activeTab === 'xe' ? [] : otherExpensesCat
  )].sort((first, second) =>
    first.name.localeCompare(second.name, 'vi', { sensitivity: 'base', numeric: true }) ||
    first.code.localeCompare(second.code, 'vi', { sensitivity: 'base', numeric: true })
  ), [activeTab, products, materials, expensesCat, otherExpensesCat]);

  const switchCategoryTab = (tab: typeof activeTab) => {
    setShowModal(false);
    setEditingId(null);
    setActiveTab(tab);
  };

  const handleCategoryVoiceNavigation = (action: 'next' | 'previous' | 'clear') => {
    if (action === 'clear') return 'Không có ô nhập liệu đang chọn trong danh sách.';
    const actions = Array.from(document.querySelectorAll<HTMLElement>(
      '[data-category-row-action="edit"], [data-category-row-action="vehicle-edit"]'
    ));
    if (!actions.length) return 'Danh sách hiện không có mục để điều hướng.';
    const currentIndex = actions.findIndex(actionElement => actionElement === document.activeElement);
    const nextIndex = action === 'next'
      ? currentIndex < 0 ? 0 : (currentIndex + 1) % actions.length
      : currentIndex < 1 ? actions.length - 1 : currentIndex - 1;
    actions[nextIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
    actions[nextIndex].focus();
    return `Đã chọn mục dòng ${nextIndex + 1} trong danh sách.`;
  };

  const handleCategoryVoiceTranscript = (transcript: string) => {
    const command = normalizeVoiceCommand(transcript);
    const parsed = parseVietnameseFormSpeech(transcript);

    if (/(?:them|tao).*(?:muc|danh muc)|them moi|them muc moi/i.test(command)) {
      handleOpenForm();
      return 'Đã mở form thêm mục mới.';
    }

    const tabMatch: Array<[typeof activeTab, string[]]> = [
      ['hanghoa', ['hang hoa', 'hàng hoá', 'mat hang', 'san pham']],
      ['nguyenvatlieu', ['nguyen vat lieu', 'nvl', 'vat lieu']],
      ['chiphi', ['chi phi']],
      ['xe', ['xe bon banh', 'xe 4 banh', 'xe']],
      ['chikhac', ['chi khac', 'chi khac']]
    ];
    const matchedTab = tabMatch.find(([, labels]) =>
      labels.some(label => command.includes(normalizeVoiceCommand(label)))
    );
    if (matchedTab) {
      switchCategoryTab(matchedTab[0]);
      return `Đã chuyển sang danh mục ${matchedTab[1][0]}.`;
    }

    const editOrdinal = /^sua\s*(?:dong|muc)\s*(\d+)$/iu.exec(command);
    if (editOrdinal) {
      const index = Number(editOrdinal[1]) - 1;
      const item = activeTab === 'xe'
        ? vehicles[index]
        : categoryList[index];
      if (item) {
        handleOpenForm(item);
        return `Đã mở sửa mục dòng ${index + 1}.`;
      }
      return 'Không tìm thấy dòng mục cần sửa.';
    }

    const editName = /^(?:sửa|sua)\s+(.+)$/iu.exec(transcript);
    if (editName) {
      const search = normalizeVoiceCommand(editName[1]);
      const item = activeTab === 'xe'
        ? vehicles.find(vehicle =>
          normalizeVoiceCommand(`${vehicle.vehicleName} ${vehicle.plateNo}`).includes(search))
        : categoryList.find(category =>
          normalizeVoiceCommand(`${category.code} ${category.name}`).includes(search));
      if (item) {
        handleOpenForm(item);
        return `Đã mở form sửa ${item && 'name' in item ? item.name : ('vehicleName' in item ? item.vehicleName : '')}.`;
      }
    }

    if (!showModal) {
      return 'Hãy nói “thêm mục mới” hoặc tên danh mục cần chuyển tab.';
    }

    if (/^(?:huy|dong)\s*(?:form|noi dung)?$|^(?:huy bo|thoat)$/iu.test(command)) {
      setShowModal(false);
      return 'Đã đóng form danh mục.';
    }

    const fieldValue = (labels: string[]) => extractSpokenFieldValue(transcript, labels);

    if (activeTab === 'xe') {
      const vehicleNameValue = fieldValue(['tên xe', 'ten xe']);
      if (vehicleNameValue) setVehicleName(vehicleNameValue);
      const modelValue = fieldValue(['đời xe', 'doi xe', 'năm sản xuất']);
      if (modelValue) setModelYear(modelValue);
      const plateValue = fieldValue(['biển số xe', 'bien so', 'biển số']);
      if (plateValue) setPlateNo(plateValue.toUpperCase());
      const insuranceValue = formatSpokenDate(transcript);
      if (/hạn bảo hiểm|han bao hiem|bảo hiểm|bao hiem/i.test(transcript) && insuranceValue) {
        setInsuranceExpiry(insuranceValue);
      }
      const registrationValue = formatSpokenDate(transcript);
      if (/hạn đăng kiểm|han dang kiem|đăng kiểm|dang kiem/i.test(transcript) && registrationValue) {
        setRegistrationExpiry(registrationValue);
      }
      const maintenanceValue = fieldValue(['định mức km', 'định mức km bảo dưỡng', 'km thay nhớt']);
      if (maintenanceValue) {
        const number = parseVietnameseNumber(maintenanceValue);
        if (number !== undefined) setMaintenanceIntervalKm(String(number));
      }
      const latestKmValue = fieldValue(['số km lần bảo dưỡng gần nhất', 'km gần nhất', 'km bảo dưỡng']);
      if (latestKmValue) {
        const number = parseVietnameseNumber(latestKmValue);
        if (number !== undefined) setLastOilChangeKm(number);
      }

      const filledVehicleFields = [
        vehicleNameValue ? 'Tên xe' : '',
        modelValue ? 'Đời xe' : '',
        plateValue ? 'Biển số xe' : '',
        /hạn bảo hiểm|han bao hiem/i.test(transcript) && insuranceValue ? 'Hạn bảo hiểm' : '',
        /hạn đăng kiểm|han dang kiem/i.test(transcript) && registrationValue ? 'Hạn đăng kiểm' : '',
        maintenanceValue ? 'Định mức km' : '',
        latestKmValue ? 'Km bảo dưỡng gần nhất' : ''
      ].filter(Boolean);
      return filledVehicleFields.length
        ? `Đã điền: ${filledVehicleFields.join(', ')}.`
        : 'Chưa nhận ra trường xe. Hãy nói tên xe, đời xe, biển số xe, hạn bảo hiểm hoặc định mức km.';
    }

    const codeValue = fieldValue(['mã danh mục', 'ma danh muc', 'mã']);
    if (codeValue && activeTab !== 'chikhac') setCode(codeValue.toUpperCase());
    const nameValue = fieldValue(['tên danh mục', 'ten danh muc', 'tên']);
    if (nameValue) setName(nameValue);
    const unitValue = fieldValue(['đơn vị tính mặc định', 'đơn vị tính', 'đơn vị', 'don vi']);
    if (unitValue) setUnit(unitValue);
    const noteValue = fieldValue(['ghi chú', 'ghi chu', 'lưu ý']);
    if (noteValue) setNote(noteValue);
    const lowStockValue = fieldValue(['hạn mức tồn kho tối thiểu', 'hạn mức tồn kho', 'tồn kho tối thiểu']);
    if (lowStockValue) {
      const number = parseVietnameseNumber(lowStockValue);
      if (number !== undefined) setLowStockLimit(String(number));
    }

    const filledFields: string[] = [];
    if (codeValue && activeTab !== 'chikhac') filledFields.push('Mã danh mục');
    if (nameValue) filledFields.push('Tên danh mục');
    if (unitValue) filledFields.push('Đơn vị');
    if (noteValue) filledFields.push('Ghi chú');
    if (lowStockValue) filledFields.push('Hạn mức tồn kho');

    if (activeTab === 'hanghoa') {
      const splitNorm = parseMaterialNormSpeech(transcript);
      const normValue = splitNorm.norm || fieldValue(['định mức trên sản phẩm', 'định mức mỗi sản phẩm', 'định mức sản phẩm', 'định mức']);
      const parsedNorm = normValue ? parseVietnameseNumber(normValue) : parsed.normPerUnit;
      const normUnitValue = splitNorm.unit || fieldValue(['đơn vị tính nguyên vật liệu', 'đơn vị nguyên vật liệu']);
      const materialValue = splitNorm.material || fieldValue(['nguyên vật liệu', 'nguyên phụ liệu']);
      if (normValue || normUnitValue || materialValue || parsed.normPerUnit !== undefined) {
        setMaterialNormRows(rows => {
          const index = rows.findIndex(row => !row.materialName.trim() || row === rows[0]) >= 0
            ? rows.findIndex(row => !row.materialName.trim())
            : 0;
          const targetIndex = index >= 0 ? index : 0;
          const current = rows[targetIndex] || {
            materialId: null,
            materialCode: '',
            materialName: '',
            query: '',
            unit: 'kg',
            normPerUnit: ''
          };
          let next = { ...current };

          if (materialValue) {
            const search = normalizeVoiceCommand(materialValue);
            const matched = materialNormOptions.find(material =>
              normalizeVoiceCommand(`${material.code || ''} ${material.name}`).includes(search) ||
              normalizeVoiceCommand(material.name).includes(search)
            );
            if (matched) {
              next = {
                ...next,
                materialId: matched.id,
                materialCode: matched.code,
                materialName: matched.name,
                query: `${matched.code ? `${matched.code} - ` : ''}${matched.name}`,
                unit: normUnitValue || matched.unit || next.unit
              };
            } else {
              next = { ...next, materialId: null, materialCode: '', materialName: materialValue, query: materialValue };
            }
          }
          if (normUnitValue) next.unit = normUnitValue;
          if (parsedNorm !== undefined) next.normPerUnit = String(parsedNorm);

          if (rows.length === 0) return [next];
          return rows.map((row, rowIndex) => rowIndex === targetIndex ? next : row);
        });
        if (normValue || parsed.normPerUnit !== undefined) filledFields.push('Định mức nguyên vật liệu');
        if (materialValue) filledFields.push('Nguyên vật liệu');
        if (normUnitValue) filledFields.push('Đơn vị nguyên vật liệu');
      }
    }

    return filledFields.length
      ? `Đã điền: ${filledFields.join(', ')}.`
      : 'Chưa nhận ra trường danh mục. Hãy nói rõ mã, tên, đơn vị, định mức hoặc ghi chú.';
  };

  return (
    <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>
          📑 Quản Lý Danh Mục (Hàng Hóa, NVL, Chi Phí, Xe 4 Bánh & Chi Khác)
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <VoiceFillControl
            onTranscript={handleCategoryVoiceTranscript}
            onNavigation={handleCategoryVoiceNavigation}
          />
          <button
            onClick={() => handleOpenForm()}
            style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
          >
            + Thêm Mục Mới
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button
          onClick={() => switchCategoryTab('hanghoa')}
          style={{ background: activeTab === 'hanghoa' ? '#2563eb' : '#f1f5f9', color: activeTab === 'hanghoa' ? '#fff' : '#334155', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
        >
          📦 Hàng Hóa ({products?.length || 0})
        </button>
        <button
          onClick={() => switchCategoryTab('nguyenvatlieu')}
          style={{ background: activeTab === 'nguyenvatlieu' ? '#2563eb' : '#f1f5f9', color: activeTab === 'nguyenvatlieu' ? '#fff' : '#334155', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
        >
          🌾 Nguyên Vật Liệu ({materials?.length || 0})
        </button>
        <button
          onClick={() => switchCategoryTab('chiphi')}
          style={{ background: activeTab === 'chiphi' ? '#2563eb' : '#f1f5f9', color: activeTab === 'chiphi' ? '#fff' : '#334155', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
        >
          💸 Chi Phí ({expensesCat?.length || 0})
        </button>
        <button
          onClick={() => switchCategoryTab('xe')}
          style={{ background: activeTab === 'xe' ? '#0284c7' : '#f1f5f9', color: activeTab === 'xe' ? '#fff' : '#334155', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
        >
          🚗 Xe 4 Bánh ({vehicles?.length || 0})
        </button>
        <button
          onClick={() => switchCategoryTab('chikhac')}
          style={{ background: activeTab === 'chikhac' ? '#2563eb' : '#f1f5f9', color: activeTab === 'chikhac' ? '#fff' : '#334155', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
        >
          🧾 Chi Khác ({otherExpensesCat?.length || 0})
        </button>
      </div>

      {/* Form Modal */}
      {showModal && (
        <form onSubmit={handleSave} style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #cbd5e1' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#1e293b' }}>
            {editingId ? '✏️ Chỉnh Sửa' : '➕ Thêm Mới'} {activeTab === 'xe' ? 'Xe 4 Bánh' : 'Danh Mục'}
          </h3>
          <div style={{ marginBottom: '12px' }}>
            <VoiceFillControl onTranscript={handleCategoryVoiceTranscript} />
          </div>

          {activeTab === 'xe' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Tên Xe:</label>
                <input aria-label="Tên xe" type="text" required placeholder="VD: Xe Tải Isuzu..." value={vehicleName} onChange={e => setVehicleName(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Đời Xe:</label>
                <input aria-label="Đời xe" type="text" placeholder="VD: 2022..." value={modelYear} onChange={e => setModelYear(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Biển Số Xe:</label>
                <input aria-label="Biển số xe" type="text" required placeholder="VD: 66A-123.45..." value={plateNo} onChange={e => setPlateNo(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 'bold' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Hạn Bảo Hiểm:</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '6px' }}>
                  <input aria-label="Hạn bảo hiểm" type="text" inputMode="numeric" required placeholder="DD/MM/YYYY" value={insuranceExpiry} onChange={e => setInsuranceExpiry(formatVehicleDateInput(e.target.value))} aria-invalid={Boolean(insuranceExpiryError)} style={{ width: '100%', minWidth: 0, padding: '8px', boxSizing: 'border-box', borderRadius: '4px', border: `1px solid ${insuranceExpiryError ? '#dc2626' : '#cbd5e1'}`, fontSize: '12px' }} />
                  <input type="date" aria-label="Chọn ngày hết hạn bảo hiểm" value={parsedInsuranceExpiry || ''} onChange={e => setInsuranceExpiry(formatVehicleDate(e.target.value))} style={{ width: '36px', padding: '5px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                </div>
                <small style={{ display: 'block', marginTop: '4px', color: '#64748b' }}>Nhập DDMMYYYY, hệ thống tự thêm dấu /. Ngày phải từ hôm nay trở đi.</small>
                {insuranceExpiryError && <small role="alert" style={{ display: 'block', marginTop: '4px', color: '#b91c1c', fontWeight: 700 }}>{insuranceExpiryError}</small>}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Hạn Đăng Kiểm:</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '6px' }}>
                  <input aria-label="Hạn đăng kiểm" type="text" inputMode="numeric" required placeholder="DD/MM/YYYY" value={registrationExpiry} onChange={e => setRegistrationExpiry(formatVehicleDateInput(e.target.value))} aria-invalid={Boolean(registrationExpiryError)} style={{ width: '100%', minWidth: 0, padding: '8px', boxSizing: 'border-box', borderRadius: '4px', border: `1px solid ${registrationExpiryError ? '#dc2626' : '#cbd5e1'}`, fontSize: '12px' }} />
                  <input type="date" aria-label="Chọn ngày hết hạn đăng kiểm" value={parsedRegistrationExpiry || ''} onChange={e => setRegistrationExpiry(formatVehicleDate(e.target.value))} style={{ width: '36px', padding: '5px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                </div>
                <small style={{ display: 'block', marginTop: '4px', color: '#64748b' }}>Nhập DDMMYYYY, hệ thống tự thêm dấu /. Ngày phải từ hôm nay trở đi.</small>
                {registrationExpiryError && <small role="alert" style={{ display: 'block', marginTop: '4px', color: '#b91c1c', fontWeight: 700 }}>{registrationExpiryError}</small>}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Định Mức Km Thay Nhớt / Bảo Dưỡng:</label>
                <input aria-label="Định mức km bảo dưỡng" type="number" min="1" step="1" placeholder="Ví dụ: 5000" value={maintenanceIntervalKm} onChange={e => setMaintenanceIntervalKm(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Số Km Lần Bảo Dưỡng Gần Nhất:</label>
                <input aria-label="Số km lần bảo dưỡng gần nhất" type="number" min="0" step="any" value={lastOilChangeKm} onChange={e => setLastOilChangeKm(Number(e.target.value) || 0)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
              </div>
            </div>
          ) : (
            <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '12px' }}>
              {activeTab !== 'chikhac' && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Mã Danh Mục:</label>
                  <input aria-label="Mã danh mục" type="text" required placeholder="VD: HH-001..." value={code} onChange={e => setCode(e.target.value)} autoCorrect="off" autoCapitalize="off" spellCheck={false} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Tên Danh Mục:</label>
                <input aria-label="Tên danh mục" type="text" required placeholder="Nhập tên..." value={name} onChange={e => setName(e.target.value)} autoCorrect="off" autoCapitalize="off" spellCheck={false} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
              </div>
              {activeTab === 'nguyenvatlieu' && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Hạn Mức Tồn Kho Tối Thiểu:</label>
                  <input
                    aria-label="Hạn mức tồn kho tối thiểu"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Nhập số lượng tối thiểu..."
                    value={lowStockLimit}
                    onChange={event => setLowStockLimit(event.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                  />
                </div>
              )}
              {activeTab !== 'chikhac' && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Đơn Vị Tính Mặc Định:</label>
                  <input
                    aria-label="Đơn vị tính mặc định"
                    type="text"
                    list="category-unit-options"
                    placeholder="VD: kg, cái, bộ..."
                    value={unit}
                    onChange={event => setUnit(event.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                  />
                  <datalist id="category-unit-options">
                    {['cái', 'bộ', 'kg', 'lít', 'lọn', 'con', 'cuộn', 'chiếc', 'mét', 'tấm', 'thùng', 'bao', 'chai', 'hộp'].map(option => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Ghi Chú:</label>
                <input aria-label="Ghi chú" type="text" placeholder="Nhập ghi chú..." value={note} onChange={e => setNote(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
              </div>
            </div>
            {activeTab === 'hanghoa' && (
              <section style={{ background: '#fff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ color: '#1d4ed8', fontSize: '13px' }}>Định mức nguyên phụ liệu / 1 sản phẩm</strong>
                  <button type="button" onClick={() => setMaterialNormRows(rows => [...rows, { materialId: null, materialCode: '', materialName: '', query: '', unit: 'kg', normPerUnit: '' }])} style={{ border: 0, borderRadius: '5px', background: '#2563eb', color: '#fff', padding: '7px 10px', fontWeight: 'bold', cursor: 'pointer' }}>+ Thêm nguyên vật liệu</button>
                </div>
                {materialNormRows.map((row, rowIndex) => {
                  const suggestions = materialNormOptions.filter(material =>
                    `${material.code} ${material.name}`.toLowerCase().includes(row.query.trim().toLowerCase())
                  ).slice(0, 12);
                  return (
                    <div key={`${rowIndex}-${row.materialCode}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 2fr) minmax(100px, .7fr) minmax(140px, .8fr) 42px', gap: '8px', marginTop: '8px' }}>
                      <div style={{ position: 'relative' }}>
                        <input aria-label="Nguyên vật liệu" data-category-norm-row={rowIndex} type="search" list={`material-norm-options-${rowIndex}`} value={row.query} placeholder="Chọn hoặc nhập nguyên vật liệu..." onChange={event => setMaterialNormRows(rows => rows.map((item, index) => index === rowIndex ? { ...item, query: event.target.value, materialName: event.target.value, materialId: null, materialCode: '' } : item))} style={{ width: '100%', padding: '8px', border: '1px solid #94a3b8', borderRadius: '5px', boxSizing: 'border-box' }} />
                        {suggestions.length > 0 && (
                          <datalist id={`material-norm-options-${rowIndex}`}>
                            {suggestions.map(material => <option key={material.id} value={`${material.code ? `${material.code} - ` : ''}${material.name}`} />)}
                          </datalist>
                        )}
                        {row.query && suggestions.length > 0 && (
                          <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', background: '#fff', border: '1px solid #94a3b8', borderRadius: '5px', maxHeight: '150px', overflowY: 'auto' }}>
                            {suggestions.map(material => (
                              <button type="button" key={material.id} onMouseDown={event => event.preventDefault()} onClick={() => setMaterialNormRows(rows => rows.map((item, index) => index === rowIndex ? { ...item, materialId: material.id, materialCode: material.code, materialName: material.name, query: `${material.code ? `${material.code} - ` : ''}${material.name}`, unit: material.unit || item.unit } : item))} style={{ width: '100%', display: 'block', border: 0, borderBottom: '1px solid #e2e8f0', background: '#fff', padding: '8px', textAlign: 'left', cursor: 'pointer' }}>{material.name}{material.unit ? ` · ${material.unit}` : ''}</button>
                            ))}
                          </div>
                        )}
                      </div>
                      <select aria-label="Đơn vị nguyên vật liệu" value={row.unit} onChange={event => setMaterialNormRows(rows => rows.map((item, index) => index === rowIndex ? { ...item, unit: event.target.value } : item))} style={{ width: '100%', padding: '8px', border: '1px solid #94a3b8', borderRadius: '5px' }}>
                        {[...new Set(['kg', 'lọn', 'bó', 'cái', 'mét', 'cuộn', 'tấm', 'thùng', 'bao', ...materialNormOptions.map(item => item.unit).filter(Boolean), row.unit].filter(Boolean))].map(option => <option key={String(option)} value={String(option)}>{String(option)}</option>)}
                      </select>
                      <input aria-label="Định mức nguyên vật liệu" type="text" inputMode="decimal" value={row.normPerUnit} onChange={event => setMaterialNormRows(rows => rows.map((item, index) => index === rowIndex ? { ...item, normPerUnit: event.target.value } : item))} placeholder="VD: 0.7" style={{ width: '100%', padding: '8px', border: '1px solid #94a3b8', borderRadius: '5px', boxSizing: 'border-box' }} />
                      <button type="button" aria-label="Xóa dòng nguyên vật liệu" onClick={() => setMaterialNormRows(rows => rows.filter((_item, index) => index !== rowIndex))} style={{ border: 0, borderRadius: '5px', background: '#fee2e2', color: '#b91c1c', fontSize: '17px', fontWeight: 'bold', cursor: 'pointer' }}>−</button>
                    </div>
                  );
                })}
                {materialNormRows.length === 0 && <small style={{ color: '#64748b' }}>Chưa cấu hình nguyên phụ liệu cho mã hàng này.</small>}
              </section>
            )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" disabled={activeTab === 'xe' && hasInvalidVehicleExpiry} style={{ background: activeTab === 'xe' && hasInvalidVehicleExpiry ? '#94a3b8' : '#16a34a', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: activeTab === 'xe' && hasInvalidVehicleExpiry ? 'not-allowed' : 'pointer' }}>💾 Lưu Lại</button>
            <button type="button" onClick={() => setShowModal(false)} style={{ background: '#64748b', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>Hủy</button>
          </div>
        </form>
      )}

      {/* Bảng hiển thị Xe 4 bánh */}
      {activeTab === 'xe' ? (
        <div className="w-full overflow-x-auto -webkit-overflow-scrolling-touch my-3 shadow-sm rounded-lg border border-gray-100 erp-table-scroll" style={{  }}>
          <table style={{ borderCollapse: 'collapse', fontFamily: 'inherit' }} className="min-w-[800px] divide-y divide-gray-200 text-sm">
            <thead>
              <tr style={{ background: '#f1f5f9', textAlign: 'left', color: '#334155' }}>
                <th className="whitespace-nowrap" style={{ padding: '10px' }}>STT</th>
                <th className="whitespace-nowrap" style={{ padding: '10px' }}>Tên Xe</th>
                <th className="whitespace-nowrap" style={{ padding: '10px' }}>Đời Xe</th>
                <th className="whitespace-nowrap" style={{ padding: '10px' }}>Biển Số</th>
                <th className="whitespace-nowrap" style={{ padding: '10px' }}>Bảo Hiểm (Ngày Hết Hạn)</th>
                <th className="whitespace-nowrap" style={{ padding: '10px' }}>Giấy Đăng Kiểm (Ngày Hết Hạn)</th>
                <th className="whitespace-nowrap" style={{ padding: '10px', whiteSpace: 'nowrap' }}>Định Mức Bảo Dưỡng</th>
                <th className="whitespace-nowrap" style={{ padding: '10px' }}>Bảo Dưỡng</th>
                <th className="whitespace-nowrap" style={{ padding: '10px', textAlign: 'center' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {vehicles && vehicles.length > 0 ? (
                vehicles.map((v, idx) => {
                  const insuranceExpiredDate = parseVehicleDate(formatVehicleDate(v.insuranceExpiry));
                  const registrationExpiredDate = parseVehicleDate(formatVehicleDate(v.registrationExpiry));
                  const maintenanceHistory = Array.isArray(v.maintenanceHistory)
                    ? v.maintenanceHistory.filter(record =>
                      record !== null &&
                      typeof record === 'object' &&
                      typeof record.date === 'string' &&
                      Number.isFinite(Number(record.odometerKm))
                    )
                    : [];
                  const hasExpiredDocument = Boolean(
                    (insuranceExpiredDate && insuranceExpiredDate < todayISODate) ||
                    (registrationExpiredDate && registrationExpiredDate < todayISODate)
                  );
                  return (
                  <tr key={v.id} style={{ borderBottom: '1px solid #f8fafc', background: hasExpiredDocument ? '#fef2f2' : idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td className="whitespace-nowrap" style={{ padding: '10px', fontWeight: 'bold' }}>{idx + 1}</td>
                    <td className="whitespace-nowrap" style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{v.vehicleName}</td>
                    <td className="whitespace-nowrap" style={{ padding: '10px' }}>{v.modelYear}</td>
                    <td className="whitespace-nowrap" style={{ padding: '10px', fontWeight: 'bold', color: '#2563eb' }}>{v.plateNo}</td>
                    <td className="whitespace-nowrap" style={{ padding: '10px', color: insuranceExpiredDate && insuranceExpiredDate < todayISODate ? '#b91c1c' : undefined, fontWeight: insuranceExpiredDate && insuranceExpiredDate < todayISODate ? 800 : undefined }}>
                      {formatVehicleDate(v.insuranceExpiry) || 'Chưa cập nhật'}
                      {insuranceExpiredDate && insuranceExpiredDate < todayISODate && <strong style={{ display: 'block' }}>Đã quá hạn</strong>}
                    </td>
                    <td className="whitespace-nowrap" style={{ padding: '10px', color: registrationExpiredDate && registrationExpiredDate < todayISODate ? '#b91c1c' : '#dc2626', fontWeight: 700 }}>
                      {formatVehicleDate(v.registrationExpiry) || 'Chưa cập nhật'}
                      {registrationExpiredDate && registrationExpiredDate < todayISODate && <strong style={{ display: 'block' }}>Đã quá hạn</strong>}
                    </td>
                    <td className="whitespace-nowrap" style={{ padding: '10px', fontWeight: 800, color: Number(v.maintenanceIntervalKm) > 0 ? '#1d4ed8' : '#64748b', whiteSpace: 'nowrap' }}>
                      {Number(v.maintenanceIntervalKm) > 0
                        ? `${Number(v.maintenanceIntervalKm).toLocaleString('vi-VN')} km`
                        : 'Chưa cấu hình'}
                    </td>
                    <td className="whitespace-nowrap" style={{ padding: '10px' }}>
                      <div>Hiện tại: {Number(v.currentKm || 0).toLocaleString('vi-VN')} km</div>
                      <div>Mốc: {Number(v.lastOilChangeKm || 0).toLocaleString('vi-VN')} + {Number(v.maintenanceIntervalKm || 0).toLocaleString('vi-VN')} km</div>
                      {maintenanceHistory.length ? (
                        <details style={{ marginTop: '4px', color: '#475569' }}>
                          <summary style={{ cursor: 'pointer' }}>
                            Lịch sử bảo dưỡng ({maintenanceHistory.length})
                          </summary>
                          <div style={{ display: 'grid', gap: '3px', marginTop: '4px' }}>
                            {maintenanceHistory.slice().reverse().map(record => (
                              <small key={record.id}>{record.date} · {Number(record.odometerKm).toLocaleString('vi-VN')} km</small>
                            ))}
                          </div>
                        </details>
                      ) : <small style={{ color: '#64748b' }}>Chưa có lịch sử</small>}
                      <button type="button" onClick={() => handleRecordMaintenance(v)} style={{ display: 'block', marginTop: '6px', padding: '5px 8px', border: 0, borderRadius: '5px', background: '#059669', color: '#fff', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                        Đã thay & sửa chữa
                      </button>
                    </td>
                    <td className="whitespace-nowrap" style={{ padding: '10px', textAlign: 'center' }}>
                      <button data-category-row-action="vehicle-edit" onClick={() => handleOpenForm(v)} style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', marginRight: '4px' }}>Sửa</button>
                      <button onClick={() => handleDelete(v.id)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>Xóa</button>
                    </td>
                  </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="whitespace-nowrap" colSpan={9} style={{ padding: '12px', textAlign: 'center', color: '#64748b' }}>Chưa có xe nào được thêm</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Bảng hiển thị Hàng hóa / NVL / Chi phí */
        <div className="w-full overflow-x-auto -webkit-overflow-scrolling-touch my-3 shadow-sm rounded-lg border border-gray-100 erp-table-scroll" style={{  }}>
          <table style={{ borderCollapse: 'collapse', fontFamily: 'inherit' }} className="min-w-[800px] divide-y divide-gray-200 text-sm">
            <thead>
              <tr style={{ background: '#f1f5f9', textAlign: 'left', color: '#334155' }}>
                {activeTab === 'nguyenvatlieu' ? (
                  <>
                    <th className="whitespace-nowrap" style={{ padding: '10px', whiteSpace: 'nowrap' }}>STT</th>
                    <th className="whitespace-nowrap" style={{ padding: '10px', whiteSpace: 'nowrap' }}>Mã Danh Mục</th>
                    <th className="whitespace-nowrap" style={{ padding: '10px', whiteSpace: 'nowrap' }}>Tên Danh Mục</th>
                    <th className="whitespace-nowrap" style={{ padding: '10px', textAlign: 'right', whiteSpace: 'nowrap' }}>Hạn Mức Tồn Kho</th>
                    <th className="whitespace-nowrap" style={{ padding: '10px', whiteSpace: 'nowrap' }}>Ghi Chú</th>
                    <th className="whitespace-nowrap" style={{ padding: '10px', textAlign: 'center', whiteSpace: 'nowrap' }}>Thao Tác</th>
                  </>
                ) : visibleCategoryColumns.map(column => (
                  <th className="whitespace-nowrap" key={column.key} style={{ padding: '10px', textAlign: column.key === 'actions' ? 'center' : 'left', whiteSpace: 'nowrap' }}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categoryList.length > 0 ? (
                categoryList.map((item, idx) => (
                  activeTab === 'nguyenvatlieu' ? (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f8fafc', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td className="whitespace-nowrap" style={{ padding: '10px', fontWeight: 'bold', verticalAlign: 'middle' }}>{idx + 1}</td>
                      <td className="whitespace-nowrap" style={{ padding: '10px', fontWeight: 'bold', color: '#2563eb', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>{item.code}</td>
                      <td className="whitespace-nowrap" style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>{item.name}</td>
                      <td className="whitespace-nowrap" style={{ padding: '10px', textAlign: 'right', verticalAlign: 'middle' }}>
                        {Number(item.lowStockLimit) > 0
                          ? `${Number(item.lowStockLimit).toLocaleString('vi-VN')} ${item.unit || ''}`.trim()
                          : '—'}
                      </td>
                      <td className="whitespace-nowrap" style={{ padding: '10px', color: '#64748b', verticalAlign: 'middle' }}>{item.note}</td>
                      <td className="whitespace-nowrap" style={{ padding: '10px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <button data-category-row-action="edit" onClick={() => handleOpenForm(item)} style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', marginRight: '4px' }}>Sửa</button>
                        <button onClick={() => handleDelete(item.id)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>Xóa</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f8fafc', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                      {visibleCategoryColumns.map(column => (
                        <td className="whitespace-nowrap"
                          key={column.key}
                          style={{
                            padding: '10px',
                            verticalAlign: 'middle',
                            textAlign: column.key === 'actions' ? 'center' : column.key === 'lowStockLimit' ? 'right' : 'left',
                            fontWeight: column.key === 'stt' || column.key === 'code' || column.key === 'name' ? 'bold' : 'normal',
                            color: column.key === 'code' ? '#2563eb' : column.key === 'name' ? '#0f172a' : column.key === 'note' ? '#64748b' : undefined
                          }}
                        >
                          {column.render(item, idx)}
                        </td>
                      ))}
                    </tr>
                  )
                ))
              ) : (
                  <tr>
                    <td className="whitespace-nowrap" colSpan={activeTab === 'nguyenvatlieu' ? 6 : visibleCategoryColumns.length} style={{ padding: '12px', textAlign: 'center', color: '#64748b' }}>Chưa có danh mục nào được thêm</td>
                  </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}