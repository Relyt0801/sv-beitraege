-- Einreicher von Mottos und Zitaten für normale Konten unlesbar machen.
-- ERST AUSFÜHREN, WENN DIE APP-VERSION VOM 09.10.2026 LIVE IST – ältere
-- Versionen lesen die Tabellen mit „select *“ und bekämen einen Fehler.
-- Supabase → SQL Editor → einfügen → Run.
--
-- Wer verwaltet, sieht den Namen weiter über autor_info() (ⓘ in der App).

revoke select on public.motto_vorschlaege from anon, authenticated;
grant select (id, text, erklaerung, created_at, ausgeblendet, gewaehlt) on public.motto_vorschlaege to authenticated;

revoke select on public.zitate from anon, authenticated;
grant select (id, text, wer, art, kontext, status, created_at, geprueft_at) on public.zitate to authenticated;
