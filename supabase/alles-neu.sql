-- ============================================================================
-- STUFENKASSE: KOMPLETT-AUFBAU FÜR EIN FRISCHES SUPABASE-PROJEKT
--
-- Fasst alle Einzeldateien aus supabase/ in der richtigen Reihenfolge zusammen.
-- Gedacht für ein NEUES, LEERES Projekt, zum Beispiel das Demo-Projekt.
--
-- So geht es:
--   1. Supabase-Dashboard, neues Projekt, SQL Editor, New query
--   2. Diese Datei komplett hineinkopieren und auf Run drücken
--   3. Dauert etwa eine halbe Minute. "Success. No rows returned" heißt fertig.
--
-- Auf einem Projekt, in dem schon Daten liegen, bitte NICHT ausführen. Einige
-- Abschnitte legen Regeln ohne vorheriges Löschen an und brechen dann ab.
-- Für bestehende Projekte weiterhin die Einzeldateien benutzen.
-- ============================================================================



-- ==========================================================================
-- SCHRITT 01 von 24: Grundgerüst: Personen und Einstellungen
-- Quelle: supabase/schema.sql
-- ==========================================================================

-- ============================================================
-- Stufenkasse – Supabase Schema
-- Ausführen im Supabase-Dashboard -> SQL Editor -> New query -> Run
-- ============================================================

-- Schüler (Halbjahre als JSONB, Beteiligungen als Gesamtzahl)
create table if not exists public.students (
  id             uuid primary key default gen_random_uuid(),
  nachname       text not null,
  vorname        text not null default '',
  beigetreten_ab text not null default 'EF.1',
  verlaesst_ab   text,
  beteiligungen  int  not null default 0,
  terms          jsonb not null default '{
    "EF.1":{"status":"offen"},
    "EF.2":{"status":"offen"},
    "Q1.1":{"status":"offen"},
    "Q1.2":{"status":"offen"},
    "Q2.1":{"status":"offen"},
    "Q2.2":{"status":"offen"}
  }'::jsonb,
  updated_at     timestamptz not null default now()
);
-- Falls die Tabelle schon existiert (aus einer früheren Version):
alter table public.students add column if not exists beteiligungen int not null default 0;

-- Geteilte Einstellungen (genau eine Zeile, id = 1)
create table if not exists public.app_settings (
  id                 int primary key default 1,
  aktuelles_halbjahr text not null default 'EF.1',
  schwelle           int  not null default 3,   -- benötigte Beteiligungen bis Q2.2
  zusatzbetrag       int  not null default 25
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;
alter table public.app_settings add column if not exists zusatzbetrag int not null default 25;

-- ---- Realtime ----
alter publication supabase_realtime add table public.students;
alter publication supabase_realtime add table public.app_settings;

-- ============================================================
-- Row Level Security: nur eingeloggte Nutzer dürfen lesen/schreiben
-- ============================================================
alter table public.students     enable row level security;
alter table public.app_settings enable row level security;

create policy "auth read students"   on public.students     for select to authenticated using (true);
create policy "auth write students"  on public.students     for all    to authenticated using (true) with check (true);
create policy "auth read settings"   on public.app_settings for select to authenticated using (true);
create policy "auth write settings"  on public.app_settings for all    to authenticated using (true) with check (true);


-- ==========================================================================
-- SCHRITT 02 von 24: Rollen und Konten
-- Quelle: supabase/roles.sql
-- ==========================================================================

-- ============================================================
-- Stufenkasse – Rollen & Rechte (Etappe 1)
-- Im Supabase SQL Editor ausführen (nach schema.sql). Idempotent.
-- Rollen: schueler < stufenteam < kassenwart < admin
-- ============================================================

-- 1) Profil-Tabelle (1 Zeile pro Konto)
create table if not exists public.profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  username      text,
  role          text not null default 'schueler'
                  check (role in ('schueler','stufenteam','kassenwart','admin')),
  student_id    uuid references public.students(id) on delete set null,
  has_logged_in boolean not null default false,
  created_at    timestamptz not null default now()
);
alter table public.profiles enable row level security;
do $$ begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null; end $$;

-- Rolle des aktuellen Nutzers (security definer, damit RLS sich nicht selbst blockiert)
create or replace function public.my_role() returns text
  language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where user_id = auth.uid()), 'schueler')
$$;

-- Neue Konten bekommen automatisch ein Profil (Rolle schueler)
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, username, role)
  values (new.id, split_part(new.email, '@', 1), 'schueler')
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Bestehende Konten nachtragen
insert into public.profiles (user_id, username, role)
select id, split_part(email, '@', 1), 'schueler' from auth.users
on conflict (user_id) do nothing;

-- Niemand darf seine EIGENE Rolle ändern (nur Admin über eigene Policy); Selbst-Update
-- (z. B. has_logged_in) bleibt erlaubt.
create or replace function public.guard_role_change() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() IS NULL = vertrauenswürdiger SQL-/service_role-Kontext (Bootstrap) -> erlaubt
  if new.role is distinct from old.role and auth.uid() is not null and public.my_role() <> 'admin' then
    raise exception 'Nur Admin darf Rollen ändern';
  end if;
  return new;
end $$;
drop trigger if exists guard_role on public.profiles;
create trigger guard_role before update on public.profiles
  for each row execute function public.guard_role_change();

-- Profile-Policies
drop policy if exists "profiles read"   on public.profiles;
drop policy if exists "profiles self"   on public.profiles;
drop policy if exists "profiles admin"  on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated
  using ( user_id = auth.uid() or public.my_role() in ('stufenteam','kassenwart','admin') );
create policy "profiles self" on public.profiles for update to authenticated
  using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );
create policy "profiles admin" on public.profiles for all to authenticated
  using ( public.my_role() = 'admin' ) with check ( public.my_role() = 'admin' );

-- 2) students: alte "alle dürfen alles"-Policies ersetzen
drop policy if exists "auth read students"  on public.students;
drop policy if exists "auth write students" on public.students;
drop policy if exists "students select"     on public.students;
drop policy if exists "students insert"     on public.students;
drop policy if exists "students update"     on public.students;
drop policy if exists "students delete"     on public.students;

-- Schüler sehen NUR ihre eigene Zeile; Team/Kassenwart/Admin sehen alle
create policy "students select" on public.students for select to authenticated
  using (
    public.my_role() in ('stufenteam','kassenwart','admin')
    or id = (select student_id from public.profiles where user_id = auth.uid())
  );
create policy "students insert" on public.students for insert to authenticated
  with check ( public.my_role() in ('stufenteam','kassenwart','admin') );
create policy "students update" on public.students for update to authenticated
  using ( public.my_role() in ('stufenteam','kassenwart','admin') )
  with check ( public.my_role() in ('stufenteam','kassenwart','admin') );
create policy "students delete" on public.students for delete to authenticated
  using ( public.my_role() in ('stufenteam','kassenwart','admin') );

-- Nur Kassenwart/Admin dürfen die BEITRÄGE (terms) ändern – per Trigger erzwungen
create or replace function public.guard_terms_change() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.terms is distinct from old.terms and auth.uid() is not null
     and public.my_role() not in ('kassenwart','admin') then
    raise exception 'Nur der Kassenwart darf Beiträge ändern';
  end if;
  return new;
end $$;
drop trigger if exists guard_terms on public.students;
create trigger guard_terms before update on public.students
  for each row execute function public.guard_terms_change();

-- 3) app_settings: alle lesen; nur Team/Kassenwart/Admin schreiben
drop policy if exists "auth read settings"  on public.app_settings;
drop policy if exists "auth write settings" on public.app_settings;
drop policy if exists "settings select"     on public.app_settings;
drop policy if exists "settings write"      on public.app_settings;
create policy "settings select" on public.app_settings for select to authenticated using ( true );
create policy "settings write"  on public.app_settings for all to authenticated
  using ( public.my_role() in ('stufenteam','kassenwart','admin') )
  with check ( public.my_role() in ('stufenteam','kassenwart','admin') );

-- 4) DICH zum Admin machen (nur der Nutzername – KEIN Passwort im Klartext)
update public.profiles set role = 'admin'
where user_id in (select id from auth.users where email = 'adams.tyler@sv-beitraege.local');


-- ==========================================================================
-- SCHRITT 03 von 24: Events: Infos, Abstimmungen, Nachrichten
-- Quelle: supabase/events.sql
-- ==========================================================================

-- ============================================================
-- Stufenkasse – Events (Infobeiträge, Abstimmungen, Nachrichten/Warnungen)
-- Nach roles.sql im SQL Editor ausführen. Idempotent.
-- ============================================================

