-- =====================================================================
-- Offiziell / Inoffiziell, Verschieben mit Zustimmungen, Gewinner küren
-- (14.10.2026)
--
-- Rankings, Zitate, Mottos und Steckbrief-Kommentare haben zwei Teile:
--   offiziell    kommt später gedruckt raus (auch an Eltern), Wortfilter an
--   inoffiziell  nur für die Stufe, Wortfilter standardmäßig aus
-- Eltern sehen beide Teile weiterhin nicht (alle Lese-Regeln schließen
-- Elternzugänge aus). Bestand: alles inoffiziell.
--
-- Verschieben zwischen den Teilen geht nur über verschieben_beantragen /
-- verschieben_zustimmen und braucht so viele Zustimmungen, wie unter
-- Profil → Freigaben bei „Verschieben“ steht (Admin allein reicht).
--
-- Gewinner: Wer die Runden eines Bereichs leitet, kürt einen Gewinner und
-- optional einen „Gewinner der Herzen“ (Tabelle gewinner). Beim Motto setzt
-- der offizielle Gewinner zugleich motto_vorschlaege.gewaehlt; daran hängt
-- die Enthüllung für alle (motto_enthuellung(), auch für Eltern lesbar).
-- Ohne DELETE/DROP-Anweisungen.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Spalte bereich
-- ---------------------------------------------------------------------
alter table public.zitate add column if not exists bereich text not null default 'inoffiziell'
  check (bereich in ('offiziell', 'inoffiziell'));
alter table public.ranking_kategorien add column if not exists bereich text not null default 'inoffiziell'
  check (bereich in ('offiziell', 'inoffiziell'));
alter table public.motto_vorschlaege add column if not exists bereich text not null default 'inoffiziell'
  check (bereich in ('offiziell', 'inoffiziell'));
alter table public.album_kommentare add column if not exists bereich text not null default 'inoffiziell'
  check (bereich in ('offiziell', 'inoffiziell'));

alter table public.motto_vorschlaege add column if not exists gewaehlt_at timestamptz;

-- Den Teil ändern darf man nur über die Verschiebe-Funktionen (die setzen
-- sv.verschieben) – sonst könnte, wer Zitate prüfen darf, ohne Zustimmungen
-- verschieben.
create or replace function public.bereich_schuetzen()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.bereich is distinct from old.bereich
     and coalesce(current_setting('sv.verschieben', true), '') <> '1'
     and coalesce(current_setting('sv.wiederherstellung', true), '') <> '1' then
    raise exception 'Zum Verschieben bitte „Verschieben“ benutzen – das braucht Zustimmungen.' using errcode = '42501';
  end if;
  return new;
end $$;
create or replace trigger bereich_schuetzen before update of bereich on public.zitate
  for each row execute function public.bereich_schuetzen();
create or replace trigger bereich_schuetzen before update of bereich on public.ranking_kategorien
  for each row execute function public.bereich_schuetzen();
create or replace trigger bereich_schuetzen before update of bereich on public.motto_vorschlaege
  for each row execute function public.bereich_schuetzen();
create or replace trigger bereich_schuetzen before update of bereich on public.album_kommentare
  for each row execute function public.bereich_schuetzen();

-- ---------------------------------------------------------------------
-- 2) Wortfilter je Teil
--    Schlüssel: motto / zitate / rankings / kommentare = offiziell,
--    dieselben mit „_inoffiziell“ = inoffiziell (Standard: aus).
-- ---------------------------------------------------------------------
create or replace function public.wf_bereich_an(b text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (wortfilter_bereiche ->> b)::boolean from public.app_settings where id = 1),
                  b not like '%\_inoffiziell')
$$;

create or replace function public.wortfilter_pruefen()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  spalte text;
  wert jsonb;
  neu text;
  hit text;
  schluessel text := public.wf_bereich(tg_table_name);
  teil text := to_jsonb(new) ->> 'bereich';
  verschoben boolean := false;
