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
