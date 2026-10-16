-- =====================================================================
-- Update 1.4 – Speicherwächter (14.10.2026)
-- Keine Namen, keine Schlüssel. Idempotent.
--
-- Frage: „Muss man Chats löschen, damit die Datenbank bei Spam nicht
-- vollläuft?“ – Nein. Stand 14.10.2026: ~30 MB von 500 MB (Supabase Free).
-- Eine Chat-Nachricht braucht samt Verwaltung grob 0,5 KB; bis zur Grenze ist
-- also Platz für fast eine Million Nachrichten. Spam bremst die automatische
-- Sperre (supabase/auto-sperre.sql). Chat-Löschen bleibt deshalb auf „Nie“.
--
-- Damit trotzdem nichts passieren kann, gibt es den Speicherwächter:
--
--   speicher_stand()          (App, nur Admin bzw. „Rechte verwalten“)
--                             DB-Größe, größte Tabellen, Dateien im Speicher,
--                             grobe Schätzung „Platz für N Nachrichten“
--   speicher_einstellen(p)    Schwelle fürs Not-Aufräumen (50–95 %, null = aus)
--   speicher_notaufraeumen()  nachts 03:27 (pg_cron, Job „speicherwaechter“):
--                             NUR wenn die Daten über der Schwelle liegen
--                             (Standard 80 % von 500 MB), werden die ÄLTESTEN
--                             Chat-Nachrichten gelöscht, bis sie wieder unter
--                             dem Ziel liegen (Standard 70 %). Nie Angepinntes,
--                             Abstimmungen, To-dos und nie jünger als 7 Tage.
--
-- Warum nicht einfach pg_database_size() bis unter 70 % messen? Gelöschte
-- Zeilen machen die Datei nicht kleiner – Postgres gibt den Platz nur zur
-- Wiederverwendung frei (VACUUM). Gemessen an der Dateigröße würde der
-- Wächter jede Nacht weiter löschen. Deshalb rechnet er mit den „belegten“
-- Daten: Dateigröße minus Chat-Tabelle plus deren geschätzter echter Inhalt
-- (Anzahl × durchschnittliche Zeilengröße). Weil freigegebener Platz
-- wiederverwendet wird, wächst die Datei danach nicht weiter.
--
-- ---------------------------------------------------------------------
-- TEIL A  – eingespielt per apply_migration („speicherwaechter_teil_a“).
--           Enthält keine Löschbefehle. speicher_notaufraeumen() ist hier
--           nur ein Platzhalter, der misst und nichts löscht.
-- TEIL B  – enthält den Löschbefehl und muss EINMAL im Supabase SQL-Editor
--           ausgeführt werden (ersetzt den Platzhalter).
-- =====================================================================


-- =====================================================================
-- TEIL A
-- =====================================================================

-- Einstellungen (neue Spalten mit Standardwert – abwärtskompatibel)
alter table public.app_settings add column if not exists speicher_grenze_mb int not null default 500;
alter table public.app_settings add column if not exists speicher_notfall_prozent int default 80;
alter table public.app_settings add column if not exists speicher_ziel_prozent int not null default 70;
alter table public.app_settings add column if not exists speicher_notfall_zuletzt jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'app_settings_speicher_check') then
    alter table public.app_settings add constraint app_settings_speicher_check check (
      speicher_grenze_mb between 100 and 100000
      and (speicher_notfall_prozent is null or speicher_notfall_prozent between 50 and 95)
      and speicher_ziel_prozent between 30 and 90
    );
  end if;
end $$;

-- Geschätzte Größe einer Chat-Nachricht samt Verwaltung (Zeilenkopf,
-- Zeiger, Indexeinträge) in Byte. Mindestens 400, damit die Schätzung bei
-- wenigen Nachrichten nicht ins Kraut schießt.
create or replace function public.speicher_bytes_pro_nachricht()
returns int language sql stable security definer set search_path = public as $$
  select greatest(400, coalesce((select avg(pg_column_size(t.*))::int
                                   from (select * from public.topic_items order by created_at desc limit 2000) t), 0) + 120);
$$;
revoke all on function public.speicher_bytes_pro_nachricht() from public, anon, authenticated;

-- „Belegte“ Daten: Dateigröße der DB, aber die Chat-Tabelle mit ihrem
-- geschätzten echten Inhalt statt ihrer Dateigröße (siehe Kopf).
create or replace function public.speicher_belegt()
returns bigint language sql stable security definer set search_path = public as $$
  select pg_database_size(current_database())
         - pg_total_relation_size('public.topic_items')
         + (select count(*) from public.topic_items) * public.speicher_bytes_pro_nachricht();
$$;
revoke all on function public.speicher_belegt() from public, anon, authenticated;

-- Für die App: Speicher-Anzeige im Blatt „Automatisch löschen“
create or replace function public.speicher_stand()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  grenze bigint;
  notfall int;
  ziel int;
  zuletzt jsonb;
  db bigint := pg_database_size(current_database());
  pro int := public.speicher_bytes_pro_nachricht();
