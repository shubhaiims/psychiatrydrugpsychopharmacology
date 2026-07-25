create table if not exists public.drugs (
  id text primary key,
  name text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists drugs_name_idx on public.drugs (name);

alter table public.drugs enable row level security;

comment on table public.drugs is
  'PsychRx drug records. The Vercel API reads and writes with a backend-only Supabase key.';

