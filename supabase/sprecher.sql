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
