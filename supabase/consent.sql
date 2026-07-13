-- ============================================================
-- Stufenkasse – Zustimmung auf DATENBANK-Ebene erzwingen
-- Nach roles.sql, events.sql, topics.sql ausführen. Idempotent.
--
-- Ohne Zustimmung (profiles.terms_accepted_at IS NULL) verweigert die DB
-- den Lesezugriff auf personenbezogene Daten – auch bei direkten
-- API-Aufrufen am Client vorbei. Das eigene Profil bleibt lesbar,
-- damit Zustimmungs-/Passwort-Screen funktionieren.
-- ============================================================

create or replace function public.has_consented() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(
    (select terms_accepted_at is not null from public.profiles where user_id = auth.uid()),
    false)
$$;

-- Schülerdaten: nur mit Zustimmung lesbar
drop policy if exists "students select" on public.students;
create policy "students select" on public.students for select to authenticated
  using ( public.has_consented() and (
    public.my_role() in ('stufenteam','kassenwart','admin')
    or id = (select student_id from public.profiles where user_id = auth.uid())
  ));

-- Events: Zustimmung in die Sichtbarkeitsfunktion einbauen
create or replace function public.can_see_event(eid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.has_consented() and exists (
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

-- Themen: Zustimmung in die Zugriffsfunktion einbauen
create or replace function public.can_access_topic(tid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.has_consented() and (
    public.my_role() in ('stufenteam','kassenwart','admin')
    or exists (select 1 from public.topic_members m where m.topic_id = tid and m.user_id = auth.uid())
  )
$$;

-- Profile: eigene Zeile immer lesbar (nötig für die Gates VOR der Zustimmung);
-- fremde Profile nur für Team – und nur mit Zustimmung
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated
  using (
    user_id = auth.uid()
    or ( public.has_consented() and public.my_role() in ('stufenteam','kassenwart','admin') )
  );
