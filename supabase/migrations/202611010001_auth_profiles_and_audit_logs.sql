create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  role text not null check (role in ('admin', 'ke_toan', 'kho_to_dan')),
  created_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.user_profiles
  where user_id = (select auth.uid())
$$;

revoke all on function public.current_app_role() from public;
grant execute on function public.current_app_role() to authenticated;

drop policy if exists "Users can read their own profile" on public.user_profiles;
create policy "Users can read their own profile"
  on public.user_profiles for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Admins can read all profiles" on public.user_profiles;
create policy "Admins can read all profiles"
  on public.user_profiles for select to authenticated
  using ((select public.current_app_role()) = 'admin');

drop policy if exists "Admins can insert profiles" on public.user_profiles;
create policy "Admins can insert profiles"
  on public.user_profiles for insert to authenticated
  with check ((select public.current_app_role()) = 'admin');

drop policy if exists "Admins can update profiles" on public.user_profiles;
create policy "Admins can update profiles"
  on public.user_profiles for update to authenticated
  using ((select public.current_app_role()) = 'admin')
  with check ((select public.current_app_role()) = 'admin');

drop policy if exists "Admins can delete profiles" on public.user_profiles;
create policy "Admins can delete profiles"
  on public.user_profiles for delete to authenticated
  using ((select public.current_app_role()) = 'admin');

grant select on public.user_profiles to authenticated;
grant insert, update, delete on public.user_profiles to authenticated;

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  event_id uuid not null unique,
  actor_user_id uuid not null references auth.users (id),
  username text not null,
  role text not null check (role in ('admin', 'ke_toan', 'kho_to_dan')),
  action_type text not null check (action_type in ('CREATE', 'UPDATE', 'DELETE')),
  module_name text not null,
  description text not null,
  target_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_actor_user_id_idx on public.audit_logs (actor_user_id);

alter table public.audit_logs enable row level security;

drop policy if exists "Admins can read audit logs" on public.audit_logs;
create policy "Admins can read audit logs"
  on public.audit_logs for select to authenticated
  using ((select public.current_app_role()) = 'admin');

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
  v_user_id uuid := auth.uid();
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

  select username, role into v_username, v_role
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

revoke all on function public.write_audit_log(uuid, uuid, text, text, text, text) from public;
grant execute on function public.write_audit_log(uuid, uuid, text, text, text, text) to authenticated;
