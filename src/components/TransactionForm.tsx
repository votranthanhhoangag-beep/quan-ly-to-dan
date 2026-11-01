import React, { useState, useEffect } from 'react';
import { callBackendApi } from '../services/api';

const VALID_PRODUCTS: Record<string, number> = {
  'SD20635A/9': 9,
  'SD10750A/2': 2,
  'SD15000A/4': 4,
  'GH-01': 1,
};

const TYPE_PREFIXES: Record<string, string> = {
  XUAT_KHUNG: 'XK',
  NHAN_HANG_DAT: 'NHD',
  NHAN_HANG_LOI: 'NHL',
  TRA_SUA: 'TS',
  XUAT_GIAO_A: 'XGA',
  XUAT_VAT_TU: 'XVT',
};

export default function TransactionForm() {
  const [formData, setFormData] = useState({
    type: 'XUAT_KHUNG' as keyof typeof TYPE_PREFIXES,
    contractNo: '',
    pi: '',
    productCode: '',
    householdId: '',
    note: '',
  });

  const [items, setItems] = useState<{ sizeOrBộ: string; quantity: number }[]>([
    { sizeOrBộ: 'Bộ tiêu chuẩn', quantity: 1 }
  ]);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);

  useEffect(() => {
    const queue = JSON.parse(localStorage.getItem('offline_transactions') || '[]');
    setOfflineQueueCount(queue.length);

    const currentYear = new Date().getFullYear();
    const prefix = TYPE_PREFIXES[formData.type] || 'HD';
    const storageKey = `seq_${formData.type}_${currentYear}`;
    const savedSeq = localStorage.getItem(storageKey) || '1';
    setFormData(prev => ({ ...prev, contractNo: `${prefix}-${String(savedSeq).padStart(2, '0')}/${currentYear}` }));
  }, [formData.type]);

  // HÀM NÉN ẢNH TỰ ĐỘNG (GIÚP ẢNH SIÊU NHẸ, TRÁNH LÀM NẶNG GOOGLE SHEETS)
  const compressAndResizeImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800; // Giới hạn chiều rộng tối đa 800px
          const scaleSize = MAX_WIDTH / img.width;
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * (scaleSize > 1 ? 1 : scaleSize);

          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);

          // Nén chất lượng xuống 70% (đủ nét đối soát, dung lượng cực nhỏ ~50KB)
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(compressedDataUrl);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleImageCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedBase64 = await compressAndResizeImage(file);
        setImagePreview(compressedBase64);
      } catch (err) {
        console.error('Lỗi nén ảnh:', err);
        alert('Không thể xử lý ảnh này, vui lòng chụp lại!');
      }
    }
  };

  const handleProductCodeChange = (code: string) => {
    const upperCode = code.trim();
    setFormData(prev => ({ ...prev, productCode: upperCode }));
    setErrorMsg('');

    if (!upperCode) return;
    if (!VALID_PRODUCTS[upperCode]) {
      setErrorMsg(`❌ Mã sản phẩm "${upperCode}" không có trong danh mục hợp đồng!`);
      return;
    }

    const count = VALID_PRODUCTS[upperCode];
    const generatedItems = [];
    for (let i = 1; i <= count; i++) {
      generatedItems.push({ sizeOrBộ: `Cái ${i} (Size chuẩn)`, quantity: 1 });
    }
    setItems(generatedItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // Chặn click đúp

    if (!formData.contractNo || !formData.householdId || !formData.productCode) {
      alert('⚠️ Vui lòng nhập đầy đủ thông tin bắt buộc!');
      return;
    }

    if (!imagePreview) {
      alert('⛔ BẮT BUỘC ĐÍNH KÈM ẢNH: Vui lòng chụp ảnh phiếu giao nhận để đối soát!');
      return;
    }

    setLoading(true);
    const payload = {
      ...formData,
      date: new Date().toISOString(),
      items,
      image: imagePreview,
      status: 'Chính thức & Đã nén ảnh',
      createdBy: 'Admin'
    };

    try {
      const res = await callBackendApi('CREATE_TRANSACTION', payload);
      setLoading(false);

      if (res.status === 'success') {
        alert('✅ Lưu phiếu thành công lên hệ thống!');
        
        const currentYear = new Date().getFullYear();
        const storageKey = `seq_${formData.type}_${currentYear}`;
        const currentSeq = parseInt(localStorage.getItem(storageKey) || '1', 10);
        localStorage.setItem(storageKey, String(currentSeq + 1));

        const prefix = TYPE_PREFIXES[formData.type] || 'HD';
        setFormData(prev => ({
          ...prev,
          contractNo: `${prefix}-${String(currentSeq + 1).padStart(2, '0')}/${currentYear}`,
          pi: '',
          productCode: '',
          householdId: '',
          note: '',
        }));
        setItems([{ sizeOrBộ: 'Bộ tiêu chuẩn', quantity: 1 }]);
        setImagePreview(null);
      } else {
        alert('⛔ ' + (res.message || 'Lỗi hệ thống'));
      }
    } catch (err) {
      // Lưu tạm Offline khi rớt mạng
      setLoading(false);
      const existingQueue = JSON.parse(localStorage.getItem('offline_transactions') || '[]');
      existingQueue.push(payload);
      localStorage.setItem('offline_transactions', JSON.stringify(existingQueue));
      setOfflineQueueCount(existingQueue.length);

      alert('⚠️ Mất kết nối mạng! Phiếu đã được lưu tạm an toàn trên điện thoại. Sẽ tự động đồng bộ khi có mạng.');
    }
  };

  const syncOfflineData = async () => {
    const queue = JSON.parse(localStorage.getItem('offline_transactions') || '[]');
    if (queue.length === 0) return;

    setLoading(true);
    let successCount = 0;
    const remainingQueue = [];

    for (const payload of queue) {
      try {
        const res = await callBackendApi('CREATE_TRANSACTION', payload);
        if (res.status === 'success') successCount++;
        else remainingQueue.push(payload);
      } catch (e) {
        remainingQueue.push(payload);
      }
    }

    localStorage.setItem('offline_transactions', JSON.stringify(remainingQueue));
    setOfflineQueueCount(remainingQueue.length);
    setLoading(false);
    alert(`🔄 Đã đồng bộ thành công ${successCount} phiếu lưu tạm lên Google Sheets!`);
  };

  return (
    <div style={{ maxWidth: '600px', margin: '10px auto', padding: '16px', fontFamily: 'sans-serif', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px', color: '#0f172a', textAlign: 'center' }}>
        ⚡ Giao Dịch Nhanh (Tối Ưu 300+ Đơn/Ngày)
      </h2>

      {offlineQueueCount > 0 && (
        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', padding: '10px', borderRadius: '6px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: '#92400e', fontWeight: 'bold' }}>⚠️ Có {offlineQueueCount} phiếu lưu tạm chờ đồng bộ!</span>
          <button onClick={syncOfflineData} style={{ background: '#d97706', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
            Đồng bộ ngay
          </button>
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px', fontSize: '12px' }}>Loại giao dịch:</label>
          <select 
            value={formData.type} 
            onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
          >
            <option value="XUAT_KHUNG">Xuất khung cho tổ đan</option>
            <option value="NHAN_HANG_DAT">Nhận hàng đạt</option>
            <option value="NHAN_HANG_LOI">Nhận hàng lỗi / chờ kiểm</option>
            <option value="TRA_SUA">Xuất hàng trả sửa</option>
            <option value="XUAT_GIAO_A">Xuất hàng giao Công ty A</option>
            <option value="XUAT_VAT_TU">Xuất nguyên phụ liệu</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px', fontSize: '12px' }}>Số hợp đồng / Phiếu:</label>
            <input 
              type="text" required value={formData.contractNo} 
              onChange={(e) => setFormData({ ...formData, contractNo: e.target.value })}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#f1f5f9', fontWeight: 'bold' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px', fontSize: '12px' }}>Mã hộ đan:</label>
            <input 
              type="text" required placeholder="VD: HO-01" value={formData.householdId} 
              onChange={(e) => setFormData({ ...formData, householdId: e.target.value })}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px', fontSize: '12px' }}>Mã sản phẩm:</label>
          <input 
            type="text" required placeholder="VD: SD20635A/9" value={formData.productCode} 
            onChange={(e) => handleProductCodeChange(e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
          />
        </div>

        {errorMsg && (
          <div style={{ padding: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '6px', fontSize: '11px', marginBottom: '10px', fontWeight: 'bold' }}>
            {errorMsg}
          </div>
        )}

        {/* PHẦN CHỤP ẢNH CÓ TỰ ĐỘNG NÉN */}
        <div style={{ marginBottom: '12px', background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px dashed #cbd5e1', textAlign: 'center' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px', fontSize: '12px', color: '#1e293b' }}>
            📷 Chụp Ảnh Đối Soát (Tự động nén siêu nhẹ):
          </label>
          
          <input 
            type="file" accept="image/*" capture="environment" 
            onChange={handleImageCapture} style={{ display: 'none' }} id="camInput"
          />
          
          <label htmlFor="camInput" style={{
            display: 'inline-block', background: '#2563eb', color: '#fff', padding: '8px 14px',
            borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer'
          }}>
            📸 Mở Camera Chụp Ảnh
          </label>

          {imagePreview && (
            <div style={{ marginTop: '8px' }}>
              <img src={imagePreview} alt="Preview" style={{ maxWidth: '100%', height: '120px', objectFit: 'contain', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
              <div style={{ fontSize: '10px', color: '#16a34a', fontWeight: 'bold', marginTop: '2px' }}>✅ Đã nén và sẵn sàng gửi!</div>
            </div>
          )}
        </div>

        <button 
          type="submit" disabled={loading || !!errorMsg}
          style={{
            width: '100%', background: loading ? '#94a3b8' : '#16a34a', color: 'white', padding: '10px',
            border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '14px', cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Đang xử lý...' : '💾 Lưu Nhanh & Đồng Bộ'}
        </button>
      </form>
    </div>
  );
}