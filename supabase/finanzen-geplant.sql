-- =====================================================================
-- Finanzen: Geplante Aktionen (28.09.2026)
-- Einmal im SQL Editor ausführen (idempotent). Keine Namen, keine Schlüssel.
--
-- Anstehende Geldaktionen (z. B. „Lehrerkarten-Verkauf“, „Kuchenverkauf
-- Elternsprechtag“) mit Titel, Tag, Infos und – freiwillig – dem Betrag, den
-- man erwartet. Sehen darf das jeder, der die Finanzen sieht (Standard,
-- Erweitert, Aufsichtsrat; Eltern nur mit Kind). Eintragen, ändern, löschen
-- nur „Kassenbuch führen“ (finanzen.manage).
-- =====================================================================

create table if not exists public.kasse_geplant (
  id uuid primary key default gen_random_uuid(),
  titel text not null check (length(trim(titel)) between 1 and 80),
  datum date,
  info text not null default '' check (length(info) <= 1000),
  -- erwarteter Betrag in Cent (positiv = Einnahme, negativ = Ausgabe), freiwillig
  erwartet_cent bigint,
  kategorie_id uuid references public.kasse_kategorien(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.kasse_geplant enable row level security;

drop policy if exists "geplant lesen" on public.kasse_geplant;
create policy "geplant lesen" on public.kasse_geplant for select to authenticated
  using (
    ((select has_perm('finanzen.basis')) or (select has_perm('finanzen.view'))
      or (select has_perm('finanzen.manage')) or (select ist_aufsichtsrat()))
    and not (select eltern_ohne_kind())
  );
drop policy if exists "geplant pflegen" on public.kasse_geplant;
create policy "geplant pflegen" on public.kasse_geplant for all to authenticated
  using ((select has_perm('finanzen.manage'))) with check ((select has_perm('finanzen.manage')));

create index if not exists kasse_geplant_datum_idx on public.kasse_geplant (datum);

-- Live-Aktualisierung (die Zugriffsregel gilt auch hier)
do $$ begin
  alter publication supabase_realtime add table public.kasse_geplant;
exception when duplicate_object then null; when undefined_object then null; end $$;
