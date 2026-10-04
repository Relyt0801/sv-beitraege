-- =====================================================================
-- Automatisch löschen: kürzere Fristen + Protokoll, schlankeres Protokoll
-- (04.10.2026). Einmal im SQL Editor ausführen (idempotent). Keine Namen,
-- keine Schlüssel.
--
-- Schon eingespielt (per App-Zugang, ohne Löschbefehle):
--   • app_settings.loeschen_protokoll_tage
--   • loeschfristen_setzen(chat, antraege, protokoll)
--   • audit_schreiben(): schreibt nur noch das Nötigste und keine Details
--     mehr (kein „Passwort geändert“, kein Komitee-Beitritt/-Austritt, keine
--     einzelne Mithilfe – die steht mit created_by in contributions –, keine
--     automatische Buchung zum Beitrag). Texte gekürzt, details = {}.
--
-- Diese Datei macht den Rest, der Löschbefehle enthält:
--   1. Fristen schon ab 1 Tag erlauben (App: 1 Tag, 3 Tage, 1 Woche, 1 Monat)
--   2. aufraeumen() räumt nachts auch das Protokoll auf
--   3. einmalig: das alte, aufgeblähte Protokoll ausdünnen
-- =====================================================================

-- 1) Fristen ab 1 Tag -------------------------------------------------
alter table public.app_settings drop constraint if exists app_settings_loeschen_chat_tage_check;
alter table public.app_settings add constraint app_settings_loeschen_chat_tage_check
  check (loeschen_chat_tage is null or loeschen_chat_tage between 1 and 3650);
alter table public.app_settings drop constraint if exists app_settings_loeschen_antraege_tage_check;
alter table public.app_settings add constraint app_settings_loeschen_antraege_tage_check
  check (loeschen_antraege_tage is null or loeschen_antraege_tage between 1 and 3650);

-- Die alte Fassung mit zwei Werten braucht die App nicht mehr
drop function if exists public.loeschfristen_setzen(int, int);

-- 2) Nachts aufräumen – jetzt auch das Protokoll -----------------------
create or replace function public.aufraeumen()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c int;
  a int;
  p int;
  n int;
  ergebnis jsonb := '{}'::jsonb;
begin
  select loeschen_chat_tage, loeschen_antraege_tage, loeschen_protokoll_tage into c, a, p
    from public.app_settings where id = 1;

  if c is not null then
    delete from public.topic_items
     where type in ('nachricht', 'system') and not coalesce(pinned, false)
       and created_at < now() - make_interval(days => c);
    get diagnostics n = row_count; ergebnis := ergebnis || jsonb_build_object('nachrichten', n);

    delete from public.topics t
     where t.kind = 'ticket' and t.status = 'erledigt'
       and t.created_at < now() - make_interval(days => c)
       and not exists (select 1 from public.topic_items i
                        where i.topic_id = t.id and i.created_at >= now() - make_interval(days => c));
    get diagnostics n = row_count; ergebnis := ergebnis || jsonb_build_object('gespraeche', n);

    delete from public.eltern_tickets
     where erledigt and coalesce(updated_at, created_at) < now() - make_interval(days => c);
    get diagnostics n = row_count; ergebnis := ergebnis || jsonb_build_object('elterngespraeche', n);
  end if;

  if a is not null then
    delete from public.mithilfe_nachtraege where status <> 'offen' and decided_at < now() - make_interval(days => a);
    delete from public.komitee_requests where status <> 'offen' and decided_at < now() - make_interval(days => a);
    delete from public.unban_requests where status <> 'offen' and decided_at < now() - make_interval(days => a);
    delete from public.termin_requests where status <> 'offen' and decided_at < now() - make_interval(days => a);
    delete from public.kosten_anfragen where status <> 'offen' and decided_at < now() - make_interval(days => a);
    ergebnis := ergebnis || jsonb_build_object('antraege', true);
  end if;

  if p is not null then
    delete from public.audit_log where at < now() - make_interval(days => p);
    get diagnostics n = row_count; ergebnis := ergebnis || jsonb_build_object('protokoll', n);
  end if;
  return ergebnis;
end $$;
revoke all on function public.aufraeumen() from public, anon, authenticated;

-- 3) Einmalig: altes Protokoll ausdünnen ------------------------------
delete from public.audit_log
 where aktion in ('passwort.geaendert', 'komitee.zugeteilt', 'komitee.entfernt', 'mithilfe.eingetragen')
    or (aktion = 'kasse.gebucht' and klartext like '% – automatisch');
update public.audit_log set details = '{}'::jsonb where details <> '{}'::jsonb;

-- Prüfen: sollte jetzt deutlich weniger sein
select aktion, count(*) from public.audit_log group by 1 order by 2 desc;

-- 4) (eingespielt 04.10.2026) Protokoll nur lesen: App-Zugänge dürfen nichts
--    schreiben, ändern oder leeren – geschrieben wird nur über audit_schreiben(),
--    gelöscht nur nachts über aufraeumen(). DELETE blockt zusätzlich RLS.
revoke insert, update, truncate, references, trigger on public.audit_log from anon, authenticated;
revoke all on public.audit_log from anon;
