-- ============================================================
-- Stufenkasse – Beitragskonzept auf Prozent umgestellt
-- Ausführen im Supabase SQL-Editor. Mehrfach ausführbar.
--
-- Neu: man sammelt Prozent (0–100). Der Zusatzbeitrag zum Abiballticket
-- sinkt alle 25 %:  0 % = 50 €, 25 % = 40 €, 50 % = 25 €, 75 % = 10 €, 100 % = 0 €
-- Es gilt immer die höchste erreichte Stufe – 60 % zählt als 50 %.
-- ============================================================

-- 1) Staffel in den Einstellungen
alter table public.app_settings
  add column if not exists staffel jsonb not null default
    '[{"ab":0,"betrag":50},{"ab":25,"betrag":40},{"ab":50,"betrag":25},{"ab":75,"betrag":10},{"ab":100,"betrag":0}]'::jsonb;

-- 2) Ziel ist jetzt 100 % statt einer Punktzahl; fester Zusatzbetrag entfällt
update public.app_settings
   set ziel_punkte = 100,
       zusatzbetrag = 0,
       staffel = coalesce(
         nullif(staffel, '[]'::jsonb),
         '[{"ab":0,"betrag":50},{"ab":25,"betrag":40},{"ab":50,"betrag":25},{"ab":75,"betrag":10},{"ab":100,"betrag":0}]'::jsonb)
 where id = 1;

-- 3) Vorlagen: neuer Katalog in Prozent
delete from public.contribution_templates;
insert into public.contribution_templates (titel, punkte, sort) values
  -- 5 %
  ('Waffelverkauf in der Pause',                     5,  1),
  ('Waffeln oder Kuchen gebacken',                   5,  2),
  ('Kleinere Aufgabe / Hilfe (Einkauf o. Ä.)',       5,  3),
  -- 10 %
  ('Waffel-/Kuchenverkauf außerhalb der Schulzeit', 10,  4),
  ('Aufgabe mittleren Aufwands (z. B. 1 Tag Stand)',10,  5),
  ('Außerschulische Aktion über 2 Std.',            10,  6),
  -- 20 %
  ('Girolauf (beide Tage)',                         20,  7),
  ('Größere profitable Aktion ermöglicht',          20,  8),
  -- je nach Aufwand und Ertrag: 3–10 %
  ('Eingebrachte Aktion, die umgesetzt wurde',       5,  9);

-- HINWEIS: Bereits eingetragene Beiträge behalten ihre alte Zahl. Aus "1 Punkt"
-- wird damit "1 %". Falls schon nennenswert viel eingetragen war, die Werte in
-- der Tabelle contributions einmal von Hand nachziehen.
