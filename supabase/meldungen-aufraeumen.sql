-- =====================================================================
-- Erledigte Meldungen nachts mit den Anträgen löschen (07.10.2026).
-- Einmal im Supabase SQL Editor ausführen (enthält Löschbefehle, deshalb
-- nicht über das SQL-Werkzeug eingespielt). Idempotent.
-- Gleiche Frist wie Anträge (Profil → Automatisch löschen → Anträge).
-- =====================================================================
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
    -- neu: erledigte Meldungen
    delete from public.meldungen where status <> 'offen' and erledigt_at < now() - make_interval(days => a);
    ergebnis := ergebnis || jsonb_build_object('antraege', true);
  end if;

  if p is not null then
    delete from public.audit_log where at < now() - make_interval(days => p);
    get diagnostics n = row_count; ergebnis := ergebnis || jsonb_build_object('protokoll', n);
  end if;
  return ergebnis;
end $$;
