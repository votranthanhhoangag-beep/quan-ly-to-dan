import { useApp } from '../context/AppContext';
import { getContractFinancialSummary, getDebtDueBadge, getDebtDueStatus } from '../utils/contractDebt';
import { getVehicleExpiryWarnings } from '../utils/vehicleExpiry';
import { getVehicleMaintenanceWarnings, recordVehicleMaintenance } from '../utils/vehicleMaintenance';
import { getMaterialStockRows } from '../utils/materialStock';

const formatNumber = (value: number) => value.toLocaleString('vi-VN');
const formatCurrency = (value: number) => `${value.toLocaleString('vi-VN')} đ`;
const parseScheduleDate = (value: unknown) => {
  const dateValue = String(value || '').trim();
  const isoMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const vietnameseMatch = dateValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const year = Number(isoMatch?.[1] || vietnameseMatch?.[3]);
  const month = Number(isoMatch?.[2] || vietnameseMatch?.[2]);
  const day = Number(isoMatch?.[3] || vietnameseMatch?.[1]);
  if (!year || !month || !day) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return parsed;
};
const formatScheduleDate = (value: string) => {
  const parsed = parseScheduleDate(value);
  return parsed
    ? `${String(parsed.getUTCDate()).padStart(2, '0')}/${String(parsed.getUTCMonth() + 1).padStart(2, '0')}/${parsed.getUTCFullYear()}`
    : value;
};

const cardStyle = {
  padding: '18px',
  borderRadius: '12px',
  border: '1px solid',
  boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
  minWidth: 0
} as const;

