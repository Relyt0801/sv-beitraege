-- =====================================================================
-- Wortfilter und Melden (07.10.2026)
--
--  1. wortfilter: Liste in der Datenbank (Wörter selbst stehen NICHT im
--     Repo, nur hier die Struktur). Pflege in der App: Profil → Wortfilter
--     (Recht wortfilter.verwalten, Standard Admin).
--       stufe  'block'   = geht nicht durch
--              'erlaubt' = Ausnahme (ganzes Wort, z. B. „idiotensicher“)
--       modus  'wort'    = nur als Wort (+ Endungen: -e, -en, -er, -s …)
--              'anfang'  = Wörter, die damit anfangen (Arsch → Arschgesicht)
--              'ueberall'= auch mitten im Wort (…sohn, Dreck…)
--  2. Umgehungen: Kleinschreibung, Umlaute (ä/ae/a), Akzente, kyrillische
--     Doppelgänger, unsichtbare Zeichen, Leetspeak (4rsch, w1chser, $),
--     Zeichen im Wort (A.r.s.c.h, Ar-sch), Einzelbuchstaben (a r s c h),
--     getrennt (Ar sch), Buchstaben-Wiederholung (Arrrsch), ph/f, ck/k,
--     y/i, Sternchen (f*ck, a**loch). Links und IDs werden vorher entfernt.
--  3. Trigger vor dem Speichern auf allen Texten (nicht Zitate – die prüft
--     das Team; dort zeigt die App nur einen Hinweis).
--  4. wortfilter_versuch(): zählt geblockte Versuche; ab 3 in 10 Minuten ein
--     Eintrag im Protokoll (ohne Text).
--  5. meldungen: Inhalte melden (Chat, Kommentar, Steckbrief, Motto, Zitat).
--     Auszug und betroffene Person füllt die Datenbank selbst. Bearbeiten:
--     Recht meldungen.bearbeiten (Standard Stufenteam + Sprecher).
-- Ohne DELETE/DROP.
-- =====================================================================

-- ------------------------------------------------------------ 1. Normalisieren
create or replace function public.wf_norm(t text, leet boolean)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(
           regexp_replace(
             replace(replace(replace(replace(replace(replace(
               translate(
                 case when leet then translate(lower(coalesce(t, '')), '0134578@$€!|', 'oieastbaseii') else lower(coalesce(t, '')) end,
                 'äöüàáâãåèéêëìíîïòóôõùúûçñýÿаеорсхуіјнвкмт' || chr(8203) || chr(8204) || chr(8205) || chr(8288) || chr(65279) || chr(173),
                 'aouaaaaaeeeeiiiioooouuucnyyaeopcxyijhbkmt'),
               'ß', 'ss'), 'ph', 'f'), 'ck', 'k'), 'ae', 'a'), 'oe', 'o'), 'ue', 'u'),
             -- Zeichen zwischen Buchstaben weg: a.r.s.c.h → arsch, Ar-sch → arsch
             '([a-z*#])[^a-z*#[:space:]]+(?=[a-z*#])', '\1', 'g'),
           'y', 'i', 'g')
$$;

