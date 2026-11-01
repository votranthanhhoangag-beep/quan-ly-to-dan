import { useMemo, useState } from 'react';
import type { ExpenseAllocation, ExpenseItem } from '../context/AppContext';
import { useApp } from '../context/AppContext';

type CostOption = {
  id: string;
  label: string;
  searchText: string;
  date: string;
  amount: number;
};

const getCurrentMonth = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const formatCurrency = (amount: number) => `${amount.toLocaleString('vi-VN')} đ`;
const formatAllocationInput = (amount: number) => (
  Number.isFinite(amount) ? Math.max(0, Math.round(amount)).toLocaleString('vi-VN') : ''
);
const parseAllocationInput = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
};
const allocateByContractValue = (
  totalAmount: number,
  contracts: Array<{
    id: number | string;
    totalAmount: number;
    quantity: number;
    unitPrice: number;
  }>
) => {
  const allocations = new Map<string, number>();
  if (!contracts.length) return allocations;

  const weights = contracts.map(contract => {
    const value = Number(contract.totalAmount) || Number(contract.quantity) * Number(contract.unitPrice) || 0;
    return Math.max(0, value);
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const effectiveWeights = totalWeight > 0
    ? weights
    : weights.map(() => 1);
  const effectiveTotal = effectiveWeights.reduce((sum, weight) => sum + weight, 0);
  const target = Math.max(0, Math.round(totalAmount));
  const shares = contracts.map((contract, index) => {
    const exact = target * effectiveWeights[index] / effectiveTotal;
    const base = Math.floor(exact);
    return { id: String(contract.id), amount: base, remainder: exact - base };
  });
  const remainder = target - shares.reduce((sum, share) => sum + share.amount, 0);
  shares
    .slice()
    .sort((first, second) => second.remainder - first.remainder)
    .slice(0, remainder)
    .forEach(share => {
      const targetShare = shares.find(item => item.id === share.id);
      if (targetShare) targetShare.amount += 1;
    });
  shares.forEach(share => allocations.set(share.id, share.amount));
  return allocations;
};
const normalizeSearchText = (value: string) => value
  .toLocaleLowerCase('vi')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd');

const getMonthKey = (date: string | undefined) => {
  if (!date) return '';
  const isoDate = date.match(/^(\d{4})-(\d{2})/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}`;
  const vietnameseDate = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return vietnameseDate
    ? `${vietnameseDate[3]}-${vietnameseDate[2].padStart(2, '0')}`
    : '';
};

const isInMonth = (date: string | undefined, month: string) => getMonthKey(date) === month;

const getExpenseOptions = (expenses: ExpenseItem[], month: string): CostOption[] =>
  expenses
    .filter(expense => isInMonth(expense.date, month))
    .flatMap(expense => {
      const items = Array.isArray(expense.items) ? expense.items : [];
      const subtotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      if (items.length) {
        return items.flatMap((item, index) => {
          const itemAmount = Number(item.amount) || 0;
          const amount = itemAmount + (subtotal > 0
            ? (Number(expense.vatAmount) || 0) * itemAmount / subtotal
            : 0);
          if (amount <= 0) return [];
          const label = [
            item.name || expense.expenseName || expense.category || 'Khoản chi',
            expense.supplierName,
            expense.expenseCode || String(expense.id)
          ].filter(Boolean).join(' · ');
          const searchText = [
            label,
            expense.category,
            expense.expenseName,
            expense.note,
            expense.supplierAddress,
            expense.supplierTaxCode,
            item.name,
            item.sourceCode,
            item.sourceType,
            item.sourceNote
          ].filter(Boolean).join(' ');
          return [{
            id: `expense:${String(expense.id)}:${item.id || index}`,
            label,
            searchText,
            date: expense.date,
            amount
          }];
        });
      }

      const amount = Number(expense.amount) || 0;
      if (amount <= 0) return [];
      const label = [
        expense.expenseName || expense.category || expense.note || 'Khoản chi',
        expense.supplierName,
        expense.expenseCode || String(expense.id)
      ].filter(Boolean).join(' · ');
      return [{
        id: `expense:${String(expense.id)}:total`,
        label,
        searchText: [
          label,
          expense.category,
          expense.expenseName,
          expense.note,
          expense.supplierAddress,
          expense.supplierTaxCode
        ].filter(Boolean).join(' '),
        date: expense.date,
        amount
      }];
    })
    .sort((first, second) => second.date.localeCompare(first.date));

export default function ExpenseAllocationManager() {
  const { contracts = [], expenses = [], expenseAllocations = [], saveExpenseAllocation } = useApp();
  const [month, setMonth] = useState(getCurrentMonth);
  const [query, setQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedCostId, setSelectedCostId] = useState('');
  const [selectedContractIds, setSelectedContractIds] = useState<string[] | null>(null);
  const [draftAmounts, setDraftAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const options = useMemo(() => getExpenseOptions(expenses, month), [expenses, month]);
  const selectedCost = options.find(option => option.id === selectedCostId);
  const existingAllocation = expenseAllocations.find(item => item.sourceId === selectedCostId);

  const availableContracts = useMemo(() => contracts
    .filter(contract => contract.contractType !== 'SUB')
    .filter(contract => !(
      contract.isLiquidated &&
      expenseAllocations.some(allocation =>
        allocation.allocations.some(item => String(item.contractId) === String(contract.id))
      )
    ))
    .sort((first, second) =>
      String(first.contractNo || '').localeCompare(String(second.contractNo || ''), 'vi', { numeric: true })
    ), [contracts, expenseAllocations]);

  const visibleOptions = options.filter(option =>
    normalizeSearchText(option.searchText).includes(normalizeSearchText(query.trim()))
  );
  const checkedContractIds = new Set(
    selectedContractIds ?? availableContracts.map(contract => String(contract.id))
  );
  const selectedContracts = availableContracts.filter(contract =>
    checkedContractIds.has(String(contract.id))
  );
  const suggestedAllocations = selectedCost
    ? allocateByContractValue(selectedCost.amount, selectedContracts)
    : new Map<string, number>();
  const distribution = availableContracts.map(contract => {
    const contractId = String(contract.id);
    const contractValue = Number(contract.totalAmount) || Number(contract.quantity) * Number(contract.unitPrice) || 0;
    const isSelected = checkedContractIds.has(contractId);
    const suggested = suggestedAllocations.get(contractId) || 0;
    const amount = !isSelected
      ? '0'
      : draftAmounts[contractId] !== undefined
        ? draftAmounts[contractId]
        : formatAllocationInput(suggested);
    return { contract, contractId, amount, contractValue, isSelected };
  });
  const allocatedTotal = distribution.reduce((sum, row) => sum + parseAllocationInput(row.amount), 0);

  const selectCost = (option: CostOption) => {
    setSelectedCostId(option.id);
    setQuery(option.label);
    setIsSearchOpen(false);
    setError('');
    setDraftAmounts({});
    setSelectedContractIds(availableContracts.map(contract => String(contract.id)));
  };

  const save = () => {
    if (!selectedCost) {
      setError('Vui lòng chọn khoản chi cần phân bổ.');
      return;
    }
    if (distribution.some(row => !Number.isFinite(parseAllocationInput(row.amount)))) {
      setError('Số tiền phân bổ phải là số không âm hợp lệ.');
      return;
    }
    if (allocatedTotal <= 0) {
      setError('Vui lòng nhập số tiền phân bổ cho ít nhất một hợp đồng.');
      return;
    }
    const targetAllocation = Math.round(selectedCost.amount);
    if (allocatedTotal !== targetAllocation) {
      setError(`Tổng phân bổ phải khớp ${formatCurrency(targetAllocation)}.`);
      return;
    }

    const allocation: ExpenseAllocation = {
      id: existingAllocation?.id || selectedCost.id,
      sourceId: selectedCost.id,
      sourceLabel: selectedCost.label,
      date: selectedCost.date,
      totalAmount: targetAllocation,
      allocations: distribution
        .filter(row => row.isSelected && parseAllocationInput(row.amount) > 0)
        .map(row => ({ contractId: row.contract.id, amount: parseAllocationInput(row.amount) }))
    };
    saveExpenseAllocation(allocation);
    setError('');
    window.alert('Đã lưu phân bổ chi phí.');
  };

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <header style={{ padding: '18px', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#fff' }}>
        <h2 style={{ margin: 0, color: '#0f172a', fontSize: '20px' }}>Phân Bổ Chi Phí</h2>
        <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '13px' }}>
          Chọn khoản chi trong kỳ, phân bổ theo tỷ trọng giá trị hợp đồng hoặc nhập số tiền tùy chỉnh.
        </p>
      </header>

      <section style={{ display: 'grid', gap: '16px', padding: '18px', border: '1px solid #cbd5e1', borderRadius: '10px', background: '#fff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(240px, 2fr)', gap: '12px' }}>
          <label style={{ display: 'grid', gap: '6px', color: '#334155', fontSize: '13px', fontWeight: 700 }}>
            Kỳ chi phí
            <input type="month" value={month} onChange={event => {
              if (!event.target.value) return;
              setMonth(event.target.value);
              setSelectedCostId('');
              setQuery('');
              setDraftAmounts({});
              setIsSearchOpen(false);
              setSelectedContractIds(null);
            }} style={{ padding: '9px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
          </label>
          <div style={{ position: 'relative', display: 'grid', gap: '6px', color: '#334155', fontSize: '13px', fontWeight: 700 }}>
            <label htmlFor="expense-allocation-search">Tìm kiếm và chọn khoản chi</label>
            <input
              id="expense-allocation-search"
              type="search"
              value={query}
              onFocus={() => setIsSearchOpen(true)}
              onChange={event => {
                setQuery(event.target.value);
                setSelectedCostId('');
                setDraftAmounts({});
                setIsSearchOpen(true);
              }}
              placeholder="Gõ tên khoản chi, nhà cung cấp hoặc mã phiếu..."
              style={{ padding: '9px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
            />
            {isSearchOpen && !selectedCost && (
              <div style={{ position: 'absolute', zIndex: 2, top: '100%', left: 0, right: 0, maxHeight: '240px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', boxShadow: '0 4px 12px rgba(15,23,42,.12)' }}>
                {visibleOptions.length ? visibleOptions.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => selectCost(option)}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', width: '100%', padding: '10px', border: 0, borderBottom: '1px solid #f1f5f9', background: '#fff', textAlign: 'left', cursor: 'pointer' }}
                  >
                    <span>{option.label}<small style={{ display: 'block', marginTop: '3px', color: '#64748b' }}>{option.date}</small></span>
                    <strong style={{ whiteSpace: 'nowrap', color: '#1d4ed8' }}>{formatCurrency(option.amount)}</strong>
                  </button>
                )) : <div style={{ padding: '12px', color: '#64748b', fontWeight: 400 }}>Không tìm thấy khoản chi trong kỳ.</div>}
              </div>
            )}
          </div>
        </div>

        {selectedCost && (
          <div style={{ padding: '12px 14px', border: '1px solid #bfdbfe', borderRadius: '7px', background: '#eff6ff', color: '#1e3a8a' }}>
            <strong>{selectedCost.label}</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '6px', fontSize: '13px' }}>
              <span>Ngày chi: {selectedCost.date}</span>
              <span>Tổng số tiền: <strong>{formatCurrency(selectedCost.amount)}</strong></span>
              {existingAllocation && <span>Đã có phân bổ — chỉnh sửa rồi lưu để cập nhật.</span>}
            </div>
          </div>
        )}

        {selectedCost && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#1e293b', fontSize: '15px' }}>Hợp đồng đang hoạt động</h3>
                <small style={{ color: '#64748b' }}>Gợi ý phân bổ theo tỷ trọng giá trị hợp đồng; có thể nhập lại từng số tiền.</small>
              </div>
              <strong style={{ color: allocatedTotal !== Math.round(selectedCost.amount) ? '#b91c1c' : '#166534' }}>
                Tổng phân bổ: {formatCurrency(allocatedTotal)} / {formatCurrency(Math.round(selectedCost.amount))}
              </strong>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                    {['Chọn', 'Số HĐ', 'Mã hàng', 'Giá trị hợp đồng', 'Số tiền phân bổ'].map(label => (
                      <th key={label} style={{ padding: '10px', borderBottom: '1px solid #cbd5e1' }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {distribution.map(({ contract, contractId, amount, contractValue, isSelected }) => (
                    <tr key={contractId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={event => {
                            const nextSelected = new Set(checkedContractIds);
                            if (event.target.checked) nextSelected.add(contractId);
                            else nextSelected.delete(contractId);
                            setSelectedContractIds(Array.from(nextSelected));
                            setDraftAmounts({});
                            setError('');
                          }}
                          aria-label={`Chọn hợp đồng ${contract.contractNo || contractId} để phân bổ`}
                        />
                      </td>
                      <td style={{ padding: '10px', fontWeight: 700 }}>{contract.contractNo || `HĐ ${contractId}`}</td>
                      <td style={{ padding: '10px' }}>{contract.productCode || '—'} · {contract.productName || ''}</td>
                      <td style={{ padding: '10px', textAlign: 'right' }}>{formatCurrency(contractValue)}</td>
                      <td style={{ padding: '10px', width: '220px' }}>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={amount}
                          onChange={event => {
                            const digits = event.target.value.replace(/\D/g, '');
                            setDraftAmounts(current => ({
                              ...current,
                              [contractId]: digits ? Number(digits).toLocaleString('vi-VN') : ''
                            }));
                          }}
                          disabled={!isSelected}
                          aria-label={`Số tiền phân bổ cho hợp đồng ${contract.contractNo || contractId}`}
                          placeholder="0"
                          style={{ width: '100%', boxSizing: 'border-box', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '5px', textAlign: 'right' }}
                        />
                      </td>
                    </tr>
                  ))}
                  {distribution.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>Không có hợp đồng phù hợp để phân bổ.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {error && <div role="alert" style={{ color: '#b91c1c', fontWeight: 700 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={save} disabled={!distribution.length} style={{ padding: '10px 16px', border: 0, borderRadius: '6px', background: distribution.length ? '#2563eb' : '#94a3b8', color: '#fff', fontWeight: 700, cursor: distribution.length ? 'pointer' : 'not-allowed' }}>
                💾 Lưu phân bổ
              </button>
            </div>
          </>
        )}
      </section>

      <section style={{ padding: '18px', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#fff' }}>
        <h3 style={{ margin: '0 0 12px', color: '#1e293b', fontSize: '15px' }}>Phân bổ đã lưu trong kỳ</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '650px', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                {['Ngày', 'Khoản chi', 'Tổng chi', 'Hợp đồng được phân bổ', 'Tổng đã phân bổ'].map(label => (
                  <th key={label} style={{ padding: '10px', borderBottom: '1px solid #cbd5e1' }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {expenseAllocations.filter(allocation => isInMonth(allocation.date, month)).map(allocation => {
                const allocated = allocation.allocations.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                const contractNames = allocation.allocations.map(item => {
                  const contract = contracts.find(candidate => String(candidate.id) === String(item.contractId));
                  return `${contract?.contractNo || item.contractId}: ${formatCurrency(item.amount)}`;
                });
                return (
                  <tr key={allocation.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>{allocation.date}</td>
                    <td style={{ padding: '10px' }}>{allocation.sourceLabel}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>{formatCurrency(allocation.totalAmount)}</td>
                    <td style={{ padding: '10px' }}>{contractNames.join(' · ') || '—'}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700 }}>{formatCurrency(allocated)}</td>
                  </tr>
                );
              })}
              {!expenseAllocations.some(allocation => isInMonth(allocation.date, month)) && (
                <tr><td colSpan={5} style={{ padding: '18px', textAlign: 'center', color: '#64748b' }}>Chưa có phân bổ chi phí trong kỳ này.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
