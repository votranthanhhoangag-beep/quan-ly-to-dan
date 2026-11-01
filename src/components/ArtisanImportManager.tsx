import React, { useState } from 'react';

interface ArtisanExportRecord {
  artisanName: string;
  zalo: string;
  contractNoB: string;
  productCode: string;
  productName: string;
  totalExportedQty: number; // Tổng khung đã phát cho hộ đan
  agreedUnitPrice: number;  // Đơn giá thỏa thuận trước đó (đ/cái)
}

interface ArtisanImportSlip {
  id: number;
  slipNo: string;
  date: string;
  artisanName: string;
  contractNoB: string;
  productCode: string;
  importedQty: number;     // Số lượng hàng thực nhập đợt này
  agreedUnitPrice: number; // Đơn giá thỏa thuận
  totalAmount: number;     // Thành tiền = SL x Đơn giá
  paymentMethod: 'Chuyển khoản' | 'Tiền mặt';
  note: string;
}

export default function ArtisanImportManager() {
  const todayStr = new Date().toISOString().split('T')[0];

  // Dữ liệu mẫu các đợt phát khung cho Hộ đan trước đó
  const [artisanAssignments] = useState<ArtisanExportRecord[]>([
    {
      artisanName: 'Nguyễn Văn A',
      zalo: '0909123456',
      contractNoB: 'HĐ-001/B/26',
      productCode: 'SD4344A/3',
      productName: 'Giỏ Lục Bình 3 Size',
      totalExportedQty: 50, // Phát 50 khung
      agreedUnitPrice: 35000 // Đơn giá thỏa thuận 35.000đ/cái
    },
    {
      artisanName: 'Trần Thị B',
      zalo: '0918888999',
      contractNoB: 'HĐ-001/B/26',
      productCode: 'SD20635A/9',
      productName: 'Bộ Ghế Sate 9 Chi Tiết',
      totalExportedQty: 20,
      agreedUnitPrice: 380000
    }
  ]);

  // Lịch sử các phiếu nhập hàng + trả tiền cho Hộ đan
  const [importSlips, setImportSlips] = useState<ArtisanImportSlip[]>([
    {
      id: 1,
      slipNo: 'NH-01/2026',
      date: '2026-10-10',
      artisanName: 'Nguyễn Văn A',
      contractNoB: 'HĐ-001/B/26',
      productCode: 'SD4344A/3',
      importedQty: 20,
      agreedUnitPrice: 35000,
      totalAmount: 700000,
      paymentMethod: 'Chuyển khoản',
      note: 'Nhập đợt 1 thành phẩm đan đẹp'
    }
  ]);

  // Bộ lọc tìm kiếm ban đầu
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Form State
  const [selectedArtisan, setSelectedArtisan] = useState('');
  const [importedQty, setImportedQty] = useState('');
  const [agreedUnitPrice, setAgreedUnitPrice] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Chuyển khoản' | 'Tiền mặt'>('Chuyển khoản');
  const [note, setNote] = useState('');

  // Gợi ý hợp đồng tiếp theo khi giao dôi ra
  const [excessWarning, setExcessWarning] = useState<{ exceeded: boolean; excessQty: number } | null>(null);

  // Tìm thông tin Hộ đan đang chọn
  const activeAssignment = artisanAssignments.find(a => a.artisanName === selectedArtisan);

  // TÍNH TOÁN THEO DÕI HỘ ĐAN:
  // 1. Số lần nhập/trả hàng trước đó của hộ đan này
  const artisanPreviousImports = importSlips.filter(s => s.artisanName === selectedArtisan);
  const importCount = artisanPreviousImports.length;

  // 2. Tổng số hàng thành phẩm hộ đan đã trả trước đó
  const totalQtyDeliveredSoFar = artisanPreviousImports.reduce((sum, s) => sum + s.importedQty, 0);

  // 3. Số hàng đan còn lại cần lấy của hộ đan đó
  const totalExported = activeAssignment ? activeAssignment.totalExportedQty : 0;
  const remainingQtyToCollect = Math.max(0, totalExported - totalQtyDeliveredSoFar);

  // 4. Tổng số tiền hộ đan đã nhận từ trước đến nay
  const totalMoneyEarnedSoFar = artisanPreviousImports.reduce((sum, s) => sum + s.totalAmount, 0);

  // Chọn Hộ đan -> Tự động điền Đơn giá thỏa thuận trước đó
  const handleSelectArtisan = (artisan: string) => {
    setSelectedArtisan(artisan);
    setExcessWarning(null);
    const found = artisanAssignments.find(a => a.artisanName === artisan);
    if (found) {
      setAgreedUnitPrice(String(found.agreedUnitPrice));
    }
  };

  // Kiểm tra số hàng thực nhập đợt này so với số hàng còn lại
  const handleQtyChange = (val: string) => {
    setImportedQty(val);
    setExcessWarning(null);

    const inputQty = Number(val) || 0;
    if (inputQty > remainingQtyToCollect && remainingQtyToCollect > 0) {
      setExcessWarning({
        exceeded: true,
        excessQty: inputQty - remainingQtyToCollect
      });
    }
  };

  // Tính Thành Tiền = Số lượng x Đơn giá
  const numQty = Number(importedQty) || 0;
  const numPrice = Number(agreedUnitPrice) || 0;
  const calculatedTotalAmount = numQty * numPrice;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedArtisan || !importedQty || !agreedUnitPrice) {
      alert('⚠️ Vui lòng chọn Hộ đan, Số lượng thực nhập và Đơn giá!');
      return;
    }

    const newSlip: ArtisanImportSlip = {
      id: Date.now(),
      slipNo: `NH-${String(importSlips.length + 1).padStart(2, '0')}/2026`,
      date: todayStr,
      artisanName: selectedArtisan,
      contractNoB: activeAssignment?.contractNoB || 'HĐ-001/B/26',
      productCode: activeAssignment?.productCode || '',
      importedQty: numQty,
      agreedUnitPrice: numPrice,
      totalAmount: calculatedTotalAmount,
      paymentMethod,
      note
    };

    setImportSlips([newSlip, ...importSlips]);

    let msg = `✅ Tạo phiếu nhập hàng & chi trả tiền công đan thành công!\n• Hộ đan: ${selectedArtisan}\n• Thành tiền: ${calculatedTotalAmount.toLocaleString()} VNĐ (${paymentMethod})`;
    if (excessWarning?.exceeded) {
      msg += `\n\n💡 GỢI Ý HỢP ĐỒNG KẾ TIẾP: Số lượng giao dôi ra ${excessWarning.excessQty} cái đã được hệ thống ghi nhận để gợi ý cấn trừ sang Hợp đồng tiếp theo cùng mã hàng ${activeAssignment?.productCode}!`;
    }

    alert(msg);
    setShowForm(false);
    setSelectedArtisan('');
    setImportedQty('');
    setAgreedUnitPrice('');
    setNote('');
    setExcessWarning(null);
  };

  // Lọc tìm kiếm theo Mã hàng hoặc Tên Hộ đan
  const filteredSlips = importSlips.filter(s => 
    s.artisanName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.productCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.contractNoB.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>
          📥 Nhập Hàng Đan Thành Phẩm & Chi Trả Tiền Công Hộ Dân
        </h2>
        <button 
          onClick={() => setShowForm(true)}
          style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
        >
          + Tạo Phiếu Nhập Hàng Đan
        </button>
      </div>

      {/* TÌM KIẾM THEO MÃ HÀNG HOẶC TÊN HỘ ĐAN */}
      <div style={{ marginBottom: '14px' }}>
        <input 
          type="text"
          placeholder="🔍 Tìm kiếm theo Mã hàng hoặc Tên Hộ đan..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#f8fafc' }}
        />
      </div>

      {/* FORM LẬP PHIẾU NHẬP HÀNG ĐAN */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #cbd5e1' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#1e293b' }}>
            ➕ Lập Phiếu Nhập Hàng Đan & Thanh Toán Tiền
          </h3>

          {/* 1. CHỌN HỘ ĐAN TÌM KIẾM */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Chọn Hộ Đan / Mã Hàng Đã Phát Khung:</label>
            <select 
              value={selectedArtisan} 
              onChange={e => handleSelectArtisan(e.target.value)}
              style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#fff', fontWeight: 'bold' }}
            >
              <option value="">-- Chọn Hộ đan --</option>
              {artisanAssignments.map((a, i) => (
                <option key={i} value={a.artisanName}>
                  {a.artisanName} | Mã hàng: {a.productCode} ({a.productName}) - HĐ: {a.contractNoB}
                </option>
              ))}
            </select>
          </div>

          {/* CÂN BẰNG TIẾN ĐỘ & THÔNG TIN ĐẾM SỐ LẦN TRẢ HÀNG */}
          {selectedArtisan && activeAssignment && (
            <div style={{ background: '#e0f2fe', padding: '12px', borderRadius: '6px', marginBottom: '12px', border: '1px solid #bae6fd', fontSize: '12px', color: '#0369a1' }}>
              <div>📊 <strong>Thống kê đối soát hộ đan [{selectedArtisan}]:</strong></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px' }}>
                <div>• Tổng khung đã phát: <strong>{totalExported} cái</strong></div>
                <div>• Đã trả trước đó: <strong>{totalQtyDeliveredSoFar} cái</strong></div>
                <div>• Số lần nhập/trả tiền trước đó: <strong style={{ color: '#2563eb' }}>{importCount} lần</strong></div>
                <div>• <strong>Số hàng còn lại cần thu hồi:</strong> <strong style={{ color: '#dc2626', fontSize: '13px' }}>{remainingQtyToCollect} cái</strong></div>
              </div>
              <div style={{ marginTop: '6px', color: '#15803d', fontWeight: 'bold' }}>
                • Tổng số tiền công đan đã nhận tích lũy: {totalMoneyEarnedSoFar.toLocaleString()} VNĐ
              </div>
            </div>
          )}

          {/* 2. NHẬP SỐ LƯỢNG & ĐƠN GIÁ -> TỰ ĐỘNG BÁO THÀNH TIỀN */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Số lượng hàng đan thực nhập đợt này:</label>
              <input 
                type="number" min="1" required placeholder="Nhập số lượng..."
                value={importedQty} onChange={e => handleQtyChange(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 'bold' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Đơn giá thỏa thuận (VNĐ/cái):</label>
              <input 
                type="number" required placeholder="Đơn giá..."
                value={agreedUnitPrice} onChange={e => setAgreedUnitPrice(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 'bold', background: '#fff' }}
              />
            </div>
          </div>

          {/* CẢNH BÁO & GỢI Ý HỢP ĐỒNG KẾ TIẾP KHI GIAO DÔI RA */}
          {excessWarning && excessWarning.exceeded && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px', borderRadius: '6px', marginBottom: '12px', color: '#991b1b', fontSize: '12px' }}>
              <strong>💡 GỢI Ý HỢP ĐỒNG TIẾP THEO: Hộ đan giao nhiều hơn số hàng cần lấy đợt này ({excessWarning.excessQty} cái)!</strong>
              <div style={{ marginTop: '2px', color: '#7f1d1d' }}>
                Hệ thống sẽ tự động ghi nhận phần dôi ra {excessWarning.excessQty} cái này để chuyển sang gợi ý cấn trừ vào Hợp đồng tiếp theo có cùng mã hàng <strong>{activeAssignment?.productCode}</strong>.
              </div>
            </div>
          )}

          {/* TỰ ĐỘNG HIỂN THỊ THÀNH TIỀN */}
          {numQty > 0 && numPrice > 0 && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px', borderRadius: '6px', marginBottom: '12px', fontSize: '13px', color: '#166534', fontWeight: 'bold' }}>
              💵 THÀNH TIỀN THANH TOÁN (SL x Đơn giá): {calculatedTotalAmount.toLocaleString()} VNĐ
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Hình thức thanh toán:</label>
              <select 
                value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as any)}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#fff' }}
              >
                <option value="Chuyển khoản">Chuyển khoản ngân hàng</option>
                <option value="Tiền mặt">Tiền mặt</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Ghi chú đợt nhập:</label>
              <input 
                type="text" placeholder="Ghi chú chất lượng hàng đan..."
                value={note} onChange={e => setNote(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" style={{ flex: 1, background: '#16a34a', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
              💾 Lưu Phiếu Nhập & Chi Trả Tiền Công
            </button>
            <button type="button" onClick={() => setShowForm(false)} style={{ background: '#64748b', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>Hủy</button>
          </div>
        </form>
      )}

      {/* BẢNG LỊCH SỬ PHIẾU NHẬP HÀNG & TRẢ TIỀN */}
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '900px' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', textAlign: 'left', color: '#334155' }}>
              <th style={{ padding: '10px' }}>Số Phiếu</th>
              <th style={{ padding: '10px' }}>Ngày Nhập</th>
              <th style={{ padding: '10px' }}>Hộ Đan</th>
              <th style={{ padding: '10px' }}>Mã HĐ / Mã Hàng</th>
              <th style={{ padding: '10px', textAlign: 'right' }}>SL Nhập</th>
              <th style={{ padding: '10px', textAlign: 'right' }}>Đơn Giá</th>
              <th style={{ padding: '10px', textAlign: 'right' }}>Thành Tiền Trả</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>Hình Thức</th>
              <th style={{ padding: '10px' }}>Ghi Chú</th>
            </tr>
          </thead>
          <tbody>
            {filteredSlips.length > 0 ? (
              filteredSlips.map((item, idx) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f8fafc', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '10px', fontWeight: 'bold', color: '#2563eb' }}>{item.slipNo}</td>
                  <td style={{ padding: '10px' }}>{item.date}</td>
                  <td style={{ padding: '10px', fontWeight: 'bold' }}>{item.artisanName}</td>
                  <td style={{ padding: '10px' }}>
                    <span style={{ color: '#0f172a', fontWeight: 'bold' }}>{item.contractNoB}</span> - <span style={{ color: '#16a34a' }}>{item.productCode}</span>
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>{item.importedQty} cái</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>{item.agreedUnitPrice.toLocaleString()} đ</td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#16a34a', fontSize: '13px' }}>
                    {item.totalAmount.toLocaleString()} đ
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>
                    <span style={{ background: item.paymentMethod === 'Chuyển khoản' ? '#e0f2fe' : '#fef3c7', color: item.paymentMethod === 'Chuyển khoản' ? '#0369a1' : '#92400e', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '11px' }}>
                      {item.paymentMethod}
                    </span>
                  </td>
                  <td style={{ padding: '10px', color: '#64748b' }}>{item.note}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>Chưa có phiếu nhập hàng đan nào!</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}