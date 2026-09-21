-- ============================================================
-- Stufenkasse – Diese Rollen vergibt nur der Admin
-- Ausführen im Supabase SQL-Editor, NACH permissions.sql. Mehrfach ausführbar.
--
-- Bisher galt die Sperre nur für die beiden Sprecher-Rollen. Jetzt gilt sie
-- auch für admin, kassenwart und eltern: wer roles.manage hat, aber nicht
-- Admin ist, kann diese Rollen weder vergeben noch entziehen.
--
-- Warum am Trigger und nicht nur in der Oberfläche: roles.manage erlaubt ein
-- update auf public.profiles. Ohne diese Prüfung könnte sich jeder, der das
-- Recht bekommt, mit einem einzigen API-Aufruf selbst zum Admin machen – der
-- ausgegraute Eintrag im Auswahlfeld hält davon niemanden ab.
--
-- Heute hat roles.manage ausschliesslich die Rolle admin, und niemand hat es
-- persönlich zugeteilt bekommen. Die Regel ist also ein Sicherheitsnetz für
-- den Tag, an dem jemand das Recht im Rechte-Reiter weitergibt.
--
-- Der Rest der Funktion ist unverändert (OP-Schutz, mod.timeout, student_id).
-- ============================================================

create or replace function public.guard_role_change() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    -- Niemand außer dem OP selbst darf am OP-Konto etwas ändern
    if old.is_op and auth.uid() <> old.user_id then
      raise exception 'Dieses Konto ist geschützt';
    end if;
    -- OP-Status kann nicht vergeben oder entzogen werden
    if new.is_op is distinct from old.is_op then
      raise exception 'Der OP-Status kann nicht geändert werden';
    end if;
    if new.role is distinct from old.role then
      if not public.has_perm('roles.manage') then
        raise exception 'Keine Berechtigung, Rollen zu ändern';
      end if;
      -- Hin zu einer dieser Rollen und weg davon: beides nur als Admin.
      -- Sonst könnte man einen Admin erst herunterstufen und dann ersetzen.
      if (new.role in ('sprecher','stv_sprecher','admin','kassenwart','eltern')
          or old.role in ('sprecher','stv_sprecher','admin','kassenwart','eltern'))
         and public.my_role() <> 'admin' then
        raise exception 'Diese Rolle darf nur der Admin vergeben oder entziehen';
      end if;
    end if;
    if (new.chat_banned_until is distinct from old.chat_banned_until
        or new.chat_ban_permanent is distinct from old.chat_ban_permanent)
       and not public.has_perm('mod.timeout') then
      raise exception 'Keine Berechtigung zum Sperren/Entsperren';
    end if;
    if new.student_id is distinct from old.student_id and not public.has_perm('roles.manage') then
      raise exception 'Keine Berechtigung, die Zuordnung zu ändern';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_role on public.profiles;
create trigger guard_role before update on public.profiles
  for each row execute function public.guard_role_change();

-- Kontrolle: der Trigger haengt und die Funktion kennt die neue Liste.
select tgname,
       (pg_get_functiondef(p.oid) like '%''kassenwart''%') as kennt_kassenwart
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.profiles'::regclass and t.tgname = 'guard_role';
