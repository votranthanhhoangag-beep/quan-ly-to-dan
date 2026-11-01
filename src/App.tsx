import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import CategoryManager from './components/CategoryManager';
import { ContractsManager } from './components/ContractsManager';
import InventoryReportManager from './components/InventoryReportManager';
import InventoryStockReport from './components/InventoryStockReport';
import MaterialStockReport from './components/MaterialStockReport';
import FrameExportManager from './components/FrameExportManager';
import KnittingExportManager from './components/KnittingExportManager';
import DefectiveGoodsImportManager from './components/DefectiveGoodsImportManager';
import { ExpenseForm } from './components/ExpenseForm';
import DashboardView from './components/DashboardView';
import SystemSettingsView from './components/SystemSettingsView';
import VehicleFleetManager from './components/VehicleFleetManager';
import TaxExpenseManager from './components/TaxExpenseManager';
import { getVehicleExpiryWarnings } from './utils/vehicleExpiry';
import { AuthProvider, useAuth, type Permission, type UserRole } from './context/AuthContext';
import AuthGate from './components/AuthGate';
import AuditLogView from './components/AuditLogView';
import { ProtectedRoute } from './components/ProtectedRoute';
import Unauthorized from './pages/Unauthorized';
import Register from './pages/Register';

type MenuItem = { id: string; label: string; permission: Permission };

const routeByTab: Record<string, string> = {
  dashboard: '/dashboard',
  contracts: '/ho-so-dan',
  expenses: '/phieu-chi',
  userManagement: '/quan-ly-user'
};

interface SpeechRecognitionResultLike {
  0?: { transcript: string };
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const normalizeVoiceCommand = (value: string) => value
  .toLocaleLowerCase('vi')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function VoiceCommandControl({
  menuItems,
  onNavigate
}: {
  menuItems: MenuItem[];
  onNavigate: (tabId: string) => void;
}) {
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const startListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setStatus('Đã dừng nghe.');
      return;
    }

    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setStatus('Trình duyệt này chưa hỗ trợ nhận diện giọng nói.');
      return;
    }

    const recognition = new Recognition();
    recognition.lang = 'vi-VN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (!transcript) {
        setStatus('Không nhận diện được nội dung. Vui lòng thử lại.');
        return;
      }

      const command = normalizeVoiceCommand(transcript);
      const destinations: Record<string, string[]> = {
        dashboard: ['dashboard', 'trang chu', 'tong quan'],
        categories: ['danh muc', 'quan ly danh muc'],
        contracts: ['hop dong', 'quan ly hop dong', 'quan ly hd dan'],
        inventory: ['phieu nhap', 'quan ly phieu nhap', 'ton kho'],
        exportFrame: ['nhan hang dan', 'nhan hang tu to dan'],
        knittingExport: ['xuat hang dan'],
        defectiveGoodsImport: ['hang loi', 'nhap hang loai'],
        inventoryStockReport: ['bao cao nxt', 'bao cao ton kho'],
        expenses: ['phieu chi', 'quan ly phieu chi'],
        vehicles: ['quan ly xe', 'xe va km', 'nhat trinh xe'],
        tax: ['doanh thu', 'chi phi', 'thue', 'van hanh'],
        systemSettings: ['cau hinh he thong', 'cai dat he thong']
      };
      const destination = Object.entries(destinations).find(([, phrases]) =>
        phrases.some(phrase => command.includes(phrase))
      );

      if (destination) {
        const [tabId] = destination;
        const tab = menuItems.find(item => item.id === tabId);
        onNavigate(tabId);
        setStatus(`Đã chuyển đến ${tab?.label.replace(/^[^ ]+ /u, '') || 'màn hình yêu cầu'}.`);
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('erp:voice-command', { detail: transcript }));
        }, 350);
        return;
      }

      window.dispatchEvent(new CustomEvent('erp:voice-command', { detail: transcript }));
      setStatus(`Đã nhận lệnh: “${transcript}”`);
    };
    recognition.onerror = event => {
      setIsListening(false);
      setStatus(event.error === 'not-allowed'
        ? 'Không có quyền sử dụng micro. Hãy cấp quyền trong trình duyệt.'
        : `Không thể nhận diện giọng nói (${event.error}).`);
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;

    try {
      recognition.start();
      setIsListening(true);
      setStatus('Đang nghe...');
    } catch (error) {
      recognitionRef.current = null;
      setIsListening(false);
      setStatus(error instanceof Error ? `Không thể bật micro: ${error.message}` : 'Không thể bật micro.');
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '10px' }}>
      {status && (
        <span role="status" aria-live="polite" style={{ color: isListening ? '#b91c1c' : '#475569', fontSize: '13px', fontWeight: isListening ? 800 : 600 }}>
          {status}
        </span>
      )}
      <button
        type="button"
        onClick={startListening}
        aria-label={isListening ? 'Dừng điều khiển bằng giọng nói' : 'Bắt đầu điều khiển bằng giọng nói'}
        aria-pressed={isListening}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minHeight: '40px', padding: '8px 13px', border: 0, borderRadius: '8px', backgroundColor: isListening ? '#dc2626' : '#1d4ed8', color: '#fff', fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 6px rgba(15, 23, 42, 0.15)' }}
      >
        <span aria-hidden="true">🎙️</span>
        {isListening ? 'Đang nghe...' : 'Tìm kiếm bằng giọng nói'}
      </button>
    </div>
  );
}

