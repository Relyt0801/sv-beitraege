-- =====================================================================
-- Update Abi28 (01.10.2026): Anwesenheits-Abfrage, Vertrauens-Check (KI),
-- Assistent für Nachträge, Kalender-Themen fürs Stufenteam.
--
-- Einmal im Supabase SQL Editor ausführen – ganze Datei, dann Run.
-- Mehrfach ausführbar. Enthält keine Namen, Kennungen oder Schlüssel.
-- Voraussetzung: termine-schichten-chat.sql, protokoll-und-sicherung.sql,
-- mithilfe-nachvollziehen.sql und schicht-ende-ganztags.sql sind eingespielt.
--
-- Rein additiv: neue Tabellen, neue Spalte contributions.termin_id, neue
-- Funktionen. Ältere App-Stände laufen unverändert weiter – wichtig, weil
-- die Vercel-Vorschau dieselbe Datenbank benutzt wie die echte App.
--
-- Die Spielregeln, die hier in der Datenbank festgenagelt sind (und nicht
-- nur in der App):
--   0. TESTPHASE: Der Vertrauens-Check (Score, Einwilligung, Assistent) ist
--      vorerst nur für Admins und die Testkonten freigeschaltet (Recht
--      ki.test, siehe ki_freigeschaltet()). Für alle anderen geht jede
--      „war da“-Angabe ohne Score ans Stufenteam.
--   1. Der Vertrauens-Check läuft nur mit Einwilligung (Tabelle
--      ki_einwilligung). Elternzugänge können gar nicht einwilligen.
--   2. Den Score sieht nur der Admin (Tabelle vertrauen, RLS).
--   3. Automatisch eingetragen wird nur, wer „war da“ sagt, für die Schicht
--      EINGETEILT war, eingewilligt hat und über der Schwelle liegt. Alles
--      andere landet beim Stufenteam. Ein niedriger Score lehnt nie etwas
--      ab – er heißt nur: ein Mensch schaut drauf.
--   4. Die KI (Edge Function „assistent“) kann nur zwei feste Funktionen
--      aufrufen (anwesenheit_melden_fuer, vertrauen_jev_setzen). Freies SQL
--      gibt es für sie nicht.
-- =====================================================================


-- ------------------------------------------------------------ 0) Vorbedingungen
do $$ begin
  if to_regclass('public.termine') is null
     or to_regclass('public.termin_personen') is null
     or to_regclass('public.aktionen') is null
     or to_regclass('public.contributions') is null then
    raise exception 'Es fehlen Tabellen (termine, termin_personen, aktionen, contributions). Erst termine.sql und aktionen.sql einspielen.';
  end if;
  if to_regprocedure('public.audit_schreiben(text,text,uuid,text,text,jsonb)') is null then
    raise exception 'Es fehlt protokoll-und-sicherung.sql – bitte zuerst einspielen.';
  end if;
  if to_regprocedure('public.termin_ende(public.termine)') is null then
    raise exception 'Es fehlt termine-schichten-chat.sql – bitte zuerst einspielen.';
  end if;
end $$;


-- ------------------------------------------------------------ 1) Einwilligung
-- Eine Zeile je Konto, sobald die neue Datenschutzerklärung gesehen wurde.
-- ja = true: Vertrauens-Check erlaubt. ja = false: abgelehnt oder widerrufen.
-- Bewusst NICHT in profiles: profiles liest das ganze Team mit.
create table if not exists public.ki_einwilligung (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  ja       boolean not null,
  version  text not null,
  at       timestamptz not null default now()
);
alter table public.ki_einwilligung enable row level security;

drop policy if exists "ki einwilligung lesen" on public.ki_einwilligung;
create policy "ki einwilligung lesen" on public.ki_einwilligung for select to authenticated
  using ( user_id = (select auth.uid()) or public.my_role() = 'admin' );
-- Schreiben nur über ki_einwilligung_setzen().
grant select on public.ki_einwilligung to authenticated;


-- ------------------------------------------------------------ 2) Einstellungen (nur Admin)
-- Nicht in app_settings: die darf das ganze Team schreiben.
create table if not exists public.ki_einstellungen (
  id            int primary key default 1 check (id = 1),
  -- Ab diesem Vertrauenswert (0..1) wird „war da“ automatisch eingetragen.
  schwelle      numeric not null default 0.8 check (schwelle between 0.5 and 1),
  -- Assistent für Nachträge im Chat (Edge Function „assistent“) an/aus.
  assistent_an  boolean not null default false,
  -- So schreibt das Stufenteam – Vorlage für Rückfragen des Assistenten.
  stil          text not null default
    'Du-Form, kurz und locker, wie unter Mitschülern. Ein bis drei Sätze. '
    || 'Höchstens ein Emoji (gern 🙌 oder 🧇). Keine Floskeln wie „Sehr geehrte“ '
    || 'oder „Mit freundlichen Grüßen“. Wir sind „das Stufenteam“. '
    || 'Beispiel: „Hey, welche Schicht meinst du genau – Dienstag oder Donnerstag? '
    || 'Dann tragen wir das nach 🙌“',
  aktualisiert_at timestamptz not null default now(),
  aktualisiert_von uuid
);
insert into public.ki_einstellungen (id) values (1) on conflict (id) do nothing;
alter table public.ki_einstellungen enable row level security;

drop policy if exists "ki einstellungen lesen" on public.ki_einstellungen;
create policy "ki einstellungen lesen" on public.ki_einstellungen for select to authenticated
  using ( public.my_role() = 'admin' );
