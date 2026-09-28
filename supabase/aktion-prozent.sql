-- =====================================================================
-- Mithilfe-Prozent nachträglich ändern (28.09.2026)
-- Einmal im SQL Editor ausführen (idempotent). Keine Namen, keine Schlüssel.
-- Keine Mitteilungen: Mitteilungen schickt nur die App, nicht die Datenbank.
--
-- aktion_prozent_setzen(aktion, prozent): setzt den Wert einer Aktion
-- (Mitmachen/Schichten) und passt die schon vergebene Mithilfe aller
-- abgeschlossenen Schichten dieser Aktion mit an. Erlaubt: Team oder
-- „Termine verwalten“.
-- =====================================================================

create or replace function public.aktion_prozent_setzen(aid uuid, neu int)
returns int language plpgsql security definer set search_path = public as $$
declare
  alt_titel text;
  ziel int;
  n int;
begin
  if auth.uid() is null or not (public.ist_team() or public.has_perm('termine.manage')) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if neu is null or neu < 0 or neu > 100 then
    raise exception 'Prozent zwischen 0 und 100' using errcode = '22023';
  end if;
  select titel into alt_titel from aktionen where id = aid;
  if not found then raise exception 'Aktion nicht gefunden' using errcode = 'P0002'; end if;
  select ziel_punkte into ziel from app_settings where id = 1;

  update aktionen set prozent = neu where id = aid;

  -- Schon vergebene Mithilfe: dieselbe Person, derselbe Tag, derselbe Titel
  update contributions c
     set punkte = case when neu = 0 then 0 else greatest(1, round(neu * coalesce(ziel, 100) / 100.0))::int end
    from termine te
    join termin_personen tp on tp.termin_id = te.id
   where te.aktion_id = aid
     and te.abschluss = 'vergeben'
     and c.student_id = tp.student_id
     and c.datum = te.datum
     and c.titel = alt_titel;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.aktion_prozent_setzen(uuid, int) from public, anon;
grant execute on function public.aktion_prozent_setzen(uuid, int) to authenticated;

-- ---------------------------------------------------------------------
-- Einmalig am 28.09. (bereits eingespielt, hier nur zur Nachvollziehbarkeit):
-- Werte an die Vorlagen im Beiträge-Reiter angeglichen.
--   Mithilfe „Waffel-/Kuchenverkauf außerhalb der Schulzeit (EF)“ 10 → 15 %
--   Aktionen: Waffeleisen 20 %, Puderzucker/Besteck/Tischdecke 5 %,
--             Waffelverkauf 1. große Pause 8 % („Waffelverkauf in der Pause“)
--   Vorlage „Lehrerkarten Unterstützug“ → „Lehrerkarten Unterstützung“
-- ---------------------------------------------------------------------