function VehicleExpiryBadge() {
  const { vehicles = [] } = useApp();
  const warnings = getVehicleExpiryWarnings(Array.isArray(vehicles) ? vehicles : []);
  const warningCount = warnings.insurance.length + warnings.registration.length;

  if (!warningCount) return null;
  return (
    <span
      aria-label={`${warningCount} cảnh báo hạn giấy tờ xe`}
      title={`${warningCount} cảnh báo hạn giấy tờ xe`}
      style={{ minWidth: '22px', padding: '2px 6px', borderRadius: '999px', backgroundColor: '#dc2626', color: '#fff', fontSize: '11px', fontWeight: 800, textAlign: 'center' }}
    >
      {warningCount}
    </span>
  );
}

function SystemBranding() {
  const { systemConfiguration } = useApp();
  const companyName = systemConfiguration?.companyName?.trim() || 'ERP LỤC BÌNH';
  const address = systemConfiguration?.address?.trim();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '20px', borderBottom: '1px solid #1e293b', backgroundColor: '#020617' }}>
      {systemConfiguration?.logo && (
        <img
          src={systemConfiguration.logo}
          alt={`Logo ${companyName}`}
          style={{ width: '48px', height: '48px', flexShrink: 0, objectFit: 'contain', borderRadius: '7px', backgroundColor: '#fff' }}
        />
      )}
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: '18px', fontWeight: '900', color: '#60a5fa', margin: 0, letterSpacing: '0.5px', textTransform: 'uppercase', overflowWrap: 'anywhere' }}>
          {companyName}
        </h1>
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0', fontWeight: '500' }}>
          {address || 'Quản Lý Sản Xuất'}
        </p>
      </div>
    </div>
  );
}

