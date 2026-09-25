-- ============================================================
-- Rechte-Test: Wer darf was? (Stand 25.09.2026)
--
-- Spielt 127 Angriffe und erlaubte Aktionen mit echten Konten JEDER Rolle
-- durch – direkt in der Datenbank, genau so, wie es ein Angreifer über die
-- Schnittstelle versuchen würde (Rolle "authenticated" bzw. "anon" mit der
-- Kennung der Person, Zugriffsregeln greifen wie in der App).
--
-- ES WIRD NICHTS GEÄNDERT: Jeder Versuch läuft in einer eigenen
-- Unter-Transaktion und wird sofort zurückgerollt – auch wenn er gelingt.
-- Die Testpersonen sucht die Datei selbst aus (keine festen Kennungen).
--
-- Ausführen: Supabase → SQL Editor → ganze Datei → Run.
-- Ergebnis: oben die Summe, darunter nur Abweichungen und Hinweise.
-- "!! ABWEICHUNG" = eine Regel lässt etwas zu, das verboten sein sollte
-- (oder umgekehrt) – dann sofort melden.
-- "?? TEST PRÜFEN" = der Versuch ist aus einem anderen Grund gescheitert
-- (z. B. Spalte umbenannt) – dann den Testfall anpassen, sonst prüft er nichts.
-- ============================================================

-- Testpersonen und Testdaten automatisch wählen
create temp table tp on commit drop as
with s as (
  select
    (select user_id from public.profiles where role = 'admin' and not is_op order by created_at limit 1) as uid_admin,
    (select user_id from public.profiles where role = 'kassenwart' order by created_at limit 1) as uid_kassenwart,
    (select user_id from public.profiles where role = 'stufenteam' order by created_at limit 1) as uid_stufenteam,
    (select p.user_id from public.profiles p where p.role = 'schueler' and p.student_id is not null
       and not exists (select 1 from public.tag_members g where g.user_id = p.user_id) order by p.created_at limit 1) as uid_schueler,
    (select p.user_id from public.profiles p where p.role = 'schueler'
       and exists (select 1 from public.tag_members g where g.user_id = p.user_id and g.tag <> 'aufsichtsrat') order by p.created_at limit 1) as uid_s_komitee,
    (select p.user_id from public.profiles p where p.role = 'eltern'
       and exists (select 1 from public.parent_children c where c.user_id = p.user_id) order by p.created_at limit 1) as uid_eltern
)
select s.*,
  (select student_id from public.profiles where user_id = s.uid_schueler) as s_eigen,
  -- "fremd" = weder die eigene Person des Schülers noch schon ein Kind des Eltern-Kontos
  (select st.id from public.students st
    where st.id is distinct from (select student_id from public.profiles where user_id = s.uid_schueler)
      and not exists (select 1 from public.parent_children c where c.user_id = s.uid_eltern and c.student_id = st.id)
    order by st.nachname limit 1) as s_fremd,
  (select student_id from public.parent_children where user_id = s.uid_eltern limit 1) as kind,
  (select id from public.topics where kind = 'chat' and tag = 'abiball' limit 1) as chat_fremd,
  (select t.id from public.topics t join public.tag_members g on g.tag = t.tag and g.user_id = s.uid_s_komitee where t.kind = 'chat' limit 1) as chat_eigen,
  (select id from public.kasse_buchungen where automatisch limit 1) as auto,
  (select id from public.daten_snapshots order by erstellt_at limit 1) as snap,
  -- eine Schicht, die noch nicht vorbei ist (Punkte dürfen dafür noch nicht raus)
  (select t.id from public.termine t join public.aktionen a on a.id = t.aktion_id
    where t.abschluss is null and coalesce(a.prozent, 0) > 0 and public.termin_ende(t) > now()
    order by t.datum limit 1) as schicht_offen
from s;

