-- =====================================================================
-- Abstimmungen im Chat: „Eigene Antwort“ als Ankreuz-Möglichkeit (14.10.2026)
--
-- Wie „Sonstiges: ____“ in Formularen: Eine Abstimmung mit Auswahl-
-- Möglichkeiten kann zusätzlich eine freie Möglichkeit haben. Sie steht als
-- ganz normale Möglichkeit in topic_items.options, nur mit Kennzeichen:
--     {"id": "…", "label": "Eigene Antwort", "frei": true}
-- Wer sie ankreuzt, zählt wie bei jeder anderen Möglichkeit (topic_votes) und
-- schreibt den Text dazu in topic_antworten (eine Antwort je Person, kurz,
-- höchstens 120 Zeichen).
--
-- Abwärtskompatibel: Die alte App kennt das Kennzeichen nicht und zeigt die
-- freie Möglichkeit einfach als normale Möglichkeit „Eigene Antwort“ – man
-- kann sie dort ankreuzen, nur ohne Text. Keine neuen Spalten nötig.
--
-- Geändert wird nur:
--   freitext_offen()   erlaubt Text auch bei Abstimmungen mit freier
--                      Möglichkeit – aber nur, wenn man sie angekreuzt hat
--   freitext_pruefen() ohne antwort_art gilt die Länge „kurz“ (≤ 120)
-- Ohne Lösch- und Entfern-Anweisungen.
-- =====================================================================

-- Darf die Person auf diese Abstimmung (noch) frei antworten?
--   a) Abstimmung mit freier Antwort (antwort_art gesetzt) – wie bisher
--   b) Abstimmung mit Auswahl, die eine freie Möglichkeit hat UND die die
--      Person angekreuzt hat (sonst stünde ein Text ohne Stimme da)
create or replace function public.freitext_offen(p_item uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.topic_items i
     where i.id = p_item and i.type = 'umfrage'
       and public.can_access_topic(i.topic_id)
       and (i.poll_deadline is null or i.poll_deadline > now())
       and (
         i.antwort_art is not null
         or (jsonb_typeof(i.options) = 'array' and exists (
               select 1 from jsonb_array_elements(i.options) o
                where o ->> 'frei' = 'true'
                  and exists (select 1 from public.topic_votes v
                               where v.item_id = i.id and v.user_id = auth.uid()
                                 and v.option_id = o ->> 'id'))))
  )
$$;

-- Länge und Zahl je Art prüfen. Ohne antwort_art (= freie Möglichkeit in
-- einer Auswahl-Abstimmung) gilt die kurze Form.
create or replace function public.freitext_pruefen()
returns trigger language plpgsql security definer set search_path = public as $$
declare a text;
begin
  select antwort_art into a from public.topic_items where id = new.item_id;
  new.wert := btrim(new.wert);
  new.updated_at := now();
  if coalesce(a, 'kurz') = 'kurz' and char_length(new.wert) > 120 then
    raise exception 'Bitte kürzer antworten (höchstens 120 Zeichen).';
  elsif a = 'zahl' then
    new.wert := replace(regexp_replace(new.wert, '\s', '', 'g'), ',', '.');
    if new.wert !~ '^-?[0-9]+(\.[0-9]+)?$' then
      raise exception 'Bitte nur eine Zahl eingeben.';
    end if;
  end if;
  return new;
end $$;
