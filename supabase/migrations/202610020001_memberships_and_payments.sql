-- Memberships paid through Razorpay. Review, then run once in the Supabase SQL Editor.
begin;

create table if not exists public.payments (
  order_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null,
  amount_paise integer not null check (amount_paise >= 100),
  currency text not null default 'INR',
  days integer not null check (days > 0),
  status text not null default 'created' check (status in ('created', 'paid')),
  payment_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists payments_user_created_idx
  on public.payments (user_id, created_at desc);

create table if not exists public.memberships (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan_id text not null,
  access_until timestamptz not null,
  updated_at timestamptz not null default now()
);

-- Server-only tables: no browser role can read or write them
alter table public.payments enable row level security;
alter table public.memberships enable row level security;
revoke all on table public.payments from anon, authenticated;
revoke all on table public.memberships from anon, authenticated;

-- Marks a payment paid exactly once and extends that user's access
create or replace function public.grant_membership(p_order_id text, p_payment_id text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_plan text;
  v_days integer;
  v_until timestamptz;
begin
  update public.payments
     set status = 'paid', payment_id = p_payment_id, paid_at = now()
   where order_id = p_order_id and status = 'created'
   returning user_id, plan_id, days into v_user, v_plan, v_days;

  if v_user is null then
    select m.access_until into v_until
      from public.payments p
      join public.memberships m on m.user_id = p.user_id
     where p.order_id = p_order_id;
    return v_until;
  end if;

  insert into public.memberships as m (user_id, plan_id, access_until, updated_at)
  values (v_user, v_plan, now() + make_interval(days => v_days), now())
  on conflict (user_id) do update
    set plan_id = excluded.plan_id,
        access_until = greatest(m.access_until, now()) + make_interval(days => v_days),
        updated_at = now()
  returning m.access_until into v_until;

  return v_until;
end;
$$;

revoke all on function public.grant_membership(text, text) from public, anon, authenticated;
grant execute on function public.grant_membership(text, text) to service_role;

commit;
