-- Einmalig im Supabase SQL Editor ausführen.
create table if not exists public.fcn_predictions (
  match_id bigint primary key references public.fcn_matches(id) on delete cascade,
  home_score integer not null check (home_score between 0 and 30),
  away_score integer not null check (away_score between 0 and 30),
  updated_at timestamptz not null default now()
);
alter table public.fcn_predictions enable row level security;
-- Kein öffentlicher Schreibzugriff. Serverfunktion nutzt den Secret Key.
