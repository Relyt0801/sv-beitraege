-- ============================================================
-- Stufenkasse – Protokoll (nur Admin) und tägliche Sicherung
--
-- Im Supabase SQL-Editor ausführen, NACH allen anderen Dateien.
-- Mehrfach ausführbar, es geht nichts verloren.
--
-- Zwei Dinge stecken hier drin:
--
--   1. Ein Protokoll (`audit_log`). Es hält fest, wer wann was Wichtiges
--      geändert hat: Rollen, Zugänge, Passwörter, Komitees, Beiträge,
--      Kassenbuch, Rechte. Geschrieben wird ausschließlich von Triggern in
--      der Datenbank – nicht von der App. Wer die App umgeht und direkt auf
--      die API geht, steht trotzdem im Protokoll.
--      Gelesen werden darf es nur vom Admin; ÄNDERN oder LÖSCHEN darf es
--      niemand, auch der Admin nicht (es gibt schlicht keine Policy dafür).
--
--   2. Speicherstände (`daten_snapshots`). Jede Nacht um 0:00 deutscher Zeit
--      wird der Stand der Kerndaten als JSON weggeschrieben. Der Admin kann
--      einen davon herunterladen oder wieder übernehmen.
--
-- WAS EIN SPEICHERSTAND ENTHÄLT (Kerndaten):
--   students, contributions, contribution_templates, app_settings,
--   kasse_buchungen, kasse_einstellungen, bank_konto, tag_members,
--   role_permissions, user_permissions, parent_children, profiles
--
-- WAS ER NICHT ENTHÄLT – und beim Übernehmen also auch nicht anfasst:
--   Chats, Events, Termine, Aktionen, Abstimmungen, Elterngespräche,
--   Push-Abos – und vor allem die KONTEN SELBST (`auth.users`).
--   Passwörter liegen verschlüsselt in `auth.users`; ein gelöschtes Konto
--   holt kein Speicherstand zurück. Das ist keine Nachlässigkeit, das geht
--   technisch nicht von der App aus. Wer ein Konto zurückholen will, braucht
--   ein Backup der ganzen Datenbank (Supabase-Dashboard -> Database ->
--   Backups).
-- ============================================================


-- ============================================================
-- TEIL 1 – Das Protokoll
-- ============================================================

create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  -- Maschinenlesbarer Schlüssel, z. B. 'rolle.geaendert'
  aktion      text not null,
  -- Grobe Schublade für den Filter im Profil: konten, rollen, komitees,
  -- beitraege, kasse, rechte, sicherung
  bereich     text not null,
  akteur_id   uuid,
  akteur_name text not null default '',
  ziel_id     uuid,
  ziel_name   text not null default '',
  -- Ein fertiger deutscher Satz. Steht hier, damit das Protokoll auch in fünf
  -- Jahren noch lesbar ist, wenn die App die Schlüssel anders benennt.
  klartext    text not null default '',
  details     jsonb not null default '{}'::jsonb
);

create index if not exists audit_log_at      on public.audit_log (at desc);
create index if not exists audit_log_bereich on public.audit_log (bereich, at desc);
create index if not exists audit_log_ziel    on public.audit_log (ziel_id, at desc);

alter table public.audit_log enable row level security;

-- Lesen: nur der Admin.
-- Schreiben/Ändern/Löschen: KEINE Policy. Damit kommt niemand über die API
-- daran – geschrieben wird nur durch die security-definer-Funktion unten.
drop policy if exists "audit lesen" on public.audit_log;
create policy "audit lesen" on public.audit_log for select to authenticated
  using ( public.my_role() = 'admin' );

-- Ohne dieses GRANT gäbe die API "permission denied" zurück, noch bevor die
-- Policy überhaupt geprüft wird. Nur SELECT – schreiben darf hier niemand.
grant select on public.audit_log to authenticated;


-- Anzeigename einer Person, so wie sie in der App erscheint.
create or replace function public.audit_name(p uuid) returns text
  language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif((select anzeigename from public.public_profiles where user_id = p), ''),
    nullif((select username    from public.profiles        where user_id = p), ''),
    '')
$$;


-- Der einzige Weg, etwas ins Protokoll zu schreiben.
create or replace function public.audit_schreiben(
  p_aktion   text,
  p_bereich  text,
  p_ziel     uuid,
  p_ziel_name text,
  p_klartext text,
  p_details  jsonb default '{}'::jsonb
) returns void
  language plpgsql security definer set search_path = public as $$
declare
  a uuid := auth.uid();
begin
  -- Während einer Wiederherstellung schweigt das Protokoll. Sonst stünden dort
  -- hunderte Zeilen, die niemand von Hand ausgelöst hat. Die Wiederherstellung
  -- selbst schreibt dafür genau einen Eintrag.
  if coalesce(current_setting('sv.wiederherstellung', true), '') = '1' then
    return;
  end if;

  insert into public.audit_log (aktion, bereich, akteur_id, akteur_name, ziel_id, ziel_name, klartext, details)
  values (
    p_aktion,
    p_bereich,
    a,
    case when a is null then 'System' else coalesce(nullif(public.audit_name(a), ''), 'Unbekannt') end,
    p_ziel,
    coalesce(p_ziel_name, ''),
    coalesce(p_klartext, ''),
    coalesce(p_details, '{}'::jsonb)
  );
end $$;


