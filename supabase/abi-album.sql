-- Abi-Album (Steckbriefe, Kommentare, Likes) und Pop-up-Umfragen
--
-- Rechte (alle neu, Standard: nur Admin – im Rechte-Reiter an Rollen geben):
--   album.nutzen        Steckbrief anlegen, andere ansehen, kommentieren, liken
--   album.kategorien    Stammdaten-Kategorien anlegen/ändern
--   album.moderieren    Kommentare und Texte anderer löschen
--   umfragen.verwalten  Pop-up-Umfragen erstellen, starten, beenden
--   umfragen.ergebnisse Ergebnisse ansehen (auch während sie laufen)
--
-- Grundsätze:
--   * Stammdaten schreibt NUR die Person selbst (RPC album_stammdaten_speichern).
--   * Den freien Text schreibt die Person selbst – oder, wenn sie ihn freigibt
--     (für alle oder gezielt), auch andere. Stammdaten werden nie freigegeben.
--   * Antworten auf Umfragen sieht niemand einzeln; Ergebnisse nur gezählt
--     über umfrage_ergebnis().
-- Keine personenbezogenen Daten in dieser Datei.

set lock_timeout = '5s';

-- ------------------------------------------------------------ Helfer
create or replace function public.meine_student_id()
returns uuid language sql stable security definer set search_path = public as $$
  select student_id from public.profiles where user_id = auth.uid()
$$;

create or replace function public.mein_anzeigename()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.vorname || ' ' || left(s.nachname, 1) || '.'
       from public.profiles p join public.students s on s.id = p.student_id
      where p.user_id = auth.uid()),
    (select case when role = 'admin' then 'Admin' else 'Stufenteam' end from public.profiles where user_id = auth.uid()),
    'Unbekannt')
$$;

