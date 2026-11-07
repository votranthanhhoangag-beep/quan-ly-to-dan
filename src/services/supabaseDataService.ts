import { supabase } from './supabaseClient';

const getSupabaseClient = () => {
  if (!supabase) throw new Error('Supabase chưa được cấu hình.');
  return supabase;
};

const pendingSaves = new Map<string, Promise<unknown[]>>();

const queryDataStore = async (key: string, _userId?: string): Promise<unknown[]> => {
  // Ưu tiên truy vấn theo shared key (primary key = key)
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('app_data_stores')
    .select('data')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    // Nếu database đang trong quá trình chuyển đổi còn cột user_id, fallback nhẹ
    if (error.message?.includes('user_id') && _userId) {
      const fallback = await client
        .from('app_data_stores')
        .select('data')
        .eq('user_id', _userId)
        .eq('key', key)
        .maybeSingle();
      if (fallback.error) throw fallback.error;
      if (!fallback.data) return [];
      return Array.isArray(fallback.data.data) ? fallback.data.data : [];
    }
    throw error;
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
    
    // Thử lưu với mô hình chia sẻ chung (key là khóa chính)
    const client = getSupabaseClient();
    const payload: Record<string, unknown> = {
      key,
      data: items,
      updated_at: new Date().toISOString()
    };
    if (userId) {
      payload.updated_by = userId;
    }

    let { error } = await client
      .from('app_data_stores')
      .upsert(payload, { onConflict: 'key' });

    // Nếu bảng ở Supabase chưa chạy script gộp và vẫn yêu cầu (user_id, key)
    if (error && error.message?.includes('user_id') && userId) {
      const fallbackUpsert = await client
        .from('app_data_stores')
        .upsert({
          user_id: userId,
          key,
          data: items,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,key' });
      error = fallbackUpsert.error;
    }

    if (error) throw error;
    return queryDataStore(key, userId);
  })();

  pendingSaves.set(key, currentSave);

  try {
    return await currentSave;
  } finally {
    if (pendingSaves.get(key) === currentSave) pendingSaves.delete(key);
  }
}
