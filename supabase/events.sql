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
