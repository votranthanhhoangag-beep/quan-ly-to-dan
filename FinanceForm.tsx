import React, { useState } from 'react';
import { callBackendApi } from '../services/api';

const APPROVED_EXPENSE_ITEMS = [
  'Xăng xe vận chuyển',
  'Dầu DO xe tải',
  'Nhân công gia công / Lương',
  'Tiền điện nhà xưởng',
  'Tiền nước',
  'Mạng Internet cố định',
  'Mạng 4G di động',
  'Thuê nhà xưởng',
  'Khấu hao / Sửa chữa máy móc',
  'Chi phí khác'
];

export default function FinanceForm() {
  const [form, setForm] = useState({
    type: 'CHI_UNG_TIEN',
    householdId: '',
    expenseCategory: APPROVED_EXPENSE_ITEMS[0],
    amount: '',
    note: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      alert('⚠️ Vui lòng nhập số tiền hợp lệ lớn hơn 0!');
      return;
    }

    if (form.type !== 'THU_TIEN_KHAC' && !form.householdId) {
      alert('⚠️ Vui lòng nhập Mã hộ đan liên quan đến khoản chi ứng/thanh toán công!');
      return;
    }

    setLoading(true);
    const payload = {
      ...form,
      amount: Number(form.amount),
      date: new Date().toISOString(),
      status: 'Đã kiểm soát ngân sách',
      createdBy: 'Admin'
    };

    const res = await callBackendApi('CREATE_FINANCE', payload);
    setLoading(false);

    if (res.status === 'success') {
      alert('✅ Đã kiểm tra khoản mục và lưu tài chính thành công!');
      setForm({ type: 'CHI_UNG_TIEN', householdId: '', expenseCategory: APPROVED_EXPENSE_ITEMS[0], amount: '', note: '' });
    } else {
      alert('❌ Lỗi: ' + (res.message || 'Không thể lưu tài chính'));
    }
  };

  return (
    <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '14px', color: '#1e293b' }}>
        💰 Kiểm Soát Tài Chính & Chi Phí Vận Hành
      </h2>
      
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>Loại giao dịch tài chính:</label>
          <select 
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
          >
            <option value="CHI_UNG_TIEN">Chi ứng tiền trước cho hộ đan</option>
            <option value="CHI_TRA_CONG">Thanh toán tiền công hoàn thành</option>
            <option value="CHI_VAN_HANH">Chi phí vận hành (Điện, nước, xăng dầu, net...)</option>
            <option value="THU_TIEN_KHAC">Thu tiền / Hoàn ứng</option>
          </select>
        </div>

        {form.type === 'CHI_VAN_HANH' ? (
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>Khoản mục chi phí chuẩn (Bắt buộc):</label>
            <select 
              value={form.expenseCategory}
              onChange={(e) => setForm({ ...form, expenseCategory: e.target.value })}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#f8fafc' }}
            >
              {APPROVED_EXPENSE_ITEMS.map((item, idx) => (
                <option key={idx} value={item}>{item}</option>
              ))}
            </select>
          </div>
        ) : (
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>Mã hộ đan liên quan (Bắt buộc):</label>
            <input 
              type="text" required placeholder="VD: HO-01"
              value={form.householdId}
              onChange={(e) => setForm({ ...form, householdId: e.target.value })}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
            />
          </div>
        )}

        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>Số tiền (VNĐ):</label>
          <input 
            type="number" required min="1" placeholder="VD: 500000"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
          />
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>Ghi chú giải trình chứng từ:</label>
          <textarea 
            rows={2} placeholder="Nhập lý do chi / số hóa đơn..."
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
          />
        </div>

        <button 
          type="submit" disabled={loading}
          style={{
            width: '100%', background: '#2563eb', color: '#fff', padding: '12px',
            border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer'
          }}
        >
          {loading ? 'Đang kiểm tra ngân sách...' : '🔒 Rà Soát & Duyệt Chi Chính Thức'}
        </button>
      </form>
    </div>
  );
}