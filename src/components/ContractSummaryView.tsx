import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function ContractSummaryView() {
  const { contracts, addContract } = useApp();
  const [contractNo, setContractNo] = useState('');
  const [productCode, setProductCode] = useState('');
  const [partner, setPartner] = useState('');
  const [totalQty, setTotalQty] = useState('');

  const handleAddContract = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractNo || !productCode) {
      alert('Vui lòng nhập số hợp đồng và mã sản phẩm!');
      return;
    }

    const quantity = Number(totalQty) || 0;
    addContract({
      id: Date.now(),
      stt: contracts.reduce((max, contract) => Math.max(max, contract.stt), 0) + 1,
      contractNo,
      productCode,
      productName: '',
      partner,
      companyName: partner,
      quantity,
      totalQty: quantity,
      unit: 'Cái',
      unitPrice: 0,
      totalAmount: 0,
      requiredDeposit: 0,
      isLiquidated: false
    });
    setContractNo('');
    setProductCode('');
    setPartner('');
    setTotalQty('');
  };

  return (
    <div style={{ background: '#fff', padding: '16px', borderRadius: '8px' }}>
      <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', marginBottom: '16px' }}>
        📑 Quản Lý Hợp Đồng Đan
      </h2>

      <form onSubmit={handleAddContract} style={{ background: '#f1f5f9', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
          <input type="text" placeholder="Số hợp đồng..." value={contractNo} onChange={e => setContractNo(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
          <input type="text" placeholder="Mã sản phẩm..." value={productCode} onChange={e => setProductCode(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
          <input type="text" placeholder="Đối tác / Cty B..." value={partner} onChange={e => setPartner(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
          <input type="number" placeholder="Tổng số lượng..." value={totalQty} onChange={e => setTotalQty(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
        </div>
        <button type="submit" style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '4px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>
          + Thêm Hợp Đồng Mới
        </button>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
            <th style={{ padding: '8px' }}>Số Hợp Đồng</th>
            <th style={{ padding: '8px' }}>Mã Sản Phẩm</th>
            <th style={{ padding: '8px' }}>Đối Tác</th>
            <th style={{ padding: '8px', textAlign: 'right' }}>Số Lượng</th>
            <th style={{ padding: '8px', textAlign: 'center' }}>Trạng Thái</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map(c => (
            <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '8px', fontWeight: 'bold', color: '#2563eb' }}>{c.contractNo}</td>
              <td style={{ padding: '8px' }}>{c.productCode}</td>
              <td style={{ padding: '8px' }}>{c.partner || '—'}</td>
              <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>{c.totalQty}</td>
              <td style={{ padding: '8px', textAlign: 'center' }}>{c.isLiquidated ? 'Đã thanh lý' : 'Đang thực hiện'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}