-- Kandidat aufbereiten: ck/ph auch über Trennungen hinweg, Buchstaben-
-- Wiederholungen zusammenziehen (Sternchen bleiben stehen)
create or replace function public.wf_kand(x text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(replace(replace(coalesce(x, ''), 'ck', 'k'), 'ph', 'f'), '([a-z])\1+', '\1', 'g')
$$;

create table if not exists public.wortfilter (
  id uuid primary key default gen_random_uuid(),
  wort text not null check (char_length(btrim(wort)) between 2 and 40),
  stufe text not null default 'block' check (stufe in ('block', 'erlaubt')),
  modus text not null default 'anfang' check (modus in ('wort', 'anfang', 'ueberall')),
  aktiv boolean not null default true,
  norm text generated always as (public.wf_kand(public.wf_norm(wort, false))) stored,
  created_at timestamptz not null default now(),
  unique (norm, stufe)
);
alter table public.wortfilter enable row level security;
create policy "wortfilter lesen" on public.wortfilter for select to authenticated using ((select has_perm('wortfilter.verwalten')));
create policy "wortfilter anlegen" on public.wortfilter for insert to authenticated with check ((select has_perm('wortfilter.verwalten')));
create policy "wortfilter aendern" on public.wortfilter for update to authenticated
  using ((select has_perm('wortfilter.verwalten'))) with check ((select has_perm('wortfilter.verwalten')));

-- ------------------------------------------------------------ 2. Finden
-- Gibt das erste getroffene Listenwort zurück (oder null).
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
  -- Links und IDs (z. B. Spotify, UUIDs) zählen nicht
  p_text := regexp_replace(p_text, 'https?://\S+|spotify:\S+', ' ', 'gi');
  p_text := regexp_replace(p_text, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', ' ', 'gi');
  -- Zwei Lesarten: ohne und mit Leetspeak (4 = a, 1 = i, $ = s …)
  foreach v in array array[public.wf_norm(p_text, false), public.wf_norm(p_text, true)] loop
    toks := array_remove(regexp_split_to_array(v, '[^a-z*#]+'), '');
    n := coalesce(array_length(toks, 1), 0);
    run := '';
    for i in 1..n loop
      t := public.wf_kand(toks[i]);
      cand := cand || t;
      spans := spans || 0;
      -- Getrennt geschrieben: kurzer Teil („Ar sch“) → alle Regeln,
      -- sonst („Sieg Heil“) nur exakte Wort-Treffer
      if i < n then
        nxt := public.wf_kand(toks[i + 1]);
        cand := cand || public.wf_kand(t || nxt);
        spans := spans || case when least(length(t), length(nxt)) <= 3 then length(t) else -1 end;
      end if;
      -- Einzelbuchstaben: „a r s c h“
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
         or (w.modus = 'anfang' and left(c.t, length(w.norm)) = w.norm)
         or (w.modus = 'ueberall' and strpos(c.t, w.norm) > 0
             and (c.span = 0 or (strpos(c.t, w.norm) <= c.span and strpos(c.t, w.norm) + length(w.norm) - 1 > c.span)))
       ))
       -- Sternchen statt Buchstaben: f*ck, a**loch, f*cking (das ganze Wort muss
       -- passen, mind. 2 echte Buchstaben – „Schüler*innen“ trifft so nichts)
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

-- Für die App (z. B. Hinweis beim Zitate-Prüfen): nur maskiert
create or replace function public.wortfilter_finden(p_text text)
returns text language sql stable security definer set search_path = public as $$
  select case when h is null then null
              else left(h, 1) || repeat('*', greatest(length(h) - 2, 1)) || case when length(h) > 2 then right(h, 1) else '' end end
    from (select public.wortfilter_treffer(p_text) as h) x
$$;
revoke all on function public.wortfilter_finden(text) from public, anon;
grant execute on function public.wortfilter_finden(text) to authenticated;

-- ------------------------------------------------------------ 3. Prüfen vor dem Speichern
-- Argumente: die Spalten, die geprüft werden. jsonb-Spalten: alle Texte darin.
create or replace function public.wortfilter_pruefen()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  spalte text;
  wert jsonb;
  neu text;
  hit text;
