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
