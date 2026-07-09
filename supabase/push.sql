-- ============================================================
-- Stufenkasse – Push-Abos (Web-Push Benachrichtigungen)
-- Nach roles.sql + events.sql im SQL Editor ausführen. Idempotent.
-- ============================================================

create table if not exists public.push_subscriptions (
  endpoint     text primary key,
  user_id      uuid references auth.users(id) on delete cascade,
  subscription jsonb not null,
  created_at   timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Jeder verwaltet nur seine eigenen Geräte-Abos.
-- (Die Edge Function liest mit dem service_role-Key und umgeht RLS.)
drop policy if exists "push own" on public.push_subscriptions;
create policy "push own" on public.push_subscriptions for all to authenticated
  using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );
