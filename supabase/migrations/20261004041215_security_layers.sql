begin;
create schema if not exists private;
create table private.security_limits (
  key text primary key,
  requests integer not null,
  expires_at timestamptz not null
);
create index security_limits_expiry_idx on private.security_limits(expires_at);
alter table private.security_limits enable row level security;
revoke all on private.security_limits from public, anon, authenticated;

create function public.consume_security_limit(p_key text, p_limit integer, p_seconds integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_until timestamptz; v_now timestamptz := clock_timestamp();
begin
  if p_key !~ '^[a-f0-9]{64}$' or p_limit < 1 or p_limit > 10000 or p_seconds < 1 or p_seconds > 86400 then
    raise exception 'Invalid security limit';
  end if;
  insert into private.security_limits as b (key, requests, expires_at)
  values (p_key, 1, v_now + make_interval(secs => p_seconds))
  on conflict (key) do update set
    requests = case when b.expires_at <= v_now then 1 else least(b.requests + 1, p_limit + 1) end,
    expires_at = case when b.expires_at <= v_now then v_now + make_interval(secs => p_seconds) else b.expires_at end
  returning requests, expires_at into v_count, v_until;
  delete from private.security_limits where key in (
    select key from private.security_limits where expires_at < v_now limit 100
  );
  return jsonb_build_object('allowed', v_count <= p_limit, 'retry_after', greatest(1, ceil(extract(epoch from v_until - v_now))));
end;
$$;
revoke all on function public.consume_security_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_security_limit(text, integer, integer) to service_role;

-- All library access goes through the server's membership/admin checks.
revoke all on public.drugs, public.notebook_sources from anon, authenticated;
grant select, insert, update, delete on public.drugs, public.notebook_sources to service_role;

create table private.security_audit (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  table_name text not null,
  operation text not null,
  record_id text,
  actor_id uuid
);
alter table private.security_audit enable row level security;
revoke all on private.security_audit from public, anon, authenticated;
create index security_audit_time_idx on private.security_audit(occurred_at);

create function private.audit_security_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row jsonb;
begin
  v_row := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  insert into private.security_audit(table_name, operation, record_id, actor_id)
  values (TG_TABLE_NAME, TG_OP, coalesce(v_row->>'id', v_row->>'order_id', v_row->>'user_id'), auth.uid());
  return coalesce(NEW, OLD);
end;
$$;
revoke all on function private.audit_security_change() from public, anon, authenticated;
create trigger security_audit after insert or update or delete on public.drugs for each row execute function private.audit_security_change();
create trigger security_audit after insert or update or delete on public.notebook_sources for each row execute function private.audit_security_change();
create trigger security_audit after insert or update or delete on public.admin_users for each row execute function private.audit_security_change();
create trigger security_audit after insert or update or delete on public.payments for each row execute function private.audit_security_change();
create trigger security_audit after insert or update or delete on public.memberships for each row execute function private.audit_security_change();
commit;
