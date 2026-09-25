-- ============================================================
-- Ohne Anmeldung keine Namen: zwei Hilfsfunktionen für Nicht-Angemeldete sperren
--
-- Gefunden im Test vom 24.09.2026: Mit dem öffentlichen Schlüssel der App
-- (steht in jedem Browser) konnte man OHNE Anmeldung
--   rpc/op_user          → die Kennung des Betreiber-Kontos und
--   rpc/audit_name?p=…   → zu jeder Kennung den Namen
-- abfragen. Beide braucht nur das Protokoll bzw. der OP-Schutz intern (diese
-- Trigger laufen mit Besitzerrechten) – die App selbst ruft sie nie auf.
--
-- Die übrigen Funktionen, die der Supabase-Hinweis
-- "anon_security_definer_function_executable" meldet, sind Trigger (lassen
-- sich nicht direkt aufrufen) oder geben nur Auskunft über die anfragende
-- Person selbst – ohne Anmeldung also nichts.
--
-- Mehrfach ausführbar. Einspielen: Supabase → SQL Editor → ganze Datei → Run.
-- ============================================================

revoke execute on function public.op_user() from public, anon;
revoke execute on function public.audit_name(uuid) from public, anon;
grant execute on function public.op_user() to authenticated, service_role;
grant execute on function public.audit_name(uuid) to authenticated, service_role;

-- Selbstprüfung ---------------------------------------------------
select 'op_user ohne Anmeldung gesperrt' as pruefung,
       case when not has_function_privilege('anon', 'public.op_user()', 'execute') then 'ok' else 'FEHLT' end as ergebnis
union all
select 'audit_name ohne Anmeldung gesperrt',
       case when not has_function_privilege('anon', 'public.audit_name(uuid)', 'execute') then 'ok' else 'FEHLT' end
union all
select 'angemeldet weiterhin erlaubt',
       case when has_function_privilege('authenticated', 'public.op_user()', 'execute')
             and has_function_privilege('authenticated', 'public.audit_name(uuid)', 'execute') then 'ok' else 'FEHLT' end;
