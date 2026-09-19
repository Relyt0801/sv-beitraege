-- ============================================================
-- Benachrichtigungen: Diagnose und Geräte-Übernahme
-- ============================================================

-- Jeder Anmeldeversuch für Benachrichtigungen, mit Browser-Kennung.
-- So sieht man auf dem Server, WARUM ein Firefox kein Abo bekommt, statt
-- nur, DASS keins ankam. Lesen darf nur das Team; schreiben jeder nur für sich.
create table if not exists push_diagnose (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  ua text not null default '',
  schritt text not null default '',
  fehler text not null default '',
  erlaubnis text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists push_diagnose_zeit on push_diagnose (created_at desc);
alter table push_diagnose enable row level security;

drop policy if exists "diagnose schreiben" on push_diagnose;
create policy "diagnose schreiben" on push_diagnose for insert
  with check (user_id = auth.uid());

drop policy if exists "diagnose lesen" on push_diagnose;
create policy "diagnose lesen" on push_diagnose for select
  using (ist_team());

-- Ein Gerät, zwei Konten: meldet sich jemand anderes auf demselben Browser an,
-- gehört das Abo ab jetzt ihm. Mit der normalen Regel ("nur eigene Zeilen")
-- scheiterte das still, weil die Zeile noch dem alten Konto gehörte – das neue
-- Konto bekam dann nie etwas.
create or replace function push_abo_uebernehmen(p_endpoint text, p_subscription jsonb)
  returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then
    raise exception 'nicht angemeldet';
  end if;
  delete from push_subscriptions where endpoint = p_endpoint and user_id <> auth.uid();
  insert into push_subscriptions (user_id, endpoint, subscription)
  values (auth.uid(), p_endpoint, p_subscription)
  on conflict (endpoint) do update set subscription = excluded.subscription;
end;
$$;
revoke all on function push_abo_uebernehmen(text, jsonb) from public, anon;
grant execute on function push_abo_uebernehmen(text, jsonb) to authenticated;

-- Alte Diagnosezeilen nicht ewig aufheben.
delete from push_diagnose where created_at < now() - interval '30 days';
