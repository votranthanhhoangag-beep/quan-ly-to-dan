import { supabase } from './supabaseClient';

const DATA_CACHE_PREFIX = 'erp_sheet_cache:';
const PENDING_DATA_STORES_KEY = 'erp_pending_supabase_data_stores';
const LEGACY_PENDING_SHEETS_KEY = 'erp_pending_sheet_saves';

type PendingDataStores = Record<string, unknown[]>;

const emitSyncStatus = (status: 'offline' | 'error', message: string) => {
  window.dispatchEvent(new CustomEvent('erp:sync-status', { detail: { status, message } }));
};

const readPendingDataStores = (): PendingDataStores => {
  try {
    const stored = window.localStorage.getItem(PENDING_DATA_STORES_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as PendingDataStores
      : {};
  } catch (error) {
    console.error('Không thể đọc hàng đợi dữ liệu Supabase:', error);
    return {};
  }
};

const writePendingDataStores = (pending: PendingDataStores) => {
  try {
    if (Object.keys(pending).length === 0) {
      window.localStorage.removeItem(PENDING_DATA_STORES_KEY);
    } else {
      window.localStorage.setItem(PENDING_DATA_STORES_KEY, JSON.stringify(pending));
    }
  } catch (error) {
    console.error('Không thể lưu hàng đợi dữ liệu Supabase:', error);
    emitSyncStatus('error', 'Không thể lưu hàng đợi đồng bộ trên thiết bị. Hãy sao chép dữ liệu quan trọng trước khi tải lại trang.');
  }
};

const cacheDataStore = (key: string, items: unknown[]) => {
  try {
    window.localStorage.setItem(`${DATA_CACHE_PREFIX}${key}`, JSON.stringify(items));
  } catch (error) {
    console.error(`Không thể lưu cache dữ liệu (${key}):`, error);
    emitSyncStatus('error', 'Không thể lưu bản cache trên thiết bị. Vui lòng kiểm tra dung lượng lưu trữ.');
  }
};

const readCachedDataStore = (key: string): unknown[] | null => {
  try {
    const stored = window.localStorage.getItem(`${DATA_CACHE_PREFIX}${key}`);
    if (stored === null) return null;
    const value: unknown = JSON.parse(stored);
    if (!Array.isArray(value)) {
      throw new Error(`Cache dữ liệu ${key} không đúng định dạng mảng.`);
    }
    return value;
  } catch (error) {
    console.error(`Không thể đọc cache dữ liệu (${key}):`, error);
    return null;
  }
};

export const getCachedDataStore = (key: string): unknown[] | null =>
  readPendingDataStores()[key] ?? readCachedDataStore(key);

const isNetworkError = (error: unknown) =>
  error instanceof TypeError ||
  (error instanceof DOMException && ['AbortError', 'TimeoutError', 'NetworkError'].includes(error.name));

const isMissingDataStore = (error: { code?: string; details?: string | null; message?: string }) =>
  error.code === 'PGRST116' && /0 rows/i.test(`${error.details || ''} ${error.message || ''}`);

const getSupabaseClient = () => {
  if (!supabase) throw new Error('Supabase chưa được cấu hình.');
  return supabase;
};

const migrateLegacyPendingSaves = () => {
  try {
    const stored = window.localStorage.getItem(LEGACY_PENDING_SHEETS_KEY);
    if (!stored) return;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Hàng đợi đồng bộ cũ không đúng định dạng.');
    }

    const pending = readPendingDataStores();
    Object.entries(parsed).forEach(([key, value]) => {
      if (!Array.isArray(value)) throw new Error(`Dữ liệu đang chờ đồng bộ (${key}) không đúng định dạng.`);
      if (pending[key] === undefined) pending[key] = value;
    });
    window.localStorage.setItem(PENDING_DATA_STORES_KEY, JSON.stringify(pending));
    window.localStorage.removeItem(LEGACY_PENDING_SHEETS_KEY);
  } catch (error) {
    console.error('Không thể chuyển hàng đợi Google Sheets cũ sang Supabase:', error);
    emitSyncStatus('error', 'Không thể chuyển dữ liệu đang chờ đồng bộ trên thiết bị sang Supabase.');
  }
};

const upsertDataStore = async (key: string, items: unknown[]) => {
  const client = getSupabaseClient();
  const { error } = await client
    .from('app_data_stores')
    .upsert({
      key,
      data: items,
      updated_at: new Date().toISOString()
    });
  if (error) throw error;
};

let flushPromise: Promise<void> | null = null;
let retryTimer: number | undefined;
let retryDelay = 1000;
let offlineNoticeShown = false;

const emitOfflineNotice = (message: string) => {
  if (offlineNoticeShown) return;
  offlineNoticeShown = true;
  emitSyncStatus('offline', message);
};

