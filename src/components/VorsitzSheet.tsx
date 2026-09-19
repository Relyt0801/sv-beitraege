import { useEffect, useMemo, useState } from "react";
import { useTermine } from "../termine-store";
import { useTopics } from "../topics-store";
import { useProfiles } from "../profiles-store";
import { useRole } from "../auth/RoleProvider";
import { committeeIcon, committeeLabel } from "../lib/committees";
import { Avatar } from "./Avatar";
import { Sheet } from "./Sheet";

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
  const { profile } = useProfiles();
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
    return ids.sort((a, b) =>
      (profile[a]?.anzeigename || "").localeCompare(profile[b]?.anzeigename || ""),
    );
  }, [tagMembers, tag, jetzt, profile]);

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
      <div className="mb-1 flex items-center gap-3">
        <span className="min-w-0 flex-1 font-zahl text-[1.25rem] font-extrabold tracking-[-0.02em]">
          {committeeIcon(tag)} Vorsitz {committeeLabel(tag)}
        </span>
        <button className="iconbtn shrink-0" onClick={onSchliessen} aria-label="Schließen">
          ✕
        </button>
      </div>
      <p className="mb-3 text-[12px] leading-relaxed text-tinte-leise">
        Zwei Vorsitzende je Komitee. Sie dürfen Termine <b>anfragen</b> – eintragen
        tut sie weiterhin nur das Stufenteam.
      </p>

      {mitglieder.length === 0 ? (
        <p className="rounded-xl bg-papier-matt p-3 text-[13px] text-tinte-matt dark:bg-slate-800 dark:text-slate-300">
          In diesem Komitee ist noch niemand. Ordne zuerst Leute zu.
        </p>
      ) : (
        <div className="mb-3 max-h-72 overflow-y-auto rounded-2xl border border-papier-linie p-1.5 dark:border-slate-700">
          {mitglieder.map((uid) => {
            const an = wahl.includes(uid);
            return (
              <button
                key={uid}
                onClick={() => umschalten(uid)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition ${
                  an ? "bg-brand/10" : "hover:bg-papier-matt dark:hover:bg-slate-800"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] text-white ${
                    an ? "border-brand bg-brand" : "border-papier-linie dark:border-slate-600"
                  }`}
                >
                  {an ? "✓" : ""}
                </span>
                <Avatar userId={uid} size={30} />
                <span className={`min-w-0 flex-1 truncate text-[14px] ${an ? "font-bold text-brand" : "font-semibold"}`}>
                  {profile[uid]?.anzeigename || "Unbekannt"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mb-3 text-[12px] font-semibold text-tinte-leise">
        {wahl.length} von 2 gewählt
      </div>

      {fehler && <p className="mb-2 text-[13px] font-semibold text-amber-600">{fehler}</p>}

      <button disabled={busy} onClick={speichern} className="btn-primary w-full disabled:opacity-50">
        {busy ? "…" : "Übernehmen"}
      </button>
    </Sheet>
  );
}

/**
 * Die Zeile "Vorsitz: A und B" auf der Komiteeseite.
 * Für das Stufenteam ist sie zugleich der Knopf zum Ändern.
 */
export function VorsitzZeile({ tag }: { tag: string }) {
  const { vorsitz } = useTermine();
  const { profile } = useProfiles();
  const { isStaff, can } = useRole();
  const [offen, setOffen] = useState(false);
  const darf = isStaff || can("komitees.assign");

  const ids = vorsitz[tag] || [];
  const namen = ids.map((u) => profile[u]?.anzeigename || "Unbekannt");

  return (
    <>
      <div className="card flex items-center gap-2.5 p-3">
        <span className="shrink-0 text-[15px]">🪑</span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-tinte-leise">Vorsitz</div>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {ids.length === 0 ? (
              <span className="text-[13px] text-tinte-matt dark:text-slate-300">Noch niemand festgelegt</span>
            ) : (
              ids.map((u, i) => (
                <span key={u} className="flex min-w-0 items-center gap-1.5">
                  <Avatar userId={u} size={22} />
                  <span className="min-w-0 truncate text-[13px] font-semibold">{namen[i]}</span>
                </span>
              ))
            )}
          </div>
        </div>
        {darf && (
          <button
            onClick={() => setOffen(true)}
            className="shrink-0 rounded-lg border border-papier-linie px-2.5 py-1.5 text-[12px] font-bold text-tinte-matt dark:border-slate-700 dark:text-slate-300"
          >
            Ändern
          </button>
        )}
      </div>
      {darf && <VorsitzSheet tag={tag} offen={offen} onSchliessen={() => setOffen(false)} />}
    </>
  );
}
