-- Wer die Stufe verlassen hat, taucht in Album, Rankings und der
-- Namensauswahl der Zitate nicht mehr auf (Update 1.3, 09.10.2026).
--
-- „Verlassen“ heißt: students.verlaesst_ab ist das laufende Halbjahr
-- (app_settings.aktuelles_halbjahr) oder liegt davor. Wer z. B. „verlässt ab
-- Q2.1“ hat, ist in Q1.2 noch dabei und ab Q2.1 weg.
-- In der Kasse bleiben alle sichtbar – dort kann noch etwas offen sein.

create or replace function public.noch_dabei(p_verlaesst text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_verlaesst is null
      or coalesce(array_position(array['EF.1','EF.2','Q1.1','Q1.2','Q2.1','Q2.2'], p_verlaesst), 99)
         > coalesce(array_position(array['EF.1','EF.2','Q1.1','Q1.2','Q2.1','Q2.2'],
             (select aktuelles_halbjahr from public.app_settings where id = 1)), 0)
$$;
grant execute on function public.noch_dabei(text) to authenticated;

create or replace function public.stufe_personen()
returns table (id uuid, vorname text, nachname text) language sql stable security definer set search_path = public as $$
  select s.id, s.vorname, s.nachname from public.students s
   where public.has_consented() and not public.ist_eltern()
     and (public.has_perm('rankings.nutzen') or public.has_perm('rankings.verwalten')
          or public.has_perm('zitate.nutzen') or public.has_perm('zitate.pruefen')
          or public.has_perm('album.nutzen'))
     and public.noch_dabei(s.verlaesst_ab)
   order by s.vorname, s.nachname
$$;

create or replace function public.album_personen()
returns table (id uuid, vorname text, nachname text) language sql stable security definer set search_path = public as $$
  select s.id, s.vorname, s.nachname from public.students s
   where public.has_perm('album.nutzen') and not public.ist_eltern() and public.has_consented()
     and public.noch_dabei(s.verlaesst_ab)
   order by s.vorname, s.nachname
$$;

-- Rankings: Ausgetretene zählen nicht mehr für die Top 3
create or replace function public.ranking_stand()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not (public.has_perm('rankings.nutzen') or public.has_perm('rankings.verwalten')) or public.ist_eltern()
    then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
      'kategorie_id', k.id,
      'stimmen', (select count(*) from public.ranking_stimmen s where s.kategorie_id = k.id and s.ziel is not null),
      'top', case when public.ergebnis_darf('rankings') then coalesce((
        select jsonb_agg(jsonb_build_object('ziel', t.ziel, 'n', t.n) order by t.n desc)
          from (select s.ziel, count(*) n from public.ranking_stimmen s
                 where s.kategorie_id = k.id and s.ziel is not null
                   and not exists (select 1 from public.students st
                                    where st.id = s.ziel and not public.noch_dabei(st.verlaesst_ab))
                 group by s.ziel order by count(*) desc limit 3) t), '[]'::jsonb) else '[]'::jsonb end))
      from public.ranking_kategorien k), '[]'::jsonb) end
$$;
