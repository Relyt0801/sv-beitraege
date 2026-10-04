-- Funktionen an/aus (Profil → Funktionen) und Zitatwand
--
-- Funktionen: app_settings.funktionen = {"abiball":true,"album":false,"zitate":false,"umfragen":true}
--   Schaltet ganze Bereiche für alle an/aus. Ändern darf nur, wer das Recht
--   funktionen.verwalten hat (Trigger, weil das Team app_settings sonst
--   direkt schreiben darf). Wer was innerhalb der Funktion darf, bleibt im
--   Rechte-Reiter.
--
-- Zitate: einreichen (zitate.nutzen), prüfen/freigeben (zitate.pruefen),
--   🔥-Stimmen (umschaltbar, kein Löschen über die API). Abgelehnte Zitate
--   werden geleert.
-- Keine personenbezogenen Daten in dieser Datei.

set lock_timeout = '5s';

-- ------------------------------------------------------------ Funktionen
alter table public.app_settings add column if not exists funktionen jsonb not null
  default '{"abiball": true, "album": false, "zitate": false, "umfragen": true}'::jsonb;

create or replace function public.funktionen_schuetzen()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.funktionen is distinct from old.funktionen and not public.has_perm('funktionen.verwalten') then
    raise exception 'Funktionen darf nur ändern, wer das Recht dazu hat';
  end if;
  return new;
end $$;
revoke all on function public.funktionen_schuetzen() from public, anon, authenticated;
create trigger funktionen_schuetzen before update on public.app_settings
  for each row execute function public.funktionen_schuetzen();

create or replace function public.funktion_setzen(p_name text, p_an boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare neu jsonb;
begin
  if not public.has_perm('funktionen.verwalten') then raise exception 'Keine Berechtigung'; end if;
  if p_name not in ('abiball', 'album', 'zitate', 'umfragen') then raise exception 'Unbekannte Funktion'; end if;
  update public.app_settings set funktionen = coalesce(funktionen, '{}'::jsonb) || jsonb_build_object(p_name, p_an)
   where id = 1 returning funktionen into neu;
  return neu;
end $$;
revoke all on function public.funktion_setzen(text, boolean) from public, anon;
grant execute on function public.funktion_setzen(text, boolean) to authenticated;

create or replace function public.funktion_an(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (funktionen ->> p_name)::boolean from public.app_settings where id = 1), false)
$$;
revoke all on function public.funktion_an(text) from public, anon;
grant execute on function public.funktion_an(text) to authenticated;

-- ------------------------------------------------------------ Zitate
create table if not exists public.zitate (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(btrim(text)) between 1 and 300),
  wer text not null check (char_length(btrim(wer)) between 1 and 60),
  art text not null default 'lehrer' check (art in ('lehrer', 'schueler')),
  kontext text not null default '' check (char_length(kontext) <= 60),
  status text not null default 'offen' check (status in ('offen', 'frei', 'abgelehnt')),
  eingereicht_von uuid not null default auth.uid(),
  eingereicht_name text not null default '',
  created_at timestamptz not null default now(),
  geprueft_at timestamptz
);
create index if not exists zitate_status on public.zitate (status, created_at);
alter table public.zitate enable row level security;

create table if not exists public.zitat_stimmen (
  zitat_id uuid not null references public.zitate(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  an boolean not null default true,
  primary key (zitat_id, user_id)
);
alter table public.zitat_stimmen enable row level security;

-- Beim Einreichen: Absender, Name, Status festhalten. Beim Prüfen: nur der
-- Status ändert sich; Abgelehntes wird geleert.
create or replace function public.zitat_vorbereiten()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.eingereicht_von := auth.uid();
    new.eingereicht_name := public.mein_anzeigename();
    new.status := 'offen';
    new.text := btrim(new.text);
    new.wer := btrim(new.wer);
    new.created_at := now();
    new.geprueft_at := null;
  else
    new.eingereicht_von := old.eingereicht_von;
    new.eingereicht_name := old.eingereicht_name;
    new.created_at := old.created_at;
    if new.status is distinct from old.status then new.geprueft_at := now(); end if;
    if new.status = 'abgelehnt' then
      new.text := '–'; new.wer := '–'; new.kontext := '';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.zitat_vorbereiten() from public, anon, authenticated;
create trigger zitat_vorbereiten before insert or update on public.zitate
  for each row execute function public.zitat_vorbereiten();

create policy "zitate lesen" on public.zitate for select to authenticated
  using ((select has_perm('zitate.nutzen') or has_perm('zitate.pruefen')) and not (select ist_eltern())
         and (status = 'frei' or eingereicht_von = (select auth.uid()) or (select has_perm('zitate.pruefen'))));
create policy "zitate einreichen" on public.zitate for insert to authenticated
  with check ((select has_perm('zitate.nutzen')) and not (select ist_eltern()) and not (select is_banned())
              and (select funktion_an('zitate') or has_perm('funktionen.verwalten')));
create policy "zitate pruefen" on public.zitate for update to authenticated
  using ((select has_perm('zitate.pruefen'))) with check ((select has_perm('zitate.pruefen')));

create policy "zitat stimmen lesen" on public.zitat_stimmen for select to authenticated
  using ((select has_perm('zitate.nutzen')) and not (select ist_eltern()));
create policy "zitat stimmen setzen" on public.zitat_stimmen for insert to authenticated
  with check (user_id = (select auth.uid()) and (select has_perm('zitate.nutzen')) and not (select ist_eltern()));
create policy "zitat stimmen umschalten" on public.zitat_stimmen for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select has_perm('zitate.nutzen')));

alter publication supabase_realtime add table public.zitate, public.zitat_stimmen;
