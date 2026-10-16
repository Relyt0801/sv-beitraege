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
--    Kandidaten einer laufenden Wahl und nicht für gekürte Gewinner. Likes
--    zählen danach nicht mehr, Runden zeigen „(gelöscht)“, gekürt werden kann
--    er nicht mehr; geloescht_at ändert nur motto_loeschen (Trigger).
-- 4) Schutz: Ausschalten der Aufteilung erledigt offene Verschiebe-Anträge;
--    das offizielle Motto liegt immer im Teil offiziell (beim Küren wird es
--    dorthin verschoben – mit Wortfilter); app_settings lässt sich nicht
--    löschen (sonst ließen sich teile/funktionen per Löschen + Neuanlegen
--    an den Schutz-Triggern vorbei ändern).
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
  -- Ohne Aufteilung gibt es nichts zu verschieben: offene Anträge erledigen sich
  if not p_an then
    update public.verschiebungen set erledigt_at = now(), abgelehnt = true
     where erledigt_at is null
       and tabelle = case p_bereich when 'motto' then 'motto_vorschlaege' when 'zitate' then 'zitate'
                                    when 'rankings' then 'ranking_kategorien' else 'album_kommentare' end;
  end if;
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
  -- Gesperrt nur, solange er in einer laufenden Wahl steht (Herzens-Kandidaten
  -- nur, wenn das Herz-Voting auch läuft)
  if exists (select 1 from public.runden_kandidaten k join public.abstimm_runden r on r.id = k.runde_id
              where r.bereich = 'motto' and r.offen and k.ziel_id = p_id::text and (not k.hm or r.hm_aktiv)) then
    raise exception 'Steht in der laufenden Abstimmung – erst nach der Runde löschen.';
  end if;
  -- Erst ins Protokoll (mit dem Text), dann leeren
  perform public.audit_schreiben('motto.geloescht', 'inhalte', null, 'Abimotto',
    'Motto-Vorschlag gelöscht: „' || left(m.text, 80) || '“',
    jsonb_build_object('id', p_id, 'text', m.text, 'erklaerung', m.erklaerung, 'bereich', m.bereich));
  perform set_config('sv.motto_loeschen', '1', true);
  update public.motto_vorschlaege
     set geloescht_at = now(), ausgeblendet = true, text = '(gelöscht)', erklaerung = ''
   where id = p_id;
  perform set_config('sv.motto_loeschen', '', true);
  -- Likes zählen nicht mehr („N Personen haben gelikt“), Runden zeigen den
  -- Text nicht mehr (Kandidaten tragen eine Kopie)
  update public.motto_stimmen set an = false where vorschlag_id = p_id and an;
  update public.runden_kandidaten set label = '(gelöscht)', unter = '' where ziel_id = p_id::text;
  -- Offene Verschiebe-Anträge dazu erledigen sich damit
  update public.verschiebungen set erledigt_at = now(), abgelehnt = true
   where tabelle = 'motto_vorschlaege' and ziel_id = p_id and erledigt_at is null;
end $$;
revoke all on function public.motto_loeschen(uuid) from public, anon;
grant execute on function public.motto_loeschen(uuid) to authenticated;

-- geloescht_at nur über motto_loeschen; Gelöschtes bleibt ausgeblendet
-- (sonst ließe es sich per API ohne Protokoll löschen bzw. wieder einblenden)
create or replace function public.motto_geloescht_schuetzen()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('sv.wiederherstellung', true), '') = '1' then return new; end if;
  if new.geloescht_at is distinct from old.geloescht_at
     and coalesce(current_setting('sv.motto_loeschen', true), '') <> '1' then
    raise exception 'Löschen bitte über „Vorschlag löschen“.' using errcode = '42501';
  end if;
  if old.geloescht_at is not null then new.ausgeblendet := true; end if;
  return new;
end $$;
revoke all on function public.motto_geloescht_schuetzen() from public, anon, authenticated;
create or replace trigger motto_geloescht_schuetzen before update on public.motto_vorschlaege
  for each row execute function public.motto_geloescht_schuetzen();

