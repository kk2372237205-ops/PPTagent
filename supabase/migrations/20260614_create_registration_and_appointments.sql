create extension if not exists pgcrypto;

create table if not exists public.registered_users (
  id uuid primary key default gen_random_uuid(),
  local_user_id text not null unique,
  phone text not null unique check (phone ~ '^1[0-9]{10}$'),
  source text not null default 'wzlcf_web',
  registered_at timestamptz not null default now(),
  last_login_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  local_consultation_id text not null unique,
  registration_id uuid not null references public.registered_users(id) on delete cascade,
  phone text not null check (phone ~ '^1[0-9]{10}$'),
  budget text not null,
  status text not null default 'pending',
  form_data jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists appointments_registration_id_idx
  on public.appointments(registration_id);

create index if not exists appointments_status_submitted_at_idx
  on public.appointments(status, submitted_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists registered_users_set_updated_at on public.registered_users;
create trigger registered_users_set_updated_at
before update on public.registered_users
for each row execute function public.set_updated_at();

drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at
before update on public.appointments
for each row execute function public.set_updated_at();

alter table public.registered_users enable row level security;
alter table public.appointments enable row level security;

comment on table public.registered_users is
  'WZLCF verified customer registration records, written by the backend PostgreSQL connection.';

comment on table public.appointments is
  'WZLCF appointment and consultation form records, written by the backend PostgreSQL connection.';
