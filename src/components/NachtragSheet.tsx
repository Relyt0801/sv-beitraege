import { useMemo, useState } from "react";
import { Sheet } from "./Sheet";
import { Gruppe, Zeile } from "./Liste";
import { useStore } from "../store";
import { useRole } from "../auth/RoleProvider";
import { heuteKey, tagLang } from "../lib/termine";
import { useNachtraege, type Nachtrag } from "../lib/nachtrag";
import { frage } from "../lib/melder";
import { normalize } from "../lib/logic";
import { GesperrtZeile } from "./Gesperrt";

const SONSTIGES = "__sonstiges__";

/**
 * Mithilfe nachtragen – aufgebaut wie eine Rechnung bei Apple: oben groß der
 * Wert, darunter in einer Liste, wofür, wann und was. Unten der Knopf. Nach
 * dem Senden ein grüner Haken; darunter die eigenen Anträge mit Stand.
 */
export function NachtragSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { templates, students } = useStore();
  const { studentId, banned } = useRole();
  const { liste, stellen, zurueckziehen } = useNachtraege(open);
  const ich = students.find((s) => s.id === studentId) || null;

  const vorlagen = useMemo(() => [...templates].sort((a, b) => a.sort - b.sort || a.punkte - b.punkte), [templates]);
  const [wahl, setWahl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [datum, setDatum] = useState(heuteKey());
  const [text, setText] = useState("");
  const [sendet, setSendet] = useState(false);
  const [fertig, setFertig] = useState(false);
  const [fehler, setFehler] = useState("");
  // Aktionen stehen nicht alle offen herum: „Aktion ›“ öffnet die Auswahl mit Suche
  const [waehlen, setWaehlen] = useState(false);
  const [suche, setSuche] = useState("");

  const vorlage = vorlagen.find((v) => v.id === wahl) || null;
  const sonstiges = wahl === SONSTIGES;
  // Fester Wert nur bei Vorlagen ohne „% frei“ – sonst legt das Team ihn fest
  const wert = vorlage && !vorlage.variabel ? vorlage.punkte : null;
  const titel = sonstiges ? name.trim() : vorlage?.titel || "";
  const geht = !banned && Boolean(ich && titel && datum && datum <= heuteKey() && (!sonstiges || text.trim().length >= 3));

  function zuruecksetzen() {
    setWahl(null);
    setName("");
    setText("");
    setDatum(heuteKey());
    setFehler("");
    setFertig(false);
    setWaehlen(false);
    setSuche("");
  }

  function nimm(id: string) {
    setWahl(id);
    setWaehlen(false);
    setSuche("");
  }

  const treffer = suche.trim() ? vorlagen.filter((v) => normalize(v.titel).includes(normalize(suche))) : vorlagen;

  async function senden() {
    if (!ich || !geht) return;
    setSendet(true);
    setFehler("");
    const f = await stellen({
      student_id: ich.id,
      vorlage_id: vorlage?.id ?? null,
      titel,
      punkte: wert,
      datum,
      beschreibung: text,
    });
    setSendet(false);
    if (f) setFehler(f);
    else setFertig(true);
  }

  const meine = liste.filter((n) => n.student_id === studentId);

  return (
    <Sheet
      open={open}
      onClose={() => {
        onClose();
        setTimeout(zuruecksetzen, 300);
      }}
    >
      <div className="mx-auto max-w-md">
        {waehlen ? (
          <AktionWahl
            vorlagen={treffer}
            leer={vorlagen.length === 0}
            wahl={wahl}
            suche={suche}
            setSuche={setSuche}
            onNimm={nimm}
            onZurueck={() => setWaehlen(false)}
          />
        ) : (
        <>
        {/* ------------------------------------------------ Kopf wie eine Rechnung */}
        <div className="flex flex-col items-center pt-1 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#34C759] text-2xl">
            🙌
          </span>
          <div className="mt-2 text-[13px] font-semibold text-tinte-leise">Mithilfe nachtragen</div>
          {fertig ? (
            <Erfolg />
          ) : (
            <>
              <div className="zahl mt-1 text-[2.6rem] font-extrabold leading-none tracking-[-0.03em]">
                {wert !== null ? `+${wert} %` : <span className="text-tinte-leise">– %</span>}
              </div>
              <div className="mt-1.5 min-h-[1.25rem] text-[14px] font-semibold">
                {titel || <span className="text-tinte-leise">Wähle aus, wobei du geholfen hast</span>}
              </div>
              {(sonstiges || vorlage?.variabel) && (
                <div className="mt-0.5 text-[12px] text-tinte-leise">Den Wert legt das Stufenteam fest.</div>
              )}
            </>
          )}
        </div>

        {fertig ? (
          <div className="mt-5 grid gap-2">
            <p className="text-center text-[13.5px] leading-relaxed text-tinte-matt dark:text-slate-300">
              Das Stufenteam prüft deinen Antrag. Du bekommst Bescheid, sobald entschieden ist.
            </p>
            <button onClick={zuruecksetzen} className="btn-primary mt-2">
              Noch etwas nachtragen
            </button>
          </div>
        ) : (
          <>
            {/* ------------------------------------------------ Wofür */}
            <Gruppe titel="Wofür">
              <button
                onClick={() => setWaehlen(true)}
                className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
              >
                <span className="shrink-0 text-[15px]">Aktion</span>
                <span className={`min-w-0 flex-1 truncate text-right text-[15px] ${wahl ? "text-tinte-matt dark:text-slate-300" : "text-brand"}`}>
                  {sonstiges ? "Sonstiges" : vorlage?.titel || "Auswählen"}
                </span>
                <span className="text-tinte-leise">›</span>
              </button>
              {sonstiges && (
                <Zeile label="Name">
                  <input
                    autoFocus
                    className="w-full bg-transparent text-right text-[15px] outline-none placeholder:text-tinte-leise"
                    placeholder="Name der Aktion"
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Zeile>
              )}
            </Gruppe>

            {/* ------------------------------------------------ Details */}
            <Gruppe titel="Details">
              <Zeile label="Für">
                <span className="truncate text-[15px] text-tinte-matt dark:text-slate-300">
                  {ich ? `${ich.vorname} ${ich.nachname}` : "–"}
                </span>
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
              <div className="px-4 py-3">
                <textarea
                  className="min-h-[72px] w-full resize-none bg-transparent text-[15px] outline-none placeholder:text-tinte-leise"
                  placeholder={sonstiges ? "Was hast du gemacht? (Pflicht bei Sonstiges)" : "Was hast du gemacht? (freiwillig)"}
                  maxLength={500}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </div>
            </Gruppe>

            {!ich && (
              <p className="mt-3 text-center text-[12.5px] text-amber-700 dark:text-amber-300">
                Dein Zugang ist mit keinem Eintrag in der Stufe verknüpft – frag das Stufenteam.
              </p>
            )}
            <GesperrtZeile className="mt-3" />
            {fehler && <p className="mt-3 text-center text-[13px] font-semibold text-red-600">Das hat nicht geklappt: {fehler}</p>}

            <button disabled={!geht || sendet} onClick={() => void senden()} className="btn-primary mt-4 w-full disabled:opacity-40">
              {sendet ? "Wird gesendet …" : "Antrag senden"}
            </button>
            <p className="mt-2 text-center text-[11.5px] text-tinte-leise">
              Das Stufenteam sieht deinen Namen, die Aktion, das Datum und deinen Text.
            </p>
          </>
        )}

        {/* ------------------------------------------------ Meine Anträge */}
        {meine.length > 0 && (
          <Gruppe titel="Deine Anträge">
            {meine.slice(0, 12).map((n) => (
              <EigeneZeile key={n.id} n={n} onZurueck={() => void zurueckziehen(n.id)} />
            ))}
          </Gruppe>
        )}
        </>
        )}
      </div>
    </Sheet>
  );
}

