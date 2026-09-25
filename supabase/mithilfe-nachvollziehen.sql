-- =====================================================================
-- Mithilfe nachvollziehen: wer hat wem Prozent eingetragen?
-- Stand 25.09.2026. Einmal im SQL Editor ausführen (idempotent), NACH
-- protokoll-und-sicherung.sql und termine-schichten-chat.sql.
-- Enthält keine Namen, Kennungen oder Schlüssel.
--
-- Anlass: Eine Schülerin bekam „🙌 Mithilfe eingetragen … Danke fürs
-- Mithelfen!“ und 5 %, ohne sich für etwas eingetragen zu haben. Ob das
-- von Hand, über „Mehrere auswählen“ oder über „Punkte vergeben“ nach einer
-- Schicht kam, ließ sich nicht klären: Die App schrieb bei Mithilfe kein
-- created_by mit, und im Protokoll stand Mithilfe gar nicht.
--
-- Ab jetzt:
--   1. created_by und created_at setzt die Datenbank selbst (nicht fälschbar,
--      nicht nachträglich änderbar).
--   2. Jede eingetragene, geänderte oder gelöschte Mithilfe steht im
--      Protokoll (Profil → Protokoll → „Mithilfe“) – mit Namen und wer es war.
--      Mehrere auf einmal = EINE Zeile mit allen Namen.
--   3. „Punkte vergeben“ geht erst, wenn die Schicht vorbei ist – auch wenn
--      jemand die Datenbank direkt aufruft statt über die App.
-- =====================================================================


-- ------------------------------------------------------------ 1) Urheber
create or replace function public.contrib_urheber()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Speicherstand zurückspielen: alte Werte unverändert übernehmen.
  if coalesce(current_setting('sv.wiederherstellung', true), '') = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

drop trigger if exists contrib_urheber on public.contributions;
create trigger contrib_urheber before insert or update on public.contributions
  for each row execute function public.contrib_urheber();


-- ------------------------------------------------------------ 2) Protokoll
-- Prozent statt roher Punkte, so wie die App es anzeigt.
create or replace function public.mithilfe_prozent(p integer)
returns integer language sql stable set search_path = public as $$
  select round(coalesce(p, 0) * 100.0 / greatest(1, coalesce((select ziel_punkte from public.app_settings where id = 1), 100)))::int
$$;
revoke all on function public.mithilfe_prozent(integer) from public, anon;

-- Eintragen: eine Zeile je Anweisung und Art der Mithilfe. Wer 20 Personen
-- auf einmal einträgt, erzeugt eine Zeile mit 20 Namen – genau da fällt ein
-- Name auf, der nicht hingehört.
create or replace function public.audit_contrib_ins()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
  quelle text := coalesce(nullif(current_setting('sv.mithilfe_quelle', true), ''), 'app');
begin
  for r in
    select n.titel, n.punkte, n.datum, count(*)::int as anzahl,
           string_agg(coalesce(s.nachname || ', ' || s.vorname, '?'), '; ' order by s.nachname, s.vorname) as namen,
           jsonb_agg(n.student_id) as ids
      from neu n left join public.students s on s.id = n.student_id
     group by n.titel, n.punkte, n.datum
  loop
    perform public.audit_schreiben(
      'mithilfe.eingetragen', 'mithilfe', null,
      case when r.anzahl = 1 then r.namen else r.anzahl || ' Personen' end,
      case when quelle = 'schicht' then 'Schicht abgeschlossen – ' else '' end
        || 'Mithilfe „' || r.titel || '“ +' || public.mithilfe_prozent(r.punkte) || ' % für '
        || case when r.anzahl = 1 then '' else r.anzahl || ' Personen: ' end || r.namen,
      jsonb_build_object('student_ids', r.ids, 'titel', r.titel, 'punkte', r.punkte,
                         'datum', r.datum, 'anzahl', r.anzahl, 'quelle', quelle));
  end loop;
  return null;
end $$;

create or replace function public.audit_contrib_del()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select a.titel, a.punkte, count(*)::int as anzahl,
           string_agg(coalesce(s.nachname || ', ' || s.vorname, '?'), '; ' order by s.nachname, s.vorname) as namen,
           jsonb_agg(a.student_id) as ids
      from alt a left join public.students s on s.id = a.student_id
     group by a.titel, a.punkte
  loop
    perform public.audit_schreiben(
      'mithilfe.geloescht', 'mithilfe', null,
      case when r.anzahl = 1 then r.namen else r.anzahl || ' Personen' end,
      'Mithilfe „' || r.titel || '“ +' || public.mithilfe_prozent(r.punkte) || ' % gelöscht bei '
        || case when r.anzahl = 1 then '' else r.anzahl || ' Personen: ' end || r.namen,
      jsonb_build_object('student_ids', r.ids, 'titel', r.titel, 'punkte', r.punkte, 'anzahl', r.anzahl));
  end loop;
  return null;
end $$;

create or replace function public.audit_contrib_upd()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  name text;
begin
  if (new.titel, new.punkte, new.student_id) is not distinct from (old.titel, old.punkte, old.student_id) then
    return new;
  end if;
  select nachname || ', ' || vorname into name from public.students where id = new.student_id;
  perform public.audit_schreiben(
    'mithilfe.geaendert', 'mithilfe', null, coalesce(name, '?'),
    coalesce(name, '?') || ': Mithilfe „' || old.titel || '“ +' || public.mithilfe_prozent(old.punkte) || ' % → „'
      || new.titel || '“ +' || public.mithilfe_prozent(new.punkte) || ' %',
    jsonb_build_object('student_id', new.student_id, 'vorher', jsonb_build_object('titel', old.titel, 'punkte', old.punkte),
                       'nachher', jsonb_build_object('titel', new.titel, 'punkte', new.punkte)));
  return new;
