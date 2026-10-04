-- =====================================================================
-- Update 1.2 – Abiball: Bonus über 100 %, Ticketverkauf (03.10.2026)
-- Einmal im SQL Editor ausführen (idempotent). Keine Namen, keine Schlüssel.
--
-- app_settings.abiball (jsonb):
--   ueber100 (bool), bonusSchritt (alle x % über 100 …), bonusProSchritt
--   (… y € günstiger), bonusMax (höchstens z €), verkaufAb (Zeitpunkt,
--   null = nicht freigegeben), maxProPerson, kontingent (0 = unbegrenzt),
--   ort, datum (YYYY-MM-DD), uhrzeit (HH:MM)
--
-- ticket_bestellungen: wer wie viele Tickets bestellt hat und was zu
-- überweisen ist. Bestellen geht nur über ticket_bestellen() – der Preis wird
-- auf dem Server gerechnet (gleiche Regeln wie in der App, lib/logic.ts).
-- =====================================================================

alter table public.app_settings add column if not exists abiball jsonb not null default '{}'::jsonb;

create table if not exists public.ticket_bestellungen (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  anzahl int not null check (anzahl between 1 and 20),
  betrag_cent bigint not null check (betrag_cent >= 0),
  status text not null default 'offen' check (status in ('offen', 'bezahlt', 'storniert')),
  created_at timestamptz not null default now(),
  bearbeitet_at timestamptz,
  bearbeitet_von uuid
);
alter table public.ticket_bestellungen enable row level security;
create index if not exists ticket_bestellungen_student_idx on public.ticket_bestellungen (student_id);

drop policy if exists "tickets lesen" on public.ticket_bestellungen;
create policy "tickets lesen" on public.ticket_bestellungen for select to authenticated
  using (
    user_id = (select auth.uid())
    or student_id = (select p.student_id from public.profiles p where p.user_id = (select auth.uid()))
    -- Eltern sehen die Bestellungen ihrer zugeordneten Kinder (zum Überweisen)
    or exists (select 1 from public.parent_children pc where pc.user_id = (select auth.uid()) and pc.student_id = ticket_bestellungen.student_id)
    or (select public.ist_team()) or (select public.has_perm('kasse.edit')) or (select public.has_perm('finanzen.manage'))
  );

-- Bezahlt / storniert setzt nur das Team bzw. wer die Kasse führt
drop policy if exists "tickets bearbeiten" on public.ticket_bestellungen;
create policy "tickets bearbeiten" on public.ticket_bestellungen for update to authenticated
  using ((select public.ist_team()) or (select public.has_perm('kasse.edit')) or (select public.has_perm('finanzen.manage')))
  with check ((select public.ist_team()) or (select public.has_perm('kasse.edit')) or (select public.has_perm('finanzen.manage')));

-- Preis des 1. Tickets einer Person in Cent (wie ticketPreise() in der App)
create or replace function public.ticket_erstes_cent(p_student uuid)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare
  s record;
  a jsonb;
  punkte numeric;
  pct int;
  deckel int;
  grund numeric;
  aufschlag numeric := 0;
  schritt int;
  pro int;
  maxi int;
  rabatt numeric := 0;
  st jsonb;
  erste boolean := true;
begin
  select * into s from public.app_settings where id = 1;
  a := coalesce(s.abiball, '{}'::jsonb);
  grund := coalesce(s.ticket_preis, 0);
  -- wie abiballVon()/bonusGrenze() in lib/logic.ts
  schritt := greatest(1, least(100, coalesce(round((a->>'bonusSchritt')::numeric)::int, 10)));
  pro := greatest(0, least(100, coalesce(round((a->>'bonusProSchritt')::numeric)::int, 2)));
  maxi := greatest(0, least(500, coalesce(round((a->>'bonusMax')::numeric)::int, 10)));
  deckel := case
    when not coalesce((a->>'ueber100')::boolean, false) then 100
    when pro <= 0 or maxi <= 0 then 100 + schritt
    else least(1000, 100 + ceil(maxi::numeric / pro)::int * schritt) end;
  select coalesce(sum(c.punkte), 0) into punkte from public.contributions c where c.student_id = p_student;
  pct := greatest(0, least(deckel, round(punkte / greatest(1, coalesce(s.ziel_punkte, 100)) * 100)::int));

  -- Staffel: Start mit der untersten Stufe, dann die höchste erreichte (bis 100 %)
  for st in
    select x from jsonb_array_elements(case when jsonb_typeof(s.staffel) = 'array' and jsonb_array_length(s.staffel) > 0
      then s.staffel else
      '[{"ab":0,"betrag":50},{"ab":25,"betrag":40},{"ab":50,"betrag":25},{"ab":75,"betrag":10},{"ab":100,"betrag":0}]'::jsonb end) x
    order by (x->>'ab')::numeric
  loop
    if erste or least(pct, 100) >= (st->>'ab')::numeric then aufschlag := coalesce((st->>'betrag')::numeric, 0); end if;
    erste := false;
  end loop;

  -- Bonus: alle „schritt“ % über 100 → „pro“ € weniger, höchstens „maxi“ €
  if coalesce((a->>'ueber100')::boolean, false) and pct > 100 then
    rabatt := least(grund + aufschlag, maxi, floor((pct - 100)::numeric / schritt) * pro);
  end if;
  return ((grund + aufschlag - rabatt) * 100)::bigint;
