import { useEffect, useState } from "react";
import { useTermine } from "../termine-store";
import { committeeIcon, committeeLabel } from "../lib/committees";
import { Sheet, SheetKopf } from "./Sheet";
import { Gruppe, Zeile, ZeileHaken, ZeileMitSchalter } from "./Liste";
import { Schalter } from "./Schalter";
import { FussLeiste } from "./FussLeiste";
import { ZeitFeld } from "./ZeitFeld";
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

  const textFeld = "min-w-0 flex-1 bg-transparent text-right text-[16px] outline-none placeholder:text-tinte-leise";

  return (
    <Sheet open={offen} onClose={onSchliessen}>
      <SheetKopf
        titel="Termin anfragen"
        unter="Die Anfrage geht an das Stufenteam. Erst wenn sie übernommen wird, steht der Termin im Kalender."
        onClose={onSchliessen}
      />

      {meineVorsitze.length > 1 && (
        <Gruppe titel="Für welches Komitee?" className="mt-0">
          {meineVorsitze.map((k) => (
            <ZeileHaken
              key={k}
              gewaehlt={tag === k}
              onClick={() => setTag(k)}
              label={
                <>
                  <span aria-hidden className="mr-2">{committeeIcon(k)}</span>
                  {committeeLabel(k)}
                </>
              }
            />
          ))}
        </Gruppe>
      )}

      <Gruppe className={meineVorsitze.length > 1 ? "mt-4" : "mt-0"}>
        <Zeile label="Wofür">
          <input
            className={textFeld}
            placeholder="z. B. Sitzung Abiball"
            aria-label="Wofür ist der Termin?"
            value={titel}
            onChange={(e) => setTitel(e.target.value)}
            autoFocus
          />
        </Zeile>
        <Zeile label="Ort">
          <input className={textFeld} placeholder="optional, z. B. Raum 204" aria-label="Ort (optional)" value={ort} onChange={(e) => setOrt(e.target.value)} />
        </Zeile>
      </Gruppe>

      <Gruppe titel="Wann">
        <Zeile label="Am">
          <input
            type="date"
            aria-label="Datum"
            className="min-w-0 bg-transparent text-right text-[16px] outline-none"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
          />
        </Zeile>
        <ZeileMitSchalter label="Ganztägig">
          <Schalter an={ganztaegig} onChange={setGanztaegig} label="Ganztägig" />
        </ZeileMitSchalter>
        {!ganztaegig && (
          <Zeile label="Uhrzeit">
            <ZeitFeld wert={von} onChange={setVon} label="Beginn" />
            <span aria-hidden className="text-tinte-leise">–</span>
            <ZeitFeld wert={bis} onChange={setBis} label="Ende" />
          </Zeile>
        )}
      </Gruppe>

      <textarea
        className="field mt-4 min-h-[4.5rem]"
        placeholder="Warum? (optional) – ein Satz fürs Stufenteam …"
        aria-label="Warum (optional)"
        value={nachricht}
        onChange={(e) => setNachricht(e.target.value)}
      />

      {fehler && <p className="mt-3 px-4 text-[14px] font-semibold text-amber-700 dark:text-amber-300">{fehler}</p>}

      <FussLeiste>
        <button disabled={busy} onClick={senden} className="btn-primary">
          {busy ? "…" : "Anfrage senden"}
        </button>
      </FussLeiste>
    </Sheet>
  );
}