begin
  if coalesce(current_setting('sv.wiederherstellung', true), '') = '1' then return new; end if;
  -- Nur die vier Tabellen mit offiziell/inoffiziell haben so einen Teil;
  -- abstimm_runden.bereich (motto/zitate/…) ist etwas anderes.
  if teil = 'inoffiziell' then schluessel := schluessel || '_inoffiziell'; end if;
  if tg_op = 'UPDATE' and teil in ('offiziell', 'inoffiziell')
     and teil is distinct from (to_jsonb(old) ->> 'bereich') then
    verschoben := true;   -- beim Verschieben den ganzen Text neu prüfen
  end if;
  if not public.wf_bereich_an(schluessel) then return new; end if;
  foreach spalte in array tg_argv loop
    wert := to_jsonb(new) -> spalte;
    if tg_op = 'UPDATE' and not verschoben and wert is not distinct from (to_jsonb(old) -> spalte) then continue; end if;
    if wert is null or jsonb_typeof(wert) = 'null' then continue; end if;
    if jsonb_typeof(wert) = 'string' then
      neu := wert #>> '{}';
    else
      select string_agg(x #>> '{}', ' ') into neu from jsonb_path_query(wert, '$.** ? (@.type() == "string")') x;
    end if;
    hit := public.wortfilter_treffer(neu);
    if hit is not null then
      if verschoben then
        raise exception 'Kann nicht offiziell werden: enthält „%“. Bitte zuerst umformulieren.', public.wf_maske(hit)
          using errcode = 'P0420';
      end if;
      raise exception 'Bitte ohne beleidigende Wörter formulieren („%“).', public.wf_maske(hit)
        using errcode = 'P0420';
    end if;
  end loop;
  return new;
end $$;

create or replace function public.wortfilter_bereich_setzen(p_bereich text, p_an boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare neu jsonb; basis text := replace(p_bereich, '_inoffiziell', '');
begin
  if p_bereich not in ('chat', 'kommentare', 'steckbrief', 'motto', 'zitate', 'rankings', 'umfragen', 'anfragen', 'team',
                       'kommentare_inoffiziell', 'motto_inoffiziell', 'zitate_inoffiziell', 'rankings_inoffiziell') then
    raise exception 'Unbekannter Bereich';
  end if;
  if not public.wf_bereich_recht(basis) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  update public.app_settings
     set wortfilter_bereiche = coalesce(wortfilter_bereiche, '{}'::jsonb) || jsonb_build_object(p_bereich, p_an)
   where id = 1 returning wortfilter_bereiche into neu;
  perform public.audit_schreiben('wortfilter.bereich', 'moderation', null, p_bereich,
    'Wortfilter für „' || p_bereich || '“ ' || case when p_an then 'eingeschaltet' else 'ausgeschaltet' end,
    jsonb_build_object('bereich', p_bereich, 'an', p_an));
  return neu;
end $$;

-- Startwerte: offiziell an, inoffiziell aus (der bisherige Inhalt ist jetzt
-- inoffiziell – vorher war der Filter bei Motto und Zitaten ohnehin aus).
update public.app_settings
   set wortfilter_bereiche = coalesce(wortfilter_bereiche, '{}'::jsonb)
       || '{"motto": true, "zitate": true, "rankings": true, "kommentare": true,
            "motto_inoffiziell": false, "zitate_inoffiziell": false,
            "rankings_inoffiziell": false, "kommentare_inoffiziell": false}'::jsonb
 where id = 1
   and not (coalesce(wortfilter_bereiche, '{}'::jsonb) ? 'zitate_inoffiziell');

-- ---------------------------------------------------------------------
-- 3) Verschieben mit Zustimmungen
-- ---------------------------------------------------------------------
create table if not exists public.verschiebungen (
  id uuid primary key default gen_random_uuid(),
  tabelle text not null check (tabelle in ('zitate', 'ranking_kategorien', 'motto_vorschlaege', 'album_kommentare')),
  ziel_id uuid not null,
  nach text not null check (nach in ('offiziell', 'inoffiziell')),
  titel text not null default '',
  von uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  erledigt_at timestamptz,
  abgelehnt boolean not null default false
);
alter table public.verschiebungen enable row level security;
create unique index if not exists verschiebungen_offen on public.verschiebungen (tabelle, ziel_id) where erledigt_at is null;

