-- ============================================================
-- Aufsichtsrat: nur vom Team zuzuteilen – auch über die Schnittstelle
--
-- Gefunden im Test vom 24.09.2026: Die Regel "tagmembers self once" ließ
-- jede Person ohne Komitee sich selbst in JEDES Komitee eintragen – auch in
-- den Aufsichtsrat. In der App steht der Aufsichtsrat nicht zur Auswahl
-- (teamOnly in src/lib/committees.ts), über die Schnittstelle ging es aber:
-- ein Aufruf, und man hätte als Schüler das komplette Kassenbuch und alle
-- Kostenanfragen lesen können (ist_aufsichtsrat() gibt Leserechte).
--
-- Jetzt: Selbst eintragen nur in wählbare Komitees. Den Aufsichtsrat
-- vergibt weiterhin, wer "Komitees zuteilen" darf (Regel "tagmembers manage").
--
-- Mehrfach ausführbar. Einspielen: Supabase → SQL Editor → ganze Datei → Run.
-- ============================================================

-- "Hat schon ein Komitee?" als Funktion statt als Unterabfrage auf
-- tag_members: Eine Regel, die ihre eigene Tabelle abfragt, löst sonst
-- "infinite recursion detected in policy" aus, sobald die Lese-Regeln der
-- Tabelle eingepackte Aufrufe enthalten (siehe rls-schneller.sql).
create or replace function public.hat_eigenes_komitee()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tag_members where user_id = auth.uid())
$$;
revoke execute on function public.hat_eigenes_komitee() from public, anon;
grant execute on function public.hat_eigenes_komitee() to authenticated;

drop policy if exists "tagmembers self once" on public.tag_members;
create policy "tagmembers self once" on public.tag_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and tag <> 'aufsichtsrat'
    and not (select public.hat_eigenes_komitee())
  );

-- Selbstprüfung ---------------------------------------------------
select 'Aufsichtsrat nicht selbst wählbar' as pruefung,
       case when exists (select 1 from pg_policies
                          where tablename = 'tag_members' and policyname = 'tagmembers self once'
                            and with_check like '%aufsichtsrat%') then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Keine Regel fragt ihre eigene Tabelle ab',
       case when not exists (select 1 from pg_policies where schemaname = 'public'
                               and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~* ('from\s+(public\.)?' || tablename || '\M'))
            then 'ok' else 'FEHLT' end;
