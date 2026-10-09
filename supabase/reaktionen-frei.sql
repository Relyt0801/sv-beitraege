-- Chat-Reaktionen: mehr Emojis (😁 😭 ❤️) und ein eigenes über „+“.
-- Supabase → SQL Editor → einfügen → Run. Idempotent.
--
-- Bisher erlaubte ein Check-Constraint nur 👍 👎 🔥 😢 😂 ❓. Jetzt gilt:
-- genau ein Emoji (höchstens 16 Zeichen, damit Hautfarben, ZWJ-Folgen und
-- Flaggen gehen), keine Buchstaben, Ziffern oder Satzzeichen aus ASCII.
-- Gesperrte Zeichen aus dem Emoji-Filter (app_settings.wortfilter_zeichen)
-- lehnt ein Trigger ab.

alter table public.topic_reaktionen drop constraint if exists topic_reaktionen_emoji_check;
alter table public.topic_reaktionen drop constraint if exists topic_reaktionen_emoji_ein_zeichen;
alter table public.topic_reaktionen add constraint topic_reaktionen_emoji_ein_zeichen
  check (char_length(emoji) between 1 and 16 and emoji !~ '[\x01-\x7f]');

-- Emoji-Filter (läuft auch schon vor dem Constraint-Tausch)
create or replace function public.reaktion_pruefen()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.wortfilter_zeichen_treffer(new.emoji) is not null then
    raise exception 'Dieses Emoji ist gesperrt.' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace trigger reaktion_pruefen
  before insert or update of emoji on public.topic_reaktionen
  for each row execute function public.reaktion_pruefen();
