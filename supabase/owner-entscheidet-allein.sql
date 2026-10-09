-- Der Owner (profiles.is_op) entscheidet bei Freigaben allein – ohne die
-- eingestellte Zahl weiterer Zustimmungen (09.10.2026). Seine Zustimmung wird
-- trotzdem eingetragen, damit man sieht, wer freigegeben hat.
-- Bereits eingespielt (MCP). Idempotent.

create or replace function public.zustimmung_allein()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_op from public.profiles where user_id = auth.uid()), false)
$$;
revoke all on function public.zustimmung_allein() from public, anon;
grant execute on function public.zustimmung_allein() to authenticated;

create or replace function public.zustimmen(p_art text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  z int;
  noetig int := public.zustimmung_noetig(p_art);
begin
  if auth.uid() is null or not public.zustimmung_recht(p_art) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  insert into public.anfrage_zustimmungen (art, anfrage_id, user_id) values (p_art, p_id, auth.uid())
  on conflict do nothing;
  select count(*) into z from public.anfrage_zustimmungen where art = p_art and anfrage_id = p_id;
  if noetig > 1 then
    perform public.audit_schreiben('anfrage.zustimmung', 'anfragen', null, p_art,
      'Zustimmung ' || z || '/' || noetig || ' (' || p_art || ')', jsonb_build_object('art', p_art, 'id', p_id));
  end if;
  return jsonb_build_object('stimmen', z, 'noetig', noetig, 'fertig', z >= noetig or public.zustimmung_allein());
end $$;

create or replace function public.zustimmung_pruefen(p_art text, p_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  noetig int := public.zustimmung_noetig(p_art);
  z int;
begin
  if noetig <= 1 or public.zustimmung_allein() then return; end if;
  select count(*) into z from public.anfrage_zustimmungen where art = p_art and anfrage_id = p_id;
  if z < noetig then
    raise exception 'Es fehlen noch Zustimmungen (% von %).', z, noetig using errcode = 'P0421';
  end if;
end $$;