create table if not exists public.events (
  id                uuid primary key default gen_random_uuid(),
  type              text not null check (type in ('info','umfrage','nachricht')),
  title             text not null,
  body              text not null default '',
  is_warning        boolean not null default false,
  audience          text not null default 'all' check (audience in ('all','selected')),
  poll_multiple     boolean not null default false,
  poll_min_one      boolean not null default false,
  poll_show_results boolean not null default true,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

create table if not exists public.event_targets (
  event_id   uuid references public.events(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  primary key (event_id, student_id)
);

create table if not exists public.poll_options (
  id       uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  label    text not null,
  position int not null default 0
);

create table if not exists public.poll_votes (
  event_id  uuid references public.events(id) on delete cascade,
  option_id uuid references public.poll_options(id) on delete cascade,
  user_id   uuid references auth.users(id) on delete cascade,
  primary key (event_id, option_id, user_id)
);

create table if not exists public.event_reads (
  event_id uuid references public.events(id) on delete cascade,
  user_id  uuid references auth.users(id) on delete cascade,
  read_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);

do $$ begin
  alter publication supabase_realtime add table public.events;         exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.poll_votes;     exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.poll_options;   exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.event_targets;  exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.event_reads;    exception when duplicate_object then null; end $$;

-- Sichtbarkeit eines Events für den aktuellen Nutzer
create or replace function public.can_see_event(eid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e where e.id = eid and (
      public.my_role() in ('stufenteam','kassenwart','admin')
      or e.audience = 'all'
      or exists (
        select 1 from public.event_targets t
        join public.profiles p on p.user_id = auth.uid()
        where t.event_id = e.id and t.student_id = p.student_id
      )
    )
  )
$$;

-- Warnungen dürfen nur Kassenwart/Admin anlegen
create or replace function public.guard_event_insert() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.is_warning and auth.uid() is not null and public.my_role() not in ('kassenwart','admin') then
    raise exception 'Warnungen dürfen nur Kassenwart/Admin senden';
  end if;
  return new;
end $$;
drop trigger if exists guard_event on public.events;
create trigger guard_event before insert on public.events
  for each row execute function public.guard_event_insert();

alter table public.events        enable row level security;
alter table public.event_targets enable row level security;
alter table public.poll_options  enable row level security;
alter table public.poll_votes    enable row level security;
alter table public.event_reads   enable row level security;

-- events
drop policy if exists "events select" on public.events;
drop policy if exists "events staff"  on public.events;
create policy "events select" on public.events for select to authenticated using ( public.can_see_event(id) );
create policy "events staff"  on public.events for all to authenticated
  using ( public.my_role() in ('stufenteam','kassenwart','admin') )
  with check ( public.my_role() in ('stufenteam','kassenwart','admin') );

-- event_targets
drop policy if exists "targets select" on public.event_targets;
drop policy if exists "targets staff"  on public.event_targets;
create policy "targets select" on public.event_targets for select to authenticated
  using ( public.my_role() in ('stufenteam','kassenwart','admin')
          or student_id = (select student_id from public.profiles where user_id = auth.uid()) );
create policy "targets staff" on public.event_targets for all to authenticated
  using ( public.my_role() in ('stufenteam','kassenwart','admin') )
  with check ( public.my_role() in ('stufenteam','kassenwart','admin') );

-- poll_options
drop policy if exists "options select" on public.poll_options;
drop policy if exists "options staff"  on public.poll_options;
create policy "options select" on public.poll_options for select to authenticated using ( public.can_see_event(event_id) );
create policy "options staff"  on public.poll_options for all to authenticated
  using ( public.my_role() in ('stufenteam','kassenwart','admin') )
  with check ( public.my_role() in ('stufenteam','kassenwart','admin') );

-- poll_votes
drop policy if exists "votes select" on public.poll_votes;
drop policy if exists "votes insert" on public.poll_votes;
drop policy if exists "votes delete" on public.poll_votes;
create policy "votes select" on public.poll_votes for select to authenticated
  using (
    user_id = auth.uid()
    or public.my_role() in ('stufenteam','kassenwart','admin')
    or exists (select 1 from public.events e where e.id = event_id and e.poll_show_results)
  );
create policy "votes insert" on public.poll_votes for insert to authenticated
  with check ( user_id = auth.uid() and public.can_see_event(event_id) );
create policy "votes delete" on public.poll_votes for delete to authenticated
  using ( user_id = auth.uid() );

-- event_reads (jeder verwaltet seine eigenen)
drop policy if exists "reads own" on public.event_reads;
create policy "reads own" on public.event_reads for all to authenticated
  using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );


-- ==========================================================================
-- SCHRITT 04 von 24: Ordner und Chats
-- Quelle: supabase/topics.sql
-- ==========================================================================

-- ============================================================
-- Stufenkasse – Themen/Übersicht (Planungs-Tool fürs Team)
-- Nach roles.sql im SQL Editor ausführen. Idempotent.
-- ============================================================

create table if not exists public.topics (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  tag        text not null default '',
  pinned     boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.topic_members (
  topic_id uuid references public.topics(id) on delete cascade,
  user_id  uuid references auth.users(id) on delete cascade,
  primary key (topic_id, user_id)
);

create table if not exists public.topic_items (
  id         uuid primary key default gen_random_uuid(),
  topic_id   uuid references public.topics(id) on delete cascade,
  type       text not null check (type in ('nachricht','todo','umfrage')),
  body       text not null,
  options    jsonb,                      -- Abstimmung: [{id,label}]
  done       boolean not null default false,   -- To-Do
  pinned     boolean not null default false,   -- Key-Info anheften
  author     text not null default '',         -- Anzeigename (denormalisiert)
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.topic_votes (
  item_id   uuid references public.topic_items(id) on delete cascade,
  option_id text not null,
  user_id   uuid references auth.users(id) on delete cascade,
  primary key (item_id, option_id, user_id)
);

create table if not exists public.topic_reads (
  topic_id  uuid references public.topics(id) on delete cascade,
  user_id   uuid references auth.users(id) on delete cascade,
  last_read timestamptz not null default now(),
  primary key (topic_id, user_id)
);

do $$ begin alter publication supabase_realtime add table public.topics;        exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.topic_members; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.topic_items;   exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.topic_votes;   exception when duplicate_object then null; end $$;

-- Zugriff: Team/Kassenwart/Admin sehen alle Themen; hinzugefügte Mitglieder ihr Thema
create or replace function public.can_access_topic(tid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.my_role() in ('stufenteam','kassenwart','admin')
      or exists (select 1 from public.topic_members m where m.topic_id = tid and m.user_id = auth.uid())
$$;

alter table public.topics        enable row level security;
alter table public.topic_members enable row level security;
alter table public.topic_items   enable row level security;
alter table public.topic_votes   enable row level security;
alter table public.topic_reads   enable row level security;

drop policy if exists "topics select" on public.topics;
drop policy if exists "topics staff"  on public.topics;
create policy "topics select" on public.topics for select to authenticated using ( public.can_access_topic(id) );
create policy "topics staff"  on public.topics for all to authenticated
  using ( public.my_role() in ('stufenteam','kassenwart','admin') )
  with check ( public.my_role() in ('stufenteam','kassenwart','admin') );

drop policy if exists "tmembers select" on public.topic_members;
drop policy if exists "tmembers staff"  on public.topic_members;
create policy "tmembers select" on public.topic_members for select to authenticated using ( public.can_access_topic(topic_id) );
create policy "tmembers staff"  on public.topic_members for all to authenticated
  using ( public.my_role() in ('stufenteam','kassenwart','admin') )
  with check ( public.my_role() in ('stufenteam','kassenwart','admin') );

drop policy if exists "titems select" on public.topic_items;
drop policy if exists "titems insert" on public.topic_items;
drop policy if exists "titems update" on public.topic_items;
drop policy if exists "titems delete" on public.topic_items;
create policy "titems select" on public.topic_items for select to authenticated using ( public.can_access_topic(topic_id) );
create policy "titems insert" on public.topic_items for insert to authenticated
  with check ( public.can_access_topic(topic_id) and created_by = auth.uid() );
-- Mitglieder dürfen aktualisieren (To-Do abhaken); Löschen nur Autor oder Team
create policy "titems update" on public.topic_items for update to authenticated
  using ( public.can_access_topic(topic_id) ) with check ( public.can_access_topic(topic_id) );
create policy "titems delete" on public.topic_items for delete to authenticated
  using ( created_by = auth.uid() or public.my_role() in ('stufenteam','kassenwart','admin') );

drop policy if exists "tvotes select" on public.topic_votes;
drop policy if exists "tvotes own"    on public.topic_votes;
create policy "tvotes select" on public.topic_votes for select to authenticated
  using ( exists (select 1 from public.topic_items i where i.id = item_id and public.can_access_topic(i.topic_id)) );
create policy "tvotes own" on public.topic_votes for all to authenticated
  using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );

drop policy if exists "treads own" on public.topic_reads;
create policy "treads own" on public.topic_reads for all to authenticated
  using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );


-- ==========================================================================
-- SCHRITT 05 von 24: Benachrichtigungen
-- Quelle: supabase/push.sql
-- ==========================================================================

-- ============================================================
-- Stufenkasse – Push-Abos (Web-Push Benachrichtigungen)
-- Nach roles.sql + events.sql im SQL Editor ausführen. Idempotent.
-- ============================================================

create table if not exists public.push_subscriptions (
  endpoint     text primary key,
  user_id      uuid references auth.users(id) on delete cascade,
  subscription jsonb not null,
  created_at   timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Jeder verwaltet nur seine eigenen Geräte-Abos.
-- (Die Edge Function liest mit dem service_role-Key und umgeht RLS.)
drop policy if exists "push own" on public.push_subscriptions;
create policy "push own" on public.push_subscriptions for all to authenticated
  using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );


-- ==========================================================================
-- SCHRITT 06 von 24: Konten mit Personen verknüpfen
-- Quelle: supabase/link-accounts.sql
-- ==========================================================================

-- ============================================================
-- Stufenkasse – Konten automatisch mit Schülern verknüpfen
-- Nach roles.sql im SQL Editor ausführen. Idempotent.
-- Nutzername-Schema: nachname.vorname (klein, ohne Umlaute/Sonderzeichen,
-- Leerzeichen/Zweitnamen -> Bindestrich)
-- ============================================================

-- Pflicht-Passwortwechsel-Flag (wird vom Konto-Skript auf true gesetzt;
-- die App erzwingt dann vor dem ersten Nutzen einen Passwortwechsel)
alter table public.profiles add column if not exists must_change_password boolean not null default false;

-- Zustimmung zu den Nutzungsbedingungen (Zeitstempel; null = noch nicht zugestimmt
-- -> die App zeigt vor der ersten Nutzung den Zustimmungsscreen)
alter table public.profiles add column if not exists terms_accepted_at timestamptz;

-- Namens-Normalisierung (Spiegel der JS-Logik in src/lib/username.ts),
-- angelehnt an die Schulmail vorname.nachname@…:
--   Bindestrich-Vornamen bleiben (anna-lena), Zweitname mit Leerzeichen fällt weg (juli),
--   mehrteilige Nachnamen zusammengezogen (vonbeispiel, grossemusterkamp),
--   ä->ae ö->oe ü->ue ß->ss, Akzente -> Grundbuchstabe.
create or replace function public.name_clean(s text) returns text
  language sql immutable as $$
  select trim(regexp_replace(regexp_replace(
    translate(
      replace(replace(replace(replace(lower(coalesce(s,'')),
        'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'),
      'àáâãåæèéêëìíîïòóôõøùúûçčñšžýÿ',
      'aaaaaaeeeeiiiiooooouuuccnszyy'),
    '[^a-z0-9 -]', '', 'g'), '\s+', ' ', 'g'))
$$;

create or replace function public.vorname_part(s text) returns text
  language sql immutable as $$
  select trim(both '-' from split_part(public.name_clean(s), ' ', 1))
$$;

create or replace function public.nachname_part(s text) returns text
  language sql immutable as $$
  select trim(both '-' from replace(public.name_clean(s), ' ', ''))
$$;

create or replace function public.username_for(nachname text, vorname text) returns text
  language sql immutable as $$
  select public.nachname_part(nachname) || '.' || public.vorname_part(vorname)
$$;

-- Trigger ersetzen: neues Konto -> Profil anlegen UND Schüler automatisch verknüpfen
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  uname text := split_part(new.email, '@', 1);
  sid uuid;
begin
  select id into sid from public.students
    where public.username_for(nachname, vorname) = uname
    limit 1;
  insert into public.profiles (user_id, username, role, student_id)
  values (new.id, uname, 'schueler', sid)
  on conflict (user_id) do update set student_id = coalesce(public.profiles.student_id, excluded.student_id);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Bestehende, noch unverknüpfte Profile nachträglich verknüpfen
update public.profiles p set student_id = s.id
from public.students s
where p.student_id is null
  and public.username_for(s.nachname, s.vorname) = p.username;

-- Kontrolle: wie viele Profile sind (un)verknüpft?
select
  count(*) filter (where student_id is not null) as verknuepft,
  count(*) filter (where student_id is null)     as unverknuepft
from public.profiles;


-- ==========================================================================
-- SCHRITT 07 von 24: Nutzungsbedingungen erzwingen
-- Quelle: supabase/consent.sql
-- ==========================================================================

-- ============================================================
-- Stufenkasse – Zustimmung auf DATENBANK-Ebene erzwingen
-- Nach roles.sql, events.sql, topics.sql ausführen. Idempotent.
--
-- Ohne Zustimmung (profiles.terms_accepted_at IS NULL) verweigert die DB
-- den Lesezugriff auf personenbezogene Daten – auch bei direkten
-- API-Aufrufen am Client vorbei. Das eigene Profil bleibt lesbar,
-- damit Zustimmungs-/Passwort-Screen funktionieren.
-- ============================================================

create or replace function public.has_consented() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(
    (select terms_accepted_at is not null from public.profiles where user_id = auth.uid()),
    false)
$$;

-- Schülerdaten: nur mit Zustimmung lesbar
drop policy if exists "students select" on public.students;
create policy "students select" on public.students for select to authenticated
  using ( public.has_consented() and (
    public.my_role() in ('stufenteam','kassenwart','admin')
    or id = (select student_id from public.profiles where user_id = auth.uid())
  ));

-- Events: Zustimmung in die Sichtbarkeitsfunktion einbauen
create or replace function public.can_see_event(eid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.has_consented() and exists (
    select 1 from public.events e where e.id = eid and (
      public.my_role() in ('stufenteam','kassenwart','admin')
      or e.audience = 'all'
      or exists (
        select 1 from public.event_targets t
        join public.profiles p on p.user_id = auth.uid()
        where t.event_id = e.id and t.student_id = p.student_id
      )
    )
  )
$$;

-- Themen: Zustimmung in die Zugriffsfunktion einbauen
create or replace function public.can_access_topic(tid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.has_consented() and (
    public.my_role() in ('stufenteam','kassenwart','admin')
    or exists (select 1 from public.topic_members m where m.topic_id = tid and m.user_id = auth.uid())
  )
$$;

-- Profile: eigene Zeile immer lesbar (nötig für die Gates VOR der Zustimmung);
-- fremde Profile nur für Team – und nur mit Zustimmung
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated
  using (
    user_id = auth.uid()
    or ( public.has_consented() and public.my_role() in ('stufenteam','kassenwart','admin') )
  );


-- ==========================================================================
-- SCHRITT 08 von 24: Komitees und Unterordner
-- Quelle: supabase/komitees.sql
-- ==========================================================================

-- ============================================================
-- Stufenkasse – Komitees (Tag-Mitglieder), Unterordner, Beitrags-Titel
-- Nach topics.sql + consent.sql ausführen. Idempotent.
-- ============================================================

-- Unterordner: Ordner können in Ordnern liegen
alter table public.topics add column if not exists parent_id uuid references public.topics(id) on delete cascade;

-- Beiträge bekommen einen optionalen Titel
alter table public.topic_items add column if not exists title text not null default '';

-- Komitee-Mitglieder: wer einen Tag hat, sieht & schreibt in ALLEN Ordnern dieses Tags
create table if not exists public.tag_members (
  tag     text not null,
  user_id uuid references auth.users(id) on delete cascade,
  primary key (tag, user_id)
);
do $$ begin alter publication supabase_realtime add table public.tag_members; exception when duplicate_object then null; end $$;

alter table public.tag_members enable row level security;
drop policy if exists "tagmembers select" on public.tag_members;
drop policy if exists "tagmembers staff"  on public.tag_members;
create policy "tagmembers select" on public.tag_members for select to authenticated
  using ( user_id = auth.uid() or public.my_role() in ('stufenteam','kassenwart','admin') );
create policy "tagmembers staff" on public.tag_members for all to authenticated
  using ( public.my_role() in ('stufenteam','kassenwart','admin') )
  with check ( public.my_role() in ('stufenteam','kassenwart','admin') );

-- Zugriff erweitern: Team ODER Ordner-Mitglied ODER Komitee-Mitglied (Tag) – nur mit Zustimmung
create or replace function public.can_access_topic(tid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.has_consented() and (
    public.my_role() in ('stufenteam','kassenwart','admin')
    or exists (select 1 from public.topic_members m where m.topic_id = tid and m.user_id = auth.uid())
    or exists (
      select 1 from public.topics t
      join public.tag_members g on g.tag = t.tag and g.user_id = auth.uid()
      where t.id = tid and t.tag <> ''
    )
  )
$$;


-- ==========================================================================
-- SCHRITT 09 von 24: Nur-Admin-Ordner
-- Quelle: supabase/admin-only.sql
-- ==========================================================================

-- ============================================================
-- Stufenkasse – Admin-only-Ordner (nur der Admin sieht sie, auch Team nicht)
-- Nach komitees.sql ausführen. Idempotent.
-- ============================================================

alter table public.topics add column if not exists admin_only boolean not null default false;

-- Zugriff: admin_only-Ordner sieht NUR der Admin; sonst wie gehabt
create or replace function public.can_access_topic(tid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.has_consented() and (
    public.my_role() = 'admin'
    or (
      (select coalesce(t.admin_only, false) from public.topics t where t.id = tid) = false
      and (
        public.my_role() in ('stufenteam','kassenwart')
        or exists (select 1 from public.topic_members m where m.topic_id = tid and m.user_id = auth.uid())
        or exists (
          select 1 from public.topics t
          join public.tag_members g on g.tag = t.tag and g.user_id = auth.uid()
          where t.id = tid and t.tag <> ''
        )
      )
    )
  )
$$;

-- Schreibrechte auf topics: Team/Kassenwart nur für nicht-versteckte Ordner, Admin überall
drop policy if exists "topics staff" on public.topics;
create policy "topics staff" on public.topics for all to authenticated
  using (
    public.my_role() = 'admin'
    or ( public.my_role() in ('stufenteam','kassenwart') and not admin_only )
  )
  with check (
    public.my_role() = 'admin'
    or ( public.my_role() in ('stufenteam','kassenwart') and not admin_only )
  );

-- Beitrags-Löschung sauber begrenzen: nur wer den Ordner sehen darf
-- (eigene Beiträge: jeder selbst; fremde: Team/Kassenwart/Admin)
drop policy if exists "titems delete" on public.topic_items;
create policy "titems delete" on public.topic_items for delete to authenticated
  using (
    public.can_access_topic(topic_id)
    and ( created_by = auth.uid() or public.my_role() in ('stufenteam','kassenwart','admin') )
  );


-- ==========================================================================
-- SCHRITT 10 von 24: Sichtbarkeit von Ordnern
-- Quelle: supabase/visibility.sql
-- ==========================================================================

-- ============================================================
-- Stufenkasse – Sichtbarkeit von Ordnern (privat / personen / stufenteam / komitee)
-- Nach topics.sql, komitees.sql, admin-only.sql ausführen. Idempotent.
--   privat     = nur Ersteller (und Admin)
--   personen   = Ersteller + ausgewählte Personen (topic_members)
--   stufenteam = Ersteller + Stufenteam/Kassenwart/Admin
--   komitee    = Ersteller + alle Mitglieder des Komitees (topics.tag)
--   admin_only = überschreibt alles: nur Admin
-- ============================================================

-- Default 'stufenteam', damit bereits vorhandene Test-Ordner nicht verschwinden.
alter table public.topics add column if not exists visibility text not null default 'stufenteam'
  check (visibility in ('privat','personen','stufenteam','komitee'));

create or replace function public.can_access_topic(tid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.has_consented() and exists (
    select 1 from public.topics t where t.id = tid and (
      public.my_role() = 'admin'
      or ( not t.admin_only and (
        t.created_by = auth.uid()
        or ( t.visibility = 'stufenteam' and public.my_role() in ('stufenteam','kassenwart') )
        or ( t.visibility = 'personen'
             and exists (select 1 from public.topic_members m where m.topic_id = t.id and m.user_id = auth.uid()) )
        or ( t.visibility = 'komitee' and t.tag <> ''
             and exists (select 1 from public.tag_members g where g.tag = t.tag and g.user_id = auth.uid()) )
      ))
    )
  )
$$;

-- SELECT auf topics läuft NUR noch über can_access_topic (respektiert die Sichtbarkeit).
-- Schreibrechte (anlegen/ändern/löschen) getrennt, damit Team nicht per for-all alles sieht.
drop policy if exists "topics staff"  on public.topics;
drop policy if exists "topics select" on public.topics;
drop policy if exists "topics insert" on public.topics;
drop policy if exists "topics update" on public.topics;
drop policy if exists "topics delete" on public.topics;

create policy "topics select" on public.topics for select to authenticated
  using ( public.can_access_topic(id) );
create policy "topics insert" on public.topics for insert to authenticated
  with check ( public.my_role() in ('stufenteam','kassenwart','admin') and not admin_only or public.my_role() = 'admin' );
create policy "topics update" on public.topics for update to authenticated
  using ( created_by = auth.uid() or public.my_role() = 'admin'
          or ( public.my_role() in ('stufenteam','kassenwart') and not admin_only ) )
  with check ( created_by = auth.uid() or public.my_role() = 'admin'
          or ( public.my_role() in ('stufenteam','kassenwart') and not admin_only ) );
create policy "topics delete" on public.topics for delete to authenticated
  using ( created_by = auth.uid() or public.my_role() = 'admin'
          or ( public.my_role() in ('stufenteam','kassenwart') and not admin_only ) );


-- ==========================================================================
-- SCHRITT 11 von 24: Team sieht alles, Admin kann sperren
-- Quelle: supabase/governance.sql
-- ==========================================================================

-- ============================================================
-- Stufenkasse – Governance: Team sieht alles, Admin kann sperren
-- Nach visibility.sql ausführen. Idempotent.
-- ============================================================

-- Sperre/Timeout: chat_banned_until = null (frei) oder Zeitpunkt (gesperrt bis dahin)
alter table public.profiles add column if not exists chat_banned_until timestamptz;

-- Team/Kassenwart sehen ALLE Ordner (außer admin_only). Admin sieht alles.
create or replace function public.can_access_topic(tid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.has_consented() and exists (
    select 1 from public.topics t where t.id = tid and (
      public.my_role() = 'admin'
      or ( not t.admin_only and (
        public.my_role() in ('stufenteam','kassenwart')   -- Team sieht immer alles
        or t.created_by = auth.uid()
        or ( t.visibility = 'personen'
             and exists (select 1 from public.topic_members m where m.topic_id = t.id and m.user_id = auth.uid()) )
        or ( t.visibility = 'komitee' and t.tag <> ''
             and exists (select 1 from public.tag_members g where g.tag = t.tag and g.user_id = auth.uid()) )
      ))
    )
  )
$$;

-- Ist der aktuelle Nutzer aktuell gesperrt?
create or replace function public.is_banned() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(
    (select chat_banned_until is not null and chat_banned_until > now()
       from public.profiles where user_id = auth.uid()),
    false)
$$;

-- Gesperrte dürfen keine Beiträge posten und nicht abstimmen
drop policy if exists "titems insert" on public.topic_items;
create policy "titems insert" on public.topic_items for insert to authenticated
  with check ( public.can_access_topic(topic_id) and created_by = auth.uid() and not public.is_banned() );

drop policy if exists "tvotes own" on public.topic_votes;
create policy "tvotes own" on public.topic_votes for all to authenticated
  using ( user_id = auth.uid() )
  with check ( user_id = auth.uid() and not public.is_banned() );

-- Guard: nur Admin darf Rolle UND Sperre ändern (Selbst-Entsperren verhindern)
create or replace function public.guard_role_change() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.my_role() <> 'admin' then
    if new.role is distinct from old.role then
      raise exception 'Nur Admin darf Rollen ändern';
    end if;
    if new.chat_banned_until is distinct from old.chat_banned_until then
      raise exception 'Nur Admin darf sperren/entsperren';
    end if;
  end if;
  return new;
end $$;


-- ==========================================================================
-- SCHRITT 12 von 24: Mehrere Sichtbarkeits-Ziele je Ordner
-- Quelle: supabase/multi-visibility.sql
-- ==========================================================================

-- ============================================================
-- Stufenkasse – Mehrere Sichtbarkeits-Ziele je Ordner
-- Personen (topic_members) UND mehrere Komitees (topic_tags) frei kombinierbar.
-- Nach governance.sql ausführen. Idempotent.
-- ============================================================

-- Komitee-Sichtbarkeiten eines Ordners (mehrere möglich)
create table if not exists public.topic_tags (
  topic_id uuid not null references public.topics(id) on delete cascade,
  tag text not null,
  primary key (topic_id, tag)
);
alter table public.topic_tags enable row level security;
do $$ begin alter publication supabase_realtime add table public.topic_tags; exception when duplicate_object then null; end $$;

drop policy if exists "ttags select" on public.topic_tags;
drop policy if exists "ttags staff"  on public.topic_tags;
create policy "ttags select" on public.topic_tags for select to authenticated
  using ( public.can_access_topic(topic_id) );
create policy "ttags staff" on public.topic_tags for all to authenticated
  using ( public.my_role() in ('stufenteam','kassenwart','admin') )
  with check ( public.my_role() in ('stufenteam','kassenwart','admin') );

-- Zugriff: Team sieht alles (außer admin_only); sonst Ersteller,
-- ausgewählte Personen ODER Mitglied eines der freigegebenen Komitees.
create or replace function public.can_access_topic(tid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.has_consented() and exists (
    select 1 from public.topics t where t.id = tid and (
      public.my_role() = 'admin'
      or ( not t.admin_only and (
        public.my_role() in ('stufenteam','kassenwart')          -- Team sieht immer alles
        or t.created_by = auth.uid()
        or exists (select 1 from public.topic_members m
                     where m.topic_id = t.id and m.user_id = auth.uid())
        or exists (select 1 from public.topic_tags tt
                     join public.tag_members g on g.tag = tt.tag and g.user_id = auth.uid()
                     where tt.topic_id = t.id)
        -- Alt-Ordner: einzelnes Komitee über visibility='komitee' + tag
        or ( t.visibility = 'komitee' and t.tag <> ''
             and exists (select 1 from public.tag_members g
                           where g.tag = t.tag and g.user_id = auth.uid()) )
      ))
    )
  )
$$;


-- ==========================================================================
-- SCHRITT 13 von 24: Autoren-Markierung an Nachrichten
-- Quelle: supabase/author-badges.sql
-- ==========================================================================

-- ============================================================
-- Stufenkasse – Autoren-Markierung an Nachrichten
-- Rolle + relevante Komitees des Autors werden beim Schreiben mitgespeichert,
-- damit jede/r Betrachter/in (auch Schüler) die Markierung sieht.
-- Nach multi-visibility.sql ausführen. Idempotent.
-- ============================================================

alter table public.topic_items add column if not exists author_role text;
alter table public.topic_items add column if not exists author_koms text[];


-- ==========================================================================
-- SCHRITT 14 von 24: Konfigurierbare Berechtigungen
-- Quelle: supabase/permissions.sql
-- ==========================================================================

-- ============================================================
-- Stufenkasse – Konfigurierbare Berechtigungen (Rolle + einzelne Person)
-- ZULETZT ausführen: nach governance.sql, multi-visibility.sql, author-badges.sql.
-- Idempotent. Standard-Rechte bilden das bisherige Verhalten 1:1 nach.
-- ============================================================

-- 1) Tabellen: Rollen-Defaults + persönliche Overrides
create table if not exists public.role_permissions (
  role text not null check (role in ('schueler','stufenteam','kassenwart','admin')),
  perm text not null,
  allowed boolean not null default true,
  primary key (role, perm)
);
create table if not exists public.user_permissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  perm text not null,
  allowed boolean not null,
  primary key (user_id, perm)
);
alter table public.role_permissions enable row level security;
alter table public.user_permissions enable row level security;
do $$ begin alter publication supabase_realtime add table public.role_permissions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.user_permissions; exception when duplicate_object then null; end $$;

-- 2) has_perm(): Admin = alles; sonst persönlicher Override vor Rollen-Default
create or replace function public.has_perm(p text) returns boolean
  language sql stable security definer set search_path = public as $$
  select case
    when public.my_role() = 'admin' then true
    else coalesce(
      (select allowed from public.user_permissions where user_id = auth.uid() and perm = p),
      (select allowed from public.role_permissions where role = public.my_role() and perm = p),
      false)
  end
$$;

-- 3) Policies: lesen fürs UI, schreiben nur wer perms.manage hat
drop policy if exists "roleperm select" on public.role_permissions;
drop policy if exists "roleperm manage" on public.role_permissions;
create policy "roleperm select" on public.role_permissions for select to authenticated using ( true );
create policy "roleperm manage" on public.role_permissions for all to authenticated
  using ( public.has_perm('perms.manage') ) with check ( public.has_perm('perms.manage') );

drop policy if exists "userperm select" on public.user_permissions;
drop policy if exists "userperm manage" on public.user_permissions;
create policy "userperm select" on public.user_permissions for select to authenticated
  using ( user_id = auth.uid() or public.has_perm('perms.manage') );
create policy "userperm manage" on public.user_permissions for all to authenticated
  using ( public.has_perm('perms.manage') ) with check ( public.has_perm('perms.manage') );

-- 4) Standard-Rechte je Rolle (nur anlegen, bestehende NICHT überschreiben)
insert into public.role_permissions (role, perm, allowed) values
  ('stufenteam','chats.view_all',true),
  ('stufenteam','chats.delete_messages',true),
  ('stufenteam','chats.manage',true),
  ('stufenteam','komitees.assign',true),
  ('stufenteam','data.edit',true),
  ('stufenteam','mod.timeout',true),
  ('kassenwart','chats.view_all',true),
  ('kassenwart','chats.delete_messages',true),
  ('kassenwart','chats.manage',true),
  ('kassenwart','komitees.assign',true),
  ('kassenwart','data.edit',true),
  ('kassenwart','kasse.edit',true),
  ('kassenwart','mod.timeout',true),
  ('admin','chats.view_all',true),
  ('admin','chats.delete_messages',true),
  ('admin','chats.manage',true),
  ('admin','komitees.assign',true),
  ('admin','data.edit',true),
  ('admin','kasse.edit',true),
  ('admin','mod.timeout',true),
  ('admin','roles.manage',true),
  ('admin','perms.manage',true)
on conflict (role, perm) do nothing;

-- 5) Zugriff auf Ordner/Chats: has_perm('chats.view_all') statt fester Rollen
create or replace function public.can_access_topic(tid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.has_consented() and exists (
    select 1 from public.topics t where t.id = tid and (
      public.my_role() = 'admin'
      or ( not t.admin_only and (
        public.has_perm('chats.view_all')
        or t.created_by = auth.uid()
        or exists (select 1 from public.topic_members m where m.topic_id = t.id and m.user_id = auth.uid())
        or exists (select 1 from public.topic_tags tt
                     join public.tag_members g on g.tag = tt.tag and g.user_id = auth.uid()
                     where tt.topic_id = t.id)
        or ( t.visibility = 'komitee' and t.tag <> ''
             and exists (select 1 from public.tag_members g where g.tag = t.tag and g.user_id = auth.uid()) )
      ))
    )
  )
$$;

-- 6) Ordner schreiben/verwalten: has_perm('chats.manage'); admin_only nur Admin
drop policy if exists "topics staff" on public.topics;
create policy "topics staff" on public.topics for all to authenticated
  using ( public.my_role() = 'admin' or ( public.has_perm('chats.manage') and not admin_only ) )
  with check ( public.my_role() = 'admin' or ( public.has_perm('chats.manage') and not admin_only ) );

-- 7) Nachrichten löschen: eigene immer, fremde mit chats.delete_messages
drop policy if exists "titems delete" on public.topic_items;
create policy "titems delete" on public.topic_items for delete to authenticated
  using ( public.can_access_topic(topic_id)
    and ( created_by = auth.uid() or public.has_perm('chats.delete_messages') ) );

-- 8) Komitees zuweisen: has_perm('komitees.assign'); Selbstzuweisung genau EINMAL
drop policy if exists "tagmembers select" on public.tag_members;
drop policy if exists "tagmembers staff"  on public.tag_members;
drop policy if exists "tagmembers manage" on public.tag_members;
drop policy if exists "tagmembers self once" on public.tag_members;
create policy "tagmembers select" on public.tag_members for select to authenticated
  using ( user_id = auth.uid() or public.has_perm('komitees.assign') );
create policy "tagmembers manage" on public.tag_members for all to authenticated
  using ( public.has_perm('komitees.assign') ) with check ( public.has_perm('komitees.assign') );
-- eigene Zuweisung nur, solange man in KEINEM Komitee ist (danach gesperrt)
create policy "tagmembers self once" on public.tag_members for insert to authenticated
  with check ( user_id = auth.uid()
    and not exists (select 1 from public.tag_members g where g.user_id = auth.uid()) );

-- 9) Rollen ändern (roles.manage) und Sperren (mod.timeout) – spaltengenau per Trigger
create or replace function public.guard_role_change() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if new.role is distinct from old.role and not public.has_perm('roles.manage') then
      raise exception 'Keine Berechtigung, Rollen zu ändern';
    end if;
    if new.chat_banned_until is distinct from old.chat_banned_until and not public.has_perm('mod.timeout') then
      raise exception 'Keine Berechtigung zum Sperren/Entsperren';
    end if;
    if new.student_id is distinct from old.student_id and not public.has_perm('roles.manage') then
      raise exception 'Keine Berechtigung, die Zuordnung zu ändern';
    end if;
  end if;
  return new;
end $$;

-- Profile anderer aktualisieren: wer Rollen verwalten ODER sperren darf (Spalten schützt der Trigger)
drop policy if exists "profiles moderate" on public.profiles;
create policy "profiles moderate" on public.profiles for update to authenticated
  using ( public.has_perm('roles.manage') or public.has_perm('mod.timeout') )
  with check ( public.has_perm('roles.manage') or public.has_perm('mod.timeout') );


-- ==========================================================================
-- SCHRITT 15 von 24: Beiträge und Tickets
-- Quelle: supabase/punkte-und-chats.sql
-- ==========================================================================

-- ============================================================
-- Stufenkasse – Beitragspunkte + Chats/Tickets
-- Reihenfolge: NACH permissions.sql ausführen. Idempotent (mehrfach ausführbar).
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1) Beitragspunkte: einzelne Einträge statt einer nackten Zahl
-- ------------------------------------------------------------
create table if not exists public.contributions (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  titel       text not null,
  punkte      integer not null default 1,
  datum       date not null default current_date,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists contributions_student_idx on public.contributions(student_id);
alter table public.contributions enable row level security;

-- Sehen: eigene Einträge; alle sehen, wer Daten bearbeiten darf oder im Team ist
drop policy if exists "contrib select" on public.contributions;
create policy "contrib select" on public.contributions for select to authenticated
  using (
    public.has_consented() and (
      public.my_role() in ('stufenteam','kassenwart','admin')
      or public.has_perm('data.edit')
      or student_id = (select student_id from public.profiles where user_id = auth.uid())
    )
  );

-- Anlegen/Ändern/Löschen: nur mit Recht "data.edit" (Stufenteam, Kassenwart, Admin)
drop policy if exists "contrib write" on public.contributions;
create policy "contrib write" on public.contributions for all to authenticated
  using ( public.has_perm('data.edit') )
  with check ( public.has_perm('data.edit') );

-- Zielpunktzahl, die jede Person bis zum Ende erreichen muss
alter table public.app_settings add column if not exists ziel_punkte integer not null default 30;

do $$ begin
  alter publication supabase_realtime add table public.contributions;
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 2) Chats & Tickets bauen auf den vorhandenen Ordnern auf
--    kind: 'ordner' (wie bisher) | 'chat' (Komitee-Chat) | 'ticket' (Frage ans Stufenteam)
-- ------------------------------------------------------------
alter table public.topics add column if not exists kind text not null default 'ordner';
alter table public.topics add column if not exists status text not null default 'offen';

-- Jede Person darf ein Ticket eröffnen (und nur das – kind ist festgenagelt).
drop policy if exists "topics ticket create" on public.topics;
create policy "topics ticket create" on public.topics for insert to authenticated
  with check (
    kind = 'ticket'
    and created_by = auth.uid()
    and not admin_only
    and public.has_consented()
    and not public.is_banned()
  );

-- Eigenes Ticket schließen/wieder öffnen darf auch die Person selbst.
drop policy if exists "topics ticket own" on public.topics;
create policy "topics ticket own" on public.topics for update to authenticated
  using ( kind = 'ticket' and created_by = auth.uid() )
  with check ( kind = 'ticket' and created_by = auth.uid() );

do $$ begin
  alter publication supabase_realtime add table public.topics;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.topic_items;
exception when duplicate_object then null; end $$;


-- ==========================================================================
-- SCHRITT 16 von 24: OP-Schutz, Sperren, Vorlagen, Fremdzugriff
-- Quelle: supabase/erweiterungen.sql
-- ==========================================================================

-- ============================================================
-- Stufenkasse – Erweiterungen: OP-Schutz, Sperr-Dauer, Entbannung,
-- Events an Komitees, Beitrags-Vorlagen, Umfrage-Optionen, Fremdzugriffe
-- Reihenfolge: NACH punkte-und-chats.sql. Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1) OP: ein geschütztes Konto, das niemand ändern oder sperren kann
-- ------------------------------------------------------------
alter table public.profiles add column if not exists is_op boolean not null default false;

-- Tyler als OP setzen (Nutzername adams.tyler)
update public.profiles set is_op = true
 where user_id in (select id from auth.users where email = 'adams.tyler@sv-beitraege.local');

create or replace function public.op_user() returns uuid
  language sql stable security definer set search_path = public as $$
  select user_id from public.profiles where is_op limit 1
$$;

-- ------------------------------------------------------------
-- 2) Sperre: zusätzlich "dauerhaft" statt Datum im Jahr 2099
-- ------------------------------------------------------------
alter table public.profiles add column if not exists chat_ban_permanent boolean not null default false;