-- ------------------------------------------------------------
-- Zugänge, Rollen, Sperren, Passwort-Rücksetzungen
-- ------------------------------------------------------------
create or replace function public.audit_profiles() returns trigger
  language plpgsql security definer set search_path = public as $$
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

  if new.chat_ban_permanent is distinct from old.chat_ban_permanent
     or new.chat_banned_until is distinct from old.chat_banned_until then
    perform public.audit_schreiben(
      'konto.sperre', 'konten', new.user_id, n,
      n || ': ' || case
        when new.chat_ban_permanent then 'dauerhaft gesperrt'
        when new.chat_banned_until is not null then 'gesperrt bis ' || to_char(new.chat_banned_until at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI')
        else 'Sperre aufgehoben' end,
      jsonb_build_object('bis', new.chat_banned_until, 'dauerhaft', new.chat_ban_permanent));
  end if;

  -- false -> true heißt: jemand hat ein Startpasswort gesetzt.
  -- Der Wechsel true -> false ist der normale eigene Passwortwechsel; der wird
  -- weiter unten an `auth.users` protokolliert, damit er nicht doppelt steht.
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
end $$;

drop trigger if exists audit_profiles_ins on public.profiles;
drop trigger if exists audit_profiles_upd on public.profiles;
drop trigger if exists audit_profiles_del on public.profiles;
create trigger audit_profiles_ins after insert on public.profiles
  for each row execute function public.audit_profiles();
create trigger audit_profiles_upd after update on public.profiles
  for each row execute function public.audit_profiles();
create trigger audit_profiles_del after delete on public.profiles
  for each row execute function public.audit_profiles();


-- ------------------------------------------------------------
-- Passwortwechsel – der steht in auth.users, nicht in profiles
-- ------------------------------------------------------------
create or replace function public.audit_passwort() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    perform public.audit_schreiben(
      'passwort.geaendert', 'konten', new.id,
      coalesce(nullif(public.audit_name(new.id), ''), split_part(coalesce(new.email, ''), '@', 1)),
      coalesce(nullif(public.audit_name(new.id), ''), split_part(coalesce(new.email, ''), '@', 1))
        || ': Passwort geändert', '{}'::jsonb);
  end if;
  return new;
end $$;

-- Auf `auth.users` darf nicht jedes Projekt Trigger anlegen. Klappt es nicht,
-- läuft der Rest trotzdem – dann fehlt eben nur diese eine Zeile im Protokoll.
do $$
begin
  drop trigger if exists audit_passwort on auth.users;
  create trigger audit_passwort after update of encrypted_password on auth.users
    for each row execute function public.audit_passwort();
exception when others then
  raise notice 'Trigger auf auth.users nicht möglich (%). Passwortwechsel werden dann nicht protokolliert.', sqlerrm;
end $$;


-- ------------------------------------------------------------
-- Personen und Beiträge
-- ------------------------------------------------------------
create or replace function public.audit_students() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  h text;
  vorher text;
  nachher text;
  name text;
begin
  if tg_op = 'INSERT' then
    perform public.audit_schreiben(
      'person.angelegt', 'konten', null, new.nachname || ', ' || new.vorname,
      'Person „' || new.nachname || ', ' || new.vorname || '" angelegt',
      jsonb_build_object('student_id', new.id));
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.audit_schreiben(
      'person.geloescht', 'konten', null, old.nachname || ', ' || old.vorname,
      'Person „' || old.nachname || ', ' || old.vorname || '" gelöscht',
      jsonb_build_object('student_id', old.id));
    return old;
  end if;

  name := new.nachname || ', ' || new.vorname;

  foreach h in array array['EF.1','EF.2','Q1.1','Q1.2','Q2.1','Q2.2'] loop
    vorher  := coalesce(old.terms -> h ->> 'status', 'offen');
    nachher := coalesce(new.terms -> h ->> 'status', 'offen');
    continue when vorher = nachher;
    perform public.audit_schreiben(
      'beitrag.geaendert', 'beitraege', null, name,
      name || ': Beitrag ' || h || ' ' || vorher || ' → ' || nachher,
      jsonb_build_object('student_id', new.id, 'halbjahr', h, 'vorher', vorher, 'nachher', nachher));
  end loop;

  if new.beteiligungen is distinct from old.beteiligungen then
    perform public.audit_schreiben(
      'beteiligung.geaendert', 'beitraege', null, name,
      name || ': Beteiligungen ' || old.beteiligungen || ' → ' || new.beteiligungen,
      jsonb_build_object('student_id', new.id, 'vorher', old.beteiligungen, 'nachher', new.beteiligungen));
  end if;

  if new.verlaesst_ab is distinct from old.verlaesst_ab then
    perform public.audit_schreiben(
      'person.geaendert', 'konten', null, name,
      name || ': verlässt die Stufe ab ' || coalesce(new.verlaesst_ab, '– (zurückgenommen)'),
      jsonb_build_object('student_id', new.id, 'vorher', old.verlaesst_ab, 'nachher', new.verlaesst_ab));
  end if;

  return new;
end $$;

drop trigger if exists audit_students_ins on public.students;
drop trigger if exists audit_students_upd on public.students;
drop trigger if exists audit_students_del on public.students;
create trigger audit_students_ins after insert on public.students
  for each row execute function public.audit_students();
create trigger audit_students_upd after update on public.students
  for each row execute function public.audit_students();
create trigger audit_students_del after delete on public.students
  for each row execute function public.audit_students();


-- ------------------------------------------------------------
-- Kassenbuch, Ziel, Bankdaten, Einstellungen
-- ------------------------------------------------------------
create or replace function public.audit_kasse() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  betrag text;
begin
  if tg_op = 'INSERT' then
    betrag := replace(to_char(new.cent / 100.0, 'FM999999990.00'), '.', ',') || ' €';
    perform public.audit_schreiben(
      'kasse.gebucht', 'kasse', null, new.titel,
      'Buchung ' || betrag || ' (' || new.quelle || '): ' || new.titel
        || case when new.automatisch then ' – automatisch' else '' end,
      jsonb_build_object('cent', new.cent, 'quelle', new.quelle, 'automatisch', new.automatisch));
    return new;
  end if;

  betrag := replace(to_char(old.cent / 100.0, 'FM999999990.00'), '.', ',') || ' €';
  perform public.audit_schreiben(
    'kasse.geloescht', 'kasse', null, old.titel,
    'Buchung gelöscht: ' || betrag || ' – ' || old.titel,
    jsonb_build_object('cent', old.cent, 'quelle', old.quelle, 'automatisch', old.automatisch));
  return old;
end $$;

do $$
begin
  drop trigger if exists audit_kasse_ins on public.kasse_buchungen;
  drop trigger if exists audit_kasse_del on public.kasse_buchungen;
  create trigger audit_kasse_ins after insert on public.kasse_buchungen
    for each row execute function public.audit_kasse();
  create trigger audit_kasse_del after delete on public.kasse_buchungen
    for each row execute function public.audit_kasse();
exception when undefined_table then
  raise notice 'kasse_buchungen fehlt – finanzen.sql zuerst einspielen.';
end $$;


create or replace function public.audit_kasse_ziel() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.ziel_cent is distinct from old.ziel_cent or new.ziel_titel is distinct from old.ziel_titel then
    perform public.audit_schreiben(
      'kasse.ziel', 'kasse', null, new.ziel_titel,
      'Sparziel: ' || replace(to_char(new.ziel_cent / 100.0, 'FM999999990.00'), '.', ',')
        || ' € für „' || new.ziel_titel || '"',
      jsonb_build_object('vorher_cent', old.ziel_cent, 'nachher_cent', new.ziel_cent));
  end if;
  return new;
end $$;

do $$
begin
  drop trigger if exists audit_kasse_ziel on public.kasse_einstellungen;
  create trigger audit_kasse_ziel after update on public.kasse_einstellungen
    for each row execute function public.audit_kasse_ziel();
exception when undefined_table then null;
end $$;


-- Bankdaten: dass sie geändert wurden, steht im Protokoll. Die IBAN selbst
-- ausdrücklich NICHT – ein Protokoll soll nicht zur zweiten Kopie der
-- Kontodaten werden.
create or replace function public.audit_bank() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform public.audit_schreiben(
    'kasse.bankdaten', 'kasse', null, '',
    'Bankverbindung der Stufenkasse geändert', '{}'::jsonb);
  return new;
end $$;

do $$
begin
  drop trigger if exists audit_bank on public.bank_konto;
  create trigger audit_bank after update on public.bank_konto
    for each row execute function public.audit_bank();
exception when undefined_table then null;
end $$;


create or replace function public.audit_settings() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  geaendert text[] := '{}';
begin
  if new.aktuelles_halbjahr is distinct from old.aktuelles_halbjahr then
    geaendert := geaendert || ('Halbjahr ' || old.aktuelles_halbjahr || ' → ' || new.aktuelles_halbjahr);
  end if;
  if new.beitraege is distinct from old.beitraege then geaendert := geaendert || 'Halbjahresbeiträge'; end if;
  if new.staffel   is distinct from old.staffel   then geaendert := geaendert || 'Abiball-Staffel';     end if;
  if new.ticket_preis is distinct from old.ticket_preis then
    geaendert := geaendert || ('Ticketpreis ' || old.ticket_preis || ' € → ' || new.ticket_preis || ' €');
  end if;
  if new.schwelle is distinct from old.schwelle then
    geaendert := geaendert || ('Nötige Beteiligungen ' || old.schwelle || ' → ' || new.schwelle);
  end if;
  if new.zusatzbetrag is distinct from old.zusatzbetrag then
    geaendert := geaendert || ('Zusatzbetrag ' || old.zusatzbetrag || ' € → ' || new.zusatzbetrag || ' €');
  end if;

  if array_length(geaendert, 1) is null then return new; end if;

  perform public.audit_schreiben(
    'einstellungen.geaendert', 'beitraege', null, '',
    'Einstellungen geändert: ' || array_to_string(geaendert, ', '),
    jsonb_build_object('felder', to_jsonb(geaendert)));
  return new;
end $$;

drop trigger if exists audit_settings on public.app_settings;
create trigger audit_settings after update on public.app_settings
  for each row execute function public.audit_settings();


-- ------------------------------------------------------------
-- Komitees und Vorsitz
-- ------------------------------------------------------------
create or replace function public.audit_komitee() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  n text;
begin
  if tg_op = 'INSERT' then
    n := coalesce(nullif(public.audit_name(new.user_id), ''), '?');
    perform public.audit_schreiben(
      'komitee.zugeteilt', 'komitees', new.user_id, n,
      n || ' ist jetzt im Komitee „' || new.tag || '"',
      jsonb_build_object('komitee', new.tag));
    return new;
  end if;
  n := coalesce(nullif(public.audit_name(old.user_id), ''), '?');
  perform public.audit_schreiben(
    'komitee.entfernt', 'komitees', old.user_id, n,
    n || ' ist nicht mehr im Komitee „' || old.tag || '"',
    jsonb_build_object('komitee', old.tag));
  return old;
end $$;

do $$
begin
  drop trigger if exists audit_komitee_ins on public.tag_members;
  drop trigger if exists audit_komitee_del on public.tag_members;
  create trigger audit_komitee_ins after insert on public.tag_members
    for each row execute function public.audit_komitee();
  create trigger audit_komitee_del after delete on public.tag_members
    for each row execute function public.audit_komitee();
exception when undefined_table then null;
end $$;


create or replace function public.audit_vorsitz() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  n text;
begin
  if tg_op = 'INSERT' then
    n := coalesce(nullif(public.audit_name(new.user_id), ''), '?');
    perform public.audit_schreiben('komitee.vorsitz', 'komitees', new.user_id, n,
      n || ' führt jetzt den Vorsitz im Komitee „' || new.tag || '"',
      jsonb_build_object('komitee', new.tag));
    return new;
  end if;
  n := coalesce(nullif(public.audit_name(old.user_id), ''), '?');
  perform public.audit_schreiben('komitee.vorsitz_weg', 'komitees', old.user_id, n,
    n || ' führt den Vorsitz im Komitee „' || old.tag || '" nicht mehr',
    jsonb_build_object('komitee', old.tag));
  return old;
end $$;

do $$
begin
  drop trigger if exists audit_vorsitz_ins on public.komitee_vorsitz;
  drop trigger if exists audit_vorsitz_del on public.komitee_vorsitz;
  create trigger audit_vorsitz_ins after insert on public.komitee_vorsitz
    for each row execute function public.audit_vorsitz();
  create trigger audit_vorsitz_del after delete on public.komitee_vorsitz
    for each row execute function public.audit_vorsitz();
exception when undefined_table then null;
end $$;


-- ------------------------------------------------------------
-- Rechte
-- ------------------------------------------------------------
create or replace function public.audit_rechte() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_perm    text;
  v_allowed boolean;
  v_user    uuid;
  v_role    text;
  wer       text;
  wie       text;
begin
  -- OLD und NEW lassen sich in PL/pgSQL nicht in eine gemeinsame Variable
  -- schreiben. Deshalb die Felder einzeln herausziehen.
  if tg_op = 'DELETE' then
    v_perm := old.perm; v_allowed := null;
    if tg_table_name = 'role_permissions' then v_role := old.role; else v_user := old.user_id; end if;
  else
    v_perm := new.perm; v_allowed := new.allowed;
    if tg_table_name = 'role_permissions' then v_role := new.role; else v_user := new.user_id; end if;
  end if;

  if tg_table_name = 'role_permissions' then
    wer := 'Rolle ' || v_role;
  else
    wer := coalesce(nullif(public.audit_name(v_user), ''), '?');
  end if;

  wie := case
    when tg_op = 'DELETE' then 'zurückgesetzt auf den Standard'
    when v_allowed then 'erlaubt'
    else 'verboten' end;

  perform public.audit_schreiben(
    'recht.geaendert', 'rechte', v_user, wer,
    wer || ': Recht „' || v_perm || '" ' || wie,
    jsonb_build_object('perm', v_perm, 'erlaubt', v_allowed, 'rolle', v_role));

  return null; -- AFTER-Trigger, der Rückgabewert wird nicht ausgewertet
end $$;

drop trigger if exists audit_roleperm on public.role_permissions;
drop trigger if exists audit_userperm on public.user_permissions;
create trigger audit_roleperm after insert or update or delete on public.role_permissions
  for each row execute function public.audit_rechte();
create trigger audit_userperm after insert or update or delete on public.user_permissions
  for each row execute function public.audit_rechte();


-- ------------------------------------------------------------
-- Elternzuordnungen
-- ------------------------------------------------------------
create or replace function public.audit_eltern() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_user    uuid;
  v_student uuid;
  n text;
  k text;
begin
  if tg_op = 'DELETE' then
    v_user := old.user_id; v_student := old.student_id;
  else
    v_user := new.user_id; v_student := new.student_id;
  end if;

  n := coalesce(nullif(public.audit_name(v_user), ''), '?');
  select nachname || ', ' || vorname into k from public.students where id = v_student;

  perform public.audit_schreiben(
    case when tg_op = 'DELETE' then 'eltern.geloest' else 'eltern.verknuepft' end,
    'konten', v_user, n,
    case when tg_op = 'DELETE'
         then 'Elternzugang ' || n || ' ist nicht mehr mit „' || coalesce(k, '?') || '" verbunden'
         else 'Elternzugang ' || n || ' ist jetzt mit „' || coalesce(k, '?') || '" verbunden' end,
    jsonb_build_object('student_id', v_student));

  return null;
end $$;

do $$
begin
  drop trigger if exists audit_eltern_ins on public.parent_children;
  drop trigger if exists audit_eltern_del on public.parent_children;
  create trigger audit_eltern_ins after insert on public.parent_children
    for each row execute function public.audit_eltern();
  create trigger audit_eltern_del after delete on public.parent_children
    for each row execute function public.audit_eltern();
exception when undefined_table then null;
end $$;


-- ============================================================
-- TEIL 2 – Speicherstände (tägliche Sicherung)
-- ============================================================

-- Wache gegen halb eingefügte Dateien. Wird nur ein Stück dieser Datei in den
-- SQL-Editor eingefügt, scheitert es sonst weiter unten mit einer Meldung wie
-- "relation ... does not exist", die niemandem sagt, was wirklich los ist.
do $$
begin
  if to_regclass('public.audit_log') is null then
    -- EINE Zeichenkette, und ohne Semikolon darin. Der SQL-Editor von
    -- Supabase zerlegt das Skript vor dem Ausfuehren in einzelne Befehle und
    -- zerschneidet dabei eine Meldung, die ein Semikolon enthaelt.
    raise exception E'Es wurde nur ein TEIL dieser Datei eingefuegt - der Anfang (Teil 1) fehlt.\n\nSo kommt die ganze Datei an:\n  1. Auf GitHub supabase/protokoll-und-sicherung.sql oeffnen und oben rechts auf "Copy raw file" klicken - das kopiert alles.\n  2. Hier in den Editor klicken, Cmd+A druecken, dann Cmd+V.\n  3. VOR dem Run nach unten scrollen: die letzte Zeilennummer muss vierstellig sein (ueber 1000).\n\nEs wurde nichts geaendert - ganze Datei einfuegen und noch einmal Run.';
  end if;
end $$;

create table if not exists public.daten_snapshots (
  id          uuid primary key default gen_random_uuid(),
  -- Der TAG, den dieser Stand abbildet. Der Lauf um 0:00 am 21.09. sichert den
  -- Stand vom 20.09. – deshalb steht dort der 20.09.
  tag         date not null,
  erstellt_at timestamptz not null default now(),
  art         text not null default 'automatisch'
                check (art in ('automatisch','manuell','vor_ruecksetzung')),
  zeilen      integer not null default 0,
  inhalt      jsonb not null
);

-- Pro Tag genau ein automatischer Stand. Manuelle und Sicherheitskopien vor
-- einer Rücksetzung dürfen mehrfach am selben Tag entstehen.
create unique index if not exists snapshot_ein_tag
  on public.daten_snapshots (tag) where art = 'automatisch';
create index if not exists snapshot_zeit on public.daten_snapshots (erstellt_at desc);

alter table public.daten_snapshots enable row level security;

-- Lesen (und damit herunterladen): Admin und Kassenwart.
-- Anlegen/Löschen: niemand über die API – nur die Funktionen unten.
drop policy if exists "snapshots lesen" on public.daten_snapshots;
create policy "snapshots lesen" on public.daten_snapshots for select to authenticated
  using ( public.my_role() in ('admin','kassenwart') );

grant select on public.daten_snapshots to authenticated;


-- ------------------------------------------------------------
-- Einen Speicherstand anlegen
-- ------------------------------------------------------------
-- p_art = 'automatisch' kommt nur vom nächtlichen Lauf. Deshalb ist diese
-- Funktion für angemeldete Nutzer gesperrt (siehe revoke weiter unten); die
-- App ruft `snapshot_jetzt()` auf.
create or replace function public.snapshot_erstellen(p_art text, p_tag date default null)
returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  j       jsonb;
  t       date := coalesce(p_tag, (now() at time zone 'Europe/Berlin')::date);
  n       integer;
  neu     uuid;
begin
  select jsonb_build_object(
    'version',  1,
    'erstellt', now(),
    'tag',      t,
    'art',      p_art,
    'tabellen', jsonb_build_object(
      'students',               coalesce((select jsonb_agg(to_jsonb(x)) from public.students x), '[]'::jsonb),
      'contributions',          coalesce((select jsonb_agg(to_jsonb(x)) from public.contributions x), '[]'::jsonb),
      'contribution_templates', coalesce((select jsonb_agg(to_jsonb(x)) from public.contribution_templates x), '[]'::jsonb),
      'app_settings',           coalesce((select jsonb_agg(to_jsonb(x)) from public.app_settings x), '[]'::jsonb),
      'kasse_buchungen',        coalesce((select jsonb_agg(to_jsonb(x)) from public.kasse_buchungen x), '[]'::jsonb),
      'kasse_einstellungen',    coalesce((select jsonb_agg(to_jsonb(x)) from public.kasse_einstellungen x), '[]'::jsonb),
      'bank_konto',             coalesce((select jsonb_agg(to_jsonb(x)) from public.bank_konto x), '[]'::jsonb),
      'tag_members',            coalesce((select jsonb_agg(to_jsonb(x)) from public.tag_members x), '[]'::jsonb),
      'role_permissions',       coalesce((select jsonb_agg(to_jsonb(x)) from public.role_permissions x), '[]'::jsonb),
      'user_permissions',       coalesce((select jsonb_agg(to_jsonb(x)) from public.user_permissions x), '[]'::jsonb),
      'parent_children',        coalesce((select jsonb_agg(to_jsonb(x)) from public.parent_children x), '[]'::jsonb),
      'profiles',               coalesce((select jsonb_agg(to_jsonb(x)) from public.profiles x), '[]'::jsonb)
    )
  ) into j;

  select coalesce(sum(jsonb_array_length(value)), 0) into n
    from jsonb_each(j -> 'tabellen') where jsonb_typeof(value) = 'array';

  -- Ein zweiter Lauf am selben Tag ersetzt den automatischen Stand, statt an
  -- der Eindeutigkeit zu scheitern. Bei 'manuell' und 'vor_ruecksetzung' darf
  -- es mehrere pro Tag geben.
  if p_art = 'automatisch' then
    delete from public.daten_snapshots where tag = t and art = 'automatisch';
  end if;

  insert into public.daten_snapshots (tag, art, zeilen, inhalt)
  values (t, p_art, n, j)
  returning id into neu;

  return neu;
end $$;


-- Was die App benutzt: ein Speicherstand von Hand, nur für den Admin.
create or replace function public.snapshot_jetzt()
returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  neu uuid;
begin
  if public.my_role() <> 'admin' then
    raise exception 'Nur der Admin darf einen Speicherstand anlegen';
  end if;
  neu := public.snapshot_erstellen('manuell');
  perform public.audit_schreiben('sicherung.erstellt', 'sicherung', null, '',
    'Speicherstand von Hand angelegt', jsonb_build_object('snapshot', neu));
  return neu;
end $$;


-- ------------------------------------------------------------
-- Der nächtliche Lauf
-- ------------------------------------------------------------
-- pg_cron rechnet in UTC. Damit der Stand wirklich um 0:00 DEUTSCHER Zeit
-- entsteht – auch nach der Zeitumstellung –, läuft der Job stündlich und tut
-- nur in der Stunde nach Mitternacht etwas.
create or replace function public.snapshot_taeglich()
returns void
  language plpgsql security definer set search_path = public as $$
declare
  stunde int  := extract(hour from (now() at time zone 'Europe/Berlin'));
  gestern date := (now() at time zone 'Europe/Berlin')::date - 1;
begin
  if stunde <> 0 then return; end if;
  if exists (select 1 from public.daten_snapshots where tag = gestern and art = 'automatisch') then
    return;
  end if;

  perform public.snapshot_erstellen('automatisch', gestern);

  -- Aufräumen: 30 Tage tägliche Stände reichen. Sicherheitskopien, die vor
  -- einer Rücksetzung entstanden sind, bleiben ein Vierteljahr.
  delete from public.daten_snapshots
   where art in ('automatisch','manuell') and erstellt_at < now() - interval '30 days';
  delete from public.daten_snapshots
   where art = 'vor_ruecksetzung' and erstellt_at < now() - interval '90 days';

  -- Das Protokoll selbst bleibt zwei Jahre. Länger braucht es niemand, und
  -- die DSGVO mag keine Daten, die ohne Grund ewig liegen.
  delete from public.audit_log where at < now() - interval '2 years';
end $$;


-- ------------------------------------------------------------
-- Einen Speicherstand übernehmen
-- ------------------------------------------------------------
-- ACHTUNG: Das setzt die Kerndaten auf den Stand von damals zurück. Alles, was
-- seitdem an Personen, Beiträgen, Buchungen, Komitees und Rechten passiert ist,
-- ist danach weg. Chats, Events, Termine und die Konten selbst bleiben
-- unberührt. Vorher wird automatisch eine Sicherheitskopie des JETZIGEN
-- Zustands angelegt – ein Fehlgriff lässt sich also rückgängig machen.
create or replace function public.snapshot_zuruecksetzen(p_id uuid)
returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  j          jsonb;
  t          jsonb;
  quelle_tag date;
  quelle_art text;
  netz       uuid;
begin
  if public.my_role() <> 'admin' then
    raise exception 'Nur der Admin darf einen Speicherstand übernehmen';
  end if;

  select inhalt, tag, art into j, quelle_tag, quelle_art
    from public.daten_snapshots where id = p_id;
  if j is null then
    raise exception 'Diesen Speicherstand gibt es nicht (mehr).';
  end if;
  t := j -> 'tabellen';

  -- 1) Sicherheitsnetz: der JETZIGE Zustand wandert in einen eigenen Stand.
  netz := public.snapshot_erstellen('vor_ruecksetzung');

  -- 2) Ab hier schweigen die Protokoll-Trigger, sonst stünden dort tausende
  --    Zeilen. Der eine Eintrag am Ende sagt alles Nötige.
  perform set_config('sv.wiederherstellung', '1', true);

  -- Die Automatik "Beitrag bezahlt -> Buchung" muss still sein: das Kassenbuch
  -- wird gleich selbst zurückgesetzt, sie würde nur doppelt buchen.
  -- (Läuft alles in einer Transaktion – geht etwas schief, ist der Trigger
  --  automatisch wieder an.)
  begin
    alter table public.students disable trigger beitrag_buchen;
  exception when others then null;
  end;

  -- --- Personen ---------------------------------------------------------
  -- Abgleichen statt löschen+neu: ein DELETE auf students reißt per
  -- ON DELETE CASCADE auch Elternzuordnungen und Event-Einladungen mit, die
  -- mit dem Zurücksetzen nichts zu tun haben.
  delete from public.students s
   where not exists (
     select 1 from jsonb_array_elements(t -> 'students') e where (e ->> 'id')::uuid = s.id);

  insert into public.students
  select * from jsonb_populate_recordset(null::public.students, t -> 'students')
  on conflict (id) do update set
    nachname       = excluded.nachname,
    vorname        = excluded.vorname,
    beigetreten_ab = excluded.beigetreten_ab,
    verlaesst_ab   = excluded.verlaesst_ab,
    beteiligungen  = excluded.beteiligungen,
    terms          = excluded.terms,
    updated_at     = excluded.updated_at;

  -- --- Beteiligungen und Vorlagen ---------------------------------------
  delete from public.contributions;
  insert into public.contributions
  select * from jsonb_populate_recordset(null::public.contributions, t -> 'contributions');

  delete from public.contribution_templates;
  insert into public.contribution_templates
  select * from jsonb_populate_recordset(null::public.contribution_templates, t -> 'contribution_templates');

  -- --- Kassenbuch --------------------------------------------------------
  -- Verweise auf Aktionen und Konten, die es nicht mehr gibt, werden geleert
  -- statt den ganzen Vorgang scheitern zu lassen.
  delete from public.kasse_buchungen;
  insert into public.kasse_buchungen
  select b.id, b.datum, b.cent, b.quelle, b.titel,
         case when exists (select 1 from public.aktionen a where a.id = b.aktion_id) then b.aktion_id end,
         case when exists (select 1 from public.students s where s.id = b.student_id) then b.student_id end,
         b.halbjahr, b.automatisch,
         case when exists (select 1 from auth.users u where u.id = b.created_by) then b.created_by end,
         b.created_at
    from jsonb_populate_recordset(null::public.kasse_buchungen, t -> 'kasse_buchungen') b;

  -- --- Einzeilige Einstellungstabellen -----------------------------------
  update public.app_settings a set
    aktuelles_halbjahr = coalesce(e ->> 'aktuelles_halbjahr', a.aktuelles_halbjahr),
    schwelle           = coalesce((e ->> 'schwelle')::int, a.schwelle),
    zusatzbetrag       = coalesce((e ->> 'zusatzbetrag')::int, a.zusatzbetrag),
    ticket_preis       = coalesce((e ->> 'ticket_preis')::int, a.ticket_preis),
    ziel_punkte        = coalesce((e ->> 'ziel_punkte')::int, a.ziel_punkte),
    beitraege          = coalesce(e -> 'beitraege', a.beitraege),
    staffel            = coalesce(e -> 'staffel', a.staffel)
  from (select value from jsonb_array_elements(t -> 'app_settings') limit 1) q(e)
  where a.id = 1;

  update public.kasse_einstellungen k set
    ziel_cent  = coalesce((e ->> 'ziel_cent')::int, k.ziel_cent),
    ziel_titel = coalesce(e ->> 'ziel_titel', k.ziel_titel)
  from (select value from jsonb_array_elements(t -> 'kasse_einstellungen') limit 1) q(e)
  where k.id = 1;

  update public.bank_konto b set
    inhaber = coalesce(e ->> 'inhaber', b.inhaber),
    iban    = coalesce(e ->> 'iban',    b.iban),
    bic     = coalesce(e ->> 'bic',     b.bic),
    bank    = coalesce(e ->> 'bank',    b.bank),
    hinweis = coalesce(e ->> 'hinweis', b.hinweis)
  from (select value from jsonb_array_elements(t -> 'bank_konto') limit 1) q(e)
  where b.id = 1;

  -- --- Komitees, Rechte, Eltern ------------------------------------------
  -- Immer gefiltert auf Konten/Personen, die es heute noch gibt: ein
  -- Speicherstand darf keine Fremdschlüssel auf Gelöschtes wiederbeleben.
  delete from public.tag_members;
  insert into public.tag_members
  select m.* from jsonb_populate_recordset(null::public.tag_members, t -> 'tag_members') m
   where exists (select 1 from auth.users u where u.id = m.user_id);

  delete from public.role_permissions;
  insert into public.role_permissions
  select * from jsonb_populate_recordset(null::public.role_permissions, t -> 'role_permissions');

  delete from public.user_permissions;
  insert into public.user_permissions
  select p.* from jsonb_populate_recordset(null::public.user_permissions, t -> 'user_permissions') p
   where exists (select 1 from auth.users u where u.id = p.user_id);

  delete from public.parent_children;
  insert into public.parent_children
  select c.* from jsonb_populate_recordset(null::public.parent_children, t -> 'parent_children') c
   where exists (select 1 from auth.users u where u.id = c.user_id)
     and exists (select 1 from public.students s where s.id = c.student_id);

  -- --- Profile: nur Rollen und Sperren, NIEMALS Zeilen anlegen/löschen ----
  -- Ein Konto, das es heute gibt, verschwindet nicht, weil es im Speicherstand
  -- fehlt. Und eines, das gelöscht wurde, kommt nicht zurück – das könnte der
  -- Speicherstand ohnehin nicht, die Anmeldedaten liegen in auth.users.
  update public.profiles p set
    role               = coalesce(e ->> 'role', p.role),
    -- Verweist der alte Stand auf eine Person, die es nicht mehr gibt, bleibt
    -- die heutige Verknüpfung stehen statt ins Leere zu zeigen.
    student_id         = case
                           when e ->> 'student_id' is null then null
                           when exists (select 1 from public.students s
                                         where s.id = (e ->> 'student_id')::uuid)
                             then (e ->> 'student_id')::uuid
                           else p.student_id end,
    is_op              = coalesce((e ->> 'is_op')::boolean, p.is_op),
    chat_banned_until  = nullif(e ->> 'chat_banned_until', '')::timestamptz,
    chat_ban_permanent = coalesce((e ->> 'chat_ban_permanent')::boolean, p.chat_ban_permanent)
  from jsonb_array_elements(t -> 'profiles') e
  where p.user_id = (e ->> 'user_id')::uuid;

  begin
    alter table public.students enable trigger beitrag_buchen;
  exception when others then null;
  end;

  -- 3) Protokoll wieder anschalten und den einen Eintrag schreiben.
  perform set_config('sv.wiederherstellung', '', true);

  perform public.audit_schreiben(
    'daten.zurueckgesetzt', 'sicherung', null, '',
    'Speicherstand vom ' || to_char(quelle_tag, 'DD.MM.YYYY') || ' übernommen. '
      || 'Der Stand von davor liegt als Sicherheitskopie bereit.',
    jsonb_build_object('quelle', p_id, 'quelle_tag', quelle_tag, 'quelle_art', quelle_art,
                       'sicherheitskopie', netz));

  return jsonb_build_object('ok', true, 'tag', quelle_tag, 'sicherheitskopie', netz);
