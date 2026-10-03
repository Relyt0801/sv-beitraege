-- =====================================================================
-- Update 1.1 – Chats (03.10.2026)
-- Einmal im SQL Editor ausführen (idempotent). Keine Namen, keine Schlüssel.
--
-- 1. Gelesen-Markierung mit Serverzeit und getrennt für Chat / Übersicht
--    (vorher Gerätezeit – eine nachgehende Uhr ließ Gelesenes ungelesen).
-- 2. Reaktionen auf Nachrichten (👍 👎 🔥 😢 😂 ❓), eine pro Person.
-- 3. Mitteilungs-Schalter je Kategorie fürs Team (profiles.mitteilungen):
--    {"schueler": bool, "eltern": bool, "anfragen": bool,
--     "komitees": {"<slug>": bool}}  – fehlender Eintrag = Standard.
-- =====================================================================

-- ---------------------------------------------------------------- 1
alter table public.topic_reads add column if not exists last_read_uebersicht timestamptz;

create or replace function public.chat_gelesen(p_topic uuid, p_bereich text default 'chat')
returns timestamptz language plpgsql security invoker set search_path = public as $$
declare
  jetzt timestamptz := now();
begin
  if auth.uid() is null then return null; end if;
  if p_bereich = 'uebersicht' then
    insert into topic_reads (topic_id, user_id, last_read, last_read_uebersicht)
    values (p_topic, auth.uid(), '1970-01-01', jetzt)
    on conflict (topic_id, user_id) do update set last_read_uebersicht = excluded.last_read_uebersicht;
  else
    insert into topic_reads (topic_id, user_id, last_read)
    values (p_topic, auth.uid(), jetzt)
    on conflict (topic_id, user_id) do update set last_read = excluded.last_read;
  end if;
  return jetzt;
end $$;
revoke all on function public.chat_gelesen(uuid, text) from public, anon;
grant execute on function public.chat_gelesen(uuid, text) to authenticated;

-- ---------------------------------------------------------------- 2
create table if not exists public.topic_reaktionen (
  item_id uuid not null references public.topic_items(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- 👍 👎 🔥 😢 😂 ❓ (als Codepunkte, damit der SQL-Editor nicht stolpert)
  emoji text not null check (emoji in (U&'\+01F44D', U&'\+01F44E', U&'\+01F525', U&'\+01F622', U&'\+01F602', U&'\+002753')),
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
alter table public.topic_reaktionen enable row level security;

drop policy if exists "reaktion lesen" on public.topic_reaktionen;
create policy "reaktion lesen" on public.topic_reaktionen for select to authenticated
  using (exists (select 1 from public.topic_items i where i.id = item_id and public.can_access_topic(i.topic_id)));

drop policy if exists "reaktion setzen" on public.topic_reaktionen;
create policy "reaktion setzen" on public.topic_reaktionen for insert to authenticated
  with check (
    user_id = (select auth.uid()) and not (select public.is_banned())
    and exists (select 1 from public.topic_items i where i.id = item_id and public.can_write_topic(i.topic_id))
  );

drop policy if exists "reaktion aendern" on public.topic_reaktionen;
create policy "reaktion aendern" on public.topic_reaktionen for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "reaktion loeschen" on public.topic_reaktionen;
create policy "reaktion loeschen" on public.topic_reaktionen for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.has_perm('chats.delete_messages')));

create index if not exists topic_reaktionen_item_idx on public.topic_reaktionen (item_id);

do $$ begin
  alter publication supabase_realtime add table public.topic_reaktionen;
exception when duplicate_object then null; when undefined_object then null; end $$;
-- Beim Löschen muss Realtime die item_id mitschicken
alter table public.topic_reaktionen replica identity full;

-- ---------------------------------------------------------------- 3
alter table public.profiles add column if not exists mitteilungen jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------- 4
-- Wer gerade in der App ist, bekommt keine Pop-ups (send-push filtert).
-- Die App meldet sich alle 30 s, solange sie sichtbar ist (bin_aktiv(true)),
-- und beim Verlassen ab (bin_aktiv(false)). Nicht in Realtime.
create table if not exists public.app_aktiv (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bis timestamptz not null
);
alter table public.app_aktiv enable row level security;
drop policy if exists "aktiv eigen" on public.app_aktiv;
create policy "aktiv eigen" on public.app_aktiv for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create or replace function public.bin_aktiv(p_an boolean)
returns void language sql security invoker set search_path = public as $$
  insert into app_aktiv (user_id, bis)
  values (auth.uid(), case when p_an then now() + interval '50 seconds' else now() end)
  on conflict (user_id) do update set bis = excluded.bis;
$$;
revoke all on function public.bin_aktiv(boolean) from public, anon;
grant execute on function public.bin_aktiv(boolean) to authenticated;
