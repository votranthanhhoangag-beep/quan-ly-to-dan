import { supabase } from './supabaseClient';

const getSupabaseClient = () => {
  if (!supabase) throw new Error('Supabase chưa được cấu hình.');
  return supabase;
};

const getStoreScope = (key: string, userId: string) => `${userId}:${key}`;
const pendingSaves = new Map<string, Promise<unknown[]>>();

const queryDataStore = async (key: string, userId: string): Promise<unknown[]> => {
  const { data, error } = await getSupabaseClient()
    .from('app_data_stores')
    .select('data')
    .eq('user_id', userId)
    .eq('key', key)
    .maybeSingle();

  if (error) throw error;
  if (!data) return [];
  if (!Array.isArray(data.data)) {
    throw new Error(`Dữ liệu Supabase (${key}) không đúng định dạng mảng.`);
  }
  return data.data;
};

export async function fetchDataStore(key: string, userId: string): Promise<unknown[]> {
  const pendingSave = pendingSaves.get(getStoreScope(key, userId));
  if (pendingSave) await pendingSave;
  return queryDataStore(key, userId);
}

export async function saveDataStore(key: string, userId: string, items: unknown[]): Promise<unknown[]> {
  const scope = getStoreScope(key, userId);
  const previousSave = pendingSaves.get(scope);
  const currentSave = (async () => {
    if (previousSave) await previousSave.catch(() => undefined);
    const { error } = await getSupabaseClient()
      .from('app_data_stores')
      .upsert({
        user_id: userId,
        key,
        data: items,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,key' });

    if (error) throw error;
    return queryDataStore(key, userId);
  })();
  pendingSaves.set(scope, currentSave);

  try {
    return await currentSave;
  } finally {
    if (pendingSaves.get(scope) === currentSave) pendingSaves.delete(scope);
  }
}