create or replace function public.is_banned() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(
    (select chat_ban_permanent or (chat_banned_until is not null and chat_banned_until > now())
       from public.profiles where user_id = auth.uid()),
    false)
$$;

-- Guard: Rechte/Rollen/Sperren – und der OP ist unantastbar
create or replace function public.guard_role_change() returns trigger
  language plpgsql security definer set search_path = public as $$
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
    if new.role is distinct from old.role and not public.has_perm('roles.manage') then
      raise exception 'Keine Berechtigung, Rollen zu ändern';
    end if;
    if (new.chat_banned_until is distinct from old.chat_banned_until
        or new.chat_ban_permanent is distinct from old.chat_ban_permanent)
       and not public.has_perm('mod.timeout') then
      raise exception 'Keine Berechtigung zum Sperren/Entsperren';
    end if;
    if new.student_id is distinct from old.student_id and not public.has_perm('roles.manage') then
      raise exception 'Keine Berechtigung, die Zuordnung zu ändern';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_role on public.profiles;
create trigger guard_role before update on public.profiles
  for each row execute function public.guard_role_change();

-- Auch persönliche Rechte des OP sind gesperrt
create or replace function public.guard_op_perms() returns trigger
  language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  target := coalesce(new.user_id, old.user_id);
  if auth.uid() is not null and target = public.op_user() and auth.uid() <> target then
    raise exception 'Die Rechte dieses Kontos sind geschützt';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists guard_op_userperms on public.user_permissions;
