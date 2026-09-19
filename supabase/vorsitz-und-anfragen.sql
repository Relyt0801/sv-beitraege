-- ============================================================
-- Termine (Schritt 2): Komiteevorsitz und Terminanfragen
-- ============================================================
-- Jedes Komitee hat GENAU ZWEI Vorsitzende. Sie duerfen keine Termine
-- eintragen, sondern nur anfragen – eintragen darf weiterhin nur das
-- Stufenteam. So bleibt der Kalender in einer Hand, aber die Komitees
-- muessen nicht mehr ueber den Chat betteln.

create table if not exists komitee_vorsitz (
  tag text not null,
  user_id uuid not null references auth.users on delete cascade,
  gesetzt_von uuid references auth.users on delete set null,
  gesetzt_am timestamptz not null default now(),
  primary key (tag, user_id)
);

-- Zwei, nicht drei. Die Grenze steht in der Datenbank und nicht nur im
-- Formular – sonst haengt sie an der Oberflaeche, die man umgehen kann.
create or replace function vorsitz_hoechstens_zwei() returns trigger
  language plpgsql as $$
begin
  if (select count(*) from komitee_vorsitz where tag = new.tag) > 2 then
    raise exception 'Ein Komitee hat hoechstens zwei Vorsitzende.';
  end if;
  return null;
end;
$$;

drop trigger if exists vorsitz_grenze on komitee_vorsitz;
create constraint trigger vorsitz_grenze
  after insert on komitee_vorsitz
  deferrable initially immediate
  for each row execute function vorsitz_hoechstens_zwei();

-- ------------------------------------------------------------
-- Bin ich Vorsitz?
-- ------------------------------------------------------------
create or replace function meine_vorsitze() returns setof text
  language sql stable security definer set search_path to 'public' as $$
  select v.tag from komitee_vorsitz v where v.user_id = auth.uid()
$$;

create or replace function ist_vorsitz(p_tag text) returns boolean
  language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from komitee_vorsitz v
     where v.user_id = auth.uid() and v.tag = p_tag
  )
$$;

alter table komitee_vorsitz enable row level security;

-- Wer Vorsitz ist, ist kein Geheimnis: jeder Angemeldete darf es sehen.
drop policy if exists "vorsitz lesen" on komitee_vorsitz;
create policy "vorsitz lesen" on komitee_vorsitz for select
  using (auth.uid() is not null);

drop policy if exists "vorsitz pflegen" on komitee_vorsitz;
create policy "vorsitz pflegen" on komitee_vorsitz for all
  using (ist_team() or has_perm('komitees.assign'))
  with check (ist_team() or has_perm('komitees.assign'));

-- ------------------------------------------------------------
-- Terminanfragen
-- ------------------------------------------------------------
-- Bewusst eine eigene Tabelle und kein Termin mit Status: eine Anfrage ist
-- kein Termin. Sie darf im Kalender nirgends auftauchen, auch nicht als
-- graue Vorschau – sonst stehen dort Dinge, die nie stattfinden.
--
-- Beim Annehmen oeffnet sich das normale Terminformular, vorausgefuellt.
-- Das Stufenteam legt also weiterhin selbst an und entscheidet dabei ueber
-- Sichtbarkeit und Uhrzeit; die Anfrage wird danach als erledigt abgehakt.

create table if not exists termin_requests (
  id uuid primary key default gen_random_uuid(),
  tag text not null,
  titel text not null,
  ort text not null default '',
  nachricht text not null default '',
  datum date not null,
  bis_datum date,
  von time,
  bis time,
  status text not null default 'offen' check (status in ('offen','angenommen','abgelehnt')),
  created_by uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users on delete set null,
  decided_at timestamptz,
  antwort text not null default '',
  constraint anfrage_zeitraum check (bis_datum is null or bis_datum >= datum)
);

create index if not exists termin_requests_status_idx on termin_requests (status, created_at desc);

alter table termin_requests enable row level security;

-- Sehen: das Team alles, sonst nur die eigenen Anfragen.
drop policy if exists "anfragen lesen" on termin_requests;
create policy "anfragen lesen" on termin_requests for select
  using (ist_team() or has_perm('termine.manage') or created_by = auth.uid());

-- Stellen: nur Vorsitzende, und nur fuer ihr eigenes Komitee.
drop policy if exists "anfragen stellen" on termin_requests;
create policy "anfragen stellen" on termin_requests for insert
  with check (created_by = auth.uid() and ist_vorsitz(tag));

-- Entscheiden: nur das Team.
drop policy if exists "anfragen entscheiden" on termin_requests;
create policy "anfragen entscheiden" on termin_requests for update
  using (ist_team() or has_perm('termine.manage'))
  with check (ist_team() or has_perm('termine.manage'));

-- Zuruecknehmen: die eigene, solange sie offen ist. Und das Team immer.
drop policy if exists "anfragen zuruecknehmen" on termin_requests;
create policy "anfragen zuruecknehmen" on termin_requests for delete
  using ((created_by = auth.uid() and status = 'offen') or ist_team() or has_perm('termine.manage'));

-- Realtime – doppeltes Hinzufuegen waere ein Fehler, darum vorher fragen.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'komitee_vorsitz') then
    alter publication supabase_realtime add table komitee_vorsitz;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'termin_requests') then
    alter publication supabase_realtime add table termin_requests;
  end if;
end $$;