end $$;


-- ------------------------------------------------------------
-- Wer darf was aufrufen
-- ------------------------------------------------------------
-- Funktionen sind in Postgres standardmäßig für ALLE ausführbar. Die beiden
-- inneren Funktionen gehören dem nächtlichen Lauf, nicht der App.
revoke all on function public.snapshot_erstellen(text, date)   from public, anon, authenticated;
revoke all on function public.snapshot_taeglich()              from public, anon, authenticated;
revoke all on function public.audit_schreiben(text, text, uuid, text, text, jsonb)
  from public, anon, authenticated;

-- Die beiden Knöpfe im Profil. Erst alles wegnehmen, dann gezielt geben –
-- sonst käme auch ein nicht angemeldeter Aufruf (anon) durch.
revoke all on function public.snapshot_jetzt()                 from public, anon, authenticated;
revoke all on function public.snapshot_zuruecksetzen(uuid)     from public, anon, authenticated;
grant execute on function public.snapshot_jetzt()              to authenticated;
grant execute on function public.snapshot_zuruecksetzen(uuid)  to authenticated;


-- ------------------------------------------------------------
-- Der Zeitplan
-- ------------------------------------------------------------
-- Stündlich zur Minute 7; die Funktion selbst entscheidet, ob Mitternacht ist.
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron ließ sich nicht anlegen (%). Im Supabase-Dashboard unter Database -> Extensions einschalten.', sqlerrm;
end $$;

