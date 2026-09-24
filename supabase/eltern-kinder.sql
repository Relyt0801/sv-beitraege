-- ============================================================
-- Elternzugänge: sichtbar ist nur, was zu den zugeordneten Kindern gehört
--
-- Seit dem Rollen-Reiter ordnet der Admin jedem Elternzugang seine Kinder
-- zu (Tabelle parent_children). Diese Datei sorgt dafür, dass die
-- Datenbank das genauso durchhält wie die App:
--
--   1. Alte Verknüpfung über profiles.student_id bei Elternkonten wird in
--      parent_children übernommen (niemand verliert Zugriff) und danach
--      geleert – ab jetzt zählt nur noch die Zuordnung im Rollen-Reiter.
--   2. Ein Elternzugang OHNE Kind sieht nichts: keine Kontodaten, keine
--      Infos, kann keine Anfragen stellen und sieht keine Person.
--   3. Kinder zuordnen darf nur der Admin – wie in der App. Bisher reichte
--      "Daten bearbeiten"; damit hätte das Stufenteam per API fremde Kinder
--      an Elternzugänge hängen können.
--   4. Nebenbei: automatische Beitragsbuchungen im Kassenbuch lassen sich
--      nicht mehr von Hand löschen oder ändern (nur noch über den Beitrag).
--
-- Mehrfach ausführbar. Einspielen: Supabase → SQL Editor → ganze Datei →
-- Run. Die letzte Abfrage prüft das Ergebnis und muss überall "ok" zeigen.
-- ============================================================

-- 1) Alte Verknüpfung übernehmen -------------------------------
insert into public.parent_children (user_id, student_id)
select p.user_id, p.student_id
  from public.profiles p
 where p.role = 'eltern' and p.student_id is not null
   and exists (select 1 from public.students s where s.id = p.student_id)
on conflict do nothing;

update public.profiles set student_id = null
 where role = 'eltern' and student_id is not null;

-- 2) Hilfsfunktion: Elternzugang ohne zugeordnetes Kind? ------
create or replace function public.eltern_ohne_kind()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'eltern', false)
     and not exists (select 1 from public.parent_children where user_id = auth.uid())
$$;

-- 3) Kontodaten und Infos nur mit Kind ------------------------
drop policy if exists "konto lesen" on public.bank_konto;
create policy "konto lesen" on public.bank_konto for select to authenticated
  using (not public.eltern_ohne_kind());

drop policy if exists "infos lesen" on public.eltern_infos;
create policy "infos lesen" on public.eltern_infos for select to authenticated
  using (not public.eltern_ohne_kind());

-- 4) Anfragen ans Stufenteam erst mit Kind --------------------
drop policy if exists "tickets anlegen" on public.eltern_tickets;
create policy "tickets anlegen" on public.eltern_tickets for insert to authenticated
  with check (((user_id = auth.uid()) and not public.eltern_ohne_kind()) or public.ist_team());

-- 5) Personen und Mithilfe: Eltern nur über die Zuordnung -----
--    (student_id im eigenen Profil gilt nur noch für Schüler)
drop policy if exists "students select" on public.students;
create policy "students select" on public.students for select to authenticated
  using (
    public.ist_team()
    or (public.my_role() <> 'eltern' and id = (select student_id from public.profiles where user_id = auth.uid()))
    or id in (select public.meine_kinder())
  );

drop policy if exists "contrib select" on public.contributions;
create policy "contrib select" on public.contributions for select to authenticated
  using (
    public.ist_team()
    or public.has_perm('data.edit')
    or public.has_perm('hilfen.edit')
    or (public.my_role() <> 'eltern' and student_id = (select student_id from public.profiles where user_id = auth.uid()))
    or student_id in (select public.meine_kinder())
  );

-- 6a) Kinder zuordnen: nur Admin (oder das geschützte OP-Konto) ------
drop policy if exists "kinder verwalten" on public.parent_children;
create policy "kinder verwalten" on public.parent_children for all to authenticated
  using (public.my_role() = 'admin' or coalesce((select is_op from public.profiles where user_id = auth.uid()), false))
  with check (public.my_role() = 'admin' or coalesce((select is_op from public.profiles where user_id = auth.uid()), false));

-- 6b) Automatische Beitragsbuchungen schützen -----------------------
--     Zusätzliche (einschränkende) Regel: gilt zusätzlich zu "kasse pflegen".
--     Der Trigger beitrag_buchen und das Zurücksetzen einer Sicherung laufen
--     als security definer und sind davon nicht betroffen.
drop policy if exists "automatik nicht loeschen" on public.kasse_buchungen;
create policy "automatik nicht loeschen" on public.kasse_buchungen as restrictive
  for delete to authenticated using (not automatisch);
drop policy if exists "automatik nicht aendern" on public.kasse_buchungen;
create policy "automatik nicht aendern" on public.kasse_buchungen as restrictive
  for update to authenticated using (not automatisch) with check (not automatisch);

-- 6c) Live-Aktualisierung: Zuordnung ändert sich sofort beim Elternteil
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'parent_children') then
    alter publication supabase_realtime add table public.parent_children;
  end if;
end $$;

-- 7) Selbstprüfung ---------------------------------------------
select 'Funktion eltern_ohne_kind' as pruefung,
       case when exists (select 1 from pg_proc where proname = 'eltern_ohne_kind') then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Kontodaten nur mit Kind',
       case when exists (select 1 from pg_policies where tablename = 'bank_konto' and policyname = 'konto lesen' and qual like '%eltern_ohne_kind%') then 'ok' else 'FEHLT' end
union all
select 'Infos nur mit Kind',
       case when exists (select 1 from pg_policies where tablename = 'eltern_infos' and policyname = 'infos lesen' and qual like '%eltern_ohne_kind%') then 'ok' else 'FEHLT' end
union all
select 'Keine Elternkonten mehr mit student_id',
       case when not exists (select 1 from public.profiles where role = 'eltern' and student_id is not null) then 'ok' else 'noch vorhanden' end
union all
select 'Kinder zuordnen nur Admin',
       case when exists (select 1 from pg_policies where tablename = 'parent_children' and policyname = 'kinder verwalten' and qual like '%admin%') then 'ok' else 'FEHLT' end
union all
select 'Automatische Buchungen geschützt',
       case when (select count(*) from pg_policies where tablename = 'kasse_buchungen' and policyname like 'automatik nicht%') = 2 then 'ok' else 'FEHLT' end
union all
select 'Realtime für parent_children',
       case when exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'parent_children') then 'ok' else 'FEHLT' end;
