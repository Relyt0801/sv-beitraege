-- ============================================================
-- Nachtrag: was in der Datenbank fehlt, aber im Code schon benutzt wird
-- ============================================================
-- Diese Datei ist idempotent - sie darf beliebig oft laufen. Sie ist nach
-- supabase/pruefen.sql gedacht und repariert genau das, was dort auffaellt.
--
-- Im Supabase-Dashboard: SQL Editor -> Inhalt einfuegen -> Run.

-- ------------------------------------------------------------
-- 1) Der Zustimmungs-Bildschirm ist weg, die Pruefung muss mit
-- ------------------------------------------------------------
-- has_consented() bewacht students, profiles, contributions, can_see_event,
-- can_access_topic und public_profiles. Die alte Fassung verlangt
-- profiles.terms_accepted_at - eine Spalte, die seit dem Entfernen des
-- Zustimmungs-Bildschirms niemand mehr setzt. Steht sie noch in der
-- Datenbank, liefert jede Abfrage eine leere Liste zurueck. Kein Fehler,
-- keine Meldung, nur nichts. Genau so verschwinden "alle Nachrichten".
create or replace function public.has_consented()
returns boolean language sql stable security definer set search_path = public as $$
  select true
$$;

-- ------------------------------------------------------------
-- 2) eltern_tickets: die drei Spalten, die die App voraussetzt
-- ------------------------------------------------------------
-- src/eltern-store.tsx schreibt beim Anschreiben von Eltern von_team = true
-- und merkt sich in gelesen_team / gelesen_eltern, wer den Verlauf zuletzt
-- gesehen hat. Keine dieser Spalten wurde je angelegt. Ergebnis: das
-- Stufenteam kann Eltern nicht anschreiben (PostgREST meldet PGRST204) und
-- der Ungelesen-Punkt geht nie wieder aus.
alter table public.eltern_tickets add column if not exists von_team       boolean not null default false;
alter table public.eltern_tickets add column if not exists gelesen_team   timestamptz;
alter table public.eltern_tickets add column if not exists gelesen_eltern timestamptz;

comment on column public.eltern_tickets.von_team is
  'true = das Stufenteam hat das Gespraech begonnen, nicht die Eltern.';
comment on column public.eltern_tickets.gelesen_team is
  'Wann das Stufenteam zuletzt reingeschaut hat. Steuert den Ungelesen-Punkt.';
comment on column public.eltern_tickets.gelesen_eltern is
  'Dasselbe fuer die Elternseite.';

-- ------------------------------------------------------------
-- 3) Gelesen-Markierungen im Chat live halten
-- ------------------------------------------------------------
-- topic_reads war als einzige Chat-Tabelle nicht in der Realtime-Publikation.
-- Folge: wer am Handy liest, sieht am Laptop weiter den roten Punkt.
do $$ begin
  alter publication supabase_realtime add table public.topic_reads;
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 4) Indizes fuer die Abfragen, die bei vielen Leuten teuer werden
-- ------------------------------------------------------------
-- Ohne diese Indizes liest Postgres bei jeder Chat-Ansicht und bei jeder
-- Realtime-Pruefung die ganze Tabelle. Bei 300 Personen faellt das auf.
create index if not exists topic_items_topic_zeit_idx on public.topic_items (topic_id, created_at desc);
create index if not exists topic_items_zeit_idx       on public.topic_items (created_at desc);
create index if not exists poll_votes_event_idx       on public.poll_votes (event_id);
create index if not exists poll_votes_user_idx        on public.poll_votes (user_id);
create index if not exists topic_members_user_idx     on public.topic_members (user_id);
create index if not exists tag_members_user_idx       on public.tag_members (user_id);
create index if not exists topic_reads_user_idx       on public.topic_reads (user_id);
create index if not exists event_reads_user_idx       on public.event_reads (user_id);
create index if not exists contributions_student_idx  on public.contributions (student_id);
create index if not exists profiles_student_idx       on public.profiles (student_id);

-- Termine nur anfassen, wenn es sie gibt (termine.sql kann noch fehlen).
do $$ begin
  if to_regclass('public.termin_personen') is not null then
    create index if not exists termin_personen_student_idx on public.termin_personen (student_id);
  end if;
  if to_regclass('public.termin_komitees') is not null then
    create index if not exists termin_komitees_tag_idx on public.termin_komitees (tag);
  end if;
end $$;

-- ------------------------------------------------------------
-- 5) Loeschungen vollstaendig melden
-- ------------------------------------------------------------
-- Ohne "replica identity full" enthaelt eine geloeschte Zeile in der
-- Live-Meldung nur den Schluessel. Die App kann dann nicht pruefen, ob die
-- Loeschung sie ueberhaupt betrifft - und Sichtbarkeitsregeln greifen beim
-- Loeschen gar nicht.
do $$
declare t text;
begin
  foreach t in array array[
    'topic_items','topic_reads','poll_votes','event_reads',
    'tag_members','topic_members','contributions'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I replica identity full', t);
    end if;
  end loop;
end $$;