function FrameReceiptDashboard({
  onOpenInventory,
  onRequestDeposit,
  onReceiveMissingFrames
}: {
  onOpenInventory: () => void;
  onRequestDeposit: (contractId: string | number) => void;
  onReceiveMissingFrames: (contractId: string | number) => void;
}) {
  const { contracts = [], slips = [] } = useApp();
  const parentContractsById = new Map<string, typeof contracts[number]>();
  contracts
    .filter(contract => contract.contractType === 'PARENT' || !contract.contractType)
    .forEach(contract => {
      const contractNo = String(contract.contractNo || '').trim().toLowerCase();
      const key = contractNo || `id:${contract.id}`;
      if (!parentContractsById.has(key)) parentContractsById.set(key, contract);
    });
  const parentContracts = Array.from(parentContractsById.values());
  const frameLogs = slips.filter(log =>
    String(log.type || '').toUpperCase() === 'NK' ||
    String(log.type || '').toUpperCase() === 'NHAP' ||
    String(log.slipNo || '').toUpperCase().startsWith('NK') ||
    (
      (
        String(log.slipNo || '').toUpperCase().startsWith('KS') ||
        String(log.type || '').toUpperCase() === 'NK_KHUNG' ||
        String(log.type || '').toUpperCase() === 'KS'
      ) &&
      !log.sourceContractId &&
      !log.craftGroupLeader
    )
  );
  const progress = parentContracts.map(contract => {
    const contractNo = String(contract.contractNo || '').trim().toLowerCase();
    const code = String(contract.productCode || '').trim().toLowerCase();
    const matchingLogs = frameLogs.filter(log => {
      const logContractNo = String(log.contractNo || '').trim().toLowerCase();
      if (logContractNo) return logContractNo === contractNo;
      const matchingContracts = parentContracts.filter(
        parent => String(parent.productCode || '').trim().toLowerCase() === code
      );
      return matchingContracts.length === 1 &&
        String(log.productCode || '').trim().toLowerCase() === code;
    });
    const received = matchingLogs.reduce((sum, log) => sum + (Number(log.quantity) || 0), 0);
    const total = Number(contract.quantity) || 0;
    return { contract, received, total, remaining: Math.max(0, total - received) };
  });
  const completeContracts = progress.filter(item => item.total > 0 && item.remaining === 0);
  const incompleteContracts = progress.filter(item => item.remaining > 0);

  return (
    <div style={{ marginTop: '20px', padding: '18px', border: '1px solid #bae6fd', borderRadius: '10px', backgroundColor: '#f0f9ff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, color: '#075985', fontSize: '16px' }}>📦 Tiến Độ Nhận Khung Sơn từ Cty</h3>
        <button type="button" onClick={onOpenInventory} style={{ border: 0, borderRadius: '6px', padding: '8px 12px', backgroundColor: '#0284c7', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>
          Quản lý khung chưa nhận đủ
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '14px' }}>
        <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#fef2f2', color: '#991b1b', fontWeight: 'bold' }}>
          ⚠️ Chưa nhận đủ: {incompleteContracts.length} hợp đồng
        </div>
        <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#f0fdf4', color: '#166534', fontWeight: 'bold' }}>
          ✅ Đã nhận đủ: {completeContracts.length} hợp đồng
        </div>
      </div>
      <div style={{ display: 'grid', gap: '8px' }}>
        {completeContracts.map(({ contract }, index) => {
          const hasDeposit = Number(contract.requiredDeposit) > 0;
          return (
          <div key={`${contract.id}-${contract.contractNo || contract.productCode || index}`} role="status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', padding: '9px 12px', border: '1px solid #86efac', borderRadius: '6px', backgroundColor: '#f0fdf4', color: '#166534', fontWeight: 'bold' }}>
            <span>✅ ĐÃ NHẬN ĐỦ KHUNG · HĐ: {contract.contractNo} - Mã: {contract.productCode}</span>
            {hasDeposit ? (
              <span style={{ padding: '4px 8px', borderRadius: '999px', backgroundColor: '#dcfce7', border: '1px solid #4ade80', color: '#166534', fontSize: '12px', whiteSpace: 'nowrap' }}>
                ✅ Đã nhận cọc
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onRequestDeposit(contract.id)}
                style={{ padding: '5px 10px', borderRadius: '999px', backgroundColor: '#dcfce7', border: '1px solid #4ade80', color: '#166534', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap', cursor: 'pointer' }}
              >
                💰 [ĐƯỢC NHẬN CỌC]
              </button>
            )}
          </div>
        );})}
        {incompleteContracts.map(({ contract, received, total, remaining }, index) => (
          <button
            key={`${contract.id}-${contract.contractNo || contract.productCode || index}`}
            type="button"
            onClick={() => onReceiveMissingFrames(contract.id)}
            style={{ width: '100%', padding: '9px 12px', border: '1px solid #fecaca', borderRadius: '6px', backgroundColor: '#fff', color: '#991b1b', textAlign: 'left', cursor: 'pointer' }}
            title="Mở phiếu nhập khung cho hợp đồng này"
          >
            - HĐ {contract.contractNo} - Mã {contract.productCode}: đã nhận {received.toLocaleString()}/{total.toLocaleString()}, còn thiếu {remaining.toLocaleString()} khung
          </button>
        ))}
        {progress.length === 0 && <div style={{ color: '#64748b' }}>Chưa có hợp đồng công ty để theo dõi nhận khung.</div>}
      </div>
    </div>
  );
}

function AppContent({ initialTab }: { initialTab: string }) {
  const { isDataLoaded, dataLoadError, retryDataLoad } = useApp();
  const { user, hasPermission, signOut } = useAuth();
  const navigate = useNavigate();
  const [syncNotice, setSyncNotice] = useState<{ status: string; message: string } | null>(
    () => navigator.onLine ? null : {
      status: 'offline',
      message: 'Mất kết nối mạng. Dữ liệu mới sẽ được lưu trên thiết bị và đồng bộ lại khi có mạng.'
    }
  );
  const [selectedTab, setSelectedTab] = useState<string>(initialTab);
  const [inventoryInitialTab, setInventoryInitialTab] = useState<'NK_KHUNG' | 'KS_INCOMPLETE' | 'FRAME_STOCK'>('FRAME_STOCK');
  const [frameReceiptContractId, setFrameReceiptContractId] = useState<string | number | null>(null);
  const [depositEditContractId, setDepositEditContractId] = useState<string | number | null>(null);

  const menuItems: MenuItem[] = [
    { id: 'dashboard', label: '📊 Dashboard', permission: 'view_dashboard' },
    { id: 'categories', label: '🗂️ Quản Lý Danh Mục', permission: 'view_categories' },
    { id: 'contracts', label: '📋 Quản Lý HĐ Đan', permission: 'view_knitting_contracts' },
    { id: 'inventory', label: '📊 Báo Cáo NXT Khung Sơn', permission: 'view_frame_stock' },
    { id: 'exportFrame', label: '📥 Nhận Hàng Đan Từ Tổ Đan', permission: 'manage_knitting_receipts' },
    { id: 'knittingExport', label: '📤 Xuất Hàng Đan', permission: 'manage_knitting_exports' },
    { id: 'defectiveGoodsImport', label: '📥 Nhập Hàng Loại', permission: 'manage_settings' },
    { id: 'inventoryStockReport', label: '📊 Báo Cáo NXT & Sửa Khoán', permission: 'manage_settings' },
    { id: 'materialStockReport', label: '🧵 Báo Cáo NXT Nguyên Phụ Liệu', permission: 'view_material_stock' },
    { id: 'expenses', label: '💰 Quản Lý Phiếu Chi', permission: 'view_expenses' },
    { id: 'vehicles', label: '🚛 Quản Lý Xe & KM', permission: 'view_vehicles' },
    { id: 'tax', label: '📊 Doanh Thu và Chi Phí', permission: 'view_revenue' },
    { id: 'systemSettings', label: '⚙️ Cấu Hình Hệ Thống', permission: 'manage_settings' },
    { id: 'userManagement', label: '👥 Quản Lý Người Dùng', permission: 'manage_settings' },
    { id: 'auditLogs', label: '🧾 Lịch Sử Thao Tác', permission: 'view_audit_logs' }
  ];
  const visibleMenuItems = menuItems.filter(item => hasPermission(item.permission));
  const activeTab = visibleMenuItems.some(item => item.id === selectedTab)
    ? selectedTab
    : visibleMenuItems[0]?.id || 'auditLogs';

  const navigateToTab = (tabId: string) => {
    if (tabId === 'inventory') setInventoryInitialTab('FRAME_STOCK');
    setSelectedTab(tabId);
    const route = routeByTab[tabId];
    if (route) navigate(route);
  };

  useEffect(() => {
    let dismissTimer: number | undefined;
    const handleSyncStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ status: string; message: string }>).detail;
      if (!detail) return;
      setSyncNotice(detail);
      if (dismissTimer !== undefined) window.clearTimeout(dismissTimer);
      if (detail.status === 'sent') {
        dismissTimer = window.setTimeout(() => setSyncNotice(null), 6000);
      }
    };
    const handleOffline = () => setSyncNotice({
      status: 'offline',
      message: 'Mất kết nối mạng. Dữ liệu mới sẽ được lưu trên thiết bị và đồng bộ lại khi có mạng.'
    });
    const handleOnline = () => setSyncNotice({
      status: 'syncing',
      message: 'Đã có kết nối. Đang đồng bộ dữ liệu đang chờ...'
    });
    const handlePermissionDenied = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      setSyncNotice({ status: 'error', message: message || 'Tài khoản không đủ quyền thực hiện thao tác.' });
    };
    const handleAuditError = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      setSyncNotice({ status: 'error', message: message || 'Không thể lưu nhật ký thao tác.' });
    };
    window.addEventListener('erp:sync-status', handleSyncStatus);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    window.addEventListener('erp:permission-denied', handlePermissionDenied);
    window.addEventListener('erp:audit-log-error', handleAuditError);
    return () => {
      window.removeEventListener('erp:sync-status', handleSyncStatus);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('erp:permission-denied', handlePermissionDenied);
      window.removeEventListener('erp:audit-log-error', handleAuditError);
      if (dismissTimer !== undefined) window.clearTimeout(dismissTimer);
    };
  }, []);

  if (!isDataLoaded) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', backgroundColor: '#f8fafc', boxSizing: 'border-box' }}>
        <section style={{ width: 'min(100%, 520px)', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          {dataLoadError ? (
            <>
              <h1 style={{ margin: '0 0 8px', color: '#b91c1c', fontSize: '18px' }}>Không thể tải dữ liệu ERP</h1>
              <p role="alert" style={{ color: '#475569', lineHeight: 1.5 }}>{dataLoadError}</p>
              <button type="button" onClick={retryDataLoad} style={{ padding: '10px 14px', border: 0, borderRadius: '6px', backgroundColor: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                Thử tải lại
              </button>
            </>
          ) : (
            <p role="status" aria-live="polite" style={{ margin: 0, color: '#334155', fontWeight: 700 }}>
              Đang tải dữ liệu ERP, vui lòng chờ...
            </p>
          )}
        </section>
      </main>
    );
  }

  return (
<div className="erp-app-shell" style={{ display: 'flex', minHeight: '100vh', width: '100%', backgroundColor: '#f8fafc', margin: 0, padding: 0, boxSizing: 'border-box' }}>
      {syncNotice && (
        <div
          role={syncNotice.status === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          style={{
            position: 'fixed',
            top: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2000,
            width: 'min(92vw, 680px)',
            padding: '11px 16px',
            borderRadius: '8px',
            border: `1px solid ${syncNotice.status === 'error' ? '#fca5a5' : '#fcd34d'}`,
            backgroundColor: syncNotice.status === 'error' ? '#fef2f2' : '#fffbeb',
            color: syncNotice.status === 'error' ? '#991b1b' : '#92400e',
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.18)',
            fontSize: '13px',
            fontWeight: 700
          }}
        >
          {syncNotice.status === 'syncing' ? '⏳ ' : syncNotice.status === 'sent' ? 'ℹ️ ' : '⚠️ '}
          {syncNotice.message}
        </div>
      )}
        {/* ========================================== */}
        {/* THANH MENU DỌC BÊN TRÁI (SIDEBAR BÊN TRÁI) */}
        {/* ========================================== */}
        <aside className="erp-sidebar" style={{ width: '260px', backgroundColor: '#0f172a', color: '#ffffff', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', flexShrink: 0, borderRight: '1px solid #e5e7eb', boxShadow: '4px 0 12px rgba(0,0,0,0.15)', zIndex: 10 }}>
          <SystemBranding />

          {/* Danh Sách Nút Bấm Menu Dọc */}
          <nav className="erp-sidebar-nav" aria-label="Điều hướng chính" style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
            {visibleMenuItems.map(item => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateToTab(item.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: isActive ? '800' : '600',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    backgroundColor: isActive ? '#2563eb' : 'transparent',
                    color: isActive ? '#ffffff' : '#cbd5e1',
                    boxShadow: isActive ? '0 4px 10px rgba(37,99,235,0.3)' : 'none'
                  }}
                >
                  <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span>{item.label}</span>
                    {item.id === 'dashboard' && <VehicleExpiryBadge />}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Footer Sidebar */}
          <div className="erp-sidebar-footer" style={{ padding: '16px', borderTop: '1px solid #1e293b', backgroundColor: '#020617', textAlign: 'center', fontSize: '11px', color: '#64748b', fontWeight: '600' }}>
            Hệ Thống ERP Lục Bình Crafts © 2026
          </div>
        </aside>

        {/* ========================================== */}
        {/* KHU VỰC NỘI DUNG CHÍNH BÊN PHẢI (CONTENT AREA) */}
        {/* ========================================== */}
        <main className="erp-main" style={{ flex: 1, minWidth: 0, width: 0, padding: '24px', backgroundColor: '#f8fafc', boxSizing: 'border-box' }}>
          <div className="erp-content-shell" style={{ width: '100%', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
              <strong style={{ color: '#334155', fontSize: '14px' }}>
                {visibleMenuItems.find(item => item.id === activeTab)?.label.replace(/^[^ ]+ /u, '') || 'ERP Lục Bình'}
              </strong>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span style={{ color: '#475569', fontSize: '12px', fontWeight: 700 }}>
                  {user?.username} · {roleLabels[user?.role || 'kho_to_dan']}
                </span>
                <button type="button" onClick={() => void signOut()} style={{ padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer' }}>Đăng xuất</button>
                <VoiceCommandControl
                  menuItems={visibleMenuItems}
                  onNavigate={tabId => {
                    navigateToTab(tabId);
                    if (tabId === 'inventory') setInventoryInitialTab('NK_KHUNG');
                  }}
                />
              </div>
            </div>
            {activeTab === 'dashboard' && (
              <div style={{ display: 'grid', gap: '18px' }}>
                <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0' }}>
                  <DashboardView />
                </div>
                <FrameReceiptDashboard onOpenInventory={() => {
                  setInventoryInitialTab('KS_INCOMPLETE');
                  setSelectedTab('inventory');
                }} onRequestDeposit={contractId => {
                  setDepositEditContractId(contractId);
                  setSelectedTab('contracts');
                }} onReceiveMissingFrames={contractId => {
                  setFrameReceiptContractId(contractId);
                  setInventoryInitialTab('NK_KHUNG');
                  setSelectedTab('inventory');
                }} />
              </div>
            )}

            {/* HIỂN THỊ CÁC COMPONENT CHỨC NĂNG */}
            {activeTab === 'categories' && <CategoryManager />}
            {activeTab === 'contracts' && (
              <ContractsManager
                requestedEditContractId={depositEditContractId}
                onEditRequestHandled={() => setDepositEditContractId(null)}
              />
            )}
            {activeTab === 'inventory' && (
              <InventoryReportManager
                key={inventoryInitialTab}
                initialTab={inventoryInitialTab}
                initialFrameReceiptContractId={frameReceiptContractId}
                onInitialFrameReceiptHandled={() => setFrameReceiptContractId(null)}
              />
            )}
            {activeTab === 'exportFrame' && <FrameExportManager />}
            {activeTab === 'knittingExport' && <KnittingExportManager />}
            {activeTab === 'defectiveGoodsImport' && <DefectiveGoodsImportManager />}
            {activeTab === 'inventoryStockReport' && <InventoryStockReport />}
            {activeTab === 'materialStockReport' && <MaterialStockReport />}
            {activeTab === 'expenses' && <ExpenseForm />}

            {activeTab === 'vehicles' && <VehicleFleetManager />}

            {activeTab === 'tax' && <TaxExpenseManager />}

            {activeTab === 'systemSettings' && <SystemSettingsView />}
            {activeTab === 'userManagement' && (
              <section role="status" style={{ padding: '24px', border: '1px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#fff' }}>
                <h2 style={{ marginTop: 0 }}>Quản lý người dùng</h2>
                <p style={{ marginBottom: 0, color: '#475569' }}>Màn hình quản lý người dùng chưa được triển khai.</p>
              </section>
            )}
            {activeTab === 'auditLogs' && hasPermission('view_audit_logs') && <AuditLogView />}

          </div>
        </main>

      </div>
  );
}

function RoutedAppContent({ initialTab }: { initialTab: string }) {
  const { pathname } = useLocation();
  return <AppContent key={pathname} initialTab={initialTab} />;
}

function AuthenticatedApp() {
  return (
    <AuthProvider>
      <AuthGate>
        <AppProvider>
          <Routes>
            <Route path="/unauthorized" element={<Unauthorized />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<RoutedAppContent initialTab="dashboard" />} />
              <Route path="/ho-so-dan" element={<RoutedAppContent initialTab="contracts" />} />
              <Route path="/phieu-chi" element={<RoutedAppContent initialTab="expenses" />} />
              <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
                <Route path="/quan-ly-user" element={<RoutedAppContent initialTab="userManagement" />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AppProvider>
      </AuthGate>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/*" element={<AuthenticatedApp />} />
      </Routes>
    </BrowserRouter>
  );
}

const roleLabels: Record<UserRole, string> = {
  admin: 'Quản trị viên',
  ke_toan: 'Kế toán',
  kho_to_dan: 'Kho / Tổ đan'
};