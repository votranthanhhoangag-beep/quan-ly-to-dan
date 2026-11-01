import { Fragment, useMemo, useState } from 'react';
import { useApp, type ContractItem, type DefectiveGoodsImportSlip, type ExpenseItem, type KnittingExportSlip, type SlipItem } from '../context/AppContext';
import ExpenseAllocationManager from './ExpenseAllocationManager';

type ReportTab = 'revenue' | 'expenses' | 'vat';

interface VatInputRow {
  expense: ExpenseItem;
  description: string;
  taxableAmount: number;
  vatRatePercent: number;
  vatAmount: number;
}

interface RevenueContractRow {
  contract: ContractItem;
  quantity: number;
  unitPrice: number;
  grossAmount: number;
  depositAmount: number;
  amount: number;
  completionDate: string;
  exports: Array<{ slip: KnittingExportSlip; quantity: number; amount: number }>;
}

interface ExpenseLine {
  category: 'Tiền trả hàng đan' | 'Sửa khoán' | 'Chi phí phát sinh';
  categoryLabel: string;
  name: string;
  unit: string;
  date: string;
  amount: number;
  quantity: number;
  note: string;
  reference: string;
  contractId?: string;
}

interface ExpenseGroup {
  category: ExpenseLine['category'];
  categoryLabel: string;
  name: string;
  unit: string;
  amount: number;
  quantity: number;
  notes: Set<string>;
  lineCount: number;
  contractId?: string;
}

const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const formatCurrency = (amount: number) => `${amount.toLocaleString('vi-VN')} đ`;
const formatNumber = (amount: number) => amount.toLocaleString('vi-VN');
const isInMonth = (date: string | undefined, month: string) => Boolean(date && date.slice(0, 7) === month);

const findCompanyContract = (
  contracts: ContractItem[],
  slip: KnittingExportSlip
) => contracts.find(contract =>
  contract.contractType !== 'SUB' &&
  (slip.companyBContractId !== undefined
    ? String(contract.id) === String(slip.companyBContractId)
    : String(contract.contractNo || '').trim().toLowerCase() === String(slip.companyBContractNo || '').trim().toLowerCase()) &&
  String(contract.productCode || '').trim().toLowerCase() === String(slip.productCode || '').trim().toLowerCase()
);

const findCompanyContractByReference = (
  contracts: ContractItem[],
  contractNo: string | undefined,
  productCode: string | undefined,
  contractId?: number | string
) => contracts.find(contract =>
  contract.contractType !== 'SUB' &&
  (contractId !== undefined
    ? String(contract.id) === String(contractId)
    : String(contract.contractNo || '').trim().toLowerCase() === String(contractNo || '').trim().toLowerCase()) &&
  (!productCode || String(contract.productCode || '').trim().toLowerCase() === productCode.trim().toLowerCase())
);

const getReceivedDeposit = (contract: ContractItem) => {
  const depositLogs = Array.isArray(contract.depositLogs) ? contract.depositLogs : [];
  const loggedDeposits = depositLogs.reduce((sum, log) => sum + (Number(log.amount) || 0), 0);
  const initialDeposit = contract.initialRequiredDeposit !== undefined
    ? Number(contract.initialRequiredDeposit) || 0
    : Math.max(0, (Number(contract.requiredDeposit) || 0) - loggedDeposits);
  return Math.max(Number(contract.requiredDeposit) || 0, initialDeposit + loggedDeposits);
};

const getRevenueRows = (
  contracts: ContractItem[],
  exports: KnittingExportSlip[],
  month: string
): RevenueContractRow[] => contracts
  .filter(contract => contract.contractType !== 'SUB')
  .flatMap(contract => {
    const targetQuantity = Number(contract.quantity) || 0;
    if (targetQuantity <= 0) return [];

    const contractExports = exports
      .filter(slip => String(findCompanyContract(contracts, slip)?.id) === String(contract.id))
      .slice()
      .sort((first, second) =>
        String(first.date).localeCompare(String(second.date)) ||
        String(first.slipNo).localeCompare(String(second.slipNo), 'vi', { numeric: true })
      );
    const exportedQuantity = contractExports.reduce(
      (sum, slip) => sum + Math.max(0, Number(slip.goodContractQuantity) || 0),
      0
    );
    if (exportedQuantity < targetQuantity) return [];

    let completedQuantity = 0;
    let completionDate = '';
    for (const slip of contractExports) {
      completedQuantity += Math.max(0, Number(slip.goodContractQuantity) || 0);
      if (completedQuantity >= targetQuantity) {
        completionDate = String(slip.date || '');
        break;
      }
    }
    if (!isInMonth(completionDate, month)) return [];

    const unitPrice = Number(contract.unitPrice) || 0;
    const grossAmount = targetQuantity * unitPrice;
    const depositAmount = getReceivedDeposit(contract);
    let remainingQuantity = targetQuantity;
    const details = contractExports.flatMap(slip => {
      const quantity = Math.min(remainingQuantity, Math.max(0, Number(slip.goodContractQuantity) || 0));
      remainingQuantity -= quantity;
      return quantity > 0 ? [{ slip, quantity, amount: quantity * unitPrice }] : [];
    });

    return [{
      contract,
      quantity: targetQuantity,
      unitPrice,
      grossAmount,
      depositAmount,
      amount: grossAmount - depositAmount,
      completionDate,
      exports: details
    }];
  })
  .sort((first, second) => second.completionDate.localeCompare(first.completionDate));

