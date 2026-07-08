-- ============================================================
-- Stufenkasse – Supabase Schema
-- Ausführen im Supabase-Dashboard -> SQL Editor -> New query -> Run
-- ============================================================

-- Schüler (Halbjahre als JSONB, Beteiligungen als Gesamtzahl)
create table if not exists public.students (
  id             uuid primary key default gen_random_uuid(),
  nachname       text not null,
  vorname        text not null default '',
  beigetreten_ab text not null default 'EF.1',
  verlaesst_ab   text,
  beteiligungen  int  not null default 0,
  terms          jsonb not null default '{
    "EF.1":{"status":"offen"},
    "EF.2":{"status":"offen"},
    "Q1.1":{"status":"offen"},
    "Q1.2":{"status":"offen"},
    "Q2.1":{"status":"offen"},
    "Q2.2":{"status":"offen"}
  }'::jsonb,
  updated_at     timestamptz not null default now()
);
-- Falls die Tabelle schon existiert (aus einer früheren Version):
alter table public.students add column if not exists beteiligungen int not null default 0;

-- Geteilte Einstellungen (genau eine Zeile, id = 1)
create table if not exists public.app_settings (
  id                 int primary key default 1,
  aktuelles_halbjahr text not null default 'EF.1',
  schwelle           int  not null default 3,   -- benötigte Beteiligungen bis Q2.2
  zusatzbetrag       int  not null default 25
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;
alter table public.app_settings add column if not exists zusatzbetrag int not null default 25;

-- ---- Realtime ----
alter publication supabase_realtime add table public.students;
alter publication supabase_realtime add table public.app_settings;

-- ============================================================
-- Row Level Security: nur eingeloggte Nutzer dürfen lesen/schreiben
-- ============================================================
alter table public.students     enable row level security;
alter table public.app_settings enable row level security;

create policy "auth read students"   on public.students     for select to authenticated using (true);
create policy "auth write students"  on public.students     for all    to authenticated using (true) with check (true);
create policy "auth read settings"   on public.app_settings for select to authenticated using (true);
create policy "auth write settings"  on public.app_settings for all    to authenticated using (true) with check (true);
