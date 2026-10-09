-- Eigene Anführungszeichen außen am Zitat entfernen – die App setzt „…“ selbst.
-- Gilt für neue und geänderte Zitate (Trigger) und einmal für die vorhandenen.
-- Bereits eingespielt (MCP, 09.10.2026). Idempotent.
create or replace function public.zitat_zeichen_weg()
returns trigger language plpgsql set search_path = public as $$
begin
  new.text := btrim(regexp_replace(regexp_replace(coalesce(new.text, ''),
    '^\s*["„“”‚‘’''«»‹›]+\s*', ''), '\s*["„“”‚‘’''«»‹›]+\s*$', ''));
  return new;
end $$;

create or replace trigger zitat_zeichen_weg
  before insert or update of text on public.zitate
  for each row execute function public.zitat_zeichen_weg();

update public.zitate set text = text
 where text ~ '^\s*["„“”‚‘’''«»‹›]' or text ~ '["„“”‚‘’''«»‹›]\s*$';
