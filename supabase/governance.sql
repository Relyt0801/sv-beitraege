-- ============================================================
-- Stufenkasse – Governance: Team sieht alles, Admin kann sperren
-- Nach visibility.sql ausführen. Idempotent.
-- ============================================================

-- Sperre/Timeout: chat_banned_until = null (frei) oder Zeitpunkt (gesperrt bis dahin)
alter table public.profiles add column if not exists chat_banned_until timestamptz;

-- Team/Kassenwart sehen ALLE Ordner (außer admin_only). Admin sieht alles.
create or replace function public.can_access_topic(tid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.has_consented() and exists (
    select 1 from public.topics t where t.id = tid and (
      public.my_role() = 'admin'
      or ( not t.admin_only and (
        public.my_role() in ('stufenteam','kassenwart')   -- Team sieht immer alles
        or t.created_by = auth.uid()
        or ( t.visibility = 'personen'
             and exists (select 1 from public.topic_members m where m.topic_id = t.id and m.user_id = auth.uid()) )
        or ( t.visibility = 'komitee' and t.tag <> ''
             and exists (select 1 from public.tag_members g where g.tag = t.tag and g.user_id = auth.uid()) )
      ))
    )
  )
$$;

-- Ist der aktuelle Nutzer aktuell gesperrt?
create or replace function public.is_banned() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(
    (select chat_banned_until is not null and chat_banned_until > now()
       from public.profiles where user_id = auth.uid()),
    false)
$$;

-- Gesperrte dürfen keine Beiträge posten und nicht abstimmen
drop policy if exists "titems insert" on public.topic_items;
create policy "titems insert" on public.topic_items for insert to authenticated
  with check ( public.can_access_topic(topic_id) and created_by = auth.uid() and not public.is_banned() );

drop policy if exists "tvotes own" on public.topic_votes;
create policy "tvotes own" on public.topic_votes for all to authenticated
  using ( user_id = auth.uid() )
  with check ( user_id = auth.uid() and not public.is_banned() );

-- Guard: nur Admin darf Rolle UND Sperre ändern (Selbst-Entsperren verhindern)
create or replace function public.guard_role_change() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.my_role() <> 'admin' then
    if new.role is distinct from old.role then
      raise exception 'Nur Admin darf Rollen ändern';
    end if;
    if new.chat_banned_until is distinct from old.chat_banned_until then
      raise exception 'Nur Admin darf sperren/entsperren';
    end if;
  end if;
  return new;
end $$;