create temp table faelle (rolle text, fall text, sql text, erwartet text) on commit drop;
insert into faelle values
  ('schueler', 'Eigene Rolle auf admin', 'update profiles set role=''admin'' where user_id=auth.uid()', 'V'),
  ('schueler', 'Sich selbst OP machen', 'update profiles set is_op=true where user_id=auth.uid()', 'V'),
  ('schueler', 'Recht perms.manage an sich', 'insert into user_permissions(user_id,perm,allowed) values (auth.uid(),''perms.manage'',true)', 'V'),
  ('schueler', 'Rollenrecht schueler: perms.manage', 'insert into role_permissions(role,perm,allowed) values (''schueler'',''perms.manage'',true) on conflict (role,perm) do update set allowed=true', 'V'),
  ('schueler', 'Eigenen Beitrag auf bezahlt', 'update students set terms = jsonb_set(terms,''{Q1.1,status}'',''"bezahlt"'') where id=''{S_EIGEN}''', 'V'),
  ('schueler', 'Fremden Beitrag ändern', 'update students set terms = jsonb_set(terms,''{Q1.1,status}'',''"bezahlt"'') where id=''{S_FREMD}''', 'V'),
  ('schueler', 'Person löschen', 'delete from students where id=''{S_FREMD}''', 'V'),
  ('schueler', 'Kassenbuchung anlegen', 'insert into kasse_buchungen(datum,cent,quelle,titel) values (current_date, 100000, ''spende'', ''Test'')', 'V'),
  ('schueler', 'Protokoll löschen', 'delete from audit_log where true', 'V'),
  ('schueler', 'Protokoll fälschen', 'insert into audit_log(aktion,bereich,klartext) values (''x'',''x'',''x'')', 'V'),
  ('schueler', 'IBAN ändern', 'update bank_konto set iban=''DE00TEST'' where true', 'V'),
  ('schueler', 'Kind an sich hängen', 'insert into parent_children(user_id,student_id) values (auth.uid(),''{S_FREMD}'')', 'V'),
  ('schueler', 'Eltern-Info schreiben', 'insert into eltern_infos(titel,text,angeheftet,autor) values (''x'',''x'',false,auth.uid())', 'V'),
  ('schueler', 'Komitee-Chat anlegen', 'insert into topics(title,tag,visibility,kind,created_by) values (''X'',''xtest'',''komitee'',''chat'',auth.uid())', 'V'),
  ('schueler', 'In fremden Komitee-Chat schreiben', 'insert into topic_items(topic_id,type,body,author,created_by) values (''{CHAT_FREMD}'',''nachricht'',''x'',''x'',auth.uid())', 'V'),
  ('schueler', 'Selbst in den Aufsichtsrat', 'insert into tag_members(tag,user_id) values (''aufsichtsrat'',auth.uid())', 'V'),
  ('schueler', 'Selbst Komitee-Vorsitz', 'insert into komitee_vorsitz(tag,user_id) values (''abiball'',auth.uid())', 'V'),
  ('schueler', 'Halbjahr umstellen', 'update app_settings set aktuelles_halbjahr=''Q2.2'' where true', 'V'),
  ('schueler', 'Sicherung zurückspielen', 'select snapshot_zuruecksetzen(''{SNAP}'')', 'V'),
  ('schueler', 'Sicherung anlegen', 'select snapshot_jetzt()', 'V'),
  ('schueler', 'Kostenanfrage entscheiden', 'select kostenanfrage_entscheiden(''00000000-0000-4000-8000-000000000000''::uuid, true, ''x'', current_date)', 'V'),
  ('schueler', 'Fremden Anzeigenamen ändern', 'update public_profiles set anzeigename=''Hacker'' where user_id <> auth.uid()', 'V'),
  ('schueler', 'Event an alle anlegen', 'insert into events(type,title,body,audience,created_by) values (''info'',''x'',''x'',''all'',auth.uid())', 'V'),
  ('schueler', 'Termin anlegen', 'insert into termine(titel,beschreibung,ort,datum,sichtbar,fuer_eltern,created_by) values (''x'','''','''',current_date,''alle'',false,auth.uid())', 'V'),
  ('schueler', 'Push-Abo für anderen anlegen', 'insert into push_subscriptions(user_id,endpoint,subscription) values (''{UID_ADMIN}'',''https://x.test/1'',''{}'')', 'V'),
  ('eltern', 'Eigene Rolle auf admin', 'update profiles set role=''admin'' where user_id=auth.uid()', 'V'),
  ('eltern', 'Sich selbst OP machen', 'update profiles set is_op=true where user_id=auth.uid()', 'V'),
  ('eltern', 'Recht perms.manage an sich', 'insert into user_permissions(user_id,perm,allowed) values (auth.uid(),''perms.manage'',true)', 'V'),
  ('eltern', 'Rollenrecht schueler: perms.manage', 'insert into role_permissions(role,perm,allowed) values (''schueler'',''perms.manage'',true) on conflict (role,perm) do update set allowed=true', 'V'),
  ('eltern', 'Eigenen Beitrag auf bezahlt', 'update students set terms = jsonb_set(terms,''{Q1.1,status}'',''"bezahlt"'') where id=''{S_EIGEN}''', 'V'),
  ('eltern', 'Fremden Beitrag ändern', 'update students set terms = jsonb_set(terms,''{Q1.1,status}'',''"bezahlt"'') where id=''{S_FREMD}''', 'V'),
  ('eltern', 'Person löschen', 'delete from students where id=''{S_FREMD}''', 'V'),
  ('eltern', 'Kassenbuchung anlegen', 'insert into kasse_buchungen(datum,cent,quelle,titel) values (current_date, 100000, ''spende'', ''Test'')', 'V'),
  ('eltern', 'Protokoll löschen', 'delete from audit_log where true', 'V'),
  ('eltern', 'Protokoll fälschen', 'insert into audit_log(aktion,bereich,klartext) values (''x'',''x'',''x'')', 'V'),
  ('eltern', 'IBAN ändern', 'update bank_konto set iban=''DE00TEST'' where true', 'V'),
  ('eltern', 'Kind an sich hängen', 'insert into parent_children(user_id,student_id) values (auth.uid(),''{S_FREMD}'')', 'V'),
  ('eltern', 'Eltern-Info schreiben', 'insert into eltern_infos(titel,text,angeheftet,autor) values (''x'',''x'',false,auth.uid())', 'V'),
  ('eltern', 'Komitee-Chat anlegen', 'insert into topics(title,tag,visibility,kind,created_by) values (''X'',''xtest'',''komitee'',''chat'',auth.uid())', 'V'),
  ('eltern', 'In fremden Komitee-Chat schreiben', 'insert into topic_items(topic_id,type,body,author,created_by) values (''{CHAT_FREMD}'',''nachricht'',''x'',''x'',auth.uid())', 'V'),
  ('eltern', 'Selbst in den Aufsichtsrat', 'insert into tag_members(tag,user_id) values (''aufsichtsrat'',auth.uid())', 'V'),
  ('eltern', 'Selbst Komitee-Vorsitz', 'insert into komitee_vorsitz(tag,user_id) values (''abiball'',auth.uid())', 'V'),
  ('eltern', 'Halbjahr umstellen', 'update app_settings set aktuelles_halbjahr=''Q2.2'' where true', 'V'),
  ('eltern', 'Sicherung zurückspielen', 'select snapshot_zuruecksetzen(''{SNAP}'')', 'V'),
  ('eltern', 'Sicherung anlegen', 'select snapshot_jetzt()', 'V'),
  ('eltern', 'Kostenanfrage entscheiden', 'select kostenanfrage_entscheiden(''00000000-0000-4000-8000-000000000000''::uuid, true, ''x'', current_date)', 'V'),
  ('eltern', 'Fremden Anzeigenamen ändern', 'update public_profiles set anzeigename=''Hacker'' where user_id <> auth.uid()', 'V'),
  ('eltern', 'Event an alle anlegen', 'insert into events(type,title,body,audience,created_by) values (''info'',''x'',''x'',''all'',auth.uid())', 'V'),
  ('eltern', 'Termin anlegen', 'insert into termine(titel,beschreibung,ort,datum,sichtbar,fuer_eltern,created_by) values (''x'','''','''',current_date,''alle'',false,auth.uid())', 'V'),
  ('eltern', 'Push-Abo für anderen anlegen', 'insert into push_subscriptions(user_id,endpoint,subscription) values (''{UID_ADMIN}'',''https://x.test/1'',''{}'')', 'V'),
  ('anon', 'Eigene Rolle auf admin', 'update profiles set role=''admin'' where user_id=auth.uid()', 'V'),
  ('anon', 'Sich selbst OP machen', 'update profiles set is_op=true where user_id=auth.uid()', 'V'),
  ('anon', 'Recht perms.manage an sich', 'insert into user_permissions(user_id,perm,allowed) values (auth.uid(),''perms.manage'',true)', 'V'),
  ('anon', 'Rollenrecht schueler: perms.manage', 'insert into role_permissions(role,perm,allowed) values (''schueler'',''perms.manage'',true) on conflict (role,perm) do update set allowed=true', 'V'),
  ('anon', 'Eigenen Beitrag auf bezahlt', 'update students set terms = jsonb_set(terms,''{Q1.1,status}'',''"bezahlt"'') where id=''{S_EIGEN}''', 'V'),
  ('anon', 'Fremden Beitrag ändern', 'update students set terms = jsonb_set(terms,''{Q1.1,status}'',''"bezahlt"'') where id=''{S_FREMD}''', 'V'),
  ('anon', 'Person löschen', 'delete from students where id=''{S_FREMD}''', 'V'),
  ('anon', 'Kassenbuchung anlegen', 'insert into kasse_buchungen(datum,cent,quelle,titel) values (current_date, 100000, ''spende'', ''Test'')', 'V'),
  ('anon', 'Protokoll löschen', 'delete from audit_log where true', 'V'),
  ('anon', 'Protokoll fälschen', 'insert into audit_log(aktion,bereich,klartext) values (''x'',''x'',''x'')', 'V'),
  ('anon', 'IBAN ändern', 'update bank_konto set iban=''DE00TEST'' where true', 'V'),
  ('anon', 'Kind an sich hängen', 'insert into parent_children(user_id,student_id) values (auth.uid(),''{S_FREMD}'')', 'V'),
  ('anon', 'Eltern-Info schreiben', 'insert into eltern_infos(titel,text,angeheftet,autor) values (''x'',''x'',false,auth.uid())', 'V'),
  ('anon', 'Komitee-Chat anlegen', 'insert into topics(title,tag,visibility,kind,created_by) values (''X'',''xtest'',''komitee'',''chat'',auth.uid())', 'V'),
  ('anon', 'In fremden Komitee-Chat schreiben', 'insert into topic_items(topic_id,type,body,author,created_by) values (''{CHAT_FREMD}'',''nachricht'',''x'',''x'',auth.uid())', 'V'),
  ('anon', 'Selbst in den Aufsichtsrat', 'insert into tag_members(tag,user_id) values (''aufsichtsrat'',auth.uid())', 'V'),
  ('anon', 'Selbst Komitee-Vorsitz', 'insert into komitee_vorsitz(tag,user_id) values (''abiball'',auth.uid())', 'V'),
  ('anon', 'Halbjahr umstellen', 'update app_settings set aktuelles_halbjahr=''Q2.2'' where true', 'V'),
  ('anon', 'Sicherung zurückspielen', 'select snapshot_zuruecksetzen(''{SNAP}'')', 'V'),
  ('anon', 'Sicherung anlegen', 'select snapshot_jetzt()', 'V'),
  ('anon', 'Kostenanfrage entscheiden', 'select kostenanfrage_entscheiden(''00000000-0000-4000-8000-000000000000''::uuid, true, ''x'', current_date)', 'V'),
  ('anon', 'Fremden Anzeigenamen ändern', 'update public_profiles set anzeigename=''Hacker'' where user_id <> auth.uid()', 'V'),
  ('anon', 'Event an alle anlegen', 'insert into events(type,title,body,audience,created_by) values (''info'',''x'',''x'',''all'',auth.uid())', 'V'),
  ('anon', 'Termin anlegen', 'insert into termine(titel,beschreibung,ort,datum,sichtbar,fuer_eltern,created_by) values (''x'','''','''',current_date,''alle'',false,auth.uid())', 'V'),
  ('anon', 'Push-Abo für anderen anlegen', 'insert into push_subscriptions(user_id,endpoint,subscription) values (''{UID_ADMIN}'',''https://x.test/1'',''{}'')', 'V'),
  ('schueler', 'Frage ans Team (Ticket)', 'insert into topics(title,tag,visibility,kind,created_by) values (''Frage'','''',''stufenteam'',''ticket'',auth.uid())', 'E'),
  ('schueler', 'Selbst in wählbares Komitee', 'insert into tag_members(tag,user_id) values (''abiball'',auth.uid())', 'E'),
  ('s_komitee', 'Frage ans Team (Ticket)', 'insert into topics(title,tag,visibility,kind,created_by) values (''Frage'','''',''stufenteam'',''ticket'',auth.uid())', 'E'),
  ('s_komitee', 'Zweites Komitee selbst', 'insert into tag_members(tag,user_id) values (''abiball'',auth.uid())', 'V'),
  ('s_komitee', 'In eigenen Komitee-Chat schreiben', 'insert into topic_items(topic_id,type,body,author,created_by) values (''{CHAT_EIGEN}'',''nachricht'',''x'',''x'',auth.uid())', 'E'),
  ('eltern', 'Anfrage ans Team (eigene)', 'insert into eltern_tickets(user_id,betreff) values (auth.uid(),''Test'')', 'E'),
  ('eltern', 'Anfrage im Namen anderer', 'insert into eltern_tickets(user_id,betreff) values (''{UID_SCHUELER}'',''Test'')', 'V'),
  ('eltern', 'Selbst in Komitee', 'insert into tag_members(tag,user_id) values (''abiball'',auth.uid())', 'V'),
  ('eltern', 'Beitrag des eigenen Kindes ändern', 'update students set terms = jsonb_set(terms,''{Q1.1,status}'',''"bezahlt"'') where id=''{KIND}''', 'V'),
  ('schueler', 'Finanzen Standard-Ansicht abrufen', 'select finanz_uebersicht()', 'E'),
  ('schueler', 'Einzelbuchungen im Kassenbuch lesen', 'select 1 from kasse_buchungen limit 1', 'V'),
  ('eltern', 'Finanzen Standard-Ansicht abrufen', 'select finanz_uebersicht()', 'E'),
  ('eltern', 'Einzelbuchungen im Kassenbuch lesen', 'select 1 from kasse_buchungen limit 1', 'V'),
  ('anon', 'Finanzen Standard-Ansicht abrufen', 'select finanz_uebersicht()', 'V'),
  ('stufenteam', 'Jemanden zum Admin machen', 'update profiles set role=''admin'' where user_id=''{UID_SCHUELER}''', 'V'),
  ('stufenteam', 'Kind zuordnen', 'insert into parent_children(user_id,student_id) values (''{UID_ELTERN}'',''{S_FREMD}'')', 'V'),
  ('stufenteam', 'Protokoll lesen', 'select 1 from audit_log limit 1', 'V'),
  ('stufenteam', 'Automatische Buchung löschen', 'delete from kasse_buchungen where id=''{AUTO}''', 'V'),
  ('stufenteam', 'Sicherung zurückspielen', 'select snapshot_zuruecksetzen(''{SNAP}'')', 'V'),
  ('stufenteam', 'Eltern-Info schreiben', 'insert into eltern_infos(titel,text,angeheftet,autor) values (''x'',''x'',false,auth.uid())', 'E'),
  ('kassenwart', 'Jemanden zum Admin machen', 'update profiles set role=''admin'' where user_id=''{UID_SCHUELER}''', 'V'),
  ('kassenwart', 'Kind zuordnen', 'insert into parent_children(user_id,student_id) values (''{UID_ELTERN}'',''{S_FREMD}'')', 'V'),
  ('kassenwart', 'Protokoll lesen', 'select 1 from audit_log limit 1', 'V'),
  ('kassenwart', 'Automatische Buchung löschen', 'delete from kasse_buchungen where id=''{AUTO}''', 'V'),
  ('kassenwart', 'Sicherung zurückspielen', 'select snapshot_zuruecksetzen(''{SNAP}'')', 'V'),
  ('kassenwart', 'Eltern-Info schreiben', 'insert into eltern_infos(titel,text,angeheftet,autor) values (''x'',''x'',false,auth.uid())', 'E'),
  ('stufenteam', 'Event an alle anlegen', 'insert into events(type,title,body,audience,created_by) values (''info'',''x'',''x'',''all'',auth.uid())', 'E'),
  ('kassenwart', 'Event an alle anlegen', 'insert into events(type,title,body,audience,created_by) values (''info'',''x'',''x'',''all'',auth.uid())', 'E'),
  ('stufenteam', 'Rote Warnung senden', 'insert into events(type,title,body,audience,is_warning,created_by) values (''nachricht'',''x'',''x'',''all'',true,auth.uid())', 'V'),
  ('kassenwart', 'Rote Warnung senden', 'insert into events(type,title,body,audience,is_warning,created_by) values (''nachricht'',''x'',''x'',''all'',true,auth.uid())', 'E'),
  ('stufenteam', 'IBAN ändern', 'update bank_konto set iban=iban where true', 'V'),
  ('kassenwart', 'IBAN ändern', 'update bank_konto set iban=iban where true', 'E'),
  ('kassenwart', 'Beitrag eintragen', 'update students set terms = jsonb_set(terms,''{Q1.1,status}'',''"bezahlt"'') where id=''{S_FREMD}''', 'E'),
  ('kassenwart', 'Automatische Buchung fälschen', 'insert into kasse_buchungen(datum,cent,quelle,titel,automatisch) values (current_date, 2500, ''beitrag'', ''Fake'', true)', '?'),
  ('admin', 'Kind zuordnen', 'insert into parent_children(user_id,student_id) values (''{UID_ELTERN}'',''{S_FREMD}'')', 'E'),
  ('admin', 'Automatische Buchung löschen', 'delete from kasse_buchungen where id=''{AUTO}''', 'V'),
  ('admin', 'Protokoll löschen', 'delete from audit_log where true', 'V'),
  ('admin', 'Protokoll ändern', 'update audit_log set klartext=''x'' where true', 'V'),
  ('admin', 'Protokoll lesen', 'select 1 from audit_log limit 1', 'E'),
  ('admin', 'Rolle vergeben', 'update profiles set role=''stufenteam'' where user_id=''{UID_SCHUELER}''', 'E'),
  ('schueler', 'Schicht-Punkte selbst vergeben', 'select schicht_abschliessen(''00000000-0000-4000-8000-000000000000''::uuid, true)', 'V'),
  ('schueler', 'Jemanden im Chat sperren', 'select chat_sperren(''{UID_ADMIN}''::uuid, now() + interval ''1 hour'', false, null)', 'V'),
  ('eltern', 'Schicht-Punkte selbst vergeben', 'select schicht_abschliessen(''00000000-0000-4000-8000-000000000000''::uuid, true)', 'V'),
  ('eltern', 'Jemanden im Chat sperren', 'select chat_sperren(''{UID_ADMIN}''::uuid, now() + interval ''1 hour'', false, null)', 'V'),
  ('anon', 'Schicht-Punkte selbst vergeben', 'select schicht_abschliessen(''00000000-0000-4000-8000-000000000000''::uuid, true)', 'V'),
  ('anon', 'Jemanden im Chat sperren', 'select chat_sperren(''{UID_ADMIN}''::uuid, now() + interval ''1 hour'', false, null)', 'V'),
  ('stufenteam', 'Geschütztes OP-Konto sperren', 'select chat_sperren(op_user(), null, true, null)', 'V'),
  ('admin', 'Geschütztes OP-Konto sperren', 'select chat_sperren(op_user(), null, true, null)', 'V'),
  ('s_komitee', 'Sperr-Zeile im Chat fälschen', 'insert into topic_items(topic_id,type,body,author,created_by) values (''{CHAT_EIGEN}'',''system'',''x wurde gesperrt'','''',auth.uid())', 'V'),
  ('s_komitee', 'Fremde Nachricht umschreiben', 'update topic_items set body=''x'' where topic_id=''{CHAT_EIGEN}'' and created_by is distinct from auth.uid() and type <> ''todo''', 'V'),
  -- Mithilfe: der Urheber steht fest (mithilfe-nachvollziehen.sql). "erlaubt" hieße: gefälschter Name bleibt stehen.
  ('stufenteam', 'Mithilfe unter fremdem Namen eintragen', 'with x as (insert into contributions(student_id,titel,punkte,created_by) values (''{S_FREMD}'',''x'',5,''{UID_ADMIN}'') returning created_by) select 1 from x where created_by = ''{UID_ADMIN}''', 'V'),
  ('stufenteam', 'Punkte für laufende Schicht vergeben', 'select schicht_abschliessen(''{SCHICHT_OFFEN}''::uuid, true)', 'V');

