import { useMemo, useState } from "react";
import { useTermine } from "../termine-store";
import { useProfiles } from "../profiles-store";
import { useRole } from "../auth/RoleProvider";
import { committeeIcon, committeeLabel } from "../lib/committees";
import { Avatar } from "./Avatar";
import { AnfrageSheet } from "./AnfrageSheet";
import { tagLang, uhr, type TerminAnfrage } from "../lib/termine";

import { frage, meldeFehler } from "../lib/melder";
function wann(a: TerminAnfrage): string {
  const zeit = a.von ? `${uhr(a.von)}${a.bis ? ` – ${uhr(a.bis)}` : ""}` : "ganztägig";
  return `${tagLang(a.datum)} · ${zeit}`;
}

/**
 * Offene Terminanfragen der Komiteevorsitzenden – für das Stufenteam.
 *
 * "Übernehmen" legt den Termin NICHT stillschweigend an, sondern öffnet das
 * normale Formular mit allem Vorausgefüllten. So entscheidet das Team über
 * Sichtbarkeit und Uhrzeit, und niemand trägt aus Versehen etwas ein, das
 * die halbe Stufe sieht.
 */
export function AnfragenFuerTeam({ onUebernehmen }: { onUebernehmen: (a: TerminAnfrage) => void }) {
  const { anfragen, anfrageEntscheiden } = useTermine();
  const { profile } = useProfiles();
  const { isStaff, can } = useRole();
  const [ablehnen, setAblehnen] = useState<string | null>(null);
  const [grund, setGrund] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const offen = useMemo(() => anfragen.filter((a) => a.status === "offen"), [anfragen]);
  if (!(isStaff || can("termine.manage")) || offen.length === 0) return null;

  return (
    <div className="mb-4 grid gap-2.5">
      {offen.map((a) => (
        <div key={a.id} className="card border-brand/40 p-4">
          <div className="flex items-start gap-2.5">
            <Avatar userId={a.created_by} size={36} />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold">
                Terminanfrage {committeeIcon(a.tag)} {committeeLabel(a.tag)}
              </div>
              <div className="mt-0.5 text-[13px] text-tinte-matt dark:text-slate-300">
                <b>{a.titel}</b>
                {a.ort ? ` · ${a.ort}` : ""}
              </div>
              <div className="text-[13px] text-tinte-matt dark:text-slate-300">{wann(a)}</div>
              {a.nachricht && (
                <div className="mt-1 text-[13px] text-tinte-matt dark:text-slate-300">„{a.nachricht}"</div>
              )}
              <div className="mt-1 text-[11px] text-tinte-leise">
                von {profile[a.created_by]?.anzeigename || "Unbekannt"} ·{" "}
                {new Date(a.created_at).toLocaleString("de-DE")}
              </div>
            </div>
          </div>

          {ablehnen === a.id ? (
            <div className="mt-3">
              <textarea
                className="field mb-2 min-h-[3.5rem]"
                placeholder="Warum nicht? (optional, sieht nur der Vorsitz)"
                value={grund}
                onChange={(e) => setGrund(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setAblehnen(null);
                    setGrund("");
                  }}
                  className="flex-1 rounded-xl border border-papier-linie py-2 text-sm font-bold text-tinte-matt dark:border-slate-700"
                >
                  Zurück
                </button>
                <button
                  disabled={busy === a.id}
                  onClick={async () => {
                    setBusy(a.id);
                    const f = await anfrageEntscheiden(a.id, "abgelehnt", grund);
                    setBusy(null);
                    setAblehnen(null);
                    setGrund("");
                    if (f) meldeFehler("Fehler: " + f);
                  }}
                  className="flex-1 rounded-xl border border-red-300 py-2 text-sm font-bold text-red-500 dark:border-red-500/40"
                >
                  Absagen
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setAblehnen(a.id)}
                className="flex-1 rounded-xl border border-papier-linie py-2 text-sm font-bold text-tinte-matt dark:border-slate-700"
              >
                Ablehnen
              </button>
              <button
                onClick={() => onUebernehmen(a)}
                className="flex-1 rounded-xl bg-brand py-2 text-sm font-bold text-white"
              >
                Übernehmen
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Für die Vorsitzenden: der Knopf zum Anfragen und der Stand der eigenen
 * Anfragen. Beantwortete verschwinden nach einer Woche von selbst aus der
 * Liste – sonst staut sich hier das ganze Schuljahr.
 */
export function MeineAnfragen() {
  const { meineVorsitze, anfragen, meineUid, anfrageLoeschen } = useTermine();
  const [formOffen, setFormOffen] = useState(false);

  const meine = useMemo(() => {
    const grenze = Date.now() - 7 * 864e5;
    return anfragen.filter(
      (a) =>
        a.created_by === meineUid &&
        (a.status === "offen" || new Date(a.decided_at || a.created_at).getTime() > grenze),
    );
  }, [anfragen, meineUid]);

  if (meineVorsitze.length === 0) return null;

  return (
    <>
      <div className="mb-4 card p-4">
        <div className="flex items-center gap-2.5">
          <span className="shrink-0 text-[15px]">🪑</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-bold">
              Vorsitz {meineVorsitze.map(committeeLabel).join(" · ")}
            </div>
            <div className="text-[12px] text-tinte-leise">
              Du kannst Termine beim Stufenteam anfragen.
            </div>
          </div>
          <button
            onClick={() => setFormOffen(true)}
            className="shrink-0 rounded-xl bg-brand px-3 py-2 text-[13px] font-bold text-white"
          >
            Anfragen
          </button>
        </div>

        {meine.length > 0 && (
          <div className="mt-3 grid gap-1.5 border-t border-papier-linie pt-3 dark:border-slate-700">
            {meine.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                <span
                  className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                    a.status === "offen"
                      ? "bg-papier-matt text-tinte-matt dark:bg-slate-800 dark:text-slate-300"
                      : a.status === "angenommen"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                        : "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400"
                  }`}
                >
                  {a.status === "offen" ? "wartet" : a.status === "angenommen" ? "im Kalender" : "abgelehnt"}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <b>{a.titel}</b> · {wann(a)}
                  {a.antwort ? ` – „${a.antwort}"` : ""}
                </span>
                {a.status === "offen" && (
                  <button
                    onClick={async () => {
                      if (await frage(`Die Anfrage „${a.titel}" zurücknehmen?`, "Zurücknehmen", true)) void anfrageLoeschen(a.id);
                    }}
                    className="shrink-0 text-tinte-leise hover:text-red-500"
                    aria-label="Zurücknehmen"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AnfrageSheet offen={formOffen} onSchliessen={() => setFormOffen(false)} />
    </>
  );
}
