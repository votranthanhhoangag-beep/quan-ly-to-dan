import React, { useState } from 'react';
import ImageUploader from './ImageUploader';

interface DefectiveReturnSlip {
  id: number;
  slipNo: string;
  date: string;
  contractNoB: string;
  productCode: string;
  unitType: 'Bộ' | 'Cái' | 'Cả Bộ lẫn Cái';
  defectiveQty: number;
  reason: string;
  images: string[];
}

export default function DefectiveReturnManager() {
  const todayStr = new Date().toISOString().split('T')[0];
  const [slips, setSlips] = useState<DefectiveReturnSlip[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [contractNoB, setContractNoB] = useState('');
  const [productCode, setProductCode] = useState('');
  const [unitType, setUnitType] = useState<'Bộ' | 'Cái' | 'Cả Bộ lẫn Cái'>('Cái');
  const [defectiveQty, setDefectiveQty] = useState('');
  const [reason, setReason] = useState('');
  const [images, setImages] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(defectiveQty) || 0;
    if (!contractNoB || qty <= 0) {
      alert('⚠️ Vui lòng nhập số hợp đồng và số lượng lỗi hợp lệ!');
      return;
    }
    if (images.length === 0) {
      alert('⛔ BẮT BUỘC: Phải chụp ảnh hàng lỗi từ Cty B trả về!');
      return;
    }

    const newSlip: DefectiveReturnSlip = {
      id: Date.now(),
      slipNo: `NH-LỖI-${String(slips.length + 1).padStart(2, '0')}/2026`,
      date: todayStr,
      contractNoB,
      productCode,
      unitType,
      defectiveQty: qty,
      reason,
      images
    };

    setSlips([newSlip, ...slips]);
    alert(`✅ Lập phiếu nhận hàng lỗi thành công: ${newSlip.slipNo}`);
    setShowForm(false);
    setContractNoB('');
    setProductCode('');
    setDefectiveQty('');
    setReason('');
    setImages([]);
  };

  return (
    <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#b91c1c', margin: 0 }}>
          🔄 Nhập Hàng Lỗi Trả Về Từ Công Ty B
        </h2>
        <button 
          onClick={() => setShowForm(true)}
          style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
        >
          + Lập Phiếu Nhập Hàng Lỗi
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: '#fef2f2', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #fecaca' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px', color: '#991b1b' }}>Ghi Nhận Hàng Lỗi Do Cty B Trả Về</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Số Hợp Đồng Lớn (Cty B):</label>
              <input type="text" required placeholder="VD: HĐ 001/A/26" value={contractNoB} onChange={e => setContractNoB(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Mã Hàng:</label>
              <input type="text" required placeholder="VD: SD4344A/3" value={productCode} onChange={e => setProductCode(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Quy cách đơn vị:</label>
              <select value={unitType} onChange={e => setUnitType(e.target.value as any)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}>
                <option value="Bộ">Bộ</option>
                <option value="Cái">Cái</option>
                <option value="Cả Bộ lẫn Cái">Cả Bộ lẫn Cái</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#dc2626' }}>Số lượng lỗi:</label>
              <input type="number" required min="1" value={defectiveQty} onChange={e => setDefectiveQty(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #dc2626', fontSize: '12px', fontWeight: 'bold' }} />
            </div>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Lý do lỗi:</label>
            <input type="text" placeholder="VD: Lỏng mối đan, lệch vành..." value={reason} onChange={e => setReason(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
          </div>
          <ImageUploader images={images} onChange={setImages} label="Chụp ảnh chứng từ hàng lỗi (Bắt buộc)" />
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button type="submit" style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Lưu Phiếu</button>
            <button type="button" onClick={() => setShowForm(false)} style={{ background: '#64748b', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Hủy</button>
          </div>
        </form>
      )}

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
              <th style={{ padding: '10px' }}>Số Phiếu</th>
              <th style={{ padding: '10px' }}>Ngày</th>
              <th style={{ padding: '10px' }}>Hợp Đồng Cty B</th>
              <th style={{ padding: '10px' }}>Mã Hàng</th>
              <th style={{ padding: '10px', textAlign: 'right' }}>SL Lỗi</th>
              <th style={{ padding: '10px' }}>Lý Do</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>Ảnh</th>
            </tr>
          </thead>
          <tbody>
            {slips.length > 0 ? slips.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '10px', fontWeight: 'bold', color: '#dc2626' }}>{s.slipNo}</td>
                <td style={{ padding: '10px' }}>{s.date}</td>
                <td style={{ padding: '10px', fontWeight: 'bold' }}>{s.contractNoB}</td>
                <td style={{ padding: '10px' }}>{s.productCode}</td>
                <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#dc2626' }}>{s.defectiveQty} {s.unitType}</td>
                <td style={{ padding: '10px' }}>{s.reason}</td>
                <td style={{ padding: '10px', textAlign: 'center' }}>📸 {s.images.length}</td>
              </tr>
            )) : (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>Chưa có phiếu hàng lỗi nào!</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}