create trigger guard_op_userperms before insert or update or delete on public.user_permissions
  for each row execute function public.guard_op_perms();

-- has_perm: der OP darf immer alles
create or replace function public.has_perm(p text) returns boolean
  language sql stable security definer set search_path = public as $$
  select case
    when public.my_role() = 'admin' then true
    when coalesce((select is_op from public.profiles where user_id = auth.uid()), false) then true
    else coalesce(
      (select allowed from public.user_permissions where user_id = auth.uid() and perm = p),
      (select allowed from public.role_permissions where role = public.my_role() and perm = p),
      false)
  end
$$;

-- ------------------------------------------------------------
-- 3) Entbannungsanfrage: eine offene Anfrage pro Sperre
-- ------------------------------------------------------------
create table if not exists public.unban_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  nachricht  text not null default '',
  status     text not null default 'offen' check (status in ('offen','angenommen','abgelehnt')),
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz
);
create unique index if not exists unban_one_open on public.unban_requests(user_id) where status = 'offen';
alter table public.unban_requests enable row level security;

drop policy if exists "unban select" on public.unban_requests;
create policy "unban select" on public.unban_requests for select to authenticated
  using ( user_id = auth.uid() or public.has_perm('mod.timeout') or public.has_perm('chats.view_all') );

drop policy if exists "unban insert" on public.unban_requests;
create policy "unban insert" on public.unban_requests for insert to authenticated
  with check ( user_id = auth.uid() and public.is_banned() );

