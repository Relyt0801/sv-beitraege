-- =====================================================================
-- Automatische Sperren und Emoji-Filter (07.10.2026)
--
--  1. profiles.ban_grund: warum jemand automatisch gesperrt ist (die App
--     zeigt es in der Sperr-Zeile). Manuelles Sperren setzt ihn zurück.
--  2. auto_sperren: Stufe je Person und Art. Jede neue Sperre geht eine
--     Stufe höher; 24 Stunden nach dem Ende der letzten Sperre fängt es
--     wieder bei Stufe 1 an.
--        spam        1 Minute  → 5 Minuten → 1 Stunde
--        wortfilter  5 Minuten → 1 Stunde  → 1 Tag
--     Admins und der Betreiber werden nie automatisch gesperrt. Eine
--     dauerhafte oder längere Sperre wird nie verkürzt.
--  3. Spam: 10 Beiträge in 30 Sekunden (Chat, Kommentare, Motto, Zitate,
--     Meldungen, Anfragen). Gezählt wird je Speichervorgang, nicht je Zeile
--     – wer zehn To-dos auf einmal anlegt, ist kein Spammer.
--  4. Wortfilter: 3 geblockte Versuche in 10 Minuten → Sperre.
--  5. Emojis: app_settings.wortfilter_zeichen (z. B. 🍆🍑💦) – jedes Zeichen
--     darin blockt wie ein Wort. Pflege in der App unter Wortfilter.
-- Ohne DELETE/DROP.
-- =====================================================================

-- ------------------------------------------------------------ 1. Grund
alter table public.profiles add column if not exists ban_grund text;

-- ------------------------------------------------------------ 2. Stufen
create table if not exists public.auto_sperren (
  user_id uuid not null,
  art text not null check (art in ('spam', 'wortfilter')),
  stufe int not null default 0,
  bis timestamptz,
  primary key (user_id, art)
);
alter table public.auto_sperren enable row level security;
-- keine Policies: nur über die Funktionen unten

create or replace function public.auto_sperre(p_user uuid, p_art text, p_grund text, p_info text)
returns interval language plpgsql security definer set search_path = public as $$
declare
  dauern interval[] := case p_art
    when 'spam' then array[interval '1 minute', interval '5 minutes', interval '1 hour']
    else array[interval '5 minutes', interval '1 hour', interval '1 day'] end;
  texte text[] := case p_art
    when 'spam' then array['1 Minute', '5 Minuten', '1 Stunde']
    else array['5 Minuten', '1 Stunde', '1 Tag'] end;
  s int;
  bis_neu timestamptz;
begin
  if p_user is null or p_art not in ('spam', 'wortfilter') then return null; end if;
  if p_user = public.op_user()
     or exists (select 1 from public.profiles where user_id = p_user and (is_op or role = 'admin')) then
    return null;
  end if;

  insert into public.auto_sperren (user_id, art) values (p_user, p_art) on conflict do nothing;
  select case when a.bis is null or a.bis < now() - interval '24 hours' then 1 else least(a.stufe + 1, 3) end
    into s from public.auto_sperren a where a.user_id = p_user and a.art = p_art for update;
  bis_neu := now() + dauern[s];
  update public.auto_sperren set stufe = s, bis = bis_neu where user_id = p_user and art = p_art;

  perform set_config('sv.autosperre', '1', true);
  update public.profiles
     set chat_banned_until = greatest(coalesce(chat_banned_until, now()), bis_neu),
         -- Grund nur, wenn diese Sperre die maßgebliche ist (eine längere
         -- Sperre vom Team behält ihren – leeren – Grund)
         ban_grund = case when bis_neu >= coalesce(chat_banned_until, now()) then p_grund else ban_grund end
   where user_id = p_user and not coalesce(chat_ban_permanent, false);
  perform set_config('sv.autosperre', '', true);

  perform public.audit_schreiben('moderation.autosperre', 'moderation', p_user,
    coalesce(nullif(public.audit_name(p_user), ''), '?'),
    'Automatisch ' || texte[s] || ' gesperrt (Stufe ' || s || '/3): ' || coalesce(p_info, p_grund),
    jsonb_build_object('art', p_art, 'stufe', s, 'bis', bis_neu));
  return dauern[s];
