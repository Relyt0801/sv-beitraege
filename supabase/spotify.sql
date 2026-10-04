-- Spotify im Steckbrief (Funktion "spotify", Profil → Funktionen)
--
-- Die Edge Function spotify-info holt zu einem Spotify-Link Titel, Künstler,
-- Cover und die 30-Sekunden-Hörprobe – serverseitig, damit beim Ansehen eines
-- Steckbriefs nichts an Spotify geht. Das Cover wird als Bild-Daten
-- gespeichert; erst beim Abspielen lädt das Handy die Hörprobe von Spotify.
-- Nur die Edge Function (service_role) liest und schreibt diese Tabelle.

set lock_timeout = '5s';

create table if not exists public.spotify_titel (
  schluessel text primary key check (schluessel ~ '^(track|album|playlist|episode):[A-Za-z0-9]{10,40}$'),
  titel text not null default '',
  kuenstler text not null default '',
  cover text not null default '',
  vorschau text not null default '',
  geholt timestamptz not null default now()
);
alter table public.spotify_titel enable row level security;
-- keine Policies: nur service_role

create or replace function public.funktion_setzen(p_name text, p_an boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare neu jsonb;
begin
  if not public.has_perm('funktionen.verwalten') then raise exception 'Keine Berechtigung'; end if;
  if p_name not in ('abiball', 'album', 'zitate', 'umfragen', 'rankings', 'spotify') then raise exception 'Unbekannte Funktion'; end if;
  update public.app_settings set funktionen = coalesce(funktionen, '{}'::jsonb) || jsonb_build_object(p_name, p_an)
   where id = 1 returning funktionen into neu;
  return neu;
end $$;

-- Nutzen dürfen standardmäßig alle Schüler und das Team; ob es überhaupt
-- sichtbar ist, entscheidet der Funktionen-Schalter. (Verwalten bleibt Admin.)
insert into public.role_permissions(role, perm, allowed)
select r, p, true from unnest(array['schueler','sprecher','stv_sprecher','stufenteam','kassenwart']) r,
  unnest(array['album.nutzen','zitate.nutzen','rankings.nutzen']) p
on conflict (role, perm) do update set allowed = true;
