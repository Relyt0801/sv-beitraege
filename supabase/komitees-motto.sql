-- ============================================================================
-- Komitee-Rechte, Abimotto, Sperre überall
--
--  1. komitee_rechte: Rechte für ganze Komitees (z. B. Abizeitung prüft Zitate
--     und verwaltet Rankings, Motto & Pullis verwaltet das Abimotto). Der Admin
--     verteilt sie unter Rollen & Rechte → Rechte → Komitee-Rechte.
--     has_perm(): persönliche Ausnahme > Komitee-Recht > Rolle.
--  2. Abimotto: Vorschläge, 👍 (beliebig viele) und 🔥 (eine je Person = dein
--     Favorit). Funktion „motto“ (Profil → Funktionen).
--  3. Gesperrt (Chat-Sperre) = nirgends einreichen, kommentieren, liken,
--     abstimmen. Ein Trigger je Tabelle prüft das auf dem Server – auch bei
--     Schreiben über Funktionen (RPCs).
--
-- Ohne DELETE/DROP, damit es auch über das SQL-Werkzeug durchläuft.
-- ============================================================================

-- ------------------------------------------------------------ 1. Komitee-Rechte
create table if not exists public.komitee_rechte (
  tag text not null,
  perm text not null,
  allowed boolean not null default true,
  primary key (tag, perm)
);
alter table public.komitee_rechte enable row level security;

create policy "komitee rechte lesen" on public.komitee_rechte for select to authenticated using (true);
create policy "komitee rechte anlegen" on public.komitee_rechte for insert to authenticated
  with check ((select has_perm('perms.manage')));
create policy "komitee rechte aendern" on public.komitee_rechte for update to authenticated
  using ((select has_perm('perms.manage'))) with check ((select has_perm('perms.manage')));

