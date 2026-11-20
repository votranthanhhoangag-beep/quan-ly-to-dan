import { supabase } from './supabaseClient';

const getSupabaseClient = () => {
  if (!supabase) throw new Error('Supabase chưa được cấu hình.');
  return supabase;
};

const formatSupabaseError = (err: unknown): string => {
  if (!err) return 'Lỗi không xác định từ Supabase.';
  if (typeof err === 'object' && err !== null) {
    const errorObj = err as Record<string, unknown>;
    const message = errorObj.message ? String(errorObj.message) : '';
    const details = errorObj.details ? String(errorObj.details) : '';
    const hint = errorObj.hint ? String(errorObj.hint) : '';
    const code = errorObj.code ? `[Mã: ${errorObj.code}]` : '';

    const parts = [code, message, details, hint].filter(Boolean);
    if (parts.length > 0) return parts.join(' - ');
  }
  return err instanceof Error ? err.message : String(err);
};

const pendingSaves = new Map<string, Promise<unknown[]>>();

export async function fetchDataStores(keys: readonly string[]): Promise<Map<string, unknown[]>> {
  if (keys.length === 0) return new Map();

  const pending = keys
    .map(key => pendingSaves.get(key))
    .filter((save): save is Promise<unknown[]> => save !== undefined);
  if (pending.length > 0) await Promise.all(pending);

  const client = getSupabaseClient();
  const { data, error } = await client
    .from('app_data_stores')
    .select('key, data')
    .in('key', [...keys]);
  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  const snapshots = new Map(keys.map(key => [key, [] as unknown[]]));
  for (const row of data || []) {
    if (!Array.isArray(row.data)) {
      throw new Error(`Dữ liệu Supabase (${row.key}) không đúng định dạng mảng.`);
    }
    snapshots.set(row.key, row.data);
  }
  return snapshots;
}

export async function saveDataStore(key: string, userId: string | undefined, items: unknown[]): Promise<unknown[]> {
  const previousSave = pendingSaves.get(key);
  const currentSave = (async () => {
    if (previousSave) await previousSave.catch(() => undefined);
    
    const client = getSupabaseClient();

    // Ghi trực tiếp theo key chung của toàn hệ thống (bảng app_data_stores dùng khóa chính là key)
    const payload: Record<string, unknown> = {
      key,
      data: items,
      updated_at: new Date().toISOString()
    };
    if (userId) {
      payload.updated_by = userId;
    }

    const { error: upsertError } = await client
      .from('app_data_stores')
      .upsert(payload, { onConflict: 'key' });

    if (!upsertError) {
      return items;
    }

    // Nếu xảy ra lỗi do schema cũ còn đòi hỏi cột user_id, fallback tương thích ngược
    if (userId && upsertError.message?.includes('user_id')) {
      const { error: legacyError } = await client
        .from('app_data_stores')
        .upsert({
          user_id: userId,
          key,
          data: items,
          updated_at: new Date().toISOString()
        });

      if (!legacyError) {
          return items;
      }
      throw new Error(formatSupabaseError(legacyError));
    }

    throw new Error(formatSupabaseError(upsertError));
  })();

  pendingSaves.set(key, currentSave);

  try {
    return await currentSave;
  } finally {
    if (pendingSaves.get(key) === currentSave) pendingSaves.delete(key);
  }
}
