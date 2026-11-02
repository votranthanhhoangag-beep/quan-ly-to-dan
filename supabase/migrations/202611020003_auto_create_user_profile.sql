-- Tự động tạo hồ sơ user_profiles khi tạo tài khoản trong auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  initial_role text;
  initial_username text;
begin
  initial_role := coalesce(new.raw_user_meta_data->>'role', 'kho_to_dan');
  if initial_role not in ('admin', 'ke_toan', 'kho_to_dan') then
    initial_role := 'kho_to_dan';
  end if;

  initial_username := coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.user_profiles (
    user_id,
    username,
    role,
    email,
    auth_created_at,
    account_status
  ) values (
    new.id,
    initial_username,
    initial_role,
    new.email,
    new.created_at,
    'active'
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    auth_created_at = excluded.auth_created_at;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

