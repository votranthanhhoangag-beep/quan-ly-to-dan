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

const queryDataStore = async (key: string, userId?: string): Promise<unknown[]> => {
  const client = getSupabaseClient();

  // 1. Nếu có userId, kiểm tra theo (user_id, key) hoặc key
  let { data, error } = await client
    .from('app_data_stores')
    .select('data')
    .eq('key', key)
    .maybeSingle();

  // 2. Nếu lỗi do cấu trúc bảng cần user_id
  if (error && userId && (error.message?.includes('user_id') || error.code === 'PGRST116')) {
    const fallback = await client
      .from('app_data_stores')
      .select('data')
      .eq('user_id', userId)
      .eq('key', key)
      .maybeSingle();
    error = fallback.error;
    data = fallback.data;
  }

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  if (!data) return [];
  if (!Array.isArray(data.data)) {
    throw new Error(`Dữ liệu Supabase (${key}) không đúng định dạng mảng.`);
  }
  return data.data;
};

export async function fetchDataStore(key: string, userId?: string): Promise<unknown[]> {
  const pendingSave = pendingSaves.get(key);
  if (pendingSave) await pendingSave;
  return queryDataStore(key, userId);
}

export async function saveDataStore(key: string, userId: string | undefined, items: unknown[]): Promise<unknown[]> {
  const previousSave = pendingSaves.get(key);
  const currentSave = (async () => {
    if (previousSave) await previousSave.catch(() => undefined);
    
    const client = getSupabaseClient();
    let saveError: unknown = null;

    // Cách 1: Ghi với user_id (tương thích cả bảng cũ và bảng mới nếu có cột user_id)
    if (userId) {
      const { error: upsertWithUserError } = await client
        .from('app_data_stores')
        .upsert({
          user_id: userId,
          key,
          data: items,
          updated_at: new Date().toISOString()
        });

      if (!upsertWithUserError) {
        return queryDataStore(key, userId);
      }
      saveError = upsertWithUserError;
    }

    // Cách 2: Nếu thất bại hoặc không có cột user_id, ghi theo key duy nhất
    const { error: upsertKeyOnlyError } = await client
      .from('app_data_stores')
      .upsert({
        key,
        data: items,
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });

    if (!upsertKeyOnlyError) {
      return queryDataStore(key, userId);
    }

    // Nếu cả hai đều lỗi, ném ra thông tin chi tiết
    throw new Error(formatSupabaseError(saveError || upsertKeyOnlyError));
  })();

  pendingSaves.set(key, currentSave);

  try {
    return await currentSave;
  } finally {
    if (pendingSaves.get(key) === currentSave) pendingSaves.delete(key);
  }
}
