-- ============================================================
-- Stufenkasse – Halbjahresbeiträge, Eltern-Konten, Bankdaten
--
-- Im Supabase SQL-Editor des Hauptprojekts ausführen.
-- Mehrfach ausführbar, nichts geht dabei verloren.
--
-- WICHTIG: Die Kontodaten stehen bewusst NICHT im Quellcode, sondern nur
-- hier in der Datenbank. Wer sie sehen will, muss angemeldet sein.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Zustimmungs-Bildschirm entfällt
--    Statt jede einzelne Regel anzufassen, sagt die Prüffunktion ab sofort
--    immer ja. Die Spalte terms_accepted_at bleibt stehen, stört aber nicht.
-- ------------------------------------------------------------
create or replace function public.has_consented()
returns boolean language sql stable security definer set search_path = public as $$
  select true
$$;

-- ------------------------------------------------------------
-- 2) Beitrag je Halbjahr frei einstellbar
--    Vorher waren 25 € fest im Programm verdrahtet.
--    Neu: EF.1 und EF.2 je 25 €, ab Q1.1 je 50 €.
-- ------------------------------------------------------------
alter table public.app_settings
  add column if not exists beitraege jsonb not null default
    '{"EF.1":25,"EF.2":25,"Q1.1":50,"Q1.2":50,"Q2.1":50,"Q2.2":50}'::jsonb;

update public.app_settings
   set beitraege = coalesce(nullif(beitraege, '{}'::jsonb),
        '{"EF.1":25,"EF.2":25,"Q1.1":50,"Q1.2":50,"Q2.1":50,"Q2.2":50}'::jsonb)
 where id = 1;

-- Kassenwart darf den Reiter Beiträge jetzt auch benutzen.
insert into public.role_permissions (role, perm, allowed) values ('kassenwart', 'beitraege.manage', true)
on conflict (role, perm) do update set allowed = true;

-- Einstellungen speichern: zusätzlich über das Recht erlaubt, nicht nur über die Rolle.
drop policy if exists "settings write" on public.app_settings;
create policy "settings write" on public.app_settings for all to authenticated
  using (public.ist_team() or public.has_perm('beitraege.manage'))
  with check (public.ist_team() or public.has_perm('beitraege.manage'));

-- ------------------------------------------------------------
-- 3) Neue Rolle: eltern
-- ------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('schueler','stufenteam','kassenwart','admin','sprecher','stv_sprecher','eltern'));

alter table public.role_permissions drop constraint if exists role_permissions_role_check;
alter table public.role_permissions add constraint role_permissions_role_check
  check (role in ('schueler','stufenteam','kassenwart','admin','sprecher','stv_sprecher','eltern'));

-- Eltern bekommen ausdrücklich keine der vorhandenen Befugnisse.
insert into public.role_permissions (role, perm, allowed)
select 'eltern', perm, false from (
  select distinct perm from public.role_permissions
) q
on conflict (role, perm) do nothing;

create or replace function public.ist_eltern()
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role() = 'eltern'
$$;

-- ------------------------------------------------------------
-- 4) Welche Kinder gehören zu welchem Eltern-Konto
--    Geschwister hängen am selben Konto (z. B. Liv und Enni Icking).
-- ------------------------------------------------------------
create table if not exists public.parent_children (
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  primary key (user_id, student_id)
);
alter table public.parent_children enable row level security;

create or replace function public.meine_kinder()
returns setof uuid language sql stable security definer set search_path = public as $$
  select student_id from public.parent_children where user_id = auth.uid()
$$;

drop policy if exists "kinder lesen" on public.parent_children;
create policy "kinder lesen" on public.parent_children for select to authenticated
  using (user_id = auth.uid() or public.ist_team());

drop policy if exists "kinder verwalten" on public.parent_children;
create policy "kinder verwalten" on public.parent_children for all to authenticated
  using (public.has_perm('data.edit')) with check (public.has_perm('data.edit'));

-- ------------------------------------------------------------
-- 5) Eltern dürfen genau ihre Kinder sehen – sonst nichts
-- ------------------------------------------------------------
drop policy if exists "students select" on public.students;
create policy "students select" on public.students for select to authenticated
  using (
    public.ist_team()
    or id = (select student_id from public.profiles where user_id = auth.uid())
    or id in (select public.meine_kinder())
  );

drop policy if exists "contrib select" on public.contributions;
create policy "contrib select" on public.contributions for select to authenticated
  using (
    public.ist_team()
    or public.has_perm('data.edit')
    or student_id = (select student_id from public.profiles where user_id = auth.uid())
    or student_id in (select public.meine_kinder())
  );

