import { useMemo, useState } from "react";
import { Sheet } from "./Sheet";
import { useStore } from "../store";
import { useRole } from "../auth/RoleProvider";
import { heuteKey, tagLang } from "../lib/termine";
import { useNachtraege, type Nachtrag } from "../lib/nachtrag";
import { frage } from "../lib/melder";

const SONSTIGES = "__sonstiges__";

/**
 * Mithilfe nachtragen – aufgebaut wie eine Rechnung bei Apple: oben groß der
 * Wert, darunter in einer Liste, wofür, wann und was. Unten der Knopf. Nach
 * dem Senden ein grüner Haken; darunter die eigenen Anträge mit Stand.
 */
export function NachtragSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { templates, students } = useStore();
  const { studentId } = useRole();
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

  const vorlage = vorlagen.find((v) => v.id === wahl) || null;
  const sonstiges = wahl === SONSTIGES;
  // Fester Wert nur bei Vorlagen ohne „% frei“ – sonst legt das Team ihn fest
  const wert = vorlage && !vorlage.variabel ? vorlage.punkte : null;
  const titel = sonstiges ? name.trim() : vorlage?.titel || "";
  const geht = Boolean(ich && titel && datum && datum <= heuteKey() && (!sonstiges || text.trim().length >= 3));

  function zuruecksetzen() {
    setWahl(null);
    setName("");
    setText("");
    setDatum(heuteKey());
    setFehler("");
    setFertig(false);
  }

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
        {/* ------------------------------------------------ Kopf wie eine Rechnung */}
        <div className="flex flex-col items-center pt-1 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-2xl shadow-sm">
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
              <div className="flex flex-wrap gap-1.5 p-3">
                {vorlagen.map((v) => {
                  const an = wahl === v.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() => setWahl(v.id)}
                      aria-pressed={an}
                      className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[12.5px] font-semibold transition active:scale-[.97] ${
                        an
                          ? "border-brand bg-brand text-white"
                          : "border-black/[0.06] bg-white dark:border-white/10 dark:bg-slate-800"
                      }`}
                    >
                      {v.titel}
                      <span className={`zahl font-bold ${an ? "text-white" : "text-brand"}`}>
                        {v.variabel ? "% frei" : `+${v.punkte} %`}
                      </span>
                    </button>
                  );
                })}
                <button
                  onClick={() => setWahl(SONSTIGES)}
                  aria-pressed={sonstiges}
                  className={`rounded-xl border px-2.5 py-2 text-[12.5px] font-semibold transition active:scale-[.97] ${
                    sonstiges
                      ? "border-brand bg-brand text-white"
                      : "border-dashed border-tinte-leise/50 text-tinte-matt dark:text-slate-300"
                  }`}
                >
                  Sonstiges …
                </button>
              </div>
              {sonstiges && (
                <Zeile label="Aktion">
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
      </div>
    </Sheet>
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

/** Abschnitt wie in den iOS-Einstellungen: kleine Überschrift, weiße Gruppe. */
export function Gruppe({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="mb-1.5 px-4 text-[12px] font-semibold uppercase tracking-[0.04em] text-tinte-leise">{titel}</h3>
      <div className="divide-y divide-black/[0.06] overflow-hidden rounded-2xl bg-[rgb(118_118_128/0.08)] dark:divide-white/[0.08] dark:bg-[rgb(118_118_128/0.18)]">
        {children}
      </div>
    </section>
  );
}

/** Eine Zeile: links die Bezeichnung, rechts der Wert. */
export function Zeile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[48px] items-center gap-3 px-4 py-2">
      <span className="shrink-0 text-[15px]">{label}</span>
      <span className="flex min-w-0 flex-1 justify-end">{children}</span>
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
