-- Lehrerliste, Abi-Rankings (Schüler/Lehrer) und Rankings in Pop-up-Umfragen
--
-- Rechte (neu, Standard nur Admin):
--   rankings.nutzen     abstimmen, Top 3 sehen
--   rankings.verwalten  Ranking-Kategorien anlegen/ändern/löschen
--   lehrer.verwalten    Lehrerliste pflegen (für Lehrer-Rankings und Zitate)
-- Funktion (Profil → Funktionen): "rankings"
--
-- Stimmen sind geheim: jede Person sieht nur die eigene; die Top 3 kommen
-- gezählt aus ranking_stand(). Keine personenbezogenen Daten in dieser Datei.

set lock_timeout = '5s';

-- ------------------------------------------------------------ Lehrerliste
create table if not exists public.lehrer (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  faecher text not null default '' check (char_length(faecher) <= 60),
  aktiv boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.lehrer enable row level security;
create policy "lehrer lesen" on public.lehrer for select to authenticated
  using ((select has_consented()) and not (select ist_eltern()));
create policy "lehrer pflegen" on public.lehrer for all to authenticated
  using ((select has_perm('lehrer.verwalten'))) with check ((select has_perm('lehrer.verwalten')));

-- Namen der Stufe für Auswahllisten (Mitschüler dürfen students nicht lesen)
create or replace function public.stufe_personen()
returns table (id uuid, vorname text, nachname text)
language sql stable security definer set search_path = public as $$
  select s.id, s.vorname, s.nachname from public.students s
   where public.has_consented() and not public.ist_eltern()
     and (public.has_perm('rankings.nutzen') or public.has_perm('rankings.verwalten')
          or public.has_perm('zitate.nutzen') or public.has_perm('zitate.pruefen')
          or public.has_perm('album.nutzen'))
   order by s.vorname, s.nachname
$$;
revoke all on function public.stufe_personen() from public, anon;
grant execute on function public.stufe_personen() to authenticated;

-- ------------------------------------------------------------ Rankings
create table if not exists public.ranking_kategorien (
  id uuid primary key default gen_random_uuid(),
  titel text not null check (char_length(btrim(titel)) between 1 and 120),
  art text not null default 'schueler' check (art in ('schueler', 'lehrer')),
  sort int not null default 0,
  aktiv boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.ranking_kategorien enable row level security;
create policy "ranking kat lesen" on public.ranking_kategorien for select to authenticated
  using (not (select ist_eltern()) and (select has_perm('rankings.nutzen') or has_perm('rankings.verwalten')));
create policy "ranking kat pflegen" on public.ranking_kategorien for all to authenticated
  using ((select has_perm('rankings.verwalten'))) with check ((select has_perm('rankings.verwalten')));

-- ziel = Person (students.id) oder Lehrer (lehrer.id); null = „weiß nicht“
create table if not exists public.ranking_stimmen (
  kategorie_id uuid not null references public.ranking_kategorien(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  ziel uuid,
  updated_at timestamptz not null default now(),
  primary key (kategorie_id, user_id)
);
alter table public.ranking_stimmen enable row level security;

create or replace function public.ranking_stimme_pruefen()
returns trigger language plpgsql security definer set search_path = public as $$
declare a text;
begin
  new.user_id := auth.uid();
  new.updated_at := now();
  select art into a from public.ranking_kategorien where id = new.kategorie_id and aktiv;
  if a is null then raise exception 'Unbekanntes Ranking'; end if;
  if new.ziel is not null then
    if a = 'schueler' and not exists (select 1 from public.students where id = new.ziel) then raise exception 'Unbekannte Person'; end if;
    if a = 'lehrer' and not exists (select 1 from public.lehrer where id = new.ziel and aktiv) then raise exception 'Unbekannte Lehrkraft'; end if;
  end if;
  return new;
end $$;
revoke all on function public.ranking_stimme_pruefen() from public, anon, authenticated;
create trigger ranking_stimme_pruefen before insert or update on public.ranking_stimmen
  for each row execute function public.ranking_stimme_pruefen();

create policy "ranking stimme lesen" on public.ranking_stimmen for select to authenticated
  using (user_id = (select auth.uid()));
create policy "ranking stimme abgeben" on public.ranking_stimmen for insert to authenticated
  with check (user_id = (select auth.uid()) and (select has_perm('rankings.nutzen')) and not (select ist_eltern())
              and (select funktion_an('rankings') or has_perm('funktionen.verwalten')));
create policy "ranking stimme aendern" on public.ranking_stimmen for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select has_perm('rankings.nutzen'))
              and (select funktion_an('rankings') or has_perm('funktionen.verwalten')));

-- Stand: je Kategorie die Top 3 (gezählt, ohne wer wen gewählt hat)
create or replace function public.ranking_stand()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not (public.has_perm('rankings.nutzen') or public.has_perm('rankings.verwalten')) or public.ist_eltern()
    then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
      'kategorie_id', k.id,
      'stimmen', (select count(*) from public.ranking_stimmen s where s.kategorie_id = k.id and s.ziel is not null),
      'top', coalesce((
        select jsonb_agg(jsonb_build_object('ziel', t.ziel, 'n', t.n) order by t.n desc)
          from (select s.ziel, count(*) n from public.ranking_stimmen s
                 where s.kategorie_id = k.id and s.ziel is not null
                 group by s.ziel order by count(*) desc limit 3) t), '[]'::jsonb)))
      from public.ranking_kategorien k), '[]'::jsonb) end
$$;
revoke all on function public.ranking_stand() from public, anon;
grant execute on function public.ranking_stand() to authenticated;

-- ------------------------------------------------------------ Umfragen: Rankings ausfüllen lassen
alter table public.umfragen add column if not exists mit_rankings boolean not null default false;

-- ------------------------------------------------------------ Funktion "rankings"
create or replace function public.funktion_setzen(p_name text, p_an boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare neu jsonb;
begin
  if not public.has_perm('funktionen.verwalten') then raise exception 'Keine Berechtigung'; end if;
  if p_name not in ('abiball', 'album', 'zitate', 'umfragen', 'rankings') then raise exception 'Unbekannte Funktion'; end if;
  update public.app_settings set funktionen = coalesce(funktionen, '{}'::jsonb) || jsonb_build_object(p_name, p_an)
   where id = 1 returning funktionen into neu;
  return neu;
end $$;

alter publication supabase_realtime add table public.lehrer, public.ranking_kategorien;
