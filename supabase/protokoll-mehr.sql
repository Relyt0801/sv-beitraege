-- =====================================================================
-- Protokoll: Mithilfe, entschiedene Anfragen und Schicht-Einteilung
-- (06.10.2026). Ohne Namen, ohne Schlüssel. Über das SQL-Werkzeug
-- eingespielt (keine Löschbefehle).
--
--  1. audit_schreiben(): „mithilfe.eingetragen“ wird wieder geschrieben
--     (zusammengefasst je Aktion). Komitee-Beitritt/-Austritt, Passwörter
--     und automatische Buchungen bleiben weiterhin draußen.
--  2. audit_contrib_ins(): Herkunft im Text – „Schicht abgeschlossen – …“
--     bzw. „Nachtrag angenommen – …“.
--  3. Entschiedene Anfragen (Bereich „anfragen“): Nachtrag abgelehnt,
--     Komitee-Wunsch, Entsperr-, Termin- und Kostenanfrage.
--  4. Schicht-Einteilung (Termine mit Plätzen), zusammengefasst je Schicht.
--     Austragen wird nicht protokolliert.
-- =====================================================================

create or replace function public.audit_schreiben(p_aktion text, p_bereich text, p_ziel uuid, p_ziel_name text, p_klartext text, p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  a uuid := auth.uid();
begin
  if coalesce(current_setting('sv.wiederherstellung', true), '') = '1' then
    return;
  end if;
  if p_aktion in ('passwort.geaendert', 'komitee.zugeteilt', 'komitee.entfernt')
     or (p_aktion = 'kasse.gebucht' and coalesce((p_details->>'automatisch')::boolean, false)) then
    return;
  end if;
  insert into public.audit_log (aktion, bereich, akteur_id, akteur_name, ziel_id, ziel_name, klartext, details)
  values (
    p_aktion, p_bereich, a,
    case when a is null then 'System' else coalesce(nullif(public.audit_name(a), ''), 'Unbekannt') end,
    p_ziel, left(coalesce(p_ziel_name, ''), 80), left(coalesce(p_klartext, ''), 240), '{}'::jsonb
  );
end $$;

create or replace function public.audit_contrib_ins()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
  quelle text := coalesce(nullif(current_setting('sv.mithilfe_quelle', true), ''), 'app');
begin
  for r in
    select n.titel, n.punkte, n.datum, count(*)::int as anzahl,
           string_agg(coalesce(s.nachname || ', ' || s.vorname, '?'), '; ' order by s.nachname, s.vorname) as namen
      from neu n left join public.students s on s.id = n.student_id
     group by n.titel, n.punkte, n.datum
  loop
    perform public.audit_schreiben(
      'mithilfe.eingetragen', 'mithilfe', null,
      case when r.anzahl = 1 then r.namen else r.anzahl || ' Personen' end,
      case quelle when 'schicht' then 'Schicht abgeschlossen – ' when 'nachtrag' then 'Nachtrag angenommen – ' else '' end
        || 'Mithilfe „' || r.titel || '“ +' || public.mithilfe_prozent(r.punkte) || ' % für '
        || case when r.anzahl = 1 then '' else r.anzahl || ' Personen: ' end || r.namen);
  end loop;
  return null;
end $$;

create or replace function public.audit_anfrage()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wer text;
  was text;
  ergebnis text;
  nutzer uuid;
begin
  if old.status is not distinct from new.status or old.status <> 'offen' then return new; end if;
  ergebnis := case new.status when 'angenommen' then 'angenommen' when 'genehmigt' then 'genehmigt' when 'abgelehnt' then 'abgelehnt' else new.status end;
  if tg_table_name = 'mithilfe_nachtraege' then
    -- Angenommen steht schon als „Nachtrag angenommen – Mithilfe …“ im Protokoll
    if new.status = 'angenommen' then return new; end if;
    select nachname || ', ' || vorname into wer from public.students where id = new.student_id;
    was := 'Mithilfe-Nachtrag „' || new.titel || '“ ' || ergebnis;
    perform public.audit_schreiben('anfrage.nachtrag', 'anfragen', null, coalesce(wer, '?'), was);
    return new;
  end if;
  nutzer := new.user_id;
  if tg_table_name = 'komitee_requests' then
    -- „motto-pullis“ → „Motto & Pullis“
    was := 'Komitee-Wunsch „' || initcap(replace(new.wunsch_tag, '-', ' & ')) || '“ ' || ergebnis;
  else
    was := 'Entsperr-Anfrage ' || ergebnis;
  end if;
  perform public.audit_schreiben('anfrage.' || tg_table_name, 'anfragen', nutzer,
    coalesce(nullif(public.audit_name(nutzer), ''), '?'), was);
  return new;
end $$;
revoke all on function public.audit_anfrage() from public, anon, authenticated;

create or replace function public.audit_anfrage_mit_titel()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ergebnis text;
  was text;
begin
  if old.status is not distinct from new.status or old.status <> 'offen' then return new; end if;
  ergebnis := case new.status when 'angenommen' then 'angenommen' when 'genehmigt' then 'genehmigt' when 'abgelehnt' then 'abgelehnt' else new.status end;
  if tg_table_name = 'termin_requests' then
    was := 'Terminanfrage „' || new.titel || '“ (' || to_char(new.datum, 'DD.MM.') || ') ' || ergebnis;
  else
    was := 'Kostenanfrage „' || new.titel || '“ (' || to_char(new.cent / 100.0, 'FM999G990D00') || ' €) ' || ergebnis;
  end if;
  perform public.audit_schreiben('anfrage.' || tg_table_name, 'anfragen', new.created_by,
    coalesce(nullif(public.audit_name(new.created_by), ''), '?'), was);
  return new;
end $$;
revoke all on function public.audit_anfrage_mit_titel() from public, anon, authenticated;

create or replace trigger audit_anfrage after update of status on public.mithilfe_nachtraege for each row execute function public.audit_anfrage();
create or replace trigger audit_anfrage after update of status on public.komitee_requests for each row execute function public.audit_anfrage();
create or replace trigger audit_anfrage after update of status on public.unban_requests for each row execute function public.audit_anfrage();
create or replace trigger audit_anfrage after update of status on public.termin_requests for each row execute function public.audit_anfrage_mit_titel();
create or replace trigger audit_anfrage after update of status on public.kosten_anfragen for each row execute function public.audit_anfrage_mit_titel();

create or replace function public.audit_schicht_ins()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select t.titel, t.datum, count(*)::int as anzahl,
           string_agg(coalesce(s.nachname || ', ' || s.vorname, '?'), '; ' order by s.nachname, s.vorname) as namen
      from neu n
      join public.termine t on t.id = n.termin_id and t.plaetze is not null
      left join public.students s on s.id = n.student_id
     group by t.id, t.titel, t.datum
  loop
    perform public.audit_schreiben(
      'schicht.eingeteilt', 'mithilfe', null,
      case when r.anzahl = 1 then r.namen else r.anzahl || ' Personen' end,
      'Schicht „' || r.titel || '“ (' || to_char(r.datum, 'DD.MM.') || ') eingeteilt: ' || r.namen);
  end loop;
  return null;
end $$;
revoke all on function public.audit_schicht_ins() from public, anon, authenticated;
create or replace trigger audit_schicht_ins after insert on public.termin_personen
  referencing new table as neu for each statement execute function public.audit_schicht_ins();