grant select on public.ki_einstellungen to authenticated;


-- ------------------------------------------------------------ 2b) Testphase
-- Wer den Vertrauens-Check überhaupt bekommt: Admin, OP und wer das Recht
-- ki.test hat („Vertrauens-Check (Testphase)“ im Rechte-Reiter). Eltern nie.
create or replace function public.ki_freigeschaltet(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.role = 'admin' or coalesce(p.is_op, false)
           or coalesce(
             (select u.allowed from public.user_permissions u where u.user_id = uid and u.perm = 'ki.test'),
             (select r.allowed from public.role_permissions r where r.role = p.role and r.perm = 'ki.test'),
             false)
      from public.profiles p
     where p.user_id = uid and p.role <> 'eltern'), false)
$$;
revoke all on function public.ki_freigeschaltet(uuid) from public, anon;
grant execute on function public.ki_freigeschaltet(uuid) to authenticated, service_role;

-- Die Testkonten bekommen das Recht gleich mit (Admins haben es ohnehin).
insert into public.user_permissions (user_id, perm, allowed)
select user_id, 'ki.test', true from public.profiles where username in ('admin.test', 'test.admin')
on conflict (user_id, perm) do update set allowed = true;


-- ------------------------------------------------------------ 3) Vertrauen (nur Admin)
create table if not exists public.vertrauen (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  -- Angaben, die das Team bestätigt hat bzw. als falsch markiert hat
  bestaetigt      int not null default 0 check (bestaetigt >= 0),
  falsch          int not null default 0 check (falsch >= 0),
  -- Letzte Einschätzung von Jev: 0 = passt nicht zusammen … 1 = stimmig
  jev_wert        numeric check (jev_wert between 0 and 1),
  jev_sicherheit  numeric check (jev_sicherheit between 0 and 1),
  jev_at          timestamptz,
  aktualisiert_at timestamptz not null default now()
);
alter table public.vertrauen enable row level security;

drop policy if exists "vertrauen nur admin" on public.vertrauen;
create policy "vertrauen nur admin" on public.vertrauen for select to authenticated
  using ( public.my_role() = 'admin' );
grant select on public.vertrauen to authenticated;

-- Bilanz: Wer neu ist, steht bei 0,5. Jede bestätigte Angabe hebt den Wert,
-- jede falsche senkt ihn dreimal so stark. Drei Bestätigungen ohne Fehler
-- ergeben 0,8 – die Standard-Schwelle.
create or replace function public.vertrauen_bilanz(b int, f int)
returns numeric language sql immutable as $$
  select round((coalesce(b, 0) + 1)::numeric / (coalesce(b, 0) + 1 + 3 * coalesce(f, 0) + 1), 3)
$$;

-- Gesamtwert für ein Konto. Jev kann den Wert nur SENKEN (wenn es sich
-- ziemlich sicher ist, dass etwas nicht zusammenpasst), nie heben – sonst
-- könnte man sich mit schönen Worten in den Auto-Eintrag schreiben.
-- Ohne Freischaltung (Testphase) oder ohne Einwilligung: null (kein Score).
create or replace function public.vertrauen_wert(uid uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case
    when not public.ki_freigeschaltet(uid) then null
    when not coalesce((select ja from public.ki_einwilligung where user_id = uid), false) then null
    else (
      select case
        when v.jev_wert is not null and v.jev_sicherheit >= 0.7 and v.jev_wert < 0.35
          then least(public.vertrauen_bilanz(v.bestaetigt, v.falsch), v.jev_wert)
        else public.vertrauen_bilanz(coalesce(v.bestaetigt, 0), coalesce(v.falsch, 0))
      end
      from (select 1) x left join public.vertrauen v on v.user_id = uid
    )
  end
$$;
revoke all on function public.vertrauen_wert(uuid) from public, anon, authenticated;

-- Zähler ändern – nur mit Einwilligung, sonst wird gar nichts gespeichert.
create or replace function public.vertrauen_zaehlen(uid uuid, d_bestaetigt int, d_falsch int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if uid is null or not public.ki_freigeschaltet(uid)
     or not coalesce((select ja from public.ki_einwilligung where user_id = uid), false) then
    return;
  end if;
  insert into public.vertrauen (user_id, bestaetigt, falsch)
  values (uid, greatest(0, d_bestaetigt), greatest(0, d_falsch))
  on conflict (user_id) do update
    set bestaetigt = greatest(0, public.vertrauen.bestaetigt + d_bestaetigt),
        falsch = greatest(0, public.vertrauen.falsch + d_falsch),
        aktualisiert_at = now();
end $$;
revoke all on function public.vertrauen_zaehlen(uuid, int, int) from public, anon, authenticated;


-- ------------------------------------------------------------ 4) Mithilfe ↔ Schicht
-- Damit dieselbe Schicht nie doppelt zählt (Abfrage, Chat, „Punkte vergeben“).
-- Bewusst OHNE Fremdschlüssel: Speicherstände spielen contributions komplett
-- zurück, Termine aber nicht. Ein inzwischen gelöschter Termin ließe das
-- Zurückspielen sonst scheitern.
alter table public.contributions add column if not exists termin_id uuid;
create unique index if not exists contributions_termin_person
  on public.contributions (termin_id, student_id) where termin_id is not null;


-- ------------------------------------------------------------ 5) Anwesenheit
create table if not exists public.anwesenheit (
  id               uuid primary key default gen_random_uuid(),
  termin_id        uuid not null references public.termine(id) on delete cascade,
  student_id       uuid not null references public.students(id) on delete cascade,
  -- Wer die Angabe gemacht hat (das Konto der Person selbst)
  user_id          uuid references auth.users(id) on delete set null,
  angabe           text not null check (angabe in ('da', 'nicht_da')),
  -- offen = Team muss schauen · auto = automatisch eingetragen ·
  -- bestaetigt = Team sagt: stimmt · falsch = Team sagt: stimmt nicht ·
  -- erledigt = nichts zu tun (nicht da, schon eingetragen, Schicht ohne Punkte)
  status           text not null default 'offen'
                   check (status in ('offen', 'auto', 'bestaetigt', 'falsch', 'erledigt')),
  quelle           text not null default 'abfrage' check (quelle in ('abfrage', 'chat')),
  eingeteilt       boolean not null default false,
  contribution_id  uuid references public.contributions(id) on delete set null,
  geprueft_von     uuid references auth.users(id) on delete set null,
  geprueft_at      timestamptz,
  created_at       timestamptz not null default now(),
  unique (termin_id, student_id)
);
create index if not exists anwesenheit_offen on public.anwesenheit (status) where status = 'offen';
alter table public.anwesenheit enable row level security;

