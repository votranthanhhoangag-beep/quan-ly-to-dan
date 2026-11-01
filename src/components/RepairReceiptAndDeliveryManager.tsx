import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import ImageUploader from './ImageUploader';

interface RepairReceiptSlip {
  id: number;
  slipNo: string;
  date: string;
  artisanName: string;
  contractNoB: string;       
  productCode: string;
  unitType: 'Bộ' | 'Cái' | 'Cả Bộ lẫn Cái';
  receivedQty: number;       
  deliveredToBQty: number;   
  overflowContractNoB?: string; 
  overflowQty?: number;      
  repairWagePaid: number;    
  images: string[];          
  note: string;
}

export default function RepairReceiptAndDeliveryManager() {
  const { contracts } = useApp();
  const todayStr = new Date().toISOString().split('T')[0];

  const [slips, setSlips] = useState<RepairReceiptSlip[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [artisanName, setArtisanName] = useState('');
  const [currentContractNoB, setCurrentContractNoB] = useState('');
  const [productCode, setProductCode] = useState('');
  const [unitType, setUnitType] = useState<'Bộ' | 'Cái' | 'Cả Bộ lẫn Cái'>('Cái');
  
  const [maxRepairAllowed, setMaxRepairAllowed] = useState(10); 
  const [inputQty, setInputQty] = useState('');                
  const [repairWagePerUnit, setRepairWagePerUnit] = useState('10000');
  const [note, setNote] = useState('');
  const [images, setImages] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qtyNum = Number(inputQty) || 0;

    if (qtyNum <= 0) {
      alert('⚠️ Vui lòng nhập số lượng hàng lỗi đã sửa!');
      return;
    }

    if (images.length === 0) {
      alert('⛔ BẮT BUỘC CHỤP ẢNH: Phải chụp ảnh sản phẩm đã sửa/đan lại làm đối soát!');
      return;
    }

    let actualToCurrentContract = qtyNum;
    let overflowQty = 0;
    let nextContractNoB = '';

    if (qtyNum > maxRepairAllowed) {
      actualToCurrentContract = maxRepairAllowed;
      overflowQty = qtyNum - maxRepairAllowed;

      const nextContract = contracts.find(
        c => c.productCode === productCode && c.contractNo !== currentContractNoB && !c.isLiquidated
      );

      if (nextContract) {
        nextContractNoB = String(nextContract.contractNo);
        alert(
          `🔔 THÔNG BÁO TỰ ĐỘNG CHUYỂN HỢP ĐỒNG:\n\n` +
          `• Số lượng nhập (${qtyNum} ${unitType}) VƯỢT QUÁ số lỗi của HĐ ${currentContractNoB} (chỉ cần ${maxRepairAllowed} ${unitType}).\n` +
          `• Hệ thống đã tự động cấn trừ đủ ${maxRepairAllowed} ${unitType} cho HĐ ${currentContractNoB}.\n` +
          `• Số lượng dư (${overflowQty} ${unitType}) được TỰ ĐỘNG CHUYỂN SANG HĐ TIẾP THEO: ${nextContractNoB}!`
        );
      } else {
        alert(
          `⛔ CHẶN SỐ LƯỢNG VƯỢT MỨC:\n\n` +
          `Số lượng nhập (${qtyNum}) vượt quá số lỗi cần trả của HĐ ${currentContractNoB} (${maxRepairAllowed} ${unitType}).\n` +
          `Không tìm thấy Hợp đồng tiếp theo cùng mã hàng. Vui lòng kiểm tra lại!`
        );
        return;
      }
    }

    const totalWage = qtyNum * (Number(repairWagePerUnit) || 0);

    const newSlip: RepairReceiptSlip = {
      id: Date.now(),
      slipNo: `NH-SỬA-${String(slips.length + 1).padStart(2, '0')}/2026`,
      date: todayStr,
      artisanName,
      contractNoB: currentContractNoB,
      productCode,
      unitType,
      receivedQty: qtyNum,
      deliveredToBQty: actualToCurrentContract,
      overflowContractNoB: nextContractNoB || undefined,
      overflowQty: overflowQty > 0 ? overflowQty : undefined,
      repairWagePaid: totalWage,
      images,
      note
    };

    setSlips([newSlip, ...slips]);
    alert(`✅ Nhập hàng đã sửa & giao Cty B thành công!\n• Đã cấn trừ đủ cho HĐ: ${currentContractNoB}`);

    setShowForm(false);
    setInputQty('');
    setImages([]);
    setNote('');
  };

  return (
    <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#15803d', margin: 0 }}>
          📦 Nhập Hàng Đã Sửa Từ Hộ Đan & Giao Trực Tiếp Cty B
        </h2>
        <button 
          onClick={() => setShowForm(true)}
          style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
        >
          + Lập Phiếu Nhập & Giao Cty B
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: '#f0fdf4', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #bbf7d0' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#166534' }}>
            ➕ Tự Động Cấn Trừ Hàng Sửa Cho Cty B & Tự Động Tràn HĐ
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Tên Hộ Đan Trả Hàng:</label>
              <input type="text" required placeholder="VD: Nguyễn Văn A..." value={artisanName} onChange={e => setArtisanName(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#fff' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Hợp Đồng Cty B Hiện Tại:</label>
              <input type="text" required placeholder="VD: HĐ 001/A/26..." value={currentContractNoB} onChange={e => setCurrentContractNoB(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#fff', fontWeight: 'bold' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Mã Hàng:</label>
              <input type="text" required placeholder="VD: SD4344A/3..." value={productCode} onChange={e => setProductCode(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#fff', fontWeight: 'bold' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Đơn vị tính:</label>
              <select value={unitType} onChange={e => setUnitType(e.target.value as any)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#fff', fontWeight: 'bold' }}>
                <option value="Bộ">Theo Bộ</option>
                <option value="Cái">Theo Cái</option>
                <option value="Cả Bộ lẫn Cái">Cả Bộ lẫn Cái</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#dc2626' }}>
                Số lỗi HĐ này cần bù:
              </label>
              <input type="number" value={maxRepairAllowed} onChange={e => setMaxRepairAllowed(Number(e.target.value))} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #dc2626', fontSize: '12px', fontWeight: 'bold', background: '#fef2f2' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#16a34a' }}>
                Số lượng thực nhập đợt này:
              </label>
              <input type="number" required min="1" placeholder="Nhập số lượng thợ trả..." value={inputQty} onChange={e => setInputQty(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #16a34a', fontSize: '13px', fontWeight: 'bold', background: '#fff' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Đơn giá công sửa trả thợ (đ/cái):</label>
              <input type="number" value={repairWagePerUnit} onChange={e => setRepairWagePerUnit(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#fff' }} />
            </div>
          </div>

          <ImageUploader images={images} onChange={setImages} label="Chụp ảnh thực tế hàng đã sửa đạt chuẩn (Bắt buộc)" />

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button type="submit" style={{ flex: 1, background: '#16a34a', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
              💾 Lưu Phiếu & Tự Động Cấn Trừ HĐ
            </button>
            <button type="button" onClick={() => setShowForm(false)} style={{ background: '#64748b', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>Hủy</button>
          </div>
        </form>
      )}

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '900px' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', textAlign: 'left', color: '#334155' }}>
              <th style={{ padding: '10px' }}>Số Phiếu</th>
              <th style={{ padding: '10px' }}>Hộ Đan</th>
              <th style={{ padding: '10px' }}>Mã HĐ Cty B</th>
              <th style={{ padding: '10px' }}>Mã Hàng</th>
              <th style={{ padding: '10px', textAlign: 'right' }}>Tổng Nhận Sửa</th>
              <th style={{ padding: '10px', textAlign: 'right' }}>Giao HĐ Hiện Tại</th>
              <th style={{ padding: '10px', textAlign: 'right' }}>Tự Động Tràn HĐ Tiếp</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>Ảnh Đăng Tải</th>
            </tr>
          </thead>
          <tbody>
            {slips.length > 0 ? (
              slips.map((item, idx) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f8fafc', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '10px', fontWeight: 'bold', color: '#16a34a' }}>{item.slipNo}</td>
                  <td style={{ padding: '10px', fontWeight: 'bold' }}>{item.artisanName}</td>
                  <td style={{ padding: '10px', fontWeight: 'bold', color: '#2563eb' }}>{item.contractNoB}</td>
                  <td style={{ padding: '10px' }}>{item.productCode}</td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>{item.receivedQty} {item.unitType}</td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#16a34a' }}>{item.deliveredToBQty} {item.unitType}</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: item.overflowQty ? '#d97706' : '#94a3b8' }}>
                    {item.overflowQty ? (
                      <strong>+{item.overflowQty} {item.unitType} (HĐ: {item.overflowContractNoB})</strong>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>
                    <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '11px' }}>
                      📸 {item.images.length} ảnh
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>Chưa có phiếu nhập hàng sửa & giao Cty B nào!</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}