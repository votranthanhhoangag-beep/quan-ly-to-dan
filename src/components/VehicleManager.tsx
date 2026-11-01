import React, { useState } from 'react';

export default function VehicleManager() {
  const [logs, setLogs] = useState([
    { id: 1, date: '2026-10-01', content: 'Thay nhớt định kỳ & kiểm tra phanh xe tải', cost: 450000 },
    { id: 2, date: '2026-09-15', content: 'Vá lốp & bảo dưỡng gầm xe giao hàng', cost: 200000 },
  ]);

  const [form, setForm] = useState({ content: '', cost: '' });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.content || !form.cost) return;
    setLogs([{ id: Date.now(), date: new Date().toISOString().split('T')[0], content: form.content, cost: Number(form.cost) }, ...logs]);
    setForm({ content: '', cost: '' });
  };

  return (
    <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px', color: '#1e293b' }}>
        🚚 Quản Lý Xe Tải & Bảo Dưỡng Vận Chuyển
      </h2>

      <form onSubmit={handleAdd} style={{ marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
        <div style={{ marginBottom: '8px' }}>
          <input 
            type="text" 
            placeholder="Nội dung bảo dưỡng / sửa chữa..."
            value={form.content}
            onChange={e => setForm({ ...form, content: e.target.value })}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
          />
        </div>
        <div style={{ marginBottom: '8px' }}>
          <input 
            type="number" 
            placeholder="Chi phí (VNĐ)"
            value={form.cost}
            onChange={e => setForm({ ...form, cost: e.target.value })}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
          />
        </div>
        <button type="submit" style={{ width: '100%', background: '#0284c7', color: '#fff', border: 'none', padding: '8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
          + Thêm Nhật Ký Bảo Dưỡng Xe
        </button>
      </form>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
              <th style={{ padding: '8px' }}>Ngày</th>
              <th style={{ padding: '8px' }}>Nội dung</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Chi phí</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px' }}>{item.date}</td>
                <td style={{ padding: '8px' }}>{item.content}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>{item.cost.toLocaleString()} đ</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}