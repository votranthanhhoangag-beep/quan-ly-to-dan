-- 1. Xóa bảng tạm cũ nếu tồn tại
drop table if exists public.temp_legacy_app_data_stores cascade;

-- 2. Kiểm tra và lưu dữ liệu cũ an toàn
do $$
begin
  if to_regclass('public.app_data_stores') is not null then
    create table public.temp_legacy_app_data_stores as
    select user_id, key, data, updated_at
    from public.app_data_stores;
  else
    create table public.temp_legacy_app_data_stores (
      user_id uuid,
      key text,
      data jsonb,
      updated_at timestamptz
    );
  end if;
end;
$$;

-- 3. Xóa bảng chính cũ và tạo lại cấu trúc mới chuẩn xác
drop table if exists public.app_data_stores cascade;

create table public.app_data_stores (
  user_id uuid references auth.users (id) on delete cascade not null,
  key text not null,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- 4. Chuyển dữ liệu từ bảng phụ sang bảng chính mới
insert into public.app_data_stores (user_id, key, data, updated_at)
select distinct on (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), key)
  coalesce(user_id, auth.uid()) as user_id,
  key,
  data,
  updated_at
from public.temp_legacy_app_data_stores
where user_id is not null or auth.uid() is not null
on conflict (user_id, key) do update
set data = excluded.data,
    updated_at = excluded.updated_at;

-- 5. Dọn dẹp bảng phụ
drop table if exists public.temp_legacy_app_data_stores cascade;

-- 6. Thiết lập RLS và chính sách bảo mật
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

create policy "Users can access their own data stores"
  on public.app_data_stores for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.app_data_stores from anon, authenticated;
grant select, insert, update, delete on public.app_data_stores to authenticated;