-- ------------------------------------------------------------ Kategorien
create table if not exists public.album_kategorien (
  id uuid primary key default gen_random_uuid(),
  titel text not null check (char_length(titel) between 1 and 60),
  platzhalter text not null default '' check (char_length(platzhalter) <= 80),
  sort int not null default 0,
  aktiv boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.album_kategorien enable row level security;
create policy "album kat lesen" on public.album_kategorien for select to authenticated
  using ((select has_consented()) and (select has_perm('album.nutzen') or has_perm('album.kategorien')));
create policy "album kat schreiben" on public.album_kategorien for all to authenticated
  using ((select has_perm('album.kategorien'))) with check ((select has_perm('album.kategorien')));

insert into public.album_kategorien (titel, platzhalter, sort)
select * from (values
  ('Spitzname', 'Wie nennen dich alle?', 1),
  ('Nach dem Abi', 'Studium, Ausbildung, Reisen …', 2),
  ('Lieblingslied', 'Titel – Interpret', 3),
  ('Lieblingsfach', 'Und warum?', 4),
  ('Lebensmotto', 'Ein Satz', 5),
  ('Werde ich vermissen', 'An der Schule …', 6)
) v(t, p, s)
where not exists (select 1 from public.album_kategorien);

-- ------------------------------------------------------------ Steckbriefe
create table if not exists public.album_steckbriefe (
  student_id uuid primary key references public.students(id) on delete cascade,
  stammdaten jsonb not null default '{}'::jsonb,
  text text not null default '' check (char_length(text) <= 3000),
  text_von_name text not null default '',
  text_at timestamptz,
  freigabe text not null default 'niemand' check (freigabe in ('niemand', 'alle', 'gezielt')),
  updated_at timestamptz not null default now()
);
alter table public.album_steckbriefe enable row level security;
create policy "album lesen" on public.album_steckbriefe for select to authenticated
  using ((select has_consented()) and (select has_perm('album.nutzen')) and not (select ist_eltern()));
-- Schreiben nur über die Funktionen unten (security definer)

-- (frühe Fassung, nicht mehr genutzt – Freigaben stehen in album_steckbriefe.freigabe_an)
create table if not exists public.album_freigaben (
  student_id uuid not null references public.students(id) on delete cascade,
  an_student uuid not null references public.students(id) on delete cascade,
  primary key (student_id, an_student)
);
alter table public.album_freigaben enable row level security;
create policy "album freigaben lesen" on public.album_freigaben for select to authenticated
  using (student_id = (select meine_student_id()) or an_student = (select meine_student_id()));

-- ------------------------------------------------------------ Kommentare & Likes
create table if not exists public.album_kommentare (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  autor_name text not null default '',
  text text not null check (char_length(btrim(text)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists album_kommentare_student on public.album_kommentare (student_id, created_at);
alter table public.album_kommentare enable row level security;

create table if not exists public.album_likes (
  student_id uuid not null references public.students(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (student_id, user_id)
);
alter table public.album_likes enable row level security;

create table if not exists public.album_kommentar_likes (
  kommentar_id uuid not null references public.album_kommentare(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  primary key (kommentar_id, user_id)
);
alter table public.album_kommentar_likes enable row level security;

-- Name des Verfassers wird beim Schreiben festgehalten (Mitschüler dürfen
-- die Personen-Tabelle nicht lesen).
create or replace function public.album_kommentar_vorbereiten()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.autor_name := public.mein_anzeigename();
  new.text := btrim(new.text);
  new.created_at := now();
  return new;
end $$;
revoke all on function public.album_kommentar_vorbereiten() from public, anon, authenticated;
create trigger album_kommentar_vorbereiten before insert on public.album_kommentare
  for each row execute function public.album_kommentar_vorbereiten();

create policy "album komm lesen" on public.album_kommentare for select to authenticated
  using ((select has_consented()) and (select has_perm('album.nutzen')) and not (select ist_eltern()));
create policy "album komm schreiben" on public.album_kommentare for insert to authenticated
  with check ((select has_consented()) and (select has_perm('album.nutzen')) and not (select ist_eltern()) and not (select is_banned()));

create policy "album likes lesen" on public.album_likes for select to authenticated
  using ((select has_perm('album.nutzen')) and not (select ist_eltern()));
create policy "album likes setzen" on public.album_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and (select has_perm('album.nutzen')) and not (select ist_eltern()));

create policy "album klikes lesen" on public.album_kommentar_likes for select to authenticated
  using ((select has_perm('album.nutzen')) and not (select ist_eltern()));
create policy "album klikes setzen" on public.album_kommentar_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and (select has_perm('album.nutzen')) and not (select ist_eltern()));

-- ------------------------------------------------------------ Funktionen
-- Wer ist im Album? (Mitschüler dürfen students nicht direkt lesen.)
create or replace function public.album_personen()
returns table (id uuid, vorname text, nachname text)
language sql stable security definer set search_path = public as $$
  select s.id, s.vorname, s.nachname from public.students s
   where public.has_perm('album.nutzen') and not public.ist_eltern() and public.has_consented()
   order by s.vorname, s.nachname
$$;

-- Stammdaten: nur die Person selbst. Nur bekannte, aktive Kategorien.
create or replace function public.album_stammdaten_speichern(p_daten jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  ich uuid := public.meine_student_id();
  sauber jsonb := '{}'::jsonb;
  k record;
begin
  if ich is null or not public.has_perm('album.nutzen') or public.ist_eltern() then
    raise exception 'Kein eigener Steckbrief';
  end if;
  for k in select id from public.album_kategorien where aktiv loop
    if p_daten ? k.id::text and char_length(btrim(p_daten ->> k.id::text)) > 0 then
      sauber := sauber || jsonb_build_object(k.id::text, left(btrim(p_daten ->> k.id::text), 200));
    end if;
  end loop;
  insert into public.album_steckbriefe (student_id, stammdaten, updated_at) values (ich, sauber, now())
  on conflict (student_id) do update set stammdaten = excluded.stammdaten, updated_at = now();
end $$;


-- Moderation: Text eines anderen leeren.
create or replace function public.album_text_entfernen(p_student uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('album.moderieren') then raise exception 'Keine Berechtigung'; end if;
  update public.album_steckbriefe set text = '', text_von_name = '', text_at = now(), updated_at = now() where student_id = p_student;
end $$;

-- Wer bekommt eine Mitteilung über einen neuen Kommentar? (Besitzer des Steckbriefs)
create or replace function public.album_besitzer(p_student uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select user_id from public.profiles where student_id = p_student and role <> 'eltern' and public.has_perm('album.nutzen') limit 1
$$;

revoke all on function public.meine_student_id() from public, anon;
revoke all on function public.mein_anzeigename() from public, anon;
revoke all on function public.album_personen() from public, anon;
revoke all on function public.album_stammdaten_speichern(jsonb) from public, anon;
revoke all on function public.album_text_entfernen(uuid) from public, anon;
revoke all on function public.album_besitzer(uuid) from public, anon;
grant execute on function public.meine_student_id(), public.mein_anzeigename(), public.album_personen(), public.album_stammdaten_speichern(jsonb),
  public.album_text_entfernen(uuid), public.album_besitzer(uuid) to authenticated;

-- ============================================================ Pop-up-Umfragen
create table if not exists public.umfragen (
  id uuid primary key default gen_random_uuid(),
  titel text not null check (char_length(titel) between 1 and 80),
  beschreibung text not null default '' check (char_length(beschreibung) <= 400),
  status text not null default 'entwurf' check (status in ('entwurf', 'aktiv', 'beendet')),
  pflicht boolean not null default true,
  zielgruppe text not null default 'schueler' check (zielgruppe in ('schueler', 'team', 'eltern', 'alle')),
  ergebnis_sichtbar boolean not null default false,
  erstellt_von uuid default auth.uid(),
  created_at timestamptz not null default now(),
  gestartet_at timestamptz,
  endet_at timestamptz
);
alter table public.umfragen enable row level security;

create table if not exists public.umfrage_fragen (
  id uuid primary key default gen_random_uuid(),
  umfrage_id uuid not null references public.umfragen(id) on delete cascade,
  sort int not null default 0,
  typ text not null check (typ in ('einfach', 'mehrfach', 'text', 'person', 'skala')),
  titel text not null check (char_length(titel) between 1 and 160),
  optionen jsonb not null default '[]'::jsonb,
  pflicht boolean not null default true
);
create index if not exists umfrage_fragen_umfrage on public.umfrage_fragen (umfrage_id, sort);
alter table public.umfrage_fragen enable row level security;

create table if not exists public.umfrage_antworten (
  frage_id uuid not null references public.umfrage_fragen(id) on delete cascade,
  umfrage_id uuid not null references public.umfragen(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  wert jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (frage_id, user_id)
);
alter table public.umfrage_antworten enable row level security;

create table if not exists public.umfrage_teilnahme (
  umfrage_id uuid not null references public.umfragen(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  fertig_at timestamptz not null default now(),
  primary key (umfrage_id, user_id)
);
alter table public.umfrage_teilnahme enable row level security;

create or replace function public.umfrage_fuer_mich(p_ziel text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_consented() and case p_ziel
    when 'alle' then true
    when 'schueler' then not public.ist_eltern()
    when 'team' then public.ist_team()
    when 'eltern' then public.ist_eltern()
    else false end
$$;

create or replace function public.umfrage_offen(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.umfragen u where u.id = p_id and u.status = 'aktiv'
                 and (u.endet_at is null or u.endet_at > now()) and public.umfrage_fuer_mich(u.zielgruppe))
$$;

create policy "umfragen lesen" on public.umfragen for select to authenticated
  using ((status = 'aktiv' and (select umfrage_fuer_mich(zielgruppe)))
         or (select has_perm('umfragen.verwalten')) or (select has_perm('umfragen.ergebnisse')));
create policy "umfragen schreiben" on public.umfragen for all to authenticated
  using ((select has_perm('umfragen.verwalten'))) with check ((select has_perm('umfragen.verwalten')));

create policy "umfrage fragen lesen" on public.umfrage_fragen for select to authenticated
  using (exists (select 1 from public.umfragen u where u.id = umfrage_id));
create policy "umfrage fragen schreiben" on public.umfrage_fragen for all to authenticated
  using ((select has_perm('umfragen.verwalten'))) with check ((select has_perm('umfragen.verwalten')));

-- Eigene Antworten: lesen, anlegen, ändern – solange die Umfrage läuft.
create policy "antworten eigene lesen" on public.umfrage_antworten for select to authenticated
  using (user_id = (select auth.uid()));
create policy "antworten eigene anlegen" on public.umfrage_antworten for insert to authenticated
  with check (user_id = (select auth.uid()) and umfrage_offen(umfrage_id)
              and exists (select 1 from public.umfrage_fragen f where f.id = frage_id and f.umfrage_id = umfrage_antworten.umfrage_id));
create policy "antworten eigene aendern" on public.umfrage_antworten for update to authenticated
  using (user_id = (select auth.uid()) and umfrage_offen(umfrage_id))
  with check (user_id = (select auth.uid()) and umfrage_offen(umfrage_id));

create policy "teilnahme eigene lesen" on public.umfrage_teilnahme for select to authenticated
  using (user_id = (select auth.uid()));
create policy "teilnahme eigene anlegen" on public.umfrage_teilnahme for insert to authenticated
  with check (user_id = (select auth.uid()) and umfrage_offen(umfrage_id));

-- Ergebnis: gezählt, ohne Namen. Wer verwaltet/Ergebnisse darf, sieht es
-- immer; Teilnehmende nur, wenn "ergebnis_sichtbar" und selbst fertig.
create or replace function public.umfrage_ergebnis(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  u public.umfragen;
  erg jsonb := '[]'::jsonb;
  f record;
  teil int;
  ziel int;
begin
  select * into u from public.umfragen where id = p_id;
  if u.id is null then raise exception 'Unbekannte Umfrage'; end if;
  if not (public.has_perm('umfragen.ergebnisse') or public.has_perm('umfragen.verwalten')
          or (u.ergebnis_sichtbar and exists (select 1 from public.umfrage_teilnahme where umfrage_id = p_id and user_id = auth.uid()))) then
    raise exception 'Keine Berechtigung';
  end if;
  select count(*) into teil from public.umfrage_teilnahme where umfrage_id = p_id;
  select count(*) into ziel from public.profiles p where case u.zielgruppe
      when 'alle' then true when 'schueler' then p.role <> 'eltern'
      when 'team' then p.role in ('stufenteam', 'kassenwart', 'admin', 'sprecher', 'stv_sprecher')
      when 'eltern' then p.role = 'eltern' else false end;
  for f in select * from public.umfrage_fragen where umfrage_id = p_id order by sort loop
    erg := erg || jsonb_build_array(jsonb_build_object(
      'frage_id', f.id,
      'antworten', (select count(*) from public.umfrage_antworten a where a.frage_id = f.id),
      'zaehlung', case when f.typ = 'text' then '{}'::jsonb else coalesce((
          select jsonb_object_agg(w, n) from (
            select w, count(*) n from public.umfrage_antworten a,
              lateral (select jsonb_array_elements_text(case when jsonb_typeof(a.wert) = 'array' then a.wert else jsonb_build_array(a.wert) end) w) x
             where a.frage_id = f.id group by w) t), '{}'::jsonb) end,
      'texte', case when f.typ = 'text' then coalesce((
          select jsonb_agg(a.wert #>> '{}' order by a.updated_at) from public.umfrage_antworten a
           where a.frage_id = f.id and char_length(a.wert #>> '{}') > 0), '[]'::jsonb) else '[]'::jsonb end
    ));
  end loop;
  return jsonb_build_object('teilnehmer', teil, 'zielgruppe', ziel, 'fragen', erg);
end $$;

-- Für Personen-Fragen: Namen auflösen (nur wer die Umfrage sehen darf)
create or replace function public.umfrage_personen()
returns table (id uuid, vorname text, nachname text)
language sql stable security definer set search_path = public as $$
  select s.id, s.vorname, s.nachname from public.students s
   where public.has_consented() and (
     public.has_perm('umfragen.verwalten') or public.has_perm('umfragen.ergebnisse')
     or exists (select 1 from public.umfragen u where u.status = 'aktiv' and public.umfrage_fuer_mich(u.zielgruppe)))
   order by s.vorname, s.nachname
$$;

revoke all on function public.umfrage_fuer_mich(text) from public, anon;
revoke all on function public.umfrage_offen(uuid) from public, anon;
revoke all on function public.umfrage_ergebnis(uuid) from public, anon;
revoke all on function public.umfrage_personen() from public, anon;
grant execute on function public.umfrage_fuer_mich(text), public.umfrage_offen(uuid), public.umfrage_ergebnis(uuid), public.umfrage_personen() to authenticated;

-- ============================================================ Ohne Löschen
-- Likes werden umgeschaltet (an = true/false), Kommentare ausgeblendet
-- (geloescht = true, Text geleert), Freigaben als Liste im Steckbrief.
alter table public.album_steckbriefe add column if not exists freigabe_an uuid[] not null default '{}';
alter table public.album_likes add column if not exists an boolean not null default true;
alter table public.album_kommentar_likes add column if not exists an boolean not null default true;
alter table public.album_kommentare add column if not exists geloescht boolean not null default false;

create policy "album likes umschalten" on public.album_likes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select has_perm('album.nutzen')));
create policy "album klikes umschalten" on public.album_kommentar_likes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select has_perm('album.nutzen')));

alter policy "album komm lesen" on public.album_kommentare
  using ((select has_consented()) and (select has_perm('album.nutzen')) and not (select ist_eltern()) and not geloescht);

-- Freigabe setzen: nur die Person selbst.
create or replace function public.album_freigabe_setzen(p_modus text, p_personen uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  ich uuid := public.meine_student_id();
  liste uuid[];
begin
  if ich is null or not public.has_perm('album.nutzen') or public.ist_eltern() then raise exception 'Kein eigener Steckbrief'; end if;
  if p_modus not in ('niemand', 'alle', 'gezielt') then raise exception 'Unbekannte Freigabe'; end if;
  select coalesce(array_agg(distinct x), '{}') into liste
    from unnest(coalesce(p_personen, '{}')) x where x <> ich and exists (select 1 from public.students where id = x);
  if p_modus <> 'gezielt' then liste := '{}'; end if;
  insert into public.album_steckbriefe (student_id, freigabe, freigabe_an) values (ich, p_modus, liste)
  on conflict (student_id) do update set freigabe = excluded.freigabe, freigabe_an = excluded.freigabe_an, updated_at = now();
end $$;

-- Freier Text: die Person selbst – oder wer freigegeben wurde.
create or replace function public.album_text_schreiben(p_student uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare
  ich uuid := public.meine_student_id();
  sb public.album_steckbriefe;
begin
  if not public.has_perm('album.nutzen') or public.ist_eltern() or public.is_banned() then
    raise exception 'Keine Berechtigung';
  end if;
  if char_length(coalesce(p_text, '')) > 3000 then raise exception 'Text zu lang'; end if;
  if ich is distinct from p_student then
    select * into sb from public.album_steckbriefe where student_id = p_student;
    if ich is null or sb.student_id is null or sb.freigabe = 'niemand'
       or (sb.freigabe = 'gezielt' and not (ich = any(sb.freigabe_an))) then
      raise exception 'Nicht freigegeben';
    end if;
  end if;
  insert into public.album_steckbriefe (student_id, text, text_von_name, text_at, updated_at)
  values (p_student, coalesce(p_text, ''), case when ich = p_student then '' else public.mein_anzeigename() end, now(), now())
  on conflict (student_id) do update set
    text = excluded.text, text_von_name = excluded.text_von_name, text_at = now(), updated_at = now();
end $$;

-- Kommentar entfernen: eigener, auf dem eigenen Steckbrief oder mit Moderationsrecht.
create or replace function public.album_kommentar_entfernen(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare k public.album_kommentare;
begin
  select * into k from public.album_kommentare where id = p_id;
  if k.id is null then return; end if;
  if not (k.user_id = auth.uid() or k.student_id = public.meine_student_id() or public.has_perm('album.moderieren')) then
    raise exception 'Keine Berechtigung';
  end if;
  update public.album_kommentare set geloescht = true, text = '–', autor_name = '' where id = p_id;
end $$;

revoke all on function public.album_text_schreiben(uuid, text) from public, anon;
revoke all on function public.album_freigabe_setzen(text, uuid[]) from public, anon;
revoke all on function public.album_kommentar_entfernen(uuid) from public, anon;
grant execute on function public.album_text_schreiben(uuid, text), public.album_freigabe_setzen(text, uuid[]),
  public.album_kommentar_entfernen(uuid) to authenticated;

-- Live-Aktualisierung
alter publication supabase_realtime add table public.album_kommentare, public.album_likes, public.album_kommentar_likes,
  public.album_steckbriefe, public.umfragen;
