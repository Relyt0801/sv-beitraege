-- =====================================================================
-- Abstimmungsrunden, Freigaben mit mehreren Zustimmungen, Wortfilter je
-- Bereich, Autor-Info nur fürs Komitee, eigenes Hintergrundbild (09.10.2026)
--
--  1. Neue Rechte (Komitee-tauglich):
--       <bereich>.runden   Abstimmungsrunden starten/beenden
--                          (motto, zitate, rankings, umfragen)
--       funktion.<name>    eine Funktion an/aus schalten (sonst nur
--                          funktionen.verwalten)
--  2. Wortfilter je Bereich an/aus (app_settings.wortfilter_bereiche).
--     Zitate sind standardmäßig aus. Links und lange IDs (Spotify) zählen nie.
--  3. Abstimmungsrunden: engere Auswahl mit einstellbarer Stimmenzahl.
--  4. Freigaben: Termine, Kosten, Entsperren und Zitate brauchen so viele
--     Zustimmungen, wie der Admin festlegt. Nachträge: der Admin legt fest,
--     wer sie bearbeitet.
--  5. Wer ein Motto/Zitat eingereicht hat, sieht nur, wer es verwaltet
--     (autor_info). Die Namensspalten sind für alle anderen nicht lesbar.
--  6. Hintergrundbild: privater Speicher, nur das eigene Konto.
-- Ohne DELETE/DROP-Anweisungen.
-- =====================================================================

-- ------------------------------------------------------------ 1. Rechte
insert into public.komitee_rechte (tag, perm, allowed) values
  ('motto-pullis', 'motto.runden', true),
  ('motto-pullis', 'funktion.motto', true),
  ('abizeitung', 'zitate.runden', true),
  ('abizeitung', 'rankings.runden', true),
  ('abizeitung', 'funktion.zitate', true),
  ('abizeitung', 'funktion.rankings', true),
  ('abizeitung', 'funktion.album', true)
on conflict do nothing;

create or replace function public.funktion_setzen(p_name text, p_an boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare neu jsonb;
begin
  if p_name not in ('abiball', 'album', 'zitate', 'umfragen', 'rankings', 'spotify', 'motto') then
    raise exception 'Unbekannte Funktion';
  end if;
  if not (public.has_perm('funktionen.verwalten') or public.has_perm('funktion.' || p_name)) then
    raise exception 'Keine Berechtigung';
  end if;
  update public.app_settings set funktionen = coalesce(funktionen, '{}'::jsonb) || jsonb_build_object(p_name, p_an)
   where id = 1 returning funktionen into neu;
  perform public.audit_schreiben('funktion.geschaltet', 'rechte', null, p_name,
    'Funktion „' || p_name || '“ ' || case when p_an then 'eingeschaltet' else 'ausgeschaltet' end,
    jsonb_build_object('funktion', p_name, 'an', p_an));
  return neu;
end $$;

-- ------------------------------------------------------------ 2. Wortfilter je Bereich
alter table public.app_settings add column if not exists wortfilter_bereiche jsonb not null default '{"zitate": false}'::jsonb;

create or replace function public.wf_bereich(t text)
returns text language sql immutable set search_path = public as $$
  select case
    when t in ('topic_items', 'topics') then 'chat'
    when t = 'album_kommentare' then 'kommentare'
    when t in ('album_steckbriefe', 'album_kategorien') then 'steckbrief'
    when t = 'motto_vorschlaege' then 'motto'
    when t = 'zitate' then 'zitate'
    when t = 'ranking_kategorien' then 'rankings'
    when t in ('umfragen', 'umfrage_fragen', 'umfrage_antworten') then 'umfragen'
    when t in ('termine', 'events', 'eltern_infos') then 'team'
    else 'anfragen' end
$$;

create or replace function public.wf_bereich_an(b text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (wortfilter_bereiche ->> b)::boolean from public.app_settings where id = 1), b <> 'zitate')
$$;