const getExpenseLines = (
  contracts: ContractItem[],
  knittingExports: KnittingExportSlip[],
  slips: SlipItem[],
  expenses: ExpenseItem[],
  defectiveImports: DefectiveGoodsImportSlip[],
  month: string
): ExpenseLine[] => {
  const receivedLines: ExpenseLine[] = contracts.flatMap(contract =>
    (Array.isArray(contract.receivedGoodsLogs) ? contract.receivedGoodsLogs : [])
      .filter(log => isInMonth(log.receivedDate, month))
      .flatMap(log => {
        const amount = (Number(log.paidAmount) || 0) + (Number(log.deductedDeposit) || 0);
        if (amount <= 0) return [];
        const linkedCompanyContracts = Array.from(new Map(knittingExports
          .filter(exportSlip => String(exportSlip.sourceContractId) === String(contract.id))
          .flatMap(exportSlip => {
            const companyContract = findCompanyContract(contracts, exportSlip);
            return companyContract ? [[String(companyContract.id), companyContract] as const] : [];
          })).values());
        const companyContract = linkedCompanyContracts.length === 1 ? linkedCompanyContracts[0] : undefined;
        return [{
          category: 'Tiền trả hàng đan',
          categoryLabel: 'Tiền trả hàng đan',
          name: `${contract.productName || contract.productCode || 'Hàng đan'} · ${contract.craftGroupLeader || 'Tổ đan'}`,
          unit: contract.unit || '',
          date: log.receivedDate,
          amount,
          quantity: Number(log.quantity) || 0,
          note: log.note?.trim() || '',
          reference: contract.contractNo || '',
          contractId: companyContract ? String(companyContract.id) : undefined
        }];
      })
  );

  const repairLines: ExpenseLine[] = slips
    .filter(slip => slip.type === 'XUAT_SUA_KHOAN' && isInMonth(slip.date, month))
    .flatMap(slip => {
      const lines = Array.isArray(slip.repairLines) ? slip.repairLines : [];
      if (lines.length > 0) {
        return lines.map(line => {
          const sourceImport = defectiveImports.find(item =>
            String(item.id) === String(line.sourceDefectiveGoodsImportSlipId)
          );
          const companyContract = sourceImport
            ? findCompanyContractByReference(
              contracts,
              sourceImport.companyBContractNo || sourceImport.parentContractNo,
              sourceImport.productCode,
              sourceImport.companyBContractId
            )
            : undefined;
          return ({
          category: 'Sửa khoán' as const,
          categoryLabel: 'Sửa khoán',
          name: line.productName || line.productCode || 'Sửa khoán',
          unit: 'Cái',
          date: slip.date,
          amount: Number(line.amount) || 0,
          quantity: Number(line.quantity) || 0,
          note: slip.note?.trim() || '',
          reference: slip.slipNo || '',
          contractId: companyContract ? String(companyContract.id) : undefined
          });
        });
      }
      const amount = Number(slip.repairTotal) || 0;
      return amount > 0 ? [{
        category: 'Sửa khoán' as const,
        categoryLabel: 'Sửa khoán',
        name: slip.productName || 'Sửa khoán',
        unit: slip.unit || '',
        date: slip.date,
        amount,
        quantity: Number(slip.quantity) || 0,
        note: slip.note?.trim() || '',
        reference: slip.slipNo || ''
      }] : [];
    });

  const otherExpenseLines: ExpenseLine[] = expenses
    .filter(expense => isInMonth(expense.date, month))
    .flatMap(expense => {
      const items = Array.isArray(expense.items) ? expense.items : [];
      const subtotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      if (items.length > 0) {
        return items.map(item => ({
          category: 'Chi phí phát sinh' as const,
          categoryLabel: expense.category && expense.category !== 'Nhiều khoản chi'
            ? expense.category
            : item.name || expense.expenseName || 'Chi phí phát sinh',
          name: item.name || expense.expenseName || expense.category || 'Khoản chi',
          unit: item.unit || '',
          date: expense.date,
          amount: (Number(item.amount) || 0) + (subtotal > 0
            ? (Number(expense.vatAmount) || 0) * (Number(item.amount) || 0) / subtotal
            : 0),
          quantity: Number(item.quantity) || 0,
          note: [expense.supplierName, expense.note, item.sourceNote].filter(Boolean).join(' · '),
          reference: expense.expenseCode || String(expense.id)
        }));
      }

      const amount = Number(expense.amount) || 0;
      return amount > 0 ? [{
        category: 'Chi phí phát sinh' as const,
        categoryLabel: expense.category && expense.category !== 'Nhiều khoản chi'
          ? expense.category
          : expense.expenseName || 'Chi phí phát sinh',
        name: expense.expenseName || expense.category || expense.note || 'Khoản chi',
        unit: '',
        date: expense.date,
        amount,
        quantity: 0,
        note: [expense.supplierName, expense.note].filter(Boolean).join(' · '),
        reference: expense.expenseCode || String(expense.id)
      }] : [];
    });

  return [...receivedLines, ...repairLines, ...otherExpenseLines]
    .sort((first, second) => second.date.localeCompare(first.date));
};