drop policy if exists "unban decide" on public.unban_requests;
create policy "unban decide" on public.unban_requests for update to authenticated
  using ( public.has_perm('mod.timeout') ) with check ( public.has_perm('mod.timeout') );

do $$ begin
  alter publication supabase_realtime add table public.unban_requests;
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 4) Events zusätzlich an ganze Komitees
-- ------------------------------------------------------------
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.events'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%audience%';
  if c is not null then execute format('alter table public.events drop constraint %I', c); end if;
end $$;
alter table public.events add constraint events_audience_check
  check (audience in ('all','selected','komitee'));

create table if not exists public.event_committees (
  event_id uuid not null references public.events(id) on delete cascade,
  tag      text not null,
  primary key (event_id, tag)
);
alter table public.event_committees enable row level security;

drop policy if exists "evkom select" on public.event_committees;
create policy "evkom select" on public.event_committees for select to authenticated using ( true );
drop policy if exists "evkom staff" on public.event_committees;
create policy "evkom staff" on public.event_committees for all to authenticated
  using ( public.has_perm('data.edit') ) with check ( public.has_perm('data.edit') );

create or replace function public.can_see_event(eid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.has_consented() and exists (
    select 1 from public.events e where e.id = eid and (
      public.my_role() in ('stufenteam','kassenwart','admin')
      or e.audience = 'all'
      or ( e.audience = 'selected' and exists (
            select 1 from public.event_targets t
              join public.profiles p on p.student_id = t.student_id
             where t.event_id = e.id and p.user_id = auth.uid() ) )
      or ( e.audience = 'komitee' and exists (
            select 1 from public.event_committees ec
              join public.tag_members g on g.tag = ec.tag and g.user_id = auth.uid()
             where ec.event_id = e.id ) )
    )
  )
$$;

do $$ begin
  alter publication supabase_realtime add table public.event_committees;
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 5) Vorlagen für Beitragspunkte
-- ------------------------------------------------------------
create table if not exists public.contribution_templates (
  id     uuid primary key default gen_random_uuid(),
  titel  text not null,
  punkte integer not null default 5,
  sort   integer not null default 100
);
alter table public.contribution_templates enable row level security;

