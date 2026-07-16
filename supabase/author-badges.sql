-- ============================================================
-- Stufenkasse – Autoren-Markierung an Nachrichten
-- Rolle + relevante Komitees des Autors werden beim Schreiben mitgespeichert,
-- damit jede/r Betrachter/in (auch Schüler) die Markierung sieht.
-- Nach multi-visibility.sql ausführen. Idempotent.
-- ============================================================

alter table public.topic_items add column if not exists author_role text;
alter table public.topic_items add column if not exists author_koms text[];
