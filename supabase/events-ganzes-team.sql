-- ============================================================
-- Events legt das ganze Team an – wie Termine und Eltern-Infos
--
-- Vorher (Test 25.09.2026): Die App zeigte "Event erstellen" nur Admin und
-- Sprechern (Recht data.edit), die Datenbank erlaubte es nur Stufenteam,
-- Kassenwart und Admin. Ergebnis: Sprecher bekamen einen Fehler, Stufenteam
-- und Kassenwart hatten keinen Knopf, Komitee-Events durften nur Admin und
-- Sprecher zuordnen.
--
-- Jetzt gilt überall ist_team(): Stufenteam, Kassenwart, Admin, Sprecher,
-- stv. Sprecher. Schüler und Eltern legen keine Events an. Rote Warnungen
-- bleiben Kassenwart und Admin vorbehalten (Trigger guard_event_insert).
--
-- Mehrfach ausführbar. Einspielen: Supabase → SQL Editor → ganze Datei → Run.
-- ============================================================

alter policy "events staff" on public.events
  using ((select public.ist_team())) with check ((select public.ist_team()));
alter policy "targets staff" on public.event_targets
  using ((select public.ist_team())) with check ((select public.ist_team()));
alter policy "targets select" on public.event_targets
  using ((select public.ist_team())
         or student_id = (select p.student_id from public.profiles p where p.user_id = (select auth.uid())));
alter policy "evkom staff" on public.event_committees
  using ((select public.ist_team())) with check ((select public.ist_team()));
alter policy "options staff" on public.poll_options
  using ((select public.ist_team())) with check ((select public.ist_team()));

-- Selbstprüfung ---------------------------------------------------
select 'Events: ganzes Team' as pruefung,
       case when (select count(*) from pg_policies
                   where tablename in ('events','event_targets','event_committees','poll_options')
                     and policyname in ('events staff','targets staff','evkom staff','options staff')
                     and qual like '%ist_team%') = 4 then 'ok' else 'FEHLT' end as ergebnis;