end $$;
revoke all on function public.ticket_erstes_cent(uuid) from public, anon, authenticated;

-- Verkaufsstand: wie viele verkauft (gesamt) und wie viele davon meine
create or replace function public.ticket_stand()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'verkauft', coalesce((select sum(anzahl) from public.ticket_bestellungen where status <> 'storniert'), 0),
    'meine', coalesce((select sum(b.anzahl) from public.ticket_bestellungen b
                        join public.profiles p on p.student_id = b.student_id
                       where p.user_id = auth.uid() and b.status <> 'storniert'), 0)
  )
$$;
revoke all on function public.ticket_stand() from public, anon;
grant execute on function public.ticket_stand() to authenticated;

-- Bestellen: prüft Freigabe, Höchstzahl je Person und Kontingent, rechnet den Betrag
create or replace function public.ticket_bestellen(p_anzahl int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
  a jsonb;
  ab timestamptz;
  max_person int;
  kontingent int;
  schon int;
  gesamt int;
  grund numeric;
  betrag bigint;
  neu uuid;
begin
  if auth.uid() is null or public.ist_eltern() then
    raise exception 'Bestellen geht nur über den eigenen Zugang' using errcode = '42501';
  end if;
  select student_id into sid from public.profiles where user_id = auth.uid();
  if sid is null then raise exception 'Dein Zugang ist mit keiner Person verknüpft' using errcode = 'P0001'; end if;
  if p_anzahl is null or p_anzahl < 1 then raise exception 'Mindestens ein Ticket' using errcode = '22023'; end if;

  select abiball, coalesce(ticket_preis, 0) into a, grund from public.app_settings where id = 1;
  ab := nullif(a->>'verkaufAb', '')::timestamptz;
  if ab is null or ab > now() then raise exception 'Der Ticketverkauf hat noch nicht begonnen' using errcode = 'P0001'; end if;
  if grund <= 0 then raise exception 'Der Ticketpreis steht noch nicht fest' using errcode = 'P0001'; end if;
  max_person := greatest(1, coalesce(round((a->>'maxProPerson')::numeric)::int, 4));
  kontingent := greatest(0, coalesce(round((a->>'kontingent')::numeric)::int, 0));

  -- gleichzeitige Bestellungen nacheinander abarbeiten
  perform pg_advisory_xact_lock(hashtext('ticket_bestellen'));

  select coalesce(sum(anzahl), 0) into schon from public.ticket_bestellungen where student_id = sid and status <> 'storniert';
  if schon + p_anzahl > max_person then
    raise exception 'Höchstens % Tickets je Person (du hast schon %)', max_person, schon using errcode = 'P0001';
  end if;
  if kontingent > 0 then
    select coalesce(sum(anzahl), 0) into gesamt from public.ticket_bestellungen where status <> 'storniert';
    if gesamt + p_anzahl > kontingent then
      raise exception 'Nur noch % Tickets übrig', greatest(0, kontingent - gesamt) using errcode = 'P0001';
    end if;
  end if;

  -- Das 1. Ticket zum eigenen Preis, alle weiteren zum Grundpreis
  betrag := case when schon = 0
    then public.ticket_erstes_cent(sid) + (p_anzahl - 1) * (grund * 100)::bigint
    else p_anzahl * (grund * 100)::bigint end;

  insert into public.ticket_bestellungen (user_id, student_id, anzahl, betrag_cent)
  values (auth.uid(), sid, p_anzahl, betrag) returning id into neu;
  return jsonb_build_object('id', neu, 'betrag_cent', betrag);
end $$;
revoke all on function public.ticket_bestellen(int) from public, anon;
grant execute on function public.ticket_bestellen(int) to authenticated;

alter publication supabase_realtime add table public.ticket_bestellungen;
