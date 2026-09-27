-- =====================================================================
-- Finanzen: Kategorien mit Farbe für Buchungen (27.09.2026)
-- Einmal im SQL Editor ausführen (idempotent). Keine Namen, keine Schlüssel.
--
-- Eine Kategorie hat einen Namen und eine Farbe (Schlüssel aus
-- KASSEN_FARBEN in src/lib/finanzen.ts). Mehrere Kategorien dürfen dieselbe
-- Farbe haben. Die Standard-Ansicht (finanz_uebersicht) fasst Buchungen mit
-- Kategorie unter deren Namen zusammen und gibt die Farbe mit – so passen
-- Balken und Farbpunkte der Liste zusammen.
--
-- Stand 27.09. (2): Einnahmen/Ausgaben sind jetzt „brutto“ und passen zum
-- Kontostand: Einnahmen − Ausgaben = Kontostand. Bankabgleiche zählen als
-- „Sonstiges“ (grau), zurückgenommene Elternbeiträge als Ausgabe.
-- =====================================================================

create table if not exists public.kasse_kategorien (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 40),
  farbe text not null default 'blau' check (farbe ~ '^[a-z]{3,12}$'),
  -- für welche Seite die Kategorie angeboten wird
  art text not null default 'beide' check (art in ('ein', 'aus', 'beide')),
  sort int not null default 100,
  created_at timestamptz not null default now()
);
alter table public.kasse_kategorien enable row level security;

drop policy if exists "kategorien lesen" on public.kasse_kategorien;
create policy "kategorien lesen" on public.kasse_kategorien for select to authenticated
  using ((select has_perm('finanzen.view')) or (select has_perm('finanzen.manage')) or (select ist_aufsichtsrat()));
drop policy if exists "kategorien pflegen" on public.kasse_kategorien;
create policy "kategorien pflegen" on public.kasse_kategorien for all to authenticated
  using ((select has_perm('finanzen.manage'))) with check ((select has_perm('finanzen.manage')));

alter table public.kasse_buchungen
  add column if not exists kategorie_id uuid references public.kasse_kategorien(id) on delete set null;
create index if not exists kasse_buchungen_kategorie_idx on public.kasse_buchungen (kategorie_id);

-- Live-Aktualisierung im Finanzen-Reiter
do $$ begin
  alter publication supabase_realtime add table public.kasse_kategorien;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- ------------------------------------------------------------ Standard-Ansicht
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
        when b.quelle = 'abgleich' then 'sonstiges'
        when b.quelle = 'beitrag' then 'ausgabe'
        when k.id is not null then 'kategorie'
        when b.aktion_id is not null then 'aktion'
        when b.quelle = 'aktion' then 'aktion'
        when b.quelle = 'spende' then 'spende'
        when b.quelle = 'sonstiges' then 'sonstiges'
        when b.komitee is not null then 'komitee'
        else 'ausgabe'
      end as art,
      case
        when b.quelle = 'abgleich' then 'Sonstiges'
        when b.quelle = 'beitrag' then 'Zurückgenommene Elternbeiträge'
        when k.id is not null then k.name
        when b.aktion_id is not null then coalesce(a.titel, 'Aktion')
        when b.quelle = 'aktion' then b.titel
        when b.quelle = 'spende' then 'Spenden'
        when b.quelle = 'sonstiges' then 'Sonstiges'
        when b.komitee is not null then b.komitee
        else 'Sonstige Ausgaben'
      end as titel,
      case when b.quelle in ('abgleich', 'sonstiges') and k.id is null then 'grau' else k.farbe end as farbe,
      b.cent, b.datum
    from b
    left join aktionen a on a.id = b.aktion_id
    left join kasse_kategorien k on k.id = b.kategorie_id
    -- Beiträge stehen eigens; nur zurückgenommene tauchen hier als Ausgabe auf
    where b.quelle <> 'beitrag' or b.cent < 0
  )
  select jsonb_build_object(
    'erweitert', erweitert,
    'stand_cent', (select coalesce(sum(cent), 0) from b),
    'einnahmen_cent', (select coalesce(sum(cent), 0) from b where cent > 0),
    'ausgaben_cent', (select coalesce(-sum(cent), 0) from b where cent < 0),
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
                from b where quelle = 'beitrag' and cent > 0 group by 1) x), '[]'::jsonb),
    'posten', coalesce((
      select jsonb_agg(jsonb_build_object(
               'art', art, 'titel', titel, 'farbe', farbe,
               'ein_cent', ein, 'aus_cent', aus, 'anzahl', n, 'zuletzt', zuletzt)
             order by zuletzt desc)
        from (select art, titel, max(farbe) as farbe,
                     coalesce(sum(cent) filter (where cent > 0), 0) as ein,
                     coalesce(-sum(cent) filter (where cent < 0), 0) as aus,
                     count(*) as n, max(datum) as zuletzt
                from posten group by art, titel) y), '[]'::jsonb)
  ) into ergebnis;

  return ergebnis;
end $$;
