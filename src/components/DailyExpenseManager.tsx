import { useState } from 'react';
import { useApp,type ExpenseItem } from '../context/AppContext';

export default function DailyExpenseManager() {
  const { expensesCat, otherExpensesCat, expenses, addExpense } = useApp();
  const expenseCategories = [...expensesCat, ...otherExpensesCat];

  const [expenseCode, setExpenseCode] = useState('');
  const [expenseName, setExpenseName] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Tiền mặt' | 'Chuyển khoản'>('Chuyển khoản');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [handler, setHandler] = useState('');
  const [note, setNote] = useState('');

  const handleSelectCat = (code: string) => {
    setExpenseCode(code);
    const found = expenseCategories.find(c => c.code === code);
    setExpenseName(found ? found.name : '');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const paidAmount = Number(amount.replace(/,/g, ''));
    if (!expenseCode || !Number.isFinite(paidAmount) || paidAmount <= 0) {
      alert('⚠️ Vui lòng chọn Danh mục chi phí và Số tiền hợp lệ!');
      return;
    }

    const newExpense: ExpenseItem = {
      id: Date.now(),
      expenseCode,
      expenseName,
      amount: paidAmount,
      paidAmount,
      paymentMethod,
      date,
      handler,
      note
    };

    addExpense(newExpense);
    setAmount('');
    setPaymentMethod('Chuyển khoản');
    setHandler('');
    setNote('');
  };

  const totalExpense = expenses.reduce((sum, item) => sum + item.amount, 0);
  const formatAmount = (value: string) => value
    .replace(/[^\d]/g, '')
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return (
    <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', marginBottom: '14px' }}>
        💸 Quản Lý Phiếu Chi Hàng Ngày & Hóa Đơn Vận Hành
      </h2>

      {/* Form Lập Phiếu Chi */}
      <form onSubmit={handleSubmit} style={{ background: '#f8fafc', padding: '14px', borderRadius: '6px', border: '1px solid #cbd5e1', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '10px', color: '#1e293b' }}>➕ Lập Phiếu Chi Mới</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Khoản Chi (Từ Danh Mục):</label>
            <select value={expenseCode} onChange={e => handleSelectCat(e.target.value)} required style={{ width: '100%', padding: '7px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}>
              <option value="">-- Chọn Khoản Chi Phí --</option>
              {expenseCategories.map(c => <option key={c.code} value={c.code}>[{c.code}] {c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Tên Khoản Chi:</label>
            <input type="text" readOnly value={expenseName} placeholder="Tự động điền..." style={{ width: '100%', padding: '7px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#e2e8f0' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Số Tiền (VNĐ):</label>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={e => setAmount(formatAmount(e.target.value))}
              required
              placeholder="VD: 10,100"
              style={{ width: '100%', padding: '7px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 'bold', color: '#dc2626' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Ngày Chi:</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', padding: '7px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Hình Thức Thanh Toán:</label>
            <select
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value as 'Tiền mặt' | 'Chuyển khoản')}
              style={{ width: '100%', padding: '7px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
            >
              <option value="Chuyển khoản">Chuyển khoản</option>
              <option value="Tiền mặt">Tiền mặt</option>
            </select>
            <small style={{ color: '#64748b' }}>Toàn bộ số tiền chi được ghi nhận theo hình thức này.</small>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Người Chi / Bàn Giao:</label>
            <input type="text" placeholder="VD: Nguyễn Văn A..." value={handler} onChange={e => setHandler(e.target.value)} style={{ width: '100%', padding: '7px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>Ghi Chú Diễn Giải:</label>
            <input type="text" placeholder="Ghi chú thêm..." value={note} onChange={e => setNote(e.target.value)} style={{ width: '100%', padding: '7px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
          </div>
        </div>

        <button type="submit" style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>💾 Lưu Phiếu Chi</button>
      </form>

      {/* Tổng Chi */}
      <div style={{ background: '#fef2f2', padding: '12px', borderRadius: '6px', border: '1px solid #fecaca', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#991b1b' }}>💰 TỔNG CHI PHÍ VẬN HÀNH ĐÃ LẬP:</span>
        <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#dc2626' }}>{totalExpense.toLocaleString()} VNĐ</span>
      </div>

      {/* Bảng Danh Sách */}
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
              <th style={{ padding: '8px' }}>STT</th>
              <th style={{ padding: '8px' }}>Mã Khoản Chi</th>
              <th style={{ padding: '8px' }}>Tên Khoản Chi</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Số Tiền</th>
              <th style={{ padding: '8px' }}>Hình Thức Thanh Toán</th>
              <th style={{ padding: '8px' }}>Ngày Chi</th>
              <th style={{ padding: '8px' }}>Người Thực Hiện</th>
              <th style={{ padding: '8px' }}>Ghi Chú</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((item, idx) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px' }}>{idx + 1}</td>
                <td style={{ padding: '8px', fontWeight: 'bold', color: '#2563eb' }}>{item.expenseCode}</td>
                <td style={{ padding: '8px', fontWeight: 'bold' }}>{item.expenseName}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: '#dc2626' }}>{item.amount.toLocaleString()} đ</td>
                <td style={{ padding: '8px' }}>{item.paymentMethod || '—'}</td>
                <td style={{ padding: '8px' }}>{item.date}</td>
                <td style={{ padding: '8px' }}>{item.handler}</td>
                <td style={{ padding: '8px', color: '#64748b' }}>{item.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}