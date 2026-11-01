import { useMemo, useState } from 'react';
import type { CategoryItem, ContractItem, ExpenseItem, SlipItem } from '../context/AppContext';
import { useApp } from '../context/AppContext';

type MaterialLine = {
  materialId?: number | string;
  materialCode?: string;
  materialName?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  amount?: number;
};

type Movement = {
  key: string;
  name: string;
  code: string;
  unit: string;
  date: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  direction: 'in' | 'out';
  source: string;
  reference: string;
  legacyUndated?: boolean;
};

type MaterialSummary = {
  key: string;
  name: string;
  code: string;
  unit: string;
  opening: number;
  incoming: number;
  outgoing: number;
  closing: number;
  averagePrice: number;
  highestPurchasePrice: number;
  outgoingValue: number;
  closingValue: number;
  notes: string[];
};

const currentMonth = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const toDateString = (value: unknown) => {
  if (!value) return '';
  const rawDate = String(value).trim();
  const isoDate = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;
  const localizedDate = rawDate.match(/^(\d{2})[/. -](\d{2})[/. -](\d{4})$/);
  if (localizedDate) return `${localizedDate[3]}-${localizedDate[2]}-${localizedDate[1]}`;
  return '';
};

const normalizeMaterialIdentity = (value: unknown) =>
  String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

const findCatalogMaterial = (line: MaterialLine, materials: CategoryItem[]) => {
  if (line.materialId !== undefined && line.materialId !== null) {
    const byId = materials.find(material => String(material.id) === String(line.materialId));
    if (byId) return byId;
  }
  const code = normalizeMaterialIdentity(line.materialCode);
  if (code) {
    const byCode = materials.find(material => normalizeMaterialIdentity(material.code) === code);
    if (byCode) return byCode;
  }
  const name = normalizeMaterialIdentity(line.materialName);
  if (!name) return undefined;
  const exactMatch = materials.find(material => normalizeMaterialIdentity(material.name) === name);
  if (exactMatch) return exactMatch;
  const nameMatches = materials.filter(material => {
    const catalogName = normalizeMaterialIdentity(material.name);
    return catalogName.length >= 3 && name.includes(catalogName);
  });
  return nameMatches.length === 1 ? nameMatches[0] : undefined;
};

const getMaterialKey = (line: MaterialLine, materials: CategoryItem[]) => {
  const catalogMaterial = findCatalogMaterial(line, materials);
  if (catalogMaterial) return `id:${catalogMaterial.id}`;
  if (line.materialId !== undefined && line.materialId !== null) return `id:${line.materialId}`;
  const code = String(line.materialCode || '').trim().toLocaleLowerCase('vi');
  if (code) return `code:${code}`;
  return `name:${String(line.materialName || '').trim().toLocaleLowerCase('vi')}`;
};

const formatNumber = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const formatCurrency = (value: number) => `${Math.round(value).toLocaleString('vi-VN')} đ`;