end $$;
revoke all on function public.auto_sperre(uuid, text, text, text) from public, anon, authenticated;

-- Manuelles Sperren/Entsperren: Grund zurücksetzen
create or replace function public.ban_grund_leeren()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('sv.autosperre', true), '') <> '1'
     and (new.chat_banned_until is distinct from old.chat_banned_until
          or new.chat_ban_permanent is distinct from old.chat_ban_permanent) then
    new.ban_grund := null;
  end if;
  return new;
end $$;
create or replace trigger ban_grund_leeren before update on public.profiles
  for each row execute function public.ban_grund_leeren();

-- Schutz-Trigger: die automatische Sperre darf die Sperre der Person
-- verlängern (nie verkürzen oder aufheben), auch ohne mod.timeout.
create or replace function public.guard_role_change()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.uid() is not null then
    -- Niemand außer dem OP selbst darf am OP-Konto etwas ändern
    if old.is_op and auth.uid() <> old.user_id then
      raise exception 'Dieses Konto ist geschützt';
    end if;
    -- OP-Status kann nicht vergeben oder entzogen werden
    if new.is_op is distinct from old.is_op then
      raise exception 'Der OP-Status kann nicht geändert werden';
    end if;
    if new.role is distinct from old.role then
      if not public.has_perm('roles.manage') then
        raise exception 'Keine Berechtigung, Rollen zu ändern';
      end if;
      -- Hin zu einer dieser Rollen und weg davon: beides nur als Admin.
      -- Sonst könnte man einen Admin erst herunterstufen und dann ersetzen.
      if (new.role in ('sprecher','stv_sprecher','admin','kassenwart','eltern')
          or old.role in ('sprecher','stv_sprecher','admin','kassenwart','eltern'))
         and public.my_role() <> 'admin' then
        raise exception 'Diese Rolle darf nur der Admin vergeben oder entziehen';
      end if;
    end if;
    if (new.chat_banned_until is distinct from old.chat_banned_until
        or new.chat_ban_permanent is distinct from old.chat_ban_permanent)
       and not public.has_perm('mod.timeout')
       and not (coalesce(current_setting('sv.autosperre', true), '') = '1'
                and new.chat_ban_permanent is not distinct from old.chat_ban_permanent
                and new.chat_banned_until is not null
                and (old.chat_banned_until is null or new.chat_banned_until >= old.chat_banned_until)) then
      raise exception 'Keine Berechtigung zum Sperren/Entsperren';
    end if;
    if new.student_id is distinct from old.student_id and not public.has_perm('roles.manage') then
      raise exception 'Keine Berechtigung, die Zuordnung zu ändern';
    end if;
  end if;
  return new;
end $function$;

