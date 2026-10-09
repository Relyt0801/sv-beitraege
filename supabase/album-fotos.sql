-- ============================================================================
-- Steckbrief-Fotos mit Freigabe durch das Stufenteam (09.10.2026)
--
-- Jede Person kann EIN Foto in ihren Steckbrief laden. Andere sehen es erst,
-- wenn genug Leute aus dem Stufenteam zugestimmt haben (Standard 3, im Profil
-- → Freigaben einstellbar, Art „foto“). Ablehnen kann eine Person allein.
-- Der Owner entscheidet allein (zustimmung_allein, owner-entscheidet-allein.sql).
--
-- Speicher: privater Bucket „album-fotos“, Ordner = student_id. Lesen dürfen:
-- die Person selbst, das Stufenteam (zum Prüfen) und – nach der Freigabe –
-- alle mit album.nutzen.
--
-- Jedes neue Hochladen bekommt eine neue id (version) – Zustimmungen zu einem
-- älteren Foto zählen dadurch nicht für das neue.
-- Idempotent.
-- ============================================================================

create table if not exists public.album_fotos (
  student_id uuid primary key references public.students (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  pfad text not null,
  status text not null default 'offen' check (status in ('offen', 'frei', 'abgelehnt', 'entfernt')),
  hochgeladen_von uuid default auth.uid(),
  created_at timestamptz not null default now(),
  geprueft_at timestamptz
);
create unique index if not exists album_fotos_id on public.album_fotos (id);
alter table public.album_fotos enable row level security;

-- Freigabe-Art „foto“ (Stufenteam), Standard 3 Zustimmungen
alter table public.anfrage_zustimmungen drop constraint if exists anfrage_zustimmungen_art_check;
alter table public.anfrage_zustimmungen add constraint anfrage_zustimmungen_art_check
  check (art in ('termin', 'kosten', 'entsperren', 'zitat', 'foto'));
update public.app_settings set bestaetigungen = jsonb_build_object('foto', 3) || coalesce(bestaetigungen, '{}'::jsonb)
 where id = 1 and not (coalesce(bestaetigungen, '{}'::jsonb) ? 'foto');

create or replace function public.zustimmung_recht(p_art text)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_art
    when 'termin' then public.ist_team() or public.has_perm('termine.manage')
    when 'kosten' then public.has_perm('finanzen.manage')
    when 'entsperren' then public.ist_team() or public.has_perm('mod.timeout')
    when 'zitat' then public.has_perm('zitate.pruefen')
    when 'foto' then public.ist_team()
    else false end
$$;

create or replace function public.bestaetigungen_setzen(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  neu jsonb := '{}'::jsonb;
  k text;
begin
  if public.my_role() <> 'admin' and not exists (select 1 from public.profiles where user_id = auth.uid() and is_op) then
    raise exception 'Nur der Admin legt das fest' using errcode = '42501';
  end if;
  foreach k in array array['termin', 'kosten', 'entsperren', 'zitat', 'foto'] loop
    if p ? k then neu := neu || jsonb_build_object(k, greatest(1, least((p ->> k)::int, 10))); end if;
  end loop;
  update public.app_settings set bestaetigungen = coalesce(bestaetigungen, '{}'::jsonb) || neu where id = 1
  returning bestaetigungen into neu;
  perform public.audit_schreiben('freigaben.geaendert', 'rechte', null, 'Freigaben',
    'Nötige Zustimmungen geändert: ' || neu::text, neu);
  return neu;
end $$;

-- Lesen: eigenes Foto, freigegebene (mit album.nutzen), alles fürs Stufenteam
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'album_fotos' and policyname = 'fotos lesen') then
    create policy "fotos lesen" on public.album_fotos for select to authenticated
      using (student_id = (select public.meine_student_id())
             or (select public.ist_team())
             or (status = 'frei' and (select public.has_perm('album.nutzen')) and not (select public.ist_eltern())));
  end if;
end $$;

-- Hochladen gemeldet: neue Version, wartet auf Freigabe
create or replace function public.album_foto_gesetzt(p_pfad text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  sid uuid := public.meine_student_id();
  neu uuid := gen_random_uuid();
begin
  if sid is null or not public.has_perm('album.nutzen') then raise exception 'Keine Berechtigung' using errcode = '42501'; end if;
  if public.is_banned() then raise exception 'Du bist gerade gesperrt und kannst nichts einreichen, kommentieren oder abstimmen.'; end if;
  if split_part(coalesce(p_pfad, ''), '/', 1) <> sid::text then raise exception 'Falscher Ordner'; end if;
  insert into public.album_fotos (student_id, id, pfad, status, hochgeladen_von, created_at, geprueft_at)
  values (sid, neu, p_pfad, 'offen', auth.uid(), now(), null)
  on conflict (student_id) do update
    set id = excluded.id, pfad = excluded.pfad, status = 'offen', hochgeladen_von = excluded.hochgeladen_von,
        created_at = now(), geprueft_at = null;
  return neu;
end $$;
revoke all on function public.album_foto_gesetzt(text) from public, anon;
grant execute on function public.album_foto_gesetzt(text) to authenticated;

-- Eigenes Foto zurückziehen
create or replace function public.album_foto_entfernen()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.album_fotos set status = 'entfernt', geprueft_at = now()
   where student_id = public.meine_student_id();
end $$;
revoke all on function public.album_foto_entfernen() from public, anon;
grant execute on function public.album_foto_entfernen() to authenticated;

-- Stufenteam entscheidet. Freigeben braucht genug Zustimmungen (zustimmen()
-- vorher aufrufen), ablehnen geht sofort.
create or replace function public.album_foto_entscheiden(p_id uuid, p_frei boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  f public.album_fotos;
begin
  if not public.zustimmung_recht('foto') then raise exception 'Keine Berechtigung' using errcode = '42501'; end if;
  select * into f from public.album_fotos where id = p_id for update;
  if not found then raise exception 'Foto nicht gefunden'; end if;
  if f.status <> 'offen' then return f.status; end if;
  if p_frei then perform public.zustimmung_pruefen('foto', p_id); end if;
  update public.album_fotos set status = case when p_frei then 'frei' else 'abgelehnt' end, geprueft_at = now()
   where id = p_id;
  perform public.audit_schreiben(case when p_frei then 'foto.freigegeben' else 'foto.abgelehnt' end, 'album', null, 'Steckbrief-Foto',
    'Steckbrief-Foto ' || case when p_frei then 'freigegeben' else 'abgelehnt' end, jsonb_build_object('id', p_id));
  return case when p_frei then 'frei' else 'abgelehnt' end;
end $$;
revoke all on function public.album_foto_entscheiden(uuid, boolean) from public, anon;
grant execute on function public.album_foto_entscheiden(uuid, boolean) to authenticated;

-- ------------------------------------------------------------ Speicher
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('album-fotos', 'album-fotos', false, 3000000, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = 3000000,
  allowed_mime_types = array['image/jpeg', 'image/webp', 'image/png'];

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'album-fotos hochladen') then
    create policy "album-fotos hochladen" on storage.objects for insert to authenticated
      with check (bucket_id = 'album-fotos' and (storage.foldername(name))[1] = (select public.meine_student_id())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'album-fotos ersetzen') then
    create policy "album-fotos ersetzen" on storage.objects for update to authenticated
      using (bucket_id = 'album-fotos' and (storage.foldername(name))[1] = (select public.meine_student_id())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'album-fotos lesen') then
    create policy "album-fotos lesen" on storage.objects for select to authenticated
      using (bucket_id = 'album-fotos' and (
        (storage.foldername(name))[1] = (select public.meine_student_id())::text
        or (select public.ist_team())
        or exists (select 1 from public.album_fotos f
                    where f.pfad = storage.objects.name and f.status = 'frei'
                      and public.has_perm('album.nutzen') and not public.ist_eltern())));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'album_fotos') then
    alter publication supabase_realtime add table public.album_fotos;
  end if;
end $$;
