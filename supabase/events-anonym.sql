-- Anonyme Abstimmungen im Events-Reiter
-- Ausführen im Supabase SQL-Editor. Gefahrlos mehrfach ausführbar.

-- 1) Spalte: standardmäßig anonym (wie bei den Komitee-Abstimmungen)
alter table public.events
  add column if not exists poll_anon boolean not null default true;

-- 2) Stimmen lesen: Ergebnis-Balken brauchen alle Zeilen, deshalb bleibt die
--    Leseregel wie gehabt. Wer wie gestimmt hat, blendet die App bei anonymen
--    Abstimmungen aus (graue Kreise). Sprecher zählen jetzt zum Stufenteam.
drop policy if exists "votes select" on public.poll_votes;
create policy "votes select" on public.poll_votes for select to authenticated
  using (
    user_id = auth.uid()
    or public.my_role() in ('stufenteam','kassenwart','admin','sprecher','stv_sprecher')
    or exists (select 1 from public.events e where e.id = event_id and e.poll_show_results)
  );
