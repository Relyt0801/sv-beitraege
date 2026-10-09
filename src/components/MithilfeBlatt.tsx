import { useMemo, useState, type ReactNode } from "react";
import { Sheet } from "./Sheet";
import { useStore } from "../store";
import { normalize } from "../lib/logic";
import { heuteKey } from "../lib/termine";
import { Gruppe, Zeile } from "./Liste";

/**
 * Mithilfe eintragen – aufgebaut wie eine Rechnung (wie „Mithilfe nachtragen“):
 * oben groß der Wert, darunter Aktion, für wen, Datum. Die Aktionen stehen
 * nicht alle offen herum: „Aktion“ antippen öffnet die Auswahl mit Suche.
 */
export function MithilfeBlatt({
  open,
  onClose,
  fuer,
  zusatz,
  knopf = "Eintragen",
  onEintragen,
}: {
  open: boolean;
  onClose: () => void;
  /** „Lena Bauer“ oder „3 Personen“ */
  fuer: string;
  /** z. B. die ausgewählten Personen zum Abwählen */
  zusatz?: ReactNode;
  knopf?: string;
  onEintragen: (titel: string, punkte: number, datum: string) => void;
}) {
  const { templates } = useStore();
  const vorlagen = useMemo(() => [...templates].sort((a, b) => a.sort - b.sort || a.punkte - b.punkte), [templates]);
  const [wahl, setWahl] = useState<string | null>(null);
  const [wert, setWert] = useState("");
  const [datum, setDatum] = useState(heuteKey());
  const [waehlen, setWaehlen] = useState(false);
  const [suche, setSuche] = useState("");

  const vorlage = vorlagen.find((v) => v.id === wahl) || null;
  const zahl = vorlage ? (vorlage.variabel ? Number(wert) : vorlage.punkte) : NaN;
  const wertOk = Number.isFinite(zahl) && zahl > 0 && zahl <= 100 && (!vorlage?.variabel || wert.trim() !== "");
  const geht = Boolean(vorlage && wertOk && datum);

  function schliessen() {
    onClose();
    setTimeout(() => {
      setWahl(null);
      setWert("");
      setDatum(heuteKey());
      setWaehlen(false);
      setSuche("");
    }, 300);
  }

  function nimm(id: string) {
    const v = vorlagen.find((x) => x.id === id);
    setWahl(id);
    setWert(v ? String(v.punkte) : "");
    setWaehlen(false);
    setSuche("");
  }

  const treffer = suche.trim() ? vorlagen.filter((v) => normalize(v.titel).includes(normalize(suche))) : vorlagen;

  return (
    <Sheet open={open} onClose={schliessen}>
      <div className="mx-auto max-w-md">
        {waehlen ? (
          /* ------------------------------------------ Auswahl der Aktion */
          <>
            <div className="mb-2 flex items-center gap-2">
              <button onClick={() => setWaehlen(false)} className="-ml-1 rounded-full px-2 py-1.5 text-[15px] font-semibold text-brand-dark dark:text-brand">
                ‹ Zurück
              </button>
              <div className="flex-1 text-center text-[15px] font-semibold">Aktion wählen</div>
              <span className="w-16" />
            </div>
            <input
              autoFocus
              type="search"
              placeholder="Suchen"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              className="w-full rounded-xl bg-[rgb(118_118_128/0.12)] px-3 py-2 text-[15px] outline-none placeholder:text-tinte-leise dark:bg-[rgb(118_118_128/0.24)]"
            />
            <div className="mt-3 divide-y divide-black/[0.06] overflow-hidden rounded-2xl bg-[rgb(118_118_128/0.08)] dark:divide-white/[0.08] dark:bg-[rgb(118_118_128/0.18)]">
              {treffer.length === 0 && (
                <div className="px-4 py-4 text-center text-[13px] text-tinte-leise">
                  {vorlagen.length === 0 ? "Noch keine Aktionen – im Reiter „Beiträge“ anlegen." : "Nichts gefunden."}
                </div>
              )}
              {treffer.map((v) => (
                <button
                  key={v.id}
                  onClick={() => nimm(v.id)}
                  className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
                >
                  <span className="min-w-0 flex-1 truncate text-[15px]">{v.titel}</span>
                  <span className="zahl shrink-0 text-[14px] font-bold text-brand">{v.variabel ? "% frei" : `+${v.punkte} %`}</span>
                  {wahl === v.id && <span className="text-brand">✓</span>}
                </button>
              ))}
            </div>
          </>
        ) : (
          /* ------------------------------------------ Rechnung */
          <>
            <div className="flex flex-col items-center pt-1 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-2xl">
                🙌
              </span>
              <div className="mt-2 text-[13px] font-semibold text-tinte-leise">Mithilfe eintragen</div>
              <div className="zahl mt-1 text-[2.6rem] font-extrabold leading-none tracking-[-0.03em]">
                {vorlage && wertOk ? `+${Math.round(zahl)} %` : <span className="text-tinte-leise">– %</span>}
              </div>
              <div className="mt-1.5 min-h-[1.25rem] text-[14px] font-semibold">
                {vorlage?.titel || <span className="text-tinte-leise">Aktion auswählen</span>}
              </div>
            </div>

            <Gruppe titel="Mithilfe">
              <button onClick={() => setWaehlen(true)} className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left">
                <span className="shrink-0 text-[15px]">Aktion</span>
                <span className={`min-w-0 flex-1 truncate text-right text-[15px] ${vorlage ? "text-tinte-matt dark:text-slate-300" : "text-brand"}`}>
                  {vorlage?.titel || "Auswählen"}
                </span>
                <span className="text-tinte-leise">›</span>
              </button>
              {vorlage?.variabel && (
                <Zeile label="Wert">
                  <span className="flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={100}
                      autoFocus
                      aria-label="Wert in Prozent"
                      placeholder="?"
                      className="w-16 rounded-lg bg-white px-2 py-1 text-right text-[15px] font-bold text-brand outline-none dark:bg-slate-800"
                      value={wert}
                      onChange={(e) => setWert(e.target.value)}
                    />
                    <span className="text-[15px] font-bold text-brand">%</span>
                  </span>
                </Zeile>
              )}
              <Zeile label="Für">
                <span className="truncate text-[15px] text-tinte-matt dark:text-slate-300">{fuer}</span>
              </Zeile>
              <Zeile label="Datum">
                <input
                  type="date"
                  max={heuteKey()}
                  className="bg-transparent text-right text-[15px] outline-none"
                  value={datum}
                  onChange={(e) => setDatum(e.target.value)}
                />
              </Zeile>
            </Gruppe>

            {zusatz}

            <button
              disabled={!geht}
              onClick={() => {
                if (!vorlage || !geht) return;
                onEintragen(vorlage.titel, Math.round(zahl), datum);
                schliessen();
              }}
              className="btn-primary mt-4 w-full disabled:opacity-40"
            >
              {vorlage && wertOk ? `${knopf} (+${Math.round(zahl)} %)` : knopf}
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