drop policy if exists "tpl select" on public.contribution_templates;
create policy "tpl select" on public.contribution_templates for select to authenticated using ( true );
drop policy if exists "tpl write" on public.contribution_templates;
create policy "tpl write" on public.contribution_templates for all to authenticated
  using ( public.has_perm('data.edit') ) with check ( public.has_perm('data.edit') );

insert into public.contribution_templates (titel, punkte, sort)
select * from (values
  ('Kuchen gebacken', 5, 10),
  ('Kuchenverkauf – Schicht', 8, 20),
  ('Auf-/Abbau bei einer Aktion', 8, 30),
  ('Waffel-/Getränkeverkauf', 8, 40),
  ('Plakate & Werbung gestaltet', 5, 50),
  ('Einkauf erledigt', 4, 60),
  ('Orga-Treffen vorbereitet', 6, 70),
  ('Ganzen Tag Standdienst', 15, 80)
) as v(titel, punkte, sort)
where not exists (select 1 from public.contribution_templates);

do $$ begin
  alter publication supabase_realtime add table public.contribution_templates;
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 6) Umfragen: Einfach-/Mehrfachwahl, Frist, anonym
-- ------------------------------------------------------------
alter table public.topic_items add column if not exists poll_multi    boolean not null default false;
alter table public.topic_items add column if not exists poll_anon     boolean not null default false;
alter table public.topic_items add column if not exists poll_deadline timestamptz;

-- ------------------------------------------------------------
-- 7) Zugriff auf fremde Komitees (lesen oder schreiben)
--    Entweder für eine Person (user_id) oder für ein ganzes Komitee (from_tag).
-- ------------------------------------------------------------
create table if not exists public.committee_access (
  id       uuid primary key default gen_random_uuid(),
  tag      text not null,                    -- auf welches Komitee
  user_id  uuid,                             -- wer (Person) …
  from_tag text,                             -- … oder welches Komitee
  mode     text not null default 'read' check (mode in ('read','write')),
  created_at timestamptz not null default now(),
  check (num_nonnulls(user_id, from_tag) = 1)
);
create index if not exists committee_access_tag_idx on public.committee_access(tag);
alter table public.committee_access enable row level security;

drop policy if exists "camode select" on public.committee_access;
create policy "camode select" on public.committee_access for select to authenticated using ( true );
drop policy if exists "camode manage" on public.committee_access;
create policy "camode manage" on public.committee_access for all to authenticated
  using ( public.has_perm('komitees.access') ) with check ( public.has_perm('komitees.access') );

insert into public.role_permissions (role, perm, allowed) values ('admin','komitees.access',true)
on conflict (role, perm) do nothing;

/** Hat der aktuelle Nutzer Zugriff auf ein fremdes Komitee? need = 'read' | 'write' */
create or replace function public.komitee_access(slug text, need text) returns boolean
  language sql stable security definer set search_path = public as $$
  select slug is not null and slug <> '' and exists (
    select 1 from public.committee_access ca
     where ca.tag = slug
       and (need = 'read' or ca.mode = 'write')
       and ( ca.user_id = auth.uid()
             or (ca.from_tag is not null and exists (
                   select 1 from public.tag_members g where g.tag = ca.from_tag and g.user_id = auth.uid())) )
  )
$$;