-- ------------------------------------------------------------
-- 6) Kontodaten der Stufenkasse
--    Vertraulich: nur für angemeldete Konten lesbar, ändern dürfen sie
--    ausschliesslich Admin und Kassenwart.
-- ------------------------------------------------------------
create table if not exists public.bank_konto (
  id integer primary key default 1,
  inhaber text not null default '',
  iban text not null default '',
  bic text not null default '',
  bank text not null default '',
  hinweis text not null default '',
  updated_at timestamptz not null default now(),
  constraint bank_konto_nur_eine_zeile check (id = 1)
);
alter table public.bank_konto enable row level security;

-- Die echten Kontodaten stehen absichtlich NICHT in dieser Datei, weil sie im
-- Git-Verlauf landen wuerde. Sie werden einmalig direkt im Supabase SQL-Editor
-- eingetragen und sind danach nur noch in der Datenbank zu finden:
--
--   insert into public.bank_konto (id, inhaber, iban, bic, bank, hinweis)
--   values (1, '...', '...', '...', '...', '...')
--   on conflict (id) do update set
--     inhaber = excluded.inhaber, iban = excluded.iban, bic = excluded.bic,
--     bank = excluded.bank, hinweis = excluded.hinweis, updated_at = now();
--
-- Damit die Zeile in jedem Fall existiert, legen wir sie hier leer an.
insert into public.bank_konto (id) values (1) on conflict (id) do nothing;

drop policy if exists "konto lesen" on public.bank_konto;
create policy "konto lesen" on public.bank_konto for select to authenticated using (true);

drop policy if exists "konto aendern" on public.bank_konto;
create policy "konto aendern" on public.bank_konto for all to authenticated
  using (public.my_role() in ('admin','kassenwart'))
  with check (public.my_role() in ('admin','kassenwart'));

-- ------------------------------------------------------------
-- 7) Infos, die das Stufenteam für die Eltern anheftet
-- ------------------------------------------------------------
create table if not exists public.eltern_infos (
  id uuid primary key default gen_random_uuid(),
  titel text not null default '',
  text text not null default '',
  angeheftet boolean not null default false,
  autor uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.eltern_infos enable row level security;

drop policy if exists "infos lesen" on public.eltern_infos;
create policy "infos lesen" on public.eltern_infos for select to authenticated using (true);

drop policy if exists "infos schreiben" on public.eltern_infos;
create policy "infos schreiben" on public.eltern_infos for all to authenticated
  using (public.ist_team()) with check (public.ist_team());

-- ------------------------------------------------------------
-- 8) Anfragen der Eltern ans Stufenteam
-- ------------------------------------------------------------
create table if not exists public.eltern_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  betreff text not null default '',
  erledigt boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.eltern_tickets enable row level security;

create table if not exists public.eltern_ticket_nachrichten (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.eltern_tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null default '',
  created_at timestamptz not null default now()
);
alter table public.eltern_ticket_nachrichten enable row level security;

drop policy if exists "tickets lesen" on public.eltern_tickets;
create policy "tickets lesen" on public.eltern_tickets for select to authenticated
  using (user_id = auth.uid() or public.ist_team());

drop policy if exists "tickets anlegen" on public.eltern_tickets;
create policy "tickets anlegen" on public.eltern_tickets for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "tickets pflegen" on public.eltern_tickets;
create policy "tickets pflegen" on public.eltern_tickets for update to authenticated
  using (public.ist_team() or user_id = auth.uid())
  with check (public.ist_team() or user_id = auth.uid());

drop policy if exists "ticketnachrichten lesen" on public.eltern_ticket_nachrichten;
create policy "ticketnachrichten lesen" on public.eltern_ticket_nachrichten for select to authenticated
  using (
    public.ist_team()
    or ticket_id in (select id from public.eltern_tickets where user_id = auth.uid())
  );

drop policy if exists "ticketnachrichten schreiben" on public.eltern_ticket_nachrichten;
create policy "ticketnachrichten schreiben" on public.eltern_ticket_nachrichten for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      public.ist_team()
      or ticket_id in (select id from public.eltern_tickets where user_id = auth.uid())
    )
  );

-- ------------------------------------------------------------
-- 9) Realtime
-- ------------------------------------------------------------
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.eltern_infos'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.eltern_tickets'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.eltern_ticket_nachrichten'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.parent_children'; exception when duplicate_object then null; end;
end $$;