function AktionWahl({
  vorlagen,
  leer,
  wahl,
  suche,
  setSuche,
  onNimm,
  onZurueck,
}: {
  vorlagen: { id: string; titel: string; punkte: number; variabel?: boolean }[];
  leer: boolean;
  wahl: string | null;
  suche: string;
  setSuche: (s: string) => void;
  onNimm: (id: string) => void;
  onZurueck: () => void;
}) {
  const zeile = "flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]";
  return (
    <>
      <div className="mb-2 flex items-center gap-2">
        <button onClick={onZurueck} className="-ml-1 rounded-full px-2 py-1.5 text-[15px] font-semibold text-brand-dark dark:text-brand">
          ‹ Zurück
        </button>
        <div className="flex-1 text-center text-[15px] font-semibold">Aktion wählen</div>
        <span className="w-16" />
      </div>
      <input
        type="search"
        placeholder="Suchen"
        value={suche}
        onChange={(e) => setSuche(e.target.value)}
        className="w-full rounded-xl bg-[rgb(118_118_128/0.12)] px-3 py-2 text-[15px] outline-none placeholder:text-tinte-leise dark:bg-[rgb(118_118_128/0.24)]"
      />
      <div className="mt-3 divide-y divide-black/[0.06] overflow-hidden rounded-2xl bg-[rgb(118_118_128/0.08)] dark:divide-white/[0.08] dark:bg-[rgb(118_118_128/0.18)]">
        {vorlagen.length === 0 && (
          <div className="px-4 py-4 text-center text-[13px] text-tinte-leise">{leer ? "Noch keine Aktionen angelegt." : "Nichts gefunden."}</div>
        )}
        {vorlagen.map((v) => (
          <button key={v.id} onClick={() => onNimm(v.id)} className={zeile}>
            <span className="min-w-0 flex-1 truncate text-[15px]">{v.titel}</span>
            <span className="zahl w-[4.5rem] shrink-0 text-right text-[14px] font-bold text-brand">{v.variabel ? "% frei" : `+${v.punkte} %`}</span>
            <span className={`w-4 shrink-0 text-brand ${wahl === v.id ? "" : "invisible"}`}>✓</span>
          </button>
        ))}
      </div>
      <div className="mt-3 overflow-hidden rounded-2xl bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]">
        <button onClick={() => onNimm(SONSTIGES)} className={zeile}>
          <span className="min-w-0 flex-1 truncate text-[15px]">Sonstiges …</span>
          <span className="shrink-0 text-[13px] text-tinte-leise">eigene Aktion</span>
          <span className={`w-4 shrink-0 text-brand ${wahl === SONSTIGES ? "" : "invisible"}`}>✓</span>
        </button>
      </div>
    </>
  );
}

