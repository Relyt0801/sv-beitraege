-- ============================================================
-- Anonyme Abstimmungen wirklich anonym
-- Vorher konnte jeder mit Zugriff auf die Abstimmung per API lesen, WER wie
-- gestimmt hat – die App hat es nur nicht angezeigt. Jetzt:
--  - Events: fremde Stimmen nur bei nicht-anonymen Umfragen (oder Team)
--  - Chat-Umfragen: fremde Stimmen nur bei nicht-anonymen (oder Admin)
--  - Die Zahlen je Antwort kommen für alle über zwei Zähl-Funktionen.
-- Einmal im SQL-Editor ausführen (idempotent).
-- ============================================================

drop policy if exists "votes select" on public.poll_votes;
create policy "votes select" on public.poll_votes for select
  using (
    user_id = auth.uid()
    or my_role() = any (array['stufenteam','kassenwart','admin','sprecher','stv_sprecher'])
    or exists (select 1 from events e where e.id = poll_votes.event_id and e.poll_show_results and not e.poll_anon)
  );

drop policy if exists "tvotes select" on public.topic_votes;
create policy "tvotes select" on public.topic_votes for select
  using (
    exists (
      select 1 from topic_items i
       where i.id = topic_votes.item_id and can_access_topic(i.topic_id)
         and (not coalesce(i.poll_anon, false) or topic_votes.user_id = auth.uid() or my_role() = 'admin')
    )
  );

-- Zahlen je Antwort (ohne Namen)
create or replace function public.stimmen_events(p_ids uuid[])
returns table (event_id uuid, option_id uuid, n integer)
language sql stable security definer set search_path = public as $$
  select v.event_id, v.option_id, count(*)::int
    from poll_votes v join events e on e.id = v.event_id
   where v.event_id = any (p_ids)
     and (e.poll_show_results or my_role() = any (array['stufenteam','kassenwart','admin','sprecher','stv_sprecher']))
   group by v.event_id, v.option_id
$$;

create or replace function public.stimmen_topics(p_ids uuid[])
returns table (item_id uuid, option_id text, n integer)
language sql stable security definer set search_path = public as $$
  select v.item_id, v.option_id, count(*)::int
    from topic_votes v join topic_items i on i.id = v.item_id
   where v.item_id = any (p_ids) and can_access_topic(i.topic_id)
   group by v.item_id, v.option_id
$$;

revoke all on function public.stimmen_events(uuid[]) from public, anon;
revoke all on function public.stimmen_topics(uuid[]) from public, anon;
grant execute on function public.stimmen_events(uuid[]) to authenticated;
grant execute on function public.stimmen_topics(uuid[]) to authenticated;