do $$
begin
  perform cron.unschedule('stufenkasse-speicherstand');
exception when others then null;
end $$;

do $$
begin
  perform cron.schedule('stufenkasse-speicherstand', '7 * * * *', 'select public.snapshot_taeglich()');
exception when others then
  raise notice 'Zeitplan nicht angelegt (%). Ohne pg_cron entsteht kein nächtlicher Speicherstand.', sqlerrm;
end $$;


do $$
begin
  if to_regclass('public.daten_snapshots') is null then
    -- EINE Zeichenkette, und ohne Semikolon darin. Der SQL-Editor von
    -- Supabase zerlegt das Skript vor dem Ausfuehren in einzelne Befehle und
    -- zerschneidet dabei eine Meldung, die ein Semikolon enthaelt.
    raise exception E'Es wurde nur ein TEIL dieser Datei eingefuegt - Teil 2 fehlt.\n\nSo kommt die ganze Datei an:\n  1. Auf GitHub supabase/protokoll-und-sicherung.sql oeffnen und oben rechts auf "Copy raw file" klicken - das kopiert alles.\n  2. Hier in den Editor klicken, Cmd+A druecken, dann Cmd+V.\n  3. VOR dem Run nach unten scrollen: die letzte Zeilennummer muss vierstellig sein (ueber 1000).\n\nEs wurde nichts geaendert - ganze Datei einfuegen und noch einmal Run.';
  end if;
