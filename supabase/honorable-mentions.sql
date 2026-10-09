-- ============================================================================
-- Honorable Mentions („Sieger der Herzen“) und Ergebnis-Sichtbarkeit
-- (Update 1.3, Nachtrag 09.10.2026)
--
--  1. Abstimmungsrunden bekommen neben den echten Kandidaten optional
--     Honorable Mentions. Die zählen NICHT zur eigentlichen Wahl: eigenes,
--     inoffizielles Voting mit genau 1 Stimme, je Runde abschaltbar.
--  2. Bei jeder Abstimmung wählbar, wer die Ergebnisse sieht: nur das
--     Komitee oder alle. Für Runden je Runde (abstimm_runden.ergebnis_sichtbar),
--     für die laufenden Bereiche Motto/Zitate/Rankings in
--     app_settings.ergebnisse. Umfragen haben es schon je Umfrage.
--
-- Idempotent. Ändert nichts an den bestehenden Stimmen.
-- ============================================================================

-- ------------------------------------------------------------ 1. Honorable Mentions
alter table public.abstimm_runden add column if not exists hm_aktiv boolean not null default false;
alter table public.runden_kandidaten add column if not exists hm boolean not null default false;

-- Neue Fassung mit Honorable Mentions (k.hm) und Sichtbarkeit beim Start.
-- Die alte 6er-Fassung bleibt für die Live-App bestehen.
create or replace function public.runde_starten(
  p_bereich text, p_gruppe text, p_gruppe_titel text, p_titel text, p_stimmen int, p_kandidaten jsonb, p_ergebnis boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r_id uuid;
  n int;
  k jsonb;
  i int := 0;
  n_wahl int;
  n_hm int;
  st int;
begin
  if p_bereich not in ('motto', 'zitate', 'rankings', 'umfragen') then raise exception 'Unbekannter Bereich'; end if;
  if not public.has_perm(p_bereich || '.runden') then raise exception 'Keine Berechtigung' using errcode = '42501'; end if;
  if jsonb_typeof(p_kandidaten) <> 'array' then raise exception 'Bitte Möglichkeiten auswählen'; end if;
  if jsonb_array_length(p_kandidaten) > 60 then raise exception 'Höchstens 60 Möglichkeiten'; end if;
  select count(*) filter (where not coalesce((e ->> 'hm')::boolean, false)),
         count(*) filter (where coalesce((e ->> 'hm')::boolean, false))
    into n_wahl, n_hm
    from jsonb_array_elements(p_kandidaten) e;
  if n_wahl < 2 then raise exception 'Bitte mindestens zwei Möglichkeiten für die Wahl auswählen'; end if;
  if n_hm = 1 then raise exception 'Für den Sieger der Herzen braucht es mindestens zwei Honorable Mentions'; end if;
  st := greatest(1, least(coalesce(p_stimmen, 1), 20, n_wahl - 1));

  update public.abstimm_runden set offen = false, beendet_at = now()
   where bereich = p_bereich and gruppe = coalesce(p_gruppe, '') and offen;
  select coalesce(max(nr), 1) + 1 into n from public.abstimm_runden where bereich = p_bereich and gruppe = coalesce(p_gruppe, '');
  insert into public.abstimm_runden (bereich, gruppe, gruppe_titel, nr, titel, stimmen, ergebnis_sichtbar, hm_aktiv)
  values (p_bereich, coalesce(p_gruppe, ''), left(coalesce(p_gruppe_titel, ''), 200), n,
          left(coalesce(nullif(btrim(p_titel), ''), 'Runde ' || n), 80), st, coalesce(p_ergebnis, false), n_hm >= 2)
  returning id into r_id;
  for k in select * from jsonb_array_elements(p_kandidaten) loop
    i := i + 1;
    insert into public.runden_kandidaten (runde_id, ziel_id, label, unter, sort, hm)
    values (r_id, left(k ->> 'id', 100), left(coalesce(k ->> 'label', '?'), 300), left(coalesce(k ->> 'unter', ''), 200), i,
            coalesce((k ->> 'hm')::boolean, false))
    on conflict do nothing;
  end loop;
  perform public.audit_schreiben('runde.gestartet', 'moderation', null, p_bereich,
    'Abstimmungsrunde ' || n || ' gestartet (' || p_bereich || coalesce(nullif(' · ' || p_gruppe_titel, ' · '), '') || ', '
      || n_wahl || ' Möglichkeiten, ' || st || ' Stimmen je Person'
      || case when n_hm >= 2 then ', ' || n_hm || ' Honorable Mentions' else '' end
      || case when coalesce(p_ergebnis, false) then ', Ergebnis für alle' else ', Ergebnis nur Komitee' end || ')',
    jsonb_build_object('runde', r_id, 'bereich', p_bereich, 'gruppe', p_gruppe));
  return r_id;
end $$;
revoke all on function public.runde_starten(text, text, text, text, int, jsonb, boolean) from public, anon;
grant execute on function public.runde_starten(text, text, text, text, int, jsonb, boolean) to authenticated;

-- Sieger der Herzen in einer laufenden Runde an/aus
create or replace function public.runde_hm_setzen(p_runde uuid, p_an boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r public.abstimm_runden;
begin
  select * into r from public.abstimm_runden where id = p_runde;
  if not found then raise exception 'Runde nicht gefunden'; end if;
  if not public.has_perm(r.bereich || '.runden') then raise exception 'Keine Berechtigung' using errcode = '42501'; end if;
  if p_an and (select count(*) from public.runden_kandidaten where runde_id = p_runde and hm) < 2 then
    raise exception 'Diese Runde hat keine Honorable Mentions';
  end if;
  update public.abstimm_runden set hm_aktiv = coalesce(p_an, hm_aktiv) where id = p_runde;
end $$;
revoke all on function public.runde_hm_setzen(uuid, boolean) from public, anon;
grant execute on function public.runde_hm_setzen(uuid, boolean) to authenticated;

-- Abstimmen: zwei getrennte Töpfe. Wahl = r.stimmen, Sieger der Herzen = 1
-- (eine neue Herzstimme ersetzt die alte). Gibt die übrigen Stimmen im
-- jeweiligen Topf zurück.
create or replace function public.runde_stimme(p_runde uuid, p_ziel text, p_an boolean)
returns int language plpgsql security definer set search_path = public as $$
declare
  r public.abstimm_runden;
  ist_hm boolean;
  schon int;
  grenze int;
begin
  if auth.uid() is null then raise exception 'Bitte anmelden'; end if;
  if public.is_banned() then
    raise exception 'Du bist gerade gesperrt und kannst nichts einreichen, kommentieren oder abstimmen.';
  end if;
  select * into r from public.abstimm_runden where id = p_runde for share;
  if not found or not r.offen then raise exception 'Diese Runde ist schon beendet'; end if;
  if not public.runde_darf_sehen(r.bereich) then raise exception 'Keine Berechtigung' using errcode = '42501'; end if;
  select k.hm into ist_hm from public.runden_kandidaten k where k.runde_id = p_runde and k.ziel_id = p_ziel;
  if not found then raise exception 'Steht in dieser Runde nicht zur Wahl'; end if;
  if ist_hm and not r.hm_aktiv then raise exception 'Der Sieger der Herzen ist gerade ausgeschaltet'; end if;
  grenze := case when ist_hm then 1 else r.stimmen end;
  if p_an then
    if ist_hm then
      -- Nur eine Herzstimme: die alte wandert zum neuen Favoriten
      update public.runden_stimmen s set an = false, at = now()
        from public.runden_kandidaten k
       where s.runde_id = p_runde and s.user_id = auth.uid() and s.an and s.ziel_id <> p_ziel
         and k.runde_id = s.runde_id and k.ziel_id = s.ziel_id and k.hm;
    else
      select count(*) into schon
        from public.runden_stimmen s join public.runden_kandidaten k on k.runde_id = s.runde_id and k.ziel_id = s.ziel_id
       where s.runde_id = p_runde and s.user_id = auth.uid() and s.an and s.ziel_id <> p_ziel and not k.hm;
      if schon >= grenze then
        raise exception 'Du hast schon alle % Stimmen vergeben – nimm erst eine zurück.', grenze;
      end if;
    end if;
  end if;
  insert into public.runden_stimmen (runde_id, ziel_id, user_id, an, at)
  values (p_runde, p_ziel, auth.uid(), p_an, now())
  on conflict (runde_id, ziel_id, user_id) do update set an = excluded.an, at = now();
  select grenze - count(*) into schon
    from public.runden_stimmen s join public.runden_kandidaten k on k.runde_id = s.runde_id and k.ziel_id = s.ziel_id
   where s.runde_id = p_runde and s.user_id = auth.uid() and s.an and k.hm = ist_hm;
  return schon;
end $$;
revoke all on function public.runde_stimme(uuid, text, boolean) from public, anon;
grant execute on function public.runde_stimme(uuid, text, boolean) to authenticated;

-- Zahlen: „personen“ zählt je Topf (Wahl bzw. Sieger der Herzen) getrennt
create or replace function public.runde_zahlen(p_runde uuid)
returns table (ziel_id text, n int, personen int) language plpgsql stable security definer set search_path = public as $$
declare r public.abstimm_runden;
begin
  select * into r from public.abstimm_runden a where a.id = p_runde;
  if not found then return; end if;
  if not (public.has_perm(r.bereich || '.runden') or (r.ergebnis_sichtbar and public.runde_darf_sehen(r.bereich))) then
    return;
  end if;
  return query
    select k.ziel_id,
           (select count(*)::int from public.runden_stimmen s where s.runde_id = p_runde and s.ziel_id = k.ziel_id and s.an),
           (select count(distinct s.user_id)::int
              from public.runden_stimmen s join public.runden_kandidaten k2 on k2.runde_id = s.runde_id and k2.ziel_id = s.ziel_id
             where s.runde_id = p_runde and s.an and k2.hm = k.hm)
      from public.runden_kandidaten k where k.runde_id = p_runde;
end $$;
revoke all on function public.runde_zahlen(uuid) from public, anon;
grant execute on function public.runde_zahlen(uuid) to authenticated;

-- ------------------------------------------------------------ 2. Ergebnis-Sichtbarkeit
-- Standard wie bisher: Motto nur Komitee, Zitate und Rankings für alle
alter table public.app_settings add column if not exists ergebnisse jsonb not null
  default '{"motto": false, "zitate": true, "rankings": true}'::jsonb;

-- Wer gehört für die Ergebnisse eines Bereichs zum Komitee? (Admin über has_perm)
create or replace function public.ergebnis_komitee(b text)
returns boolean language sql stable security definer set search_path = public as $$
  select case b
    when 'motto' then public.has_perm('motto.verwalten') or public.has_perm('motto.runden')
    when 'zitate' then public.has_perm('zitate.pruefen') or public.has_perm('zitate.runden')
    when 'rankings' then public.has_perm('rankings.verwalten') or public.has_perm('rankings.runden')
    when 'umfragen' then public.has_perm('umfragen.ergebnisse') or public.has_perm('umfragen.verwalten') or public.has_perm('umfragen.runden')
    else false end
$$;

create or replace function public.ergebnis_fuer_alle(b text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (ergebnisse ->> b)::boolean from public.app_settings where id = 1), b <> 'motto')
$$;

create or replace function public.ergebnis_darf(b text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and not public.ist_eltern()
     and (public.ergebnis_komitee(b) or (public.ergebnis_fuer_alle(b) and public.runde_darf_sehen(b)))
$$;
revoke all on function public.ergebnis_komitee(text) from public, anon;
revoke all on function public.ergebnis_fuer_alle(text) from public, anon;
revoke all on function public.ergebnis_darf(text) from public, anon;
grant execute on function public.ergebnis_komitee(text) to authenticated;
grant execute on function public.ergebnis_fuer_alle(text) to authenticated;
grant execute on function public.ergebnis_darf(text) to authenticated;

create or replace function public.ergebnisse_setzen(p_bereich text, p_alle boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare neu jsonb;
begin
  if p_bereich not in ('motto', 'zitate', 'rankings') then raise exception 'Unbekannter Bereich'; end if;
  if not public.ergebnis_komitee(p_bereich) then raise exception 'Keine Berechtigung' using errcode = '42501'; end if;
  update public.app_settings set ergebnisse = coalesce(ergebnisse, '{}'::jsonb) || jsonb_build_object(p_bereich, coalesce(p_alle, false))
   where id = 1 returning ergebnisse into neu;
  perform public.audit_schreiben('ergebnisse.sichtbarkeit', 'moderation', null, p_bereich,
    'Ergebnisse ' || p_bereich || ': ' || case when p_alle then 'für alle sichtbar' else 'nur Komitee' end,
    jsonb_build_object('bereich', p_bereich, 'alle', p_alle));
  return neu;
end $$;
revoke all on function public.ergebnisse_setzen(text, boolean) from public, anon;
grant execute on function public.ergebnisse_setzen(text, boolean) to authenticated;

-- Gezählte Stimmen eines Bereichs – ohne zu verraten, wer was gewählt hat.
-- Leer, wenn man die Ergebnisse nicht sehen darf.
create or replace function public.stimmen_zahlen(p_bereich text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if p_bereich not in ('motto', 'zitate') or not public.ergebnis_darf(p_bereich) then
    return jsonb_build_object('sichtbar', false, 'zahlen', '{}'::jsonb, 'personen', 0);
  end if;
  if p_bereich = 'motto' then
    return jsonb_build_object('sichtbar', true,
      'zahlen', coalesce((select jsonb_object_agg(vorschlag_id, n) from (
          select vorschlag_id, count(*) n from public.motto_stimmen where an and art = 'like' group by vorschlag_id) t), '{}'::jsonb),
      'personen', (select count(distinct user_id) from public.motto_stimmen where an and art = 'like'));
  end if;
  return jsonb_build_object('sichtbar', true,
    'zahlen', coalesce((select jsonb_object_agg(zitat_id, n) from (
        select zitat_id, count(*) n from public.zitat_stimmen where an group by zitat_id) t), '{}'::jsonb),
    'personen', (select count(distinct user_id) from public.zitat_stimmen where an));
end $$;
revoke all on function public.stimmen_zahlen(text) from public, anon;
grant execute on function public.stimmen_zahlen(text) to authenticated;

-- Rankings: Top 3 nur, wenn man die Ergebnisse sehen darf
create or replace function public.ranking_stand()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not (public.has_perm('rankings.nutzen') or public.has_perm('rankings.verwalten')) or public.ist_eltern()
    then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
      'kategorie_id', k.id,
      'stimmen', (select count(*) from public.ranking_stimmen s where s.kategorie_id = k.id and s.ziel is not null),
      'top', case when public.ergebnis_darf('rankings') then coalesce((
        select jsonb_agg(jsonb_build_object('ziel', t.ziel, 'n', t.n) order by t.n desc)
          from (select s.ziel, count(*) n from public.ranking_stimmen s
                 where s.kategorie_id = k.id and s.ziel is not null
                 group by s.ziel order by count(*) desc limit 3) t), '[]'::jsonb) else '[]'::jsonb end))
      from public.ranking_kategorien k), '[]'::jsonb) end
$$;
