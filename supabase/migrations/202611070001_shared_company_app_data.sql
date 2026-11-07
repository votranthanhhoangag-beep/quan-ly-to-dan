-- ==============================================================================
-- Migration: Chia sẻ chung 1 kho dữ liệu ERP cho tất cả tài khoản nội bộ (Admin, Kế toán, Kho)
-- ==============================================================================

-- 1. Đảm bảo bảng app_data_stores tồn tại với cấu trúc key duy nhất (dùng chung cho toàn hệ thống)
-- Đồng thời tương thích với dữ liệu cũ nếu đang có cột user_id
do $$
begin
  -- Nếu bảng chưa có, tạo bảng app_data_stores dùng chung theo 'key'
  if to_regclass('public.app_data_stores') is null then
    create table public.app_data_stores (
      key text primary key,
      data jsonb not null default '[]'::jsonb,
      updated_at timestamptz not null default now(),
      updated_by uuid references auth.users(id) on delete set null
    );
  else
    -- Nếu bảng đã tồn tại với composite primary key (user_id, key), ta chuyển đổi sang primary key (key)
    -- Giữ lại bản ghi mới nhất cho mỗi key
    create table if not exists public.temp_shared_app_data_stores as
    select distinct on (key)
      key,
      data,
      updated_at,
      user_id as updated_by
    from public.app_data_stores
    order by key, updated_at desc nulls last;

    drop table public.app_data_stores cascade;

    create table public.app_data_stores (
      key text primary key,
      data jsonb not null default '[]'::jsonb,
      updated_at timestamptz not null default now(),
      updated_by uuid references auth.users(id) on delete set null
    );

    insert into public.app_data_stores (key, data, updated_at, updated_by)
    select key, data, coalesce(updated_at, now()), updated_by
    from public.temp_shared_app_data_stores
    on conflict (key) do update
    set data = excluded.data,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

    drop table if exists public.temp_shared_app_data_stores cascade;
  end if;
end;
$$;

-- 2. Kích hoạt Row Level Security (RLS)
alter table public.app_data_stores enable row level security;

-- Xóa các policy cũ
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

-- 3. Tạo chính sách RLS: Mọi tài khoản nội bộ đã đăng nhập (authenticated) đều có quyền xem và cập nhật dữ liệu chung
create policy "Authenticated users can read all app data stores"
  on public.app_data_stores for select to authenticated
  using (true);

create policy "Authenticated users can insert all app data stores"
  on public.app_data_stores for insert to authenticated
  with check (true);

create policy "Authenticated users can update all app data stores"
  on public.app_data_stores for update to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete app data stores"
  on public.app_data_stores for delete to authenticated
  using (true);

-- 4. Cấp quyền thao tác cho authenticated role
revoke all on public.app_data_stores from anon;
grant select, insert, update, delete on public.app_data_stores to authenticated;