function Erfolg() {
  return (
    <div className="mt-2 flex flex-col items-center">
      <svg viewBox="0 0 76 76" className="h-16 w-16" aria-hidden>
        <circle cx="38" cy="38" r="35" className="melde-kreis fill-[#34C759]" />
        <path
          d="M24 39.5 L34 49 L53 29"
          fill="none"
          stroke="white"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="melde-haken"
        />
      </svg>
      <div className="mt-2 text-[1.2rem] font-bold">Antrag gesendet</div>
    </div>
  );
}

function EigeneZeile({ n, onZurueck }: { n: Nachtrag; onZurueck: () => void }) {
  const stand =
    n.status === "offen"
      ? { text: "⏳ wird geprüft", klasse: "text-tinte-leise" }
      : n.status === "angenommen"
        ? { text: `✓ +${n.vergeben ?? n.punkte ?? 0} %`, klasse: "text-emerald-700 dark:text-emerald-300" }
        : { text: "abgelehnt", klasse: "text-red-600 dark:text-red-400" };
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{n.titel}</span>
        <span className={`shrink-0 text-[13px] font-bold ${stand.klasse}`}>{stand.text}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-[12px] text-tinte-leise">
        <span className="min-w-0 flex-1 truncate">{tagLang(n.datum)}</span>
        {n.status === "offen" && (
          <button
            onClick={() => void frage("Antrag zurückziehen?", "Zurückziehen", true).then((ok) => ok && onZurueck())}
            className="shrink-0 font-semibold text-red-600 dark:text-red-400"
          >
            zurückziehen
          </button>
        )}
      </div>
      {n.antwort && <div className="mt-1 text-[12.5px] italic text-tinte-matt dark:text-slate-300">„{n.antwort}“</div>}
    </div>
  );
}