/** Zugriff ohne Fremd-Freigaben (Basis für Schreibrechte). */
create or replace function public.topic_core_access(tid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.has_consented() and exists (
    select 1 from public.topics t where t.id = tid and (
      public.my_role() = 'admin'
      or ( not t.admin_only and (
        public.has_perm('chats.view_all')
        or t.created_by = auth.uid()
        or exists (select 1 from public.topic_members m where m.topic_id = t.id and m.user_id = auth.uid())
        or exists (select 1 from public.topic_tags tt
                     join public.tag_members g on g.tag = tt.tag and g.user_id = auth.uid()
                    where tt.topic_id = t.id)
        or ( t.visibility = 'komitee' and t.tag <> ''
             and exists (select 1 from public.tag_members g where g.tag = t.tag and g.user_id = auth.uid()) )
      ))
    )
  )
$$;

create or replace function public.can_access_topic(tid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.topic_core_access(tid)
     or ( public.has_consented() and exists (
            select 1 from public.topics t
             where t.id = tid and not t.admin_only and public.komitee_access(t.tag, 'read') ) )
$$;

create or replace function public.can_write_topic(tid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.topic_core_access(tid)
     or ( public.has_consented() and exists (
            select 1 from public.topics t
             where t.id = tid and not t.admin_only and public.komitee_access(t.tag, 'write') ) )
$$;

-- Schreiben nur mit Schreibrecht (Fremd-Leser dürfen nur mitlesen)
drop policy if exists "titems insert" on public.topic_items;
create policy "titems insert" on public.topic_items for insert to authenticated
  with check ( public.can_write_topic(topic_id) and created_by = auth.uid() and not public.is_banned() );

do $$ begin
  alter publication supabase_realtime add table public.committee_access;
exception when duplicate_object then null; end $$;


-- ==========================================================================
-- SCHRITT 17 von 24: Anzeigename, Initialen, Namensfarbe
-- Quelle: supabase/profile.sql
-- ==========================================================================

-- ============================================================
-- Stufenkasse – Profile: Anzeigename, Initialen, Namensfarbe
-- + Antrag auf Komitee-Wechsel
-- Reihenfolge: NACH erweiterungen.sql. Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Anzeige-Profil: das Wenige, das alle voneinander sehen dürfen
--    (Name steht ohnehin schon an jeder Nachricht)
-- ------------------------------------------------------------
create table if not exists public.public_profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  anzeigename text not null default '',
  initialen   text not null default '',
  farbe       text not null default 'indigo',
  push_chats  boolean not null default true,
  updated_at  timestamptz not null default now()
);
-- Nachrüsten, falls die Tabelle schon existiert
alter table public.public_profiles add column if not exists push_chats boolean not null default true;
alter table public.public_profiles enable row level security;

drop policy if exists "pprofile select" on public.public_profiles;
create policy "pprofile select" on public.public_profiles for select to authenticated
  using ( public.has_consented() );

drop policy if exists "pprofile self" on public.public_profiles;
create policy "pprofile self" on public.public_profiles for all to authenticated
  using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );

drop policy if exists "pprofile staff" on public.public_profiles;
create policy "pprofile staff" on public.public_profiles for all to authenticated
  using ( public.has_perm('roles.manage') ) with check ( public.has_perm('roles.manage') );

do $$ begin
  alter publication supabase_realtime add table public.public_profiles;
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 2) Antrag auf Komitee-Wechsel (läuft wie die Entbannungsanfrage)
-- ------------------------------------------------------------
create table if not exists public.komitee_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  wunsch_tag text not null,
  nachricht  text not null default '',
  status     text not null default 'offen' check (status in ('offen','angenommen','abgelehnt')),
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz
);
create unique index if not exists komreq_one_open on public.komitee_requests(user_id) where status = 'offen';
alter table public.komitee_requests enable row level security;

drop policy if exists "komreq select" on public.komitee_requests;
create policy "komreq select" on public.komitee_requests for select to authenticated
  using ( user_id = auth.uid() or public.has_perm('komitees.assign') );

drop policy if exists "komreq insert" on public.komitee_requests;
create policy "komreq insert" on public.komitee_requests for insert to authenticated
  with check ( user_id = auth.uid() and public.has_consented() );

drop policy if exists "komreq decide" on public.komitee_requests;
create policy "komreq decide" on public.komitee_requests for update to authenticated
  using ( public.has_perm('komitees.assign') ) with check ( public.has_perm('komitees.assign') );

do $$ begin
  alter publication supabase_realtime add table public.komitee_requests;
exception when duplicate_object then null; end $$;


-- ==========================================================================
-- SCHRITT 18 von 24: Rollen Stufensprecher*in und Stv.
-- Quelle: supabase/sprecher.sql
-- ==========================================================================

-- ============================================================
-- Stufenkasse – Rollen "Stufensprecher*in" und "Stv. Schülersprecher*in"
-- Je genau eine Person, nur der Admin vergibt sie, Rechte wie das Stufenteam.
-- Reihenfolge: NACH profile.sql. Idempotent.
-- ============================================================

-- 1) Rollen erlauben
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('schueler','stufenteam','kassenwart','admin','sprecher','stv_sprecher'));

-- 1b) Auch die Rechte-Tabelle kennt die neuen Rollen
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.role_permissions'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%role%';
  if c is not null then execute format('alter table public.role_permissions drop constraint %I', c); end if;
end $$;
alter table public.role_permissions add constraint role_permissions_role_check
  check (role in ('schueler','stufenteam','kassenwart','admin','sprecher','stv_sprecher'));

-- 2) Jede der beiden Rollen darf es nur einmal geben
create unique index if not exists profiles_sprecher_eindeutig
  on public.profiles(role) where role in ('sprecher','stv_sprecher');

-- 3) "Team" zentral definieren – überall dort, wo bisher die Rollen aufgezählt wurden
create or replace function public.ist_team() returns boolean
  language sql stable security definer set search_path = public as $$
  select public.my_role() in ('stufenteam','kassenwart','admin','sprecher','stv_sprecher')
$$;

-- 4) Sichtbarkeiten auf ist_team() umstellen
drop policy if exists "students select" on public.students;
create policy "students select" on public.students for select to authenticated
  using (
    public.has_consented() and (
      public.ist_team()
      or id = (select student_id from public.profiles where user_id = auth.uid())
    )
  );

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated
  using ( user_id = auth.uid() or ( public.has_consented() and public.ist_team() ) );

drop policy if exists "contrib select" on public.contributions;
create policy "contrib select" on public.contributions for select to authenticated
  using (
    public.has_consented() and (
      public.ist_team()
      or public.has_perm('data.edit')
      or student_id = (select student_id from public.profiles where user_id = auth.uid())
    )
  );

create or replace function public.can_see_event(eid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.has_consented() and exists (
    select 1 from public.events e where e.id = eid and (
      public.ist_team()
      or e.audience = 'all'
      or ( e.audience = 'selected' and exists (
            select 1 from public.event_targets t
              join public.profiles p on p.student_id = t.student_id
             where t.event_id = e.id and p.user_id = auth.uid() ) )
      or ( e.audience = 'komitee' and exists (
            select 1 from public.event_committees ec
              join public.tag_members g on g.tag = ec.tag and g.user_id = auth.uid()
             where ec.event_id = e.id ) )
    )
  )
$$;

-- 5) Rechte: beide Sprecher-Rollen bekommen die Standardrechte des Stufenteams
insert into public.role_permissions (role, perm, allowed)
select r.rolle, p.perm, true
  from (values ('sprecher'), ('stv_sprecher')) as r(rolle)
  cross join (values
    ('chats.view_all'), ('chats.delete_messages'), ('chats.manage'),
    ('komitees.assign'), ('data.edit')
  ) as p(perm)
on conflict (role, perm) do nothing;

-- 6) Nur der Admin darf die Sprecher-Rollen vergeben oder entziehen
create or replace function public.guard_role_change() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if old.is_op and auth.uid() <> old.user_id then
      raise exception 'Dieses Konto ist geschützt';
    end if;
    if new.is_op is distinct from old.is_op then
      raise exception 'Der OP-Status kann nicht geändert werden';
    end if;
    if new.role is distinct from old.role then
      if not public.has_perm('roles.manage') then
        raise exception 'Keine Berechtigung, Rollen zu ändern';
      end if;
      if (new.role in ('sprecher','stv_sprecher') or old.role in ('sprecher','stv_sprecher'))
         and public.my_role() <> 'admin' then
        raise exception 'Nur der Admin darf die Sprecher-Rollen vergeben';
      end if;
    end if;
    if (new.chat_banned_until is distinct from old.chat_banned_until
        or new.chat_ban_permanent is distinct from old.chat_ban_permanent)
       and not public.has_perm('mod.timeout') then
      raise exception 'Keine Berechtigung zum Sperren/Entsperren';
    end if;
    if new.student_id is distinct from old.student_id and not public.has_perm('roles.manage') then
      raise exception 'Keine Berechtigung, die Zuordnung zu ändern';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_role on public.profiles;
create trigger guard_role before update on public.profiles
  for each row execute function public.guard_role_change();


-- ==========================================================================
-- SCHRITT 19 von 24: Sprecher-Rechte zusammenlegen
-- Quelle: supabase/sprecher-rechte.sql
-- ==========================================================================

-- Stufensprecher*in und Stv. teilen sich die Rechte
-- Ausführen im Supabase SQL-Editor, NACH sprecher.sql. Mehrfach ausführbar.

-- 1) Einmalig angleichen: Stv. bekommt exakt die Rechte der Sprecher-Rolle
delete from public.role_permissions where role = 'stv_sprecher';
insert into public.role_permissions (role, perm, allowed)
select 'stv_sprecher', perm, allowed from public.role_permissions where role = 'sprecher'
on conflict (role, perm) do update set allowed = excluded.allowed;

