-- =====================================================================
-- Update 1.1 – Mithilfe nachtragen (03.10.2026)
-- Einmal im SQL Editor ausführen (idempotent). Keine Namen, keine Schlüssel.
--
-- Schüler (und Teammitglieder mit eigenem Eintrag) beantragen eine
-- vergangene Mithilfe: Vorlage aus dem Beiträge-Reiter (oder „Sonstiges“ mit
-- eigenem Namen), Tag, kurze Beschreibung. Das Team (oder wer „Mithilfe
-- eintragen“ hat) nimmt an oder lehnt ab. Angenommen = genau ein Eintrag in
-- contributions (Protokoll: Quelle „nachtrag“).
-- Eltern stellen keine Anträge.
-- =====================================================================

create table if not exists public.mithilfe_nachtraege (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  vorlage_id uuid references public.contribution_templates(id) on delete set null,
  titel text not null check (length(trim(titel)) between 1 and 80),
  -- null = „Sonstiges“: das Team legt den Wert beim Annehmen fest
  punkte int check (punkte between 0 and 100),
  datum date not null,
  beschreibung text not null default '' check (length(beschreibung) <= 500),
  status text not null default 'offen' check (status in ('offen', 'angenommen', 'abgelehnt')),
  antwort text not null default '' check (length(antwort) <= 300),
  vergeben int,
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz
);
alter table public.mithilfe_nachtraege enable row level security;
create index if not exists mithilfe_nachtraege_status_idx on public.mithilfe_nachtraege (status, created_at desc);

drop policy if exists "nachtrag lesen" on public.mithilfe_nachtraege;
create policy "nachtrag lesen" on public.mithilfe_nachtraege for select to authenticated
  using (user_id = (select auth.uid()) or (select public.ist_team()) or (select public.has_perm('hilfen.edit')));

drop policy if exists "nachtrag stellen" on public.mithilfe_nachtraege;
create policy "nachtrag stellen" on public.mithilfe_nachtraege for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'offen' and antwort = '' and vergeben is null and decided_by is null
    and datum <= current_date and datum > current_date - 400
    and not (select public.ist_eltern())
    and student_id = (select p.student_id from public.profiles p where p.user_id = (select auth.uid()))
  );

drop policy if exists "nachtrag zurueckziehen" on public.mithilfe_nachtraege;
create policy "nachtrag zurueckziehen" on public.mithilfe_nachtraege for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'offen');

-- Entscheiden: nur über diese Funktion (kein direktes UPDATE)
create or replace function public.nachtrag_entscheiden(p_id uuid, p_annehmen boolean, p_punkte int default null, p_antwort text default '')
returns int language plpgsql security definer set search_path = public as $$
declare
  n public.mithilfe_nachtraege;
  pkt int;
begin
  if auth.uid() is null or not (public.ist_team() or public.has_perm('hilfen.edit')) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select * into n from public.mithilfe_nachtraege where id = p_id for update;
  if not found then raise exception 'Antrag nicht gefunden' using errcode = 'P0002'; end if;
  if n.status <> 'offen' then return 0; end if;   -- schon entschieden

  if p_annehmen then
    pkt := coalesce(p_punkte, n.punkte);
    if pkt is null or pkt < 0 or pkt > 100 then
      raise exception 'Bitte einen Wert zwischen 0 und 100 angeben' using errcode = '22023';
    end if;
    perform set_config('sv.mithilfe_quelle', 'nachtrag', true);
    insert into public.contributions (student_id, titel, punkte, datum)
    values (n.student_id, n.titel, pkt, n.datum);
    perform set_config('sv.mithilfe_quelle', '', true);
  end if;

  update public.mithilfe_nachtraege
     set status = case when p_annehmen then 'angenommen' else 'abgelehnt' end,
         antwort = left(coalesce(p_antwort, ''), 300),
         vergeben = case when p_annehmen then pkt end,
         decided_by = auth.uid(), decided_at = now()
   where id = p_id;
  return coalesce(pkt, 0);
end $$;
revoke all on function public.nachtrag_entscheiden(uuid, boolean, int, text) from public, anon;
grant execute on function public.nachtrag_entscheiden(uuid, boolean, int, text) to authenticated;

-- Live-Aktualisierung (die Leseregel gilt auch hier)
alter publication supabase_realtime add table public.mithilfe_nachtraege;
