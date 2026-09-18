-- ============================================================
-- Termine (Schritt 1): Einzeltermine mit Sichtbarkeit
-- ============================================================
-- Datum und Uhrzeit stehen bewusst als date/time getrennt, nicht als
-- timestamptz. Ein Termin um 14:00 ist 14:00 in Borken – egal in welcher
-- Zeitzone das Handy gerade steht. Mit timestamptz waere die Uhrzeit im
-- Ausland oder bei falsch gestellter Geraetezeit verschoben.
--   von is null        -> ganztaegig
--   bis_datum is null  -> eintaegig

create table if not exists termine (
  id uuid primary key default gen_random_uuid(),
  titel text not null,
  beschreibung text not null default '',
  ort text not null default '',
  datum date not null,
  bis_datum date,
  von time,
  bis time,
  sichtbar text not null default 'alle' check (sichtbar in ('alle','komitee','personen')),
  fuer_eltern boolean not null default false,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  constraint termin_zeitraum check (bis_datum is null or bis_datum >= datum)
);

create table if not exists termin_komitees (
  termin_id uuid not null references termine on delete cascade,
  tag text not null,
  primary key (termin_id, tag)
);

create table if not exists termin_personen (
  termin_id uuid not null references termine on delete cascade,
  student_id uuid not null references students on delete cascade,
  primary key (termin_id, student_id)
);

create index if not exists termine_datum_idx on termine (datum);

-- ------------------------------------------------------------
-- Wer bin ich, kalendarisch?
-- ------------------------------------------------------------
-- Eltern zaehlen als ihre Kinder: ein Termin fuer Livs Komitee ist auch
-- ein Termin, der die Familie angeht.

create or replace function meine_personen() returns setof uuid
  language sql stable security definer set search_path to 'public' as $$
  select p.student_id from profiles p
   where p.user_id = auth.uid() and p.student_id is not null
  union
  select * from meine_kinder()
$$;

create or replace function meine_komitees() returns setof text
  language sql stable security definer set search_path to 'public' as $$
  select g.tag from tag_members g where g.user_id = auth.uid()
  union
  select g.tag from tag_members g
    join profiles p on p.user_id = g.user_id
   where p.student_id in (select * from meine_kinder())
$$;

-- ------------------------------------------------------------
-- Darf ich diesen Termin ueberhaupt sehen?
-- ------------------------------------------------------------
-- Versteckte Termine sind fuer Unberechtigte komplett unsichtbar – es steht
-- auch kein "belegt" im Kalender. Eltern sehen nur, was ausdruecklich fuer
-- sie freigegeben ist.

create or replace function kann_termin_sehen(tid uuid) returns boolean
  language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from termine t
     where t.id = tid
       and (
         ist_team()
         or (
           (not ist_eltern() or t.fuer_eltern)
           and (
             t.sichtbar = 'alle'
             or (t.sichtbar = 'komitee' and exists (
                   select 1 from termin_komitees tk
                    where tk.termin_id = t.id
                      and tk.tag in (select * from meine_komitees())))
             or (t.sichtbar = 'personen' and exists (
                   select 1 from termin_personen tp
                    where tp.termin_id = t.id
                      and tp.student_id in (select * from meine_personen())))
           )
         )
       )
  )
$$;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table termine enable row level security;
alter table termin_komitees enable row level security;
alter table termin_personen enable row level security;

drop policy if exists "termine lesen" on termine;
create policy "termine lesen" on termine for select using (kann_termin_sehen(id));

drop policy if exists "termine pflegen" on termine;
create policy "termine pflegen" on termine for all
  using (ist_team() or has_perm('termine.manage'))
  with check (ist_team() or has_perm('termine.manage'));

drop policy if exists "terminkomitees lesen" on termin_komitees;
create policy "terminkomitees lesen" on termin_komitees for select using (kann_termin_sehen(termin_id));

drop policy if exists "terminkomitees pflegen" on termin_komitees;
create policy "terminkomitees pflegen" on termin_komitees for all
  using (ist_team() or has_perm('termine.manage'))
  with check (ist_team() or has_perm('termine.manage'));

drop policy if exists "terminpersonen lesen" on termin_personen;
create policy "terminpersonen lesen" on termin_personen for select using (kann_termin_sehen(termin_id));

drop policy if exists "terminpersonen pflegen" on termin_personen;
create policy "terminpersonen pflegen" on termin_personen for all
  using (ist_team() or has_perm('termine.manage'))
  with check (ist_team() or has_perm('termine.manage'));

-- ------------------------------------------------------------
-- Recht "termine.manage" – Standard wie die uebrigen Teamrechte
-- ------------------------------------------------------------
insert into role_permissions (role, perm, allowed) values
  ('stufenteam','termine.manage',true),
  ('kassenwart','termine.manage',true),
  ('sprecher','termine.manage',true),
  ('stv_sprecher','termine.manage',true),
  ('schueler','termine.manage',false),
  ('eltern','termine.manage',false)
on conflict (role, perm) do update set allowed = excluded.allowed;

-- Realtime
-- Mit Schutz gegen doppeltes Ausfuehren: ohne ihn bricht das ganze Skript ab,
-- sobald es ein zweites Mal laeuft - und man weiss nicht, was davor noch
-- durchgelaufen ist und was nicht.
do $$ begin alter publication supabase_realtime add table termine;         exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table termin_komitees; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table termin_personen; exception when duplicate_object then null; end $$;