const scheduleRetry = () => {
  if (retryTimer !== undefined || !navigator.onLine) return;
  retryTimer = window.setTimeout(() => {
    retryTimer = undefined;
    void flushPendingDataStores();
    retryDelay = Math.min(retryDelay * 2, 30000);
  }, retryDelay);
};

const flushPendingDataStores = async () => {
  if (flushPromise) return flushPromise;
  if (!navigator.onLine || Object.keys(readPendingDataStores()).length === 0) return;

  flushPromise = (async () => {
    const pending = readPendingDataStores();
    const entries = Object.entries(pending);
    const results = await Promise.allSettled(entries.map(([key, items]) => upsertDataStore(key, items)));
    const latestPending = readPendingDataStores();
    let hasFailures = false;

    results.forEach((result, index) => {
      const [key, items] = entries[index];
      if (result.status === 'fulfilled') {
        if (JSON.stringify(latestPending[key]) === JSON.stringify(items)) delete latestPending[key];
        return;
      }

      hasFailures = true;
      console.error(`Không thể đồng bộ dữ liệu Supabase (${key}):`, result.reason);
      emitSyncStatus(
        'error',
        `Không thể đồng bộ dữ liệu ${key} lên Supabase. Dữ liệu vẫn được giữ trên thiết bị và sẽ tự thử lại.`
      );
    });

    writePendingDataStores(latestPending);
    if (hasFailures) scheduleRetry();
    else if (Object.keys(latestPending).length > 0) scheduleRetry();
    else retryDelay = 1000;
  })().finally(() => {
    flushPromise = null;
  });

  return flushPromise;
};

if (typeof window !== 'undefined') {
  migrateLegacyPendingSaves();
  window.addEventListener('online', () => {
    offlineNoticeShown = false;
    retryDelay = 1000;
    void flushPendingDataStores();
  });
  window.addEventListener('offline', () => {
    offlineNoticeShown = false;
    emitOfflineNotice('Mất kết nối mạng. Dữ liệu đang dùng bản lưu trên thiết bị; thay đổi sẽ đồng bộ khi có mạng.');
  });
  if (navigator.onLine && Object.keys(readPendingDataStores()).length > 0) scheduleRetry();
}

export async function fetchDataStore(key: string): Promise<unknown[]> {
  if (!navigator.onLine) {
    const cachedData = getCachedDataStore(key);
    if (cachedData !== null) {
      emitOfflineNotice('Mất kết nối mạng. Đang hiển thị dữ liệu đã lưu trên thiết bị.');
      return cachedData;
    }
    throw new Error(`Không có kết nối mạng và chưa có dữ liệu cache cho ${key}.`);
  }

  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('app_data_stores')
      .select('data')
      .eq('key', key)
      .single();

    if (error) {
      if (!isMissingDataStore(error)) throw error;
      cacheDataStore(key, []);
      return [];
    }

    if (!data || !Array.isArray(data.data)) {
      throw new Error(`Dữ liệu Supabase (${key}) không đúng định dạng mảng.`);
    }

    cacheDataStore(key, data.data);
    return data.data;
  } catch (error) {
    if (!navigator.onLine) {
      const cachedData = getCachedDataStore(key);
      if (cachedData !== null) {
        emitOfflineNotice('Mất kết nối mạng. Đang hiển thị dữ liệu đã lưu trên thiết bị.');
        return cachedData;
      }
    }

    console.error(`Không thể tải dữ liệu Supabase (${key}):`, error);
    if (isNetworkError(error)) {
      emitSyncStatus('error', `Lỗi kết nối khi tải dữ liệu ${key} từ Supabase.`);
    }
    throw error;
  }
}

export async function saveDataStore(key: string, items: unknown[]): Promise<void> {
  cacheDataStore(key, items);

  if (!navigator.onLine) {
    const pending = readPendingDataStores();
    pending[key] = items;
    writePendingDataStores(pending);
    emitOfflineNotice('Mất kết nối mạng. Thay đổi đã lưu trên thiết bị và sẽ đồng bộ khi có mạng.');
    return;
  }

  try {
    await upsertDataStore(key, items);
    const pending = readPendingDataStores();
    if (JSON.stringify(pending[key]) === JSON.stringify(items)) {
      delete pending[key];
      writePendingDataStores(pending);
    }
  } catch (error) {
    console.error(`Không thể lưu dữ liệu Supabase (${key}):`, error);
    if (isNetworkError(error) || !navigator.onLine) {
      const pending = readPendingDataStores();
      pending[key] = items;
      writePendingDataStores(pending);
      emitSyncStatus('error', `Lỗi kết nối khi lưu dữ liệu ${key}. Dữ liệu vẫn được giữ trên thiết bị và sẽ tự thử lại.`);
      scheduleRetry();
      return;
    }
    emitSyncStatus('error', `Supabase từ chối lưu dữ liệu ${key}: ${error instanceof Error ? error.message : 'Lỗi không xác định.'}`);
  }
}
