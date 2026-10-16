-- =====================================================================
-- Offiziell/Inoffiziell je Bereich schaltbar, „nach inoffiziell“ mit einer
-- Zustimmung, Motto-Vorschläge löschen (16.10.2026, Runde 8)
--
-- 1) app_settings.teile = {"motto":true,"zitate":true,"rankings":true,"kommentare":true}
--    true = Aufteilung offiziell/inoffiziell an (wie bisher). Aus: die App
--    zeigt alles in EINEM Bereich mit allgemeinem Namen, Neues landet im
--    Teil 'offiziell' (Wortfilter wie offiziell), Runden und Gewinner laufen
--    in der Gruppe 'offiziell'. Die Daten bleiben unverändert – schaltet man
--    wieder an, liegt alles im alten Teil.
--    Schalten nur über teile_setzen() – gleiches Recht wie Verschieben im
--    Bereich, Admin immer. Ein Trigger schützt die Spalte vor direktem
--    Schreiben (das Team darf app_settings sonst direkt ändern).
-- 2) Verschieben nach inoffiziell: EINE Zustimmung reicht (die eigene, also
--    sofort). Nach offiziell: wie bisher Profil → Freigaben → „Verschieben“.
-- 3) Motto-Vorschläge löschen (Komitee = motto.verwalten, Admin):
--    motto_loeschen(id) leert den Vorschlag und markiert ihn (geloescht_at);
--    der Text steht nur noch im Protokoll. Keine Benachrichtigung. Nicht für
--    Kandidaten einer laufenden Runde und nicht für gekürte Gewinner.
--
-- Ohne DELETE/DROP-Anweisungen: nur Spalten/Funktionen hinzufügen bzw.
-- Funktionen mit gleicher Signatur ersetzen. Keine Personendaten.
-- =====================================================================
set lock_timeout = '5s';

-- ---------------------------------------------------------------------
-- 1) Aufteilung je Bereich
-- ---------------------------------------------------------------------
alter table public.app_settings add column if not exists teile jsonb not null
  default '{"motto": true, "zitate": true, "rankings": true, "kommentare": true}'::jsonb;

