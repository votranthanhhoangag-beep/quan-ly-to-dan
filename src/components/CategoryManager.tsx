import { useState, type ReactNode } from 'react';
import { useApp, type CategoryItem, type VehicleCategoryItem } from '../context/AppContext';
import { formatVehicleExpiryDate as formatVehicleDate } from '../utils/vehicleExpiry';
import { recordVehicleMaintenance } from '../utils/vehicleMaintenance';

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

export default function CategoryManager() {
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
    deleteVehicle
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
      }
    } else {
      setEditingId(null);
      setCode('');
      setName('');
      setUnit('');
      setNote('');
      setLowStockLimit('');
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
      const itemId = editingId || Date.now();
      const catItem: CategoryItem = {
        id: itemId,
        code: activeTab === 'chikhac' && !editingId ? `CHIKHAC-${itemId}` : code,
        name,
        unit: activeTab === 'chikhac' ? '' : unit.trim(),
        note,
        ...(activeTab === 'nguyenvatlieu' ? { lowStockLimit: minimumStock } : {})
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

  const handleDelete = (id: number) => {
    if (!window.confirm('❓ Bạn có chắc chắn muốn xóa mục này không?')) return;
    if (activeTab === 'hanghoa') deleteProduct(id);
    else if (activeTab === 'nguyenvatlieu') deleteMaterial(id);
    else if (activeTab === 'chiphi') deleteExpenseCat(id);
    else if (activeTab === 'xe') deleteVehicle(id);
    else if (activeTab === 'chikhac') deleteOtherExpenseCat(id);
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
    { key: 'note', label: 'Ghi Chú', render: item => item.note },
    {
      key: 'actions',
      label: 'Thao Tác',
      render: item => (
        <div style={{ textAlign: 'center' }}>
          <button onClick={() => handleOpenForm(item)} style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', marginRight: '4px' }}>Sửa</button>
          <button onClick={() => handleDelete(item.id)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>Xóa</button>
        </div>
      )
    }
  ];
  const visibleCategoryColumns = activeTab === 'chikhac'
    ? categoryColumns.filter(column => column.key !== 'code')
    : categoryColumns;
  const categoryList = [...(
    activeTab === 'hanghoa' ? products
      : activeTab === 'nguyenvatlieu' ? materials
        : activeTab === 'chiphi' ? expensesCat
          : otherExpensesCat
  )]
    .sort((first, second) =>
      first.name.localeCompare(second.name, 'vi', { sensitivity: 'base', numeric: true }) ||
      first.code.localeCompare(second.code, 'vi', { sensitivity: 'base', numeric: true })
    );

  return (
    <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>
          📑 Quản Lý Danh Mục (Hàng Hóa, NVL, Chi Phí, Xe 4 Bánh & Chi Khác)
        </h2>
        <button
          onClick={() => handleOpenForm()}
          style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
        >
          + Thêm Mục Mới
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('hanghoa')}
          style={{ background: activeTab === 'hanghoa' ? '#2563eb' : '#f1f5f9', color: activeTab === 'hanghoa' ? '#fff' : '#334155', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
        >
          📦 Hàng Hóa ({products?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('nguyenvatlieu')}
          style={{ background: activeTab === 'nguyenvatlieu' ? '#2563eb' : '#f1f5f9', color: activeTab === 'nguyenvatlieu' ? '#fff' : '#334155', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
        >
          🌾 Nguyên Vật Liệu ({materials?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('chiphi')}
          style={{ background: activeTab === 'chiphi' ? '#2563eb' : '#f1f5f9', color: activeTab === 'chiphi' ? '#fff' : '#334155', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
        >
          💸 Chi Phí ({expensesCat?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('xe')}
          style={{ background: activeTab === 'xe' ? '#0284c7' : '#f1f5f9', color: activeTab === 'xe' ? '#fff' : '#334155', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
        >
          🚗 Xe 4 Bánh ({vehicles?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('chikhac')}
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

          {activeTab === 'xe' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Tên Xe:</label>
                <input type="text" required placeholder="VD: Xe Tải Isuzu..." value={vehicleName} onChange={e => setVehicleName(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Đời Xe:</label>
                <input type="text" placeholder="VD: 2022..." value={modelYear} onChange={e => setModelYear(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Biển Số Xe:</label>
                <input type="text" required placeholder="VD: 66A-123.45..." value={plateNo} onChange={e => setPlateNo(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 'bold' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Hạn Bảo Hiểm:</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '6px' }}>
                  <input type="text" inputMode="numeric" required placeholder="DD/MM/YYYY" value={insuranceExpiry} onChange={e => setInsuranceExpiry(formatVehicleDateInput(e.target.value))} aria-invalid={Boolean(insuranceExpiryError)} style={{ width: '100%', minWidth: 0, padding: '8px', boxSizing: 'border-box', borderRadius: '4px', border: `1px solid ${insuranceExpiryError ? '#dc2626' : '#cbd5e1'}`, fontSize: '12px' }} />
                  <input type="date" aria-label="Chọn ngày hết hạn bảo hiểm" value={parsedInsuranceExpiry || ''} onChange={e => setInsuranceExpiry(formatVehicleDate(e.target.value))} style={{ width: '36px', padding: '5px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                </div>
                <small style={{ display: 'block', marginTop: '4px', color: '#64748b' }}>Nhập DDMMYYYY, hệ thống tự thêm dấu /. Ngày phải từ hôm nay trở đi.</small>
                {insuranceExpiryError && <small role="alert" style={{ display: 'block', marginTop: '4px', color: '#b91c1c', fontWeight: 700 }}>{insuranceExpiryError}</small>}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Hạn Đăng Kiểm:</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '6px' }}>
                  <input type="text" inputMode="numeric" required placeholder="DD/MM/YYYY" value={registrationExpiry} onChange={e => setRegistrationExpiry(formatVehicleDateInput(e.target.value))} aria-invalid={Boolean(registrationExpiryError)} style={{ width: '100%', minWidth: 0, padding: '8px', boxSizing: 'border-box', borderRadius: '4px', border: `1px solid ${registrationExpiryError ? '#dc2626' : '#cbd5e1'}`, fontSize: '12px' }} />
                  <input type="date" aria-label="Chọn ngày hết hạn đăng kiểm" value={parsedRegistrationExpiry || ''} onChange={e => setRegistrationExpiry(formatVehicleDate(e.target.value))} style={{ width: '36px', padding: '5px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                </div>
                <small style={{ display: 'block', marginTop: '4px', color: '#64748b' }}>Nhập DDMMYYYY, hệ thống tự thêm dấu /. Ngày phải từ hôm nay trở đi.</small>
                {registrationExpiryError && <small role="alert" style={{ display: 'block', marginTop: '4px', color: '#b91c1c', fontWeight: 700 }}>{registrationExpiryError}</small>}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Định Mức Km Thay Nhớt / Bảo Dưỡng:</label>
                <input type="number" min="1" step="1" placeholder="Ví dụ: 5000" value={maintenanceIntervalKm} onChange={e => setMaintenanceIntervalKm(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Số Km Lần Bảo Dưỡng Gần Nhất:</label>
                <input type="number" min="0" step="any" value={lastOilChangeKm} onChange={e => setLastOilChangeKm(Number(e.target.value) || 0)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '12px' }}>
              {activeTab !== 'chikhac' && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Mã Danh Mục:</label>
                  <input type="text" required placeholder="VD: HH-001..." value={code} onChange={e => setCode(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Tên Danh Mục:</label>
                <input type="text" required placeholder="Nhập tên..." value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
              </div>
              {activeTab === 'nguyenvatlieu' && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Hạn Mức Tồn Kho Tối Thiểu:</label>
                  <input
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
                <input type="text" placeholder="Nhập ghi chú..." value={note} onChange={e => setNote(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
              </div>
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
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', textAlign: 'left', color: '#334155' }}>
                <th style={{ padding: '10px' }}>STT</th>
                <th style={{ padding: '10px' }}>Tên Xe</th>
                <th style={{ padding: '10px' }}>Đời Xe</th>
                <th style={{ padding: '10px' }}>Biển Số</th>
                <th style={{ padding: '10px' }}>Bảo Hiểm (Ngày Hết Hạn)</th>
                <th style={{ padding: '10px' }}>Giấy Đăng Kiểm (Ngày Hết Hạn)</th>
                <th style={{ padding: '10px', whiteSpace: 'nowrap' }}>Định Mức Bảo Dưỡng</th>
                <th style={{ padding: '10px' }}>Bảo Dưỡng</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Thao Tác</th>
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
                    <td style={{ padding: '10px', fontWeight: 'bold' }}>{idx + 1}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{v.vehicleName}</td>
                    <td style={{ padding: '10px' }}>{v.modelYear}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: '#2563eb' }}>{v.plateNo}</td>
                    <td style={{ padding: '10px', color: insuranceExpiredDate && insuranceExpiredDate < todayISODate ? '#b91c1c' : undefined, fontWeight: insuranceExpiredDate && insuranceExpiredDate < todayISODate ? 800 : undefined }}>
                      {formatVehicleDate(v.insuranceExpiry) || 'Chưa cập nhật'}
                      {insuranceExpiredDate && insuranceExpiredDate < todayISODate && <strong style={{ display: 'block' }}>Đã quá hạn</strong>}
                    </td>
                    <td style={{ padding: '10px', color: registrationExpiredDate && registrationExpiredDate < todayISODate ? '#b91c1c' : '#dc2626', fontWeight: 700 }}>
                      {formatVehicleDate(v.registrationExpiry) || 'Chưa cập nhật'}
                      {registrationExpiredDate && registrationExpiredDate < todayISODate && <strong style={{ display: 'block' }}>Đã quá hạn</strong>}
                    </td>
                    <td style={{ padding: '10px', fontWeight: 800, color: Number(v.maintenanceIntervalKm) > 0 ? '#1d4ed8' : '#64748b', whiteSpace: 'nowrap' }}>
                      {Number(v.maintenanceIntervalKm) > 0
                        ? `${Number(v.maintenanceIntervalKm).toLocaleString('vi-VN')} km`
                        : 'Chưa cấu hình'}
                    </td>
                    <td style={{ padding: '10px', minWidth: '180px' }}>
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
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <button onClick={() => handleOpenForm(v)} style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', marginRight: '4px' }}>Sửa</button>
                      <button onClick={() => handleDelete(v.id)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>Xóa</button>
                    </td>
                  </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} style={{ padding: '12px', textAlign: 'center', color: '#64748b' }}>Chưa có xe nào được thêm</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Bảng hiển thị Hàng hóa / NVL / Chi phí */
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', textAlign: 'left', color: '#334155' }}>
                {activeTab === 'nguyenvatlieu' ? (
                  <>
                    <th style={{ padding: '10px' }}>STT</th>
                    <th style={{ padding: '10px' }}>Mã Danh Mục</th>
                    <th style={{ padding: '10px' }}>Tên Danh Mục</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Hạn Mức Tồn Kho</th>
                    <th style={{ padding: '10px' }}>Ghi Chú</th>
                    <th style={{ padding: '10px', textAlign: 'center' }}>Thao Tác</th>
                  </>
                ) : visibleCategoryColumns.map(column => (
                  <th key={column.key} style={{ padding: '10px', textAlign: column.key === 'actions' ? 'center' : 'left' }}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categoryList.length > 0 ? (
                categoryList.map((item, idx) => (
                  activeTab === 'nguyenvatlieu' ? (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f8fafc', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '10px', fontWeight: 'bold' }}>{idx + 1}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#2563eb' }}>{item.code}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{item.name}</td>
                      <td style={{ padding: '10px', textAlign: 'right' }}>
                        {Number(item.lowStockLimit) > 0
                          ? `${Number(item.lowStockLimit).toLocaleString('vi-VN')} ${item.unit || ''}`.trim()
                          : '—'}
                      </td>
                      <td style={{ padding: '10px', color: '#64748b' }}>{item.note}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <button onClick={() => handleOpenForm(item)} style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', marginRight: '4px' }}>Sửa</button>
                        <button onClick={() => handleDelete(item.id)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>Xóa</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f8fafc', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                      {visibleCategoryColumns.map(column => (
                        <td
                          key={column.key}
                          style={{
                            padding: '10px',
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
                    <td colSpan={activeTab === 'nguyenvatlieu' ? 6 : visibleCategoryColumns.length} style={{ padding: '12px', textAlign: 'center', color: '#64748b' }}>Chưa có danh mục nào được thêm</td>
                  </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}