begin;

create table if not exists public.app_data_stores (
  user_id uuid references auth.users (id) on delete cascade,
  key text not null,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_data_stores
  add column if not exists data jsonb not null default '[]'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create temporary table legacy_app_data_stores (
  user_id uuid,
  organization_id uuid,
  key text not null,
  data jsonb not null,
  updated_at timestamptz not null
) on commit drop;

do $$
declare
  has_user_id boolean;
  has_organization_id boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_data_stores'
      and column_name = 'user_id'
  ) into has_user_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_data_stores'
      and column_name = 'organization_id'
  ) into has_organization_id;

  if has_user_id and has_organization_id then
    execute '
      insert into legacy_app_data_stores (user_id, organization_id, key, data, updated_at)
      select user_id, organization_id, key, data, updated_at
      from public.app_data_stores';
  elsif has_user_id then
    execute '
      insert into legacy_app_data_stores (user_id, key, data, updated_at)
      select user_id, key, data, updated_at
      from public.app_data_stores';
  elsif has_organization_id then
    execute '
      insert into legacy_app_data_stores (organization_id, key, data, updated_at)
      select organization_id, key, data, updated_at
      from public.app_data_stores';
  else
    execute '
      insert into legacy_app_data_stores (key, data, updated_at)
      select key, data, updated_at
      from public.app_data_stores';
  end if;
end;
$$;

alter table public.app_data_stores enable row level security;
do $$
declare
  policy_row record;
  primary_key_name text;
  has_profile_organization_id boolean;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'app_data_stores'
  loop
    execute format('drop policy %I on public.app_data_stores', policy_row.policyname);
  end loop;

  select constraint_row.conname
  into primary_key_name
  from pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.app_data_stores'::regclass
    and constraint_row.contype = 'p';

  if primary_key_name is not null then
    execute format('alter table public.app_data_stores drop constraint %I', primary_key_name);
  end if;

  alter table public.app_data_stores
    drop column if exists organization_id cascade,
    add column if not exists user_id uuid references auth.users (id) on delete cascade;

  alter table public.app_data_stores
    add constraint app_data_stores_user_id_key_unique unique (user_id, key);

  delete from public.app_data_stores;

  insert into public.app_data_stores (user_id, key, data, updated_at)
  select user_id, key, data, updated_at
  from legacy_app_data_stores
  where user_id is not null
  on conflict (user_id, key) do nothing;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_profiles'
      and column_name = 'organization_id'
  ) into has_profile_organization_id;

  if has_profile_organization_id then
    insert into public.app_data_stores (user_id, key, data, updated_at)
    select profile.user_id, legacy.key, legacy.data, legacy.updated_at
    from legacy_app_data_stores as legacy
    join public.user_profiles as profile
      on profile.organization_id = legacy.organization_id
      or (
        profile.organization_id is null
        and legacy.organization_id = '00000000-0000-4000-8000-000000000001'
      )
    where legacy.user_id is null
      and legacy.organization_id is not null
    on conflict (user_id, key) do nothing;
  else
    insert into public.app_data_stores (user_id, key, data, updated_at)
    select profile.user_id, legacy.key, legacy.data, legacy.updated_at
    from legacy_app_data_stores as legacy
    cross join public.user_profiles as profile
    where legacy.user_id is null
      and legacy.organization_id is not null
    on conflict (user_id, key) do nothing;
  end if;

  insert into public.app_data_stores (user_id, key, data, updated_at)
  select profile.user_id, legacy.key, legacy.data, legacy.updated_at
  from legacy_app_data_stores as legacy
  cross join public.user_profiles as profile
  where legacy.user_id is null
    and legacy.organization_id is null
  on conflict (user_id, key) do nothing;

  alter table public.app_data_stores
    alter column user_id set not null,
    drop constraint app_data_stores_user_id_key_unique,
    add constraint app_data_stores_pkey primary key (user_id, key);

  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_data_stores_user_id_fkey'
      and conrelid = 'public.app_data_stores'::regclass
  ) then
    alter table public.app_data_stores
      add constraint app_data_stores_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete cascade;
  end if;
end;
$$;

drop function if exists public.register_new_tenant(text, uuid, text);

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

alter table public.user_profiles
  drop column if exists organization_id cascade;

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

revoke all on function public.handle_new_user() from public, anon, authenticated;

create policy "Users can access their own data stores"
  on public.app_data_stores for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.app_data_stores from anon, authenticated;
grant select, insert, update on public.app_data_stores to authenticated;

alter table public.daily_logs
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'daily_logs_user_id_fkey'
      and conrelid = 'public.daily_logs'::regclass
  ) then
    alter table public.daily_logs
      add constraint daily_logs_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete cascade;
  end if;
end;
$$;

update public.daily_logs as daily_log
set user_id = profile.user_id
from public.user_profiles as profile
where daily_log.user_id is null
  and lower(daily_log.user_email) = lower(profile.email);

alter table public.daily_logs enable row level security;
do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'daily_logs'
  loop
    execute format('drop policy %I on public.daily_logs', policy_row.policyname);
  end loop;
end;
$$;

alter table public.daily_logs
  drop column if exists organization_id cascade;

create policy "Users can access their own daily logs"
  on public.daily_logs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.daily_logs from anon, authenticated;
grant select, insert on public.daily_logs to authenticated;

alter table public.audit_logs enable row level security;
do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'audit_logs'
  loop
    execute format('drop policy %I on public.audit_logs', policy_row.policyname);
  end loop;
end;
$$;

alter table public.audit_logs
  drop column if exists organization_id cascade;

create policy "Admins can read their own audit logs"
  on public.audit_logs for select to authenticated
  using (
    actor_user_id = (select auth.uid())
    and (select public.current_app_role()) = 'admin'
  );

create or replace function public.write_audit_log(
  p_event_id uuid,
  p_actor_user_id uuid,
  p_action_type text,
  p_module_name text,
  p_description text,
  p_target_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_username text;
  v_role text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if v_user_id <> p_actor_user_id then
    raise exception 'Audit event actor does not match the authenticated user';
  end if;
  if p_action_type not in ('CREATE', 'UPDATE', 'DELETE') then
    raise exception 'Invalid audit action type';
  end if;

  select username, role
  into v_username, v_role
  from public.user_profiles
  where user_id = v_user_id;

  if v_role is null then
    raise exception 'User profile not found';
  end if;

  insert into public.audit_logs (
    event_id, actor_user_id, username, role, action_type, module_name, description, target_id
  ) values (
    p_event_id, v_user_id, v_username, v_role, p_action_type, p_module_name, p_description, p_target_id
  ) on conflict (event_id) do nothing;
end;
$$;

revoke all on function public.write_audit_log(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.write_audit_log(uuid, uuid, text, text, text, text) to authenticated;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'organizations'
  loop
    execute format('drop policy %I on public.organizations', policy_row.policyname);
  end loop;
end;
$$;

drop function if exists public.current_app_organization_id();

drop table if exists public.organizations;

commit;
