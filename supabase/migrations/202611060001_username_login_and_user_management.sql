create or replace function public.confirm_internal_erp_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(new.email, '')) like '%@erp.local' then
    new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  end if;
  return new;
end;
$$;

revoke all on function public.confirm_internal_erp_user() from public, anon, authenticated;

drop trigger if exists confirm_internal_erp_user on auth.users;
create trigger confirm_internal_erp_user
  before insert on auth.users
  for each row execute function public.confirm_internal_erp_user();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  initial_username text;
begin
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
    'kho_to_dan',
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

alter table public.user_profiles enable row level security;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'user_profiles'
  loop
    execute format('drop policy %I on public.user_profiles', policy_row.policyname);
  end loop;
end;
$$;

create policy "Users can read their own profile"
  on public.user_profiles for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Admins can read user profiles"
  on public.user_profiles for select to authenticated
  using ((select public.current_app_role()) = 'admin');

create policy "Admins can insert user profiles"
  on public.user_profiles for insert to authenticated
  with check ((select public.current_app_role()) = 'admin');

create policy "Admins can update user profiles"
  on public.user_profiles for update to authenticated
  using ((select public.current_app_role()) = 'admin')
  with check ((select public.current_app_role()) = 'admin');

create policy "Admins can delete user profiles"
  on public.user_profiles for delete to authenticated
  using ((select public.current_app_role()) = 'admin');

grant select, insert, update, delete on public.user_profiles to authenticated;
