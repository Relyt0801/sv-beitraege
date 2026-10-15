import { useEffect, useMemo, useState } from "react";
import { useTermine } from "../termine-store";
import { useTopics } from "../topics-store";
import { useProfiles } from "../profiles-store";
import { useRole } from "../auth/RoleProvider";
import { committeeIcon, committeeLabel } from "../lib/committees";
import { Avatar } from "./Avatar";
import { useStore } from "../store";
import { lesbarerName } from "../lib/profil";

/**
 * Name einer Person – auch wenn sie sich noch nie angemeldet hat. Dann gibt es
 * noch kein öffentliches Profil; das Team kennt den Namen aber aus der
 * Schülerliste (Konto → Schülereintrag). Sonst: "noch nicht angemeldet".
 */
const OHNE_NAME = "Noch nicht angemeldet";
const fuerKreis = (n: string) => (n === OHNE_NAME ? undefined : n);

function useNameVon(): (uid: string) => string {
  const { profile } = useProfiles();
  const { profiles } = useRole();
  const { students } = useStore();
  return useMemo(() => {
    const konto = new Map(profiles.map((p) => [p.user_id, p]));
    const schueler = new Map(students.map((s) => [s.id, s]));
    return (uid: string) => {
      const n = profile[uid]?.anzeigename;
      if (n) return n;
      const k = konto.get(uid);
      const st = k?.student_id ? schueler.get(k.student_id) : null;
      if (st) return `${st.vorname} ${st.nachname}`.trim();
      if (k?.username) return lesbarerName(k.username);
      return OHNE_NAME;
    };
  }, [profile, profiles, students]);
}
import { Sheet, SheetKopf } from "./Sheet";
import { Gruppe, Wert, Zeile, ZeileHaken } from "./Liste";
import { FussLeiste } from "./FussLeiste";

/**
 * Die beiden Vorsitzenden eines Komitees festlegen.
 *
 * Genau zwei – nicht "bis zu zwei". Weniger geht zwar (am Anfang steht noch
 * niemand fest), aber das Fenster sagt deutlich, dass zwei gemeint sind.
 * Mehr nimmt die Datenbank gar nicht erst an.
 *
 * Wählbar sind nur Leute, die auch im Komitee sind: ein Vorsitz von außen
 * wäre in jeder Sitzung eine Erklärung wert.
 */
export function VorsitzSheet({
  tag,
  offen,
  onSchliessen,
}: {
  tag: string;
  offen: boolean;
  onSchliessen: () => void;
}) {
  const { vorsitz, vorsitzSetzen } = useTermine();
  const { tagMembers } = useTopics();
  const nameVon = useNameVon();
  const [wahl, setWahl] = useState<string[]>([]);
  const [fehler, setFehler] = useState("");
  const [busy, setBusy] = useState(false);

  const jetzt = useMemo(() => vorsitz[tag] || [], [vorsitz, tag]);

  useEffect(() => {
    if (offen) {
      setWahl(jetzt);
      setFehler("");
    }
  }, [offen, jetzt]);

  const mitglieder = useMemo(() => {
    const ids = [...new Set([...(tagMembers[tag] || []), ...jetzt])];
    return ids.sort((a, b) => nameVon(a).localeCompare(nameVon(b)));
  }, [tagMembers, tag, jetzt, nameVon]);

  function umschalten(uid: string) {
    setFehler("");
    setWahl((prev) => {
      if (prev.includes(uid)) return prev.filter((x) => x !== uid);
      if (prev.length >= 2) {
        setFehler("Zwei sind das Maximum. Nimm erst jemanden heraus.");
        return prev;
      }
      return [...prev, uid];
    });
  }

  async function speichern() {
    setBusy(true);
    const f = await vorsitzSetzen(tag, wahl);
    setBusy(false);
    if (f) setFehler("Speichern hat nicht geklappt: " + f);
    else onSchliessen();
  }

  return (
    <Sheet open={offen} onClose={onSchliessen}>
      <SheetKopf titel={`Vorsitz ${committeeLabel(tag)}`} unter={`${wahl.length} von 2 gewählt`} onClose={onSchliessen} />

      {mitglieder.length === 0 ? (
        <Gruppe className="mt-0">
          <p className="px-4 py-3 text-[14px] leading-snug text-tinte-leise">In diesem Komitee ist noch niemand. Ordne zuerst Leute zu.</p>
        </Gruppe>
      ) : (
        // Auswahl wie in iOS: Liste mit Haken rechts (kein Kästchen links)
        <Gruppe
          className="mt-0"
          fuss={
            fehler ? (
              <span className="font-semibold text-amber-700 dark:text-amber-400">{fehler}</span>
            ) : (
              <>
                Zwei Vorsitzende je Komitee. Sie dürfen Termine <b>anfragen</b> – eintragen tut sie weiterhin nur das Stufenteam.
              </>
            )
          }
        >
          {mitglieder.map((uid) => (
            <ZeileHaken
              key={uid}
              label={nameVon(uid)}
              symbol={<Avatar userId={uid} name={fuerKreis(nameVon(uid))} size={30} />}
              gewaehlt={wahl.includes(uid)}
              onClick={() => umschalten(uid)}
            />
          ))}
        </Gruppe>
      )}

      <FussLeiste>
        <button disabled={busy} onClick={speichern} className="btn-primary">
          {busy ? "Wird gespeichert …" : "Übernehmen"}
        </button>
      </FussLeiste>
    </Sheet>
  );
}

/**
 * Die Zeile "Vorsitz: A und B" auf der Komiteeseite.
 * Für das Stufenteam ist sie zugleich der Knopf zum Ändern.
 */
export function VorsitzZeile({ tag }: { tag: string }) {
  const { vorsitz } = useTermine();
  const nameVon = useNameVon();
  const { isStaff, can } = useRole();
  const [offen, setOffen] = useState(false);
  const darf = isStaff || can("komitees.assign");

  const ids = vorsitz[tag] || [];
  const namen = ids.map(nameVon);

  // Für Mitglieder ohne festgelegten Vorsitz gibt es nichts zu sehen und nichts
  // zu tun – dann fällt die Zeile ganz weg (die Hülle in KomiteePage ist empty:hidden).
  if (!darf && ids.length === 0) return null;

  return (
    <>
      <Gruppe className="" fuss="Der Vorsitz darf für das Komitee Termine anfragen.">
        <Zeile label="Vorsitz" onClick={darf ? () => setOffen(true) : undefined}>
          {ids.length ? (
            <span className="flex min-w-0 items-center justify-end gap-1.5">
              {ids.map((u, i) => (
                <span key={u} className="flex min-w-0 items-center gap-1.5">
                  <Avatar userId={u} name={fuerKreis(namen[i])} size={24} />
                  <span className="min-w-0 truncate text-[15px] text-tinte-matt dark:text-slate-300">{namen[i]}</span>
                </span>
              ))}
            </span>
          ) : (
            <Wert>Noch niemand</Wert>
          )}
        </Zeile>
      </Gruppe>
      {darf && <VorsitzSheet tag={tag} offen={offen} onSchliessen={() => setOffen(false)} />}
    </>
  );
}