create or replace function public.has_perm(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.my_role() = 'admin' then true
    when coalesce((select is_op from public.profiles where user_id = auth.uid()), false) then true
    else coalesce(
      (select allowed from public.user_permissions where user_id = auth.uid() and perm = p),
      case when exists (
        select 1 from public.komitee_rechte k
          join public.tag_members g on g.tag = k.tag
         where g.user_id = auth.uid() and k.perm = p and k.allowed
      ) then true end,
      (select allowed from public.role_permissions where role = public.my_role() and perm = p),
      false)
  end
$$;

-- Wer ein Recht ausdrücklich hat (Rolle, Komitee oder Ausnahme) – für
-- Benachrichtigungen. Admin/OP zählen nur, wenn sie es selbst so haben
-- (z. B. weil sie im Komitee sind), damit der Admin nicht alles bekommt.
create or replace function public.perm_empfaenger(p text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select pr.user_id from public.profiles pr
   where pr.role <> 'eltern'
     and coalesce(
       (select allowed from public.user_permissions up where up.user_id = pr.user_id and up.perm = p),
       case when exists (
         select 1 from public.komitee_rechte k
           join public.tag_members g on g.tag = k.tag
          where g.user_id = pr.user_id and k.perm = p and k.allowed
       ) then true end,
       (select allowed from public.role_permissions rp where rp.role = pr.role and rp.perm = p),
       false)
$$;
revoke all on function public.perm_empfaenger(text) from public, anon, authenticated;

-- Startwerte: Abizeitung prüft Zitate und verwaltet Rankings + Lehrerliste,
-- Motto & Pullis verwaltet das Abimotto.
insert into public.komitee_rechte (tag, perm, allowed) values
  ('abizeitung', 'zitate.pruefen', true),
  ('abizeitung', 'rankings.verwalten', true),
  ('abizeitung', 'lehrer.verwalten', true),
  ('motto-pullis', 'motto.verwalten', true)
on conflict (tag, perm) do nothing;

-- Abimotto nutzen: alle Schüler und das Team (sichtbar erst mit Funktion an)
insert into public.role_permissions (role, perm, allowed)
select r, 'motto.nutzen', true
  from unnest(array['schueler', 'sprecher', 'stv_sprecher', 'stufenteam', 'kassenwart']) r
on conflict (role, perm) do nothing;

-- Funktion „motto“ schaltbar
create or replace function public.funktion_setzen(p_name text, p_an boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare neu jsonb;
begin
  if not public.has_perm('funktionen.verwalten') then raise exception 'Keine Berechtigung'; end if;
  if p_name not in ('abiball', 'album', 'zitate', 'umfragen', 'rankings', 'spotify', 'motto') then raise exception 'Unbekannte Funktion'; end if;
  update public.app_settings set funktionen = coalesce(funktionen, '{}'::jsonb) || jsonb_build_object(p_name, p_an)
   where id = 1 returning funktionen into neu;
  return neu;
end $$;

-- ------------------------------------------------------------ 2. Abimotto
create table if not exists public.motto_vorschlaege (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(btrim(text)) between 2 and 80),
  erklaerung text not null default '' check (char_length(erklaerung) <= 200),
  von uuid not null default auth.uid(),
  von_name text not null default '',
  created_at timestamptz not null default now(),
  ausgeblendet boolean not null default false,
  gewaehlt boolean not null default false
);
alter table public.motto_vorschlaege enable row level security;

create table if not exists public.motto_stimmen (
  vorschlag_id uuid not null references public.motto_vorschlaege(id),
  user_id uuid not null default auth.uid(),
  art text not null check (art in ('like', 'feuer')),
  an boolean not null default true,
  primary key (vorschlag_id, user_id, art)
);
alter table public.motto_stimmen enable row level security;

create or replace function public.motto_vorbereiten()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.von := auth.uid();
    new.von_name := public.mein_anzeigename();
    new.created_at := now();
    new.ausgeblendet := false;
    new.gewaehlt := false;
  else
    new.von := old.von;
    new.von_name := old.von_name;
    new.created_at := old.created_at;
  end if;
  new.text := btrim(new.text);
  new.erklaerung := btrim(new.erklaerung);
  -- Es gibt nur ein festgelegtes Motto
  if tg_op = 'UPDATE' and new.gewaehlt and not old.gewaehlt then
    update public.motto_vorschlaege set gewaehlt = false where id <> new.id and gewaehlt;
  end if;
  return new;
end $$;
revoke all on function public.motto_vorbereiten() from public, anon, authenticated;
create or replace trigger motto_vorbereiten before insert or update on public.motto_vorschlaege
  for each row execute function public.motto_vorbereiten();

-- 🔥 nur einmal je Person: ein neues 🔥 nimmt das alte zurück
create or replace function public.motto_stimme_vorbereiten()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.user_id := auth.uid(); else new.user_id := old.user_id; end if;
  if new.art = 'feuer' and new.an then
    update public.motto_stimmen set an = false
     where user_id = new.user_id and art = 'feuer' and an and vorschlag_id <> new.vorschlag_id;
  end if;
  return new;
end $$;
revoke all on function public.motto_stimme_vorbereiten() from public, anon, authenticated;
create or replace trigger motto_stimme_vorbereiten before insert or update on public.motto_stimmen
  for each row execute function public.motto_stimme_vorbereiten();

create policy "motto lesen" on public.motto_vorschlaege for select to authenticated
  using ((select has_perm('motto.nutzen') or has_perm('motto.verwalten')) and not (select ist_eltern())
         and (not ausgeblendet or von = (select auth.uid()) or (select has_perm('motto.verwalten'))));
create policy "motto vorschlagen" on public.motto_vorschlaege for insert to authenticated
  with check ((select has_perm('motto.nutzen') or has_perm('motto.verwalten')) and not (select ist_eltern())
              and not (select is_banned()) and (select funktion_an('motto') or has_perm('funktionen.verwalten')));
create policy "motto verwalten" on public.motto_vorschlaege for update to authenticated
  using ((select has_perm('motto.verwalten'))) with check ((select has_perm('motto.verwalten')));

create policy "motto stimmen lesen" on public.motto_stimmen for select to authenticated
  using ((select has_perm('motto.nutzen') or has_perm('motto.verwalten')) and not (select ist_eltern()));
create policy "motto stimme setzen" on public.motto_stimmen for insert to authenticated
  with check (user_id = (select auth.uid()) and (select has_perm('motto.nutzen')) and not (select ist_eltern())
              and (select funktion_an('motto') or has_perm('funktionen.verwalten')));
create policy "motto stimme umschalten" on public.motto_stimmen for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select has_perm('motto.nutzen')));

