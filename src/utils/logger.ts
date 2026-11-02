import { supabase } from '../services/supabaseClient';

export type DailyActionType =
  | 'CREATE_IMPORT'
  | 'CREATE_EXPORT'
  | 'CREATE_RECEIPT'
  | 'CREATE_PAYMENT'
  | 'CUSTOM_NOTE';

interface LogDailyActionInput {
  actionType: DailyActionType;
  title: string;
  description?: string | null;
  referenceId?: string | number | null;
}

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function logDailyAction({
  actionType,
  title,
  description = null,
  referenceId = null
}: LogDailyActionInput): Promise<void> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình.');

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Không thể xác thực người thực hiện: ${userError.message}`);
  if (!user?.email) throw new Error('Tài khoản hiện tại không có email để ghi nhật ký.');

  const referenceValue = referenceId === null ? null : String(referenceId);
  const normalizedReferenceId = referenceValue && isUuid(referenceValue)
    ? referenceValue
    : null;
  if (referenceValue && !normalizedReferenceId) {
    console.warn('Bỏ qua reference_id không phải UUID khi ghi nhật ký:', referenceValue);
  }

  const { error: insertError } = await supabase
    .from('daily_logs')
    .insert({
      user_email: user.email,
      action_type: actionType,
      title,
      description: description || null,
      reference_id: normalizedReferenceId
    });

  if (insertError) throw new Error(`Không thể ghi nhật ký công việc: ${insertError.message}`);
}
