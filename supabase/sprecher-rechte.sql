-- Stufensprecher*in und Stv. teilen sich die Rechte
-- Ausführen im Supabase SQL-Editor, NACH sprecher.sql. Mehrfach ausführbar.

-- 1) Einmalig angleichen: Stv. bekommt exakt die Rechte der Sprecher-Rolle
delete from public.role_permissions where role = 'stv_sprecher';
insert into public.role_permissions (role, perm, allowed)
select 'stv_sprecher', perm, allowed from public.role_permissions where role = 'sprecher'
on conflict (role, perm) do update set allowed = excluded.allowed;

-- 2) Dauerhaft gleich halten: jede Änderung an 'sprecher' wird gespiegelt
create or replace function public.sync_sprecher_rechte() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'sprecher' then
      delete from public.role_permissions where role = 'stv_sprecher' and perm = old.perm;
    end if;
    return old;
  end if;
  if new.role = 'sprecher' then
    insert into public.role_permissions (role, perm, allowed)
    values ('stv_sprecher', new.perm, new.allowed)
    on conflict (role, perm) do update set allowed = excluded.allowed;
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_sprecher_rechte on public.role_permissions;
create trigger trg_sync_sprecher_rechte
  after insert or update or delete on public.role_permissions
  for each row execute function public.sync_sprecher_rechte();
