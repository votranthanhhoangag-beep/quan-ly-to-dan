import React from 'react';

interface Props {
  images: string[];
  onChange: (images: string[]) => void;
  label?: string;
}

export default function ImageUploader({ images, onChange, label = 'Hình ảnh chứng từ đối soát' }: Props) {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      Promise.all(
        filesArray.map(file => {
          return new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
        })
      ).then(base64Images => {
        onChange([...images, ...base64Images]);
      });
    }
  };

  const handleRemove = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    onChange(newImages);
  };

  return (
    <div style={{ marginBottom: '12px', background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#0369a1' }}>
        📸 {label}
      </label>
      <input 
        type="file" 
        accept="image/*" 
        multiple 
        onChange={handleFileChange}
        style={{ fontSize: '12px', marginBottom: '8px' }}
      />
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {images.map((img, idx) => (
          <div key={idx} style={{ position: 'relative' }}>
            <img src={img} alt="Preview" style={{ width: '70px', height: '70px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
            <button 
              type="button" 
              onClick={() => handleRemove(idx)}
              style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '50%', width: '18px', height: '18px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}