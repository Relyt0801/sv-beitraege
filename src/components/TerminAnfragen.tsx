import { useMemo, useState } from "react";
import { hinScrollen, useSprungziel } from "../lib/sprung";
import { useTermine } from "../termine-store";
import { useProfiles } from "../profiles-store";
import { useRole } from "../auth/RoleProvider";
import { committeeIcon, committeeLabel } from "../lib/committees";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { AnfrageSheet } from "./AnfrageSheet";
import { tagLang, uhr, type TerminAnfrage } from "../lib/termine";

import { frage, meldeFehler } from "../lib/melder";
import { nochFehlend, useZustimmungen, zustimmen } from "../lib/zustimmung";
import { ZustimmungsMarke } from "./ZustimmungsMarke";
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
  const { isStaff, can, uid } = useRole();
  const zu = useZustimmungen("termin", isStaff || can("termine.manage"), uid);
  const [ablehnen, setAblehnen] = useState<string | null>(null);
  const [grund, setGrund] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const offen = useMemo(() => anfragen.filter((a) => a.status === "offen"), [anfragen]);
  useSprungziel("termin", (isStaff || can("termine.manage")) && offen.length > 0, () => hinScrollen("sprung-termin"));
  if (!(isStaff || can("termine.manage")) || offen.length === 0) return null;

  return (
    <div id="sprung-termin" className="mb-4 grid gap-2.5">
      {offen.map((a) => (
        <div key={a.id} className="card p-4">
          <div className="flex items-start gap-2.5">
            <Avatar userId={a.created_by} size={36} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold uppercase tracking-[0.02em] text-brand-dark dark:text-brand">
                Terminanfrage · {committeeLabel(a.tag)}
              </div>
              <div className="mt-0.5 text-[17px] font-semibold leading-snug">
                {a.titel}
              </div>
              <div className="text-[14px] text-tinte-matt dark:text-slate-300">
                {wann(a)}
                {a.ort ? ` · ${a.ort}` : ""}
              </div>
              {a.nachricht && (
                <div className="mt-1 text-[14px] text-tinte-matt dark:text-slate-300">„{a.nachricht}"</div>
              )}
              <div className="mt-1 text-[12px] text-tinte-leise">
                von {profile[a.created_by]?.anzeigename || "Unbekannt"} ·{" "}
                {new Date(a.created_at).toLocaleString("de-DE")}
              </div>
              <ZustimmungsMarke className="mt-1.5" zahl={zu.zahl(a.id)} noetig={zu.noetig} ichSchon={zu.ichSchon(a.id)} />
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
                  className="btn-klein-grau flex-1 !min-h-[2.75rem]"
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
                  className="btn-klein-grau flex-1 !min-h-[2.75rem] !text-red-600 dark:!text-red-400"
                >
                  Absagen
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setAblehnen(a.id)}
                className="btn-klein-grau flex-1 !min-h-[2.75rem]"
              >
                Ablehnen
              </button>
              <button
                disabled={busy === a.id}
                onClick={async () => {
                  // Bei mehreren nötigen Zustimmungen erst sammeln, dann übernehmen
                  setBusy(a.id);
                  const z = await zustimmen("termin", a.id);
                  setBusy(null);
                  if ("error" in z) return meldeFehler(z.error);
                  if (!z.fertig) {
                    void zu.laden();
                    return meldeFehler(nochFehlend(z));
                  }
                  onUebernehmen(a);
                }}
                className="btn-klein flex-1 !min-h-[2.75rem]"
              >
                {!zu.allein && zu.noetig > 1 && !zu.ichSchon(a.id) && zu.zahl(a.id) + 1 < zu.noetig ? "Zustimmen" : "Übernehmen"}
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
        <div className="flex items-center gap-3">
          <span aria-hidden className="symbol shrink-0 bg-brand">
            <Icon name="kalender" size={17} strich={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold">
              Vorsitz {meineVorsitze.map(committeeLabel).join(" · ")}
            </div>
            <div className="text-[13px] text-tinte-leise">
              Du kannst Termine beim Stufenteam anfragen.
            </div>
          </div>
          <button onClick={() => setFormOffen(true)} className="btn-klein shrink-0">
            Anfragen
          </button>
        </div>

        {meine.length > 0 && (
          <div className="mt-3 grid gap-1 border-t border-black/[0.08] pt-2 dark:border-white/[0.1]">
            {/* Zwei Zeilen: Titel oben, Stand und Termin darunter. Vorher stand
                alles in einer Zeile – am iPhone war vom Datum nur „Mo, 19…“
                zu sehen (Prüfung aus Sicht der Vorsitzenden, Okt. 2026). */}
            {meine.map((a) => (
              <div key={a.id} className="flex min-h-[44px] items-center gap-2 py-1">
                <span className="min-w-0 flex-1">
                  {/* umbrechen statt kürzen: die Zeile öffnet kein Blatt, sonst wäre ein langer Titel nirgends ganz lesbar */}
                  <span className="block text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{a.titel}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-tinte-leise">
                    <span
                      className={`shrink-0 rounded-full px-2 py-px text-[12px] font-bold ${
                        a.status === "offen"
                          ? "bg-[rgb(118_118_128/0.12)] text-tinte-matt dark:bg-[rgb(118_118_128/0.24)] dark:text-slate-300"
                          : a.status === "angenommen"
                            ? "bg-bezahlt-grund text-bezahlt"
                            : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
                      }`}
                    >
                      {a.status === "offen" ? "wartet" : a.status === "angenommen" ? "im Kalender" : "abgelehnt"}
                    </span>
                    <span>{wann(a)}</span>
                  </span>
                  {a.antwort && <span className="mt-0.5 block text-[13px] text-tinte-leise [overflow-wrap:anywhere]">„{a.antwort}“</span>}
                </span>
                {a.status === "offen" && (
                  <button
                    onClick={async () => {
                      if (await frage(`Die Anfrage „${a.titel}" zurücknehmen?`, "Zurücknehmen", true)) void anfrageLoeschen(a.id);
                    }}
                    className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center text-tinte-leise active:opacity-50"
                    aria-label={`Anfrage „${a.titel}“ zurücknehmen`}
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