-- Zustimmungen dazu (eigene Tabelle; anfrage_zustimmungen hat eine feste Liste von Arten)
create table if not exists public.verschiebung_zustimmungen (
  verschiebung_id uuid not null references public.verschiebungen (id) on delete cascade,
  user_id uuid not null default auth.uid(),
  at timestamptz not null default now(),
  primary key (verschiebung_id, user_id)
);
alter table public.verschiebung_zustimmungen enable row level security;

-- Wer darf in welcher Tabelle verschieben (und zustimmen)?
create or replace function public.verschieben_recht(p_tabelle text)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_tabelle
    when 'zitate' then public.has_perm('zitate.pruefen')
    when 'ranking_kategorien' then public.has_perm('rankings.verwalten')
    when 'motto_vorschlaege' then public.has_perm('motto.verwalten')
    when 'album_kommentare' then public.has_perm('album.moderieren')
    else false end
$$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'verschiebungen' and policyname = 'verschiebungen lesen') then
    create policy "verschiebungen lesen" on public.verschiebungen for select to authenticated
      using (public.verschieben_recht(tabelle));
  end if;
end $$;

-- Ausführen, sobald genug zugestimmt haben
create or replace function public.verschieben_ausfuehren(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.verschiebungen;
begin
  select * into v from public.verschiebungen where id = p_id and erledigt_at is null for update;
  if not found then return; end if;
  perform set_config('sv.verschieben', '1', true);
  execute format('update public.%I set bereich = $1 where id = $2', v.tabelle) using v.nach, v.ziel_id;
  perform set_config('sv.verschieben', '', true);
  update public.verschiebungen set erledigt_at = now() where id = p_id;
  perform public.audit_schreiben('bereich.verschoben', 'inhalte', null, v.tabelle,
    '„' || left(v.titel, 60) || '“ ist jetzt ' || v.nach, jsonb_build_object('tabelle', v.tabelle, 'id', v.ziel_id, 'nach', v.nach));
end $$;

create or replace function public.verschieben_zustimmen(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.verschiebungen;
  z int;
  noetig int := public.zustimmung_noetig('verschieben');
  fertig boolean;
begin
  select * into v from public.verschiebungen where id = p_id;
  if not found or v.erledigt_at is not null then raise exception 'Schon erledigt'; end if;
  if auth.uid() is null or not public.verschieben_recht(v.tabelle) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  insert into public.verschiebung_zustimmungen (verschiebung_id, user_id) values (p_id, auth.uid())
  on conflict do nothing;
  select count(*) into z from public.verschiebung_zustimmungen where verschiebung_id = p_id;
  fertig := z >= noetig or public.zustimmung_allein();
  if fertig then perform public.verschieben_ausfuehren(p_id); end if;
  return jsonb_build_object('id', p_id, 'stimmen', z, 'noetig', noetig, 'fertig', fertig);
end $$;

create or replace function public.verschieben_beantragen(p_tabelle text, p_id uuid, p_nach text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  aktuell text;
  titel text;
  neu uuid;
begin
  if auth.uid() is null or not public.verschieben_recht(p_tabelle) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if p_nach not in ('offiziell', 'inoffiziell') then raise exception 'Unbekannter Teil'; end if;
  execute format('select bereich, %s from public.%I where id = $1',
                 case p_tabelle when 'ranking_kategorien' then 'titel' else 'text' end, p_tabelle)
    into aktuell, titel using p_id;
  if aktuell is null then raise exception 'Nicht gefunden'; end if;
  if aktuell = p_nach then raise exception 'Ist schon %', p_nach; end if;
  -- Vorher prüfen, ob der Text in den Zielteil darf (Wortfilter), damit
  -- niemand umsonst zustimmt.
  if p_nach = 'offiziell' and public.wf_bereich_an(public.wf_bereich(p_tabelle))
     and public.wortfilter_treffer(titel) is not null then
    raise exception 'Kann nicht offiziell werden: enthält „%“. Bitte zuerst umformulieren.',
      public.wf_maske(public.wortfilter_treffer(titel)) using errcode = 'P0420';
  end if;
  select id into neu from public.verschiebungen where tabelle = p_tabelle and ziel_id = p_id and erledigt_at is null;
  if neu is null then
    insert into public.verschiebungen (tabelle, ziel_id, nach, titel) values (p_tabelle, p_id, p_nach, coalesce(titel, ''))
    returning id into neu;
  end if;
  return public.verschieben_zustimmen(neu);
end $$;

-- Antrag zurückziehen / ablehnen (wer verschieben darf)
create or replace function public.verschieben_ablehnen(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.verschiebungen;
begin
  select * into v from public.verschiebungen where id = p_id and erledigt_at is null;
  if not found then return; end if;
  if not public.verschieben_recht(v.tabelle) then raise exception 'Keine Berechtigung' using errcode = '42501'; end if;
  update public.verschiebungen set erledigt_at = now(), abgelehnt = true where id = p_id;
end $$;

-- Offene Anträge mit Zustimmungszahl (für die Verwaltung)
create or replace function public.verschiebungen_offen(p_tabelle text)
returns table (id uuid, ziel_id uuid, nach text, titel text, von uuid, created_at timestamptz,
               stimmen int, noetig int, ich boolean)
language sql stable security definer set search_path = public as $$
  select v.id, v.ziel_id, v.nach, v.titel, v.von, v.created_at,
         (select count(*)::int from public.verschiebung_zustimmungen z where z.verschiebung_id = v.id),
         public.zustimmung_noetig('verschieben'),
         exists (select 1 from public.verschiebung_zustimmungen z where z.verschiebung_id = v.id and z.user_id = auth.uid())
    from public.verschiebungen v
   where v.tabelle = p_tabelle and v.erledigt_at is null and public.verschieben_recht(p_tabelle)
   order by v.created_at
$$;

-- Freigaben: „verschieben“ ist einstellbar (Standard 3)
create or replace function public.bestaetigungen_setzen(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  neu jsonb := '{}'::jsonb;
  k text;
begin
  if public.my_role() <> 'admin' and not exists (select 1 from public.profiles where user_id = auth.uid() and is_op) then
    raise exception 'Nur der Admin legt das fest' using errcode = '42501';
  end if;
  foreach k in array array['termin', 'kosten', 'entsperren', 'zitat', 'foto', 'verschieben'] loop
    if p ? k then neu := neu || jsonb_build_object(k, greatest(1, least((p ->> k)::int, 10))); end if;
  end loop;
  update public.app_settings set bestaetigungen = coalesce(bestaetigungen, '{}'::jsonb) || neu where id = 1
  returning bestaetigungen into neu;
  perform public.audit_schreiben('freigaben.geaendert', 'rechte', null, 'Freigaben',
    'Nötige Zustimmungen geändert: ' || neu::text, neu);
  return neu;
end $$;
update public.app_settings set bestaetigungen = coalesce(bestaetigungen, '{}'::jsonb) || '{"verschieben": 3}'::jsonb
 where id = 1 and not (coalesce(bestaetigungen, '{}'::jsonb) ? 'verschieben');

-- ---------------------------------------------------------------------
-- 4) Gewinner küren
--    bereich  motto | zitate | rankings
--    gruppe   'offiziell' / 'inoffiziell' (Motto, Zitate) bzw. Kategorie-ID
--    art      gewinner | herzen
-- ---------------------------------------------------------------------
create table if not exists public.gewinner (
  bereich text not null check (bereich in ('motto', 'zitate', 'rankings')),
  gruppe text not null,
  art text not null check (art in ('gewinner', 'herzen')),
  ziel_id text not null,
  label text not null,
  unter text not null default '',
  stimmen int,
  gekuert_von uuid default auth.uid(),
  gekuert_at timestamptz not null default now(),
  primary key (bereich, gruppe, art)
);
alter table public.gewinner enable row level security;

create or replace function public.gewinner_recht(p_bereich text)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_bereich
    when 'motto' then public.has_perm('motto.runden') or public.has_perm('motto.verwalten')
    when 'zitate' then public.has_perm('zitate.runden') or public.has_perm('zitate.pruefen')
    when 'rankings' then public.has_perm('rankings.runden') or public.has_perm('rankings.verwalten')
    else false end
$$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'gewinner' and policyname = 'gewinner lesen') then
    -- Gleiche Leute wie beim jeweiligen Bereich; Eltern nie.
    create policy "gewinner lesen" on public.gewinner for select to authenticated
      using (not (select public.ist_eltern()) and (
        (bereich = 'motto' and (select public.has_perm('motto.nutzen') or public.has_perm('motto.verwalten')))
        or (bereich = 'zitate' and (select public.has_perm('zitate.nutzen') or public.has_perm('zitate.pruefen')))
        or (bereich = 'rankings' and (select public.has_perm('rankings.nutzen') or public.has_perm('rankings.verwalten')))));
  end if;
end $$;

create or replace function public.gewinner_kueren(p_bereich text, p_gruppe text, p_art text, p_ziel text,
                                                  p_label text, p_unter text default '', p_stimmen int default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.gewinner_recht(p_bereich) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  insert into public.gewinner (bereich, gruppe, art, ziel_id, label, unter, stimmen)
  values (p_bereich, p_gruppe, p_art, p_ziel, left(p_label, 300), left(coalesce(p_unter, ''), 200), p_stimmen)
  on conflict (bereich, gruppe, art) do update
    set ziel_id = excluded.ziel_id, label = excluded.label, unter = excluded.unter, stimmen = excluded.stimmen,
        gekuert_von = auth.uid(), gekuert_at = now();
  -- Offizielles Motto: zugleich als „unser Abimotto“ festlegen
  if p_bereich = 'motto' and p_gruppe = 'offiziell' and p_art = 'gewinner' then
    update public.motto_vorschlaege set gewaehlt = (id::text = p_ziel),
           gewaehlt_at = case when id::text = p_ziel then now() else null end
     where gewaehlt or id::text = p_ziel;
  end if;
  perform public.audit_schreiben('gewinner.gekuert', 'inhalte', null, p_bereich,
    case p_art when 'herzen' then 'Gewinner der Herzen' else 'Gewinner' end || ': „' || left(p_label, 60) || '“',
    jsonb_build_object('bereich', p_bereich, 'gruppe', p_gruppe, 'art', p_art, 'ziel', p_ziel));
end $$;

create or replace function public.gewinner_zuruecknehmen(p_bereich text, p_gruppe text, p_art text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.gewinner_recht(p_bereich) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  -- Zurücknehmen = leeren Eintrag setzen (ziel_id ''), die App blendet ihn aus.
  update public.gewinner set ziel_id = '', label = '', unter = '', stimmen = null,
         gekuert_von = auth.uid(), gekuert_at = now()
   where bereich = p_bereich and gruppe = p_gruppe and art = p_art;
  if p_bereich = 'motto' and p_gruppe = 'offiziell' and p_art = 'gewinner' then
    update public.motto_vorschlaege set gewaehlt = false, gewaehlt_at = null where gewaehlt;
  end if;
end $$;

-- Das feststehende Motto – für ALLE angemeldeten Zugänge, auch Eltern
-- (für die Enthüllung beim nächsten Öffnen der App).
create or replace function public.motto_enthuellung()
returns table (id uuid, motto text, gewaehlt_at timestamptz, stimmen int)
language sql stable security definer set search_path = public as $$
  select m.id, m.text, coalesce(m.gewaehlt_at, now()),
         (select g.stimmen from public.gewinner g where g.bereich = 'motto' and g.gruppe = 'offiziell' and g.art = 'gewinner')
    from public.motto_vorschlaege m
   where m.gewaehlt and not m.ausgeblendet and auth.uid() is not null
   limit 1
$$;
revoke all on function public.motto_enthuellung() from public, anon;
grant execute on function public.motto_enthuellung() to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'gewinner') then
    alter publication supabase_realtime add table public.gewinner;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'verschiebungen') then
    alter publication supabase_realtime add table public.verschiebungen;
  end if;
end $$;
