alter table public.user_profiles
  add column if not exists email text,
  add column if not exists auth_created_at timestamptz,
  add column if not exists account_status text not null default 'active';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_account_status_check'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_account_status_check
      check (account_status in ('active', 'pending_verification', 'suspended'));
  end if;
end;
$$;

update public.user_profiles as profile
set
  email = auth_user.email,
  auth_created_at = auth_user.created_at,
  account_status = case
    when auth_user.banned_until is not null and auth_user.banned_until > now() then 'suspended'
    when auth_user.email_confirmed_at is null then 'pending_verification'
    else 'active'
  end
from auth.users as auth_user
where auth_user.id = profile.user_id;

create or replace function public.sync_auth_user_to_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.user_profiles
  set
    email = new.email,
    auth_created_at = new.created_at,
    account_status = case
      when new.banned_until is not null and new.banned_until > now() then 'suspended'
      when new.email_confirmed_at is null then 'pending_verification'
      else 'active'
    end
  where user_id = new.id;
  return new;
end;
$$;

revoke all on function public.sync_auth_user_to_profile() from public, anon, authenticated;

drop trigger if exists sync_auth_user_to_profile on auth.users;
create trigger sync_auth_user_to_profile
  after insert or update of email, email_confirmed_at, banned_until, created_at on auth.users
  for each row execute function public.sync_auth_user_to_profile();

create or replace function public.sync_profile_auth_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  auth_email text;
  auth_created_at timestamptz;
  auth_account_status text;
begin
  select
    auth_user.email,
    auth_user.created_at,
    case
      when auth_user.banned_until is not null and auth_user.banned_until > now() then 'suspended'
      when auth_user.email_confirmed_at is null then 'pending_verification'
      else 'active'
    end
  into auth_email, auth_created_at, auth_account_status
  from auth.users as auth_user
  where auth_user.id = new.user_id;

  if not found then
    raise exception 'Auth user not found for profile %', new.user_id;
  end if;

  new.email := auth_email;
  new.auth_created_at := auth_created_at;
  new.account_status := auth_account_status;
  return new;
end;
$$;

revoke all on function public.sync_profile_auth_fields() from public, anon, authenticated;

drop trigger if exists sync_profile_auth_fields on public.user_profiles;
create trigger sync_profile_auth_fields
  before insert or update of user_id on public.user_profiles
  for each row execute function public.sync_profile_auth_fields();
