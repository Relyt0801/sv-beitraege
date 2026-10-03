-- =====================================================================
-- Update 1.1 – Automatisch löschen (03.10.2026)
-- Einmal im SQL Editor ausführen (idempotent). Keine Namen, keine Schlüssel.
--
-- Damit die Datenbank nicht vollläuft: In den Einstellungen (Profil →
-- Automatisch löschen, nur Admin bzw. „Rechte verwalten“) legt man fest, nach
-- wie vielen Tagen gelöscht wird. null = nie (Standard).
--
--  loeschen_chat_tage      Chat-Nachrichten (nicht Angepinntes, Abstimmungen,
--                          To-dos) samt Reaktionen; erledigte Gespräche mit
--                          Schülern und Eltern (Zeitpunkt: letzte Änderung)
--  loeschen_antraege_tage  entschiedene Anträge: Nachträge, Komitee-Wechsel,
--                          Entsperrungen, Terminanfragen, Kostenanfragen
--                          (die Buchung im Kassenbuch bleibt)
--
-- Läuft jede Nacht um 03:17 (pg_cron, Job „aufraeumen“).
-- =====================================================================

alter table public.app_settings add column if not exists loeschen_chat_tage int
  check (loeschen_chat_tage is null or loeschen_chat_tage between 7 and 3650);
alter table public.app_settings add column if not exists loeschen_antraege_tage int
  check (loeschen_antraege_tage is null or loeschen_antraege_tage between 7 and 3650);

create or replace function public.loeschfristen_setzen(p_chat int, p_antraege int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not (public.my_role() = 'admin' or public.has_perm('perms.manage')) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  update public.app_settings set loeschen_chat_tage = p_chat, loeschen_antraege_tage = p_antraege where id = 1;
end $$;
revoke all on function public.loeschfristen_setzen(int, int) from public, anon;
grant execute on function public.loeschfristen_setzen(int, int) to authenticated;

create or replace function public.aufraeumen()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c int;
  a int;
  n int;
  ergebnis jsonb := '{}'::jsonb;
begin
  select loeschen_chat_tage, loeschen_antraege_tage into c, a from public.app_settings where id = 1;

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
  return ergebnis;
end $$;
revoke all on function public.aufraeumen() from public, anon, authenticated;

select cron.schedule('aufraeumen', '17 3 * * *', 'select public.aufraeumen()');