begin
  if coalesce(current_setting('sv.wiederherstellung', true), '') = '1' then return new; end if;
  foreach spalte in array tg_argv loop
    wert := to_jsonb(new) -> spalte;
    -- Unverändertes nicht erneut prüfen (z. B. ein To-do abhaken)
    if tg_op = 'UPDATE' and wert is not distinct from (to_jsonb(old) -> spalte) then continue; end if;
    if wert is null or jsonb_typeof(wert) = 'null' then continue; end if;
    if jsonb_typeof(wert) = 'string' then
      neu := wert #>> '{}';
    else
      select string_agg(x #>> '{}', ' ') into neu from jsonb_path_query(wert, '$.** ? (@.type() == "string")') x;
    end if;
    hit := public.wortfilter_treffer(neu);
    if hit is not null then
      raise exception 'Bitte ohne beleidigende Wörter formulieren („%“).',
        left(hit, 1) || repeat('*', greatest(length(hit) - 2, 1)) || case when length(hit) > 2 then right(hit, 1) else '' end
        using errcode = 'P0420';
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.wortfilter_pruefen() from public, anon, authenticated;

create or replace trigger wortfilter before insert or update on public.topic_items for each row execute function public.wortfilter_pruefen('title', 'body', 'options');
create or replace trigger wortfilter before insert or update on public.topics for each row execute function public.wortfilter_pruefen('title');
create or replace trigger wortfilter before insert or update on public.album_kommentare for each row execute function public.wortfilter_pruefen('text');
create or replace trigger wortfilter before insert or update on public.album_steckbriefe for each row execute function public.wortfilter_pruefen('stammdaten', 'text');
create or replace trigger wortfilter before insert or update on public.album_kategorien for each row execute function public.wortfilter_pruefen('titel', 'platzhalter');
create or replace trigger wortfilter before insert or update on public.motto_vorschlaege for each row execute function public.wortfilter_pruefen('text', 'erklaerung');
create or replace trigger wortfilter before insert or update on public.umfragen for each row execute function public.wortfilter_pruefen('titel', 'beschreibung');
create or replace trigger wortfilter before insert or update on public.umfrage_fragen for each row execute function public.wortfilter_pruefen('titel', 'optionen');
create or replace trigger wortfilter before insert or update on public.umfrage_antworten for each row execute function public.wortfilter_pruefen('wert');
create or replace trigger wortfilter before insert or update on public.mithilfe_nachtraege for each row execute function public.wortfilter_pruefen('titel', 'beschreibung');
create or replace trigger wortfilter before insert or update on public.komitee_requests for each row execute function public.wortfilter_pruefen('nachricht');
create or replace trigger wortfilter before insert or update on public.unban_requests for each row execute function public.wortfilter_pruefen('nachricht');
create or replace trigger wortfilter before insert or update on public.termin_requests for each row execute function public.wortfilter_pruefen('titel', 'ort', 'nachricht');
create or replace trigger wortfilter before insert or update on public.kosten_anfragen for each row execute function public.wortfilter_pruefen('titel', 'nachricht');
create or replace trigger wortfilter before insert or update on public.events for each row execute function public.wortfilter_pruefen('title', 'body');
create or replace trigger wortfilter before insert or update on public.termine for each row execute function public.wortfilter_pruefen('titel', 'beschreibung', 'ort');
create or replace trigger wortfilter before insert or update on public.ranking_kategorien for each row execute function public.wortfilter_pruefen('titel');
create or replace trigger wortfilter before insert or update on public.eltern_infos for each row execute function public.wortfilter_pruefen('titel', 'text');

-- ------------------------------------------------------------ 4. Versuche zählen
create table if not exists public.wortfilter_versuche (
  user_id uuid primary key,
  anzahl int not null default 0,
  seit timestamptz not null default now(),
  gemeldet_at timestamptz
);
alter table public.wortfilter_versuche enable row level security;

create or replace function public.wortfilter_versuch(p_wort text)
returns void language plpgsql security definer set search_path = public as $$
declare
  ich uuid := auth.uid();
  v public.wortfilter_versuche;
begin
  if ich is null then return; end if;
  insert into public.wortfilter_versuche (user_id, anzahl, seit) values (ich, 1, now())
  on conflict (user_id) do update set
    anzahl = case when public.wortfilter_versuche.seit < now() - interval '10 minutes' then 1 else public.wortfilter_versuche.anzahl + 1 end,
    seit = case when public.wortfilter_versuche.seit < now() - interval '10 minutes' then now() else public.wortfilter_versuche.seit end
  returning * into v;
  if v.anzahl >= 3 and (v.gemeldet_at is null or v.gemeldet_at < now() - interval '10 minutes') then
    update public.wortfilter_versuche set gemeldet_at = now() where user_id = ich;
    perform public.audit_schreiben('wortfilter.versuche', 'moderation', ich,
      coalesce(nullif(public.audit_name(ich), ''), '?'),
      v.anzahl || ' geblockte Versuche in 10 Minuten (Wortfilter, „' || left(coalesce(p_wort, ''), 20) || '“)');
  end if;
end $$;
revoke all on function public.wortfilter_versuch(text) from public, anon;
grant execute on function public.wortfilter_versuch(text) to authenticated;

-- ------------------------------------------------------------ 5. Melden
create table if not exists public.meldungen (
  id uuid primary key default gen_random_uuid(),
  art text not null check (art in ('chat', 'kommentar', 'steckbrief', 'motto', 'zitat')),
  ziel_id text not null check (char_length(ziel_id) <= 64),
  grund text not null check (grund in ('beleidigung', 'mobbing', 'unangemessen', 'sonstiges')),
  notiz text not null default '' check (char_length(notiz) <= 300),
  von uuid not null default auth.uid(),
  gemeldet_user uuid,
  auszug text not null default '',
  status text not null default 'offen' check (status in ('offen', 'ok', 'entfernt')),
  created_at timestamptz not null default now(),
  erledigt_von uuid,
  erledigt_at timestamptz,
  unique (von, art, ziel_id)
);
alter table public.meldungen enable row level security;

create or replace function public.meldung_vorbereiten()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  person uuid;
  txt text;
begin
  if tg_op = 'INSERT' then
    new.von := auth.uid();
    new.status := 'offen';
    new.created_at := now();
    new.erledigt_von := null;
    new.erledigt_at := null;
    if (select count(*) from public.meldungen where von = new.von and created_at > now() - interval '1 hour') >= 10 then
      raise exception 'Du hast in der letzten Stunde schon viel gemeldet – bitte später noch einmal.';
    end if;
    -- Auszug und Person aus dem Original (nicht aus der Anfrage)
    if new.art = 'chat' then
      select created_by, coalesce(nullif(title, '') || ': ', '') || coalesce(body, '') into person, txt from public.topic_items where id::text = new.ziel_id;
    elsif new.art = 'kommentar' then
      select user_id, text into person, txt from public.album_kommentare where id::text = new.ziel_id;
    elsif new.art = 'steckbrief' then
      select p.user_id, coalesce(s.text, '') || ' ' || coalesce((select string_agg(value, ' · ') from jsonb_each_text(s.stammdaten)), '')
        into person, txt
        from public.album_steckbriefe s left join public.profiles p on p.student_id = s.student_id and p.role <> 'eltern'
       where s.student_id::text = new.ziel_id limit 1;
    elsif new.art = 'motto' then
      select von, text || coalesce(' – ' || nullif(erklaerung, ''), '') into person, txt from public.motto_vorschlaege where id::text = new.ziel_id;
    elsif new.art = 'zitat' then
      select eingereicht_von, '„' || text || '“ – ' || wer into person, txt from public.zitate where id::text = new.ziel_id;
    end if;
    if txt is null then raise exception 'Inhalt nicht gefunden'; end if;
    if person = new.von then raise exception 'Eigene Beiträge kannst du nicht melden.'; end if;
    new.gemeldet_user := person;
    new.auszug := left(btrim(txt), 300);
  else
    new.von := old.von; new.art := old.art; new.ziel_id := old.ziel_id; new.grund := old.grund;
    new.notiz := old.notiz; new.gemeldet_user := old.gemeldet_user; new.auszug := old.auszug; new.created_at := old.created_at;
    if new.status is distinct from old.status then
      new.erledigt_von := auth.uid();
      new.erledigt_at := now();
      perform public.audit_schreiben('meldung.' || new.status, 'anfragen', new.gemeldet_user,
        coalesce(nullif(public.audit_name(new.gemeldet_user), ''), '?'),
        'Meldung (' || new.art || ', ' || new.grund || ') – ' || case new.status when 'entfernt' then 'Inhalt entfernt' when 'ok' then 'als in Ordnung markiert' else 'wieder offen' end);
    end if;
  end if;
  return new;
end $$;
revoke all on function public.meldung_vorbereiten() from public, anon, authenticated;
create or replace trigger meldung_vorbereiten before insert or update on public.meldungen for each row execute function public.meldung_vorbereiten();
create or replace trigger wortfilter before insert or update on public.meldungen for each row execute function public.wortfilter_pruefen('notiz');
create or replace trigger gesperrt_blocken before insert on public.meldungen for each row execute function public.gesperrt_blocken();

create policy "meldungen lesen" on public.meldungen for select to authenticated
  using (von = (select auth.uid()) or (select has_perm('meldungen.bearbeiten')));
create policy "meldungen anlegen" on public.meldungen for insert to authenticated
  with check (von = (select auth.uid()) and not (select ist_eltern()));
create policy "meldungen bearbeiten" on public.meldungen for update to authenticated
  using ((select has_perm('meldungen.bearbeiten'))) with check ((select has_perm('meldungen.bearbeiten')));

alter publication supabase_realtime add table public.meldungen;

-- Rechte: Meldungen bearbeiten = Stufenteam + Sprecher; Wortfilter = Admin
insert into public.role_permissions (role, perm, allowed)
select r, 'meldungen.bearbeiten', true from unnest(array['sprecher', 'stv_sprecher', 'stufenteam']) r
on conflict (role, perm) do nothing;