export default function DashboardView() {
  const { contracts = [], slips = [], materials = [], expenses = [], vehicles = [], mileageLogs = [], updateVehicle } = useApp();
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const lowStockMaterials = getMaterialStockRows(
    materials,
    slips,
    contracts,
    expenses,
    currentMonth
  ).flatMap(stock => {
    const material = materials.find(item => `id:${item.id}` === stock.key);
    const minimum = Number(material?.lowStockLimit);
    if (!material || !Number.isFinite(minimum) || minimum <= 0 || stock.closing >= minimum) return [];
    return [{ ...stock, minimum, purchaseQuantity: minimum - stock.closing }];
  });
  const expiryWarnings = getVehicleExpiryWarnings(Array.isArray(vehicles) ? vehicles : []);
  const maintenanceWarnings = getVehicleMaintenanceWarnings(
    Array.isArray(vehicles) ? vehicles : [],
    Array.isArray(mileageLogs) ? mileageLogs : []
  );
  const confirmMaintenance = (warning: typeof maintenanceWarnings[number]) => {
    if (!window.confirm(`Xác nhận xe ${warning.vehicle.plateNo} đã thay nhớt/bảo dưỡng tại ${formatNumber(warning.currentKm)} km?`)) return;
    updateVehicle(recordVehicleMaintenance(warning.vehicle, warning.currentKm));
  };
  const renderExpiryTable = (
    title: string,
    rows: typeof expiryWarnings.insurance,
    accent: string
  ) => rows.length > 0 ? (
    <article style={{ ...cardStyle, backgroundColor: '#fff', borderColor: '#fecaca' }}>
      <h3 style={{ margin: '0 0 10px', color: accent, fontSize: '15px' }}>{title}</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: '520px', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr>
              {['Tên xe', 'Biển số xe', 'Ngày hết hạn', 'Trạng thái'].map(header => (
                <th key={header} style={{ padding: '8px', backgroundColor: '#f1f5f9', color: '#475569', textAlign: 'left' }}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ vehicle, expiryDate, daysRemaining }) => {
              const overdue = daysRemaining < 0;
              const status = overdue ? 'Đã quá hạn' : daysRemaining === 0 ? 'Hết hạn hôm nay' : `Còn ${daysRemaining} ngày`;
              return (
                <tr key={vehicle.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px' }}>{vehicle.vehicleName || '—'}</td>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{vehicle.plateNo || '—'}</td>
                  <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{expiryDate}</td>
                  <td style={{ padding: '8px', color: overdue ? '#b91c1c' : '#b45309', fontWeight: 800 }}>{status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  ) : null;
  const parentContracts = contracts.filter(contract => contract.contractType === 'PARENT' || !contract.contractType);
  const subContracts = contracts.filter(contract => contract.contractType === 'SUB');
  const isCompanyFrameReceipt = (slip: typeof slips[number]) => {
    const slipNo = String(slip.slipNo || '').toUpperCase();
    const type = String(slip.type || '').toUpperCase();
    return type === 'NK' || type === 'NHAP' || slipNo.startsWith('NK') ||
      ((type === 'NK_KHUNG' || type === 'KS' || slipNo.startsWith('KS')) &&
        !slip.sourceContractId && !slip.craftGroupLeader);
  };
  const frameReceipts = slips.filter(isCompanyFrameReceipt);
  const getParentReceivedQuantity = (contract: typeof parentContracts[number]) => {
    const contractNo = String(contract.contractNo || '').trim().toLowerCase();
    const productCode = String(contract.productCode || '').trim().toLowerCase();
    const sameCodeContracts = parentContracts.filter(parent =>
      String(parent.productCode || '').trim().toLowerCase() === productCode
    );
    return frameReceipts
      .filter(slip => {
        const slipContractNo = String(slip.contractNo || '').trim().toLowerCase();
        if (slipContractNo) return slipContractNo === contractNo;
        return sameCodeContracts.length === 1 &&
          String(slip.productCode || '').trim().toLowerCase() === productCode;
      })
      .reduce((sum, slip) => sum + (Number(slip.quantity) || 0), 0);
  };
  const todayDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const getDeadlineRow = (
    contract: typeof contracts[number],
    deadlineType: string,
    deadlineDate: string | undefined,
    contactName: string
  ) => {
    if (!deadlineDate) return [];
    const parsedDate = parseScheduleDate(deadlineDate);
    if (!parsedDate) return [];
    const daysRemaining = Math.round((parsedDate.getTime() - todayDate.getTime()) / 86400000);
    if (daysRemaining > 3) return [];
    return [{
      contract,
      deadlineType,
      deadlineDate,
      daysRemaining,
      contactName
    }];
  };
  const companyDeadlineRows = parentContracts.flatMap(contract => {
    const targetQuantity = Number(contract.quantity) || 0;
    const receivedQuantity = getParentReceivedQuantity(contract);
    if (contract.isLiquidated || targetQuantity <= 0 || receivedQuantity >= targetQuantity) return [];
    return getDeadlineRow(
      contract,
      `Hạn HĐ Cty: ${contract.contractNo || '—'}`,
      contract.dueDate,
      contract.companyName || contract.company || '—'
    );
  });
  const weavingDeadlineRows = subContracts.flatMap(contract => {
    const linkedParent = parentContracts.find(parent =>
      String(parent.contractNo || '').trim().toLocaleLowerCase('vi') ===
      String(contract.parentContractNo || '').trim().toLocaleLowerCase('vi')
    );
    const targetQuantity = Number(contract.quantity) || 0;
    const loggedQuantity = (Array.isArray(contract.exportLogs) ? contract.exportLogs : [])
      .reduce((sum, log) => sum + (Number(log.actualQty) || 0), 0);
    const completedQuantity = Math.max(Number(contract.totalActualExported) || 0, loggedQuantity);
    if (
      contract.isLiquidated ||
      linkedParent?.isLiquidated ||
      (targetQuantity > 0 && completedQuantity >= targetQuantity)
    ) return [];
    return getDeadlineRow(
      contract,
      `Hạn Tổ Đan: ${contract.craftGroupLeader || '—'}`,
      contract.dueDate,
      contract.craftGroupLeader || '—'
    );
  });
  const deliveryDeadlineRows = [...companyDeadlineRows, ...weavingDeadlineRows].sort((first, second) =>
    first.daysRemaining - second.daysRemaining ||
    String(first.contract.contractNo || '').localeCompare(String(second.contract.contractNo || ''), 'vi')
  );
  const overdueDeliveryDeadlines = deliveryDeadlineRows.filter(row => row.daysRemaining < 0);
  const dueTodayDeliveryDeadlines = deliveryDeadlineRows.filter(row => row.daysRemaining === 0);
  const upcomingDeliveryDeadlines = deliveryDeadlineRows.filter(row => row.daysRemaining > 0);
  const deliveryDeadlineGroups = [
    { label: 'SẮP TỚI HẠN · 1–3 NGÀY', rows: upcomingDeliveryDeadlines, color: '#a16207', backgroundColor: '#fef3c7', borderColor: '#fcd34d' },
    { label: 'TỚI HẠN · HÔM NAY', rows: dueTodayDeliveryDeadlines, color: '#c2410c', backgroundColor: '#ffedd5', borderColor: '#fdba74' },
    { label: 'TRỄ HẠN', rows: overdueDeliveryDeadlines, color: '#b91c1c', backgroundColor: '#fee2e2', borderColor: '#fca5a5' }
  ];
  const parentContractsByNo = new Map<string, typeof parentContracts[number]>();
  parentContracts.forEach(contract => {
    const contractNo = String(contract.contractNo || '').trim().toLowerCase();
    const key = contractNo || `id:${contract.id}`;
    if (!parentContractsByNo.has(key)) parentContractsByNo.set(key, contract);
  });

  const receivedFramesByParent = parentContracts.map(contract => {
    const received = getParentReceivedQuantity(contract);
    const quantity = Number(contract.quantity) || 0;
    return { received, quantity };
  });

  const parentContractCount = parentContractsByNo.size;
  const totalParentQty = parentContracts.reduce((sum, contract) => sum + (Number(contract.quantity) || 0), 0);
  const completeParentContracts = receivedFramesByParent.filter(item =>
    item.quantity > 0 && item.received >= item.quantity
  ).length;
  const totalReceivedFrames = frameReceipts.reduce((sum, slip) => sum + (Number(slip.quantity) || 0), 0);
  const matchedReceivedFrames = receivedFramesByParent.reduce((sum, item) => sum + item.received, 0);
  const totalSubQty = subContracts.reduce((sum, contract) => sum + (Number(contract.quantity) || 0), 0);
  const totalSubReceived = subContracts.reduce((sum, contract) => {
    const logTotal = (Array.isArray(contract.exportLogs) ? contract.exportLogs : [])
      .reduce((logSum, log) => logSum + (Number(log.actualQty) || 0), 0);
    return sum + Math.max(Number(contract.totalActualExported) || 0, logTotal);
  }, 0);
  const completeSubContracts = subContracts.filter(contract => {
    const logTotal = (Array.isArray(contract.exportLogs) ? contract.exportLogs : [])
      .reduce((sum, log) => sum + (Number(log.actualQty) || 0), 0);
    const received = Math.max(Number(contract.totalActualExported) || 0, logTotal);
    const quantity = Number(contract.quantity) || 0;
    return quantity > 0 && received >= quantity;
  }).length;

  const companyContractValue = parentContracts.reduce((sum, contract) => sum + (Number(contract.totalAmount) || 0), 0);
  const weavingContractValue = subContracts.reduce((sum, contract) => sum + (Number(contract.totalAmount) || 0), 0);
  const remainingContractValue = companyContractValue - weavingContractValue;
  const materialTotals = new Map<string, { name: string; unit: string; quantity: number }>();
  subContracts.forEach(contract => {
    (Array.isArray(contract.accompanyingMaterials) ? contract.accompanyingMaterials : []).forEach(material => {
      const name = material.materialName || material.materialCode || 'Nguyên vật liệu';
      const key = `${material.materialId}-${material.unit}`;
      const existing = materialTotals.get(key);
      materialTotals.set(key, {
        name,
        unit: material.unit,
        quantity: (existing?.quantity || 0) + (Number(material.quantity) || 0)
      });
    });
  });
  const topMaterials = Array.from(materialTotals.values())
    .sort((first, second) => second.quantity - first.quantity)
    .slice(0, 5);
  const contractDebts = subContracts
    .map(contract => ({
      contract,
      summary: getContractFinancialSummary(contract)
    }))
    .filter(item => item.summary.outstanding > 0 && item.summary.debtDueDate)
    .map(item => ({
      ...item,
      dueStatus: getDebtDueStatus(item.summary.debtDueDate, item.summary.outstanding)
    }))
    .sort((first, second) =>
      String(first.summary.debtDueDate).localeCompare(String(second.summary.debtDueDate))
    );
  const overdueDebts = contractDebts.filter(item => item.dueStatus === 'overdue');
  const dueTodayDebts = contractDebts.filter(item => item.dueStatus === 'due-today');
  const upcomingDebts = contractDebts.filter(item => item.dueStatus === 'upcoming');

  const parentProgressPercent = totalParentQty > 0
    ? Math.min(100, Math.round((matchedReceivedFrames / totalParentQty) * 100))
    : 0;
  const subProgressPercent = totalSubQty > 0
    ? Math.min(100, Math.round((totalSubReceived / totalSubQty) * 100))
    : 0;

  return (
    <section aria-label="Tổng quan hoạt động xưởng" style={{ display: 'grid', gap: '18px' }}>
      <header style={{ padding: '4px 2px' }}>
        <h2 style={{ margin: '0 0 6px', color: '#0f172a', fontSize: '22px', fontWeight: 800 }}>
          📊 Dashboard
        </h2>
        <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
          Số liệu tổng hợp trực tiếp từ hợp đồng và phiếu kho đang lưu trong hệ thống.
        </p>
      </header>

      {lowStockMaterials.length > 0 && (
        <section
          aria-label="Cảnh báo tồn kho thấp"
          style={{ ...cardStyle, backgroundColor: '#fef2f2', borderColor: '#fca5a5' }}
        >
          <h3 style={{ margin: '0 0 12px', color: '#b91c1c', fontSize: '17px' }}>
            ⚠️ Cảnh Báo Tồn Kho Thấp
          </h3>
          <div style={{ display: 'grid', gap: '8px' }}>
            {lowStockMaterials.map(material => (
              <div
                key={material.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '8px 16px',
                  alignItems: 'center',
                  padding: '10px 12px',
                  backgroundColor: '#fff',
                  border: '1px solid #fecaca',
                  borderRadius: '7px',
                  color: '#7f1d1d'
                }}
              >
                <strong>{material.name}</strong>
                <span>Tồn hiện tại: <strong>{formatNumber(material.closing)} {material.unit}</strong></span>
                <span>Hạn mức: <strong>{formatNumber(material.minimum)} {material.unit}</strong></span>
                <span>Cần mua bổ sung: <strong>{formatNumber(material.purchaseQuantity)} {material.unit}</strong></span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Tiến độ hợp đồng" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px' }}>
        <article style={{ ...cardStyle, backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }}>
          <div style={{ color: '#1d4ed8', fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em' }}>HỢP ĐỒNG CÔNG TY</div>
          <div style={{ marginTop: '10px', color: '#1e3a8a', fontSize: '25px', fontWeight: 800 }}>{formatNumber(parentContractCount)}</div>
          <div style={{ marginTop: '4px', color: '#475569', fontSize: '13px' }}>Tổng số hợp đồng · {formatNumber(totalParentQty)} sản phẩm</div>
          <div style={{ marginTop: '14px', color: '#334155', fontSize: '13px' }}>
            Đã nhận khung: <strong>{formatNumber(matchedReceivedFrames)}</strong> / {formatNumber(totalParentQty)}
          </div>
          <div style={{ height: '7px', marginTop: '8px', overflow: 'hidden', borderRadius: '999px', backgroundColor: '#dbeafe' }}>
            <div style={{ width: `${parentProgressPercent}%`, height: '100%', borderRadius: '999px', backgroundColor: '#2563eb' }} />
          </div>
          <small style={{ display: 'block', marginTop: '5px', color: '#64748b' }}>
            {parentProgressPercent}% tiến độ · {completeParentContracts} hợp đồng đã nhận đủ khung
          </small>
        </article>

        <article style={{ ...cardStyle, backgroundColor: '#faf5ff', borderColor: '#e9d5ff' }}>
          <div style={{ color: '#7e22ce', fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em' }}>HỢP ĐỒNG TỔ ĐAN</div>
          <div style={{ marginTop: '10px', color: '#581c87', fontSize: '25px', fontWeight: 800 }}>{formatNumber(subContracts.length)}</div>
          <div style={{ marginTop: '4px', color: '#475569', fontSize: '13px' }}>Tổng số hợp đồng · {formatNumber(totalSubQty)} sản phẩm</div>
          <div style={{ marginTop: '14px', color: '#334155', fontSize: '13px' }}>
            Đã xuất/nhận khung: <strong>{formatNumber(totalSubReceived)}</strong> / {formatNumber(totalSubQty)}
          </div>
          <div style={{ height: '7px', marginTop: '8px', overflow: 'hidden', borderRadius: '999px', backgroundColor: '#f3e8ff' }}>
            <div style={{ width: `${subProgressPercent}%`, height: '100%', borderRadius: '999px', backgroundColor: '#9333ea' }} />
          </div>
          <small style={{ display: 'block', marginTop: '5px', color: '#64748b' }}>
            {subProgressPercent}% tiến độ · {completeSubContracts} hợp đồng đã nhận đủ
          </small>
        </article>
      </section>

      <section aria-label="Tình hình kho" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
        <article style={{ ...cardStyle, backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }}>
          <div style={{ color: '#0369a1', fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em' }}>KHO KHUNG SƠN</div>
          <div style={{ marginTop: '12px', color: '#075985', fontSize: '28px', fontWeight: 800 }}>{formatNumber(totalReceivedFrames)}</div>
          <div style={{ marginTop: '3px', color: '#475569', fontSize: '13px' }}>Tổng số khung nhập kho theo phiếu KS</div>
          <small style={{ display: 'block', marginTop: '12px', color: '#64748b' }}>
            Khung đối chiếu được với HĐ CTY: {formatNumber(matchedReceivedFrames)}
          </small>
        </article>

        <article style={{ ...cardStyle, backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
          <div style={{ color: '#15803d', fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em' }}>NGUYÊN PHỤ LIỆU ĐÃ CẤP TỔ ĐAN</div>
          {topMaterials.length > 0 ? (
            <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
              {topMaterials.map(material => (
                <div key={`${material.name}-${material.unit}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', color: '#334155', fontSize: '13px' }}>
                  <span>{material.name}</span>
                  <strong style={{ whiteSpace: 'nowrap', color: '#166534' }}>{formatNumber(material.quantity)} {material.unit}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: '12px', color: '#64748b', fontSize: '13px' }}>Chưa có dữ liệu phụ liệu trên hợp đồng Tổ Đan.</div>
          )}
        </article>
      </section>

      {(expiryWarnings.insurance.length > 0 || expiryWarnings.registration.length > 0) && (
        <section aria-label="Cảnh báo hạn giấy tờ xe" style={{ display: 'grid', gap: '12px' }}>
          <h3 style={{ margin: 0, color: '#1e293b', fontSize: '16px' }}>🚗 Cảnh Báo Xe Tới Hạn / Hết Hạn</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
            {renderExpiryTable('🛡️ Cảnh báo Hạn Bảo Hiểm', expiryWarnings.insurance, '#b91c1c')}
            {renderExpiryTable('📋 Cảnh báo Hạn Đăng Kiểm', expiryWarnings.registration, '#b91c1c')}
          </div>
        </section>
      )}

      {maintenanceWarnings.length > 0 && (
        <section aria-label="Cảnh báo bảo dưỡng xe" style={{ ...cardStyle, backgroundColor: '#fffbeb', borderColor: '#fbbf24' }}>
          <h3 style={{ margin: '0 0 10px', color: '#92400e', fontSize: '16px' }}>⚠️ Cảnh Báo Bảo Dưỡng / Thay Nhớt Xe</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['Biển số xe', 'Km hiện tại', 'Km mốc cần bảo dưỡng', 'Km còn lại', 'Trung bình Km/ngày', 'Thao tác'].map(header => (
                    <th key={header} style={{ padding: '8px', backgroundColor: '#fef3c7', color: '#78350f', textAlign: 'left' }}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {maintenanceWarnings.map(warning => {
                  const overdue = warning.kmRemaining <= 0;
                  return (
                    <tr key={warning.vehicle.id} style={{ borderTop: '1px solid #fde68a', backgroundColor: overdue ? '#fef2f2' : 'transparent' }}>
                      <td style={{ padding: '8px', fontWeight: 800 }}>{warning.vehicle.plateNo}</td>
                      <td style={{ padding: '8px' }}>{formatNumber(warning.currentKm)} km</td>
                      <td style={{ padding: '8px' }}>{formatNumber(warning.targetKm)} km</td>
                      <td style={{ padding: '8px', color: overdue ? '#b91c1c' : '#92400e', fontWeight: 800 }}>
                        {overdue ? `Vượt ${formatNumber(Math.abs(warning.kmRemaining))} km` : `${formatNumber(warning.kmRemaining)} km`}
                        {!overdue && warning.estimatedDaysRemaining !== null && ` · ~${warning.estimatedDaysRemaining} ngày`}
                      </td>
                      <td style={{ padding: '8px' }}>{formatNumber(warning.averageKmPerDay)} km/ngày</td>
                      <td style={{ padding: '8px' }}>
                        <button type="button" onClick={() => confirmMaintenance(warning)} style={{ padding: '6px 9px', border: 0, borderRadius: '5px', background: '#059669', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                          Đã thay & sửa chữa
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {deliveryDeadlineRows.length > 0 && (
        <section aria-label="Tiến độ và hạn giao hàng hợp đồng" style={{ ...cardStyle, backgroundColor: '#fff', borderColor: '#fecaca' }}>
          <div style={{ marginBottom: '12px' }}>
            <h3 style={{ margin: '0 0 4px', color: '#1e293b', fontSize: '16px' }}>🚨 Theo Dõi Tiến Độ &amp; Hạn Giao Hàng</h3>
            <small style={{ color: '#64748b' }}>Theo dõi riêng hạn Tổ Đan và hạn Hợp đồng Công ty của các hợp đồng chưa hoàn tất hoặc chưa thanh lý.</small>
          </div>
          <div style={{ display: 'grid', gap: '14px' }}>
            {deliveryDeadlineGroups.filter(group => group.rows.length > 0).map(group => (
              <article key={group.label} style={{ overflow: 'hidden', border: `1px solid ${group.borderColor}`, borderRadius: '8px' }}>
                <h4 style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', margin: 0, padding: '10px 12px', backgroundColor: group.backgroundColor, color: group.color, fontSize: '13px' }}>
                  <span>{group.label}</span>
                  <span>{formatNumber(group.rows.length)} mốc hạn</span>
                </h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: '850px', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr>
                        {['Mã Hợp Đồng', 'Tên Tổ Đan', 'Số Điện Thoại / Zalo', 'Mốc Hạn', 'Ngày Hết Hạn', 'Trạng Thái / Số Ngày'].map(header => (
                          <th key={header} style={{ padding: '9px 10px', backgroundColor: '#f8fafc', color: '#475569', textAlign: 'left', fontSize: '12px' }}>{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map(({ contract, deadlineType, deadlineDate, daysRemaining, contactName }) => {
                        const status = daysRemaining < 0
                          ? `Trễ ${formatNumber(Math.abs(daysRemaining))} ngày`
                          : daysRemaining === 0
                            ? 'Đến hạn hôm nay · 0 ngày'
                            : `Còn ${formatNumber(daysRemaining)} ngày`;
                        return (
                          <tr key={`${contract.id}-${deadlineType}`} style={{ borderTop: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '9px 10px', fontWeight: 800 }}>{contract.contractNo || '—'}</td>
                            <td style={{ padding: '9px 10px' }}>{contactName}</td>
                            <td style={{ padding: '9px 10px' }}>{contract.zalo || contract.phone || '—'}</td>
                            <td style={{ padding: '9px 10px', fontWeight: 700 }}>{deadlineType}</td>
                            <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>{formatScheduleDate(deadlineDate)}</td>
                            <td style={{ padding: '9px 10px', color: group.color, fontWeight: 800 }}>{status}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {contractDebts.length > 0 && (
      <section aria-label="Theo dõi hạn công nợ" style={{ ...cardStyle, backgroundColor: '#fff', borderColor: '#e2e8f0' }}>
        <div style={{ marginBottom: '12px' }}>
          <h3 style={{ margin: '0 0 4px', color: '#1e293b', fontSize: '16px' }}>⏰ Theo Dõi Hạn Công Nợ Tổ Đan</h3>
          <small style={{ color: '#64748b' }}>Tự động cảnh báo theo ngày hiện tại; các khoản đã thanh toán đủ sẽ không còn cảnh báo.</small>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginBottom: '14px' }}>
          {[
            { label: 'TRỄ HẠN', rows: overdueDebts, color: '#b91c1c', backgroundColor: '#fee2e2' },
            { label: 'ĐẾN HẠN HÔM NAY', rows: dueTodayDebts, color: '#c2410c', backgroundColor: '#ffedd5' },
            { label: 'SẮP TỚI HẠN · 3 NGÀY', rows: upcomingDebts, color: '#a16207', backgroundColor: '#fef3c7' }
          ].filter(group => group.rows.length > 0).map(group => (
            <div key={group.label} style={{ padding: '12px', borderRadius: '8px', backgroundColor: group.backgroundColor }}>
              <small style={{ color: group.color, fontWeight: 800 }}>{group.label}</small>
              <div style={{ marginTop: '4px', color: group.color, fontSize: '22px', fontWeight: 800 }}>{formatNumber(group.rows.length)}</div>
              <small style={{ color: group.color }}>Còn nợ: {formatCurrency(group.rows.reduce((sum, item) => sum + item.summary.outstanding, 0))}</small>
            </div>
          ))}
        </div>
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '680px', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['Tổ Đan / Hợp Đồng', 'Mã Hàng', 'Công Nợ Còn Lại', 'Hạn Trả Nợ', 'Cảnh Báo'].map(header => (
                    <th key={header} style={{ padding: '9px 10px', backgroundColor: '#f1f5f9', color: '#475569', textAlign: 'left', fontSize: '12px' }}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contractDebts.map(({ contract, summary, dueStatus }) => {
                  const badge = getDebtDueBadge(dueStatus);
                  return (
                    <tr key={contract.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '9px 10px' }}>{contract.craftGroupLeader || '—'} · {contract.contractNo || '—'}</td>
                      <td style={{ padding: '9px 10px' }}>{contract.productCode || '—'}</td>
                      <td style={{ padding: '9px 10px', color: '#b91c1c', fontWeight: 800 }}>{formatCurrency(summary.outstanding)}</td>
                      <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>{summary.debtDueDate}</td>
                      <td style={{ padding: '9px 10px' }}>
                        {badge ? (
                          <span style={{ display: 'inline-block', padding: '4px 8px', borderRadius: '999px', color: badge.color, backgroundColor: badge.backgroundColor, fontWeight: 800 }}>{badge.label}</span>
                        ) : <span style={{ color: '#64748b' }}>Chưa đến hạn</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </div>
      </section>
      )}

      <section aria-label="Tổng hợp tài chính hợp đồng" style={{ ...cardStyle, backgroundColor: '#fff', borderColor: '#e2e8f0' }}>
        <div style={{ marginBottom: '12px' }}>
          <h3 style={{ margin: '0 0 4px', color: '#1e293b', fontSize: '16px' }}>💰 Tổng Hợp Giá Trị Hợp Đồng</h3>
          <small style={{ color: '#64748b' }}>Số liệu theo tổng giá trị hợp đồng, không phải số tiền thực thu/chi.</small>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#f0fdf4' }}>
            <small style={{ color: '#166534', fontWeight: 800 }}>THU DỰ KIẾN · HĐ CTY</small>
            <div style={{ marginTop: '5px', color: '#15803d', fontSize: '19px', fontWeight: 800 }}>{formatCurrency(companyContractValue)}</div>
          </div>
          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#fff1f2' }}>
            <small style={{ color: '#9f1239', fontWeight: 800 }}>CHI DỰ KIẾN · HĐ TỔ ĐAN</small>
            <div style={{ marginTop: '5px', color: '#be123c', fontSize: '19px', fontWeight: 800 }}>{formatCurrency(weavingContractValue)}</div>
          </div>
          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: remainingContractValue >= 0 ? '#eff6ff' : '#fff7ed' }}>
            <small style={{ color: remainingContractValue >= 0 ? '#1e40af' : '#9a3412', fontWeight: 800 }}>CÒN LẠI DỰ KIẾN</small>
            <div style={{ marginTop: '5px', color: remainingContractValue >= 0 ? '#1d4ed8' : '#c2410c', fontSize: '19px', fontWeight: 800 }}>
              {formatCurrency(remainingContractValue)}
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
