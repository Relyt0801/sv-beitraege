-- =====================================================================
-- Ganztägige Schichten sind um 14:00 „vorbei“ (01.10.2026)
-- Einmal im SQL Editor ausführen (idempotent). Keine Namen, keine Schlüssel.
--
-- Vorher galt ein ganztägiger Termin erst um 23:59 als vorbei. Für Aufgaben
-- wie „Waffelteig mitbringen“ oder „Waffeleisen bereitstellen“ kam die
-- Erinnerung ans Stufenteam („Beitragspunkte vergeben?“) damit mitten in der
-- Nacht – und vor 23:59 ließ sich die Mithilfe gar nicht bestätigen.
-- Jetzt: ganztägig = Ende des Schultags, 14:00 (Schulzeit Europe/Berlin).
-- Mit Uhrzeit bleibt alles wie bisher (Ende, sonst Beginn + 45 Minuten).
--
-- termin_ende() benutzen nur schicht_enden_offen() (Erinnerung, pg_cron alle
-- 5 Minuten) und schicht_abschliessen() (Punkte erst nach dem Ende).
-- =====================================================================

create or replace function public.termin_ende(t public.termine)
returns timestamptz language sql stable set search_path = public as $$
  select ((coalesce(t.bis_datum, t.datum)
           + coalesce(t.bis, t.von + interval '45 minutes', time '14:00'))::timestamp)
         at time zone 'Europe/Berlin'
$$;
