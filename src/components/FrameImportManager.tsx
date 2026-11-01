import React, { useState } from 'react';
import { filterPhoneDigits, isValidVietnamMobileNumber } from '../utils/vietnamPhone';

interface SizeDetail {
  sizeName: string;
  stockAvailable: number;
  exportQty: number;
}

interface FrameExportSlip {
  id: number;
  slipNo: string;
  date: string;
  productCode: string;
  productName: string;
  exportMode: 'BO' | 'CAI';
  setsQuantity?: number;
  sizeDetails?: SizeDetail[];
  artisanName: string;
  address: string;
  zalo: string;
  deadline: string;
  depositAmount: number;
  paymentMethod: 'Tiền mặt' | 'Chuyển khoản';
  note: string;
}

export default function FrameExportManager() {
  const todayStr = new Date().toISOString().split('T')[0];

  const productCatalog = [
    {
      code: 'SD4344A/3',
      name: 'Giỏ Lục Bình Đa Năng (3 Size)',
      sizes: [
        { sizeName: 'Size 1 (Nhỏ)', stockAvailable: 120 },
        { sizeName: 'Size 2 (Trung)', stockAvailable: 85 },
        { sizeName: 'Size 3 (Lớn)', stockAvailable: 50 },
      ]
    },
    {
      code: 'SD20635A/9',
      name: 'Bộ Ghế Sate 9 Chi Tiết',
      sizes: [
        { sizeName: 'Chi tiết C1 - Mặt ngồi', stockAvailable: 100 },
        { sizeName: 'Chi tiết C2 - Tựa lưng', stockAvailable: 100 },
        { sizeName: 'Chi tiết C3 - Tay vịn trái', stockAvailable: 120 },
        { sizeName: 'Chi tiết C4 - Tay vịn phải', stockAvailable: 120 },
        { sizeName: 'Chi tiết C5 - Thanh giằng', stockAvailable: 90 },
      ]
    }
  ];

  const [exportsList, setExportsList] = useState<FrameExportSlip[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [form, setForm] = useState({
    date: todayStr,
    productCode: 'SD4344A/3',
    exportMode: 'CAI' as 'BO' | 'CAI',
    setsQuantity: 1,
    sizeDetails: [
      { sizeName: 'Size 1 (Nhỏ)', stockAvailable: 120, exportQty: 0 },
      { sizeName: 'Size 2 (Trung)', stockAvailable: 85, exportQty: 0 },
      { sizeName: 'Size 3 (Lớn)', stockAvailable: 50, exportQty: 0 },
    ],
    artisanName: '',
    address: '',
    zalo: '',
    deadline: todayStr,
    depositAmount: 0,
    paymentMethod: 'Chuyển khoản' as 'Tiền mặt' | 'Chuyển khoản',
    note: ''
  });
  const isZaloInvalid = !isValidVietnamMobileNumber(form.zalo);

  // Load danh sách size khi chọn sản phẩm
  const handleProductChange = (code: string) => {
    const found = productCatalog.find(p => p.code === code);
    if (found) {
      setForm(prev => ({
        ...prev,
        productCode: found.code,
        sizeDetails: found.sizes.map(s => ({ ...s, exportQty: 0 }))
      }));
    }
  };

  // HÀM XÓA BỚT SIZE KHÔNG DÙNG ĐỂ TRÁNH NHẬP NHẦM
  const removeSizeRow = (indexToRemove: number) => {
    setForm(prev => ({
      ...prev,
      sizeDetails: prev.sizeDetails.filter((_, idx) => idx !== indexToRemove)
    }));
  };

  // HÀM KHÔI PHỤC ĐẦY ĐỦ CÁC SIZE BAN ĐẦU
  const resetAllSizes = () => {
    const found = productCatalog.find(p => p.code === form.productCode);
    if (found) {
      setForm(prev => ({
        ...prev,
        sizeDetails: found.sizes.map(s => ({ ...s, exportQty: 0 }))
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.artisanName || !form.zalo || !form.deadline) {
      alert('⚠️ Vui lòng điền đầy đủ Họ tên, Số Zalo và Hạn đan!');
      return;
    }
    if (isZaloInvalid) {
      alert('⚠️ Số Zalo phải có đúng 10 chữ số và bắt đầu bằng đầu số di động hợp lệ tại Việt Nam!');
      return;
    }

    if (form.deadline < todayStr) {
      alert(`⛔ HẠN ĐAN KHÔNG HỢP LỆ: Hạn đan phải lớn hơn hoặc bằng ngày hiện tại (${todayStr})!`);
      return;
    }

    const foundProduct = productCatalog.find(p => p.code === form.productCode);
    const productName = foundProduct ? foundProduct.name : 'Sản phẩm đan';

    if (editingId !== null) {
      setExportsList(exportsList.map(item => item.id === editingId ? { ...item, ...form, productName } : item));
      alert('✅ Đã cập nhật phiếu xuất thành công!');
    } else {
      const newSlip: FrameExportSlip = {
        id: Date.now(),
        slipNo: `XK-${String(exportsList.length + 1).padStart(2, '0')}/2026`,
        ...form,
        productName
      };
      setExportsList([newSlip, ...exportsList]);
      alert('✅ Lập phiếu xuất thành công!');
    }

    setShowForm(false);
    setEditingId(null);
  };

  return (
    <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>
          📤 Xuất Khung Cho Tổ Đan (Tự Chọn & Xóa Size Tránh Nhập Nhầm)
        </h2>
        <button 
          onClick={() => { setEditingId(null); setShowForm(true); }}
          style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
        >
          + Tạo Phiếu Xuất Mới
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #cbd5e1' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#1e293b' }}>
            {editingId !== null ? '✏️ Sửa Phiếu Xuất Khung' : '➕ Lập Phiếu Xuất Khung Mới'}
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Ngày xuất:</label>
              <input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Mã hàng:</label>
              <select value={form.productCode} onChange={e => handleProductChange(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}>
                {productCatalog.map((p, i) => (
                  <option key={i} value={p.code}>{p.code} - {p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* CHỌN HÌNH THỨC VÀ XÓA SIZE KHÔNG NẰM TRONG ĐỢT XUẤT */}
          <div style={{ background: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#0f172a' }}>
              📦 Hình thức nhận khung:
            </label>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                <input type="radio" name="exportMode" checked={form.exportMode === 'BO'} onChange={() => setForm({ ...form, exportMode: 'BO' })} style={{ marginRight: '6px' }} />
                Nhận theo BỘ
              </label>
              <label style={{ fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                <input type="radio" name="exportMode" checked={form.exportMode === 'CAI'} onChange={() => setForm({ ...form, exportMode: 'CAI' })} style={{ marginRight: '6px' }} />
                Nhận theo CÁI / Size lẻ
              </label>
            </div>

            {form.exportMode === 'BO' ? (
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>Số lượng bộ xuất:</label>
                <input type="number" min="1" required value={form.setsQuantity} onChange={e => setForm({ ...form, setsQuantity: Number(e.target.value) })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b' }}>
                    Tùy chọn số lượng xuất (Bấm nút xóa 🗑️ để ẩn bớt Size không dùng):
                  </span>
                  <button type="button" onClick={resetAllSizes} style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                    🔄 Hiện lại đầy đủ các Size
                  </button>
                </div>

                {form.sizeDetails.length > 0 ? (
                  form.sizeDetails.map((sz, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '8px', borderRadius: '4px', marginBottom: '6px', border: '1px solid #e2e8f0' }}>
                      <div style={{ flex: 2, fontSize: '12px' }}>
                        <strong>{sz.sizeName}</strong> <span style={{ color: '#16a34a', fontSize: '11px' }}>(Tồn kho: {sz.stockAvailable})</span>
                      </div>
                      
                      <div style={{ flex: 1, display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <input 
                          type="number" min="0" max={sz.stockAvailable} placeholder="Số cái..."
                          value={sz.exportQty || ''}
                          onChange={e => {
                            const newSizes = [...form.sizeDetails];
                            newSizes[idx].exportQty = Number(e.target.value);
                            setForm({ ...form, sizeDetails: newSizes });
                          }}
                          style={{ width: '80px', padding: '6px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                        />
                        <button 
                          type="button" 
                          onClick={() => removeSizeRow(idx)}
                          style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '6px 8px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                          title="Xóa bớt dòng này để tránh gõ nhầm số lượng"
                        >
                          🗑️ Xóa
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', padding: '10px', color: '#94a3b8', fontSize: '11px' }}>
                    Đã xóa hết các size! Bấm nút "Hiện lại đầy đủ các Size" để chọn lại.
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Họ tên thợ đan:</label>
              <input type="text" required placeholder="Nhập tên..." value={form.artisanName} onChange={e => setForm({ ...form, artisanName: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Số Zalo:</label>
              <input type="tel" inputMode="numeric" required placeholder="SĐT Zalo..." value={form.zalo} onChange={e => setForm({ ...form, zalo: filterPhoneDigits(e.target.value) })} aria-invalid={isZaloInvalid} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: `1px solid ${isZaloInvalid ? '#dc2626' : '#cbd5e1'}`, fontSize: '12px' }} />
              {isZaloInvalid && <small role="alert" style={{ display: 'block', marginTop: '5px', color: '#dc2626', fontWeight: 700 }}>Số Zalo phải có đúng 10 chữ số hợp lệ.</small>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Địa chỉ:</label>
              <input type="text" placeholder="Địa chỉ..." value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#dc2626' }}>Hạn đan (&gt;= {todayStr}):</label>
              <input type="date" required min={todayStr} value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #dc2626', fontSize: '12px', fontWeight: 'bold' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Tiền cọc / Ứng trước (VNĐ):</label>
              <input type="number" min="0" value={form.depositAmount} onChange={e => setForm({ ...form, depositAmount: Number(e.target.value) })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Hình thức cọc:</label>
              <select value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value as any })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}>
                <option value="Chuyển khoản">Chuyển khoản</option>
                <option value="Tiền mặt">Tiền mặt</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Ghi chú:</label>
            <input type="text" placeholder="Ghi chú thêm..." value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" disabled={isZaloInvalid} style={{ flex: 1, background: isZaloInvalid ? '#94a3b8' : '#16a34a', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', cursor: isZaloInvalid ? 'not-allowed' : 'pointer' }}>
              {editingId !== null ? '💾 Lưu Cập Nhật' : '💾 Lưu Phiếu Xuất Khung'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} style={{ background: '#64748b', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>Hủy</button>
          </div>
        </form>
      )}

      {/* BẢNG DANH SÁCH PHIẾU XUẤT KHUNG */}
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '850px' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', textAlign: 'left', color: '#334155' }}>
              <th style={{ padding: '10px' }}>Mã Phiếu</th>
              <th style={{ padding: '10px' }}>Ngày Xuất</th>
              <th style={{ padding: '10px' }}>Mã Hàng</th>
              <th style={{ padding: '10px' }}>Thợ Đan / Zalo</th>
              <th style={{ padding: '10px' }}>Số Lượng Xuất</th>
              <th style={{ padding: '10px' }}>Hạn Đan</th>
              <th style={{ padding: '10px', textAlign: 'right' }}>Tiền Cọc</th>
            </tr>
          </thead>
          <tbody>
            {exportsList.length > 0 ? (
              exportsList.map((item, idx) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f8fafc', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '10px', fontWeight: 'bold', color: '#2563eb' }}>{item.slipNo}</td>
                  <td style={{ padding: '10px' }}>{item.date}</td>
                  <td style={{ padding: '10px', fontWeight: 'bold', color: '#16a34a' }}>{item.productCode}</td>
                  <td style={{ padding: '10px' }}>
                    <strong>{item.artisanName}</strong><br/>
                    <small style={{ color: '#64748b' }}>Zalo: {item.zalo}</small>
                  </td>
                  <td style={{ padding: '10px' }}>
                    {item.exportMode === 'BO' ? (
                      <strong>{item.setsQuantity} Bộ</strong>
                    ) : (
                      <div style={{ fontSize: '11px' }}>
                        {item.sizeDetails?.map((s, i) => s.exportQty > 0 && <div key={i}>• {s.sizeName}: <strong>{s.exportQty} cái</strong></div>)}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px', fontWeight: 'bold', color: '#dc2626' }}>{item.deadline}</td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>{item.depositAmount.toLocaleString()} đ</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>Chưa có phiếu xuất nào!</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}