begin;

do $$
declare
  function_signature regprocedure;
  policy_row record;
begin
  for function_signature in
    select procedure.oid::regprocedure
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'write_audit_log'
  loop
    execute format('drop function %s', function_signature);
  end loop;

  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
  loop
    execute format('drop policy %I on public.audit_logs', policy_row.policyname);
  end loop;
end;
$$;

alter table public.audit_logs
  drop column if exists organization_id cascade;

alter table public.audit_logs enable row level security;

create policy "Admins can read audit logs"
  on public.audit_logs for select to authenticated
  using ((select public.current_app_role()) = 'admin');

grant select on public.audit_logs to authenticated;

create function public.write_audit_log(
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
    event_id,
    actor_user_id,
    username,
    role,
    action_type,
    module_name,
    description,
    target_id
  ) values (
    p_event_id,
    v_user_id,
    v_username,
    v_role,
    p_action_type,
    p_module_name,
    p_description,
    p_target_id
  )
  on conflict (event_id) do nothing;
end;
$$;

revoke all on function public.write_audit_log(uuid, uuid, text, text, text, text)
  from public, anon;
grant execute on function public.write_audit_log(uuid, uuid, text, text, text, text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
