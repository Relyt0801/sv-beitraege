-- =====================================================================
-- Update bei allen erzwingen (04.10.2026) – eingespielt. Idempotent.
-- Profil → „Update bei allen erzwingen“ (Admin / Rechte verwalten) setzt
-- app_settings.neu_laden_ab; jede offene App, die davor geladen wurde,
-- leert Service Worker + Zwischenspeicher und lädt neu (src/lib/neuladen.ts).
-- =====================================================================
alter table public.app_settings add column if not exists neu_laden_ab timestamptz;

create or replace function public.neu_laden_erzwingen()
returns timestamptz language plpgsql security definer set search_path = public as $$
declare t timestamptz := now();
begin
  if auth.uid() is null or not (public.my_role() = 'admin' or public.has_perm('perms.manage')) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  update public.app_settings set neu_laden_ab = t where id = 1;
  return t;
end $$;
revoke all on function public.neu_laden_erzwingen() from public, anon;
grant execute on function public.neu_laden_erzwingen() to authenticated;
