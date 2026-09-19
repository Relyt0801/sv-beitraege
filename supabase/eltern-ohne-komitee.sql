-- ============================================================
-- Eltern gehören in kein Komitee
-- ============================================================
-- Anlass: Ein Elternzugang stand in "abizeitung" und bekam dadurch die
-- Komitee-Nachrichten als Benachrichtigung – und hätte den Chat auch lesen
-- können. Drei Sicherungen, damit das nicht wieder passiert:

-- 1) Aufräumen
delete from tag_members g using profiles p where p.user_id = g.user_id and p.role = 'eltern';
delete from komitee_vorsitz v using profiles p where p.user_id = v.user_id and p.role = 'eltern';

-- 2) Eltern lassen sich gar nicht erst in ein Komitee eintragen
create or replace function keine_eltern_im_komitee() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if exists (select 1 from profiles where user_id = new.user_id and role = 'eltern') then
    raise exception 'Elternzugänge können keinem Komitee angehören.';
  end if;
  return new;
end;
$$;
drop trigger if exists keine_eltern_tag on tag_members;
create trigger keine_eltern_tag before insert or update on tag_members
  for each row execute function keine_eltern_im_komitee();
drop trigger if exists keine_eltern_vorsitz on komitee_vorsitz;
create trigger keine_eltern_vorsitz before insert or update on komitee_vorsitz
  for each row execute function keine_eltern_im_komitee();

-- Wird ein Konto zum Elternzugang, fliegt es aus allen Komitees
create or replace function eltern_aus_komitees() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if new.role = 'eltern' and old.role is distinct from 'eltern' then
    delete from tag_members where user_id = new.user_id;
    delete from komitee_vorsitz where user_id = new.user_id;
  end if;
  return new;
end;
$$;
drop trigger if exists eltern_raus on profiles;
create trigger eltern_raus after update of role on profiles
  for each row execute function eltern_aus_komitees();

-- 3) Und selbst wenn: Chats bleiben für Eltern zu
create or replace function public.can_access_topic(tid uuid)
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select not public.ist_eltern() and (
    public.topic_core_access(tid)
     or ( public.has_consented() and exists (
            select 1 from public.topics t
             where t.id = tid and not t.admin_only and public.komitee_access(t.tag, 'read') ) ) )
$$;
