-- ============================================================
-- Komitee-Chats und Stufenteam-Chat gibt es nur noch EINMAL
--
-- Was passiert war (24.09.2026, 12:57): Ein Konto wurde live von
-- "schueler" auf "stufenteam" gestellt. Die offene App hatte noch die
-- Chat-Liste aus der Schülersicht (nur das eigene Komitee sichtbar), bekam
-- aber sofort das Recht "Chats verwalten". Die Regel "fehlende Chats
-- einmalig anlegen" hielt alle unsichtbaren Chats für fehlend und legte sie
-- ein zweites Mal an: Mottowoche, Zeugnisvergabe, Gottesdienst, Motto &
-- Pullis, Abizeitung, Chaostag, Aufsichtsrat und Stufenteam.
--
-- Diese Datei
--   1. führt die doppelten Chats zusammen (der älteste bleibt, Nachrichten,
--      Mitglieder, Ordner und Freigaben ziehen mit um),
--   2. verhindert Dopplungen künftig in der Datenbank selbst:
--      - ein Trigger überspringt das Anlegen still, wenn es den Chat schon
--        gibt (so bekommt auch eine noch alte App-Version keine Fehlermeldung)
--      - ein eindeutiger Index als harte Grenze, auch bei gleichzeitigen
--        Aufrufen.
--
-- Mehrfach ausführbar. Einspielen: Supabase → SQL Editor → ganze Datei →
-- Run. Die letzte Abfrage prüft das Ergebnis und muss überall "ok" zeigen.
-- ============================================================

-- 1) Doppelte zusammenführen ------------------------------------
create temporary table chat_dubletten on commit drop as
select id, behalten
  from (
    select id,
           first_value(id) over (partition by tag order by created_at, id) as behalten,
           row_number()    over (partition by tag order by created_at, id) as nr
      from public.topics
     where kind = 'chat' and parent_id is null
  ) x
 where nr > 1;

-- Nachrichten, Umfragen, To-dos
update public.topic_items i set topic_id = d.behalten
  from chat_dubletten d where i.topic_id = d.id;

-- Unterordner
update public.topics t set parent_id = d.behalten
  from chat_dubletten d where t.parent_id = d.id;

-- Mitglieder und Komitee-Freigaben (ohne doppelte Zeilen)
insert into public.topic_members (topic_id, user_id)
select d.behalten, m.user_id from public.topic_members m join chat_dubletten d on d.id = m.topic_id
on conflict do nothing;
insert into public.topic_tags (topic_id, tag)
select d.behalten, g.tag from public.topic_tags g join chat_dubletten d on d.id = g.topic_id
on conflict do nothing;

-- Gelesen-Markierungen: die neuere gewinnt
insert into public.topic_reads (topic_id, user_id, last_read)
select d.behalten, r.user_id, r.last_read from public.topic_reads r join chat_dubletten d on d.id = r.topic_id
on conflict (topic_id, user_id) do update set last_read = greatest(public.topic_reads.last_read, excluded.last_read);

-- Jetzt die leeren Doppelten löschen (Reste hängen per ON DELETE CASCADE dran)
delete from public.topics t using chat_dubletten d where t.id = d.id;

-- 2) Künftig: gibt es den Chat schon, wird das Anlegen still übersprungen --
create or replace function public.topics_chat_nicht_doppelt()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'chat' and new.parent_id is null
     and exists (select 1 from public.topics t
                  where t.kind = 'chat' and t.parent_id is null and t.tag = new.tag) then
    return null;  -- schon da: nichts anlegen, aber auch keinen Fehler werfen
  end if;
  return new;
end $$;

drop trigger if exists topics_chat_nicht_doppelt on public.topics;
create trigger topics_chat_nicht_doppelt
  before insert on public.topics
  for each row execute function public.topics_chat_nicht_doppelt();

-- Harte Grenze (fängt auch zwei gleichzeitige Aufrufe ab)
create unique index if not exists topics_chat_je_tag
  on public.topics (tag) where kind = 'chat' and parent_id is null;

-- 3) Selbstprüfung ---------------------------------------------
select 'Keine doppelten Chats mehr' as pruefung,
       case when not exists (
         select 1 from public.topics where kind = 'chat' and parent_id is null
          group by tag having count(*) > 1) then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Trigger gegen Dopplungen',
       case when exists (select 1 from pg_trigger where tgname = 'topics_chat_nicht_doppelt') then 'ok' else 'FEHLT' end
union all
select 'Eindeutiger Index',
       case when exists (select 1 from pg_indexes where indexname = 'topics_chat_je_tag') then 'ok' else 'FEHLT' end;
