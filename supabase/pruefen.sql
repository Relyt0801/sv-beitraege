-- ============================================================
-- Nur lesen: Was steht wirklich in dieser Datenbank?
-- ============================================================
-- Diese Datei aendert NICHTS. Sie beantwortet die Fragen, an denen sich
-- entscheidet, ob ein Fehler im Code oder in der Datenbank sitzt.
--
-- Im Supabase-Dashboard: SQL Editor -> Inhalt einfuegen -> Run.
-- Es kommen mehrere Ergebnis-Tabellen untereinander.

-- ------------------------------------------------------------
-- 1) Die wichtigste Frage: laesst has_consented() ueberhaupt jemanden durch?
-- ------------------------------------------------------------
-- Der Zustimmungs-Bildschirm wurde aus der App entfernt. Seitdem setzt nichts
-- mehr profiles.terms_accepted_at. Steht hier noch die alte, strenge Fassung,
-- dann liefert JEDE Abfrage auf students, profiles, contributions, events und
-- topics eine leere Liste zurueck - ohne Fehler. Die App zeigt dann einfach
-- nichts an, und niemand sieht warum.
select
  'has_consented' as pruefung,
  case
    when pg_get_functiondef(p.oid) ilike '%terms_accepted_at%'
      then 'PROBLEM: strenge Fassung aktiv -> alle Listen sind leer. nachtrag.sql ausfuehren.'
    else 'in Ordnung (laesst alle durch)'
  end as ergebnis,
  pg_get_functiondef(p.oid) as quelltext
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'has_consented';

-- ------------------------------------------------------------
-- 2) Fehlen eltern_tickets die drei Spalten, die die App benutzt?
-- ------------------------------------------------------------
-- src/eltern-store.tsx schreibt von_team und liest gelesen_team /
-- gelesen_eltern. Fehlen sie, kann das Stufenteam Eltern gar nicht
-- anschreiben (PostgREST-Fehler PGRST204) und die Ungelesen-Markierung
-- geht nie weg.
select
  'eltern_tickets.' || s.spalte as pruefung,
  case when c.column_name is null then 'FEHLT -> nachtrag.sql ausfuehren'
       else 'vorhanden (' || c.data_type || ')' end as ergebnis
from (values ('von_team'), ('gelesen_team'), ('gelesen_eltern')) as s(spalte)
left join information_schema.columns c
       on c.table_schema = 'public'
      and c.table_name  = 'eltern_tickets'
      and c.column_name = s.spalte;

-- ------------------------------------------------------------
-- 3) Welche Tabellen gibt es ueberhaupt?
-- ------------------------------------------------------------
-- Fehlen termine/termin_komitees/termin_personen, wurde supabase/termine.sql
-- nie ausgefuehrt und der ganze Kalender laeuft ins Leere.
select
  'Tabelle ' || s.tab as pruefung,
  case when t.tablename is null then 'FEHLT -> zugehoerige .sql ausfuehren'
       else 'vorhanden' end as ergebnis
from (values
  ('students'), ('app_settings'), ('profiles'), ('public_profiles'),
  ('contributions'), ('contribution_templates'),
  ('events'), ('poll_options'), ('poll_votes'), ('event_reads'),
  ('topics'), ('topic_items'), ('topic_members'), ('topic_reads'), ('tag_members'),
  ('termine'), ('termin_komitees'), ('termin_personen'),
  ('parent_children'), ('eltern_tickets'), ('eltern_ticket_nachrichten'),
  ('role_permissions'), ('user_permissions'), ('push_subscriptions')
) as s(tab)
left join pg_tables t on t.schemaname = 'public' and t.tablename = s.tab
order by 1;

-- ------------------------------------------------------------
-- 4) Welche Tabellen melden Aenderungen live an die App?
-- ------------------------------------------------------------
-- Was hier fehlt, aktualisiert sich bei anderen erst nach dem Neuladen.
select 'Realtime an fuer' as pruefung, tablename as ergebnis
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;

-- ------------------------------------------------------------
-- 5) Gibt es ueberhaupt Daten? (Zaehlt nur, verraet keine Namen.)
-- ------------------------------------------------------------
select 'Anzahl students'    as pruefung, count(*)::text as ergebnis from students
union all select 'Anzahl profiles',        count(*)::text from profiles
union all select 'Anzahl topic_items',     count(*)::text from topic_items
union all select 'Anzahl contributions',   count(*)::text from contributions
union all select 'Anzahl push_subscriptions', count(*)::text from push_subscriptions;

-- ------------------------------------------------------------
-- 6) Wie viele Konten nutzen noch das Startpasswort?
-- ------------------------------------------------------------
-- Diese Konten sind es, bei denen Chrome "in einem Datenleck gefunden"
-- meldet, falls sie vor der Passwort-Umstellung angelegt wurden.
select
  'Konten mit Startpasswort' as pruefung,
  count(*) filter (where must_change_password)::text || ' von ' || count(*)::text as ergebnis
from profiles;
