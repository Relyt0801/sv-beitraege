-- ============================================================
-- Zugriffsregeln schneller machen – ohne sie inhaltlich zu ändern
--
-- Gefunden im Stresstest vom 24.09.2026: Die Liste der Konten (profiles)
-- brauchte in der Datenbank ~180 ms, Personen/Profile/Kinder-Zuordnungen
-- 40–95 ms – bei nur ~260 Zeilen. Grund: In den Zugriffsregeln stehen
-- Aufrufe wie my_role(), ist_team(), has_perm('…') und auth.uid() "nackt".
-- Postgres ruft sie dann für JEDE Zeile neu auf (und jede davon fragt
-- wieder die Tabelle profiles ab).
--
-- Eingepackt in (select …) rechnet Postgres sie einmal pro Abfrage aus.
-- Das ist die Empfehlung von Supabase (Linter "auth_rls_initplan").
-- Inhaltlich ändert sich nichts: die Funktionen hängen nicht von der Zeile
-- ab. Aufrufe MIT Zeilenbezug (can_access_topic(topic_id), ist_vorsitz(tag),
-- kann_termin_sehen(…), can_see_event(…)) bleiben unverändert.
--
-- Geprüft vor dem Einspielen (in einer zurückgerollten Transaktion):
--   * 9 Rollen × 43 Tabellen: sichtbare Zeilen vorher = nachher (Anzahl
--     und Prüfsumme über den Inhalt) – 387 Vergleiche, 0 Unterschiede
--   * Messung: profiles 32–37 ms → 0,4–0,5 ms, students 15–54 ms → 0,5–0,7 ms,
--     public_profiles 19–40 ms → 0,6–0,8 ms, parent_children bis 54 ms → 0,6 ms
--
-- Stolperstein (im Test gefunden und behoben): Fragt eine Regel ihre EIGENE
-- Tabelle ab (früher "tagmembers self once" auf tag_members), meldet Postgres
-- nach dem Einpacken "infinite recursion detected in policy". Tabellen mit
-- so einer Regel lässt die Datei deshalb aus – aufsichtsrat-schutz.sql
-- ersetzt die Unterabfrage durch die Funktion hat_eigenes_komitee().
--
-- Die Datei schreibt die Regeln um, die GERADE in der Datenbank stehen.
-- Wer später eine ältere SQL-Datei erneut einspielt, führt diese Datei
-- danach einfach noch einmal aus. Mehrfach ausführbar.
-- Einspielen: Supabase → SQL Editor → ganze Datei → Run.
-- ============================================================

create or replace function pg_temp.rls_einpacken(e text) returns text language plpgsql as $f$
begin
  if e is null then return null; end if;
  -- schon Eingepacktes erst auspacken, dann alles einheitlich einpacken
  e := regexp_replace(e, '\(\s*SELECT\s+auth\.uid\(\)\s+AS\s+uid\s*\)', 'auth.uid()', 'gi');
  e := regexp_replace(e, '\(\s*SELECT\s+(public\.)?(my_role|ist_team|has_consented|is_banned|eltern_ohne_kind|ist_eltern|ist_aufsichtsrat)\(\)\s+AS\s+\w+\s*\)', '\2()', 'gi');
  e := regexp_replace(e, '\(\s*SELECT\s+(public\.)?has_perm\(([^()]*)\)\s+AS\s+\w+\s*\)', 'has_perm(\2)', 'gi');
  e := regexp_replace(e, 'auth\.uid\(\)', '(select auth.uid())', 'g');
  e := regexp_replace(e, '(public\.)?\m(my_role|ist_team|has_consented|is_banned|eltern_ohne_kind|ist_eltern|ist_aufsichtsrat)\(\)', '(select public.\2())', 'g');
  e := regexp_replace(e, '(public\.)?\mhas_perm\(([^()]*)\)', '(select public.has_perm(\2))', 'g');
  return e;
end $f$;

do $$
declare p record; neu_q text; neu_c text; stmt text;
begin
  for p in select * from pg_policies pp where pp.schemaname = 'public'
             -- Tabellen auslassen, deren Regeln sich selbst abfragen (s. o.)
             and not exists (select 1 from pg_policies q
                              where q.schemaname = 'public' and q.tablename = pp.tablename
                                and (coalesce(q.qual,'') || ' ' || coalesce(q.with_check,'')) ~* ('from\s+(public\.)?' || q.tablename || '\M'))
  loop
    neu_q := pg_temp.rls_einpacken(p.qual);
    neu_c := pg_temp.rls_einpacken(p.with_check);
    if coalesce(neu_q, '') <> coalesce(p.qual, '') or coalesce(neu_c, '') <> coalesce(p.with_check, '') then
      stmt := format('alter policy %I on public.%I', p.policyname, p.tablename);
      if neu_q is not null then stmt := stmt || ' using (' || neu_q || ')'; end if;
      if neu_c is not null then stmt := stmt || ' with check (' || neu_c || ')'; end if;
      execute stmt;
    end if;
  end loop;
end $$;

-- Selbstprüfung: keine "nackten" Aufrufe mehr in den Regeln ------------
select 'Regeln ohne nackte auth.uid()/my_role()/has_perm()' as pruefung,
       case when not exists (
         select 1 from pg_policies
          where schemaname = 'public'
            and (  regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
                                  'SELECT\s+(auth\.uid|(public\.)?(my_role|ist_team|has_consented|is_banned|eltern_ohne_kind|ist_eltern|ist_aufsichtsrat|has_perm))\(', '', 'gi')
                   ~ '(auth\.uid|\m(my_role|ist_team|has_consented|is_banned|eltern_ohne_kind|ist_eltern|ist_aufsichtsrat|has_perm))\(')
       ) then 'ok' else 'noch nicht alle' end as ergebnis;
