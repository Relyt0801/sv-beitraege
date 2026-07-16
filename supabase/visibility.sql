-- ============================================================
-- Stufenkasse – Sichtbarkeit von Ordnern (privat / personen / stufenteam / komitee)
-- Nach topics.sql, komitees.sql, admin-only.sql ausführen. Idempotent.
--   privat     = nur Ersteller (und Admin)
--   personen   = Ersteller + ausgewählte Personen (topic_members)
--   stufenteam = Ersteller + Stufenteam/Kassenwart/Admin
--   komitee    = Ersteller + alle Mitglieder des Komitees (topics.tag)
--   admin_only = überschreibt alles: nur Admin
-- ============================================================

-- Default 'stufenteam', damit bereits vorhandene Test-Ordner nicht verschwinden.
alter table public.topics add column if not exists visibility text not null default 'stufenteam'
  check (visibility in ('privat','personen','stufenteam','komitee'));

create or replace function public.can_access_topic(tid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.has_consented() and exists (
    select 1 from public.topics t where t.id = tid and (
      public.my_role() = 'admin'
      or ( not t.admin_only and (
        t.created_by = auth.uid()
        or ( t.visibility = 'stufenteam' and public.my_role() in ('stufenteam','kassenwart') )
        or ( t.visibility = 'personen'
             and exists (select 1 from public.topic_members m where m.topic_id = t.id and m.user_id = auth.uid()) )
        or ( t.visibility = 'komitee' and t.tag <> ''
             and exists (select 1 from public.tag_members g where g.tag = t.tag and g.user_id = auth.uid()) )
      ))
    )
  )
$$;

-- SELECT auf topics läuft NUR noch über can_access_topic (respektiert die Sichtbarkeit).
-- Schreibrechte (anlegen/ändern/löschen) getrennt, damit Team nicht per for-all alles sieht.
drop policy if exists "topics staff"  on public.topics;
drop policy if exists "topics select" on public.topics;
drop policy if exists "topics insert" on public.topics;
drop policy if exists "topics update" on public.topics;
drop policy if exists "topics delete" on public.topics;

create policy "topics select" on public.topics for select to authenticated
  using ( public.can_access_topic(id) );
create policy "topics insert" on public.topics for insert to authenticated
  with check ( public.my_role() in ('stufenteam','kassenwart','admin') and not admin_only or public.my_role() = 'admin' );
create policy "topics update" on public.topics for update to authenticated
  using ( created_by = auth.uid() or public.my_role() = 'admin'
          or ( public.my_role() in ('stufenteam','kassenwart') and not admin_only ) )
  with check ( created_by = auth.uid() or public.my_role() = 'admin'
          or ( public.my_role() in ('stufenteam','kassenwart') and not admin_only ) );
create policy "topics delete" on public.topics for delete to authenticated
  using ( created_by = auth.uid() or public.my_role() = 'admin'
          or ( public.my_role() in ('stufenteam','kassenwart') and not admin_only ) );