-- 2) Dauerhaft gleich halten: jede Änderung an 'sprecher' wird gespiegelt
create or replace function public.sync_sprecher_rechte() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'sprecher' then
      delete from public.role_permissions where role = 'stv_sprecher' and perm = old.perm;
    end if;
    return old;
  end if;
  if new.role = 'sprecher' then
    insert into public.role_permissions (role, perm, allowed)
    values ('stv_sprecher', new.perm, new.allowed)
    on conflict (role, perm) do update set allowed = excluded.allowed;
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_sprecher_rechte on public.role_permissions;
create trigger trg_sync_sprecher_rechte
  after insert or update or delete on public.role_permissions
  for each row execute function public.sync_sprecher_rechte();


-- ==========================================================================
-- SCHRITT 20 von 24: Anonyme Abstimmungen im Events-Reiter
-- Quelle: supabase/events-anonym.sql
-- ==========================================================================

-- Anonyme Abstimmungen im Events-Reiter
-- Ausführen im Supabase SQL-Editor. Gefahrlos mehrfach ausführbar.

-- 1) Spalte: standardmäßig anonym (wie bei den Komitee-Abstimmungen)
alter table public.events
  add column if not exists poll_anon boolean not null default true;

-- 2) Stimmen lesen: Ergebnis-Balken brauchen alle Zeilen, deshalb bleibt die
--    Leseregel wie gehabt. Wer wie gestimmt hat, blendet die App bei anonymen
--    Abstimmungen aus (graue Kreise). Sprecher zählen jetzt zum Stufenteam.
drop policy if exists "votes select" on public.poll_votes;
create policy "votes select" on public.poll_votes for select to authenticated
  using (
    user_id = auth.uid()
    or public.my_role() in ('stufenteam','kassenwart','admin','sprecher','stv_sprecher')
    or exists (select 1 from public.events e where e.id = event_id and e.poll_show_results)
  );


-- ==========================================================================
-- SCHRITT 21 von 24: Prozent-Konzept und Abiball-Staffel
-- Quelle: supabase/prozent-staffel.sql
-- ==========================================================================

-- ============================================================
-- Stufenkasse – Beitragskonzept auf Prozent umgestellt
-- Ausführen im Supabase SQL-Editor. Mehrfach ausführbar.
--
-- Neu: man sammelt Prozent (0–100). Der Zusatzbeitrag zum Abiballticket
-- sinkt alle 25 %:  0 % = 50 €, 25 % = 40 €, 50 % = 25 €, 75 % = 10 €, 100 % = 0 €
-- Es gilt immer die höchste erreichte Stufe – 60 % zählt als 50 %.
-- ============================================================

-- 1) Staffel in den Einstellungen
alter table public.app_settings
  add column if not exists staffel jsonb not null default
    '[{"ab":0,"betrag":50},{"ab":25,"betrag":40},{"ab":50,"betrag":25},{"ab":75,"betrag":10},{"ab":100,"betrag":0}]'::jsonb;

-- 2) Ziel ist jetzt 100 % statt einer Punktzahl; fester Zusatzbetrag entfällt
update public.app_settings
   set ziel_punkte = 100,
       zusatzbetrag = 0,
       staffel = coalesce(
         nullif(staffel, '[]'::jsonb),
         '[{"ab":0,"betrag":50},{"ab":25,"betrag":40},{"ab":50,"betrag":25},{"ab":75,"betrag":10},{"ab":100,"betrag":0}]'::jsonb)
 where id = 1;

-- 3) Vorlagen: neuer Katalog in Prozent
delete from public.contribution_templates;
insert into public.contribution_templates (titel, punkte, sort) values
  -- 5 %
  ('Waffelverkauf in der Pause',                     5,  1),
  ('Waffeln oder Kuchen gebacken',                   5,  2),
  ('Kleinere Aufgabe / Hilfe (Einkauf o. Ä.)',       5,  3),
  -- 10 %
  ('Waffel-/Kuchenverkauf außerhalb der Schulzeit', 10,  4),
  ('Aufgabe mittleren Aufwands (z. B. 1 Tag Stand)',10,  5),
  ('Außerschulische Aktion über 2 Std.',            10,  6),
  -- 20 %
  ('Girolauf (beide Tage)',                         20,  7),
  ('Größere profitable Aktion ermöglicht',          20,  8),
  -- je nach Aufwand und Ertrag: 3–10 %
  ('Eingebrachte Aktion, die umgesetzt wurde',       5,  9);

-- HINWEIS: Bereits eingetragene Beiträge behalten ihre alte Zahl. Aus "1 Punkt"
-- wird damit "1 %". Falls schon nennenswert viel eingetragen war, die Werte in
-- der Tabelle contributions einmal von Hand nachziehen.


-- ==========================================================================
-- SCHRITT 22 von 24: Reiter Beiträge und Ticket-Grundpreis
-- Quelle: supabase/beitraege-reiter.sql
-- ==========================================================================

-- ============================================================
-- Stufenkasse – Reiter "Beiträge", Ticket-Grundpreis, anpassbare Vorlagen
-- Ausführen NACH prozent-staffel.sql. Mehrfach ausführbar.
-- ============================================================

-- 1) Grundpreis eines Abiballtickets (0 = steht noch nicht fest)
alter table public.app_settings
  add column if not exists ticket_preis integer not null default 0;

-- 2) Vorlagen: Wert beim Eintragen anpassbar (für "je nach Aufwand 3–10 %")
alter table public.contribution_templates
  add column if not exists variabel boolean not null default false;

update public.contribution_templates
   set variabel = true
 where titel = 'Eingebrachte Aktion, die umgesetzt wurde';

-- 3) Neues Recht "beitraege.manage": standardmäßig nur der Admin.
--    Der Admin hat ohnehin alles; die anderen Rollen bekommen es ausdrücklich nicht.
insert into public.role_permissions (role, perm, allowed) values
  ('schueler',     'beitraege.manage', false),
  ('sprecher',     'beitraege.manage', false),
  ('stv_sprecher', 'beitraege.manage', false),
  ('stufenteam',   'beitraege.manage', false),
  ('kassenwart',   'beitraege.manage', false),
  ('admin',        'beitraege.manage', true)
on conflict (role, perm) do nothing;


-- ==========================================================================
-- SCHRITT 23 von 24: Einführung erneut zeigen können
-- Quelle: supabase/erklaerungen-reset.sql
-- ==========================================================================

-- ============================================================
-- Stufenkasse – Einführung erneut zeigen können
-- Ausführen im Supabase SQL-Editor. Mehrfach ausführbar.
-- ============================================================

-- Zeitpunkt, ab dem die kurze Einführung wieder erscheinen soll.
-- Das Skript scripts/reset-erklaerungen.mjs setzt ihn auf jetzt.
alter table public.profiles
  add column if not exists tour_reset_at timestamptz;



-- ==========================================================================
-- SCHRITT 24 von 24: Diese Rollen vergibt nur der Admin
-- Quelle: supabase/rollen-nur-admin.sql
-- ==========================================================================

-- ============================================================
-- Stufenkasse – Diese Rollen vergibt nur der Admin
-- Ausführen im Supabase SQL-Editor, NACH permissions.sql. Mehrfach ausführbar.
--
-- Bisher galt die Sperre nur für die beiden Sprecher-Rollen. Jetzt gilt sie
-- auch für admin, kassenwart und eltern: wer roles.manage hat, aber nicht
-- Admin ist, kann diese Rollen weder vergeben noch entziehen.
--
-- Warum am Trigger und nicht nur in der Oberfläche: roles.manage erlaubt ein
-- update auf public.profiles. Ohne diese Prüfung könnte sich jeder, der das
-- Recht bekommt, mit einem einzigen API-Aufruf selbst zum Admin machen – der
-- ausgegraute Eintrag im Auswahlfeld hält davon niemanden ab.
--
-- Heute hat roles.manage ausschliesslich die Rolle admin, und niemand hat es
-- persönlich zugeteilt bekommen. Die Regel ist also ein Sicherheitsnetz für
-- den Tag, an dem jemand das Recht im Rechte-Reiter weitergibt.
--
-- Der Rest der Funktion ist unverändert (OP-Schutz, mod.timeout, student_id).
-- ============================================================

create or replace function public.guard_role_change() returns trigger
  language plpgsql security definer set search_path = public as $$
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
       and not public.has_perm('mod.timeout') then
      raise exception 'Keine Berechtigung zum Sperren/Entsperren';
    end if;
    if new.student_id is distinct from old.student_id and not public.has_perm('roles.manage') then
      raise exception 'Keine Berechtigung, die Zuordnung zu ändern';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_role on public.profiles;
create trigger guard_role before update on public.profiles
  for each row execute function public.guard_role_change();

-- Kontrolle: der Trigger haengt und die Funktion kennt die neue Liste.
select tgname,
       (pg_get_functiondef(p.oid) like '%''kassenwart''%') as kennt_kassenwart
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.profiles'::regclass and t.tgname = 'guard_role';


-- ==========================================================================
-- FERTIG. Nächste Schritte:
--   1. Project Settings, API: Project URL und anon key in die .env eintragen
--      (bzw. in die .env.local, wenn es das Demo-Projekt ist).
--   2. Erstes Konto anlegen und in der Tabelle profiles auf role = 'admin'
--      setzen, sonst kommt niemand an die Verwaltung.
--   3. Wenn gewünscht: node scripts/demo-daten.mjs --wirklich
-- ==========================================================================
