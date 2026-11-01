import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useApp, type MileageLog, type VehicleCategoryItem } from '../context/AppContext';
import { getVehicleMaintenanceWarnings, recordVehicleMaintenance } from '../utils/vehicleMaintenance';

const getLocalDate = (date = new Date()) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

const shiftMonth = (month: string, offset: number) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const shifted = new Date(year, monthNumber - 1 + offset, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
};

const formatNumber = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const formatDate = (value: string | undefined) => {
  if (!value) return '—';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '—';
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return '—';
  return date.toLocaleDateString('vi-VN');
};

const formatLegacyMonth = (value: string | undefined) => {
  const match = value?.match(/^(\d{1,2})\/(\d{4})$/);
  return match ? `${match[1].padStart(2, '0')}/${match[2]}` : '—';
};

const readCompressedImage = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Không thể đọc ảnh công tơ mét.'));
  reader.onload = () => {
    if (typeof reader.result !== 'string') {
      reject(new Error('Dữ liệu ảnh công tơ mét không hợp lệ.'));
      return;
    }
    const image = new Image();
    image.onerror = () => reject(new Error('Tệp đã chọn không phải ảnh hợp lệ.'));
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Trình duyệt không hỗ trợ xử lý ảnh.'));
        return;
      }
      for (const maxDimension of [1280, 960, 640, 480, 320]) {
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.72, 0.55, 0.35]) {
          const compressed = canvas.toDataURL('image/jpeg', quality);
          if (compressed.length <= 40000) {
            resolve(compressed);
            return;
          }
        }
      }
      reject(new Error('Ảnh công tơ mét quá lớn. Vui lòng chụp lại ảnh rõ và gọn hơn.'));
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box' as const,
  padding: '9px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  backgroundColor: '#fff',
  color: '#1e293b'
};