const cardStyle = {
  padding: '16px',
  border: '1px solid #e2e8f0',
  borderRadius: '9px',
  backgroundColor: '#fff'
} as const;

const cellStyle = {
  padding: '9px 10px',
  borderBottom: '1px solid #e2e8f0',
  textAlign: 'left' as const,
  verticalAlign: 'top' as const
};

export default function TaxExpenseManager() {
  const { contracts = [], knittingExportSlips = [], defectiveGoodsImportSlips = [], slips = [], expenses = [] } = useApp();
  const [activeTab, setActiveTab] = useState<'overview' | 'allocation'>('overview');
  const [reportTab, setReportTab] = useState<ReportTab>('revenue');
  const [month, setMonth] = useState(getCurrentMonth);
  const revenueRows = useMemo(
    () => getRevenueRows(contracts, knittingExportSlips, month),
    [contracts, knittingExportSlips, month]
  );
  const vatOutputRows = revenueRows.map(row => {
    const vatRatePercent = Math.min(100, Math.max(0, Number(row.contract.vatRatePercent) || 0));
    const vatAmount = row.grossAmount * vatRatePercent / 100;
    return {
      ...row,
      vatRatePercent,
      vatAmount,
      paymentAmount: row.grossAmount + vatAmount
    };
  }).filter(row => row.vatAmount > 0);
  const vatInputRows = useMemo<VatInputRow[]>(() => expenses
    .filter(expense => isInMonth(expense.date, month))
    .map(expense => {
      const totalAmount = Number(expense.amount) || 0;
      const vatRatePercent = Math.min(100, Math.max(0, Number(expense.vatRatePercent) || 0));
      const recordedVat = Number(expense.vatAmount) || 0;
      const vatAmount = recordedVat > 0
        ? recordedVat
        : vatRatePercent > 0
          ? totalAmount * vatRatePercent / (100 + vatRatePercent)
          : 0;
      const description = (Array.isArray(expense.items) ? expense.items : [])
        .map(item => `${item.name}${Number(item.quantity) > 0 ? ` (${formatNumber(Number(item.quantity))}${item.unit ? ` ${item.unit}` : ''})` : ''}`)
        .join('; ') || expense.expenseName || expense.category || expense.note || 'Phiếu chi';
      return {
        expense,
        description,
        taxableAmount: Math.max(0, totalAmount - vatAmount),
        vatRatePercent,
        vatAmount
      };
    })
    .filter(row => row.vatAmount > 0)
    .sort((first, second) => String(second.expense.date || '').localeCompare(String(first.expense.date || ''))),
  [expenses, month]);
  const totalOutputVat = vatOutputRows.reduce((sum, row) => sum + row.vatAmount, 0);
  const totalInputVat = vatInputRows.reduce((sum, row) => sum + row.vatAmount, 0);
  const vatBalance = totalOutputVat - totalInputVat;
  const expenseLines = useMemo(
    () => getExpenseLines(contracts, knittingExportSlips, slips, expenses, defectiveGoodsImportSlips, month),
    [contracts, knittingExportSlips, slips, expenses, defectiveGoodsImportSlips, month]
  );
  const expenseGroups = useMemo(() => {
    const groups = new Map<string, ExpenseGroup>();
    expenseLines.forEach(line => {
      const key = `${line.contractId || 'unassigned'}::${line.category}::${line.categoryLabel.trim().toLocaleLowerCase('vi')}::${line.unit}`;
      const group = groups.get(key) || {
        category: line.category,
        categoryLabel: line.categoryLabel,
        name: line.categoryLabel,
        unit: line.unit,
        amount: 0,
        quantity: 0,
        notes: new Set<string>(),
        lineCount: 0,
        contractId: line.contractId
      };
      group.amount += line.amount;
      group.quantity += line.quantity;
      group.lineCount += 1;
      const note = [line.date, line.reference, line.note].filter(Boolean).join(' · ');
      if (note) group.notes.add(note);
      groups.set(key, group);
    });
    return Array.from(groups.values()).sort((first, second) =>
      first.category.localeCompare(second.category, 'vi') ||
      first.name.localeCompare(second.name, 'vi', { sensitivity: 'base' })
    );
  }, [expenseLines]);
  const totalRevenue = revenueRows.reduce((sum, row) => sum + row.amount, 0);
  const totalGrossRevenue = revenueRows.reduce((sum, row) => sum + row.grossAmount, 0);
  const totalDeposits = revenueRows.reduce((sum, row) => sum + row.depositAmount, 0);
  const totalExpenses = expenseGroups.reduce((sum, group) => sum + group.amount, 0);
  const profit = totalRevenue - totalExpenses;
  const contractSummaries = Array.from(new Set([
    ...revenueRows.map(row => String(row.contract.id)),
    ...expenseGroups.flatMap(group => group.contractId ? [group.contractId] : [])
  ])).flatMap(contractId => {
    const contract = contracts.find(item => String(item.id) === contractId);
    if (!contract) return [];
    const revenue = revenueRows.find(row => String(row.contract.id) === contractId);
    const costs = expenseGroups.filter(group => group.contractId === contractId);
    const costTotal = costs.reduce((sum, group) => sum + group.amount, 0);
    return [{
      contract,
      revenue,
      costs,
      costTotal,
      profit: (revenue?.amount || 0) - costTotal
    }];
  }).sort((first, second) =>
    String(first.contract.contractNo || '').localeCompare(String(second.contract.contractNo || ''), 'vi', { numeric: true })
  );
  const sharedExpenseGroups = expenseGroups.filter(group => !group.contractId);

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <header style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#1e293b', fontSize: '20px' }}>📊 Doanh Thu và Chi Phí</h2>
          <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: '13px' }}>Tổng hợp tự động từ hợp đồng, phiếu xuất, phiếu nhận và phiếu chi.</p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', fontSize: '13px', fontWeight: 700 }}>
          Kỳ báo cáo
          <input type="month" value={month} onChange={event => setMonth(event.target.value)} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#1e293b' }} />
        </label>
      </header>

      <nav aria-label="Doanh thu, chi phí và phân bổ" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {([
          { id: 'overview', label: '📊 Tổng Hợp Doanh Thu & Chi Phí' },
          { id: 'allocation', label: '🧮 Phân Bổ Chi Phí' }
        ] as const).map(tab => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{ padding: '10px 16px', border: 0, borderRadius: '7px', backgroundColor: activeTab === tab.id ? '#1d4ed8' : '#e2e8f0', color: activeTab === tab.id ? '#fff' : '#334155', fontWeight: 800, cursor: 'pointer' }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'allocation' ? <ExpenseAllocationManager /> : (
      <>
      <section aria-label="Tổng hợp kết quả kinh doanh" style={{ ...cardStyle, display: 'grid', gap: '14px', borderColor: '#93c5fd', boxShadow: '0 4px 16px rgba(30, 64, 175, 0.08)' }}>
        <div>
          <h3 style={{ margin: 0, color: '#1e3a8a', fontSize: '18px' }}>📊 Bảng Tổng Hợp Kết Quả Kinh Doanh</h3>
          <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: '12px' }}>
            Chi phí được gắn vào hợp đồng khi dữ liệu nguồn có liên kết rõ ràng; khoản chi chung được tách riêng, không phân bổ tùy ý.
          </p>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '1050px', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#dbeafe', color: '#1e3a8a' }}>
                {['SỐ HĐ', 'CHI PHÍ', 'DIỄN GIẢI', 'TIỀN CỌC', 'SỐ TIỀN', 'LỢI NHUẬN', 'GHI CHÚ'].map(label => (
                  <th key={label} style={{ ...cellStyle, fontWeight: 800 }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contractSummaries.map(({ contract, revenue, costs, costTotal, profit: contractProfit }) => (
                <Fragment key={`contract-${String(contract.id)}`}>
                  <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800 }}>
                    <td style={cellStyle}>{contract.contractNo || '—'}<br /><small>{contract.productCode || ''}</small></td>
                    <td style={cellStyle}>{costTotal > 0 ? `Tổng chi phí liên kết: ${formatCurrency(costTotal)}` : '—'}</td>
                    <td style={cellStyle}>{contract.productCode || '—'}</td>
                    <td style={cellStyle}>{formatCurrency(revenue?.depositAmount || getReceivedDeposit(contract))}</td>
                    <td style={cellStyle}>{formatCurrency(revenue?.grossAmount || 0)}</td>
                    <td style={{ ...cellStyle, color: contractProfit >= 0 ? '#166534' : '#b91c1c' }}>{formatCurrency(contractProfit)}</td>
                    <td style={cellStyle}>{contract.note?.trim() || (revenue ? `Hoàn thành ngày ${revenue.completionDate}` : 'Chưa hoàn thành doanh thu trong kỳ')}</td>
                  </tr>
                  {costs.map(group => (
                    <tr key={`cost-${String(contract.id)}-${group.category}-${group.name}`}>
                      <td style={{ ...cellStyle, paddingLeft: '24px', color: '#64748b' }}>↳</td>
                      <td style={cellStyle}>{group.categoryLabel}<br /><small style={{ color: '#64748b' }}>{group.lineCount} đợt</small></td>
                      <td style={cellStyle}>{contract.productCode || '—'}</td>
                      <td style={cellStyle}>—</td>
                      <td style={{ ...cellStyle, color: '#9a3412', fontWeight: 700 }}>{formatCurrency(group.amount)}</td>
                      <td style={cellStyle}>—</td>
                      <td style={{ ...cellStyle, whiteSpace: 'pre-wrap' }}>{Array.from(group.notes).join('\n') || '—'}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {sharedExpenseGroups.length > 0 && (
                <>
                  <tr style={{ backgroundColor: '#fff7ed', fontWeight: 800 }}>
                    <td style={cellStyle}>CHI PHÍ CHUNG</td>
                    <td style={cellStyle}>Chưa gắn được với hợp đồng cụ thể</td>
                    <td style={cellStyle}>—</td>
                    <td style={cellStyle}>—</td>
                    <td style={{ ...cellStyle, color: '#9a3412' }}>{formatCurrency(sharedExpenseGroups.reduce((sum, group) => sum + group.amount, 0))}</td>
                    <td style={cellStyle}>—</td>
                    <td style={cellStyle}>Không phân bổ vào lợi nhuận hợp đồng</td>
                  </tr>
                  {sharedExpenseGroups.map(group => (
                    <tr key={`shared-${group.category}-${group.name}-${group.unit}`}>
                      <td style={{ ...cellStyle, paddingLeft: '24px', color: '#64748b' }}>↳</td>
                      <td style={cellStyle}>{group.categoryLabel}<br /><small style={{ color: '#64748b' }}>{group.lineCount} đợt</small></td>
                      <td style={cellStyle}>—</td>
                      <td style={cellStyle}>—</td>
                      <td style={{ ...cellStyle, color: '#9a3412', fontWeight: 700 }}>{formatCurrency(group.amount)}</td>
                      <td style={cellStyle}>—</td>
                      <td style={{ ...cellStyle, whiteSpace: 'pre-wrap' }}>{Array.from(group.notes).join('\n') || '—'}</td>
                    </tr>
                  ))}
                </>
              )}
              {contractSummaries.length === 0 && sharedExpenseGroups.length === 0 && (
                <tr><td colSpan={7} style={{ ...cellStyle, padding: '20px', textAlign: 'center', color: '#64748b' }}>Không có doanh thu hoặc chi phí trong kỳ này.</td></tr>
              )}
            </tbody>
            {(contractSummaries.length > 0 || sharedExpenseGroups.length > 0) && (
              <tfoot>
                <tr style={{ backgroundColor: '#eff6ff', fontWeight: 800 }}>
                  <td style={cellStyle}>TỔNG CỘNG</td>
                  <td style={cellStyle}>Tổng chi phí</td>
                  <td style={cellStyle}>—</td>
                  <td style={cellStyle}>{formatCurrency(totalDeposits)}</td>
                  <td style={cellStyle}>{formatCurrency(totalGrossRevenue)}</td>
                  <td style={{ ...cellStyle, color: profit >= 0 ? '#166534' : '#b91c1c' }}>{formatCurrency(profit)}</td>
                  <td style={cellStyle}>Doanh thu thực nhận: {formatCurrency(totalRevenue)} − Chi phí: {formatCurrency(totalExpenses)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <nav aria-label="Báo cáo doanh thu và chi phí" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
        {([
          { id: 'revenue', label: '📈 Doanh Thu' },
          { id: 'expenses', label: '💸 Chi Phí' },
          { id: 'vat', label: '🧾 Báo Cáo Thuế GTGT' }
        ] as const).map(tab => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={reportTab === tab.id}
            onClick={() => setReportTab(tab.id)}
            style={{ padding: '10px 16px', border: 0, borderRadius: '7px', backgroundColor: reportTab === tab.id ? '#1d4ed8' : '#e2e8f0', color: reportTab === tab.id ? '#fff' : '#334155', fontWeight: 800, cursor: 'pointer' }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {reportTab === 'revenue' ? (
        <section style={{ display: 'grid', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <article style={{ ...cardStyle, backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
              <div style={{ color: '#166534', fontSize: '12px', fontWeight: 800 }}>DOANH THU THỰC NHẬN SAU TIỀN CỌC</div>
              <strong style={{ display: 'block', marginTop: '6px', color: '#166534', fontSize: '22px' }}>{formatCurrency(totalRevenue)}</strong>
            </article>
            <article style={{ ...cardStyle, backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }}>
              <div style={{ color: '#1d4ed8', fontSize: '12px', fontWeight: 800 }}>HỢP ĐỒNG HOÀN THÀNH TRONG KỲ</div>
              <strong style={{ display: 'block', marginTop: '6px', color: '#1d4ed8', fontSize: '22px' }}>{formatNumber(revenueRows.length)}</strong>
            </article>
          </div>

          <article style={cardStyle}>
            <h3 style={{ margin: '0 0 12px', color: '#1e293b', fontSize: '16px' }}>Tổng hợp doanh thu theo hợp đồng</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '820px', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead><tr style={{ backgroundColor: '#f1f5f9' }}>
                  {['Hợp đồng Công ty B', 'Công ty / Đối tác', 'Mã hàng', 'Ngày hoàn thành', 'Số lượng hoàn thành', 'Đơn giá', 'Tổng giá trị', 'Tiền cọc', 'Doanh thu thực nhận'].map(label => <th key={label} style={cellStyle}>{label}</th>)}
                </tr></thead>
                <tbody>
                  {revenueRows.map(({ contract, quantity, unitPrice, grossAmount, depositAmount, amount, completionDate }) => (
                    <tr key={String(contract.id)}>
                      <td style={cellStyle}>{contract.contractNo || '—'}</td>
                      <td style={cellStyle}>{contract.companyName || contract.company || contract.partner || '—'}</td>
                      <td style={cellStyle}>{contract.productCode || '—'}</td>
                      <td style={cellStyle}>{completionDate}</td>
                      <td style={cellStyle}>{formatNumber(quantity)} {contract.unit || ''}</td>
                      <td style={cellStyle}>{formatCurrency(unitPrice)}</td>
                      <td style={cellStyle}>{formatCurrency(grossAmount)}</td>
                      <td style={cellStyle}>{formatCurrency(depositAmount)}</td>
                      <td style={{ ...cellStyle, color: '#166534', fontWeight: 800 }}>{formatCurrency(amount)}</td>
                    </tr>
                  ))}
                  {revenueRows.length === 0 && <tr><td colSpan={9} style={{ ...cellStyle, padding: '20px', textAlign: 'center', color: '#64748b' }}>Không có hợp đồng hoàn thành trong kỳ này.</td></tr>}
                </tbody>
                {revenueRows.length > 0 && <tfoot><tr style={{ backgroundColor: '#f0fdf4', fontWeight: 800 }}>
                  <td colSpan={6} style={{ ...cellStyle, textAlign: 'right' }}>Tổng</td>
                  <td style={cellStyle}>{formatCurrency(totalGrossRevenue)}</td>
                  <td style={cellStyle}>{formatCurrency(totalDeposits)}</td>
                  <td style={{ ...cellStyle, color: '#166534' }}>{formatCurrency(totalRevenue)}</td>
                </tr></tfoot>}
              </table>
            </div>
          </article>

          <article style={cardStyle}>
            <h3 style={{ margin: '0 0 12px', color: '#1e293b', fontSize: '16px' }}>Chi tiết doanh thu theo các đợt xuất hàng đạt</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead><tr style={{ backgroundColor: '#f1f5f9' }}>
                  {['Ngày xuất', 'Số phiếu', 'Hợp đồng Công ty B', 'Hợp đồng Công ty A / Tổ đan', 'Mã hàng', 'Số lượng đạt', 'Đơn giá', 'Doanh thu đợt'].map(label => <th key={label} style={cellStyle}>{label}</th>)}
                </tr></thead>
                <tbody>
                  {revenueRows.flatMap(row => row.exports.map(({ slip, quantity, amount }) => (
                    <tr key={`${String(row.contract.id)}-${String(slip.id)}`}>
                      <td style={cellStyle}>{slip.date}</td>
                      <td style={cellStyle}>{slip.slipNo}</td>
                      <td style={cellStyle}>{row.contract.contractNo || slip.companyBContractNo || '—'}</td>
                      <td style={cellStyle}>{slip.parentContractNo || slip.sourceContractNo || '—'}</td>
                      <td style={cellStyle}>{slip.productCode}</td>
                      <td style={cellStyle}>{formatNumber(quantity)} {slip.unit}</td>
                      <td style={cellStyle}>{formatCurrency(row.unitPrice)}</td>
                      <td style={{ ...cellStyle, fontWeight: 700 }}>{formatCurrency(amount)}</td>
                    </tr>
                  )))}
                  {revenueRows.length === 0 && <tr><td colSpan={8} style={{ ...cellStyle, padding: '20px', textAlign: 'center', color: '#64748b' }}>Chưa có chi tiết doanh thu trong kỳ này.</td></tr>}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : reportTab === 'expenses' ? (
        <section style={{ display: 'grid', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <article style={{ ...cardStyle, backgroundColor: '#fff7ed', borderColor: '#fed7aa' }}>
              <div style={{ color: '#9a3412', fontSize: '12px', fontWeight: 800 }}>TỔNG CHI PHÍ TRONG KỲ</div>
              <strong style={{ display: 'block', marginTop: '6px', color: '#9a3412', fontSize: '22px' }}>{formatCurrency(totalExpenses)}</strong>
            </article>
            {(['Tiền trả hàng đan', 'Sửa khoán', 'Chi phí phát sinh'] as const).map(category => (
              <article key={category} style={cardStyle}>
                <div style={{ color: '#475569', fontSize: '12px', fontWeight: 800 }}>{category.toLocaleUpperCase('vi')}</div>
                <strong style={{ display: 'block', marginTop: '6px', color: '#1e293b', fontSize: '18px' }}>
                  {formatCurrency(expenseLines.filter(line => line.category === category).reduce((sum, line) => sum + line.amount, 0))}
                </strong>
              </article>
            ))}
          </div>

          <article style={cardStyle}>
            <h3 style={{ margin: '0 0 12px', color: '#1e293b', fontSize: '16px' }}>Chi phí tổng hợp theo mặt hàng / khoản mục</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '780px', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead><tr style={{ backgroundColor: '#f1f5f9' }}>
                  {['Nhóm chi phí', 'Mặt hàng / Khoản mục', 'Tổng số lượng', 'Số đợt', 'Tổng tiền trong kỳ', 'Ghi chú tổng hợp các đợt'].map(label => <th key={label} style={cellStyle}>{label}</th>)}
                </tr></thead>
                <tbody>
                  {expenseGroups.map(group => (
                    <tr key={`${group.category}-${group.name}-${group.unit}`}>
                      <td style={cellStyle}>{group.category}</td>
                      <td style={cellStyle}>{group.name}{group.unit ? ` (${group.unit})` : ''}</td>
                      <td style={cellStyle}>{group.quantity > 0 ? formatNumber(group.quantity) : '—'}</td>
                      <td style={cellStyle}>{group.lineCount}</td>
                      <td style={{ ...cellStyle, fontWeight: 800 }}>{formatCurrency(group.amount)}</td>
                      <td style={{ ...cellStyle, minWidth: '260px', whiteSpace: 'pre-wrap' }}>{Array.from(group.notes).join('\n') || '—'}</td>
                    </tr>
                  ))}
                  {expenseGroups.length === 0 && <tr><td colSpan={6} style={{ ...cellStyle, padding: '20px', textAlign: 'center', color: '#64748b' }}>Không có chi phí trong kỳ này.</td></tr>}
                </tbody>
                {expenseGroups.length > 0 && <tfoot><tr style={{ backgroundColor: '#fff7ed', fontWeight: 800 }}>
                  <td colSpan={4} style={{ ...cellStyle, textAlign: 'right' }}>Tổng chi phí</td>
                  <td style={cellStyle}>{formatCurrency(totalExpenses)}</td>
                  <td style={cellStyle} />
                </tr></tfoot>}
              </table>
            </div>
          </article>

          <article style={cardStyle}>
            <h3 style={{ margin: '0 0 12px', color: '#1e293b', fontSize: '16px' }}>Chi tiết phát sinh theo ngày</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '820px', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead><tr style={{ backgroundColor: '#f1f5f9' }}>
                  {['Ngày', 'Nhóm chi phí', 'Mặt hàng / Khoản mục', 'Số lượng', 'Số tiền', 'Số phiếu / Ghi chú'].map(label => <th key={label} style={cellStyle}>{label}</th>)}
                </tr></thead>
                <tbody>
                  {expenseLines.map((line, index) => (
                    <tr key={`${line.category}-${line.reference}-${line.name}-${index}`}>
                      <td style={cellStyle}>{line.date}</td>
                      <td style={cellStyle}>{line.category}</td>
                      <td style={cellStyle}>{line.name}</td>
                      <td style={cellStyle}>{line.quantity > 0 ? `${formatNumber(line.quantity)} ${line.unit}` : '—'}</td>
                      <td style={cellStyle}>{formatCurrency(line.amount)}</td>
                      <td style={cellStyle}>{[line.reference, line.note].filter(Boolean).join(' · ') || '—'}</td>
                    </tr>
                  ))}
                  {expenseLines.length === 0 && <tr><td colSpan={6} style={{ ...cellStyle, padding: '20px', textAlign: 'center', color: '#64748b' }}>Chưa có chi tiết chi phí trong kỳ này.</td></tr>}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : (
        <section aria-label="Báo cáo Thuế GTGT" style={{ display: 'grid', gap: '14px' }}>
          <div style={{ ...cardStyle, backgroundColor: '#f8fafc', color: '#475569', fontSize: '12px' }}>
            Kỳ báo cáo: <strong>{month}</strong>. Thuế đầu ra lấy theo doanh thu hợp đồng đã hoàn thành và thuế suất khai báo trên HĐ Cty; hợp đồng chưa khai thuế suất được tính 0%. Thuế đầu vào lấy từ phiếu chi trong kỳ.
          </div>

          {vatOutputRows.length > 0 && <article style={cardStyle}>
            <h3 style={{ margin: '0 0 12px', color: '#1e3a8a', fontSize: '16px' }}>1. Thuế GTGT Đầu Ra</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead><tr style={{ backgroundColor: '#dbeafe' }}>
                  {['Số chứng từ / HĐ', 'Tên đối tác', 'Doanh số chưa thuế', 'Tỷ lệ % thuế GTGT', 'Tiền thuế GTGT đầu ra', 'Tổng cộng tiền thanh toán'].map(label => (
                    <th key={label} style={{ ...cellStyle, fontWeight: 800 }}>{label}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {vatOutputRows.map(row => (
                    <tr key={String(row.contract.id)}>
                      <td style={cellStyle}>{row.contract.contractNo || '—'}</td>
                      <td style={cellStyle}>{row.contract.companyName || row.contract.company || row.contract.partner || '—'}</td>
                      <td style={cellStyle}>{formatCurrency(row.grossAmount)}</td>
                      <td style={cellStyle}>{formatNumber(row.vatRatePercent)}%</td>
                      <td style={cellStyle}>{formatCurrency(row.vatAmount)}</td>
                      <td style={{ ...cellStyle, fontWeight: 800 }}>{formatCurrency(row.paymentAmount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr style={{ backgroundColor: '#eff6ff', fontWeight: 800 }}>
                  <td colSpan={2} style={{ ...cellStyle, textAlign: 'right' }}>Tổng cộng</td>
                  <td style={cellStyle}>{formatCurrency(vatOutputRows.reduce((sum, row) => sum + row.grossAmount, 0))}</td>
                  <td style={cellStyle}>—</td>
                  <td style={cellStyle}>{formatCurrency(totalOutputVat)}</td>
                  <td style={cellStyle}>{formatCurrency(vatOutputRows.reduce((sum, row) => sum + row.paymentAmount, 0))}</td>
                </tr></tfoot>
              </table>
            </div>
          </article>}

          {vatInputRows.length > 0 && <article style={cardStyle}>
            <h3 style={{ margin: '0 0 12px', color: '#166534', fontSize: '16px' }}>2. Thuế GTGT Đầu Vào</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead><tr style={{ backgroundColor: '#dcfce7' }}>
                  {['Ngày tháng', 'Nội dung chi', 'Số tiền trước thuế', '% Thuế GTGT', 'Số tiền thuế GTGT đầu vào'].map(label => (
                    <th key={label} style={{ ...cellStyle, fontWeight: 800 }}>{label}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {vatInputRows.map(({ expense, description, taxableAmount, vatRatePercent, vatAmount }) => (
                    <tr key={String(expense.id)}>
                      <td style={cellStyle}>{expense.date || '—'}</td>
                      <td style={cellStyle}>{description}</td>
                      <td style={cellStyle}>{formatCurrency(taxableAmount)}</td>
                      <td style={cellStyle}>{formatNumber(vatRatePercent)}%</td>
                      <td style={cellStyle}>{formatCurrency(vatAmount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr style={{ backgroundColor: '#f0fdf4', fontWeight: 800 }}>
                  <td colSpan={2} style={{ ...cellStyle, textAlign: 'right' }}>Tổng cộng</td>
                  <td style={cellStyle}>{formatCurrency(vatInputRows.reduce((sum, row) => sum + row.taxableAmount, 0))}</td>
                  <td style={cellStyle}>—</td>
                  <td style={cellStyle}>{formatCurrency(totalInputVat)}</td>
                </tr></tfoot>
              </table>
            </div>
          </article>}

          {(vatOutputRows.length > 0 || vatInputRows.length > 0) ? (
          <article style={{ ...cardStyle, borderColor: vatBalance > 0 ? '#fca5a5' : '#86efac', backgroundColor: vatBalance > 0 ? '#fff7f7' : '#f0fdf4' }}>
            <h3 style={{ margin: '0 0 12px', color: '#1e293b', fontSize: '16px' }}>3. Tổng Hợp &amp; Đối Trừ Thuế GTGT</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div>
                <div style={{ color: '#1d4ed8', fontSize: '12px', fontWeight: 800 }}>TỔNG THUẾ GTGT ĐẦU RA</div>
                <strong style={{ display: 'block', marginTop: '5px', color: '#1d4ed8', fontSize: '20px' }}>{formatCurrency(totalOutputVat)}</strong>
              </div>
              <div>
                <div style={{ color: '#15803d', fontSize: '12px', fontWeight: 800 }}>TỔNG THUẾ GTGT ĐẦU VÀO ĐƯỢC KHẤU TRỪ</div>
                <strong style={{ display: 'block', marginTop: '5px', color: '#15803d', fontSize: '20px' }}>{formatCurrency(totalInputVat)}</strong>
              </div>
              <div>
                <div style={{ color: vatBalance > 0 ? '#b91c1c' : '#15803d', fontSize: '12px', fontWeight: 800 }}>
                  {vatBalance > 0 ? 'THUẾ GTGT PHẢI NỘP' : vatBalance < 0 ? 'THUẾ GTGT CÒN ĐƯỢC KHẤU TRỪ KỲ TỚI' : 'THUẾ GTGT CÂN BẰNG'}
                </div>
                <strong style={{ display: 'block', marginTop: '5px', color: vatBalance > 0 ? '#b91c1c' : '#15803d', fontSize: '20px' }}>
                  {formatCurrency(Math.abs(vatBalance))}
                </strong>
              </div>
            </div>
          </article>
          ) : (
            <div style={{ ...cardStyle, color: '#64748b', fontSize: '13px' }}>Kỳ này chưa phát sinh thuế GTGT đầu ra hoặc đầu vào.</div>
          )}
        </section>
      )}
      </>
      )}
    </div>
  );
}
