-- =====================================================================
-- Pop-up-Umfragen: „Eigene Antwort“ bei Auswahl-Fragen (14.10.2026)
--
-- Fragen mit Auswahl (einfach/mehrfach) können zusätzlich „Eigene Antwort“
-- anbieten – wie „Sonstiges: ____“ in Formularen.
--
--   umfrage_fragen.eigene     true = freie Möglichkeit wird angeboten
--                             (Standard false – alte Fragen bleiben, wie sie sind)
--   umfrage_antworten.eigene  der Text dazu (kurz, höchstens 120 Zeichen)
--   umfrage_antworten.wert    enthält für die freie Möglichkeit die Marke
--                             "__eigene__" – bei Einfachwahl als Wert, bei
--                             Mehrfachwahl als ein Eintrag der Liste
--
-- Abwärtskompatibel: Die alte App liest die neuen Spalten nicht. Sie zeigt
-- nur die normalen Möglichkeiten an, und in der Auswertung erscheint die
-- freie Möglichkeit als Balken „Eigene Antwort“ (umfrage_ergebnis benennt
-- die Marke dafür um). Die Texte liefert umfrage_ergebnis zusätzlich unter
-- „eigene“ (die alte App ignoriert das Feld).
-- Ohne Lösch- und Entfern-Anweisungen.
-- =====================================================================

alter table public.umfrage_fragen add column if not exists eigene boolean not null default false;

alter table public.umfrage_antworten add column if not exists eigene text
  check (eigene is null or char_length(eigene) <= 120);

-- Text aufräumen: leer = null; nur erlaubt, wenn die Frage es anbietet
create or replace function public.umfrage_eigene_pruefen()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.eigene := nullif(btrim(coalesce(new.eigene, '')), '');
  if new.eigene is not null and not exists (
       select 1 from public.umfrage_fragen f where f.id = new.frage_id and f.eigene) then
    raise exception 'Diese Frage hat keine eigene Antwort.';
  end if;
  return new;
end $$;
create or replace trigger umfrage_eigene_pruefen before insert or update on public.umfrage_antworten
  for each row execute function public.umfrage_eigene_pruefen();

-- Wortfilter prüft jetzt auch den eigenen Text
create or replace trigger wortfilter before insert or update on public.umfrage_antworten
  for each row execute function public.wortfilter_pruefen('wert', 'eigene');

-- Auswertung: wie bisher, dazu
--   * die Marke "__eigene__" heißt in der Zählung „Eigene Antwort“
--   * "eigene": alle eigenen Texte (ohne Namen, älteste zuerst)
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
            select case when x.w = '__eigene__' then 'Eigene Antwort' else x.w end w, count(*) n
              from public.umfrage_antworten a,
              lateral (select jsonb_array_elements_text(case when jsonb_typeof(a.wert) = 'array' then a.wert else jsonb_build_array(a.wert) end) w) x
             where a.frage_id = f.id
             group by 1) t), '{}'::jsonb) end,
      'texte', case when f.typ = 'text' then coalesce((
          select jsonb_agg(a.wert #>> '{}' order by a.updated_at) from public.umfrage_antworten a
           where a.frage_id = f.id and char_length(a.wert #>> '{}') > 0), '[]'::jsonb) else '[]'::jsonb end,
      'eigene', case when f.eigene then coalesce((
          select jsonb_agg(a.eigene order by a.updated_at) from public.umfrage_antworten a
           where a.frage_id = f.id and a.eigene is not null), '[]'::jsonb) else '[]'::jsonb end
    ));
  end loop;
  return jsonb_build_object('teilnehmer', teil, 'zielgruppe', ziel, 'fragen', erg);
end $$;
