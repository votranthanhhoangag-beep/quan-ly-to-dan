import { supabase } from './supabaseClient';

const DATA_CACHE_PREFIX = 'erp_sheet_cache:';
const PENDING_DATA_STORES_KEY = 'erp_pending_supabase_data_stores';
const LEGACY_PENDING_SHEETS_KEY = 'erp_pending_sheet_saves';
const PENDING_KEY_SEPARATOR = '::';
const LEGACY_QUEUE_KEY = '__legacy__';
const PREVIOUS_DEFAULT_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

type PendingDataStores = Record<string, unknown[]>;

const getScopedStoreKey = (userId: string, key: string) =>
  `${userId}${PENDING_KEY_SEPARATOR}${key}`;
const getCacheKey = (userId: string, key: string) =>
  `${DATA_CACHE_PREFIX}${userId}:${key}`;
let activeUserId: string | null = null;

const emitSyncStatus = (status: 'offline' | 'error', message: string) => {
  window.dispatchEvent(new CustomEvent('erp:sync-status', { detail: { status, message } }));
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const details = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    return [details.message, details.code, details.details, details.hint]
      .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
      .join(' · ') || 'Lỗi không xác định.';
  }
  return 'Lỗi không xác định.';
};

const readPendingDataStores = (): PendingDataStores => {
  try {
    const stored = window.localStorage.getItem(PENDING_DATA_STORES_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => {
      if (!Array.isArray(value)) {
        throw new Error(`Hàng đợi đồng bộ dữ liệu ${key} không đúng định dạng.`);
      }
      return [
        key.includes(PENDING_KEY_SEPARATOR)
          ? key
          : getScopedStoreKey(LEGACY_QUEUE_KEY, key),
        value
      ];
    }));
  } catch (error) {
    console.error('Không thể đọc hàng đợi dữ liệu Supabase:', error);
    return {};
  }
};

const writePendingDataStores = (pending: PendingDataStores): boolean => {
  try {
    if (Object.keys(pending).length === 0) {
      window.localStorage.removeItem(PENDING_DATA_STORES_KEY);
    } else {
      window.localStorage.setItem(PENDING_DATA_STORES_KEY, JSON.stringify(pending));
    }
    return true;
  } catch (error) {
    console.error('Không thể lưu hàng đợi dữ liệu Supabase:', error);
    emitSyncStatus('error', 'Không thể lưu hàng đợi đồng bộ trên thiết bị. Hãy sao chép dữ liệu quan trọng trước khi tải lại trang.');
    return false;
  }
};

const cacheDataStore = (userId: string, key: string, items: unknown[]) => {
  try {
    window.localStorage.setItem(getCacheKey(userId, key), JSON.stringify(items));
  } catch (error) {
    console.error(`Không thể lưu cache dữ liệu (${key}):`, error);
    emitSyncStatus('error', 'Không thể lưu bản cache trên thiết bị. Vui lòng kiểm tra dung lượng lưu trữ.');
  }
};

