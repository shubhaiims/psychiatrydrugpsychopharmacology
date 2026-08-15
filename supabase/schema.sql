-- Legacy storage baseline retained for reference.
-- For a new or existing project, apply supabase/migrations/*.sql in filename order.

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

create table if not exists public.notebook_sources (
  id text primary key,
  title text not null,
  file_name text,
  content_type text,
  word_count integer not null default 0,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notebook_sources_title_idx on public.notebook_sources (title);
create index if not exists notebook_sources_updated_at_idx on public.notebook_sources (updated_at);

alter table public.notebook_sources enable row level security;

comment on table public.notebook_sources is
  'Admin-managed NotebookLM-style searchable source payloads for the dashboard.';
