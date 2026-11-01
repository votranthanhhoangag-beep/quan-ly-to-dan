import { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function InventoryView() {
  const appContext = useApp() as any;
  const { slips = [], inventoryLogs = [] } = appContext || {};

  // Lấy danh sách phiếu kho từ hệ thống
  const masterLogs = (Array.isArray(inventoryLogs) && inventoryLogs.length > 0) 
    ? inventoryLogs 
    : (Array.isArray(slips) ? slips : []);

  const [filterKeyword, setFilterKeyword] = useState('');

  const isCompanyFrameReceipt = (item: any) => {
    const slip = String(item.slipNo || '').toUpperCase();
    const type = String(item.type || '').toUpperCase();
    return type === 'NK' || type === 'NHAP' || slip.startsWith('NK') ||
      ((type === 'NK_KHUNG' || type === 'KS' || slip.startsWith('KS')) &&
        !item.sourceContractId && !item.craftGroupLeader);
  };

  const isWeavingFrameReceipt = (item: any) => {
    const slip = String(item.slipNo || '').toUpperCase();
    const type = String(item.type || '').toUpperCase();
    return !isCompanyFrameReceipt(item) &&
      (slip.startsWith('KS') || type === 'NK_KHUNG' || type === 'KS');
  };

  // Chỉ hiển thị hai loại phiếu nhập khung trong nhật ký kho.
  const receiptLogs = masterLogs.filter((item: any) =>
    isCompanyFrameReceipt(item) || isWeavingFrameReceipt(item)
  );
  const filteredLogs = receiptLogs.filter((item: any) => {
    if (!filterKeyword) return true;
    const kw = filterKeyword.toLowerCase();
    return (
      String(item.slipNo || '').toLowerCase().includes(kw) ||
      String(item.productCode || '').toLowerCase().includes(kw) ||
      String(item.productName || '').toLowerCase().includes(kw) ||
      String(item.partnerName || item.partner || '').toLowerCase().includes(kw)
    );
  });

  const formatDateVN = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  // Hàm tạo văn bản phiếu kho và copy vào bộ nhớ tạm để gửi qua Zalo
  const handleExportZalo = (item: any) => {
    const isKs = isWeavingFrameReceipt(item);
    const loaiPhieuText = isKs ? 'NHẬP KS TỪ TỔ ĐAN / TRẢ KHUNG LỖI' : 'NHẬP KHUNG TỪ CTY';

    const textZalo = `
-----------------------------------
📋 PHIẾU KHO: ${item.slipNo || '—'}
🏷️ Loại phiếu: ${loaiPhieuText}
📅 Ngày giao dịch: ${formatDateVN(item.date)}
-----------------------------------
📦 Mã hàng: ${item.productCode || '—'}
📝 Tên hàng: ${item.productName || '—'}
🔢 Số lượng: ${Number(item.quantity || 0).toLocaleString()} ${item.unit || 'Cái'}
🤝 Đối tác/Tổ đan: ${item.partnerName || item.partner || '—'}
${item.note ? `💬 Ghi chú: ${item.note}` : ''}
-----------------------------------
✨ ERP LỤC BÌNH CRAFTS
`.trim();

    navigator.clipboard.writeText(textZalo)
      .then(() => {
        alert(`✅ Đã sao chép nội dung phiếu [${item.slipNo}]!\n\nAnh chỉ cần mở ứng dụng Zalo và bấm (Ctrl + V) để gửi cho đối tác.`);
      })
      .catch(() => {
        alert('❌ Không thể tự động sao chép. Hãy thử lại trên trình duyệt được hỗ trợ.');
      });
  };

  return (
    <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#1e293b' }}>
            🏭 Tồn Kho & Nhật Ký Giao Dịch Kho Thực Tế
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>
            Tổng hợp phiếu Nhập Khung Từ CTY và Nhập KS Từ Tổ Đan / Trả Khung Lỗi.
          </p>
        </div>

        <div>
          <input
            type="text"
            placeholder="Tìm kiếm mã phiếu, tên hàng..."
            value={filterKeyword}
            onChange={e => setFilterKeyword(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', width: '240px' }}
          />
        </div>
      </div>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px'}}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
              <th style={{ padding: '10px' }}>Số Phiếu</th>
              <th style={{ padding: '10px' }}>Loại Phiếu</th>
              <th style={{ padding: '10px' }}>Ngày Giao Dịch</th>
              <th style={{ padding: '10px' }}>Mã & Tên Hàng</th>
              <th style={{ padding: '10px', textAlign: 'right' }}>Số Lượng</th>
              <th style={{ padding: '10px' }}>Đơn Vị Tính</th>
              <th style={{ padding: '10px' }}>Đối Tác / Tổ Đan</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>Thao Tác</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
                  Chưa có dữ liệu phiếu kho nào được ghi nhận trong hệ thống!
                </td>
              </tr>
            ) : (
              filteredLogs.map((item: any, idx: number) => {
                const isKs = isWeavingFrameReceipt(item);
                return (
                  <tr key={item.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: isKs ? '#0284c7' : '#16a34a' }}>
                      {item.slipNo}
                    </td>
                    <td style={{ padding: '10px', fontWeight: '600', fontSize: '12px' }}>
                      {isKs ? 'Nhập KS Từ Tổ Đan / Trả Khung Lỗi' : 'Nhập Khung Từ CTY'}
                    </td>
                    <td style={{ padding: '10px', color: '#047857', fontWeight: 'bold' }}>{formatDateVN(item.date)}</td>
                    <td style={{ padding: '10px' }}>
                      <span style={{ fontWeight: 'bold', color: '#7c3aed' }}>[{item.productCode}]</span> {item.productName}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#b45309' }}>
                      {Number(item.quantity || 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px', fontSize: '12px' }}>{item.unit || 'Cái'}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: '#334155' }}>
                      {item.partnerName || item.partner || '—'}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <button
                        type="button"
                        className="slip-action-button slip-action-zalo"
                        onClick={() => handleExportZalo(item)}
                        title="Sao chép thông tin gửi Zalo"
                      >
                        📲 Xuất Zalo
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}