-- ---------------------------------------------------------------------
-- 4) Küren: nichts Gelöschtes; das offizielle Motto liegt im Teil offiziell.
--    Mit Aufteilung: ein inoffizielles Motto erst verschieben (Antrag mit
--    Zustimmungen) – Küren ist kein Weg daran vorbei. Ohne Aufteilung kann es
--    aus dem alten inoffiziellen Teil kommen: dann wird es dabei verschoben
--    (Wortfilter prüft wie beim Verschieben, Protokoll „bereich.verschoben“).
-- ---------------------------------------------------------------------
create or replace function public.gewinner_kueren(p_bereich text, p_gruppe text, p_art text, p_ziel text,
                                                  p_label text, p_unter text default '', p_stimmen int default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_motto public.motto_vorschlaege;
begin
  if auth.uid() is null or not public.gewinner_recht(p_bereich) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if p_bereich = 'motto' and exists (select 1 from public.motto_vorschlaege where id::text = p_ziel and geloescht_at is not null) then
    raise exception 'Dieser Vorschlag wurde gelöscht.';
  end if;
  if p_bereich = 'motto' and p_gruppe = 'offiziell' and p_art = 'gewinner' then
    select * into v_motto from public.motto_vorschlaege where id::text = p_ziel;
    if found and v_motto.bereich <> 'offiziell' then
      if coalesce((select (teile->>'motto')::boolean from public.app_settings where id = 1), true) then
        raise exception 'Dieser Vorschlag liegt im Teil Inoffiziell – erst nach Offiziell verschieben.';
      end if;
      perform set_config('sv.verschieben', '1', true);
      update public.motto_vorschlaege set bereich = 'offiziell' where id = v_motto.id;
      perform set_config('sv.verschieben', '', true);
      perform public.audit_schreiben('bereich.verschoben', 'inhalte', null, 'motto_vorschlaege',
        '„' || left(v_motto.text, 60) || '“ ist jetzt offiziell (beim Küren)',
        jsonb_build_object('tabelle', 'motto_vorschlaege', 'id', v_motto.id, 'nach', 'offiziell'));
    end if;
  end if;
  insert into public.gewinner (bereich, gruppe, art, ziel_id, label, unter, stimmen)
  values (p_bereich, p_gruppe, p_art, p_ziel, left(p_label, 300), left(coalesce(p_unter, ''), 200), p_stimmen)
  on conflict (bereich, gruppe, art) do update
    set ziel_id = excluded.ziel_id, label = excluded.label, unter = excluded.unter, stimmen = excluded.stimmen,
        gekuert_von = auth.uid(), gekuert_at = now();
  if p_bereich = 'motto' and p_gruppe = 'offiziell' and p_art = 'gewinner' then
    update public.motto_vorschlaege set gewaehlt = (id::text = p_ziel),
           gewaehlt_at = case when id::text = p_ziel then now() else null end
     where gewaehlt or id::text = p_ziel;
  end if;
  perform public.audit_schreiben('gewinner.gekuert', 'inhalte', null, p_bereich,
    case p_art when 'herzen' then 'Gewinner der Herzen' else 'Gewinner' end || ': „' || left(p_label, 60) || '“',
    jsonb_build_object('bereich', p_bereich, 'gruppe', p_gruppe, 'art', p_art, 'ziel', p_ziel));
end $$;

-- ---------------------------------------------------------------------
-- 5) app_settings nicht löschbar (Schutz-Trigger greifen nur beim Ändern)
-- ---------------------------------------------------------------------
create or replace function public.app_settings_nicht_loeschen()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('sv.wiederherstellung', true), '') <> '1' then
    raise exception 'Die Einstellungen der App lassen sich nicht löschen.' using errcode = '42501';
  end if;
  return old;
end $$;
revoke all on function public.app_settings_nicht_loeschen() from public, anon, authenticated;
create or replace trigger app_settings_nicht_loeschen before delete on public.app_settings
  for each row execute function public.app_settings_nicht_loeschen();
