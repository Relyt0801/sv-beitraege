-- ============================================================
-- Stufenkasse – Beitragspunkte + Chats/Tickets
-- Reihenfolge: NACH permissions.sql ausführen. Idempotent (mehrfach ausführbar).
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1) Beitragspunkte: einzelne Einträge statt einer nackten Zahl
-- ------------------------------------------------------------
create table if not exists public.contributions (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  titel       text not null,
  punkte      integer not null default 1,
  datum       date not null default current_date,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists contributions_student_idx on public.contributions(student_id);
alter table public.contributions enable row level security;

-- Sehen: eigene Einträge; alle sehen, wer Daten bearbeiten darf oder im Team ist
drop policy if exists "contrib select" on public.contributions;
create policy "contrib select" on public.contributions for select to authenticated
  using (
    public.has_consented() and (
      public.my_role() in ('stufenteam','kassenwart','admin')
      or public.has_perm('data.edit')
      or student_id = (select student_id from public.profiles where user_id = auth.uid())
    )
  );

-- Anlegen/Ändern/Löschen: nur mit Recht "data.edit" (Stufenteam, Kassenwart, Admin)
drop policy if exists "contrib write" on public.contributions;
create policy "contrib write" on public.contributions for all to authenticated
  using ( public.has_perm('data.edit') )
  with check ( public.has_perm('data.edit') );

-- Zielpunktzahl, die jede Person bis zum Ende erreichen muss
alter table public.app_settings add column if not exists ziel_punkte integer not null default 30;

do $$ begin
  alter publication supabase_realtime add table public.contributions;
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 2) Chats & Tickets bauen auf den vorhandenen Ordnern auf
--    kind: 'ordner' (wie bisher) | 'chat' (Komitee-Chat) | 'ticket' (Frage ans Stufenteam)
-- ------------------------------------------------------------
alter table public.topics add column if not exists kind text not null default 'ordner';
alter table public.topics add column if not exists status text not null default 'offen';

-- Jede Person darf ein Ticket eröffnen (und nur das – kind ist festgenagelt).
drop policy if exists "topics ticket create" on public.topics;
create policy "topics ticket create" on public.topics for insert to authenticated
  with check (
    kind = 'ticket'
    and created_by = auth.uid()
    and not admin_only
    and public.has_consented()
    and not public.is_banned()
  );

-- Eigenes Ticket schließen/wieder öffnen darf auch die Person selbst.
drop policy if exists "topics ticket own" on public.topics;
create policy "topics ticket own" on public.topics for update to authenticated
  using ( kind = 'ticket' and created_by = auth.uid() )
  with check ( kind = 'ticket' and created_by = auth.uid() );

do $$ begin
  alter publication supabase_realtime add table public.topics;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.topic_items;
exception when duplicate_object then null; end $$;
