import React, { useState } from 'react';

interface DepositSlip {
  id: number;
  slipNo: string;
  date: string;
  contractNo: string;
  productCode: string;
  amount: number;
  paymentMethod: 'Chuyển khoản' | 'Tiền mặt';
  partnerName: string; // Tên đối tác (Cty A / Cty B)
  note: string;
}

export default function DepositReceiptManager() {
  // Danh sách phiếu cọc đã tạo
  const [deposits, setDeposits] = useState<DepositSlip[]>([
    {
      id: 1,
      slipNo: 'PC-01/2026',
      date: '2026-10-01',
      contractNo: 'HĐ 001/A/26',
      productCode: 'SD20635A/9',
      amount: 15000000,
      paymentMethod: 'Chuyển khoản',
      partnerName: 'Công ty A',
      note: 'Nhận cọc đợt 1 qua Vietcombank'
    }
  ]);

  // Form tạo phiếu cọc mới
  const [form, setForm] = useState({
    contractNo: '',
    productCode: 'SD20635A/9',
    amount: '',
    paymentMethod: 'Chuyển khoản' as 'Chuyển khoản' | 'Tiền mặt',
    partnerName: 'Công ty A',
    note: ''
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Danh sách hợp đồng giả định có sẵn để chọn hoặc tra cứu
  const availableContracts = [
    { contractNo: 'HĐ 001/A/26', productCode: 'SD20635A/9', partner: 'Công ty A' },
    { contractNo: 'HĐ 002/A/26', productCode: 'SD10750A/2', partner: 'Công ty B' },
    { contractNo: 'HĐ 003/A/26', productCode: 'SD15000A/4', partner: 'Công ty A' },
  ];

  const handleSelectContract = (contractNo: string) => {
    const found = availableContracts.find(c => c.contractNo === contractNo);
    if (found) {
      setForm(prev => ({
        ...prev,
        contractNo: found.contractNo,
        productCode: found.productCode,
        partnerName: found.partner
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contractNo || !form.amount) {
      alert('⚠️ Vui lòng chọn số hợp đồng và nhập số tiền cọc!');
      return;
    }

    const newDeposit: DepositSlip = {
      id: Date.now(),
      slipNo: `PC-${String(deposits.length + 1).padStart(2, '0')}/2026`,
      date: new Date().toISOString().slice(0, 10),
      contractNo: form.contractNo,
      productCode: form.productCode,
      amount: Number(form.amount),
      paymentMethod: form.paymentMethod,
      partnerName: form.partnerName,
      note: form.note
    };

    setDeposits([newDeposit, ...deposits]);

    // PHÁT TÍN HIỆU ĐỒNG BỘ: Lưu trạng thái cọc vào LocalStorage để Tab Hợp Đồng tự động nhận diện & Tích chọn
    const updatedDepositedContracts = JSON.parse(localStorage.getItem('deposited_contracts') || '[]');
    if (!updatedDepositedContracts.includes(form.contractNo)) {
      updatedDepositedContracts.push(form.contractNo);
      localStorage.setItem('deposited_contracts', JSON.stringify(updatedDepositedContracts));
    }

    alert(`✅ Tạo phiếu thu tiền cọc thành công cho hợp đồng ${form.contractNo}!\n✨ Tab Hợp Đồng đã được tự động cập nhật trạng thái "Đã nhận cọc".`);
    
    setShowForm(false);
    setForm({
      contractNo: '',
      productCode: '',
      amount: '',
      paymentMethod: 'Chuyển khoản',
      partnerName: 'Công ty A',
      note: ''
    });
  };

  // Lọc tìm kiếm theo Số Hợp Đồng hoặc Mã Hàng
  const filteredDeposits = deposits.filter(item =>
    item.contractNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.productCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.partnerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>
          💰 Quản Lý Phiếu Thu Tiền Đặt Cọc (Cty A & Cty B)
        </h2>
        <button 
          onClick={() => setShowForm(true)}
          style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
        >
          + Tạo Phiếu Đặt Cọc Mới
        </button>
      </div>

      {/* THANH TÌM KIẾM THEO SỐ HỢP ĐỒNG HOẶC MÃ HÀNG */}
      <div style={{ marginBottom: '14px' }}>
        <input 
          type="text"
          placeholder="🔍 Tìm kiếm theo Số Hợp Đồng, Mã Hàng hoặc Tên đối tác (Cty A, Cty B)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#f8fafc' }}
        />
      </div>

      {/* FORM TẠO PHIẾU CỌC */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #cbd5e1' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px', color: '#1e293b' }}>
            ➕ Lập Phiếu Nhập Tiền Đặt Cọc
          </h3>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Chọn Hợp Đồng Giao Kết:</label>
            <select 
              value={form.contractNo} 
              onChange={e => handleSelectContract(e.target.value)}
              style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#fff' }}
            >
              <option value="">-- Chọn hợp đồng đan --</option>
              {availableContracts.map((c, i) => (
                <option key={i} value={c.contractNo}>{c.contractNo} | Mã hàng: {c.productCode} | Đối tác: {c.partner}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Số tiền cọc (VNĐ):</label>
              <input 
                type="number" required min="1000" placeholder="Nhập số tiền..."
                value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Hình thức thanh toán:</label>
              <select 
                value={form.paymentMethod} 
                onChange={e => setForm({ ...form, paymentMethod: e.target.value as any })}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#fff' }}
              >
                <option value="Chuyển khoản">Chuyển khoản ngân hàng</option>
                <option value="Tiền mặt">Tiền mặt</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Đối tác giao kết (Cty A / Cty B):</label>
            <input 
              type="text" value={form.partnerName} onChange={e => setForm({ ...form, partnerName: e.target.value })}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#f1f5f9' }}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Ghi chú:</label>
            <input 
              type="text" placeholder="Ghi chú thêm..."
              value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" style={{ flex: 1, background: '#16a34a', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
              💾 Lưu Phiếu Cọc & Tự Tích Đã Nhận Cọc
            </button>
            <button type="button" onClick={() => setShowForm(false)} style={{ background: '#64748b', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
              Hủy
            </button>
          </div>
        </form>
      )}

      {/* BẢNG DANH SÁCH PHIẾU CỌC */}
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '800px' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', textAlign: 'left', color: '#334155' }}>
              <th style={{ padding: '10px' }}>Số Phiếu Cọc</th>
              <th style={{ padding: '10px' }}>Ngày Thu</th>
              <th style={{ padding: '10px' }}>Số Hợp Đồng</th>
              <th style={{ padding: '10px' }}>Mã Hàng</th>
              <th style={{ padding: '10px' }}>Đối Tác</th>
              <th style={{ padding: '10px', textAlign: 'right' }}>Số Tiền Cọc</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>Hình Thức</th>
              <th style={{ padding: '10px' }}>Ghi Chú</th>
            </tr>
          </thead>
          <tbody>
            {filteredDeposits.length > 0 ? (
              filteredDeposits.map((item, idx) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f8fafc', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '10px', fontWeight: 'bold', color: '#2563eb' }}>{item.slipNo}</td>
                  <td style={{ padding: '10px' }}>{item.date}</td>
                  <td style={{ padding: '10px', fontWeight: 'bold' }}>{item.contractNo}</td>
                  <td style={{ padding: '10px', color: '#16a34a', fontWeight: 'bold' }}>{item.productCode}</td>
                  <td style={{ padding: '10px' }}>{item.partnerName}</td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#0f172a', fontSize: '13px' }}>
                    {item.amount.toLocaleString()} đ
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
                <td colSpan={8} style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>
                  Không tìm thấy phiếu đặt cọc nào phù hợp với từ khóa!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}