const readCachedDataStore = (userId: string, key: string): unknown[] | null => {
  try {
    const stored = window.localStorage.getItem(getCacheKey(userId, key));
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

export const getCachedDataStore = (key: string, userId: string): unknown[] | null =>
  readPendingDataStores()[getScopedStoreKey(userId, key)] ??
  readCachedDataStore(userId, key);

const isNetworkError = (error: unknown) =>
  error instanceof TypeError ||
  (error instanceof DOMException && ['AbortError', 'TimeoutError', 'NetworkError'].includes(error.name));

const isMissingDataStore = (error: { code?: string; details?: string | null; message?: string }) =>
  error.code === 'PGRST116' && /0 rows/i.test(`${error.details || ''} ${error.message || ''}`);

const getSupabaseClient = () => {
  if (!supabase) throw new Error('Supabase chưa được cấu hình.');
  return supabase;
};

const migrateLegacyPendingSaves = (userId: string) => {
  try {
    const pending = readPendingDataStores();
    const legacyQueue = window.localStorage.getItem(LEGACY_PENDING_SHEETS_KEY);
    if (legacyQueue) {
      const parsed: unknown = JSON.parse(legacyQueue);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Hàng đợi đồng bộ cũ không đúng định dạng.');
      }
      Object.entries(parsed).forEach(([key, value]) => {
        if (!Array.isArray(value)) throw new Error(`Dữ liệu đang chờ đồng bộ (${key}) không đúng định dạng.`);
        const scopedKey = getScopedStoreKey(userId, key);
        if (pending[scopedKey] === undefined) pending[scopedKey] = value;
      });
    }

    Object.entries(pending).forEach(([scopedKey, value]) => {
      const separatorIndex = scopedKey.indexOf(PENDING_KEY_SEPARATOR);
      const scope = scopedKey.slice(0, separatorIndex);
      const key = scopedKey.slice(separatorIndex + PENDING_KEY_SEPARATOR.length);
      if (scope === LEGACY_QUEUE_KEY || scope === PREVIOUS_DEFAULT_ORGANIZATION_ID) {
        const userScopedKey = getScopedStoreKey(userId, key);
        if (pending[userScopedKey] === undefined) pending[userScopedKey] = value;
        delete pending[scopedKey];
      }
    });
    if (writePendingDataStores(pending) && legacyQueue) {
      window.localStorage.removeItem(LEGACY_PENDING_SHEETS_KEY);
    }
  } catch (error) {
    console.error('Không thể chuyển hàng đợi Google Sheets cũ sang Supabase:', error);
    emitSyncStatus('error', 'Không thể chuyển dữ liệu đang chờ đồng bộ trên thiết bị sang Supabase.');
  }
};

export const activateDataStoreUser = (userId: string) => {
  activeUserId = userId;
  migrateLegacyPendingSaves(userId);
  if (navigator.onLine) void flushPendingDataStores(userId);
};

const upsertDataStore = async (key: string, userId: string, items: unknown[]) => {
  const client = getSupabaseClient();
  const { error } = await client
    .from('app_data_stores')
    .upsert({
      user_id: userId,
      key,
      data: items,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,key' });
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
  if (retryTimer !== undefined || !navigator.onLine || !activeUserId) return;
  retryTimer = window.setTimeout(() => {
    retryTimer = undefined;
    if (activeUserId) void flushPendingDataStores(activeUserId);
    retryDelay = Math.min(retryDelay * 2, 30000);
  }, retryDelay);
};

const flushPendingDataStores = async (userId: string) => {
  if (flushPromise) return flushPromise;
  if (!navigator.onLine) return;
  const currentUserPending = Object.entries(readPendingDataStores())
    .filter(([scopedKey]) => scopedKey.startsWith(`${userId}${PENDING_KEY_SEPARATOR}`));
  if (currentUserPending.length === 0) return;

  flushPromise = (async () => {
    const pending = readPendingDataStores();
    const entries = Object.entries(pending)
      .filter(([scopedKey]) => scopedKey.startsWith(`${userId}${PENDING_KEY_SEPARATOR}`));
    const results = await Promise.allSettled(entries.map(([scopedKey, items]) => {
      const separatorIndex = scopedKey.indexOf(PENDING_KEY_SEPARATOR);
      if (separatorIndex < 0) {
        return Promise.reject(new Error(`Khóa hàng đợi đồng bộ không hợp lệ: ${scopedKey}`));
      }
      const scopedUserId = scopedKey.slice(0, separatorIndex);
      const key = scopedKey.slice(separatorIndex + PENDING_KEY_SEPARATOR.length);
      return upsertDataStore(key, scopedUserId, items);
    }));
    const latestPending = readPendingDataStores();
    let hasFailures = false;

    results.forEach((result, index) => {
      const [scopedKey, items] = entries[index];
      if (result.status === 'fulfilled') {
        if (JSON.stringify(latestPending[scopedKey]) === JSON.stringify(items)) delete latestPending[scopedKey];
        return;
      }

      hasFailures = true;
      console.error(`Không thể đồng bộ dữ liệu Supabase (${scopedKey}):`, result.reason);
      emitSyncStatus(
        'error',
        `Không thể đồng bộ dữ liệu ${scopedKey} lên Supabase. Dữ liệu vẫn được giữ trên thiết bị và sẽ tự thử lại.`
      );
    });

    writePendingDataStores(latestPending);
    if (hasFailures) scheduleRetry();
    else if (latestPendingKeysForUser(latestPending, userId).length > 0) scheduleRetry();
    else retryDelay = 1000;
  })().finally(() => {
    flushPromise = null;
  });

  return flushPromise;
};

const latestPendingKeysForUser = (pending: PendingDataStores, userId: string) =>
  Object.keys(pending).filter(key => key.startsWith(`${userId}${PENDING_KEY_SEPARATOR}`));

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    offlineNoticeShown = false;
    retryDelay = 1000;
    if (activeUserId) void flushPendingDataStores(activeUserId);
  });
  window.addEventListener('offline', () => {
    offlineNoticeShown = false;
    emitOfflineNotice('Mất kết nối mạng. Dữ liệu đang dùng bản lưu trên thiết bị; thay đổi sẽ đồng bộ khi có mạng.');
  });
}

export async function fetchDataStore(key: string, userId: string): Promise<unknown[]> {
  if (!navigator.onLine) {
    const cachedData = getCachedDataStore(key, userId);
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
      .eq('user_id', userId)
      .eq('key', key)
      .single();

    if (error) {
      if (!isMissingDataStore(error)) throw error;
      cacheDataStore(userId, key, []);
      return [];
    }

    if (!data || !Array.isArray(data.data)) {
      throw new Error(`Dữ liệu Supabase (${key}) không đúng định dạng mảng.`);
    }

    cacheDataStore(userId, key, data.data);
    return data.data;
  } catch (error) {
    if (!navigator.onLine) {
      const cachedData = getCachedDataStore(key, userId);
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

export async function saveDataStore(key: string, userId: string, items: unknown[]): Promise<void> {
  cacheDataStore(userId, key, items);
  const scopedKey = getScopedStoreKey(userId, key);

  if (!navigator.onLine) {
    const pending = readPendingDataStores();
    pending[scopedKey] = items;
    writePendingDataStores(pending);
    emitOfflineNotice('Mất kết nối mạng. Thay đổi đã lưu trên thiết bị và sẽ đồng bộ khi có mạng.');
    return;
  }

  try {
    await upsertDataStore(key, userId, items);
    const pending = readPendingDataStores();
    if (JSON.stringify(pending[scopedKey]) === JSON.stringify(items)) {
      delete pending[scopedKey];
      writePendingDataStores(pending);
    }
  } catch (error) {
    console.error(`Không thể lưu dữ liệu Supabase (${key}):`, error);
    if (isNetworkError(error) || !navigator.onLine) {
      const pending = readPendingDataStores();
      pending[scopedKey] = items;
      writePendingDataStores(pending);
      emitSyncStatus('error', `Lỗi kết nối khi lưu dữ liệu ${key}. Dữ liệu vẫn được giữ trên thiết bị và sẽ tự thử lại.`);
      scheduleRetry();
      return;
    }
    emitSyncStatus('error', `Supabase từ chối lưu dữ liệu ${key}: ${getErrorMessage(error)}`);
  }
}
