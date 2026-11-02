create table if not exists public.organizations (
  id uuid primary key,
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

insert into public.organizations (id, name, slug)
values ('00000000-0000-4000-8000-000000000001', 'Công ty hiện tại', 'default')
on conflict (id) do nothing;

alter table public.user_profiles
  add column if not exists organization_id uuid;

update public.user_profiles
set organization_id = '00000000-0000-4000-8000-000000000001'
where organization_id is null;

alter table public.user_profiles
  alter column organization_id drop default;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_organization_id_fkey'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_organization_id_fkey
      foreign key (organization_id) references public.organizations (id);
  end if;
end;
$$;

create table if not exists public.app_data_stores (
  organization_id uuid not null default '00000000-0000-4000-8000-000000000001'
    references public.organizations (id),
  key text not null,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (organization_id, key)
);

alter table public.app_data_stores
  add column if not exists organization_id uuid;

update public.app_data_stores
set organization_id = '00000000-0000-4000-8000-000000000001'
where organization_id is null;

alter table public.app_data_stores
  alter column organization_id set default '00000000-0000-4000-8000-000000000001',
  alter column organization_id set not null;

do $$
declare
  primary_key_name text;
begin
  select constraint_row.conname
  into primary_key_name
  from pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.app_data_stores'::regclass
    and constraint_row.contype = 'p';

  if primary_key_name is not null then
    execute format('alter table public.app_data_stores drop constraint %I', primary_key_name);
  end if;

  alter table public.app_data_stores
    add constraint app_data_stores_pkey primary key (organization_id, key);
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_data_stores_organization_id_fkey'
      and conrelid = 'public.app_data_stores'::regclass
  ) then
    alter table public.app_data_stores
      add constraint app_data_stores_organization_id_fkey
      foreign key (organization_id) references public.organizations (id);
  end if;
end;
$$;

create or replace function public.current_app_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id
  from public.user_profiles
  where user_id = (select auth.uid())
$$;

revoke all on function public.current_app_organization_id() from public;
grant execute on function public.current_app_organization_id() to authenticated;

alter table public.organizations enable row level security;
drop policy if exists "Members can read their organization" on public.organizations;
create policy "Members can read their organization"
  on public.organizations for select to authenticated
  using (id = (select public.current_app_organization_id()));
revoke all on public.organizations from anon, authenticated;
grant select on public.organizations to authenticated;

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
create policy "Admins can read organization profiles"
  on public.user_profiles for select to authenticated
  using (
    organization_id = (select public.current_app_organization_id())
    and (select public.current_app_role()) = 'admin'
  );

create policy "Admins can insert organization profiles"
  on public.user_profiles for insert to authenticated
  with check (
    organization_id = (select public.current_app_organization_id())
    and (select public.current_app_role()) = 'admin'
  );

create policy "Admins can update organization profiles"
  on public.user_profiles for update to authenticated
  using (
    (
      organization_id = (select public.current_app_organization_id())
      or organization_id is null
    )
    and (select public.current_app_role()) = 'admin'
  )
  with check (
    organization_id = (select public.current_app_organization_id())
    and (select public.current_app_role()) = 'admin'
  );

create policy "Admins can delete organization profiles"
  on public.user_profiles for delete to authenticated
  using (
    organization_id = (select public.current_app_organization_id())
    and (select public.current_app_role()) = 'admin'
  );

alter table public.app_data_stores enable row level security;
do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'app_data_stores'
  loop
    execute format('drop policy %I on public.app_data_stores', policy_row.policyname);
  end loop;
end;
$$;
create policy "Users can access their organization data stores"
  on public.app_data_stores for all to authenticated
  using (organization_id = (select public.current_app_organization_id()))
  with check (organization_id = (select public.current_app_organization_id()));

revoke all on public.app_data_stores from anon, authenticated;
grant select, insert, update on public.app_data_stores to authenticated;

alter table public.daily_logs
  add column if not exists organization_id uuid,
  add column if not exists user_id uuid references auth.users (id);

update public.daily_logs as daily_log
set
  user_id = profile.user_id,
  organization_id = profile.organization_id
from public.user_profiles as profile
where daily_log.user_id is null
  and lower(daily_log.user_email) = lower(profile.email);

update public.daily_logs
set organization_id = '00000000-0000-4000-8000-000000000001'
where organization_id is null;

alter table public.daily_logs
  alter column organization_id set default '00000000-0000-4000-8000-000000000001',
  alter column organization_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'daily_logs_organization_id_fkey'
      and conrelid = 'public.daily_logs'::regclass
  ) then
    alter table public.daily_logs
      add constraint daily_logs_organization_id_fkey
      foreign key (organization_id) references public.organizations (id);
  end if;
end;
$$;

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
create policy "Users can access their organization daily logs"
  on public.daily_logs for all to authenticated
  using (organization_id = (select public.current_app_organization_id()))
  with check (
    organization_id = (select public.current_app_organization_id())
    and user_id = (select auth.uid())
  );
revoke all on public.daily_logs from anon, authenticated;
grant select, insert on public.daily_logs to authenticated;

alter table public.audit_logs
  add column if not exists organization_id uuid;

update public.audit_logs as audit_log
set organization_id = profile.organization_id
from public.user_profiles as profile
where audit_log.organization_id is null
  and audit_log.actor_user_id::uuid = profile.user_id;

update public.audit_logs
set organization_id = '00000000-0000-4000-8000-000000000001'
where organization_id is null;

alter table public.audit_logs
  alter column organization_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'audit_logs_organization_id_fkey'
      and conrelid = 'public.audit_logs'::regclass
  ) then
    alter table public.audit_logs
      add constraint audit_logs_organization_id_fkey
      foreign key (organization_id) references public.organizations (id);
  end if;
end;
$$;

create index if not exists audit_logs_organization_created_at_idx
  on public.audit_logs (organization_id, created_at desc);

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
create policy "Admins can read organization audit logs"
  on public.audit_logs for select to authenticated
  using (
    organization_id = (select public.current_app_organization_id())
    and (select public.current_app_role()) = 'admin'
  );
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

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
  v_organization_id uuid;
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

  select username, role, organization_id
  into v_username, v_role, v_organization_id
  from public.user_profiles
  where user_id = v_user_id;

  if v_role is null or v_organization_id is null then
    raise exception 'User profile or organization not found';
  end if;

  insert into public.audit_logs (
    event_id, actor_user_id, organization_id, username, role,
    action_type, module_name, description, target_id
  ) values (
    p_event_id, v_user_id, v_organization_id, v_username, v_role,
    p_action_type, p_module_name, p_description, p_target_id
  ) on conflict (event_id) do nothing;
end;
$$;