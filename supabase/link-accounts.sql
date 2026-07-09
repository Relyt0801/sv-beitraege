-- ============================================================
-- Stufenkasse – Konten automatisch mit Schülern verknüpfen
-- Nach roles.sql im SQL Editor ausführen. Idempotent.
-- Nutzername-Schema: nachname.vorname (klein, ohne Umlaute/Sonderzeichen,
-- Leerzeichen/Zweitnamen -> Bindestrich)
-- ============================================================

-- Pflicht-Passwortwechsel-Flag (wird vom Konto-Skript auf true gesetzt;
-- die App erzwingt dann vor dem ersten Nutzen einen Passwortwechsel)
alter table public.profiles add column if not exists must_change_password boolean not null default false;

-- Namensteil normalisieren (Spiegel der JS-Logik in src/lib/username.ts)
-- ä->ae, ö->oe, ü->ue, ß->ss; übrige Akzente -> Grundbuchstabe
create or replace function public.username_part(s text) returns text
  language sql immutable as $$
  select trim(both '-' from regexp_replace(
    translate(
      replace(replace(replace(replace(lower(coalesce(s,'')),
        'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'),
      'àáâãåæèéêëìíîïòóôõøùúûçčñšžýÿ',
      'aaaaaaeeeeiiiiooooouuuccnszyy'),
    '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function public.username_for(nachname text, vorname text) returns text
  language sql immutable as $$
  select public.username_part(nachname) || '.' || public.username_part(vorname)
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
