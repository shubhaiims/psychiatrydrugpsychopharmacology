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

create table if not exists public.user_profiles (
  id text primary key,
  phone text not null unique,
  name text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists user_profiles_phone_idx on public.user_profiles (phone);

alter table public.user_profiles enable row level security;

comment on table public.user_profiles is
  'Verified public user profiles for dashboard access. The Vercel API reads and writes with a backend-only Supabase key.';

create table if not exists public.user_otps (
  phone text primary key,
  otp_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  profile_payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists user_otps_expires_at_idx on public.user_otps (expires_at);

alter table public.user_otps enable row level security;

comment on table public.user_otps is
  'Short-lived OTP login challenges. Store only OTP hashes, never plaintext OTPs.';
