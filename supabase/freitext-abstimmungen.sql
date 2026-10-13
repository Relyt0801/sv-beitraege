-- =====================================================================
-- Abstimmungen im Chat mit freier Antwort (13.10.2026)
--
-- Statt Auswahl-Möglichkeiten kann eine Abstimmung eine freie Antwort
-- verlangen: kurzer Text, langer Text oder eine Zahl
-- (topic_items.antwort_art). Jede Person hat genau eine Antwort und kann sie
-- ändern oder zurückziehen. Sichtbar wie bei normalen Abstimmungen: alle im
-- Chat sehen die Antworten; bei „anonym“ ohne Namen (Namen nur für Admins).
-- Wortfilter wie im Chat, Zahl wird geprüft. Ohne DELETE/DROP-Anweisungen.
-- =====================================================================

alter table public.topic_items add column if not exists antwort_art text
  check (antwort_art is null or antwort_art in ('kurz', 'lang', 'zahl'));

create table if not exists public.topic_antworten (
  item_id uuid not null references public.topic_items (id) on delete cascade,
  user_id uuid not null default auth.uid(),
  wert text not null check (char_length(btrim(wert)) between 1 and 2000),
  updated_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
alter table public.topic_antworten enable row level security;

-- Darf die Person auf diese Abstimmung (noch) frei antworten?
create or replace function public.freitext_offen(p_item uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.topic_items i
     where i.id = p_item and i.type = 'umfrage' and i.antwort_art is not null
       and public.can_access_topic(i.topic_id)
       and (i.poll_deadline is null or i.poll_deadline > now()))
$$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'topic_antworten' and policyname = 'tantw eigene') then
    create policy "tantw eigene" on public.topic_antworten for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()) and not (select public.is_banned()) and public.freitext_offen(item_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'topic_antworten' and policyname = 'tantw lesen') then
    create policy "tantw lesen" on public.topic_antworten for select to authenticated
      using (exists (select 1 from public.topic_items i
                      where i.id = topic_antworten.item_id and public.can_access_topic(i.topic_id)));
  end if;
end $$;

-- Länge und Zahl je Art prüfen
create or replace function public.freitext_pruefen()
returns trigger language plpgsql security definer set search_path = public as $$
declare a text;
begin
  select antwort_art into a from public.topic_items where id = new.item_id;
  new.wert := btrim(new.wert);
  new.updated_at := now();
  if a = 'kurz' and char_length(new.wert) > 120 then
    raise exception 'Bitte kürzer antworten (höchstens 120 Zeichen).';
  elsif a = 'zahl' then
    new.wert := replace(regexp_replace(new.wert, '\s', '', 'g'), ',', '.');
    if new.wert !~ '^-?[0-9]+(\.[0-9]+)?$' then
      raise exception 'Bitte nur eine Zahl eingeben.';
    end if;
  end if;
  return new;
end $$;
create or replace trigger freitext_pruefen before insert or update on public.topic_antworten
  for each row execute function public.freitext_pruefen();
create or replace trigger wortfilter before insert or update on public.topic_antworten
  for each row execute function public.wortfilter_pruefen('wert');

-- Wortfilter: Antworten zählen zum Bereich „Chat“
create or replace function public.wf_bereich(t text)
returns text language sql immutable set search_path = public as $$
  select case
    when t in ('topic_items', 'topics', 'topic_antworten') then 'chat'
    when t = 'album_kommentare' then 'kommentare'
    when t in ('album_steckbriefe', 'album_kategorien') then 'steckbrief'
    when t = 'motto_vorschlaege' then 'motto'
    when t = 'zitate' then 'zitate'
    when t = 'ranking_kategorien' then 'rankings'
    when t in ('umfragen', 'umfrage_fragen', 'umfrage_antworten') then 'umfragen'
    when t in ('termine', 'events', 'eltern_infos') then 'team'
    else 'anfragen' end
$$;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'topic_antworten') then
    alter publication supabase_realtime add table public.topic_antworten;
  end if;
end $$;
