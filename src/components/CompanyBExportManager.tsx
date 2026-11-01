import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import ImageUploader from './ImageUploader';

interface CompanyBExportSlip {
  id: number;
  slipNo: string;
  date: string;
  contractNoB: string;
  productCode: string;
  unitType: 'Bộ' | 'Cái' | 'Cả Bộ lẫn Cái';
  exportQty: number;
  recipientName: string;
  note: string;
  images: string[];
}

export default function CompanyBExportManager() {
  const { contracts } = useApp();
  const todayStr = new Date().toISOString().split('T')[0];

  const [slips, setSlips] = useState<CompanyBExportSlip[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [contractNoB, setContractNoB] = useState('');
  const [productCode, setProductCode] = useState('');
  const [unitType, setUnitType] = useState<'Bộ' | 'Cái' | 'Cả Bộ lẫn Cái'>('Cái');
  const [exportQty, setExportQty] = useState('');
  const [recipientName, setRecipientName] = useState('Đại diện Công ty B');
  const [note, setNote] = useState('');
  const [images, setImages] = useState<string[]>([]);

  // Sắp xếp và lọc hợp đồng an toàn (tránh lỗi undefined property)
  const activeContracts = contracts.slice().sort((a, b) => {
    const qtyA = a.quantity ?? a.totalQty ?? 0;
    const qtyB = b.quantity ?? b.totalQty ?? 0;
    return qtyA - qtyB;
  });

  const handleSelectContract = (contractNo: string) => {
    setContractNoB(contractNo);
    const found = contracts.find(c => c.contractNo === contractNo);
    if (found) {
      setProductCode(found.productCode || '');
      if (found.unitType) {
        setUnitType(found.unitType);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qtyNum = Number(exportQty) || 0;

    if (!contractNoB || qtyNum <= 0) {
      alert('⚠️ Vui lòng chọn Hợp đồng và nhập số lượng xuất hợp lệ!');
      return;
    }

    if (images.length === 0) {
      alert('⛔ BẮT BUỘC CHỤP ẢNH: Phải chụp ảnh thành phẩm giao Công ty B làm bằng chứng!');
      return;
    }

    const newSlip: CompanyBExportSlip = {
      id: Date.now(),
      slipNo: `XK-CTYB-${String(slips.length + 1).padStart(3, '0')}/2026`,
      date: todayStr,
      contractNoB,
      productCode,
      unitType,
      exportQty: qtyNum,
      recipientName,
      note,
      images
    };

    setSlips([newSlip, ...slips]);
    alert(`✅ Lập phiếu xuất thành phẩm giao Công ty B thành công!\n• Số phiếu: ${newSlip.slipNo}\n• Số lượng: ${qtyNum} ${unitType}`);

    setShowForm(false);
    setContractNoB('');
    setProductCode('');
    setExportQty('');
    setNote('');
    setImages([]);
  };

  return (
    <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1d4ed8', margin: 0 }}>
            📤 Xuất Thành Phẩm Giao Cho Công Ty B
          </h2>
          <span style={{ fontSize: '12px', color: '#64748b' }}>Quản lý bàn giao thành phẩm hoàn thiện đan lát kèm hình ảnh chứng từ</span>
        </div>
        <button 
          onClick={() => setShowForm(true)}
          style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
        >
          + Lập Phiếu Xuất Kho Cty B
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: '#eff6ff', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #bfdbfe' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#1e40af' }}>
            ➕ Tạo Phiếu Giao Thành Phẩm Cho Công Ty B
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Chọn Hợp Đồng / Đơn hàng lớn:</label>
              <select 
                value={contractNoB} 
                onChange={e => handleSelectContract(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#fff', fontWeight: 'bold' }}
              >
                <option value="">-- Chọn Hợp đồng giao hàng --</option>
                {activeContracts.map(c => (
                  <option key={c.id} value={c.contractNo}>
                    {c.contractNo} - SP: {c.productCode} ({c.productName || 'Lục bình'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Mã sản phẩm:</label>
              <input 
                type="text" 
                required 
                readOnly
                placeholder="Tự động điền từ HĐ..." 
                value={productCode} 
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#f1f5f9', fontWeight: 'bold' }} 
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Quy cách đơn vị:</label>
              <select value={unitType} onChange={e => setUnitType(e.target.value as any)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#fff' }}>
                <option value="Cái">Cái</option>
                <option value="Bộ">Bộ</option>
                <option value="Cả Bộ lẫn Cái">Cả Bộ lẫn Cái</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#1d4ed8' }}>Số lượng xuất giao:</label>
              <input 
                type="number" 
                required 
                min="1"
                placeholder="Nhập số lượng..." 
                value={exportQty} 
                onChange={e => setExportQty(e.target.value)} 
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #2563eb', fontSize: '13px', fontWeight: 'bold', background: '#fff' }} 
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Người đại diện nhận (Cty B):</label>
              <input 
                type="text" 
                value={recipientName} 
                onChange={e => setRecipientName(e.target.value)} 
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#fff' }} 
              />
            </div>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Ghi chú giao hàng:</label>
            <input 
              type="text" 
              placeholder="VD: Giao đợt 1 theo hợp đồng..." 
              value={note} 
              onChange={e => setNote(e.target.value)} 
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#fff' }} 
            />
          </div>

          <ImageUploader images={images} onChange={setImages} label="Chụp ảnh thực tế bàn giao / Biên bản giao nhận (Bắt buộc)" />

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button type="submit" style={{ flex: 1, background: '#2563eb', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
              💾 Lưu & Xác Nhận Giao Hàng
            </button>
            <button type="button" onClick={() => setShowForm(false)} style={{ background: '#64748b', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>Hủy</button>
          </div>
        </form>
      )}

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '850px' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', textAlign: 'left', color: '#334155' }}>
              <th style={{ padding: '10px' }}>Số Phiếu Xuất</th>
              <th style={{ padding: '10px' }}>Ngày Giao</th>
              <th style={{ padding: '10px' }}>Mã HĐ Cty B</th>
              <th style={{ padding: '10px' }}>Mã Sản Phẩm</th>
              <th style={{ padding: '10px', textAlign: 'right' }}>Số Lượng Giao</th>
              <th style={{ padding: '10px' }}>Người Nhận</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>Chứng Từ</th>
            </tr>
          </thead>
          <tbody>
            {slips.length > 0 ? (
              slips.map((item, idx) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f8fafc', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '10px', fontWeight: 'bold', color: '#2563eb' }}>{item.slipNo}</td>
                  <td style={{ padding: '10px' }}>{item.date}</td>
                  <td style={{ padding: '10px', fontWeight: 'bold' }}>{item.contractNoB}</td>
                  <td style={{ padding: '10px', color: '#0f172a' }}>{item.productCode}</td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#16a34a', fontSize: '13px' }}>
                    {item.exportQty.toLocaleString()} {item.unitType}
                  </td>
                  <td style={{ padding: '10px' }}>{item.recipientName}</td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>
                    <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '11px' }}>
                      📸 {item.images.length} ảnh
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>Chưa có phiếu xuất thành phẩm giao Công ty B nào!</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}