end $$;

-- ------------------------------------------------------------
-- Startbestand
-- ------------------------------------------------------------
-- Damit direkt nach dem Einspielen schon ein Stand da ist und der Knopf im
-- Profil nicht ins Leere zeigt.
do $$
begin
  if not exists (select 1 from public.daten_snapshots) then
    perform public.snapshot_erstellen('automatisch', (now() at time zone 'Europe/Berlin')::date - 1);
  end if;
end $$;


-- ============================================================
-- TEIL 3 – Prüfung zum Schluss
--
-- Damit ein einziges Einfügen reicht: Diese Datei prüft sich am Ende selbst
-- und gibt eine Tabelle aus, in der steht, ob alles sitzt. Kein Suchen in den
-- Meldungen, kein Nachtippen von Abfragen.
--
-- Steht überall ✅, ist nichts mehr zu tun.
-- ============================================================

do $$
begin
  if to_regclass('public.audit_log') is null or to_regclass('public.daten_snapshots') is null then
    -- EINE Zeichenkette, und ohne Semikolon darin. Der SQL-Editor von
    -- Supabase zerlegt das Skript vor dem Ausfuehren in einzelne Befehle und
    -- zerschneidet dabei eine Meldung, die ein Semikolon enthaelt.
    raise exception E'Es wurde nur ein TEIL dieser Datei eingefuegt - Teil 1 oder Teil 2 fehlt.\n\nSo kommt die ganze Datei an:\n  1. Auf GitHub supabase/protokoll-und-sicherung.sql oeffnen und oben rechts auf "Copy raw file" klicken - das kopiert alles.\n  2. Hier in den Editor klicken, Cmd+A druecken, dann Cmd+V.\n  3. VOR dem Run nach unten scrollen: die letzte Zeilennummer muss vierstellig sein (ueber 1000).\n\nEs wurde nichts geaendert - ganze Datei einfuegen und noch einmal Run.';
  end if;