export default function VehicleFleetManager() {
  const { vehicles, mileageLogs, addMileageLog, updateMileageLog, deleteMileageLog, updateVehicle } = useApp();
  const safeVehicles = useMemo(() => (Array.isArray(vehicles) ? vehicles : []).filter(
    (vehicle): vehicle is VehicleCategoryItem =>
      vehicle !== null && typeof vehicle === 'object' && typeof vehicle.plateNo === 'string'
  ), [vehicles]);
  const safeMileageLogs = useMemo(() => (Array.isArray(mileageLogs) ? mileageLogs : [])
    .filter((log): log is MileageLog =>
      log !== null &&
      typeof log === 'object' &&
      typeof log.plateNo === 'string' &&
      (log.date === undefined || typeof log.date === 'string')
    )
    .map(log => ({
      ...log,
      images: Array.isArray(log.images)
        ? log.images.filter((image): image is string => typeof image === 'string')
        : []
    })), [mileageLogs]);
  const today = getLocalDate();
  const [selectedPlate, setSelectedPlate] = useState(safeVehicles[0]?.plateNo || '');
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [startKm, setStartKm] = useState('');
  const [startKmEdited, setStartKmEdited] = useState(false);
  const [endKm, setEndKm] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [maintenanceIntervalKm, setMaintenanceIntervalKm] = useState('');
  const [lastMaintenanceKm, setLastMaintenanceKm] = useState('');
  const [maintenanceDraftPlate, setMaintenanceDraftPlate] = useState('');
  const [maintenanceStatus, setMaintenanceStatus] = useState('');
  const [error, setError] = useState('');
  const [isReadingImage, setIsReadingImage] = useState(false);
  const [ocrTarget, setOcrTarget] = useState<'start' | 'end'>('start');
  const [ocrStatus, setOcrStatus] = useState('');
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleVoiceCommand = (event: Event) => {
      const transcript = (event as CustomEvent<string>).detail;
      if (typeof transcript !== 'string') return;

      const normalized = transcript
        .toLocaleLowerCase('vi')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd');
      const kmCommands = /(?:so\s+)?km\s*(di|ve)\s*([0-9][0-9.,\s]*)/g;
      for (const match of normalized.matchAll(kmCommands)) {
        const value = match[2].replace(/\D/g, '');
        if (!value) continue;
        if (match[1] === 'di') {
          setStartKm(value);
          setStartKmEdited(true);
        } else {
          setEndKm(value);
        }
      }

      const noteMatch = transcript.match(/ghi chú\s+(?:là\s+)?(.+)$/i);
      if (noteMatch?.[1]) setNote(noteMatch[1].trim());
    };

    window.addEventListener('erp:voice-command', handleVoiceCommand);
    return () => window.removeEventListener('erp:voice-command', handleVoiceCommand);
  }, []);

  const activePlate = selectedPlate || safeVehicles[0]?.plateNo || '';
  const maintenanceWarnings = getVehicleMaintenanceWarnings(safeVehicles, safeMileageLogs);
  const selectedVehicle = safeVehicles.find(vehicle => vehicle.plateNo === activePlate);
  const displayedMaintenanceIntervalKm = maintenanceDraftPlate === activePlate
    ? maintenanceIntervalKm
    : selectedVehicle?.maintenanceIntervalKm ? String(selectedVehicle.maintenanceIntervalKm) : '';
  const displayedLastMaintenanceKm = maintenanceDraftPlate === activePlate
    ? lastMaintenanceKm
    : selectedVehicle ? String(Number(selectedVehicle.lastOilChangeKm) || 0) : '';
  const dailyLogs = useMemo(() => safeMileageLogs
    .filter(log => Boolean(log.date))
    .sort((first, second) =>
      String(first.date).localeCompare(String(second.date)) ||
      first.plateNo.localeCompare(second.plateNo, 'vi', { numeric: true })
    ), [safeMileageLogs]);
  const currentMonthLogs = useMemo(() =>
    dailyLogs.filter(log => log.date?.slice(0, 7) === month), [dailyLogs, month]);
  const getPreviousReading = (plateNo: string, beforeDate: string) => dailyLogs
    .filter(log => log.plateNo === plateNo && String(log.date) < beforeDate)
    .sort((first, second) => String(second.date).localeCompare(String(first.date)))[0]?.endKm;
  const suggestedStartKm = getPreviousReading(activePlate, date);
  const displayedStartKm = startKmEdited
    ? startKm
    : suggestedStartKm === undefined ? '' : String(suggestedStartKm);
  const parsedStartKm = displayedStartKm.trim() ? Number(displayedStartKm) : undefined;
  const parsedEndKm = endKm.trim() ? Number(endKm) : undefined;
  const hasInvalidKmRange = parsedStartKm !== undefined &&
    parsedEndKm !== undefined &&
    Number.isFinite(parsedStartKm) &&
    Number.isFinite(parsedEndKm) &&
    parsedEndKm < parsedStartKm;

  const monthlyTotals = useMemo(() => safeVehicles.map(vehicle => {
    const vehicleMonthLogs = currentMonthLogs.filter(log => log.plateNo === vehicle.plateNo);
    const daily = vehicleMonthLogs
      .reduce((sum, log) => sum + (Number(log.totalKmRun) || 0), 0);
    const legacy = safeMileageLogs
      .filter(log =>
        !log.date &&
        log.plateNo === vehicle.plateNo &&
        log.monthYear === `${month.slice(5, 7)}/${month.slice(0, 4)}`
      )
      .reduce((sum, log) => sum + (Number(log.totalKmRun) || 0), 0);
    return { vehicle, total: vehicleMonthLogs.length ? daily : legacy };
  }), [safeVehicles, currentMonthLogs, safeMileageLogs, month]);

  const cumulativeByLogId = useMemo(() => {
    const totals = new Map<number, number>();
    const runningByPlate = new Map<string, number>();
    dailyLogs
      .filter(log => log.date?.slice(0, 7) === month)
      .forEach(log => {
        const total = (runningByPlate.get(log.plateNo) || 0) + (Number(log.totalKmRun) || 0);
        runningByPlate.set(log.plateNo, total);
        totals.set(log.id, total);
      });
    return totals;
  }, [dailyLogs, month]);

  const handleVehicleChange = (plateNo: string) => {
    setSelectedPlate(plateNo);
    const vehicle = safeVehicles.find(item => item.plateNo === plateNo);
    setMaintenanceDraftPlate(plateNo);
    setMaintenanceIntervalKm(vehicle?.maintenanceIntervalKm ? String(vehicle.maintenanceIntervalKm) : '');
    setLastMaintenanceKm(vehicle ? String(Number(vehicle.lastOilChangeKm) || 0) : '');
    setMaintenanceStatus('');
    const previousReading = getPreviousReading(plateNo, date);
    setStartKm(previousReading === undefined ? '' : String(previousReading));
    setStartKmEdited(true);
    setError('');
  };

  const handleSaveMaintenanceSettings = () => {
    if (!selectedVehicle) return;
    if (!displayedMaintenanceIntervalKm.trim() || !displayedLastMaintenanceKm.trim()) {
      setMaintenanceStatus('');
      setError('Vui lòng nhập đầy đủ định mức bảo dưỡng và Km lần bảo dưỡng gần nhất.');
      return;
    }
    const interval = Number(displayedMaintenanceIntervalKm);
    const lastMaintenance = Number(displayedLastMaintenanceKm);
    if (!Number.isFinite(interval) || interval <= 0 || !Number.isFinite(lastMaintenance) || lastMaintenance < 0) {
      setMaintenanceStatus('');
      setError('Định mức bảo dưỡng phải lớn hơn 0 và Km lần bảo dưỡng gần nhất phải từ 0 trở lên.');
      return;
    }
    updateVehicle({
      ...selectedVehicle,
      maintenanceIntervalKm: interval,
      lastOilChangeKm: lastMaintenance
    });
    setMaintenanceDraftPlate(activePlate);
    setMaintenanceIntervalKm(String(interval));
    setLastMaintenanceKm(String(lastMaintenance));
    setError('');
    setMaintenanceStatus(`Đã lưu cấu hình bảo dưỡng cho xe ${selectedVehicle.plateNo} thành công.`);
  };

  const handleEditLog = (log: MileageLog) => {
    setEditingLogId(log.id);
    setSelectedPlate(log.plateNo);
    setDate(log.date || today);
    setMonth((log.date || today).slice(0, 7));
    setStartKm(String(log.startKm));
    setStartKmEdited(true);
    setEndKm(String(log.endKm));
    setImages(log.images);
    setNote(log.note || '');
    setError('');
    setOcrStatus('');
  };

  const clearLogForm = () => {
    setEditingLogId(null);
    setEndKm('');
    setImages([]);
    setNote('');
    setError('');
    setOcrStatus('');
  };

  const handleDeleteLog = (log: MileageLog) => {
    if (!window.confirm(`Xóa nhật trình xe ${log.plateNo} ngày ${formatDate(log.date)}?`)) return;
    deleteMileageLog(log.id);
    if (editingLogId === log.id) clearLogForm();
  };

  const handleDateChange = (nextDate: string) => {
    setDate(nextDate);
    const previousReading = getPreviousReading(activePlate, nextDate);
    setStartKm(previousReading === undefined ? '' : String(previousReading));
    setStartKmEdited(true);
    setError('');
  };

  const handleMaintenanceConfirmation = (vehicle: VehicleCategoryItem, odometerKm: number) => {
    if (!window.confirm(`Xác nhận xe ${vehicle.plateNo} đã thay nhớt/bảo dưỡng tại ${formatNumber(odometerKm)} km?`)) return;
    updateVehicle(recordVehicleMaintenance(vehicle, odometerKm));
  };

  const handlePhotoSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setIsReadingImage(true);
    setError('');
    setOcrStatus('Đang đọc ảnh và nhận diện số công tơ mét...');
    try {
      const photos = await Promise.all(files.map(readCompressedImage));
      setImages(current => [...current, ...photos]);
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      try {
        await worker.setParameters({
          tessedit_char_whitelist: '0123456789'
        });
        let recognizedKm: string | undefined;
        for (const file of files) {
          const { data } = await worker.recognize(file);
          const candidates = data.text
            .split(/\r?\n/)
            .map(line => line.replace(/\D/g, ''))
            .filter(value => value.length > 0 && value.length <= 10)
            .sort((first, second) => second.length - first.length);
          if (candidates[0]) {
            recognizedKm = candidates[0];
            break;
          }
        }
        if (recognizedKm) {
          if (ocrTarget === 'start') {
            setStartKm(recognizedKm);
            setStartKmEdited(true);
          }
          else setEndKm(recognizedKm);
          setOcrStatus(`Đã nhận diện ${formatNumber(Number(recognizedKm))} km vào ô Km ${ocrTarget === 'start' ? 'đi' : 'về'}. Vui lòng đối chiếu ảnh và chỉnh sửa nếu cần.`);
        } else {
          setOcrStatus('Không nhận diện được số Km rõ ràng. Ảnh đã được đính kèm; vui lòng nhập số Km thủ công.');
        }
      } finally {
        await worker.terminate();
      }
    } catch (photoError) {
      console.error('Không thể tải ảnh công tơ mét:', photoError);
      setOcrStatus('');
      setError(photoError instanceof Error
        ? `Không thể xử lý ảnh công tơ mét: ${photoError.message}`
        : 'Không thể xử lý ảnh công tơ mét.');
    } finally {
      setIsReadingImage(false);
    }
  };

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const start = Number(displayedStartKm);
    const end = Number(endKm);
    if (hasInvalidKmRange) {
      setError('Cảnh báo: Số km về không được nhỏ hơn số km đi!');
      return;
    }
    if (!selectedVehicle || !date || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
      setError('Vui lòng chọn xe, ngày hợp lệ và đảm bảo Km về không nhỏ hơn Km đi.');
      return;
    }
    if (safeMileageLogs.some(log =>
      log.id !== editingLogId && log.date === date && log.plateNo === activePlate
    )) {
      setError(`Xe ${activePlate} đã có nhật trình ngày ${formatDate(date)}.`);
      return;
    }
    const previousReading = dailyLogs
      .filter(log => log.id !== editingLogId && log.plateNo === activePlate && String(log.date) < date)
      .sort((first, second) => String(second.date).localeCompare(String(first.date)))[0]?.endKm;
    if (previousReading !== undefined && start < previousReading) {
      setError(`Km đi không được nhỏ hơn số Km về gần nhất (${formatNumber(previousReading)} km).`);
      return;
    }

    const log: MileageLog = {
      id: editingLogId ?? Math.floor(performance.timeOrigin + event.timeStamp),
      plateNo: activePlate,
      vehicleName: selectedVehicle.vehicleName,
      date,
      monthYear: `${date.slice(5, 7)}/${date.slice(0, 4)}`,
      trackingMethod: 'Công tơ mét (Ảnh)',
      startKm: start,
      endKm: end,
      totalKmRun: end - start,
      images,
      note: note.trim()
    };
    if (editingLogId === null) {
      addMileageLog(log);
      const nextDate = getLocalDate(new Date(new Date(`${date}T00:00:00`).getTime() + 86400000));
      setDate(nextDate);
      setStartKm(String(end));
      setStartKmEdited(true);
      clearLogForm();
    } else {
      updateMileageLog(log);
      setMonth(date.slice(0, 7));
      setStartKm(String(end));
      setStartKmEdited(true);
      clearLogForm();
    }
    setError('');
  };

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString('vi-VN', {
    month: 'long',
    year: 'numeric'
  });
  const nextMonth = shiftMonth(month, 1);

  return (
    <section style={{ display: 'grid', gap: '16px', padding: '16px', border: '1px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#fff' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#1e293b', fontSize: '20px' }}>🚛 Quản Lý Xe & Km</h2>
          <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: '13px' }}>Nhật trình theo ngày, ảnh công tơ mét và tổng hợp quãng đường theo tháng.</p>
        </div>
        <strong style={{ color: '#1d4ed8' }}>Tháng đang xem: {monthLabel}</strong>
      </header>

      <form onSubmit={handleSave} style={{ display: 'grid', gap: '12px', padding: '14px', border: '1px solid #bfdbfe', borderRadius: '8px', backgroundColor: '#eff6ff' }}>
        <h3 style={{ margin: 0, color: '#1e40af', fontSize: '15px' }}>Ghi nhận Km hằng ngày</h3>
        <div className="vehicle-mileage-fields">
          <label className="vehicle-mileage-field">
            Xe · Biển số
            <select value={activePlate} onChange={event => handleVehicleChange(event.target.value)} required style={{ ...inputStyle, minHeight: '38px' }}>
              {safeVehicles.length === 0 && <option value="">Chưa có xe trong danh mục</option>}
              {safeVehicles.map(vehicle => <option key={vehicle.id} value={vehicle.plateNo}>{vehicle.vehicleName} · {vehicle.plateNo}</option>)}
            </select>
          </label>
          <label className="vehicle-mileage-field">
            Ngày
            <input type="date" value={date} onChange={event => handleDateChange(event.target.value)} required style={{ ...inputStyle, minHeight: '38px' }} />
          </label>
          <label className="vehicle-mileage-field">
            Km đi
            <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={displayedStartKm} onFocus={() => setOcrTarget('start')} onChange={event => { setStartKm(event.target.value.replace(/\D/g, '')); setStartKmEdited(true); }} required aria-invalid={hasInvalidKmRange} style={{ ...inputStyle, minHeight: '38px', borderColor: hasInvalidKmRange ? '#dc2626' : '#cbd5e1' }} placeholder="Số công tơ mét lúc đi" />
          </label>
          <label className="vehicle-mileage-field">
            Km về
            <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={endKm} onFocus={() => setOcrTarget('end')} onChange={event => setEndKm(event.target.value.replace(/\D/g, ''))} required aria-invalid={hasInvalidKmRange} style={{ ...inputStyle, minHeight: '38px', borderColor: hasInvalidKmRange ? '#dc2626' : '#cbd5e1' }} placeholder="Số công tơ mét lúc về" />
          </label>
        </div>
        <section aria-label="Cấu hình bảo dưỡng xe" className="vehicle-mileage-maintenance">
          <div className="vehicle-mileage-maintenance-heading">
            <h4 style={{ margin: 0, color: '#92400e', fontSize: '13px' }}>
              Cấu hình bảo dưỡng · {selectedVehicle?.vehicleName || 'Chưa chọn xe'} · {activePlate || '—'}
            </h4>
          </div>
          <label style={{ display: 'grid', gap: '5px', minWidth: 0, fontSize: '12px', fontWeight: 700 }}>
            Định mức thay nhớt / bảo dưỡng (Km)
            <input type="number" min="1" step="1" value={displayedMaintenanceIntervalKm} onChange={event => { setMaintenanceDraftPlate(activePlate); setMaintenanceIntervalKm(event.target.value); setMaintenanceStatus(''); }} disabled={!selectedVehicle} style={{ ...inputStyle, minHeight: '38px' }} placeholder="Ví dụ: 5000" />
          </label>
          <label style={{ display: 'grid', gap: '5px', minWidth: 0, fontSize: '12px', fontWeight: 700 }}>
            Km lần bảo dưỡng gần nhất
            <input type="number" min="0" step="any" value={displayedLastMaintenanceKm} onChange={event => { setMaintenanceDraftPlate(activePlate); setLastMaintenanceKm(event.target.value); setMaintenanceStatus(''); }} disabled={!selectedVehicle} style={{ ...inputStyle, minHeight: '38px' }} placeholder="Số Km công tơ mét" />
          </label>
          <button type="button" onClick={handleSaveMaintenanceSettings} disabled={!selectedVehicle} style={{ minHeight: '38px', padding: '8px 12px', border: 0, borderRadius: '6px', backgroundColor: selectedVehicle ? '#d97706' : '#94a3b8', color: '#fff', fontWeight: 700, cursor: selectedVehicle ? 'pointer' : 'not-allowed' }}>
            Lưu cấu hình xe
          </button>
          {maintenanceStatus && <div role="status" aria-live="polite" style={{ gridColumn: '1 / -1', color: '#047857', fontSize: '12px', fontWeight: 700 }}>{maintenanceStatus}</div>}
        </section>
        {editingLogId !== null && (
          <div role="status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', padding: '9px 11px', borderRadius: '6px', backgroundColor: '#fef3c7', color: '#92400e', fontSize: '12px', fontWeight: 700 }}>
            Đang sửa nhật trình ngày {formatDate(date)} · {activePlate}
            <button type="button" onClick={clearLogForm} style={{ padding: '5px 8px', border: '1px solid #f59e0b', borderRadius: '5px', background: '#fff', color: '#92400e', fontWeight: 700, cursor: 'pointer' }}>Hủy sửa</button>
          </div>
        )}
        {hasInvalidKmRange && (
          <div role="alert" style={{ padding: '9px 11px', border: '1px solid #fecaca', borderRadius: '6px', backgroundColor: '#fef2f2', color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>
            Cảnh báo: Số km về không được nhỏ hơn số km đi!
          </div>
        )}
        <div className="vehicle-mileage-actions">
          <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', fontWeight: 700 }}>
            OCR điền vào
            <select value={ocrTarget} onChange={event => setOcrTarget(event.target.value === 'end' ? 'end' : 'start')} disabled={isReadingImage} style={{ ...inputStyle, width: 'auto', minHeight: '38px' }}>
              <option value="start">Km đi</option>
              <option value="end">Km về</option>
            </select>
          </label>
          <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={isReadingImage} style={{ minHeight: '38px', padding: '9px 12px', border: 0, borderRadius: '6px', backgroundColor: '#2563eb', color: '#fff', fontWeight: 700, cursor: isReadingImage ? 'wait' : 'pointer' }}>
            {isReadingImage ? 'Đang nhận diện ảnh...' : '📷 Mở Camera / Chọn Ảnh'}
          </button>
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" multiple onChange={event => void handlePhotoSelection(event)} style={{ display: 'none' }} />
          <span style={{ color: '#475569', fontSize: '12px' }}>{images.length} ảnh công tơ mét đính kèm</span>
          <strong className="vehicle-mileage-distance">
            Km chạy trong ngày: {hasInvalidKmRange
              ? '—'
              : formatNumber(Math.max(0, (Number(endKm) || 0) - (Number(displayedStartKm) || 0)))}{hasInvalidKmRange ? '' : ' km'}
          </strong>
          <button type="submit" disabled={!safeVehicles.length || isReadingImage || hasInvalidKmRange} style={{ padding: '10px 16px', border: 0, borderRadius: '6px', backgroundColor: !safeVehicles.length || isReadingImage || hasInvalidKmRange ? '#94a3b8' : '#059669', color: '#fff', fontWeight: 700, cursor: !safeVehicles.length || isReadingImage || hasInvalidKmRange ? 'not-allowed' : 'pointer' }}>
            {editingLogId === null ? '💾 Lưu nhật trình' : '💾 Cập nhật nhật trình'}
          </button>
        </div>
        {ocrStatus && <div role="status" aria-live="polite" style={{ color: '#1d4ed8', fontSize: '12px' }}>{ocrStatus}</div>}
        {images.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {images.map((image, index) => (
              <div key={`${index}-${image.slice(0, 24)}`} style={{ position: 'relative' }}>
                <img src={image} alt={`Công tơ mét ${index + 1}`} style={{ width: '76px', height: '76px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                <button type="button" aria-label={`Xóa ảnh ${index + 1}`} onClick={() => setImages(current => current.filter((_, imageIndex) => imageIndex !== index))} style={{ position: 'absolute', top: '-6px', right: '-6px', width: '22px', height: '22px', border: 0, borderRadius: '50%', backgroundColor: '#dc2626', color: '#fff', cursor: 'pointer' }}>×</button>
              </div>
            ))}
          </div>
        )}
        <label style={{ display: 'grid', gap: '5px', fontSize: '12px', fontWeight: 700 }}>
          Ghi chú hành trình
          <input value={note} onChange={event => setNote(event.target.value)} style={inputStyle} placeholder="Ghi chú thêm (nếu có)" />
        </label>
        {error && <div role="alert" style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{error}</div>}
      </form>

      <section aria-label="Cảnh báo bảo dưỡng xe" style={{ display: 'grid', gap: '10px', padding: '14px', border: `1px solid ${maintenanceWarnings.length ? '#fbbf24' : '#e2e8f0'}`, borderRadius: '8px', backgroundColor: '#fffbeb' }}>
        <h3 style={{ margin: 0, color: '#92400e', fontSize: '15px' }}>⚠️ Bảo Dưỡng / Thay Nhớt Theo Định Mức Km</h3>
        {maintenanceWarnings.length ? maintenanceWarnings.map(warning => (
          <div key={warning.vehicle.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '10px', borderRadius: '6px', backgroundColor: warning.kmRemaining <= 0 ? '#fef2f2' : '#fff', border: `1px solid ${warning.kmRemaining <= 0 ? '#fecaca' : '#fde68a'}` }}>
            <div style={{ display: 'grid', gap: '3px', fontSize: '12px' }}>
              <strong style={{ color: warning.kmRemaining <= 0 ? '#b91c1c' : '#78350f' }}>{warning.vehicle.vehicleName} · {warning.vehicle.plateNo}</strong>
              <span>Km hiện tại: {formatNumber(warning.currentKm)} · Mốc bảo dưỡng: {formatNumber(warning.targetKm)} km</span>
              <span>
                {warning.kmRemaining <= 0
                  ? `Đã vượt ${formatNumber(Math.abs(warning.kmRemaining))} km`
                  : `Còn ${formatNumber(warning.kmRemaining)} km · trung bình ${formatNumber(warning.averageKmPerDay)} km/ngày${warning.estimatedDaysRemaining === null ? '' : ` · khoảng ${warning.estimatedDaysRemaining} ngày`}`}
              </span>
            </div>
            <button type="button" onClick={() => handleMaintenanceConfirmation(warning.vehicle, warning.currentKm)} style={{ padding: '7px 10px', border: 0, borderRadius: '5px', background: '#059669', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              Đã thay & sửa chữa
            </button>
          </div>
        )) : (
          <p style={{ margin: 0, color: '#64748b', fontSize: '12px' }}>Chưa có xe sắp đến hoặc đã vượt mốc bảo dưỡng.</p>
        )}
      </section>

      <section style={{ display: 'grid', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <h3 style={{ margin: 0, color: '#1e293b', fontSize: '15px' }}>Tổng hợp Km theo xe</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: '7px', marginLeft: 'auto', fontSize: '12px', fontWeight: 700 }}>
            Tháng / Năm
            <input type="month" value={month} onChange={event => setMonth(event.target.value)} style={{ ...inputStyle, width: 'auto' }} />
          </label>
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', cursor: 'pointer' }}>← Tháng trước</button>
          <button type="button" onClick={() => setMonth(nextMonth)} style={{ padding: '8px 10px', border: 0, borderRadius: '6px', background: '#dbeafe', color: '#1d4ed8', fontWeight: 700, cursor: 'pointer' }}>Gợi ý tháng sau: {nextMonth.slice(5, 7)}/{nextMonth.slice(0, 4)} →</button>
        </div>
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '7px' }}>
          <table style={{ width: '100%', minWidth: '520px', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead><tr style={{ backgroundColor: '#f1f5f9', textAlign: 'left' }}>
              <th style={{ padding: '10px' }}>Xe</th>
              <th style={{ padding: '10px' }}>Biển số</th>
              <th style={{ padding: '10px', textAlign: 'right' }}>Tổng Km tháng {monthLabel}</th>
            </tr></thead>
            <tbody>
              {monthlyTotals.length ? monthlyTotals.map(({ vehicle, total }) => (
                <tr key={vehicle.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '10px', fontWeight: 700 }}>{vehicle.vehicleName}</td>
                  <td style={{ padding: '10px' }}>{vehicle.plateNo}</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#15803d', fontWeight: 800 }}>{formatNumber(total)} km</td>
                </tr>
              )) : <tr><td colSpan={3} style={{ padding: '14px', textAlign: 'center', color: '#64748b' }}>Chưa có xe trong danh mục.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ display: 'grid', gap: '10px' }}>
        <h3 style={{ margin: 0, color: '#1e293b', fontSize: '15px' }}>Chi tiết nhật trình · {monthLabel}</h3>
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '7px' }}>
          <table style={{ width: '100%', minWidth: '1040px', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '12px' }}>
            <colgroup>
              {[9, 13, 10, 8, 8, 10, 10, 9, 13, 10].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}
            </colgroup>
            <thead><tr style={{ backgroundColor: '#f1f5f9' }}>
              {['Ngày', 'Tên xe', 'Biển số', 'Km đi', 'Km về', 'Km trong ngày', 'Lũy kế tháng', 'Ảnh', 'Ghi chú', 'Thao Tác'].map((title, index) => (
                <th key={title} style={{
                  padding: '9px',
                  textAlign: index >= 3 && index <= 6 ? 'right' : index >= 7 ? 'center' : 'left',
                  whiteSpace: 'nowrap'
                }}>{title}</th>
              ))}
            </tr></thead>
            <tbody>
              {currentMonthLogs.length ? currentMonthLogs.slice().reverse().map(log => (
                <tr key={log.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '9px', textAlign: 'left', whiteSpace: 'nowrap' }}>{log.date ? formatDate(log.date) : formatLegacyMonth(log.monthYear)}</td>
                  <td style={{ padding: '9px', textAlign: 'left', overflowWrap: 'anywhere' }}>{log.vehicleName || safeVehicles.find(vehicle => vehicle.plateNo === log.plateNo)?.vehicleName || '—'}</td>
                  <td style={{ padding: '9px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap' }}>{log.plateNo}</td>
                  <td style={{ padding: '9px', textAlign: 'right' }}>{formatNumber(Number(log.startKm) || 0)}</td>
                  <td style={{ padding: '9px', textAlign: 'right' }}>{formatNumber(Number(log.endKm) || 0)}</td>
                  <td style={{ padding: '9px', textAlign: 'right', fontWeight: 700 }}>{formatNumber(Number(log.totalKmRun) || 0)}</td>
                  <td style={{ padding: '9px', textAlign: 'right', color: '#1d4ed8', fontWeight: 700 }}>{formatNumber(cumulativeByLogId.get(log.id) || 0)}</td>
                  <td style={{ padding: '9px', textAlign: 'center' }}>
                    {log.images?.length ? (
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '4px' }}>
                        {log.images.map((image, index) => <a key={`${log.id}-${index}`} href={image} target="_blank" rel="noreferrer"><img src={image} alt={`Công tơ ${index + 1}`} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} /></a>)}
                      </div>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '9px', textAlign: 'center', overflowWrap: 'anywhere' }}>{log.note || '—'}</td>
                  <td style={{ padding: '9px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button type="button" onClick={() => handleEditLog(log)} style={{ marginRight: '5px', padding: '5px 8px', border: 0, borderRadius: '5px', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Sửa</button>
                    <button type="button" onClick={() => handleDeleteLog(log)} style={{ padding: '5px 8px', border: 0, borderRadius: '5px', background: '#dc2626', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Xóa</button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={10} style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>Chưa có nhật trình trong tháng này.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
