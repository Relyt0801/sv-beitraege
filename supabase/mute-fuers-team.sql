-- ============================================================
-- Stufenkasse – Stummschalten fürs Team
-- Ausführen im Supabase SQL-Editor, NACH permissions.sql. Mehrfach ausführbar.
--
-- Hintergrund: mod.timeout (Timeout / Chat-Sperre) war in den Seeds von
-- permissions.sql nur beim Admin gesetzt. In der Produktions-Datenbank steht
-- das Recht bei stufenteam, kassenwart und sprecher längst auf true – benutzen
-- ließ es sich trotzdem nicht, weil der Sperr-Knopf allein im Rollen-Reiter
-- saß und der über roles.manage eingeblendet wird. Der Knopf sitzt jetzt an
-- der Nachricht; diese Datei zieht die Rechte nach, wo sie noch fehlen.
--
-- Die Seeds in permissions.sql benutzen "on conflict do nothing" und fassen
-- bestehende Zeilen deshalb nicht an. Hier wird bewusst überschrieben.
-- Rollen- oder Rechte-Reiter gibt das NICHT frei: dafür braucht es weiterhin
-- roles.manage bzw. perms.manage, und die bleiben unangetastet.
-- ============================================================

insert into public.role_permissions (role, perm, allowed) values
  ('stufenteam','mod.timeout',true),
  ('kassenwart','mod.timeout',true)
on conflict (role, perm) do update set allowed = true;

-- Kontrolle: wer darf sperren, wer darf an Rollen und Rechte?
select role,
       coalesce(bool_or(perm = 'mod.timeout'  and allowed), false) as darf_sperren,
       coalesce(bool_or(perm = 'roles.manage' and allowed), false) as rollen_reiter,
       coalesce(bool_or(perm = 'perms.manage' and allowed), false) as rechte_reiter
from public.role_permissions
group by role
order by role;