export default function MaterialStockReport() {
  const { materials = [], slips = [], contracts = [], expenses = [] } = useApp();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const rows = useMemo(() => {
    const movements: Movement[] = [];
    const addLines = (
      lines: MaterialLine[] | undefined,
      direction: Movement['direction'],
      date: unknown,
      source: string,
      reference: string,
      legacyUndated = false
    ) => {
      if (!Array.isArray(lines)) return;
      lines.forEach(line => {
        const quantity = Number(line.quantity) || 0;
        const catalogMaterial = findCatalogMaterial(line, materials as CategoryItem[]);
        const name = String(line.materialName || catalogMaterial?.name || '').trim();
        if (quantity <= 0 || !name) return;
        const amount = Number(line.amount) > 0
          ? Number(line.amount)
          : quantity * (Number(line.unitPrice) || 0);
        movements.push({
          key: getMaterialKey(line, materials as CategoryItem[]),
          name,
          code: String(catalogMaterial?.code || line.materialCode || ''),
          unit: String(line.unit || catalogMaterial?.unit || ''),
          date: toDateString(date),
          quantity,
          unitPrice: amount > 0 ? amount / quantity : Number(line.unitPrice) || 0,
          amount,
          direction,
          source,
          reference,
          legacyUndated
        });
      });
    };

    (slips as SlipItem[]).forEach(slip => {
      const type = String(slip.type || '').toUpperCase();
      const reference = String(slip.slipNo || '');
      const isCompanyReceipt = type === 'NK' || type === 'NHAP' ||
        (type === 'NK_KHUNG' &&
          !slip.sourceContractId &&
          !slip.sourceReturnSlipId &&
          !slip.craftGroupLeader);
      if (isCompanyReceipt) {
        const supplier = String(slip.partnerName || slip.partner || 'Nhà cung cấp');
        addLines(
          slip.accompanyingMaterials as MaterialLine[] | undefined,
          'in',
          slip.date,
          `Nhập kho Cty B (${supplier})`,
          reference
        );
      }
      if (type === 'XUAT_SUA_KHOAN') {
        addLines(slip.accompanyingMaterials as MaterialLine[] | undefined, 'out', slip.date, 'Xuất sửa khoán', reference);
      }
    });

    (contracts as ContractItem[]).forEach(contract => {
      if (contract.contractType !== 'SUB') return;
      const hasIssueDate = Boolean(contract.accompanyingMaterialsIssuedDate);
      addLines(
        contract.accompanyingMaterials,
        'out',
        contract.accompanyingMaterialsIssuedDate,
        'Cấp phát tổ đan',
        String(contract.contractNo || contract.productCode || ''),
        !hasIssueDate
      );
    });

    (expenses as ExpenseItem[]).forEach(expense => {
      if (!Array.isArray(expense.items)) return;
      expense.items.forEach(item => {
        const itemName = String(item.name || '').trim();
        const sourceType = String(item.sourceType || '');
        const catalogMaterial = findCatalogMaterial({
          materialCode: item.sourceCode,
          materialName: itemName
        }, materials as CategoryItem[]);
        const name = itemName || String(catalogMaterial?.name || '').trim();
        const isMaterialCode = Boolean(item.sourceCode && (materials as CategoryItem[]).some(material =>
          normalizeMaterialIdentity(material.code) === normalizeMaterialIdentity(item.sourceCode)
        ));
        const isRawMaterial = sourceType === 'Nguyên liệu' ||
          isMaterialCode ||
          (sourceType !== 'Sản phẩm' && Boolean(catalogMaterial));
        if (!isRawMaterial) return;

        const quantity = Number(item.quantity) || 0;
        if (quantity <= 0 || !name) return;
        const amount = Number(item.amount) || quantity * (Number(item.unitPrice) || 0);
        addLines([{
          materialId: catalogMaterial?.id,
          materialCode: item.sourceCode || catalogMaterial?.code || '',
          materialName: name,
          quantity,
          unit: item.unit || catalogMaterial?.unit || '',
          unitPrice: Number(item.unitPrice) || (amount / quantity),
          amount
        }], 'in', expense.date, `Mua qua Phiếu Chi (${expense.supplierName || expense.handler || 'Nhà cung cấp'})`, String(expense.expenseCode || expense.id));
      });
    });

    const periodStart = `${selectedMonth}-01`;
    const periodEnd = `${selectedMonth}-${new Date(
      Number(selectedMonth.slice(0, 4)),
      Number(selectedMonth.slice(5, 7)),
      0
    ).getDate().toString().padStart(2, '0')}`;
    const purchaseMovements = movements.filter(movement =>
      movement.direction === 'in' && movement.date && movement.date <= periodEnd
    );
    const materialKeys = new Set<string>([
      ...materials.map((material: CategoryItem) => `id:${material.id}`),
      ...movements.map(movement => movement.key)
    ]);

    return Array.from(materialKeys).map(key => {
      const catalogMaterial = (materials as CategoryItem[]).find(material => `id:${material.id}` === key);
      const materialMovements = movements.filter(movement => movement.key === key);
      const purchases = purchaseMovements.filter(movement => movement.key === key);
      const currentMovements = materialMovements.filter(movement =>
        movement.date >= periodStart && movement.date <= periodEnd
      );
      const openingMovements = materialMovements.filter(movement =>
        movement.legacyUndated || (movement.date && movement.date < periodStart)
      );
      const opening = openingMovements.reduce(
        (sum, movement) => sum + (movement.direction === 'in' ? movement.quantity : -movement.quantity),
        0
      );
      const incoming = currentMovements
        .filter(movement => movement.direction === 'in')
        .reduce((sum, movement) => sum + movement.quantity, 0);
      const outgoingMovements = currentMovements.filter(movement => movement.direction === 'out');
      const outgoing = outgoingMovements.reduce((sum, movement) => sum + movement.quantity, 0);
      const closing = opening + incoming - outgoing;
      const pricedPurchases = purchases.filter(movement => movement.amount > 0 && movement.quantity > 0);
      const purchaseQuantity = pricedPurchases.reduce((sum, movement) => sum + movement.quantity, 0);
      const purchaseValue = pricedPurchases.reduce((sum, movement) => sum + movement.amount, 0);
      const averagePrice = purchaseQuantity > 0 ? purchaseValue / purchaseQuantity : 0;
      const highestPurchasePrice = pricedPurchases.reduce(
        (highest, movement) => Math.max(highest, movement.unitPrice),
        0
      );
      const outgoingValue = outgoingMovements.reduce((sum, movement) => {
        const purchasesByIssueDate = pricedPurchases.filter(purchase =>
          purchase.date <= movement.date
        );
        const issuePrice = purchasesByIssueDate.reduce(
          (highest, purchase) => Math.max(highest, purchase.unitPrice),
          0
        );
        return sum + movement.quantity * issuePrice;
      }, 0);
      const notes = [
        ...currentMovements
          .filter(movement => movement.direction === 'in')
          .map(movement => `${movement.source} ${movement.reference}: +${formatNumber(movement.quantity)}${movement.unit ? ` ${movement.unit}` : ''}`),
        ...outgoingMovements.map(movement => `${movement.source} ${movement.reference}: -${formatNumber(movement.quantity)}${movement.unit ? ` ${movement.unit}` : ''}`)
      ];
      if (outgoing > 0) {
        notes.push(`Xuất tính theo giá nhập cao nhất; thành tiền xuất kỳ: ${formatCurrency(outgoingValue)}`);
      }
      const firstMovement = materialMovements[0];
      return {
        key,
        name: catalogMaterial?.name || firstMovement?.name || 'Nguyên phụ liệu',
        code: catalogMaterial?.code || firstMovement?.code || '',
        unit: catalogMaterial?.unit || firstMovement?.unit || '',
        opening,
        incoming,
        outgoing,
        closing,
        averagePrice,
        highestPurchasePrice,
        outgoingValue,
        closingValue: closing * averagePrice,
        notes
      } satisfies MaterialSummary;
    }).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [contracts, expenses, materials, selectedMonth, slips]);

  const totalOpening = rows.reduce((sum, row) => sum + row.opening, 0);
  const totalIncoming = rows.reduce((sum, row) => sum + row.incoming, 0);
  const totalOutgoing = rows.reduce((sum, row) => sum + row.outgoing, 0);
  const totalClosingValue = rows.reduce((sum, row) => sum + row.closingValue, 0);

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <section style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
          <div>
            <h2 style={{ margin: 0, color: '#0f172a', fontSize: '20px' }}>Báo Cáo NXT Nguyên Phụ Liệu</h2>
            <p style={{ color: '#64748b', margin: '6px 0 0' }}>Đơn giá nhập là bình quân gia quyền lũy kế; xuất dùng giá mua cao nhất đã ghi nhận.</p>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', fontWeight: 600 }}>
            Kỳ báo cáo
            <input type="month" value={selectedMonth} onChange={event => {
              if (event.target.value) setSelectedMonth(event.target.value);
            }} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
          </label>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          {[
            ['Tồn đầu kỳ', formatNumber(totalOpening)],
            ['Nhập trong kỳ', formatNumber(totalIncoming)],
            ['Xuất trong kỳ', formatNumber(totalOutgoing)],
            ['Giá trị tồn cuối', formatCurrency(totalClosingValue)]
          ].map(([label, value]) => (
            <div key={label} style={{ minWidth: '150px', padding: '12px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>{label}</div>
              <strong style={{ display: 'block', marginTop: '4px', color: '#0f172a' }}>{value}</strong>
            </div>
          ))}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: '1320px', fontSize: '13px' }}>
            <colgroup>
              <col style={{ width: '16%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '14%' }} />
            </colgroup>
            <thead>
              <tr style={{ background: '#eff6ff', color: '#1e3a8a' }}>
                {['Tên Hàng', 'Đơn Vị Tính', 'Tồn Đầu', 'Nhập Trong Kỳ', 'Xuất Trong Kỳ', 'Tồn Cuối Kỳ', 'Đơn Giá', 'Thành Tiền', 'Ghi Chú'].map((label, index) => (
                  <th
                    key={label}
                    style={{
                      padding: '11px 9px',
                      borderBottom: '1px solid #cbd5e1',
                      textAlign: index === 0 || index === 1 || index === 8 ? 'left' : 'right',
                      whiteSpace: 'normal',
                      verticalAlign: 'bottom'
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.key} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 9px', textAlign: 'left', overflowWrap: 'anywhere' }}>
                    <strong>{row.name}</strong>
                    {row.code && <div style={{ color: '#64748b', fontSize: '11px' }}>{row.code}</div>}
                  </td>
                  <td style={{ padding: '10px 9px', textAlign: 'left', overflowWrap: 'anywhere' }}>{row.unit || '-'}</td>
                  <td style={{ padding: '10px 9px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(row.opening)}</td>
                  <td style={{ padding: '10px 9px', textAlign: 'right', color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(row.incoming)}</td>
                  <td style={{ padding: '10px 9px', textAlign: 'right', color: '#b91c1c', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(row.outgoing)}</td>
                  <td style={{ padding: '10px 9px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatNumber(row.closing)}</td>
                  <td style={{ padding: '10px 9px', textAlign: 'right', overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>
                    <div>{formatCurrency(row.averagePrice)}</div>
                    {row.highestPurchasePrice > 0 && <div style={{ color: '#64748b', fontSize: '11px' }}>Xuất tối đa: {formatCurrency(row.highestPurchasePrice)}</div>}
                  </td>
                  <td style={{ padding: '10px 9px', textAlign: 'right', overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(row.closingValue)}</td>
                  <td style={{ padding: '10px 9px', textAlign: 'left', color: '#475569', overflowWrap: 'anywhere' }}>{row.notes.length ? row.notes.join(' · ') : '-'}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>Chưa có danh mục hoặc phát sinh nguyên phụ liệu.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
