-- Erst NACH dem Livegang von Update 1.3 ausführen (Supabase → SQL Editor → Run).
--
-- Bis Update 1.2 zählt die App die Zitat-Stimmen selbst und liest dafür alle
-- Zeilen aus zitat_stimmen. Ab 1.3 kommen die Zahlen aus stimmen_zahlen()
-- (honorable-mentions.sql) – dann darf jede/r nur noch die eigenen Stimmen
-- lesen, das Komitee alle. So bleibt „Ergebnisse nur fürs Komitee“ auch
-- über die Schnittstelle dicht.

alter policy "zitat stimmen lesen" on public.zitat_stimmen
  using ((select public.has_perm('zitate.nutzen')) and not (select public.ist_eltern())
         and (user_id = (select auth.uid()) or (select public.ergebnis_komitee('zitate'))));
