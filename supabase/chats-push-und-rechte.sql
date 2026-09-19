-- ============================================================
-- Chat-Benachrichtigungen, Stufenteam-Chat, Beitragshilfen-Recht,
-- Events nie für Eltern. Einmal im SQL-Editor ausführen (idempotent).
-- ============================================================

-- 1) Eigenes Recht "Beitragshilfen eintragen" (vorher Teil von "Daten bearbeiten").
--    Wer bisher data.edit hatte, bekommt es mit – es ändert sich also nichts,
--    bis der Admin es im Rechte-Reiter umstellt.
insert into public.role_permissions (role, perm, allowed)
select role, 'hilfen.edit', allowed from public.role_permissions where perm = 'data.edit'
on conflict (role, perm) do nothing;
insert into public.user_permissions (user_id, perm, allowed)
select user_id, 'hilfen.edit', allowed from public.user_permissions where perm = 'data.edit'
on conflict (user_id, perm) do nothing;

drop policy if exists "contrib write" on public.contributions;
create policy "contrib write" on public.contributions for all
  using (has_perm('hilfen.edit')) with check (has_perm('hilfen.edit'));
drop policy if exists "contrib select" on public.contributions;
create policy "contrib select" on public.contributions for select
  using (
    ist_team() or has_perm('data.edit') or has_perm('hilfen.edit')
    or student_id = (select profiles.student_id from profiles where profiles.user_id = auth.uid())
    or student_id in (select meine_kinder())
  );
drop policy if exists "tpl write" on public.contribution_templates;
-- Vorlagen pflegt man im Beiträge-Reiter
create policy "tpl write" on public.contribution_templates for all
  using (has_perm('beitraege.manage') or has_perm('hilfen.edit'))
  with check (has_perm('beitraege.manage') or has_perm('hilfen.edit'));

-- 2) Events (auch Umfragen) sind nie für Eltern – auch nicht über die API.
create or replace function public.can_see_event(eid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_consented() and not public.ist_eltern() and exists (
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

-- 3) Stufenteam-Chat: das Team sieht ihn immer, auch ohne "Alle Chats sehen".
create or replace function public.topic_core_access(tid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_consented() and exists (
    select 1 from public.topics t where t.id = tid and (
      public.my_role() = 'admin'
      or ( not t.admin_only and (
        public.has_perm('chats.view_all')
        or ( t.visibility = 'stufenteam' and public.ist_team() )
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

-- 4) Das ganze Team (auch Sprecher) darf Personen zu Gesprächen hinzufügen –
--    nötig, damit es Schüler direkt anschreiben kann.
drop policy if exists "tmembers staff" on public.topic_members;
create policy "tmembers staff" on public.topic_members for all
  using (ist_team()) with check (ist_team());
