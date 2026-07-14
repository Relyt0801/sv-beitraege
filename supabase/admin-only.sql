-- ============================================================
-- Stufenkasse – Admin-only-Ordner (nur der Admin sieht sie, auch Team nicht)
-- Nach komitees.sql ausführen. Idempotent.
-- ============================================================

alter table public.topics add column if not exists admin_only boolean not null default false;

-- Zugriff: admin_only-Ordner sieht NUR der Admin; sonst wie gehabt
create or replace function public.can_access_topic(tid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.has_consented() and (
    public.my_role() = 'admin'
    or (
      (select coalesce(t.admin_only, false) from public.topics t where t.id = tid) = false
      and (
        public.my_role() in ('stufenteam','kassenwart')
        or exists (select 1 from public.topic_members m where m.topic_id = tid and m.user_id = auth.uid())
        or exists (
          select 1 from public.topics t
          join public.tag_members g on g.tag = t.tag and g.user_id = auth.uid()
          where t.id = tid and t.tag <> ''
        )
      )
    )
  )
$$;

-- Schreibrechte auf topics: Team/Kassenwart nur für nicht-versteckte Ordner, Admin überall
drop policy if exists "topics staff" on public.topics;
create policy "topics staff" on public.topics for all to authenticated
  using (
    public.my_role() = 'admin'
    or ( public.my_role() in ('stufenteam','kassenwart') and not admin_only )
  )
  with check (
    public.my_role() = 'admin'
    or ( public.my_role() in ('stufenteam','kassenwart') and not admin_only )
  );

-- Beitrags-Löschung sauber begrenzen: nur wer den Ordner sehen darf
-- (eigene Beiträge: jeder selbst; fremde: Team/Kassenwart/Admin)
drop policy if exists "titems delete" on public.topic_items;
create policy "titems delete" on public.topic_items for delete to authenticated
  using (
    public.can_access_topic(topic_id)
    and ( created_by = auth.uid() or public.my_role() in ('stufenteam','kassenwart','admin') )
  );
