import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useApp, type SystemConfiguration } from '../context/AppContext';
import { filterPhoneDigits, isValidVietnamMobileNumber } from '../utils/vietnamPhone';

const emptyConfiguration: SystemConfiguration = {
  companyName: '',
  address: '',
  phone: '',
  taxCode: '',
  email: '',
  logo: ''
};

const compressLogo = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Không thể đọc tệp ảnh đã chọn.'));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error('Tệp đã chọn không phải hình ảnh hợp lệ.'));
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Trình duyệt không hỗ trợ xử lý hình ảnh.'));
        return;
      }
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      for (const maxDimension of [320, 256, 192, 128]) {
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.72, 0.55, 0.4]) {
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          if (dataUrl.length <= 40000) {
            resolve(dataUrl);
            return;
          }
        }
      }
      reject(new Error('Logo có dung lượng quá lớn sau khi nén. Vui lòng chọn ảnh khác.'));
    };

    if (typeof reader.result !== 'string') {
      reject(new Error('Không thể đọc dữ liệu hình ảnh.'));
      return;
    }
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});

export default function SystemSettingsView() {
  const { systemConfiguration, isSystemConfigurationLoaded, saveSystemConfiguration, deleteSystemConfiguration } = useApp();
  const [form, setForm] = useState<SystemConfiguration>(systemConfiguration || emptyConfiguration);
  const [isEditing, setIsEditing] = useState(!systemConfiguration);
  const [isProcessingLogo, setIsProcessingLogo] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const invalidPhone = Boolean(form.phone && !isValidVietnamMobileNumber(form.phone));

  useEffect(() => {
    setForm(systemConfiguration || emptyConfiguration);
    setIsEditing(!systemConfiguration);
  }, [systemConfiguration]);

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setForm(current => ({ ...current, [name]: value }));
  };

  const handleLogoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Vui lòng chọn tệp hình ảnh.');
      return;
    }

    setError('');
    setIsProcessingLogo(true);
    try {
      const logo = await compressLogo(file);
      setForm(current => ({ ...current, logo }));
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Không thể xử lý hình ảnh đã chọn.';
      setError(message);
    } finally {
      setIsProcessingLogo(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const companyName = form.companyName.trim();
    if (!companyName) {
      setError('Vui lòng nhập Tên Công Ty / Xưởng.');
      return;
    }
    if (form.phone && !isValidVietnamMobileNumber(form.phone)) {
      setError('Số điện thoại phải có đúng 10 chữ số và bắt đầu bằng đầu số di động hợp lệ tại Việt Nam.');
      return;
    }

    saveSystemConfiguration({
      companyName,
      address: form.address.trim(),
      phone: form.phone.trim(),
      taxCode: form.taxCode.trim(),
      email: form.email.trim(),
      logo: form.logo
    });
    setError('');
    setSavedMessage('Đã lưu cấu hình hệ thống.');
  };

  const handleDelete = () => {
    if (!window.confirm('Bạn có chắc muốn xóa toàn bộ thông tin cấu hình hệ thống?')) return;
    deleteSystemConfiguration();
    setError('');
    setSavedMessage('');
  };

  const fieldStyle = {
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: '10px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: '7px',
    backgroundColor: isEditing ? '#fff' : '#f8fafc',
    color: '#1e293b'
  };
  const labelStyle = { display: 'block', marginBottom: '6px', color: '#334155', fontSize: '13px', fontWeight: 700 };

  return (
    <section style={{ padding: '24px', border: '1px solid #e2e8f0', borderRadius: '12px', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <header style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: '0 0 6px', color: '#0f172a', fontSize: '21px' }}>⚙️ Cấu Hình Hệ Thống</h2>
        <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
          Thông tin và logo tại đây sẽ được dùng trên thanh điều hướng của ứng dụng.
        </p>
      </header>

      {!isSystemConfigurationLoaded ? (
        <div role="status" style={{ padding: '14px', borderRadius: '7px', backgroundColor: '#eff6ff', color: '#1d4ed8', fontSize: '13px' }}>
          Đang tải cấu hình hiện tại...
        </div>
      ) : (
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '18px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '16px' }}>
          <label>
            <span style={labelStyle}>Tên Công Ty / Xưởng *</span>
            <input name="companyName" value={form.companyName} onChange={handleChange} disabled={!isEditing} required style={fieldStyle} placeholder="Nhập tên công ty hoặc xưởng" />
          </label>
          <label>
            <span style={labelStyle}>Số Điện Thoại</span>
            <input
              name="phone"
              type="tel"
              inputMode="numeric"
              value={form.phone}
              onChange={event => setForm(current => ({ ...current, phone: filterPhoneDigits(event.target.value) }))}
              disabled={!isEditing}
              aria-invalid={invalidPhone}
              style={{ ...fieldStyle, borderColor: invalidPhone ? '#dc2626' : '#cbd5e1' }}
              placeholder="Số điện thoại liên hệ"
            />
            {invalidPhone && <small role="alert" style={{ display: 'block', marginTop: '5px', color: '#dc2626', fontWeight: 700 }}>Số điện thoại phải có đúng 10 chữ số hợp lệ.</small>}
          </label>
          <label>
            <span style={labelStyle}>Mã Số Thuế (MST)</span>
            <input name="taxCode" value={form.taxCode} onChange={handleChange} disabled={!isEditing} style={fieldStyle} placeholder="Mã số thuế" />
          </label>
          <label>
            <span style={labelStyle}>Email</span>
            <input name="email" type="email" value={form.email} onChange={handleChange} disabled={!isEditing} style={fieldStyle} placeholder="email@congty.vn" />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            <span style={labelStyle}>Địa Chỉ</span>
            <textarea name="address" value={form.address} onChange={handleChange} disabled={!isEditing} rows={3} style={{ ...fieldStyle, resize: 'vertical' }} placeholder="Địa chỉ công ty hoặc xưởng" />
          </label>
        </div>

        <section style={{ padding: '16px', border: '1px solid #cbd5e1', borderRadius: '9px', backgroundColor: '#f8fafc' }}>
          <div style={{ marginBottom: '10px', color: '#334155', fontSize: '13px', fontWeight: 700 }}>Logo Công Ty / Xưởng</div>
          {form.logo ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <img src={form.logo} alt="Xem trước logo công ty" style={{ width: '100px', height: '100px', objectFit: 'contain', border: '1px solid #cbd5e1', borderRadius: '8px', backgroundColor: '#fff' }} />
              {isEditing && (
                <button type="button" onClick={() => setForm(current => ({ ...current, logo: '' }))} style={{ padding: '8px 11px', border: '1px solid #fecaca', borderRadius: '6px', backgroundColor: '#fff', color: '#b91c1c', fontWeight: 700, cursor: 'pointer' }}>
                  Xóa Logo
                </button>
              )}
            </div>
          ) : (
            <div style={{ marginBottom: '12px', color: '#94a3b8', fontSize: '13px' }}>Chưa có logo được chọn.</div>
          )}
          {isEditing && (
            <label style={{ display: 'inline-flex', padding: '9px 12px', borderRadius: '6px', backgroundColor: '#e0f2fe', color: '#075985', fontSize: '13px', fontWeight: 700, cursor: isProcessingLogo ? 'wait' : 'pointer' }}>
              {isProcessingLogo ? 'Đang xử lý ảnh...' : 'Chọn ảnh từ thiết bị'}
              <input type="file" accept="image/*" onChange={handleLogoChange} disabled={isProcessingLogo} style={{ display: 'none' }} />
            </label>
          )}
          <small style={{ display: 'block', marginTop: '8px', color: '#64748b' }}>Ảnh được thu nhỏ và nén để lưu cùng cấu hình rồi hiển thị trên Sidebar.</small>
        </section>

        {error && <div role="alert" style={{ padding: '10px 12px', borderRadius: '6px', backgroundColor: '#fef2f2', color: '#b91c1c', fontSize: '13px' }}>{error}</div>}
        {savedMessage && <div role="status" style={{ padding: '10px 12px', borderRadius: '6px', backgroundColor: '#f0fdf4', color: '#166534', fontSize: '13px' }}>{savedMessage}</div>}

        <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap' }}>
          {isEditing ? (
            <>
              <button type="submit" disabled={isProcessingLogo || invalidPhone} style={{ padding: '10px 16px', border: 0, borderRadius: '7px', backgroundColor: isProcessingLogo || invalidPhone ? '#94a3b8' : '#2563eb', color: '#fff', fontWeight: 700, cursor: isProcessingLogo || invalidPhone ? 'not-allowed' : 'pointer' }}>
                💾 Lưu Cấu Hình
              </button>
              {systemConfiguration && (
                <button type="button" onClick={() => { setForm(systemConfiguration); setIsEditing(false); setError(''); setSavedMessage(''); }} style={{ padding: '10px 16px', border: '1px solid #cbd5e1', borderRadius: '7px', backgroundColor: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer' }}>
                  Hủy
                </button>
              )}
            </>
          ) : (
            <>
              <button type="button" onClick={() => { setIsEditing(true); setError(''); setSavedMessage(''); }} style={{ padding: '10px 16px', border: 0, borderRadius: '7px', backgroundColor: '#d97706', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                ✏️ Sửa Cấu Hình
              </button>
              <button type="button" onClick={handleDelete} style={{ padding: '10px 16px', border: 0, borderRadius: '7px', backgroundColor: '#dc2626', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                🗑️ Xóa Cấu Hình
              </button>
            </>
          )}
        </div>
      </form>
      )}
    </section>
  );
}
