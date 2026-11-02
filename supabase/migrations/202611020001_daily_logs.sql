create table if not exists public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  action_type text not null check (
    action_type in (
      'CREATE_IMPORT',
      'CREATE_EXPORT',
      'CREATE_RECEIPT',
      'CREATE_PAYMENT',
      'CUSTOM_NOTE'
    )
  ),
  title text not null,
  description text,
  reference_id uuid,
  created_at timestamptz default now()
);

alter table public.daily_logs enable row level security;

drop policy if exists "Authenticated users can read daily logs" on public.daily_logs;
create policy "Authenticated users can read daily logs"
  on public.daily_logs for select to authenticated
  using (true);

drop policy if exists "Authenticated users can insert daily logs" on public.daily_logs;
create policy "Authenticated users can insert daily logs"
  on public.daily_logs for insert to authenticated
  with check (true);

grant select, insert on public.daily_logs to authenticated;