-- Protokoll: automatische Sperren stehen schon als moderation.autosperre drin
create or replace function public.audit_profiles()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  n text;
begin
  if tg_op = 'INSERT' then
    perform public.audit_schreiben(
      'konto.erstellt', 'konten', new.user_id, coalesce(new.username, ''),
      'Zugang „' || coalesce(new.username, '?') || '" angelegt (Rolle: ' || new.role || ')',
      jsonb_build_object('rolle', new.role));
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.audit_schreiben(
      'konto.geloescht', 'konten', old.user_id, coalesce(old.username, ''),
      'Zugang „' || coalesce(old.username, '?') || '" gelöscht (war: ' || old.role || ')',
      jsonb_build_object('rolle', old.role));
    return old;
  end if;

  n := coalesce(nullif(public.audit_name(new.user_id), ''), new.username, '?');

  if new.role is distinct from old.role then
    perform public.audit_schreiben(
      'rolle.geaendert', 'rollen', new.user_id, n,
      n || ': Rolle ' || old.role || ' → ' || new.role,
      jsonb_build_object('vorher', old.role, 'nachher', new.role));
  end if;

  if new.is_op is distinct from old.is_op then
    perform public.audit_schreiben(
      'konto.geschuetzt', 'konten', new.user_id, n,
      n || ': geschütztes Konto ' || case when new.is_op then 'gesetzt' else 'aufgehoben' end,
      jsonb_build_object('nachher', new.is_op));
  end if;

  if (new.chat_ban_permanent is distinct from old.chat_ban_permanent
      or new.chat_banned_until is distinct from old.chat_banned_until)
     and coalesce(current_setting('sv.autosperre', true), '') <> '1' then
    perform public.audit_schreiben(
      'konto.sperre', 'konten', new.user_id, n,
      n || ': ' || case
        when new.chat_ban_permanent then 'dauerhaft gesperrt'
        when new.chat_banned_until is not null then 'gesperrt bis ' || to_char(new.chat_banned_until at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI')
        else 'Sperre aufgehoben' end,
      jsonb_build_object('bis', new.chat_banned_until, 'dauerhaft', new.chat_ban_permanent));
  end if;

  if new.must_change_password and not old.must_change_password then
    perform public.audit_schreiben(
      'passwort.zurueckgesetzt', 'konten', new.user_id, n,
      n || ': Passwort zurückgesetzt (Startpasswort gesetzt)', '{}'::jsonb);
  end if;

  if new.student_id is distinct from old.student_id then
    perform public.audit_schreiben(
      'konto.verknuepft', 'konten', new.user_id, n,
      n || ': Verknüpfung mit der Personenliste geändert',
      jsonb_build_object('vorher', old.student_id, 'nachher', new.student_id));
  end if;

  return new;
end $function$;

-- ------------------------------------------------------------ 3. Spam
create table if not exists public.spam_zaehler (
  user_id uuid primary key,
  seit timestamptz not null default now(),
  anzahl int not null default 0
);
alter table public.spam_zaehler enable row level security;

create or replace function public.spam_zaehlen()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ich uuid := auth.uid();
  n int;
begin
  if ich is null then return null; end if;
  if not exists (select 1 from neu) then return null; end if;
  insert into public.spam_zaehler (user_id, seit, anzahl) values (ich, clock_timestamp(), 1)
  on conflict (user_id) do update set
    anzahl = case when public.spam_zaehler.seit < clock_timestamp() - interval '30 seconds' then 1 else public.spam_zaehler.anzahl + 1 end,
    seit   = case when public.spam_zaehler.seit < clock_timestamp() - interval '30 seconds' then clock_timestamp() else public.spam_zaehler.seit end
  returning anzahl into n;
  if n >= 10 then
    update public.spam_zaehler set anzahl = 0, seit = clock_timestamp() where user_id = ich;
    perform public.auto_sperre(ich, 'spam', 'Zu viele Beiträge in kurzer Zeit',
      n || ' Beiträge in 30 Sekunden (' || tg_table_name || ')');
  end if;
  return null;
end $$;
revoke all on function public.spam_zaehlen() from public, anon, authenticated;

create or replace trigger spam_zaehlen after insert on public.topic_items referencing new table as neu for each statement execute function public.spam_zaehlen();
create or replace trigger spam_zaehlen after insert on public.album_kommentare referencing new table as neu for each statement execute function public.spam_zaehlen();
create or replace trigger spam_zaehlen after insert on public.motto_vorschlaege referencing new table as neu for each statement execute function public.spam_zaehlen();
create or replace trigger spam_zaehlen after insert on public.zitate referencing new table as neu for each statement execute function public.spam_zaehlen();
create or replace trigger spam_zaehlen after insert on public.meldungen referencing new table as neu for each statement execute function public.spam_zaehlen();
create or replace trigger spam_zaehlen after insert on public.komitee_requests referencing new table as neu for each statement execute function public.spam_zaehlen();
create or replace trigger spam_zaehlen after insert on public.unban_requests referencing new table as neu for each statement execute function public.spam_zaehlen();
create or replace trigger spam_zaehlen after insert on public.termin_requests referencing new table as neu for each statement execute function public.spam_zaehlen();
create or replace trigger spam_zaehlen after insert on public.mithilfe_nachtraege referencing new table as neu for each statement execute function public.spam_zaehlen();
create or replace trigger spam_zaehlen after insert on public.kosten_anfragen referencing new table as neu for each statement execute function public.spam_zaehlen();

-- ------------------------------------------------------------ 4. Wortfilter-Versuche
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
  if v.anzahl >= 3 then
    update public.wortfilter_versuche set anzahl = 0, seit = now(), gemeldet_at = now() where user_id = ich;
    perform public.auto_sperre(ich, 'wortfilter', 'Mehrfach gesperrte Wörter benutzt',
      v.anzahl || ' geblockte Versuche in 10 Minuten (Wortfilter, „' || left(coalesce(p_wort, ''), 20) || '“)');
  end if;
end $$;
revoke all on function public.wortfilter_versuch(text) from public, anon;
grant execute on function public.wortfilter_versuch(text) to authenticated;

-- ------------------------------------------------------------ 5. Emojis
alter table public.app_settings add column if not exists wortfilter_zeichen text not null default '🍆🍑💦👅🖕🫦';

create or replace function public.wortfilter_zeichen_setzen(p text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('wortfilter.verwalten') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  update public.app_settings set wortfilter_zeichen = left(coalesce(p, ''), 200) where id = 1;
end $$;
revoke all on function public.wortfilter_zeichen_setzen(text) from public, anon;
grant execute on function public.wortfilter_zeichen_setzen(text) to authenticated;

-- Einzelne Zeichen aus der Liste (ohne Variations-/Hautfarben-/Verbindungszeichen)
create or replace function public.wortfilter_zeichen_treffer(p_text text)
returns text language sql stable security definer set search_path = public as $$
  select z
    from regexp_split_to_table(coalesce((select wortfilter_zeichen from public.app_settings where id = 1), ''), '') z
   where ascii(z) >= 8192
     and ascii(z) not in (8205, 65039, 65038)
     and ascii(z) not between 127995 and 127999
     and strpos(coalesce(p_text, ''), z) > 0
   limit 1
$$;
revoke all on function public.wortfilter_zeichen_treffer(text) from public, anon, authenticated;

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
  -- Emojis aus der Liste
  hit := public.wortfilter_zeichen_treffer(p_text);
  if hit is not null then return hit; end if;
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
         -- getrennt geschrieben: der Treffer muss über die Lücke gehen
         -- („Piste ins“ ist nicht „Pis…“, „Ar schloch“ schon)
         or (w.modus = 'anfang' and left(c.t, length(w.norm)) = w.norm and (c.span = 0 or length(w.norm) > c.span))
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

-- Maskieren: ein einzelnes Zeichen (Emoji) bleibt sichtbar
create or replace function public.wf_maske(h text)
returns text language sql immutable set search_path = public as $$
  select case when h is null then null
              when length(h) < 2 then h
              else left(h, 1) || repeat('*', greatest(length(h) - 2, 1)) || case when length(h) > 2 then right(h, 1) else '' end end
$$;

create or replace function public.wortfilter_finden(p_text text)
returns text language sql stable security definer set search_path = public as $$
  select public.wf_maske(public.wortfilter_treffer(p_text))
$$;
revoke all on function public.wortfilter_finden(text) from public, anon;
grant execute on function public.wortfilter_finden(text) to authenticated;

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
      raise exception 'Bitte ohne beleidigende Wörter formulieren („%“).', public.wf_maske(hit)
        using errcode = 'P0420';
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.wortfilter_pruefen() from public, anon, authenticated;
