-- ============================================================
-- Aktionen merken sich ihre Zeiten (Vorlage für neue Schichten)
-- z. B. "Waffelverkauf 1. große Pause" immer 09:10–09:30.
-- Ohne Vorlage schlägt die App 07:35–16:15 vor. Idempotent.
-- ============================================================
alter table public.aktionen add column if not exists vorlage_von time;
alter table public.aktionen add column if not exists vorlage_bis time;
alter table public.aktionen add column if not exists vorlage_ganztaegig boolean not null default false;
alter table public.aktionen add column if not exists vorlage_ort text not null default '';
alter table public.aktionen add column if not exists vorlage_plaetze integer check (vorlage_plaetze between 1 and 50);

-- Die beiden Waffel-Pausen gleich richtig vorbelegen
update public.aktionen set vorlage_von = '09:10', vorlage_bis = '09:30'
 where titel = 'Waffelverkauf 1. große Pause' and vorlage_von is null;
update public.aktionen set vorlage_von = '11:05', vorlage_bis = '11:20'
 where titel = 'Waffelverkauf 2. große Pause' and vorlage_von is null;