end $$;

-- Übergangstabellen gibt es nur mit je einem Trigger pro Ereignis.
drop trigger if exists audit_contrib_ins on public.contributions;
drop trigger if exists audit_contrib_del on public.contributions;
drop trigger if exists audit_contrib_upd on public.contributions;
create trigger audit_contrib_ins after insert on public.contributions
  referencing new table as neu for each statement execute function public.audit_contrib_ins();
create trigger audit_contrib_del after delete on public.contributions
  referencing old table as alt for each statement execute function public.audit_contrib_del();
create trigger audit_contrib_upd after update on public.contributions
  for each row execute function public.audit_contrib_upd();

-- Nur Trigger rufen das auf.
revoke all on function public.contrib_urheber() from public, anon, authenticated;
revoke all on function public.audit_contrib_ins() from public, anon, authenticated;
revoke all on function public.audit_contrib_del() from public, anon, authenticated;
revoke all on function public.audit_contrib_upd() from public, anon, authenticated;


-- ------------------------------------------------------------ 3) Schicht-Abschluss
-- Wie in termine-schichten-chat.sql, zusätzlich:
--   - Punkte erst, wenn die Schicht vorbei ist,
--   - das Protokoll vermerkt „Schicht abgeschlossen“.
create or replace function public.schicht_abschliessen(tid uuid, vergeben boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare
  t public.termine;
  a public.aktionen;
  ziel int;
  n int := 0;
begin
  if auth.uid() is null or not (public.ist_team() or public.has_perm('hilfen.edit')) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select * into t from public.termine where id = tid for update;
  if not found then raise exception 'Termin nicht gefunden' using errcode = 'P0002'; end if;
  if t.abschluss is not null then return 0; end if;   -- schon erledigt
  if t.aktion_id is null then raise exception 'Das ist keine Schicht' using errcode = 'P0001'; end if;
  if vergeben and public.termin_ende(t) > now() then
    raise exception 'Die Schicht ist noch nicht vorbei' using errcode = 'P0001';
  end if;
  select * into a from public.aktionen where id = t.aktion_id;

  if vergeben and coalesce(a.prozent, 0) > 0 then
    select coalesce(ziel_punkte, 100) into ziel from public.app_settings where id = 1;
    perform set_config('sv.mithilfe_quelle', 'schicht', true);
    insert into public.contributions (student_id, titel, punkte, datum, created_by)
    select tp.student_id, a.titel, greatest(1, round(a.prozent * coalesce(ziel, 100) / 100.0))::int, t.datum, auth.uid()
      from public.termin_personen tp where tp.termin_id = tid;
    get diagnostics n = row_count;
    perform set_config('sv.mithilfe_quelle', '', true);
  end if;

  update public.termine
     set abschluss = case when vergeben then 'vergeben' else 'ohne' end,
         abschluss_at = now(), abschluss_von = auth.uid()
   where id = tid;
  return n;
end $$;
revoke all on function public.schicht_abschliessen(uuid, boolean) from public, anon;
grant execute on function public.schicht_abschliessen(uuid, boolean) to authenticated;


-- ------------------------------------------------------------ Kontrolle
select 'Trigger auf contributions' as pruefung, count(*) as anzahl
  from pg_trigger where tgrelid = 'public.contributions'::regclass and not tgisinternal
   and tgname in ('contrib_urheber', 'audit_contrib_ins', 'audit_contrib_del', 'audit_contrib_upd');
-- Erwartet: 4


-- ------------------------------------------------------------ Nachsehen (nur lesen)
-- Woher kommt eine Mithilfe, die jemand nicht zuordnen kann? Für Einträge
-- VOR dieser Datei gilt: Die App schrieb kein created_by mit – steht dort
-- jemand, kam der Eintrag über „Punkte vergeben“ nach einer Schicht.
-- „gleichzeitig“ > 1 heißt: mit „Mehrere auswählen“ zusammen mit anderen
-- eingetragen (eine Anweisung = eine Uhrzeit). Den Nachnamen einsetzen und
-- die beiden Abfragen einzeln markieren und ausführen:
--
-- select s.nachname, s.vorname, c.titel, c.punkte, c.datum, c.created_at,
--        case when c.created_by is null then 'von Hand (einzeln oder „Mehrere auswählen“)'
--             else 'Schicht-Abschluss / eingetragen von ' || coalesce(public.audit_name(c.created_by), '?') end as weg,
--        (select count(*) from public.contributions x where x.created_at = c.created_at) as gleichzeitig
--   from public.contributions c join public.students s on s.id = c.student_id
--  where s.nachname ilike 'NACHNAME%'
--  order by c.created_at desc;
--
-- Wer war im selben Rutsch dabei? created_at aus der ersten Abfrage einsetzen:
-- select s.nachname, s.vorname, c.titel, c.punkte
--   from public.contributions c join public.students s on s.id = c.student_id
--  where c.created_at = 'ZEITSTEMPEL';