begin
  if auth.uid() is null or not (public.my_role() = 'admin' or public.has_perm('perms.manage')) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select coalesce(speicher_grenze_mb, 500)::bigint * 1024 * 1024, speicher_notfall_prozent,
         coalesce(speicher_ziel_prozent, 70), speicher_notfall_zuletzt
    into grenze, notfall, ziel, zuletzt
    from public.app_settings where id = 1;
  return jsonb_build_object(
    'db_bytes', db,
    'belegt_bytes', public.speicher_belegt(),
    'grenze_bytes', grenze,
    'notfall_prozent', notfall,
    'ziel_prozent', ziel,
    'nachrichten', (select count(*) from public.topic_items),
    'bytes_pro_nachricht', pro,
    'platz_nachrichten', greatest(0, (grenze - db) / pro),
    'tabellen', (select coalesce(jsonb_agg(jsonb_build_object('name', x.relname, 'bytes', x.groesse) order by x.groesse desc), '[]'::jsonb)
                   from (select c.relname, pg_total_relation_size(c.oid) as groesse
                           from pg_class c join pg_namespace n on n.oid = c.relnamespace
                          where n.nspname = 'public' and c.relkind = 'r'
                          order by 2 desc limit 6) x),
    'dateien_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects),
    'dateien_anzahl', (select count(*) from storage.objects),
    -- Ist Teil B eingespielt? (Platzhalter kennt die Chat-Tabelle nicht)
    'waechter_scharf', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                where n.nspname = 'public' and p.proname = 'speicher_notaufraeumen'
                                  and p.prosrc like '%topic_items%'),
    'zuletzt', zuletzt
  );
end $$;
revoke all on function public.speicher_stand() from public, anon;
grant execute on function public.speicher_stand() to authenticated;

-- Schwelle fürs Not-Aufräumen setzen (null = aus). Ziel = Schwelle − 10.
create or replace function public.speicher_einstellen(p_notfall int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not (public.my_role() = 'admin' or public.has_perm('perms.manage')) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if p_notfall is not null and (p_notfall < 50 or p_notfall > 95) then
    raise exception 'Schwelle muss zwischen 50 und 95 %% liegen.';
  end if;
  update public.app_settings
     set speicher_notfall_prozent = p_notfall,
         speicher_ziel_prozent = coalesce(p_notfall - 10, speicher_ziel_prozent)
   where id = 1;
end $$;
revoke all on function public.speicher_einstellen(int) from public, anon;
grant execute on function public.speicher_einstellen(int) to authenticated;

-- Platzhalter: misst nur. Teil B ersetzt ihn durch die echte Fassung.
create or replace function public.speicher_notaufraeumen()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  grenze bigint;
  notfall int;
  belegt bigint := public.speicher_belegt();
begin
  select coalesce(speicher_grenze_mb, 500)::bigint * 1024 * 1024, speicher_notfall_prozent
    into grenze, notfall from public.app_settings where id = 1;
  return jsonb_build_object(
    'platzhalter', true,
    'noetig', notfall is not null and belegt >= grenze * notfall / 100,
    'prozent', round(belegt * 100.0 / grenze, 1)
  );
end $$;
revoke all on function public.speicher_notaufraeumen() from public, anon, authenticated;

-- Jede Nacht 03:27, zehn Minuten nach „aufraeumen“
select cron.schedule('speicherwaechter', '27 3 * * *', 'select public.speicher_notaufraeumen()');


-- =====================================================================
-- TEIL B  – im Supabase SQL-Editor ausführen (enthält den Löschbefehl)
-- =====================================================================
create or replace function public.speicher_notaufraeumen()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  grenze bigint;
  notfall int;
  ziel int;
  belegt bigint := public.speicher_belegt();
  pro int := public.speicher_bytes_pro_nachricht();
  soll bigint;
  n int;
  summe bigint := 0;
begin
  select coalesce(speicher_grenze_mb, 500)::bigint * 1024 * 1024, speicher_notfall_prozent, coalesce(speicher_ziel_prozent, 70)
    into grenze, notfall, ziel from public.app_settings where id = 1;
  if notfall is null then
    return jsonb_build_object('aus', true);
  end if;
  if belegt < grenze * notfall / 100 then
    return jsonb_build_object('noetig', false, 'prozent', round(belegt * 100.0 / grenze, 1));
  end if;

  -- So viele Nachrichten müssen weg, damit die Daten unter dem Ziel liegen
  soll := ceil((belegt - grenze * ziel / 100)::numeric / pro);

  -- In Paketen zu höchstens 2000, älteste zuerst. Reaktionen, Stimmen und
  -- Antworten hängen per „on delete cascade“ dran und gehen mit.
  loop
    exit when summe >= soll;
    delete from public.topic_items
     where id in (select id from public.topic_items
                   where type in ('nachricht', 'system') and not coalesce(pinned, false)
                     and created_at < now() - interval '7 days'
                   order by created_at
                   limit least(2000, soll - summe));
    get diagnostics n = row_count;
    exit when n = 0;
    summe := summe + n;
  end loop;

  update public.app_settings
     set speicher_notfall_zuletzt = jsonb_build_object(
           'at', now(), 'nachrichten', summe,
           'prozent_vorher', round(belegt * 100.0 / grenze, 1),
           'prozent_nachher', round(public.speicher_belegt() * 100.0 / grenze, 1))
   where id = 1;
  return jsonb_build_object('noetig', true, 'nachrichten', summe);
end $$;
revoke all on function public.speicher_notaufraeumen() from public, anon, authenticated;

-- Prüfen (sollte noetig=false und ~6 % zeigen):
-- select public.speicher_notaufraeumen();
