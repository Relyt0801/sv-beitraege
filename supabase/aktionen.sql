-- ============================================================
-- Aktionen mit Schichten (Waffelverkauf & Co.)
-- ============================================================
-- Eine Aktion ist die Ausschreibung ("Waffelverkauf", 5 %, Icon 🧇).
-- Eine Schicht ist ein konkreter Termin dazu. Schichten sind bewusst ganz
-- normale Zeilen in "termine": dann stehen sie ohne Extrawurst im Kalender,
-- die Sichtbarkeit gilt genauso, und eine Zuteilung ist einfach ein Eintrag
-- in termin_personen – womit der Termin automatisch im Kalender der Person
-- auftaucht.
--
-- Wiederholungen werden beim Anlegen ausgerechnet und als einzelne Schichten
-- geschrieben. Kein Regelwerk zur Laufzeit: eine abgesagte Waffelpause lässt
-- sich dann einfach löschen, ohne dass eine Serie auseinanderfällt.

create table if not exists aktionen (
  id uuid primary key default gen_random_uuid(),
  titel text not null,
  icon text not null default '📌',
  beschreibung text not null default '',
  prozent int not null default 5,
  geschlossen boolean not null default false,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

alter table termine add column if not exists aktion_id uuid references aktionen on delete cascade;
alter table termine add column if not exists plaetze int;
alter table termine add column if not exists icon text;

create index if not exists termine_aktion_idx on termine (aktion_id);

create table if not exists aktion_bewerbungen (
  termin_id uuid not null references termine on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (termin_id, user_id)
);

alter table aktionen enable row level security;
alter table aktion_bewerbungen enable row level security;

drop policy if exists "aktionen lesen" on aktionen;
create policy "aktionen lesen" on aktionen for select using (auth.uid() is not null);

drop policy if exists "aktionen pflegen" on aktionen;
create policy "aktionen pflegen" on aktionen for all
  using (ist_team() or has_perm('termine.manage'))
  with check (ist_team() or has_perm('termine.manage'));

drop policy if exists "bewerbungen lesen" on aktion_bewerbungen;
create policy "bewerbungen lesen" on aktion_bewerbungen for select
  using (kann_termin_sehen(termin_id));

-- Eintragen und austragen darf man nur sich selbst.
drop policy if exists "bewerbungen eintragen" on aktion_bewerbungen;
create policy "bewerbungen eintragen" on aktion_bewerbungen for insert
  with check (user_id = auth.uid() and kann_termin_sehen(termin_id));

drop policy if exists "bewerbungen austragen" on aktion_bewerbungen;
create policy "bewerbungen austragen" on aktion_bewerbungen for delete
  using (user_id = auth.uid() or ist_team() or has_perm('termine.manage'));

alter publication supabase_realtime add table aktionen;
alter publication supabase_realtime add table aktion_bewerbungen;

-- Startvorlagen
insert into aktionen (titel, icon, prozent, beschreibung)
select * from (values
  ('Waffelverkauf 1. große Pause', '🧇', 5, 'Waffeln backen und verkaufen in der ersten großen Pause.'),
  ('Waffelverkauf 2. große Pause', '🧇', 5, 'Waffeln backen und verkaufen in der zweiten großen Pause.'),
  ('Kuchen backen',                '🍰', 5, 'Einen Kuchen backen und mitbringen.'),
  ('Waffelteig mitbringen',        '🥣', 5, 'Fertigen Waffelteig für den Verkauf mitbringen.')
) as v(titel, icon, prozent, beschreibung)
where not exists (select 1 from aktionen);
