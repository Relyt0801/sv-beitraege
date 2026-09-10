-- ============================================================
-- Stufenkasse – Profile: Anzeigename, Initialen, Namensfarbe
-- + Antrag auf Komitee-Wechsel
-- Reihenfolge: NACH erweiterungen.sql. Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Anzeige-Profil: das Wenige, das alle voneinander sehen dürfen
--    (Name steht ohnehin schon an jeder Nachricht)
-- ------------------------------------------------------------
create table if not exists public.public_profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  anzeigename text not null default '',
  initialen   text not null default '',
  farbe       text not null default 'indigo',
  updated_at  timestamptz not null default now()
);
alter table public.public_profiles enable row level security;

drop policy if exists "pprofile select" on public.public_profiles;
create policy "pprofile select" on public.public_profiles for select to authenticated
  using ( public.has_consented() );

drop policy if exists "pprofile self" on public.public_profiles;
create policy "pprofile self" on public.public_profiles for all to authenticated
  using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );

drop policy if exists "pprofile staff" on public.public_profiles;
create policy "pprofile staff" on public.public_profiles for all to authenticated
  using ( public.has_perm('roles.manage') ) with check ( public.has_perm('roles.manage') );

do $$ begin
  alter publication supabase_realtime add table public.public_profiles;
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 2) Antrag auf Komitee-Wechsel (läuft wie die Entbannungsanfrage)
-- ------------------------------------------------------------
create table if not exists public.komitee_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  wunsch_tag text not null,
  nachricht  text not null default '',
  status     text not null default 'offen' check (status in ('offen','angenommen','abgelehnt')),
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz
);
create unique index if not exists komreq_one_open on public.komitee_requests(user_id) where status = 'offen';
alter table public.komitee_requests enable row level security;

drop policy if exists "komreq select" on public.komitee_requests;
create policy "komreq select" on public.komitee_requests for select to authenticated
  using ( user_id = auth.uid() or public.has_perm('komitees.assign') );

drop policy if exists "komreq insert" on public.komitee_requests;
create policy "komreq insert" on public.komitee_requests for insert to authenticated
  with check ( user_id = auth.uid() and public.has_consented() );

drop policy if exists "komreq decide" on public.komitee_requests;
create policy "komreq decide" on public.komitee_requests for update to authenticated
  using ( public.has_perm('komitees.assign') ) with check ( public.has_perm('komitees.assign') );

do $$ begin
  alter publication supabase_realtime add table public.komitee_requests;
exception when duplicate_object then null; end $$;
