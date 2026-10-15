import { useMemo, useState, type ReactNode } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { Icon } from "./Icon";
import { useStore } from "../store";
import { normalize } from "../lib/logic";
import { heuteKey } from "../lib/termine";
import { Gruppe, RechnungKopf, Zeile, ZeileHaken } from "./Liste";
import { FussLeiste } from "./FussLeiste";

/**
 * Mithilfe eintragen – aufgebaut wie eine Rechnung (wie „Mithilfe nachtragen“):
 * oben groß der Wert (mit ✕), darunter Aktion, für wen, Datum; der Knopf
 * klebt unten. Die Aktionen stehen nicht alle offen herum: „Aktion“
 * antippen öffnet die Auswahl mit Suche.
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
      {waehlen ? (
        /* ------------------------------------------ Auswahl der Aktion */
        <>
          {/* ✕ schließt das ganze Blatt, „‹“ führt zurück zur Rechnung */}
          <SheetKopf titel="Aktion wählen" zurueck={{ text: "Mithilfe eintragen", onClick: () => setWaehlen(false) }} onClose={schliessen} />
          <div className="mx-auto max-w-md">
            <input
              autoFocus
              type="search"
              placeholder="Suchen"
              aria-label="Aktion suchen"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              className="field"
            />
            <Gruppe className="mt-3">
              {treffer.length === 0 && (
                <div className="px-4 py-4 text-center text-[14px] text-tinte-leise">
                  {vorlagen.length === 0 ? "Noch keine Aktionen – unter Kasse → „Beiträge & Abiball“ anlegen." : "Nichts gefunden."}
                </div>
              )}
              {treffer.map((v) => (
                <ZeileHaken
                  key={v.id}
                  gewaehlt={wahl === v.id}
                  onClick={() => nimm(v.id)}
                  label={v.titel}
                  rechts={<span className="zahl shrink-0 text-[14px] font-bold text-brand-dark dark:text-brand">{v.variabel ? "% frei" : `+${v.punkte} %`}</span>}
                />
              ))}
            </Gruppe>
          </div>
        </>
      ) : (
        /* ------------------------------------------ Rechnung */
        <>
          <RechnungKopf
            bild={
              <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white">
                <Icon name="rollen" size={26} strich={2} />
              </span>
            }
            oben="Mithilfe eintragen"
            wert={vorlage && wertOk ? `+${Math.round(zahl)} %` : <span className="text-tinte-leise">– %</span>}
            titel={vorlage?.titel || <span className="text-tinte-leise">Aktion auswählen</span>}
            onClose={schliessen}
          />

          <div className="mx-auto max-w-md">
            <Gruppe titel="Mithilfe">
              <button
                onClick={() => setWaehlen(true)}
                className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
              >
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
                      className="w-16 rounded-lg bg-[rgb(118_118_128/0.12)] px-2 py-1.5 text-right text-[16px] font-bold text-brand-dark outline-none dark:bg-[rgb(118_118_128/0.24)] dark:text-brand"
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
          </div>

          {/* Hauptknopf klebt unten */}
          <FussLeiste>
            <div className="mx-auto max-w-md">
              <button
                disabled={!geht}
                onClick={() => {
                  if (!vorlage || !geht) return;
                  onEintragen(vorlage.titel, Math.round(zahl), datum);
                  schliessen();
                }}
                className="btn-primary w-full disabled:opacity-40"
              >
                {vorlage && wertOk ? `${knopf} (+${Math.round(zahl)} %)` : knopf}
              </button>
            </div>
          </FussLeiste>
        </>
      )}
    </Sheet>
  );
}
