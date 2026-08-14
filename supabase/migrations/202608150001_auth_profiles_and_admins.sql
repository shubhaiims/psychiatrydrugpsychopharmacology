begin;

create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_email_idx
  on public.profiles (lower(email))
  where email is not null;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create or replace function private.profile_name(user_email text, metadata jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when char_length(coalesce(nullif(btrim(metadata ->> 'full_name'), ''), split_part(coalesce(user_email, ''), '@', 1))) between 2 and 120
      then coalesce(nullif(btrim(metadata ->> 'full_name'), ''), split_part(user_email, '@', 1))
    else 'User'
  end;
$$;

create or replace function private.handle_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and (
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '') is null
    or char_length(btrim(new.raw_user_meta_data ->> 'full_name')) not between 2 and 120
  ) then
    raise exception 'full_name is required for registration';
  end if;

  insert into public.profiles (id, email, full_name, created_at, updated_at)
  values (
    new.id,
    new.email,
    private.profile_name(new.email, new.raw_user_meta_data),
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        updated_at = now();
  return new;
end;
$$;

revoke all on function private.profile_name(text, jsonb) from public;
revoke all on function private.handle_auth_user_profile() from public;

drop trigger if exists on_auth_user_profile_changed on auth.users;
create trigger on_auth_user_profile_changed
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function private.handle_auth_user_profile();

insert into public.profiles (id, email, full_name, created_at, updated_at)
select
  users.id,
  users.email,
  private.profile_name(users.email, users.raw_user_meta_data),
  users.created_at,
  now()
from auth.users as users
on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      updated_at = now();

comment on table public.profiles is
  'Supabase Auth user profiles. Authorization roles are never stored in user-editable metadata.';

comment on table public.admin_users is
  'Server-managed admin allowlist keyed by auth.users.id. No client-facing insert or update policy is permitted.';

comment on table public.user_profiles is
  'Deprecated phone OTP profiles retained temporarily for rollback and audit. The application no longer uses this table.';

comment on table public.user_otps is
  'Deprecated phone OTP challenges retained temporarily. The application no longer creates or verifies these records.';

commit;