-- Wer darf die Aufteilung eines Bereichs schalten?
create or replace function public.teile_recht(p_bereich text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role() = 'admin' or case p_bereich
    when 'motto' then public.has_perm('motto.verwalten')
    when 'zitate' then public.has_perm('zitate.pruefen')
    when 'rankings' then public.has_perm('rankings.verwalten')
    when 'kommentare' then public.has_perm('album.moderieren')
    else false end
$$;

create or replace function public.teile_schuetzen()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.teile is distinct from old.teile
     and coalesce(current_setting('sv.teile', true), '') <> '1'
     and coalesce(current_setting('sv.wiederherstellung', true), '') <> '1' then
    raise exception 'Die Aufteilung offiziell/inoffiziell bitte in den Einstellungen des Bereichs ändern.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.teile_schuetzen() from public, anon, authenticated;
create or replace trigger teile_schuetzen before update of teile on public.app_settings
  for each row execute function public.teile_schuetzen();

create or replace function public.teile_setzen(p_bereich text, p_an boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare neu jsonb;
begin
  if p_bereich not in ('motto', 'zitate', 'rankings', 'kommentare') then raise exception 'Unbekannter Bereich'; end if;
  if auth.uid() is null or not public.teile_recht(p_bereich) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  perform set_config('sv.teile', '1', true);
  update public.app_settings set teile = coalesce(teile, '{}'::jsonb) || jsonb_build_object(p_bereich, p_an)
   where id = 1 returning teile into neu;
  perform set_config('sv.teile', '', true);
  perform public.audit_schreiben('teile.geschaltet', 'inhalte', null, p_bereich,
    'Offiziell/Inoffiziell bei „' || p_bereich || '“ ' || case when p_an then 'eingeschaltet' else 'ausgeschaltet' end,
    jsonb_build_object('bereich', p_bereich, 'an', p_an));
  return neu;
end $$;
revoke all on function public.teile_setzen(text, boolean) from public, anon;
grant execute on function public.teile_setzen(text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 2) Nötige Zustimmungen je Richtung
-- ---------------------------------------------------------------------
create or replace function public.verschieben_noetig(p_nach text)
returns int language sql stable security definer set search_path = public as $$
  select case when p_nach = 'inoffiziell' then 1 else public.zustimmung_noetig('verschieben') end
$$;

create or replace function public.verschieben_zustimmen(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.verschiebungen;
  z int;
  noetig int;
  fertig boolean;
begin
  select * into v from public.verschiebungen where id = p_id;
  if not found or v.erledigt_at is not null then raise exception 'Schon erledigt'; end if;
  if auth.uid() is null or not public.verschieben_recht(v.tabelle) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  -- Nach inoffiziell reicht eine Stimme, nach offiziell die eingestellte Zahl
  noetig := public.verschieben_noetig(v.nach);
  insert into public.verschiebung_zustimmungen (verschiebung_id, user_id) values (p_id, auth.uid())
  on conflict do nothing;
  select count(*) into z from public.verschiebung_zustimmungen where verschiebung_id = p_id;
  fertig := z >= noetig or public.zustimmung_allein();
  if fertig then perform public.verschieben_ausfuehren(p_id); end if;
  return jsonb_build_object('id', p_id, 'stimmen', z, 'noetig', noetig, 'fertig', fertig);
end $$;

create or replace function public.verschiebungen_offen(p_tabelle text)
returns table (id uuid, ziel_id uuid, nach text, titel text, von uuid, created_at timestamptz,
               stimmen int, noetig int, ich boolean)
language sql stable security definer set search_path = public as $$
  select v.id, v.ziel_id, v.nach, v.titel, v.von, v.created_at,
         (select count(*)::int from public.verschiebung_zustimmungen z where z.verschiebung_id = v.id),
         public.verschieben_noetig(v.nach),
         exists (select 1 from public.verschiebung_zustimmungen z where z.verschiebung_id = v.id and z.user_id = auth.uid())
    from public.verschiebungen v
   where v.tabelle = p_tabelle and v.erledigt_at is null and public.verschieben_recht(p_tabelle)
   order by v.created_at
$$;

-- ---------------------------------------------------------------------
-- 3) Motto-Vorschläge löschen (weich: geleert und markiert)
-- ---------------------------------------------------------------------
alter table public.motto_vorschlaege add column if not exists geloescht_at timestamptz;
grant select (geloescht_at) on public.motto_vorschlaege to authenticated;

create or replace function public.motto_loeschen(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.motto_vorschlaege;
begin
  if auth.uid() is null or not (public.has_perm('motto.verwalten') or public.my_role() = 'admin') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select * into m from public.motto_vorschlaege where id = p_id for update;
  if not found or m.geloescht_at is not null then return; end if;
  if m.gewaehlt or exists (select 1 from public.gewinner g where g.bereich = 'motto' and g.ziel_id = p_id::text) then
    raise exception 'Ist als Gewinner gekürt – erst den Gewinner zurücknehmen.';
  end if;
  if exists (select 1 from public.runden_kandidaten k join public.abstimm_runden r on r.id = k.runde_id
              where r.bereich = 'motto' and r.offen and k.ziel_id = p_id::text) then
    raise exception 'Steht in der laufenden Abstimmung – erst nach der Runde löschen.';
  end if;
  -- Erst ins Protokoll (mit dem Text), dann leeren
  perform public.audit_schreiben('motto.geloescht', 'inhalte', null, 'Abimotto',
    'Motto-Vorschlag gelöscht: „' || left(m.text, 80) || '“',
    jsonb_build_object('id', p_id, 'text', m.text, 'erklaerung', m.erklaerung, 'bereich', m.bereich));
  update public.motto_vorschlaege
     set geloescht_at = now(), ausgeblendet = true, text = '(gelöscht)', erklaerung = ''
   where id = p_id;
  -- Offene Verschiebe-Anträge dazu erledigen sich damit
  update public.verschiebungen set erledigt_at = now(), abgelehnt = true
   where tabelle = 'motto_vorschlaege' and ziel_id = p_id and erledigt_at is null;
end $$;
revoke all on function public.motto_loeschen(uuid) from public, anon;
grant execute on function public.motto_loeschen(uuid) to authenticated;
