const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbx5hDX2b8AA5AqBKlWs-hK_Iwdam8XTlurlZMOTaIxWtI4aKNffp6Ir44WyFWaWCOjcoQ/exec";
const SHEET_CACHE_PREFIX = 'erp_sheet_cache:';
const PENDING_SAVES_KEY = 'erp_pending_sheet_saves';
const SAVE_TIMEOUT_MS = 20000;

type PendingSaves = Record<string, unknown[]>;

const emitSyncStatus = (status: string, message: string) => {
  window.dispatchEvent(new CustomEvent('erp:sync-status', { detail: { status, message } }));
};

const readPendingSaves = (): PendingSaves => {
  try {
    const stored = window.localStorage.getItem(PENDING_SAVES_KEY);
    if (!stored) return {};
    const value: unknown = JSON.parse(stored);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as PendingSaves
      : {};
  } catch (error) {
    console.error('Không thể đọc hàng đợi đồng bộ dữ liệu:', error);
    return {};
  }
};

const writePendingSaves = (pending: PendingSaves) => {
  try {
    if (Object.keys(pending).length === 0) {
      window.localStorage.removeItem(PENDING_SAVES_KEY);
    } else {
      window.localStorage.setItem(PENDING_SAVES_KEY, JSON.stringify(pending));
    }
  } catch (error) {
    console.error('Không thể lưu hàng đợi đồng bộ dữ liệu:', error);
    emitSyncStatus('error', 'Không thể lưu dữ liệu tạm trên thiết bị. Hãy sao chép thông tin đang nhập trước khi tải lại trang.');
  }
};

const cacheSheetData = (sheetName: string, items: unknown[]) => {
  try {
    window.localStorage.setItem(`${SHEET_CACHE_PREFIX}${sheetName}`, JSON.stringify(items));
  } catch (error) {
    console.error(`Không thể lưu bản sao dữ liệu (${sheetName}):`, error);
    emitSyncStatus('error', 'Thiết bị không đủ dung lượng lưu dữ liệu tạm. Vui lòng giải phóng dung lượng.');
  }
};

const readCachedSheetData = (sheetName: string): unknown[] | null => {
  try {
    const stored = window.localStorage.getItem(`${SHEET_CACHE_PREFIX}${sheetName}`);
    if (stored === null) return null;
    const value: unknown = JSON.parse(stored);
    if (!Array.isArray(value)) {
      throw new Error(`Bản sao cục bộ của ${sheetName} không đúng định dạng.`);
    }
    return value;
  } catch (error) {
    console.error(`Không thể đọc bản sao dữ liệu (${sheetName}):`, error);
    return null;
  }
};

const queueSheetSave = (sheetName: string, items: unknown[]) => {
  const pending = readPendingSaves();
  pending[sheetName] = items;
  writePendingSaves(pending);
  emitSyncStatus('pending', 'Mạng không ổn định. Dữ liệu đã lưu trên thiết bị và sẽ tự đồng bộ khi có kết nối.');
};

const sendSheetSnapshot = async (sheetName: string, items: unknown[]) => {
  await fetch(WEB_APP_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'saveData', sheetName, items }),
    signal: AbortSignal.timeout(SAVE_TIMEOUT_MS)
  });
};

let retryTimer: number | undefined;
let retryDelay = 1000;
let pendingSaveFlush: Promise<void> | null = null;

const flushPendingSaves = async () => {
  if (pendingSaveFlush) return pendingSaveFlush;
  if (!navigator.onLine) return;

  pendingSaveFlush = (async () => {
    while (navigator.onLine) {
      const currentPending = readPendingSaves();
      const sheetName = Object.keys(currentPending)[0];
      if (!sheetName) break;
      const items = currentPending[sheetName];
      if (!items) continue;
      try {
        await sendSheetSnapshot(sheetName, items);
        const latestPending = readPendingSaves();
        if (JSON.stringify(latestPending[sheetName]) === JSON.stringify(items)) {
          delete latestPending[sheetName];
          writePendingSaves(latestPending);
        }
      } catch (error) {
        console.error(`Không thể đồng bộ dữ liệu (${sheetName}):`, error);
        schedulePendingSaveRetry();
        return;
      }
    }

    if (Object.keys(readPendingSaves()).length === 0) {
      retryDelay = 1000;
      emitSyncStatus('sent', 'Đã gửi dữ liệu đang chờ đồng bộ. Máy chủ chưa cung cấp xác nhận lưu cuối cùng.');
    } else if (navigator.onLine) {
      schedulePendingSaveRetry();
    }
  })().finally(() => {
    pendingSaveFlush = null;
  });
  return pendingSaveFlush;
};

const schedulePendingSaveRetry = () => {
  if (retryTimer !== undefined || !navigator.onLine) return;
  retryTimer = window.setTimeout(() => {
    retryTimer = undefined;
    void flushPendingSaves();
    retryDelay = Math.min(retryDelay * 2, 30000);
  }, retryDelay);
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    emitSyncStatus('syncing', 'Đã có kết nối. Đang đồng bộ dữ liệu đang chờ...');
    retryDelay = 1000;
    void flushPendingSaves();
  });
  window.addEventListener('offline', () => {
    emitSyncStatus('offline', 'Mất kết nối mạng. Dữ liệu mới sẽ được lưu trên thiết bị và đồng bộ lại khi có mạng.');
  });
  if (navigator.onLine && Object.keys(readPendingSaves()).length) schedulePendingSaveRetry();
}

/**
 * Tải dữ liệu từ Google Sheets theo tên sheet
 */
export async function fetchSheetData(sheetName: string) {
  try {
    const pending = readPendingSaves()[sheetName];
    if (pending) return pending;
    const res = await fetch(`${WEB_APP_URL}?sheetName=${encodeURIComponent(sheetName)}`, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(SAVE_TIMEOUT_MS)
    });
    if (!res.ok) {
      throw new Error(`Google Sheets trả về HTTP ${res.status} khi đọc ${sheetName}.`);
    }
    const text = await res.text();
    if (!text) return [];
    const data: unknown = JSON.parse(text);
    if (!Array.isArray(data)) {
      throw new Error(`Dữ liệu Google Sheets không đúng định dạng mảng (${sheetName}).`);
    }
    cacheSheetData(sheetName, data);
    return data;
  } catch (error) {
    const cachedData = readCachedSheetData(sheetName);
    if (cachedData) {
      emitSyncStatus('offline', 'Không truy cập được máy chủ. Đang làm việc trên bản sao cục bộ; thay đổi sẽ chờ đồng bộ.');
      return cachedData;
    }
    throw error;
  }
}

/**
 * Lưu/Đồng bộ mảng dữ liệu lên Google Sheets theo tên sheet
 */
export async function saveSheetData(sheetName: string, items: unknown[]) {
  if (!items) return;
  cacheSheetData(sheetName, items);
  queueSheetSave(sheetName, items);
  if (!navigator.onLine) return;
  await flushPendingSaves();
}

/**
 * Upload chứng từ/hình ảnh dạng mã hóa Base64 lên Google Drive
 */
export async function uploadImageToGoogleDrive(file: File): Promise<string | null> {
  return new Promise((resolve) => {
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
          })
        });
        resolve("https://drive.google.com");
      } catch (err) {
        console.error('Lỗi upload ảnh lên Google Drive:', err);
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
  });
}