-- Lesen: die eigene Angabe; das Team und wer Mithilfe eintragen darf alles.
-- Eltern sehen nichts (sie haben keine eigene student_id).
drop policy if exists "anwesenheit lesen" on public.anwesenheit;
create policy "anwesenheit lesen" on public.anwesenheit for select to authenticated
  using (
    student_id = (select student_id from public.profiles where user_id = (select auth.uid()))
    or public.ist_team()
    or public.has_perm('hilfen.edit')
  );
-- Schreiben nur über die Funktionen unten.
grant select on public.anwesenheit to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.anwesenheit;
exception when duplicate_object then null; end $$;


-- ------------------------------------------------------------ 6) Assistent-Vorschläge
-- Was der Assistent zu einer Chat-Nachricht gemacht oder vorgeschlagen hat.
-- Kein Score, keine Jev-Zahlen – das sieht nur der Admin in „vertrauen“.
create table if not exists public.assistent_vorschlaege (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid unique,
  topic_id       uuid,
  user_id        uuid references auth.users(id) on delete cascade,
  student_id     uuid references public.students(id) on delete cascade,
  -- mithilfe_nachtrag | zahlung | termin | sonstiges
  absicht        text not null default 'sonstiges',
  termin_id      uuid references public.termine(id) on delete set null,
  -- auto | rueckfrage | team | fehler | aus (Assistent aus / keine Einwilligung)
  ergebnis       text not null default 'team',
  antwort        text,          -- was der Assistent im Chat geantwortet hat
  vorschlag      text,          -- Vorschlag fürs Team (Claude)
  sql_vorschlag  text,          -- nur Text für den Admin – wird NIE ausgeführt
  status         text not null default 'offen' check (status in ('offen', 'erledigt', 'verworfen')),
  erledigt_von   uuid references auth.users(id) on delete set null,
  erledigt_at    timestamptz,
  created_at     timestamptz not null default now()
);
alter table public.assistent_vorschlaege enable row level security;

drop policy if exists "vorschlaege team" on public.assistent_vorschlaege;
create policy "vorschlaege team" on public.assistent_vorschlaege for select to authenticated
  using ( public.ist_team() or public.has_perm('hilfen.edit') );
grant select on public.assistent_vorschlaege to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.assistent_vorschlaege;
exception when duplicate_object then null; end $$;


-- ------------------------------------------------------------ 7) Kalender-Themen
-- Welche Termine im Kalender-Abo landen. Leer/fehlend = alles wie bisher.
create table if not exists public.kalender_themen (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  themen   text[] not null default '{}',
  at       timestamptz not null default now()
);
alter table public.kalender_themen enable row level security;

drop policy if exists "kalender themen selbst" on public.kalender_themen;
create policy "kalender themen selbst" on public.kalender_themen for all to authenticated
  using ( user_id = (select auth.uid()) )
  with check (
    user_id = (select auth.uid())
    and themen <@ array['stufe','klausuren','schichten','meine_schichten','ferien','komitee']::text[]
  );
grant select, insert, update, delete on public.kalender_themen to authenticated;

-- Kalender-Verbindung (Testphase) fürs ganze Stufenteam. Admin hat es ohnehin.
insert into public.role_permissions (role, perm, allowed) values
  ('stufenteam', 'kalender.test', true),
  ('kassenwart', 'kalender.test', true),
  ('sprecher', 'kalender.test', true),
  ('stv_sprecher', 'kalender.test', true)
on conflict (role, perm) do update set allowed = true;


-- ------------------------------------------------------------ 8) Protokoll kennt die neuen Wege
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
      case quelle
        when 'schicht' then 'Schicht abgeschlossen – '
        when 'abfrage' then 'Selbst gemeldet „war da“, automatisch – '
        when 'chat' then 'Nachtrag per Chat, automatisch – '
        when 'pruefung' then 'Angabe vom Team bestätigt – '
        else '' end
        || 'Mithilfe „' || r.titel || '“ +' || public.mithilfe_prozent(r.punkte) || ' % für '
        || case when r.anzahl = 1 then '' else r.anzahl || ' Personen: ' end || r.namen,
      jsonb_build_object('student_ids', r.ids, 'titel', r.titel, 'punkte', r.punkte,
                         'datum', r.datum, 'anzahl', r.anzahl, 'quelle', quelle));
  end loop;
  return null;
