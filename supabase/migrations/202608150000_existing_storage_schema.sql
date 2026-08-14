begin;

create table if not exists public.drugs (
  id text primary key,
  name text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists drugs_name_idx on public.drugs (name);

create table if not exists public.user_profiles (
  id text primary key,
  phone text not null unique,
  name text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists user_profiles_phone_idx on public.user_profiles (phone);

create table if not exists public.user_otps (
  phone text primary key,
  otp_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  profile_payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists user_otps_expires_at_idx on public.user_otps (expires_at);

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

alter table public.drugs enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_otps enable row level security;
alter table public.notebook_sources enable row level security;

commit;
