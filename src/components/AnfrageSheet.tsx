import { useEffect, useState } from "react";
import { useTermine } from "../termine-store";
import { committeeIcon, committeeLabel } from "../lib/committees";
import { Sheet } from "./Sheet";
import { heuteKey } from "../lib/termine";

/**
 * Ein Komiteevorsitz fragt einen Termin an.
 *
 * Absichtlich kurz: Was, wann, wo und ein Satz warum. Über Sichtbarkeit,
 * Eltern und Notizen entscheidet das Stufenteam beim Übernehmen – der
 * Vorsitz soll nicht zwölf Felder ausfüllen müssen, um nach einem Raum zu
 * fragen.
 */
export function AnfrageSheet({ offen, onSchliessen }: { offen: boolean; onSchliessen: () => void }) {
  const { meineVorsitze, anfrageStellen } = useTermine();

  const [tag, setTag] = useState("");
  const [titel, setTitel] = useState("");
  const [ort, setOrt] = useState("");
  const [datum, setDatum] = useState(heuteKey());
  const [ganztaegig, setGanztaegig] = useState(false);
  const [von, setVon] = useState("14:00");
  const [bis, setBis] = useState("15:00");
  const [nachricht, setNachricht] = useState("");
  const [fehler, setFehler] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!offen) return;
    setTag(meineVorsitze[0] || "");
    setTitel("");
    setOrt("");
    setDatum(heuteKey());
    setGanztaegig(false);
    setVon("14:00");
    setBis("15:00");
    setNachricht("");
    setFehler("");
  }, [offen, meineVorsitze]);

  if (meineVorsitze.length === 0) return null;

  async function senden() {
    if (!titel.trim()) return setFehler("Wofür ist der Termin?");
    if (!datum) return setFehler("Wähle ein Datum.");
    if (!ganztaegig && bis <= von) return setFehler("Die Endzeit liegt vor der Anfangszeit.");
    setBusy(true);
    const f = await anfrageStellen({
      tag,
      titel,
      ort,
      nachricht,
      datum,
      bis_datum: null,
      von: ganztaegig ? null : von,
      bis: ganztaegig ? null : bis,
    });
    setBusy(false);
    if (f) setFehler("Das hat nicht geklappt: " + f);
    else onSchliessen();
  }

  return (
    <Sheet open={offen} onClose={onSchliessen}>
      <div className="mb-1 flex items-center gap-3">
        <span className="min-w-0 flex-1 font-zahl text-[1.25rem] font-extrabold tracking-[-0.02em]">
          Termin anfragen
        </span>
        <button className="iconbtn shrink-0" onClick={onSchliessen} aria-label="Schließen">
          ✕
        </button>
      </div>
      <p className="mb-3 text-[12px] leading-relaxed text-tinte-leise">
        Die Anfrage geht an das Stufenteam. Erst wenn sie übernommen wird, steht
        der Termin im Kalender.
      </p>

      {meineVorsitze.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {meineVorsitze.map((k) => (
            <button
              key={k}
              onClick={() => setTag(k)}
              className={`rounded-lg px-2.5 py-2 text-[13px] font-bold transition ${
                tag === k ? "bg-brand text-white" : "bg-papier-matt text-tinte-matt dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {committeeIcon(k)} {committeeLabel(k)}
            </button>
          ))}
        </div>
      )}

      <label className="mb-2 block">
        <span className="mb-1 block text-[12px] font-semibold text-tinte-leise">Wofür</span>
        <input
          className="field"
          placeholder="z. B. Sitzung Abiball"
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
          autoFocus
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 block text-[12px] font-semibold text-tinte-leise">Ort (optional)</span>
        <input
          className="field"
          placeholder="z. B. Raum 204"
          value={ort}
          onChange={(e) => setOrt(e.target.value)}
        />
      </label>

      <div className="mb-3 rounded-2xl border border-papier-linie p-3 dark:border-slate-700">
        <label className="mb-2 flex items-center gap-2">
          <span className="shrink-0 text-[12px] font-semibold text-tinte-leise">Am</span>
          <input
            type="date"
            className="min-w-0 flex-1 rounded-lg border border-papier-linie bg-white px-2.5 py-2 text-[14px] dark:border-slate-700 dark:bg-slate-800"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
          />
        </label>

        <button
          onClick={() => setGanztaegig(!ganztaegig)}
          className="mb-2 flex items-center gap-2 text-[13px] font-semibold"
        >
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] text-white ${
              ganztaegig ? "border-brand bg-brand" : "border-papier-linie dark:border-slate-600"
            }`}
          >
            {ganztaegig ? "✓" : ""}
          </span>
          <span className="text-tinte-matt dark:text-slate-300">ganztägig</span>
        </button>

        {!ganztaegig && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 text-[12px] font-semibold text-tinte-leise">Von</span>
              <input
                type="time"
                className="min-w-0 flex-1 rounded-lg border border-papier-linie bg-white px-2.5 py-2 text-[14px] dark:border-slate-700 dark:bg-slate-800"
                value={von}
                onChange={(e) => setVon(e.target.value)}
              />
            </label>
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 text-[12px] font-semibold text-tinte-leise">Bis</span>
              <input
                type="time"
                className="min-w-0 flex-1 rounded-lg border border-papier-linie bg-white px-2.5 py-2 text-[14px] dark:border-slate-700 dark:bg-slate-800"
                value={bis}
                onChange={(e) => setBis(e.target.value)}
              />
            </label>
          </div>
        )}
      </div>

      <label className="mb-3 block">
        <span className="mb-1 block text-[12px] font-semibold text-tinte-leise">Warum (optional)</span>
        <textarea
          className="field min-h-[4.5rem]"
          placeholder="Ein Satz fürs Stufenteam …"
          value={nachricht}
          onChange={(e) => setNachricht(e.target.value)}
        />
      </label>

      {fehler && <p className="mb-2 text-[13px] font-semibold text-amber-600">{fehler}</p>}

      <button disabled={busy} onClick={senden} className="btn-primary w-full disabled:opacity-50">
        {busy ? "…" : "Anfrage senden"}
      </button>
    </Sheet>
  );
}
