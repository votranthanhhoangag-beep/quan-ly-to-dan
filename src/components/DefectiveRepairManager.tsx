import React, { useState } from 'react';
import ImageUploader from './ImageUploader';
import { useApp } from '../context/AppContext';

interface DefectiveRepairSlip {
  id: number;
  slipNo: string;
  date: string;
  contractNo: string;
  artisanName: string;
  productCode: string;
  unitType: 'Bộ' | 'Cái' | 'Cả Bộ lẫn Cái';
  repairQty: number;
  repairWagePerUnit: number;
  totalRepairWage: number;
  note: string;
  images: string[];
}

export default function DefectiveRepairManager() {
  const { frameExports } = useApp();
  const todayStr = new Date().toISOString().split('T')[0];

  const [slips, setSlips] = useState<DefectiveRepairSlip[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [searchKey, setSearchKey] = useState('');
  const [selectedExportId, setSelectedExportId] = useState('');
  const [contractNo, setContractNo] = useState('');
  const [artisanName, setArtisanName] = useState('');
  const [productCode, setProductCode] = useState('');
  const [unitType] = useState<'Bộ' | 'Cái' | 'Cả Bộ lẫn Cái'>('Cái');
  const [repairQty, setRepairQty] = useState('');
  const [repairWagePerUnit, setRepairWagePerUnit] = useState('10000');
  const [note, setNote] = useState('');
  const [images, setImages] = useState<string[]>([]);

  const suggestedArtisanExports = frameExports ? frameExports.filter(item =>
    item.artisanName.toLowerCase().includes(searchKey.toLowerCase()) ||
    item.contractNo.toLowerCase().includes(searchKey.toLowerCase()) ||
    item.productCode.toLowerCase().includes(searchKey.toLowerCase())
  ) : [];

  const handleSelectArtisanRecord = (exportId: string) => {
    setSelectedExportId(exportId);
    const found = frameExports.find(item => String(item.id) === exportId);
    if (found) {
      setContractNo(found.contractNo);
      setArtisanName(found.artisanName);
      setProductCode(found.productCode);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractNo || !artisanName || !repairQty) {
      alert('⚠️ Vui lòng chọn Hộ đan / Hợp đồng gốc và nhập số lượng lỗi cần sửa!');
      return;
    }
    if (images.length === 0) {
      alert('⛔ BẮT BUỘC CHỤP ẢNH: Bạn phải tải lên ít nhất 1 hình ảnh chứng từ giao hàng lỗi!');
      return;
    }

    const qtyNum = Number(repairQty) || 0;
    const wageNum = Number(repairWagePerUnit) || 0;
    const totalWage = qtyNum * wageNum;

    const newSlip: DefectiveRepairSlip = {
      id: Date.now(),
      slipNo: `XK-SỬA-${String(slips.length + 1).padStart(2, '0')}/2026`,
      date: todayStr,
      contractNo,
      artisanName,
      productCode,
      unitType,
      repairQty: qtyNum,
      repairWagePerUnit: wageNum,
      totalRepairWage: totalWage,
      note,
      images
    };

    setSlips([newSlip, ...slips]);
    alert(`✅ Lập phiếu xuất hàng lỗi cho hộ đan sửa thành công! Tổng tiền công sửa: ${totalWage.toLocaleString()} đ`);
    setShowForm(false);
    setSearchKey('');
    setSelectedExportId('');
    setContractNo('');
    setArtisanName('');
    setProductCode('');
    setRepairQty('');
    setNote('');
    setImages([]);
  };

  return (
    <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>
          🛠️ Xuất Hàng Lỗi Trả Lại Hộ Đan Sửa Chữa
        </h2>
        <button 
          onClick={() => setShowForm(true)}
          style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
        >
          + Lập Phiếu Xuất Sửa Hàng Lỗi
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: '#f0f9ff', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #bae6fd' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#0369a1' }}>
            ➕ Giao Hàng Lỗi Cho Hộ Đan Sửa Lại
          </h3>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>🔍 Tìm kiếm tên Hộ đan hoặc Số HĐ gốc:</label>
            <input 
              type="text"
              placeholder="Nhập tên hộ đan hoặc số hợp đồng..."
              value={searchKey}
              onChange={e => setSearchKey(e.target.value)}
              style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#fff' }}
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#0369a1' }}>💡 Chọn đúng Hộ đan & Hợp đồng gốc:</label>
            <select 
              value={selectedExportId}
              onChange={e => handleSelectArtisanRecord(e.target.value)}
              style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #7dd3fc', fontSize: '12px', background: '#e0f2fe', fontWeight: 'bold', color: '#0369a1' }}
            >
              <option value="">-- Chọn Hộ đan từ lịch sử xuất khung --</option>
              {suggestedArtisanExports.map((item) => (
                <option key={item.id} value={item.id}>
                  🏡 Hộ đan: {item.artisanName} | 📑 HĐ: {item.contractNo} | 📦 Mã: {item.productCode}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Số Hợp Đồng Gốc:</label>
              <input type="text" readOnly value={contractNo} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#f1f5f9', fontWeight: 'bold' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Tên Hộ Đan Nhận Sửa:</label>
              <input type="text" readOnly value={artisanName} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#f1f5f9', fontWeight: 'bold' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Mã Hàng:</label>
              <input type="text" readOnly value={productCode} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#f1f5f9', fontWeight: 'bold' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#dc2626' }}>Số lượng lỗi xuất sửa:</label>
              <input type="number" required min="1" value={repairQty} onChange={e => setRepairQty(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #dc2626', fontSize: '12px', fontWeight: 'bold', background: '#fff' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Đơn giá công sửa / cái (VNĐ):</label>
              <input type="number" min="0" value={repairWagePerUnit} onChange={e => setRepairWagePerUnit(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 'bold', background: '#fff' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#16a34a' }}>Tổng tiền công sửa phải trả:</label>
              <div style={{ padding: '8px', borderRadius: '4px', border: '1px solid #16a34a', fontSize: '13px', fontWeight: 'bold', color: '#15803d', background: '#f0fdf4' }}>
                {((Number(repairQty) || 0) * (Number(repairWagePerUnit) || 0)).toLocaleString()} VNĐ
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Ghi chú yêu cầu sửa chữa:</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#fff' }} />
          </div>

          <ImageUploader images={images} onChange={setImages} label="Chụp ảnh giao hàng lỗi cho hộ đan sửa (Bắt buộc)" />

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button type="submit" style={{ flex: 1, background: '#0284c7', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
              💾 Lưu Phiếu Xuất Sửa Hàng Lỗi
            </button>
            <button type="button" onClick={() => setShowForm(false)} style={{ background: '#64748b', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>Hủy</button>
          </div>
        </form>
      )}

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '900px' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', textAlign: 'left', color: '#334155' }}>
              <th style={{ padding: '10px' }}>Số Phiếu Sửa</th>
              <th style={{ padding: '10px' }}>Ngày Xuất</th>
              <th style={{ padding: '10px' }}>Hợp Đồng Gốc</th>
              <th style={{ padding: '10px' }}>Hộ Đan Sửa</th>
              <th style={{ padding: '10px' }}>Mã Hàng</th>
              <th style={{ padding: '10px', textAlign: 'right' }}>SL Sửa</th>
              <th style={{ padding: '10px', textAlign: 'right' }}>Tiền Công Sửa</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>Ảnh Đối Soát</th>
            </tr>
          </thead>
          <tbody>
            {slips.length > 0 ? (
              slips.map((item, idx) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f8fafc', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '10px', fontWeight: 'bold', color: '#0284c7' }}>{item.slipNo}</td>
                  <td style={{ padding: '10px' }}>{item.date}</td>
                  <td style={{ padding: '10px', fontWeight: 'bold' }}>{item.contractNo}</td>
                  <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{item.artisanName}</td>
                  <td style={{ padding: '10px', color: '#16a34a', fontWeight: 'bold' }}>{item.productCode}</td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#dc2626' }}>{item.repairQty} {item.unitType}</td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#15803d' }}>{item.totalRepairWage.toLocaleString()} đ</td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>📸 {item.images.length} ảnh</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>Chưa có phiếu xuất hàng lỗi giao hộ đan sửa nào!</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}