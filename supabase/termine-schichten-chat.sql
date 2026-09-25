-- =====================================================================
-- Termine: Farben, Ferien, Schicht-Abschluss · Chat: Sperr-Zeilen
-- Stand 25.09.2026. Einmal im SQL Editor ausführen (idempotent).
-- Enthält keine Namen, Kennungen oder Schlüssel.
-- =====================================================================

-- ------------------------------------------------------------ Termine
alter table public.termine add column if not exists farbe text;
alter table public.termine add column if not exists frei boolean not null default false;
-- Schicht-Abschluss: 'vergeben' = Beitragspunkte eingetragen, 'ohne' = bewusst nicht
alter table public.termine add column if not exists abschluss text;
alter table public.termine add column if not exists abschluss_at timestamptz;
alter table public.termine add column if not exists abschluss_von uuid references auth.users(id) on delete set null;
alter table public.termine add column if not exists abschluss_gemeldet_at timestamptz;

do $$ begin
  alter table public.termine add constraint termine_farbe_check check (farbe is null or farbe ~ '^[a-z]{3,12}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.termine add constraint termine_abschluss_check check (abschluss is null or abschluss in ('vergeben','ohne'));
exception when duplicate_object then null; end $$;

-- Wann ein Termin vorbei ist (Schulzeit = Europe/Berlin). Ganztägig: Tagesende.
create or replace function public.termin_ende(t public.termine)
returns timestamptz language sql stable set search_path = public as $$
  select ((coalesce(t.bis_datum, t.datum)
           + coalesce(t.bis, t.von + interval '45 minutes', time '23:59'))::timestamp)
         at time zone 'Europe/Berlin'
$$;

-- Schicht abschließen: Eingeteilte bekommen die Beitragspunkte der Aktion –
-- genau einmal. Nur das Team bzw. wer Mithilfe eintragen darf.
create or replace function public.schicht_abschliessen(tid uuid, vergeben boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare
  t public.termine;
  a public.aktionen;
  ziel int;
  n int := 0;
begin
  if auth.uid() is null or not (public.ist_team() or public.has_perm('hilfen.edit')) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select * into t from public.termine where id = tid for update;
  if not found then raise exception 'Termin nicht gefunden' using errcode = 'P0002'; end if;
  if t.abschluss is not null then return 0; end if;   -- schon erledigt
  if t.aktion_id is null then raise exception 'Das ist keine Schicht' using errcode = 'P0001'; end if;
  select * into a from public.aktionen where id = t.aktion_id;

  if vergeben and coalesce(a.prozent, 0) > 0 then
    select coalesce(ziel_punkte, 100) into ziel from public.app_settings where id = 1;
    insert into public.contributions (student_id, titel, punkte, datum, created_by)
    select tp.student_id, a.titel, greatest(1, round(a.prozent * coalesce(ziel, 100) / 100.0))::int, t.datum, auth.uid()
      from public.termin_personen tp where tp.termin_id = tid;
    get diagnostics n = row_count;
  end if;

  update public.termine
     set abschluss = case when vergeben then 'vergeben' else 'ohne' end,
         abschluss_at = now(), abschluss_von = auth.uid()
   where id = tid;
  return n;
end $$;
revoke all on function public.schicht_abschliessen(uuid, boolean) from public, anon;
grant execute on function public.schicht_abschliessen(uuid, boolean) to authenticated;

-- Offene Schicht-Enden für die Push-Meldung ans Team (nur der Server ruft das).
create or replace function public.schicht_enden_offen()
returns table(id uuid, titel text, icon text, datum date, personen int)
language sql stable security definer set search_path = public as $$
  select t.id, t.titel, coalesce(t.icon, a.icon), t.datum,
         (select count(*) from public.termin_personen tp where tp.termin_id = t.id)::int
    from public.termine t join public.aktionen a on a.id = t.aktion_id
   where t.abschluss is null and t.abschluss_gemeldet_at is null
     and coalesce(a.prozent, 0) > 0
     and public.termin_ende(t) < now()
     and public.termin_ende(t) > now() - interval '14 days'
     and exists (select 1 from public.termin_personen tp where tp.termin_id = t.id)
$$;
revoke all on function public.schicht_enden_offen() from public, anon, authenticated;

-- ------------------------------------------------------------ Chat
-- Systemzeilen ("… wurde gesperrt") schreibt nur der Server.
alter table public.topic_items drop constraint if exists topic_items_type_check;
alter table public.topic_items add constraint topic_items_type_check
  check (type = any (array['nachricht','todo','umfrage','system']));

drop policy if exists "titems insert" on public.topic_items;
create policy "titems insert" on public.topic_items for insert to authenticated
  with check (can_write_topic(topic_id) and created_by = (select auth.uid())
              and not (select is_banned()) and type <> 'system');

-- Fremde Einträge ändern: nur Moderation/Team. Alle anderen dürfen bei
-- fremden Einträgen nur To-dos abhaken. Vorher durfte jeder mit Zugriff
-- jeden Text ändern oder fremde Pins lösen.
create or replace function public.guard_topic_item_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.type is distinct from old.type or new.topic_id is distinct from old.topic_id
     or new.created_by is distinct from old.created_by or new.author is distinct from old.author then
    raise exception 'Das lässt sich nicht ändern' using errcode = '42501';
  end if;
  if old.type = 'system' and not public.has_perm('chats.delete_messages') then
    raise exception 'Das lässt sich nicht ändern' using errcode = '42501';
  end if;
  if old.created_by = auth.uid() or public.ist_team()
     or public.has_perm('chats.delete_messages') or public.has_perm('chats.manage') then
    return new;
  end if;
  if old.type = 'todo'
     and (new.body, new.title, new.options, new.pinned, new.poll_multi, new.poll_anon, new.poll_deadline, new.author_role, new.author_koms)
         is not distinct from
         (old.body, old.title, old.options, old.pinned, old.poll_multi, old.poll_anon, old.poll_deadline, old.author_role, old.author_koms) then
    return new;
  end if;
  raise exception 'Nur wer es geschrieben hat oder moderiert, darf das ändern' using errcode = '42501';
end $$;
drop trigger if exists guard_topic_item_update on public.topic_items;
create trigger guard_topic_item_update before update on public.topic_items
  for each row execute function public.guard_topic_item_update();

-- Sperren direkt im Chat: setzt die Sperre und schreibt eine Zeile ohne
-- Absender in den Chat. Das geschützte OP-Konto lässt sich nie sperren.
create or replace function public.chat_sperren(ziel uuid, bis timestamptz, dauerhaft boolean, topic uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  ich uuid := auth.uid();
  ich_op boolean;
  name_ziel text; vorname_ziel text; name_mod text;
begin
  if ich is null or not public.has_perm('mod.timeout') then
    raise exception 'Keine Berechtigung zum Sperren' using errcode = '42501';
  end if;
  if ziel = ich then raise exception 'Sich selbst sperren geht nicht' using errcode = 'P0001'; end if;
  if ziel = public.op_user() or exists (select 1 from public.profiles where user_id = ziel and is_op) then
    raise exception 'Dieses Konto ist geschützt' using errcode = '42501';
  end if;

  -- läuft mit den Rechten der Person (guard_role_change prüft mod.timeout)
  update public.profiles
     set chat_banned_until = case when dauerhaft then null else bis end,
         chat_ban_permanent = coalesce(dauerhaft, false)
   where user_id = ziel;

  if topic is null or not public.can_access_topic(topic) then return; end if;

  select coalesce(nullif(trim(s.vorname || ' ' || s.nachname), ''), p.username), coalesce(s.vorname, p.username)
    into name_ziel, vorname_ziel
    from public.profiles p left join public.students s on s.id = p.student_id where p.user_id = ziel;
  select coalesce(nullif(trim(s.vorname || ' ' || s.nachname), ''), p.username), p.is_op
    into name_mod, ich_op
    from public.profiles p left join public.students s on s.id = p.student_id where p.user_id = ich;

  insert into public.topic_items (topic_id, type, body, author, created_by)
  values (topic, 'system',
          case when ich_op then 'Relyt hat ' || coalesce(vorname_ziel, 'jemanden') || ' in die stille Ecke verbannt'
               else coalesce(name_ziel, 'Jemand') || ' wurde von Moderator ' || coalesce(name_mod, 'Moderation') || ' gesperrt' end,
          '', null);
end $$;
revoke all on function public.chat_sperren(uuid, timestamptz, boolean, uuid) from public, anon;
grant execute on function public.chat_sperren(uuid, timestamptz, boolean, uuid) to authenticated;

-- ------------------------------------------------------------ Push bei Schicht-Ende
-- Alle 5 Minuten: gibt es eine beendete Schicht, für die das Team noch keine
-- Meldung bekommen hat, ruft die Datenbank send-push auf ({"schicht_ende":true}).
-- send-push sucht die Schichten selbst heraus (schicht_enden_offen) und
-- markiert sie – der Aufruf enthält keinen Text und keine Empfänger.
-- <PROJEKT> durch die eigene Projektkennung ersetzen (steht in der Supabase-URL),
-- <ANON_KEY> durch den öffentlichen anon-Schlüssel (Settings → API; derselbe,
-- der ohnehin in der App steckt – NICHT den service_role-Schlüssel).
create extension if not exists pg_net with schema extensions;

create or replace function public.schicht_ende_anstossen()
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.schicht_enden_offen()) then
    perform net.http_post(
      url := 'https://<PROJEKT>.supabase.co/functions/v1/send-push',
      body := '{"schicht_ende": true}'::jsonb,
      headers := jsonb_build_object('content-type', 'application/json',
        'authorization', 'Bearer <ANON_KEY>')
    );
  end if;
end $$;
revoke all on function public.schicht_ende_anstossen() from public, anon, authenticated;

select cron.unschedule('schicht-ende') where exists (select 1 from cron.job where jobname = 'schicht-ende');
select cron.schedule('schicht-ende', '*/5 * * * *', 'select public.schicht_ende_anstossen()');
