-- ============================================================
-- Stufenkasse – Mehrere Sichtbarkeits-Ziele je Ordner
-- Personen (topic_members) UND mehrere Komitees (topic_tags) frei kombinierbar.
-- Nach governance.sql ausführen. Idempotent.
-- ============================================================

-- Komitee-Sichtbarkeiten eines Ordners (mehrere möglich)
create table if not exists public.topic_tags (
  topic_id uuid not null references public.topics(id) on delete cascade,
  tag text not null,
  primary key (topic_id, tag)
);
alter table public.topic_tags enable row level security;
do $$ begin alter publication supabase_realtime add table public.topic_tags; exception when duplicate_object then null; end $$;

drop policy if exists "ttags select" on public.topic_tags;
drop policy if exists "ttags staff"  on public.topic_tags;
create policy "ttags select" on public.topic_tags for select to authenticated
  using ( public.can_access_topic(topic_id) );
create policy "ttags staff" on public.topic_tags for all to authenticated
  using ( public.my_role() in ('stufenteam','kassenwart','admin') )
  with check ( public.my_role() in ('stufenteam','kassenwart','admin') );

-- Zugriff: Team sieht alles (außer admin_only); sonst Ersteller,
-- ausgewählte Personen ODER Mitglied eines der freigegebenen Komitees.
create or replace function public.can_access_topic(tid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.has_consented() and exists (
    select 1 from public.topics t where t.id = tid and (
      public.my_role() = 'admin'
      or ( not t.admin_only and (
        public.my_role() in ('stufenteam','kassenwart')          -- Team sieht immer alles
        or t.created_by = auth.uid()
        or exists (select 1 from public.topic_members m
                     where m.topic_id = t.id and m.user_id = auth.uid())
        or exists (select 1 from public.topic_tags tt
                     join public.tag_members g on g.tag = tt.tag and g.user_id = auth.uid()
                     where tt.topic_id = t.id)
        -- Alt-Ordner: einzelnes Komitee über visibility='komitee' + tag
        or ( t.visibility = 'komitee' and t.tag <> ''
             and exists (select 1 from public.tag_members g
                           where g.tag = t.tag and g.user_id = auth.uid()) )
      ))
    )
  )
$$;
