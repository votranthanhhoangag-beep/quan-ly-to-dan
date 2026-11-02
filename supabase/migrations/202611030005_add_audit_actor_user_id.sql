begin;

alter table public.audit_logs
  add column if not exists actor_user_id uuid
  references auth.users (id) on delete set null;

create index if not exists audit_logs_actor_user_id_idx
  on public.audit_logs (actor_user_id);

notify pgrst, 'reload schema';

commit;
