begin;

alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.drugs enable row level security;
alter table public.notebook_sources enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_otps enable row level security;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_admin() from public;
grant usage on schema private to authenticated, service_role;
grant execute on function private.is_admin() to authenticated, service_role;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name) on table public.profiles to authenticated;

revoke all on table public.admin_users from anon, authenticated;
grant select on table public.admin_users to authenticated;

revoke all on table public.drugs from anon, authenticated;
grant select, insert, update, delete on table public.drugs to authenticated;

revoke all on table public.notebook_sources from anon, authenticated;
grant select, insert, update, delete on table public.notebook_sources to authenticated;

revoke all on table public.user_profiles from anon, authenticated;
revoke all on table public.user_otps from anon, authenticated;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists admin_users_select_own on public.admin_users;
create policy admin_users_select_own
  on public.admin_users
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists drugs_select_authenticated on public.drugs;
create policy drugs_select_authenticated
  on public.drugs
  for select
  to authenticated
  using (true);

drop policy if exists drugs_insert_admin on public.drugs;
create policy drugs_insert_admin
  on public.drugs
  for insert
  to authenticated
  with check ((select private.is_admin()));

drop policy if exists drugs_update_admin on public.drugs;
create policy drugs_update_admin
  on public.drugs
  for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists drugs_delete_admin on public.drugs;
create policy drugs_delete_admin
  on public.drugs
  for delete
  to authenticated
  using ((select private.is_admin()));

drop policy if exists notebook_sources_select_admin on public.notebook_sources;
create policy notebook_sources_select_admin
  on public.notebook_sources
  for select
  to authenticated
  using ((select private.is_admin()));

drop policy if exists notebook_sources_insert_admin on public.notebook_sources;
create policy notebook_sources_insert_admin
  on public.notebook_sources
  for insert
  to authenticated
  with check ((select private.is_admin()));

drop policy if exists notebook_sources_update_admin on public.notebook_sources;
create policy notebook_sources_update_admin
  on public.notebook_sources
  for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists notebook_sources_delete_admin on public.notebook_sources;
create policy notebook_sources_delete_admin
  on public.notebook_sources
  for delete
  to authenticated
  using ((select private.is_admin()));

commit;