end $$;
revoke all on function public.audit_contrib_ins() from public, anon, authenticated;


-- ------------------------------------------------------------ 9) Anwesenheit eintragen (Kern)
-- Gemeinsamer Kern für die App (anwesenheit_melden) und den Assistenten
-- (anwesenheit_melden_fuer). Gibt zurück, was passiert ist:
--   auto · offen · nicht_da · schon_eingetragen · ohne_punkte · entschieden
create or replace function public.anwesenheit_eintragen(
  tid uuid, sid uuid, uid uuid, da boolean, p_quelle text
) returns text language plpgsql security definer set search_path = public as $$
declare
  t public.termine;
  a public.aktionen;
  w public.anwesenheit;
  ist_eingeteilt boolean;
  ziel int;
  cid uuid;
  wert numeric;
  schwelle numeric;
  name text;
begin
  -- Sperrt die Schicht: läuft gleichzeitig „Punkte vergeben“, wartet einer.
  select * into t from public.termine where id = tid for update;
  if not found then raise exception 'Termin nicht gefunden' using errcode = 'P0002'; end if;
  if t.aktion_id is null then raise exception 'Das ist keine Schicht' using errcode = 'P0001'; end if;
  if public.termin_ende(t) > now() then
    raise exception 'Die Schicht ist noch nicht vorbei' using errcode = 'P0001';
  end if;
  if public.termin_ende(t) < now() - interval '30 days' then
    raise exception 'Das ist länger als 30 Tage her – bitte direkt beim Stufenteam melden' using errcode = 'P0001';
  end if;
  select * into a from public.aktionen where id = t.aktion_id;
  ist_eingeteilt := exists (select 1 from public.termin_personen where termin_id = tid and student_id = sid);

  select * into w from public.anwesenheit where termin_id = tid and student_id = sid for update;
  -- Schon vom Team entschieden oder automatisch eingetragen: nichts mehr ändern.
  if found and w.status in ('auto', 'bestaetigt', 'falsch') then
    return 'entschieden';
  end if;

  -- Schon eingetragen: über diese Abfrage/Chat oder per „Punkte vergeben“
  -- (ältere Einträge ohne termin_id: Schicht vergeben + eingeteilt).
  if exists (select 1 from public.contributions where termin_id = tid and student_id = sid)
     or (t.abschluss = 'vergeben' and ist_eingeteilt) then
    insert into public.anwesenheit (termin_id, student_id, user_id, angabe, status, quelle, eingeteilt)
    values (tid, sid, uid, case when da then 'da' else 'nicht_da' end, 'erledigt', p_quelle, ist_eingeteilt)
    on conflict (termin_id, student_id) do update
      set angabe = excluded.angabe, status = 'erledigt', user_id = excluded.user_id;
    return 'schon_eingetragen';
  end if;

  if not da then
    insert into public.anwesenheit (termin_id, student_id, user_id, angabe, status, quelle, eingeteilt)
    values (tid, sid, uid, 'nicht_da', 'erledigt', p_quelle, ist_eingeteilt)
    on conflict (termin_id, student_id) do update
      set angabe = 'nicht_da', status = 'erledigt', user_id = excluded.user_id, created_at = now();
    return 'nicht_da';
  end if;

  -- Schicht bringt keine Punkte oder wurde bewusst „ohne“ abgeschlossen.
  if coalesce(a.prozent, 0) <= 0 or t.abschluss = 'ohne' then
    insert into public.anwesenheit (termin_id, student_id, user_id, angabe, status, quelle, eingeteilt)
    values (tid, sid, uid, 'da', 'erledigt', p_quelle, ist_eingeteilt)
    on conflict (termin_id, student_id) do update
      set angabe = 'da', status = 'erledigt', user_id = excluded.user_id;
    return 'ohne_punkte';
  end if;

  wert := public.vertrauen_wert(uid);   -- null ohne Einwilligung
  select coalesce((select k.schwelle from public.ki_einstellungen k where k.id = 1), 0.8) into schwelle;

  if ist_eingeteilt and wert is not null and wert >= schwelle then
    select coalesce(ziel_punkte, 100) into ziel from public.app_settings where id = 1;
    perform set_config('sv.mithilfe_quelle', p_quelle, true);
    insert into public.contributions (student_id, titel, punkte, datum, created_by, termin_id)
    values (sid, a.titel, greatest(1, round(a.prozent * coalesce(ziel, 100) / 100.0))::int, t.datum, uid, tid)
    returning id into cid;
    perform set_config('sv.mithilfe_quelle', '', true);
    insert into public.anwesenheit (termin_id, student_id, user_id, angabe, status, quelle, eingeteilt, contribution_id)
    values (tid, sid, uid, 'da', 'auto', p_quelle, true, cid)
    on conflict (termin_id, student_id) do update
      set angabe = 'da', status = 'auto', user_id = excluded.user_id, contribution_id = cid, eingeteilt = true;
    return 'auto';
  end if;

  insert into public.anwesenheit (termin_id, student_id, user_id, angabe, status, quelle, eingeteilt)
  values (tid, sid, uid, 'da', 'offen', p_quelle, ist_eingeteilt)
  on conflict (termin_id, student_id) do update
    set angabe = 'da', status = 'offen', user_id = excluded.user_id, eingeteilt = excluded.eingeteilt,
        created_at = case when public.anwesenheit.status = 'offen' then public.anwesenheit.created_at else now() end;
  select nachname || ', ' || vorname into name from public.students where id = sid;
  perform public.audit_schreiben(
    'anwesenheit.gemeldet', 'mithilfe', null, coalesce(name, '?'),
    coalesce(name, '?') || ' sagt: war bei „' || a.titel || '“ am ' || to_char(t.datum, 'DD.MM.') || ' – das Stufenteam prüft',
    jsonb_build_object('termin_id', tid, 'student_id', sid, 'quelle', p_quelle, 'eingeteilt', ist_eingeteilt));
  return 'offen';
