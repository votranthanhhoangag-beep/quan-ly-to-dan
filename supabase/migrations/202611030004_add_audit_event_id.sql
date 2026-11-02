begin;

alter table public.audit_logs
  add column if not exists event_id uuid;

with duplicate_event_ids as (
  select
    ctid,
    row_number() over (partition by event_id order by ctid) as duplicate_number
  from public.audit_logs
  where event_id is not null
)
update public.audit_logs as audit_log
set event_id = gen_random_uuid()
from duplicate_event_ids
where audit_log.ctid = duplicate_event_ids.ctid
  and duplicate_event_ids.duplicate_number > 1;

update public.audit_logs
set event_id = gen_random_uuid()
where event_id is null;

alter table public.audit_logs
  alter column event_id set default gen_random_uuid(),
  alter column event_id set not null;

create unique index if not exists audit_logs_event_id_key
  on public.audit_logs (event_id);

notify pgrst, 'reload schema';

commit;