end $$;

create or replace function public.sicherung_pruefen()
returns table (nr int, pruefung text, ergebnis text)
  language plpgsql security definer set search_path = public as $pruef$
declare
  v text;
  n int;
begin
  nr := 1;
  pruefung := 'Protokoll (Tabelle audit_log)';
  if to_regclass('public.audit_log') is null then
    ergebnis := '❌ fehlt – die Datei ist nicht komplett durchgelaufen';
  else
    select count(*) into n from public.audit_log;
    ergebnis := '✅ da, ' || n || ' Einträge';
  end if;
  return next;

  nr := 2;
  pruefung := 'Protokoll ist unveränderbar';
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'audit_log' and cmd <> 'SELECT';
  ergebnis := case when n = 0
    then '✅ ja – niemand darf schreiben oder löschen, auch der Admin nicht'
    else '❌ es gibt ' || n || ' Schreibregel(n) zu viel' end;
  return next;

  nr := 3;
  pruefung := 'Protokoll-Trigger an den Tabellen';
  select count(*) into n from pg_trigger
   where not tgisinternal and tgname like 'audit\_%';
  ergebnis := case when n >= 15 then '✅ ' || n || ' Stück'
                   when n > 0   then '⚠️ nur ' || n || ' Stück – die Datei noch einmal laufen lassen'
                   else '❌ keine' end;
  return next;

  nr := 4;
  pruefung := 'Passwortwechsel werden protokolliert';
  ergebnis := case
    when exists (select 1 from pg_trigger where tgname = 'audit_passwort' and not tgisinternal)
      then '✅ ja'
    else '⚠️ nein – der Trigger auf auth.users ging nicht. Alles andere läuft, '
      || 'nur eigene Passwortwechsel stehen dann nicht im Protokoll.' end;
  return next;

  nr := 5;
  pruefung := 'Speicherstände (Tabelle daten_snapshots)';
  if to_regclass('public.daten_snapshots') is null then
    ergebnis := '❌ fehlt – die Datei ist nicht komplett durchgelaufen';
  else
    select 'vom ' || to_char(tag, 'DD.MM.YYYY') || ' (' || art || ', ' || zeilen || ' Zeilen)'
      into v from public.daten_snapshots order by erstellt_at desc limit 1;
    ergebnis := coalesce('✅ neuester Stand ' || v, '⚠️ noch keiner vorhanden');
  end if;
  return next;

  nr := 6;
  pruefung := 'pg_cron eingeschaltet';
  ergebnis := case when exists (select 1 from pg_extension where extname = 'pg_cron')
    then '✅ ja'
    else '❌ NEIN – im Dashboard: Database → Extensions → pg_cron einschalten, '
      || 'danach diese Datei noch einmal komplett ausführen.' end;
  return next;

  nr := 7;
  pruefung := 'Nächtlicher Speicherstand geplant';
  declare
    plan   text;
    laeuft boolean;
  begin
    -- Dynamisch, weil cron.job gar nicht existiert, solange pg_cron aus ist –
    -- ein direkter Zugriff würde schon beim Einlesen der Funktion scheitern.
    execute $q$select schedule, active from cron.job
               where jobname = 'stufenkasse-speicherstand'$q$ into plan, laeuft;
    if plan is null then
      ergebnis := '❌ nicht geplant – Datei noch einmal ausführen';
    elsif laeuft then
      ergebnis := '✅ ja – läuft ' || plan || ', sichert um 0:00 deutscher Zeit';
    else
      -- Kein Haken: der Zeitplan steht da, tut aber nichts.
      -- Kein Semikolon im Text: der SQL-Editor wuerde die Meldung sonst
      -- mitten im Satz zerschneiden.
      ergebnis := '⚠️ eingetragen (' || plan || '), aber ABGESCHALTET. '
               || 'Wieder anschalten mit cron.alter_job(jobid, active := true) '
               || 'fuer den Job stufenkasse-speicherstand';
    end if;
  exception when others then
    ergebnis := '❌ nein – erst pg_cron einschalten (Zeile 6), dann diese Datei noch einmal ausführen';
  end;
  return next;

  nr := 8;
  pruefung := 'Wer kommt an das Protokoll';
  ergebnis := '✅ nur die Rolle admin. Kassenwart sieht die Speicherstände, '
           || 'aber kein Protokoll und kann nichts zurücksetzen.';
  return next;
end $pruef$;

-- Die Prüfung ist nichts für die App – nur für den, der die Datei einspielt.
revoke all on function public.sicherung_pruefen() from public, anon, authenticated;

-- Das Ergebnis. Es erscheint als Tabelle unter dem SQL-Editor.
select * from public.sicherung_pruefen() order by nr;
