-- ============================================================
-- Finanzen: Kassenbuch, Zielbetrag, automatische Beitragsbuchungen
-- ============================================================
-- Es gibt keine Verbindung zur Bank. Der Kontostand ist deshalb die Summe
-- aller Buchungen in diesem Kassenbuch. Einmal mit dem echten Stand
-- abgleichen ("Abgleich mit der Bank"), danach bleibt er von allein richtig:
--   * Beitrag auf "bezahlt" gesetzt  -> Einnahme wird automatisch gebucht
--   * "bezahlt" wieder zurückgenommen -> Buchung verschwindet wieder
--   * Waffelverkauf, Spenden, Ausgaben -> Kassenwart trägt sie ein
--
-- Beträge in Cent (integer): keine Rundungsfehler bei 0,10 + 0,20.

create table if not exists kasse_buchungen (
  id uuid primary key default gen_random_uuid(),
  datum date not null default current_date,
  cent integer not null check (cent <> 0),          -- + Einnahme, − Ausgabe
  quelle text not null check (quelle in ('beitrag','aktion','spende','sonstiges','ausgabe','abgleich')),
  titel text not null default '',
  aktion_id uuid references aktionen on delete set null,
  student_id uuid references students on delete set null,
  halbjahr text,
  automatisch boolean not null default false,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists kasse_buchungen_datum on kasse_buchungen (datum desc, created_at desc);
-- Pro Person und Halbjahr höchstens EINE automatische Beitragsbuchung
create unique index if not exists kasse_beitrag_einmal
  on kasse_buchungen (student_id, halbjahr) where automatisch and quelle = 'beitrag' and cent > 0;

create table if not exists kasse_einstellungen (
  id int primary key default 1 check (id = 1),
  ziel_cent integer not null default 0,
  ziel_titel text not null default 'Abiball'
);
insert into kasse_einstellungen (id) values (1) on conflict do nothing;

-- ------------------------------------------------------------
-- Rechte: lesen / verwalten. Admin kann "lesen" im Rechte-Reiter an
-- andere Rollen oder einzelne Personen vergeben.
-- ------------------------------------------------------------
insert into role_permissions (role, perm, allowed) values
  ('kassenwart','finanzen.view',true), ('kassenwart','finanzen.manage',true),
  ('stufenteam','finanzen.view',false), ('stufenteam','finanzen.manage',false),
  ('sprecher','finanzen.view',false), ('sprecher','finanzen.manage',false),
  ('stv_sprecher','finanzen.view',false), ('stv_sprecher','finanzen.manage',false),
  ('schueler','finanzen.view',false), ('schueler','finanzen.manage',false),
  ('eltern','finanzen.view',false), ('eltern','finanzen.manage',false)
on conflict (role, perm) do nothing;

alter table kasse_buchungen enable row level security;
alter table kasse_einstellungen enable row level security;

drop policy if exists "kasse lesen" on kasse_buchungen;
create policy "kasse lesen" on kasse_buchungen for select
  using (has_perm('finanzen.view') or has_perm('finanzen.manage'));
drop policy if exists "kasse pflegen" on kasse_buchungen;
create policy "kasse pflegen" on kasse_buchungen for all
  using (has_perm('finanzen.manage')) with check (has_perm('finanzen.manage'));

drop policy if exists "kassenziel lesen" on kasse_einstellungen;
create policy "kassenziel lesen" on kasse_einstellungen for select
  using (has_perm('finanzen.view') or has_perm('finanzen.manage'));
drop policy if exists "kassenziel pflegen" on kasse_einstellungen;
create policy "kassenziel pflegen" on kasse_einstellungen for update
  using (has_perm('finanzen.manage')) with check (has_perm('finanzen.manage'));

-- ------------------------------------------------------------
-- Automatik: Beitrag bezahlt <-> Buchung
-- ------------------------------------------------------------
-- Läuft in der Datenbank, nicht in der App: so stimmt das Kassenbuch auch,
-- wenn jemand über einen alten Stand, zwei Geräte gleichzeitig oder die
-- Massenbearbeitung ändert.
create or replace function beitrag_buchen() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare
  h text;
  vorher text;
  nachher text;
  betrag int;
  geloescht int;
begin
  foreach h in array array['EF.1','EF.2','Q1.1','Q1.2','Q2.1','Q2.2'] loop
    vorher := coalesce(old.terms -> h ->> 'status', 'offen');
    nachher := coalesce(new.terms -> h ->> 'status', 'offen');
    continue when vorher = nachher;
    betrag := coalesce((select (beitraege ->> h)::int from app_settings where id = 1), 0) * 100;
    continue when betrag = 0;
    if nachher = 'bezahlt' then
      insert into kasse_buchungen (datum, cent, quelle, titel, student_id, halbjahr, automatisch, created_by)
      values (current_date, betrag, 'beitrag',
              'Beitrag ' || h || ' – ' || new.nachname || ', ' || new.vorname,
              new.id, h, true, auth.uid())
      on conflict do nothing;
    elsif vorher = 'bezahlt' then
      delete from kasse_buchungen
       where student_id = new.id and halbjahr = h and automatisch and quelle = 'beitrag' and cent > 0;
      get diagnostics geloescht = row_count;
      -- War die Zahlung von vor dem Kassenbuch (keine eigene Buchung), wird
      -- stattdessen eine Gegenbuchung angelegt.
      if geloescht = 0 then
        insert into kasse_buchungen (datum, cent, quelle, titel, student_id, halbjahr, automatisch, created_by)
        values (current_date, -betrag, 'beitrag',
                'Beitrag ' || h || ' zurückgenommen – ' || new.nachname || ', ' || new.vorname,
                new.id, h, true, auth.uid());
      end if;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists beitrag_buchen on students;
-- Nur UPDATE: ein Import legt Personen neu an, deren Zahlungen schon in der
-- Sammelbuchung stecken – die dürfen nicht doppelt zählen.
create trigger beitrag_buchen after update of terms on students
  for each row execute function beitrag_buchen();

-- ------------------------------------------------------------
-- Nachtrag: was vor dem Kassenbuch schon bezahlt war
-- ------------------------------------------------------------
-- Pro Halbjahr EINE Sammelbuchung statt 111 Einzelzeilen – das genaue
-- Zahlungsdatum kennt niemand mehr.
insert into kasse_buchungen (datum, cent, quelle, titel, halbjahr, automatisch)
select current_date,
       count(*) * coalesce((select (beitraege ->> h)::int from app_settings where id = 1), 0) * 100,
       'beitrag',
       'Beiträge ' || h || ' vor dem Kassenbuch (' || count(*) || ' Personen)',
       h, true
  from students s, unnest(array['EF.1','EF.2','Q1.1','Q1.2','Q2.1','Q2.2']) h
 where s.terms -> h ->> 'status' = 'bezahlt'
   and not exists (select 1 from kasse_buchungen k where k.titel like 'Beiträge ' || h || ' vor dem Kassenbuch%')
 group by h
having count(*) > 0;

-- Realtime: neue Buchungen erscheinen sofort
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'kasse_buchungen') then
    alter publication supabase_realtime add table kasse_buchungen;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'kasse_einstellungen') then
    alter publication supabase_realtime add table kasse_einstellungen;
  end if;
end $$;
