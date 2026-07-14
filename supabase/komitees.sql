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
