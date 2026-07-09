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
where user_id in (select id from auth.users where email = 'relyt0801@sv-beitraege.local');
