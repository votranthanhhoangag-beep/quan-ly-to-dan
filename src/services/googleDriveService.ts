const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbx5hDX2b8AA5AqBKlWs-hK_Iwdam8XTlurlZMOTaIxWtI4aKNffp6Ir44WyFWaWCOjcoQ/exec';
const UPLOAD_TIMEOUT_MS = 20000;

export async function uploadImageToGoogleDrive(file: File): Promise<string | null> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        const base64String = (reader.result as string).split(',')[1];
        await fetch(WEB_APP_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'uploadImage',
            base64: base64String,
            filename: file.name,
            mimeType: file.type
          }),
          signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS)
        });
        resolve('https://drive.google.com');
      } catch (error) {
        console.error('Lỗi upload ảnh lên Google Drive:', error);
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
  });
}
