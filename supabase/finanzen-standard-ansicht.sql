-- ============================================================
-- Finanzen: Standard-Ansicht für alle, Erweiterte Ansicht fürs Team
--
-- Neues Recht "finanzen.basis" (Finanzen ansehen – Standard):
--   Kontostand, Anteil am Geldziel, wie viel an Beiträgen noch offen ist
--   (nur die Summe), Stufenbeiträge zusammengefasst je EF / Q1 / Q2 und je
--   Aktion Einnahmen, Ausgaben und Saldo. KEINE Namen, keine Einzelbuchungen.
--   Standard: Schüler, Eltern (mit Kind), Team.
--
-- "finanzen.view" heißt jetzt "Finanzen ansehen – Erweitert": das komplette
-- Kassenbuch mit allen Buchungen. Standard: Stufenteam, Sprecher,
-- Kassenwart, Admin – und automatisch der Aufsichtsrat.
--
-- Die Standard-Ansicht liest NICHT aus kasse_buchungen (das bleibt der
-- erweiterten Ansicht vorbehalten), sondern bekommt fertige Summen aus der
-- Funktion finanz_uebersicht(). So kommen Namen gar nicht erst beim Gerät an.
--
-- Mehrfach ausführbar. Einspielen: Supabase → SQL Editor → ganze Datei → Run.
-- ============================================================

create or replace function public.finanz_uebersicht()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  erweitert boolean := public.has_perm('finanzen.view') or public.has_perm('finanzen.manage') or public.ist_aufsichtsrat();
  hy text[] := array['EF.1','EF.2','Q1.1','Q1.2','Q2.1','Q2.2'];
  std jsonb := '{"EF.1":25,"EF.2":25,"Q1.1":50,"Q1.2":50,"Q2.1":50,"Q2.2":50}';
  s record;
  akt int;
  offen_cent bigint;
  offen_personen int;
  ergebnis jsonb;
begin
  if auth.uid() is null
     or not (erweitert or public.has_perm('finanzen.basis'))
     or public.eltern_ohne_kind() then
    raise exception 'Keine Berechtigung für die Finanzen' using errcode = '42501';
  end if;

  select aktuelles_halbjahr, beitraege into s from app_settings where id = 1;
  akt := coalesce(array_position(hy, s.aktuelles_halbjahr), 1);

  -- Offene Beiträge bis einschließlich dem aktuellen Halbjahr – wie
  -- basisOffen() in src/lib/logic.ts, nur als Summe über alle.
  select coalesce(sum(o), 0), count(*) filter (where o > 0)
    into offen_cent, offen_personen
    from (
      select (
        select coalesce(sum(coalesce((s.beitraege ->> x.h)::numeric, (std ->> x.h)::numeric) * 100), 0)
          from unnest(hy) with ordinality as x(h, i)
         where x.i <= akt
           and x.i >= coalesce(array_position(hy, st.beigetreten_ab), 1)
           and (st.verlaesst_ab is null or x.i < array_position(hy, st.verlaesst_ab))
           and st.terms -> x.h ->> 'status' = 'offen'
      ) as o
      from students st
    ) q;

  with b as (select * from kasse_buchungen),
  posten as (
    select
      case
        when b.aktion_id is not null then 'aktion'
        when b.quelle = 'aktion' then 'aktion'
        when b.quelle = 'spende' then 'spende'
        when b.quelle = 'sonstiges' then 'sonstiges'
        when b.komitee is not null then 'komitee'
        else 'ausgabe'
      end as art,
      case
        when b.aktion_id is not null then coalesce(a.titel, 'Aktion')
        when b.quelle = 'aktion' then b.titel
        when b.quelle = 'spende' then 'Spenden'
        when b.quelle = 'sonstiges' then 'Sonstige Einnahmen'
        when b.komitee is not null then b.komitee
        else 'Sonstige Ausgaben'
      end as titel,
      b.cent, b.datum
    from b left join aktionen a on a.id = b.aktion_id
    where b.quelle not in ('beitrag', 'abgleich')
  )
  select jsonb_build_object(
    'erweitert', erweitert,
    'stand_cent', (select coalesce(sum(cent), 0) from b),
    -- Zurückgenommene Beiträge sind keine Ausgabe: Beiträge zählen netto.
    'einnahmen_cent', (select coalesce(sum(cent) filter (where cent > 0 and quelle not in ('beitrag', 'abgleich')), 0)
                            + coalesce(sum(cent) filter (where quelle = 'beitrag'), 0) from b),
    'ausgaben_cent', (select coalesce(-sum(cent), 0) from b where cent < 0 and quelle not in ('beitrag', 'abgleich')),
    'abgleich_cent', (select coalesce(sum(cent), 0) from b where quelle = 'abgleich'),
    'letzte_buchung', (select max(datum) from b),
    'ziel_cent', (select ziel_cent from kasse_einstellungen where id = 1),
    'ziel_titel', (select ziel_titel from kasse_einstellungen where id = 1),
    'halbjahr', s.aktuelles_halbjahr,
    'offen_cent', offen_cent,
    'offen_personen', offen_personen,
    'beitraege', coalesce((
      select jsonb_agg(jsonb_build_object('phase', phase, 'cent', cent) order by phase)
        from (select coalesce(left(halbjahr, 2), '–') as phase, sum(cent) as cent
                from b where quelle = 'beitrag' group by 1) x), '[]'::jsonb),
    'posten', coalesce((
      select jsonb_agg(jsonb_build_object(
               'art', art, 'titel', titel,
               'ein_cent', ein, 'aus_cent', aus, 'anzahl', n, 'zuletzt', zuletzt)
             order by zuletzt desc)
        from (select art, titel,
                     coalesce(sum(cent) filter (where cent > 0), 0) as ein,
                     coalesce(-sum(cent) filter (where cent < 0), 0) as aus,
                     count(*) as n, max(datum) as zuletzt
                from posten group by art, titel) y), '[]'::jsonb)
  ) into ergebnis;

  return ergebnis;
end $$;

revoke execute on function public.finanz_uebersicht() from public, anon;
grant execute on function public.finanz_uebersicht() to authenticated;

-- Standardrechte (im Rechte-Reiter jederzeit änderbar) --------------
insert into public.role_permissions (role, perm, allowed) values
  ('schueler',   'finanzen.basis', true),
  ('eltern',     'finanzen.basis', true),
  ('stufenteam', 'finanzen.basis', true),
  ('sprecher',   'finanzen.basis', true),
  ('kassenwart', 'finanzen.basis', true),
  ('stufenteam', 'finanzen.view',  true),
  ('sprecher',   'finanzen.view',  true)
on conflict (role, perm) do update set allowed = excluded.allowed;

-- Selbstprüfung ---------------------------------------------------
select 'Funktion finanz_uebersicht' as pruefung,
       case when to_regprocedure('public.finanz_uebersicht()') is not null
             and not has_function_privilege('anon', 'public.finanz_uebersicht()', 'execute')
            then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Standard für Schüler und Eltern',
       case when (select count(*) from public.role_permissions
                   where perm = 'finanzen.basis' and allowed and role in ('schueler', 'eltern')) = 2
            then 'ok' else 'FEHLT' end;
