-- ============================================================
-- NUR IM DEMO-PROJEKT AUSFÜHREN.
--
-- Leert die Demo vollständig: alle Personen, alle Beiträge, alle Konten.
-- Danach ist das Projekt so leer wie direkt nach dem Aufsetzen und du kannst
-- die Demo-Daten sauber neu anlegen.
--
-- Im echten Projekt würde das eure komplette Stufe löschen.
-- Prüfe vorher oben links im Dashboard, in welchem Projekt du bist.
-- ============================================================

delete from public.contributions;
delete from public.poll_votes;
delete from public.topic_votes;
delete from public.topic_items;
delete from public.students;

-- Konten löschen. Die Profile hängen per Fremdschlüssel daran und gehen mit.
delete from auth.users;

-- Kontrolle: sollte überall 0 zeigen
select
  (select count(*) from public.students) as personen,
  (select count(*) from public.profiles) as profile,
  (select count(*) from auth.users)      as konten;
