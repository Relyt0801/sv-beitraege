-- ============================================================
-- Kostenanfragen, Aufsichtsrat liest mit, Komitee an Ausgaben
-- Einmal im SQL-Editor ausführen (idempotent).
-- ============================================================

-- 1) Ausgaben (und Einnahmen) lassen sich einem Komitee zuordnen
alter table public.kasse_buchungen add column if not exists komitee text;
alter table public.kasse_buchungen add column if not exists anfrage_id uuid;

-- 2) Wer ist im Aufsichtsrat? (nur eigene Mitgliedschaft, nicht die der Kinder)
create or replace function public.ist_aufsichtsrat()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from tag_members where user_id = auth.uid() and tag = 'aufsichtsrat')
     and coalesce(public.my_role(), '') <> 'eltern'
$$;

-- 3) Wer darf das Kassenbuch führen? Für Benachrichtigungen – gibt nur IDs zurück.
create or replace function public.finanz_verwalter_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.user_id from profiles p
   where p.role = 'admin' or p.is_op
      or coalesce(
           (select allowed from user_permissions u where u.user_id = p.user_id and u.perm = 'finanzen.manage'),
           (select allowed from role_permissions r where r.role = p.role and r.perm = 'finanzen.manage'),
           false)
$$;
revoke all on function public.finanz_verwalter_ids() from public, anon;
grant execute on function public.finanz_verwalter_ids() to authenticated;

-- 4) Aufsichtsrat darf das Kassenbuch lesen (nicht schreiben)
drop policy if exists "kasse lesen" on public.kasse_buchungen;
create policy "kasse lesen" on public.kasse_buchungen for select to authenticated
  using (has_perm('finanzen.view') or has_perm('finanzen.manage') or ist_aufsichtsrat());
drop policy if exists "kassenziel lesen" on public.kasse_einstellungen;
create policy "kassenziel lesen" on public.kasse_einstellungen for select to authenticated
  using (has_perm('finanzen.view') or has_perm('finanzen.manage') or ist_aufsichtsrat());

-- 5) Kostenanfragen der Komitee-Vorsitzenden
create table if not exists public.kosten_anfragen (
  id uuid primary key default gen_random_uuid(),
  tag text not null,
  titel text not null check (length(trim(titel)) between 1 and 120),
  nachricht text not null default '' check (length(nachricht) <= 1000),
  cent integer not null check (cent > 0 and cent <= 10000000),
  benoetigt_am date,
  status text not null default 'offen' check (status in ('offen','genehmigt','abgelehnt')),
  antwort text not null default '',
  buchung_id uuid references public.kasse_buchungen(id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz
);
create index if not exists kosten_anfragen_status on public.kosten_anfragen (status, created_at desc);

alter table public.kosten_anfragen enable row level security;

drop policy if exists "kostenanfragen lesen" on public.kosten_anfragen;
create policy "kostenanfragen lesen" on public.kosten_anfragen for select to authenticated
  using (
    created_by = auth.uid()
    or ist_vorsitz(tag)
    or has_perm('finanzen.view') or has_perm('finanzen.manage')
    or ist_aufsichtsrat()
  );

-- Stellen: nur als Vorsitz des eigenen Komitees, nur als "offen"
drop policy if exists "kostenanfragen stellen" on public.kosten_anfragen;
create policy "kostenanfragen stellen" on public.kosten_anfragen for insert to authenticated
  with check (
    created_by = auth.uid() and ist_vorsitz(tag) and status = 'offen'
    and buchung_id is null and decided_by is null
  );

-- Zurückziehen: eigene, solange offen. Kassenwart darf immer löschen.
drop policy if exists "kostenanfragen loeschen" on public.kosten_anfragen;
create policy "kostenanfragen loeschen" on public.kosten_anfragen for delete to authenticated
  using ((created_by = auth.uid() and status = 'offen') or has_perm('finanzen.manage'));

-- Entscheiden läuft nur über die Funktion unten (kein direktes UPDATE).

create or replace function public.kostenanfrage_entscheiden(
  p_id uuid, p_genehmigt boolean, p_antwort text default '', p_datum date default current_date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  a kosten_anfragen;
  b_id uuid;
begin
  if not has_perm('finanzen.manage') then
    raise exception 'Nur Kassenwart oder Admin dürfen Kostenanfragen entscheiden.';
  end if;
  select * into a from kosten_anfragen where id = p_id for update;
  if not found then raise exception 'Anfrage nicht gefunden.'; end if;
  if a.status <> 'offen' then raise exception 'Die Anfrage wurde schon entschieden.'; end if;

  if p_genehmigt then
    insert into kasse_buchungen (datum, cent, quelle, titel, komitee, anfrage_id, created_by)
    values (coalesce(p_datum, current_date), -a.cent, 'ausgabe', a.titel, a.tag, a.id, auth.uid())
    returning id into b_id;
  end if;

  update kosten_anfragen
     set status = case when p_genehmigt then 'genehmigt' else 'abgelehnt' end,
         antwort = left(coalesce(p_antwort, ''), 500),
         buchung_id = b_id,
         decided_by = auth.uid(),
         decided_at = now()
   where id = p_id;
  return b_id;
end $$;
revoke all on function public.kostenanfrage_entscheiden(uuid, boolean, text, date) from public, anon;
grant execute on function public.kostenanfrage_entscheiden(uuid, boolean, text, date) to authenticated;

-- Realtime
do $$ begin
  alter publication supabase_realtime add table public.kosten_anfragen;
exception when duplicate_object then null; end $$;