-- Wer darf den Filter für einen Bereich schalten?
create or replace function public.wf_bereich_recht(b text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_perm('wortfilter.verwalten')
      or (b = 'motto' and public.has_perm('motto.verwalten'))
      or (b = 'zitate' and public.has_perm('zitate.pruefen'))
      or (b = 'rankings' and public.has_perm('rankings.verwalten'))
      or (b = 'umfragen' and public.has_perm('umfragen.verwalten'))
      or (b in ('steckbrief', 'kommentare') and public.has_perm('album.moderieren'))
$$;

create or replace function public.wortfilter_bereich_setzen(p_bereich text, p_an boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare neu jsonb;
begin
  if p_bereich not in ('chat', 'kommentare', 'steckbrief', 'motto', 'zitate', 'rankings', 'umfragen', 'anfragen', 'team') then
    raise exception 'Unbekannter Bereich';
  end if;
  if not public.wf_bereich_recht(p_bereich) then
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
revoke all on function public.wortfilter_bereich_setzen(text, boolean) from public, anon;
grant execute on function public.wortfilter_bereich_setzen(text, boolean) to authenticated;

create or replace function public.wortfilter_pruefen()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  spalte text;
  wert jsonb;
  neu text;
  hit text;
begin
  if coalesce(current_setting('sv.wiederherstellung', true), '') = '1' then return new; end if;
  -- Bereich ausgeschaltet (z. B. Zitate: dort prüft das Team selbst)
  if not public.wf_bereich_an(public.wf_bereich(tg_table_name)) then return new; end if;
  foreach spalte in array tg_argv loop
    wert := to_jsonb(new) -> spalte;
    if tg_op = 'UPDATE' and wert is not distinct from (to_jsonb(old) -> spalte) then continue; end if;
    if wert is null or jsonb_typeof(wert) = 'null' then continue; end if;
    if jsonb_typeof(wert) = 'string' then
      neu := wert #>> '{}';
    else
      select string_agg(x #>> '{}', ' ') into neu from jsonb_path_query(wert, '$.** ? (@.type() == "string")') x;
    end if;
    hit := public.wortfilter_treffer(neu);
    if hit is not null then
      raise exception 'Bitte ohne beleidigende Wörter formulieren („%“).', public.wf_maske(hit)
        using errcode = 'P0420';
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.wortfilter_pruefen() from public, anon, authenticated;

create or replace trigger wortfilter before insert or update on public.zitate
  for each row execute function public.wortfilter_pruefen('text', 'wer', 'kontext');

-- Links und IDs entfernen, bevor geprüft wird. Eine Spotify-ID wie
-- „0FDzzruyVECATHXKHFs9eJ“ enthält sonst zufällig gesperrte Buchstabenfolgen.
create or replace function public.wf_ohne_links(p text)
returns text language plpgsql immutable set search_path = public as $$
declare
  t text := coalesce(p, '');
  m text;
begin
  t := regexp_replace(t, '(https?://|www\.)\S+', ' ', 'gi');
  t := regexp_replace(t, '\S*open\.spotify\.com\S*|spotify:\S+|\S*spotify\.link\S*', ' ', 'gi');
  t := regexp_replace(t, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', ' ', 'gi');
  -- Lange Kennungen: ab 16 Zeichen und gemischt aus mind. 3 Groß-, 3 Kleinbuchstaben
  -- und 2 Ziffern. Normale Wörter (auch „Hurensohn123“) fallen nicht darunter.
  for m in select (regexp_matches(t, '[A-Za-z0-9]{16,}', 'g'))[1] loop
    if length(regexp_replace(m, '[^A-Z]', '', 'g')) >= 3
       and length(regexp_replace(m, '[^a-z]', '', 'g')) >= 3
       and length(regexp_replace(m, '[^0-9]', '', 'g')) >= 2 then
      t := replace(t, m, ' ');
    end if;
  end loop;
  return t;
end $$;

create or replace function public.wortfilter_treffer(p_text text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v text;
  toks text[];
  t text;
  nxt text;
  cand text[] := '{}';
  spans int[] := '{}';
  i int;
  n int;
  run text;
  hit text;
begin
  if p_text is null or btrim(p_text) = '' then return null; end if;
  p_text := public.wf_ohne_links(p_text);
  hit := public.wortfilter_zeichen_treffer(p_text);
  if hit is not null then return hit; end if;
  foreach v in array array[public.wf_norm(p_text, false), public.wf_norm(p_text, true)] loop
    toks := array_remove(regexp_split_to_array(v, '[^a-z*#]+'), '');
    n := coalesce(array_length(toks, 1), 0);
    run := '';
    for i in 1..n loop
      t := public.wf_kand(toks[i]);
      cand := cand || t;
      spans := spans || 0;
      if i < n then
        nxt := public.wf_kand(toks[i + 1]);
        cand := cand || public.wf_kand(t || nxt);
        spans := spans || case when least(length(t), length(nxt)) <= 3 then length(t) else -1 end;
      end if;
      if length(t) = 1 then
        run := run || t;
      else
        if length(run) >= 3 then cand := cand || public.wf_kand(run); spans := spans || 0; end if;
        run := '';
      end if;
    end loop;
    if length(run) >= 3 then cand := cand || public.wf_kand(run); spans := spans || 0; end if;
  end loop;

  select w.wort into hit
    from unnest(cand, spans) as c(t, span)
    join public.wortfilter w on w.aktiv and w.stufe = 'block'
   where not exists (select 1 from public.wortfilter e where e.aktiv and e.stufe = 'erlaubt' and e.norm = c.t)
     and (
       (c.span = -1 and w.modus = 'wort' and c.t = w.norm)
       or (c.span >= 0 and c.t !~ '[*#]' and (
            (w.modus = 'wort' and c.t ~ ('^' || w.norm || '(e|en|er|es|em|n|s|in|inen|i|o)?$'))
         or (w.modus = 'anfang' and left(c.t, length(w.norm)) = w.norm and (c.span = 0 or length(w.norm) > c.span))
         or (w.modus = 'ueberall' and strpos(c.t, w.norm) > 0
             and (c.span = 0 or (strpos(c.t, w.norm) <= c.span and strpos(c.t, w.norm) + length(w.norm) - 1 > c.span)))
       ))
       or (c.span = 0 and c.t ~ '[*#]' and length(c.t) >= 3 and length(regexp_replace(c.t, '[*#]', '', 'g')) >= 2
           and exists (select 1 from unnest(array['', 'e', 'en', 'er', 'es', 'n', 's', 'in', 'ing', 'ed']) sfx
                        where right(c.t, length(sfx)) = sfx and length(c.t) - length(sfx) >= 3
                          and w.norm ~ ('^' || regexp_replace(left(c.t, length(c.t) - length(sfx)), '[*#]', '[a-z]{0,4}', 'g') || '$')))
     )
   limit 1;
  return hit;
end $$;
revoke all on function public.wortfilter_treffer(text) from public, anon;
grant execute on function public.wortfilter_treffer(text) to authenticated;

-- Wörter löschen (nicht nur ausschalten)
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'wortfilter' and policyname = 'wortfilter entfernen') then
    create policy "wortfilter entfernen" on public.wortfilter for delete to authenticated
      using ((select public.has_perm('wortfilter.verwalten')));
  end if;
end $$;

-- ------------------------------------------------------------ 3. Abstimmungsrunden
create table if not exists public.abstimm_runden (
  id uuid primary key default gen_random_uuid(),
  bereich text not null check (bereich in ('motto', 'zitate', 'rankings', 'umfragen')),
  gruppe text not null default '',          -- Ranking-Kategorie bzw. Umfrage-Frage
  gruppe_titel text not null default '',
  nr int not null default 2,
  titel text not null default '' check (char_length(titel) <= 80),
  stimmen int not null default 1 check (stimmen between 1 and 20),
  offen boolean not null default true,
  ergebnis_sichtbar boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  beendet_at timestamptz
);
create unique index if not exists abstimm_runden_eine_offene on public.abstimm_runden (bereich, gruppe) where offen;
alter table public.abstimm_runden enable row level security;

create table if not exists public.runden_kandidaten (
  runde_id uuid not null references public.abstimm_runden (id) on delete cascade,
  ziel_id text not null,
  label text not null check (char_length(label) <= 300),
  unter text not null default '' check (char_length(unter) <= 200),
  sort int not null default 0,
  primary key (runde_id, ziel_id)
);
alter table public.runden_kandidaten enable row level security;

create table if not exists public.runden_stimmen (
  runde_id uuid not null references public.abstimm_runden (id) on delete cascade,
  ziel_id text not null,
  user_id uuid not null default auth.uid(),
  an boolean not null default true,
  at timestamptz not null default now(),
  primary key (runde_id, ziel_id, user_id)
);
alter table public.runden_stimmen enable row level security;

create or replace function public.runde_darf_sehen(b text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and case
    when b = 'umfragen' then not public.ist_eltern()
    else public.has_perm(b || '.nutzen') or public.has_perm(b || '.runden') end
$$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'abstimm_runden' and policyname = 'runden lesen') then
    create policy "runden lesen" on public.abstimm_runden for select to authenticated
      using ((select public.runde_darf_sehen(bereich)));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'runden_kandidaten' and policyname = 'kandidaten lesen') then
    create policy "kandidaten lesen" on public.runden_kandidaten for select to authenticated
      using (exists (select 1 from public.abstimm_runden r where r.id = runde_id and public.runde_darf_sehen(r.bereich)));
  end if;
  -- Eigene Stimmen sieht jede/r, alle Stimmen nur, wer die Runden leitet
  if not exists (select 1 from pg_policies where tablename = 'runden_stimmen' and policyname = 'runden stimmen lesen') then
    create policy "runden stimmen lesen" on public.runden_stimmen for select to authenticated
      using (user_id = (select auth.uid())
             or exists (select 1 from public.abstimm_runden r where r.id = runde_id and public.has_perm(r.bereich || '.runden')));
  end if;
end $$;

create or replace function public.runde_starten(
  p_bereich text, p_gruppe text, p_gruppe_titel text, p_titel text, p_stimmen int, p_kandidaten jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r_id uuid;
  n int;
  k jsonb;
  i int := 0;
begin
  if p_bereich not in ('motto', 'zitate', 'rankings', 'umfragen') then raise exception 'Unbekannter Bereich'; end if;
  if not public.has_perm(p_bereich || '.runden') then raise exception 'Keine Berechtigung' using errcode = '42501'; end if;
  if jsonb_typeof(p_kandidaten) <> 'array' or jsonb_array_length(p_kandidaten) < 2 then
    raise exception 'Bitte mindestens zwei Möglichkeiten auswählen';
  end if;
  if jsonb_array_length(p_kandidaten) > 50 then raise exception 'Höchstens 50 Möglichkeiten'; end if;
  update public.abstimm_runden set offen = false, beendet_at = now()
   where bereich = p_bereich and gruppe = coalesce(p_gruppe, '') and offen;
  select coalesce(max(nr), 1) + 1 into n from public.abstimm_runden where bereich = p_bereich and gruppe = coalesce(p_gruppe, '');
  insert into public.abstimm_runden (bereich, gruppe, gruppe_titel, nr, titel, stimmen)
  values (p_bereich, coalesce(p_gruppe, ''), left(coalesce(p_gruppe_titel, ''), 200), n,
          left(coalesce(nullif(btrim(p_titel), ''), 'Runde ' || n), 80), greatest(1, least(coalesce(p_stimmen, 1), 20)))
  returning id into r_id;
  for k in select * from jsonb_array_elements(p_kandidaten) loop
    i := i + 1;
    insert into public.runden_kandidaten (runde_id, ziel_id, label, unter, sort)
    values (r_id, left(k ->> 'id', 100), left(coalesce(k ->> 'label', '?'), 300), left(coalesce(k ->> 'unter', ''), 200), i)
    on conflict do nothing;
  end loop;
  perform public.audit_schreiben('runde.gestartet', 'moderation', null, p_bereich,
    'Abstimmungsrunde ' || n || ' gestartet (' || p_bereich || coalesce(nullif(' · ' || p_gruppe_titel, ' · '), '') || ', '
      || jsonb_array_length(p_kandidaten) || ' Möglichkeiten, ' || greatest(1, least(coalesce(p_stimmen, 1), 20)) || ' Stimmen je Person)',
    jsonb_build_object('runde', r_id, 'bereich', p_bereich, 'gruppe', p_gruppe));
  return r_id;
end $$;
revoke all on function public.runde_starten(text, text, text, text, int, jsonb) from public, anon;
grant execute on function public.runde_starten(text, text, text, text, int, jsonb) to authenticated;

create or replace function public.runde_aendern(p_runde uuid, p_stimmen int, p_offen boolean, p_ergebnis boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r public.abstimm_runden;
begin
  select * into r from public.abstimm_runden where id = p_runde;
  if not found then raise exception 'Runde nicht gefunden'; end if;
  if not public.has_perm(r.bereich || '.runden') then raise exception 'Keine Berechtigung' using errcode = '42501'; end if;
  update public.abstimm_runden
     set stimmen = greatest(1, least(coalesce(p_stimmen, stimmen), 20)),
         offen = coalesce(p_offen, offen) and offen,   -- beendet bleibt beendet
         beendet_at = case when coalesce(p_offen, offen) = false and offen then now() else beendet_at end,
         ergebnis_sichtbar = coalesce(p_ergebnis, ergebnis_sichtbar)
   where id = p_runde;
  if p_offen = false and r.offen then
    perform public.audit_schreiben('runde.beendet', 'moderation', null, r.bereich,
      'Abstimmungsrunde ' || r.nr || ' beendet (' || r.bereich || ')', jsonb_build_object('runde', p_runde));
  end if;
end $$;
revoke all on function public.runde_aendern(uuid, int, boolean, boolean) from public, anon;
grant execute on function public.runde_aendern(uuid, int, boolean, boolean) to authenticated;

-- Abstimmen: an/aus. Gibt die übrigen Stimmen zurück.
create or replace function public.runde_stimme(p_runde uuid, p_ziel text, p_an boolean)
returns int language plpgsql security definer set search_path = public as $$
declare
  r public.abstimm_runden;
  schon int;
begin
  if auth.uid() is null then raise exception 'Bitte anmelden'; end if;
  if public.is_banned() then
    raise exception 'Du bist gerade gesperrt und kannst nichts einreichen, kommentieren oder abstimmen.';
  end if;
  select * into r from public.abstimm_runden where id = p_runde for share;
  if not found or not r.offen then raise exception 'Diese Runde ist schon beendet'; end if;
  if not public.runde_darf_sehen(r.bereich) then raise exception 'Keine Berechtigung' using errcode = '42501'; end if;
  if not exists (select 1 from public.runden_kandidaten where runde_id = p_runde and ziel_id = p_ziel) then
    raise exception 'Steht in dieser Runde nicht zur Wahl';
  end if;
  if p_an then
    select count(*) into schon from public.runden_stimmen
     where runde_id = p_runde and user_id = auth.uid() and an and ziel_id <> p_ziel;
    if schon >= r.stimmen then
      raise exception 'Du hast schon alle % Stimmen vergeben – nimm erst eine zurück.', r.stimmen;
    end if;
  end if;
  insert into public.runden_stimmen (runde_id, ziel_id, user_id, an, at)
  values (p_runde, p_ziel, auth.uid(), p_an, now())
  on conflict (runde_id, ziel_id, user_id) do update set an = excluded.an, at = now();
  select r.stimmen - count(*) into schon from public.runden_stimmen where runde_id = p_runde and user_id = auth.uid() and an;
  return schon;
end $$;
revoke all on function public.runde_stimme(uuid, text, boolean) from public, anon;
grant execute on function public.runde_stimme(uuid, text, boolean) to authenticated;

-- Zahlen: wer die Runden leitet immer, alle anderen nur, wenn freigegeben
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
    select k.ziel_id, (select count(*)::int from public.runden_stimmen s where s.runde_id = p_runde and s.ziel_id = k.ziel_id and s.an),
           (select count(distinct s.user_id)::int from public.runden_stimmen s where s.runde_id = p_runde and s.an)
      from public.runden_kandidaten k where k.runde_id = p_runde;
end $$;
revoke all on function public.runde_zahlen(uuid) from public, anon;
grant execute on function public.runde_zahlen(uuid) to authenticated;

-- ------------------------------------------------------------ 4. Freigaben
alter table public.app_settings add column if not exists bestaetigungen jsonb not null default '{}'::jsonb;

create table if not exists public.anfrage_zustimmungen (
  art text not null check (art in ('termin', 'kosten', 'entsperren', 'zitat')),
  anfrage_id uuid not null,
  user_id uuid not null default auth.uid(),
  at timestamptz not null default now(),
  primary key (art, anfrage_id, user_id)
);
alter table public.anfrage_zustimmungen enable row level security;

create or replace function public.zustimmung_recht(p_art text)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_art
    when 'termin' then public.ist_team() or public.has_perm('termine.manage')
    when 'kosten' then public.has_perm('finanzen.manage')
    when 'entsperren' then public.ist_team() or public.has_perm('mod.timeout')
    when 'zitat' then public.has_perm('zitate.pruefen')
    else false end
$$;

create or replace function public.zustimmung_noetig(p_art text)
returns int language sql stable security definer set search_path = public as $$
  select greatest(1, least(coalesce((select (bestaetigungen ->> p_art)::int from public.app_settings where id = 1), 1), 10))
$$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'anfrage_zustimmungen' and policyname = 'zustimmungen lesen') then
    create policy "zustimmungen lesen" on public.anfrage_zustimmungen for select to authenticated
      using ((select public.zustimmung_recht(art)));
  end if;
end $$;

-- Zustimmen. fertig = genug Zustimmungen, dann darf entschieden werden.
create or replace function public.zustimmen(p_art text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  z int;
  noetig int := public.zustimmung_noetig(p_art);
begin
  if auth.uid() is null or not public.zustimmung_recht(p_art) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  insert into public.anfrage_zustimmungen (art, anfrage_id, user_id) values (p_art, p_id, auth.uid())
  on conflict do nothing;
  select count(*) into z from public.anfrage_zustimmungen where art = p_art and anfrage_id = p_id;
  if noetig > 1 then
    perform public.audit_schreiben('anfrage.zustimmung', 'anfragen', null, p_art,
      'Zustimmung ' || z || '/' || noetig || ' (' || p_art || ')', jsonb_build_object('art', p_art, 'id', p_id));
  end if;
  return jsonb_build_object('stimmen', z, 'noetig', noetig, 'fertig', z >= noetig);
end $$;
revoke all on function public.zustimmen(text, uuid) from public, anon;
grant execute on function public.zustimmen(text, uuid) to authenticated;

create or replace function public.zustimmung_pruefen(p_art text, p_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  noetig int := public.zustimmung_noetig(p_art);
  z int;
begin
  if noetig <= 1 then return; end if;
  select count(*) into z from public.anfrage_zustimmungen where art = p_art and anfrage_id = p_id;
  if z < noetig then
    raise exception 'Es fehlen noch Zustimmungen (% von %).', z, noetig using errcode = 'P0421';
  end if;
end $$;

create or replace function public.zustimmung_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'termin_requests' and old.status = 'offen' and new.status = 'angenommen' then
    perform public.zustimmung_pruefen('termin', new.id);
  elsif tg_table_name = 'unban_requests' and old.status = 'offen' and new.status = 'angenommen' then
    perform public.zustimmung_pruefen('entsperren', new.id);
  elsif tg_table_name = 'zitate' and old.status <> 'frei' and new.status = 'frei' then
    perform public.zustimmung_pruefen('zitat', new.id);
  elsif tg_table_name = 'kosten_anfragen' and old.status = 'offen' and new.status = 'genehmigt' then
    perform public.zustimmung_pruefen('kosten', new.id);
  end if;
  return new;
end $$;
create or replace trigger zustimmung before update on public.termin_requests for each row execute function public.zustimmung_trigger();
create or replace trigger zustimmung before update on public.unban_requests for each row execute function public.zustimmung_trigger();
create or replace trigger zustimmung before update on public.zitate for each row execute function public.zustimmung_trigger();
create or replace trigger zustimmung before update on public.kosten_anfragen for each row execute function public.zustimmung_trigger();

create or replace function public.bestaetigungen_setzen(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  neu jsonb := '{}'::jsonb;
  k text;
begin
  if public.my_role() <> 'admin' and not exists (select 1 from public.profiles where user_id = auth.uid() and is_op) then
    raise exception 'Nur der Admin legt das fest' using errcode = '42501';
  end if;
  foreach k in array array['termin', 'kosten', 'entsperren', 'zitat'] loop
    if p ? k then neu := neu || jsonb_build_object(k, greatest(1, least((p ->> k)::int, 10))); end if;
  end loop;
  update public.app_settings set bestaetigungen = coalesce(bestaetigungen, '{}'::jsonb) || neu where id = 1
  returning bestaetigungen into neu;
  perform public.audit_schreiben('freigaben.geaendert', 'rechte', null, 'Freigaben',
    'Nötige Zustimmungen geändert: ' || neu::text, neu);
  return neu;
end $$;
revoke all on function public.bestaetigungen_setzen(jsonb) from public, anon;
grant execute on function public.bestaetigungen_setzen(jsonb) to authenticated;

-- Nachträge: wer bearbeitet? Leer = alle aus dem Team bzw. mit „Beteiligungen eintragen“
create table if not exists public.nachtrag_bearbeiter (
  user_id uuid primary key,
  added_at timestamptz not null default now()
);
alter table public.nachtrag_bearbeiter enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'nachtrag_bearbeiter' and policyname = 'bearbeiter lesen') then
    create policy "bearbeiter lesen" on public.nachtrag_bearbeiter for select to authenticated using (true);
    create policy "bearbeiter anlegen" on public.nachtrag_bearbeiter for insert to authenticated
      with check ((select public.my_role()) = 'admin');
    create policy "bearbeiter entfernen" on public.nachtrag_bearbeiter for delete to authenticated
      using ((select public.my_role()) = 'admin');
  end if;
end $$;

create or replace function public.darf_nachtraege()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and case
    when exists (select 1 from public.nachtrag_bearbeiter)
      then public.my_role() = 'admin' or exists (select 1 from public.nachtrag_bearbeiter where user_id = auth.uid())
    else public.ist_team() or public.has_perm('hilfen.edit') end
$$;

alter policy "nachtrag lesen" on public.mithilfe_nachtraege
  using ((user_id = (select auth.uid())) or (select public.ist_team()) or (select public.has_perm('hilfen.edit')) or (select public.darf_nachtraege()));

create or replace function public.nachtrag_entscheiden(p_id uuid, p_annehmen boolean, p_punkte integer default null, p_antwort text default '')
returns integer language plpgsql security definer set search_path = public as $$
declare
  n public.mithilfe_nachtraege;
  pkt int;
begin
  if not public.darf_nachtraege() then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select * into n from public.mithilfe_nachtraege where id = p_id for update;
  if not found then raise exception 'Antrag nicht gefunden' using errcode = 'P0002'; end if;
  if n.status <> 'offen' then return 0; end if;

  if p_annehmen then
    pkt := coalesce(p_punkte, n.punkte);
    if pkt is null or pkt < 0 or pkt > 100 then
      raise exception 'Bitte einen Wert zwischen 0 und 100 angeben' using errcode = '22023';
    end if;
    perform set_config('sv.mithilfe_quelle', 'nachtrag', true);
    insert into public.contributions (student_id, titel, punkte, datum)
    values (n.student_id, n.titel, pkt, n.datum);
    perform set_config('sv.mithilfe_quelle', '', true);
  end if;

  update public.mithilfe_nachtraege
     set status = case when p_annehmen then 'angenommen' else 'abgelehnt' end,
         antwort = left(coalesce(p_antwort, ''), 300),
         vergeben = case when p_annehmen then pkt end,
         decided_by = auth.uid(), decided_at = now()
   where id = p_id;
  return coalesce(pkt, 0);
end $$;

-- ------------------------------------------------------------ 5. Autor-Info
create or replace function public.autor_info(p_art text, p_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare n text;
begin
  if p_art = 'motto' then
    if not public.has_perm('motto.verwalten') then return null; end if;
    select coalesce(nullif(public.audit_name(m.von), ''), m.von_name) into n from public.motto_vorschlaege m where m.id = p_id;
  elsif p_art = 'zitat' then
    if not public.has_perm('zitate.pruefen') then return null; end if;
    select coalesce(nullif(public.audit_name(z.eingereicht_von), ''), z.eingereicht_name) into n from public.zitate z where z.id = p_id;
  end if;
  return n;
end $$;
revoke all on function public.autor_info(text, uuid) from public, anon;
grant execute on function public.autor_info(text, uuid) to authenticated;

-- Eigene Einträge (statt die Einreicher-Spalte für alle lesbar zu lassen)
create or replace function public.meine_eintraege()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'motto', coalesce((select jsonb_agg(id) from public.motto_vorschlaege where von = auth.uid()), '[]'::jsonb),
    'zitate', coalesce((select jsonb_agg(id) from public.zitate where eingereicht_von = auth.uid()), '[]'::jsonb))
$$;
revoke all on function public.meine_eintraege() from public, anon;
grant execute on function public.meine_eintraege() to authenticated;

-- Die Namensspalten selbst sperrt supabase/autor-spalten-schuetzen.sql – erst
-- ausführen, wenn die neue App-Version live ist (die alte liest noch „*“).

-- ------------------------------------------------------------ 6. Hintergrundbild
alter table public.profiles add column if not exists hintergrund_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hintergruende', 'hintergruende', false, 2000000, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'hintergrund eigenes lesen') then
    create policy "hintergrund eigenes lesen" on storage.objects for select to authenticated
      using (bucket_id = 'hintergruende' and (storage.foldername(name))[1] = (select auth.uid())::text);
    create policy "hintergrund eigenes hochladen" on storage.objects for insert to authenticated
      with check (bucket_id = 'hintergruende' and (storage.foldername(name))[1] = (select auth.uid())::text);
    create policy "hintergrund eigenes ersetzen" on storage.objects for update to authenticated
      using (bucket_id = 'hintergruende' and (storage.foldername(name))[1] = (select auth.uid())::text);
    create policy "hintergrund eigenes entfernen" on storage.objects for delete to authenticated
      using (bucket_id = 'hintergruende' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'abstimm_runden') then
    alter publication supabase_realtime add table public.abstimm_runden;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'runden_stimmen') then
    alter publication supabase_realtime add table public.runden_stimmen;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'anfrage_zustimmungen') then
    alter publication supabase_realtime add table public.anfrage_zustimmungen;
  end if;
end $$;