end $$;
revoke all on function public.anwesenheit_eintragen(uuid, uuid, uuid, boolean, text) from public, anon, authenticated;


-- ------------------------------------------------------------ 10) Abfrage aus der App
-- „Warst du da?“ – Ja / Nein. Nur Schülerinnen und Schüler mit eigener Zeile.
create or replace function public.anwesenheit_melden(tid uuid, da boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
begin
  select * into me from public.profiles where user_id = auth.uid();
  if me.user_id is null or me.role = 'eltern' or me.student_id is null then
    raise exception 'Das können nur Schülerinnen und Schüler mit eigenem Eintrag melden' using errcode = '42501';
  end if;
  return public.anwesenheit_eintragen(tid, me.student_id, me.user_id, da, 'abfrage');
end $$;
revoke all on function public.anwesenheit_melden(uuid, boolean) from public, anon;
grant execute on function public.anwesenheit_melden(uuid, boolean) to authenticated;


-- ------------------------------------------------------------ 11) Team prüft
-- stimmt = true: eintragen (falls noch nicht), zählt als bestätigt.
-- stimmt = false: Eintrag weg, zählt als falsch – senkt den Score.
create or replace function public.anwesenheit_pruefen(aid uuid, stimmt boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  w public.anwesenheit;
  t public.termine;
  a public.aktionen;
  ziel int;
  cid uuid;
  name text;
begin
  if auth.uid() is null or not (public.ist_team() or public.has_perm('hilfen.edit')) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select * into w from public.anwesenheit where id = aid;
  if not found then raise exception 'Angabe nicht gefunden' using errcode = 'P0002'; end if;
  -- Erst die Schicht sperren (wie überall), dann die Angabe.
  select * into t from public.termine where id = w.termin_id for update;
  select * into w from public.anwesenheit where id = aid for update;
  if w.angabe <> 'da' then
    raise exception 'Nur „war da“-Angaben lassen sich prüfen' using errcode = 'P0001';
  end if;
  select * into a from public.aktionen where id = t.aktion_id;
  select nachname || ', ' || vorname into name from public.students where id = w.student_id;

  if stimmt then
    if w.status = 'bestaetigt' then return 'bestaetigt'; end if;
    select id into cid from public.contributions where termin_id = w.termin_id and student_id = w.student_id;
    if cid is null and coalesce(a.prozent, 0) > 0 and t.abschluss is distinct from 'ohne' then
      select coalesce(ziel_punkte, 100) into ziel from public.app_settings where id = 1;
      perform set_config('sv.mithilfe_quelle', 'pruefung', true);
      insert into public.contributions (student_id, titel, punkte, datum, created_by, termin_id)
      values (w.student_id, a.titel, greatest(1, round(a.prozent * coalesce(ziel, 100) / 100.0))::int, t.datum, auth.uid(), w.termin_id)
      returning id into cid;
      perform set_config('sv.mithilfe_quelle', '', true);
    end if;
    perform public.vertrauen_zaehlen(w.user_id, 1, case when w.status = 'falsch' then -1 else 0 end);
    update public.anwesenheit
       set status = 'bestaetigt', contribution_id = cid, geprueft_von = auth.uid(), geprueft_at = now()
     where id = aid;
    perform public.audit_schreiben(
      'anwesenheit.bestaetigt', 'mithilfe', null, coalesce(name, '?'),
      coalesce(name, '?') || ': „war da“ bei „' || coalesce(a.titel, '?') || '“ am ' || to_char(t.datum, 'DD.MM.') || ' bestätigt',
      jsonb_build_object('anwesenheit_id', aid, 'vorher', w.status));
    return 'bestaetigt';
  end if;

  if w.status = 'falsch' then return 'falsch'; end if;
  delete from public.contributions where termin_id = w.termin_id and student_id = w.student_id;
  perform public.vertrauen_zaehlen(w.user_id, case when w.status = 'bestaetigt' then -1 else 0 end, 1);
  update public.anwesenheit
     set status = 'falsch', contribution_id = null, geprueft_von = auth.uid(), geprueft_at = now()
   where id = aid;
  perform public.audit_schreiben(
    'anwesenheit.falsch', 'mithilfe', null, coalesce(name, '?'),
    coalesce(name, '?') || ': „war da“ bei „' || coalesce(a.titel, '?') || '“ am ' || to_char(t.datum, 'DD.MM.') || ' stimmt nicht',
    jsonb_build_object('anwesenheit_id', aid, 'vorher', w.status));
  return 'falsch';
end $$;
revoke all on function public.anwesenheit_pruefen(uuid, boolean) from public, anon;
grant execute on function public.anwesenheit_pruefen(uuid, boolean) to authenticated;


-- ------------------------------------------------------------ 12) Schicht abschließen
-- Wie in mithilfe-nachvollziehen.sql, zusätzlich:
--   - wer schon eingetragen ist (Abfrage/Chat) bekommt nichts doppelt,
--   - wer selbst „nicht da“ gesagt hat oder als „stimmt nicht“ markiert ist, bekommt nichts,
--   - Einträge merken sich die Schicht (termin_id),
--   - offene „war da“-Angaben der Eingeteilten und unbeanstandete
--     Auto-Einträge gelten damit als bestätigt.
create or replace function public.schicht_abschliessen(tid uuid, vergeben boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare
  t public.termine;
  a public.aktionen;
  ziel int;
  n int := 0;
  r record;
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
    insert into public.contributions (student_id, titel, punkte, datum, created_by, termin_id)
    select tp.student_id, a.titel, greatest(1, round(a.prozent * coalesce(ziel, 100) / 100.0))::int, t.datum, auth.uid(), tid
      from public.termin_personen tp
     where tp.termin_id = tid
       and not exists (select 1 from public.contributions c where c.termin_id = tid and c.student_id = tp.student_id)
       and not exists (select 1 from public.anwesenheit w
                        where w.termin_id = tid and w.student_id = tp.student_id
                          and (w.angabe = 'nicht_da' or w.status = 'falsch'));
    get diagnostics n = row_count;
    perform set_config('sv.mithilfe_quelle', '', true);

    -- Eingeteilte mit „war da“ (offen oder automatisch): das Team hat die
    -- Schicht gesehen und Punkte vergeben – das zählt als Bestätigung.
    for r in
      select w.id, w.user_id from public.anwesenheit w
       where w.termin_id = tid and w.angabe = 'da' and w.eingeteilt and w.status in ('offen', 'auto')
    loop
      perform public.vertrauen_zaehlen(r.user_id, 1, 0);
    end loop;
    update public.anwesenheit w
       set status = 'bestaetigt',
           contribution_id = (select c.id from public.contributions c where c.termin_id = tid and c.student_id = w.student_id),
           geprueft_von = auth.uid(), geprueft_at = now()
     where w.termin_id = tid and w.angabe = 'da' and w.eingeteilt and w.status in ('offen', 'auto');
  end if;

  update public.termine
     set abschluss = case when vergeben then 'vergeben' else 'ohne' end,
         abschluss_at = now(), abschluss_von = auth.uid()
   where id = tid;
  return n;
end $$;
revoke all on function public.schicht_abschliessen(uuid, boolean) from public, anon;
grant execute on function public.schicht_abschliessen(uuid, boolean) to authenticated;


-- ------------------------------------------------------------ 13) Einwilligung setzen
create or replace function public.ki_einwilligung_setzen(p_ja boolean, p_version text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  vorher boolean;
begin
  select * into me from public.profiles where user_id = auth.uid();
  if me.user_id is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if me.role = 'eltern' then
    raise exception 'Für Elternzugänge gibt es den Vertrauens-Check nicht' using errcode = '42501';
  end if;
  if p_ja and not public.ki_freigeschaltet(me.user_id) then
    raise exception 'Der Vertrauens-Check ist noch in der Testphase' using errcode = '42501';
  end if;
  if coalesce(p_version, '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Ungültige Version' using errcode = '22023';
  end if;
  select k.ja into vorher from public.ki_einwilligung k where k.user_id = me.user_id;
  insert into public.ki_einwilligung (user_id, ja, version, at)
  values (me.user_id, p_ja, p_version, now())
  on conflict (user_id) do update set ja = excluded.ja, version = excluded.version, at = now();
  -- Widerruf: der Score wird sofort gelöscht (Art. 17 Abs. 1 lit. b DSGVO).
  if not p_ja then
    delete from public.vertrauen where user_id = me.user_id;
  end if;
  if vorher is distinct from p_ja then
    perform public.audit_schreiben(
      case when p_ja then 'ki.zugestimmt' else 'ki.abgelehnt' end, 'konten', me.user_id,
      coalesce(me.username, ''),
      coalesce(nullif(public.audit_name(me.user_id), ''), me.username, '?')
        || case when p_ja then ': Vertrauens-Check zugestimmt'
                when vorher then ': Vertrauens-Check widerrufen – Score gelöscht'
                else ': Vertrauens-Check abgelehnt' end
        || ' (Datenschutz ' || p_version || ')',
      jsonb_build_object('version', p_version));
  end if;
end $$;
revoke all on function public.ki_einwilligung_setzen(boolean, text) from public, anon;
grant execute on function public.ki_einwilligung_setzen(boolean, text) to authenticated;


-- ------------------------------------------------------------ 14) Für den Admin
create or replace function public.vertrauen_liste()
returns table (
  user_id uuid, name text, username text, rolle text, student_id uuid,
  freigeschaltet boolean, einwilligung boolean, einwilligung_at timestamptz,
  bestaetigt int, falsch int, bilanz numeric,
  jev_wert numeric, jev_sicherheit numeric, jev_at timestamptz,
  wert numeric, offene_angaben int
) language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_role() <> 'admin' then
    raise exception 'Nur für den Admin' using errcode = '42501';
  end if;
  return query
  select p.user_id,
         coalesce(nullif(s.vorname || ' ' || s.nachname, ' '), nullif(public.audit_name(p.user_id), ''), p.username, '?'),
         p.username, p.role, p.student_id,
         public.ki_freigeschaltet(p.user_id), k.ja, k.at,
         coalesce(v.bestaetigt, 0), coalesce(v.falsch, 0),
         case when k.ja and public.ki_freigeschaltet(p.user_id)
              then public.vertrauen_bilanz(coalesce(v.bestaetigt, 0), coalesce(v.falsch, 0)) end,
         v.jev_wert, v.jev_sicherheit, v.jev_at,
         public.vertrauen_wert(p.user_id),
         (select count(*)::int from public.anwesenheit w where w.user_id = p.user_id and w.status = 'offen')
    from public.profiles p
    left join public.students s on s.id = p.student_id
    left join public.ki_einwilligung k on k.user_id = p.user_id
    left join public.vertrauen v on v.user_id = p.user_id
   where p.role <> 'eltern';
end $$;
revoke all on function public.vertrauen_liste() from public, anon;
grant execute on function public.vertrauen_liste() to authenticated;

create or replace function public.ki_einstellungen_setzen(p_schwelle numeric, p_an boolean, p_stil text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() <> 'admin' then
    raise exception 'Nur für den Admin' using errcode = '42501';
  end if;
  update public.ki_einstellungen
     set schwelle = greatest(0.5, least(1, coalesce(p_schwelle, schwelle))),
         assistent_an = coalesce(p_an, assistent_an),
         stil = left(coalesce(nullif(trim(p_stil), ''), stil), 2000),
         aktualisiert_at = now(), aktualisiert_von = auth.uid()
   where id = 1;
  perform public.audit_schreiben(
    'ki.einstellungen', 'rechte', null, '',
    'KI-Einstellungen geändert: Schwelle ' || coalesce(p_schwelle::text, '–')
      || ', Assistent ' || case when p_an then 'an' else 'aus' end,
    jsonb_build_object('schwelle', p_schwelle, 'assistent_an', p_an));
end $$;
revoke all on function public.ki_einstellungen_setzen(numeric, boolean, text) from public, anon;
grant execute on function public.ki_einstellungen_setzen(numeric, boolean, text) to authenticated;

-- Vorschlag erledigen/verwerfen (Team)
create or replace function public.vorschlag_erledigen(vid uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not (public.ist_team() or public.has_perm('hilfen.edit')) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if p_status not in ('erledigt', 'verworfen', 'offen') then
    raise exception 'Ungültiger Status' using errcode = '22023';
  end if;
  update public.assistent_vorschlaege
     set status = p_status,
         erledigt_von = case when p_status = 'offen' then null else auth.uid() end,
         erledigt_at = case when p_status = 'offen' then null else now() end
   where id = vid;
end $$;
revoke all on function public.vorschlag_erledigen(uuid, text) from public, anon;
grant execute on function public.vorschlag_erledigen(uuid, text) to authenticated;


-- ------------------------------------------------------------ 15) Nur für den Server (Edge Function „assistent“)
-- Kein Zugriff aus der App: nur mit dem service_role-Schlüssel aufrufbar.
create or replace function public.anwesenheit_melden_fuer(tid uuid, uid uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
begin
  select * into me from public.profiles where user_id = uid;
  if me.user_id is null or me.role = 'eltern' or me.student_id is null then
    raise exception 'Kein Schülerkonto' using errcode = '42501';
  end if;
  return public.anwesenheit_eintragen(tid, me.student_id, me.user_id, true, 'chat');
end $$;
revoke all on function public.anwesenheit_melden_fuer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.anwesenheit_melden_fuer(uuid, uuid) to service_role;

create or replace function public.vertrauen_jev_setzen(uid uuid, p_wert numeric, p_sicherheit numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.ki_freigeschaltet(uid)
     or not coalesce((select ja from public.ki_einwilligung where user_id = uid), false) then
    return;   -- ohne Freischaltung oder Einwilligung wird nichts gespeichert
  end if;
  insert into public.vertrauen (user_id, jev_wert, jev_sicherheit, jev_at)
  values (uid, greatest(0, least(1, p_wert)), greatest(0, least(1, p_sicherheit)), now())
  on conflict (user_id) do update
    set jev_wert = excluded.jev_wert, jev_sicherheit = excluded.jev_sicherheit,
        jev_at = now(), aktualisiert_at = now();
end $$;
revoke all on function public.vertrauen_jev_setzen(uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function public.vertrauen_jev_setzen(uuid, numeric, numeric) to service_role;

-- Welche beendeten Schichten der letzten 30 Tage könnte eine Person meinen?
-- Nur solche, die für sie noch nicht eingetragen oder entschieden sind. Der
-- Assistent lässt Jev aus genau dieser Liste wählen („auswählen statt
-- erfinden“) – eine Schicht außerhalb davon kann er gar nicht eintragen.
create or replace function public.assistent_kandidaten(uid uuid)
returns table (termin_id uuid, titel text, icon text, datum date, von time, bis time, eingeteilt boolean)
language sql stable security definer set search_path = public as $$
  with ich as (select student_id from public.profiles where user_id = uid and role <> 'eltern')
  select t.id, a.titel, coalesce(t.icon, a.icon), t.datum, t.von, t.bis,
         exists (select 1 from public.termin_personen tp, ich where tp.termin_id = t.id and tp.student_id = ich.student_id)
    from public.termine t
    join public.aktionen a on a.id = t.aktion_id
    cross join ich
   where coalesce(a.prozent, 0) > 0
     and t.abschluss is distinct from 'ohne'
     and public.termin_ende(t) < now()
     and public.termin_ende(t) > now() - interval '30 days'
     and not exists (select 1 from public.contributions c where c.termin_id = t.id and c.student_id = ich.student_id)
     and not (t.abschluss = 'vergeben'
              and exists (select 1 from public.termin_personen tp where tp.termin_id = t.id and tp.student_id = ich.student_id))
     and not exists (select 1 from public.anwesenheit w
                      where w.termin_id = t.id and w.student_id = ich.student_id
                        and w.status in ('auto', 'bestaetigt', 'falsch'))
   order by t.datum desc, t.von desc nulls last
   limit 40
$$;
revoke all on function public.assistent_kandidaten(uuid) from public, anon, authenticated;
grant execute on function public.assistent_kandidaten(uuid) to service_role;

-- Für den Terminal-Befehl /nachtraege (scripts/nachtraege.mjs, läuft mit dem
-- service_role-Schlüssel auf euren Rechnern): prüfen und erledigen IM NAMEN
-- eines Teammitglieds. Die Funktionen setzen die Kennung nur für diese eine
-- Anweisung – dadurch gelten dieselben Rechte wie in der App (nur Team bzw.
-- „Mithilfe eintragen“), und im Protokoll steht, wer es war.
create or replace function public.anwesenheit_pruefen_als(aid uuid, stimmt boolean, von uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  perform set_config('request.jwt.claim.sub', von::text, true);
  return public.anwesenheit_pruefen(aid, stimmt);
end $$;
revoke all on function public.anwesenheit_pruefen_als(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.anwesenheit_pruefen_als(uuid, boolean, uuid) to service_role;

create or replace function public.vorschlag_erledigen_als(vid uuid, p_status text, von uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('request.jwt.claim.sub', von::text, true);
  perform public.vorschlag_erledigen(vid, p_status);
end $$;
revoke all on function public.vorschlag_erledigen_als(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.vorschlag_erledigen_als(uuid, text, uuid) to service_role;

-- Für die Abfrage per Push: Eingeteilte der eben beendeten Schichten (ohne Eltern).
create or replace function public.schicht_abfrage_empfaenger(tids uuid[])
returns table (termin_id uuid, user_id uuid) language sql stable security definer set search_path = public as $$
  select tp.termin_id, p.user_id
    from public.termin_personen tp
    join public.profiles p on p.student_id = tp.student_id and p.role <> 'eltern'
   where tp.termin_id = any (tids)
     and not exists (select 1 from public.anwesenheit w where w.termin_id = tp.termin_id and w.student_id = tp.student_id)
$$;
revoke all on function public.schicht_abfrage_empfaenger(uuid[]) from public, anon, authenticated;
grant execute on function public.schicht_abfrage_empfaenger(uuid[]) to service_role;


-- ------------------------------------------------------------ 16) Selbstprüfung
select * from (values
  (1, 'Tabelle anwesenheit',
      case when to_regclass('public.anwesenheit') is not null then '✅ da' else '❌ fehlt' end),
  (2, 'Tabelle vertrauen – nur Admin liest',
      case when exists (select 1 from pg_policies where tablename = 'vertrauen' and policyname = 'vertrauen nur admin'
                          and qual like '%admin%')
           and not exists (select 1 from pg_policies where tablename = 'vertrauen' and cmd <> 'SELECT')
           then '✅ ja' else '❌ Regel prüfen' end),
  (3, 'Einwilligung getrennt von profiles',
      case when to_regclass('public.ki_einwilligung') is not null then '✅ da' else '❌ fehlt' end),
  (4, 'contributions.termin_id + eindeutig je Schicht',
      case when exists (select 1 from pg_indexes where indexname = 'contributions_termin_person') then '✅ ja' else '❌ fehlt' end),
  (5, 'App darf melden und prüfen',
      case when has_function_privilege('authenticated', 'public.anwesenheit_melden(uuid,boolean)', 'execute')
            and has_function_privilege('authenticated', 'public.anwesenheit_pruefen(uuid,boolean)', 'execute')
           then '✅ ja' else '❌ fehlt' end),
  (6, 'Server-Funktionen für die App gesperrt',
      case when not has_function_privilege('authenticated', 'public.anwesenheit_melden_fuer(uuid,uuid)', 'execute')
            and not has_function_privilege('authenticated', 'public.vertrauen_jev_setzen(uuid,numeric,numeric)', 'execute')
            and not has_function_privilege('anon', 'public.anwesenheit_melden(uuid,boolean)', 'execute')
           then '✅ ja' else '❌ zu offen' end),
  (7, 'Kalender-Test fürs Stufenteam',
      (select '✅ ' || count(*) || ' Rollen' from public.role_permissions
        where perm = 'kalender.test' and allowed and role in ('stufenteam','kassenwart','sprecher','stv_sprecher'))),
  (8, 'Vertrauens-Check (Testphase) freigeschaltet für',
      (select 'ℹ️ ' || count(*) || ' Konten (Admins + Testkonten)' from public.profiles p where public.ki_freigeschaltet(p.user_id))),
  (9, 'Assistent',
      (select case when assistent_an then '✅ an' else 'ℹ️ aus – im Profil unter „Vertrauen & KI“ einschalten' end
         from public.ki_einstellungen where id = 1))
) as x(nr, pruefung, ergebnis)
order by nr;
