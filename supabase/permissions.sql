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
  ('kassenwart','chats.view_all',true),
  ('kassenwart','chats.delete_messages',true),
  ('kassenwart','chats.manage',true),
  ('kassenwart','komitees.assign',true),
  ('kassenwart','data.edit',true),
  ('kassenwart','kasse.edit',true),
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