alter publication supabase_realtime add table public.motto_vorschlaege, public.motto_stimmen;

-- ------------------------------------------------------------ 3. Gesperrt = nichts einreichen
create or replace function public.gesperrt_blocken()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.is_banned() then
    raise exception 'Du bist gerade gesperrt und kannst nichts einreichen, kommentieren oder abstimmen.';
  end if;
  return new;
end $$;
revoke all on function public.gesperrt_blocken() from public, anon, authenticated;

create or replace trigger gesperrt_blocken before insert or update on public.zitate for each row execute function public.gesperrt_blocken();
create or replace trigger gesperrt_blocken before insert or update on public.zitat_stimmen for each row execute function public.gesperrt_blocken();
create or replace trigger gesperrt_blocken before insert or update on public.album_steckbriefe for each row execute function public.gesperrt_blocken();
create or replace trigger gesperrt_blocken before insert or update on public.album_kommentare for each row execute function public.gesperrt_blocken();
create or replace trigger gesperrt_blocken before insert or update on public.album_likes for each row execute function public.gesperrt_blocken();
create or replace trigger gesperrt_blocken before insert or update on public.album_kommentar_likes for each row execute function public.gesperrt_blocken();
create or replace trigger gesperrt_blocken before insert or update on public.ranking_stimmen for each row execute function public.gesperrt_blocken();
create or replace trigger gesperrt_blocken before insert or update on public.umfrage_antworten for each row execute function public.gesperrt_blocken();
create or replace trigger gesperrt_blocken before insert or update on public.umfrage_teilnahme for each row execute function public.gesperrt_blocken();
create or replace trigger gesperrt_blocken before insert or update on public.motto_vorschlaege for each row execute function public.gesperrt_blocken();
create or replace trigger gesperrt_blocken before insert or update on public.motto_stimmen for each row execute function public.gesperrt_blocken();
create or replace trigger gesperrt_blocken before insert on public.mithilfe_nachtraege for each row execute function public.gesperrt_blocken();
create or replace trigger gesperrt_blocken before insert on public.komitee_requests for each row execute function public.gesperrt_blocken();
alter publication supabase_realtime add table public.komitee_rechte;

-- ------------------------------------------------------------ 4. Motto-Phasen
-- Vorschläge (Standard) → Abstimmung, umschalten mit motto.verwalten
-- (Komitee Motto & Pullis). In der Abstimmung reicht nur noch das Komitee ein;
-- vorher kann niemand abstimmen.
alter table public.app_settings add column if not exists motto_abstimmung boolean not null default false;

create or replace function public.motto_abstimmung_an()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select motto_abstimmung from public.app_settings where id = 1), false)
$$;
revoke all on function public.motto_abstimmung_an() from public, anon;
grant execute on function public.motto_abstimmung_an() to authenticated;

create or replace function public.motto_abstimmung_setzen(p_an boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('motto.verwalten') then raise exception 'Keine Berechtigung'; end if;
  update public.app_settings set motto_abstimmung = p_an where id = 1;
  return p_an;
end $$;
revoke all on function public.motto_abstimmung_setzen(boolean) from public, anon;
grant execute on function public.motto_abstimmung_setzen(boolean) to authenticated;

alter policy "motto vorschlagen" on public.motto_vorschlaege
  with check ((select has_perm('motto.nutzen') or has_perm('motto.verwalten')) and not (select ist_eltern())
              and not (select is_banned()) and (select funktion_an('motto') or has_perm('funktionen.verwalten'))
              and (not (select motto_abstimmung_an()) or (select has_perm('motto.verwalten'))));
alter policy "motto stimme setzen" on public.motto_stimmen
  with check (user_id = (select auth.uid()) and (select has_perm('motto.nutzen')) and not (select ist_eltern())
              and (select funktion_an('motto') or has_perm('funktionen.verwalten'))
              and (select motto_abstimmung_an()));
alter policy "motto stimme umschalten" on public.motto_stimmen
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select has_perm('motto.nutzen')) and (select motto_abstimmung_an()));
