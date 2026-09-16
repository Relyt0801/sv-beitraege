-- ============================================================
-- Stufenkasse – Einführung erneut zeigen können
-- Ausführen im Supabase SQL-Editor. Mehrfach ausführbar.
-- ============================================================

-- Zeitpunkt, ab dem die kurze Einführung wieder erscheinen soll.
-- Das Skript scripts/reset-erklaerungen.mjs setzt ihn auf jetzt.
alter table public.profiles
  add column if not exists tour_reset_at timestamptz;
