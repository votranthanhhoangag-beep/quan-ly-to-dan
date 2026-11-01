import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { getFrameStockRows } from '../utils/frameStock';
import FrameCompanyReturnManager from './FrameCompanyReturnManager';

const currentMonth = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const formatNumber = (value: number) =>
  value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

export default function FrameStockReport() {
  const { products = [], contracts = [], slips = [] } = useApp();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [activeTab, setActiveTab] = useState<'stock' | 'company-return'>('stock');
  const rows = useMemo(
    () => getFrameStockRows(products, contracts, slips, selectedMonth),
    [products, contracts, selectedMonth, slips]
  );
  const totals = rows.reduce((result, row) => ({
    opening: result.opening + row.opening,
    inbound: result.inbound + row.inbound,
    outbound: result.outbound + row.outbound,
    closing: result.closing + row.closing
  }), { opening: 0, inbound: 0, outbound: 0, closing: 0 });

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <nav aria-label="Điều hướng Khung Sơn" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '9px', backgroundColor: '#f8fafc' }}>
        {([
          ['stock', 'Báo Cáo NXT Khung Sơn'],
          ['company-return', 'Xuất KS Trả Cty']
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '9px 14px',
              border: 0,
              borderRadius: '6px',
              backgroundColor: activeTab === tab ? '#7c3aed' : 'transparent',
              color: activeTab === tab ? '#fff' : '#334155',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === 'company-return' && <FrameCompanyReturnManager />}

      {activeTab === 'stock' && <section style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '8px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: '20px' }}>Báo Cáo NXT Khung Sơn</h2>
          <p style={{ color: '#64748b', margin: '6px 0 0' }}>
            Sổ kho Khung Sơn riêng: gồm nhập khung từ công ty, nhận lại từ tổ đan, xuất cho tổ đan và xuất trả công ty. Tồn cuối = Tồn đầu + Nhập - Xuất.
          </p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', fontWeight: 600 }}>
          Kỳ báo cáo
          <input
            type="month"
            value={selectedMonth}
            onChange={event => {
              if (event.target.value) setSelectedMonth(event.target.value);
            }}
            style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
          />
        </label>
      </div>

      <div style={{ overflowX: 'auto', marginTop: '16px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: '900px', fontSize: '13px' }}>
          <colgroup>
            <col style={{ width: '12%' }} />
            <col style={{ width: '19%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '29%' }} />
          </colgroup>
          <thead>
            <tr style={{ background: '#eff6ff', color: '#1e3a8a' }}>
              {['Mã Hàng', 'Tên Hàng', 'Tồn Đầu', 'Nhập', 'Xuất', 'Tồn Cuối', 'Ghi Chú'].map((label, index) => (
                <th
                  key={label}
                  scope="col"
                  style={{
                    padding: '11px 9px',
                    borderBottom: '1px solid #cbd5e1',
                    whiteSpace: 'nowrap',
                    textAlign: index >= 2 && index <= 5 ? 'right' : 'left'
                  }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.productCode} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '10px 9px', whiteSpace: 'nowrap' }}>{row.productCode}</td>
                <td style={{ padding: '10px 9px' }}>{row.productName || '—'}</td>
                <td style={{ padding: '10px 9px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(row.opening)}</td>
                <td style={{ padding: '10px 9px', textAlign: 'right', color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(row.inbound)}</td>
                <td style={{ padding: '10px 9px', textAlign: 'right', color: '#b91c1c', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(row.outbound)}</td>
                <td style={{ padding: '10px 9px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatNumber(row.closing)}</td>
                <td style={{ padding: '10px 9px', minWidth: '220px', color: '#475569' }}>{row.note || '—'}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                <td colSpan={2} style={{ padding: '11px 9px', textAlign: 'left' }}>Tổng cộng</td>
                <td style={{ padding: '11px 9px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(totals.opening)}</td>
                <td style={{ padding: '11px 9px', textAlign: 'right', color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(totals.inbound)}</td>
                <td style={{ padding: '11px 9px', textAlign: 'right', color: '#b91c1c', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(totals.outbound)}</td>
                <td style={{ padding: '11px 9px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(totals.closing)}</td>
                <td style={{ padding: '11px 9px', textAlign: 'left' }} />
              </tr>
            )}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p style={{ padding: '18px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '8px' }}>
            Không có dữ liệu nhập, xuất hoặc tồn khung sơn trong kỳ báo cáo.
          </p>
        )}
      </div>
      </section>}
    </div>
  );
}
