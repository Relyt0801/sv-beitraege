-- ============================================================
-- Nachtrag: Spalten der Elterngespraeche
-- ============================================================
-- Diese drei Spalten sind in der laufenden Datenbank seit dem Umbau der
-- Elterngespraeche vorhanden, standen aber in keiner .sql-Datei im Repo.
-- Wer die Datenbank aus dem Repo neu aufbaut, bekommt sonst eine App, in der
-- das Team zwar schreiben kann, die Nachricht aber nirgends ankommt.
--
--   von_team       – hat das Team das Gespraech begonnen?
--   gelesen_team   – wann hat das Team zuletzt hineingeschaut?
--   gelesen_eltern – wann die Eltern?
--
-- Alle drei sind "add column if not exists": auf der laufenden Datenbank
-- passiert dadurch nichts.

alter table eltern_tickets add column if not exists von_team boolean not null default false;
alter table eltern_tickets add column if not exists gelesen_team timestamptz;
alter table eltern_tickets add column if not exists gelesen_eltern timestamptz;
