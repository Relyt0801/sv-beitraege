-- ============================================================
-- Stufenkasse – Reiter "Beiträge", Ticket-Grundpreis, anpassbare Vorlagen
-- Ausführen NACH prozent-staffel.sql. Mehrfach ausführbar.
-- ============================================================

-- 1) Grundpreis eines Abiballtickets (0 = steht noch nicht fest)
alter table public.app_settings
  add column if not exists ticket_preis integer not null default 0;

-- 2) Vorlagen: Wert beim Eintragen anpassbar (für "je nach Aufwand 3–10 %")
alter table public.contribution_templates
  add column if not exists variabel boolean not null default false;

update public.contribution_templates
   set variabel = true
 where titel = 'Eingebrachte Aktion, die umgesetzt wurde';

-- 3) Neues Recht "beitraege.manage": standardmäßig nur der Admin.
--    Der Admin hat ohnehin alles; die anderen Rollen bekommen es ausdrücklich nicht.
insert into public.role_permissions (role, perm, allowed) values
  ('schueler',     'beitraege.manage', false),
  ('sprecher',     'beitraege.manage', false),
  ('stv_sprecher', 'beitraege.manage', false),
  ('stufenteam',   'beitraege.manage', false),
  ('kassenwart',   'beitraege.manage', false),
  ('admin',        'beitraege.manage', true)
on conflict (role, perm) do nothing;