create temp table erg (rolle text, fall text, erwartet text, ergebnis text, detail text) on commit drop;
grant insert, select on erg to authenticated, anon;

do $$
declare c record; t record; n bigint; res text; det text; uid uuid; stmt text;
begin
  select * into t from tp;
  for c in select * from faelle loop
    res := null; det := null;
    uid := case c.rolle when 'admin' then t.uid_admin when 'kassenwart' then t.uid_kassenwart
                        when 'stufenteam' then t.uid_stufenteam when 'schueler' then t.uid_schueler
                        when 's_komitee' then t.uid_s_komitee when 'eltern' then t.uid_eltern end;
    stmt := replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(c.sql,
              '{S_EIGEN}', coalesce(t.s_eigen::text, '')), '{S_FREMD}', coalesce(t.s_fremd::text, '')),
              '{KIND}', coalesce(t.kind::text, '')), '{CHAT_FREMD}', coalesce(t.chat_fremd::text, '')),
              '{CHAT_EIGEN}', coalesce(t.chat_eigen::text, '')), '{AUTO}', coalesce(t.auto::text, '')),
              '{SNAP}', coalesce(t.snap::text, '')), '{UID_ADMIN}', coalesce(t.uid_admin::text, '')),
              '{UID_SCHUELER}', coalesce(t.uid_schueler::text, '')), '{UID_ELTERN}', coalesce(t.uid_eltern::text, ''));
    stmt := replace(stmt, '{SCHICHT_OFFEN}', coalesce(t.schicht_offen::text, ''));
    if (c.rolle <> 'anon' and uid is null)
       or (c.sql like '%{S_EIGEN}%' and t.s_eigen is null) or (c.sql like '%{S_FREMD}%' and t.s_fremd is null)
       or (c.sql like '%{KIND}%' and t.kind is null) or (c.sql like '%{CHAT_FREMD}%' and t.chat_fremd is null)
       or (c.sql like '%{CHAT_EIGEN}%' and t.chat_eigen is null) or (c.sql like '%{AUTO}%' and t.auto is null)
       or (c.sql like '%{SNAP}%' and t.snap is null) or (c.sql like '%{UID_ADMIN}%' and t.uid_admin is null)
       or (c.sql like '%{UID_SCHUELER}%' and t.uid_schueler is null) or (c.sql like '%{UID_ELTERN}%' and t.uid_eltern is null)
       or (c.sql like '%{SCHICHT_OFFEN}%' and t.schicht_offen is null) then
      insert into erg values (c.rolle, c.fall, c.erwartet, 'übersprungen', 'keine passende Testperson/Testdaten');
      continue;
    end if;
    begin
      if c.rolle = 'anon' then
        perform set_config('request.jwt.claims', '{"role":"anon"}', true);
        set local role anon;
      else
        perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
        set local role authenticated;
      end if;
      execute stmt;
      get diagnostics n = row_count;
      res := case when n > 0 then 'erlaubt' else 'verboten' end;
      det := 'Zeilen: ' || n;
      raise exception '__zurueck__';
    exception when others then
      if sqlerrm <> '__zurueck__' then
        res := case
                 -- abgelehnt von Zugriffsregel, fehlendem Recht oder Prüf-Trigger
                 when sqlstate in ('42501', 'P0001') then 'verboten'
                 -- die Zugriffsregel hat DURCHGELASSEN, erst die Daten passten nicht
                 -- (doppelt, Verweis fehlt, Pflichtfeld, Prüfbedingung)
                 when sqlstate in ('23505', '23503', '23502', '23514') then 'erlaubt'
                 -- alles andere (Tippfehler, Spalte fehlt …): Test selbst prüfen
                 else 'unklar' end;
        det := sqlstate || ': ' || left(sqlerrm, 100);
      end if;
    end;
    reset role;
    insert into erg values (c.rolle, c.fall, c.erwartet, res, det);
  end loop;
end $$;

with b as (
  select *, case when ergebnis = 'übersprungen' then 'übersprungen'
                 when ergebnis = 'unklar' then '?? TEST PRÜFEN'
                 when erwartet = '?' then 'info'
                 when (erwartet = 'V' and ergebnis = 'verboten') or (erwartet = 'E' and ergebnis = 'erlaubt') then 'ok'
                 else '!! ABWEICHUNG' end as bewertung
    from erg)
select 'SUMME' as rolle,
       count(*) filter (where bewertung = 'ok') || ' ok / ' || count(*) filter (where bewertung like '!!%') || ' Abweichungen / '
       || count(*) filter (where bewertung like '??%') || ' unklar / '
       || count(*) filter (where bewertung = 'info') || ' Hinweise / ' || count(*) filter (where bewertung = 'übersprungen') || ' übersprungen' as fall,
       '' as erwartet, '' as ergebnis, '' as bewertung, '' as detail
  from b
union all
select rolle, fall, erwartet, ergebnis, bewertung, detail from b where bewertung <> 'ok';
