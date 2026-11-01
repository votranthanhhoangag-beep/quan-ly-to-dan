import React, { useState, useRef } from 'react';
import { uploadImageToGoogleDrive } from '../services/googleService';

interface ImageCaptureProps {
  onImageCaptured: (url: string) => void;
}

export const ImageCaptureInput: React.FC<ImageCaptureProps> = ({ onImageCaptured }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 1. Mở Camera trực tiếp từ thiết bị (Ưu tiên camera sau trên điện thoại: facingMode: 'environment')
  const startCamera = async () => {
    try {
      setIsCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Lỗi truy cập camera:', err);
      alert('Không thể mở Camera. Vui lòng kiểm tra quyền truy cập trình duyệt!');
      setIsCameraActive(false);
    }
  };

  // 2. Chụp khung hình hiện tại từ video stream
  const capturePhoto = () => {
    if (!videoRef.current) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const imageBase64 = canvas.toDataURL('image/jpeg');
      setPreview(imageBase64);
      stopCamera();
      
      // Truyền dữ liệu ra ngoài component cha (có thể chuyển sang dạng File hoặc gửi trực tiếp)
      onImageCaptured(imageBase64);
    }
  };

  // 3. Tắt Camera và giải phóng luồng media
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  // 4. Xử lý tải ảnh có sẵn từ thiết bị và đẩy lên Google Drive
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploading(true);
      try {
        const driveUrl = await uploadImageToGoogleDrive(file);
        if (driveUrl) {
          setPreview(URL.createObjectURL(file));
          onImageCaptured(driveUrl);
          alert('Tải ảnh lên Google Drive thành công!');
        } else {
          alert('Tải ảnh thất bại, vui lòng thử lại.');
        }
      } catch (error) {
        console.error('Lỗi upload:', error);
      } finally {
        setUploading(false);
      }
    }
  };

  return (
    <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
      <label className="block text-sm font-semibold text-gray-700">
        📸 Chứng Từ / Hình Ảnh Hợp Đồng:
      </label>

      {/* Các nút điều khiển */}
      <div className="flex flex-wrap gap-2 items-center">
        {!isCameraActive ? (
          <button 
            type="button" 
            onClick={startCamera}
            className="px-3 py-2 bg-indigo-600 text-white rounded-md text-xs font-semibold hover:bg-indigo-700 transition"
          >
            📷 Bật Camera Chụp Trực Tiếp
          </button>
        ) : (
          <div className="flex space-x-2">
            <button 
              type="button" 
              onClick={capturePhoto}
              className="px-3 py-2 bg-green-600 text-white rounded-md text-xs font-semibold hover:bg-green-700"
            >
              ⏺ Chụp Ngay
            </button>
            <button 
              type="button" 
              onClick={stopCamera}
              className="px-3 py-2 bg-gray-500 text-white rounded-md text-xs font-semibold hover:bg-gray-600"
            >
              Hủy
            </button>
          </div>
        )}

        <div className="relative">
          <input 
            type="file" 
            accept="image/*"
            onChange={handleFileUpload}
            className="text-xs text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
          />
        </div>
      </div>

      {/* Hiển thị màn hình Camera trực tiếp */}
      {isCameraActive && (
        <div className="relative w-full max-w-xs bg-black rounded-md overflow-hidden shadow-inner">
          <video ref={videoRef} autoPlay playsInline className="w-full h-auto object-cover" />
          <p className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded">
            Đang bật camera...
          </p>
        </div>
      )}

      {/* Trạng thái đang tải lên Google Drive */}
      {uploading && (
        <p className="text-xs text-blue-600 animate-pulse font-medium">
          ⏳ Đang mã hóa và đẩy ảnh lên Google Drive...
        </p>
      )}

      {/* Hiển thị ảnh xem trước (Preview) */}
      {preview && !isCameraActive && (
        <div className="mt-2">
          <p className="text-xs text-green-600 font-semibold mb-1">✓ Đã đính kèm ảnh:</p>
          <img 
            src={preview} 
            alt="Xem trước chứng từ" 
            className="h-24 w-auto rounded-md border shadow-sm object-cover" 
          />
        </div>
      )}
    </div>
  );
};