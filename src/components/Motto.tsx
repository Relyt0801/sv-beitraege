import { useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { Schalter } from "./Schalter";
import { AusHinweis } from "./Funktionen";
import { GesperrtZeile, GESPERRT_TEXT } from "./Gesperrt";
import { MeldenKnopf } from "./Melden";
import { melden } from "../lib/melden";
import { ZahnradKnopf } from "./Rankings";
import { useRole } from "../auth/RoleProvider";
import { useFunktionen } from "../lib/funktionen";
import { useMotto, type Motto, type MottoWahl } from "../lib/motto";
import { frage, melde, meldeFehler } from "../lib/melder";
import { useRunden, type RundenStand } from "../lib/runden";
import { RundenAbschnitt, RundenMarke } from "./Runden";
import { Kachel } from "./Kachel";
import { AutorInfo, WortfilterSchalter } from "./AutorInfo";

const MEDAILLE = ["#E9C460", "#C0C4CC", "#D4A373"];

/* ====================================================================== */
/* Karte auf der Startseite                                               */
/* ====================================================================== */
export function MottoKarte({ className = "" }: { className?: string }) {
  const { can, isEltern, uid, banned } = useRole();
  const { sichtbar } = useFunktionen();
  const darf = !isEltern && sichtbar("motto") && (can("motto.nutzen") || can("motto.verwalten"));
  const m = useMotto(darf, uid);
  const r = useRunden("motto", darf, uid, can("motto.runden"));
  const [ansicht, setAnsicht] = useState<null | "liste" | "neu">(null);
  if (!darf) return null;

  const sichtbare = m.mottos.filter((x) => !x.ausgeblendet);
  const gewaehlt = sichtbare.find((x) => x.gewaehlt) || null;
  const meineLikes = sichtbare.filter((x) => m.meine(x.id, "like")).length;
  const runde = r.offeneVon("");

  return (
    <div className={`flex flex-col ${className}`}>
      <AusHinweis funktion="motto" className="mb-1.5 px-1" />
      <Kachel
        icon="funke"
        farbe="bg-[#FF9500]"
        marke={runde ? <RundenMarke runde={runde} /> : undefined}
        titel={gewaehlt ? gewaehlt.text : runde ? "Abimotto: engere Auswahl" : m.abstimmung ? "Abstimmen: Welches Motto?" : "Abimotto"}
        unter={
          gewaehlt
            ? "Unser Abimotto steht fest."
            : runde
              ? `${r.meineIn(runde.id).length} von ${runde.stimmen} ${runde.stimmen === 1 ? "Stimme" : "Stimmen"} vergeben`
              : m.abstimmung
                ? `${sichtbare.length} Vorschläge · ${meineLikes ? `du hast ${meineLikes} gelikt` : "like alle, die dir gefallen"}`
                : `Reiche Vorschläge ein · ${sichtbare.length} bisher`
        }
        knoepfe={
          <>
            {!gewaehlt && !runde && !m.abstimmung && !banned && (
              <button onClick={() => setAnsicht("neu")} className="btn-klein">
                Vorschlagen
              </button>
            )}
            <button onClick={() => setAnsicht("liste")} className={gewaehlt || runde || m.abstimmung ? "btn-klein" : "btn-klein-grau"}>
              {gewaehlt ? "Alle ansehen" : runde || m.abstimmung ? "Abstimmen" : "Alle ansehen"}
            </button>
          </>
        }
      >
        <GesperrtZeile className="mt-3" />
      </Kachel>
      <MottoSheet m={m} r={r} ansicht={ansicht} setAnsicht={setAnsicht} />
    </div>
  );
}

/* ====================================================================== */
/* Blatt                                                                  */
/* ====================================================================== */
function MottoSheet({
  m,
  r,
  ansicht,
  setAnsicht,
}: {
  m: MottoWahl;
  r: RundenStand;
  ansicht: null | "liste" | "neu";
  setAnsicht: (a: null | "liste" | "neu") => void;
}) {
  const { can, banned } = useRole();
  const [verwalten, setVerwalten] = useState(false);
  const darfRunden = can("motto.runden");
  const darfVerwalten = can("motto.verwalten") || darfRunden;
  const schliessen = () => {
    setAnsicht(null);
    setVerwalten(false);
  };
  // Für alle: neueste zuerst, ohne Zahlen. Ergebnisse (sortiert nach 👍) sieht
  // nur, wer das Motto verwaltet (Komitee Motto & Pullis, Admin).
  const liste = m.mottos
    .filter((x) => verwalten || !x.ausgeblendet)
    .sort((a, b) =>
      verwalten ? m.zahl(b.id, "like") - m.zahl(a.id, "like") || b.created_at.localeCompare(a.created_at) : b.created_at.localeCompare(a.created_at),
    );
  const hoechste = Math.max(1, ...liste.map((x) => m.zahl(x.id, "like")));
  const stimmende = m.waehlende;

  return (
    <Sheet open={ansicht !== null} onClose={schliessen}>
      {ansicht === "neu" ? (
        <Vorschlagen m={m} fertig={() => setAnsicht("liste")} schliessen={schliessen} />
      ) : (
        <>
          <SheetKopf
            titel={verwalten ? "Ergebnisse" : "Abimotto"}
            unter={
              verwalten
                ? `Nur für das Komitee sichtbar · ${stimmende} ${stimmende === 1 ? "Person hat" : "Personen haben"} abgestimmt`
                : r.offeneVon("")
                  ? "Engere Auswahl: Vergib oben deine Stimmen. Die Ergebnisse sieht das Komitee."
                  : m.abstimmung
                  ? "Gib allen Mottos ein 👍, die dir gefallen. Die Ergebnisse sieht nur das Komitee."
                  : "Reiche Vorschläge ein – abgestimmt wird, sobald das Komitee die Abstimmung freigibt."
            }
            onClose={schliessen}
            extra={
              <>
                {darfVerwalten && (
                  <ZahnradKnopf label={verwalten ? "Zurück zur Abstimmung" : "Ergebnisse und Verwalten"} onClick={() => setVerwalten((v) => !v)} />
                )}
                {!banned && !verwalten && ((!m.abstimmung && !r.offeneVon("")) || darfVerwalten) && (
                  <button
                    type="button"
                    onClick={() => setAnsicht("neu")}
                    aria-label="Motto vorschlagen"
                    className="-my-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90"
                  >
                    <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-brand text-[18px] font-bold leading-none text-white">+</span>
                  </button>
                )}
              </>
            }
          />
          <AusHinweis funktion="motto" className="-mt-2 mb-3" />
          <GesperrtZeile className="-mt-1 mb-3" />
          {/* Abstimmungsrunden: offen für alle sichtbar; Start nur, wer sie leitet */}
          <RundenAbschnitt
            stand={r}
            quellen={m.mottos.filter((x) => !x.ausgeblendet).map((x) => ({ id: x.id, label: x.text, unter: x.erklaerung, punkte: m.zahl(x.id, "like") }))}
            leitet={darfRunden && verwalten}
            gesperrt={banned}
          />
          {verwalten && (
            <div className="mb-3 space-y-2">
              {can("motto.verwalten") && (
                <label className="feld-grau flex min-h-[44px] items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">Runde 1: Likes freigeben</span>
                    <span className="block text-[12.5px] leading-snug text-tinte-leise">
                      {m.abstimmung
                        ? "Läuft: alle liken Mottos, neue Vorschläge nur noch vom Komitee."
                        : "Aus: alle können Vorschläge einreichen, abstimmen geht noch nicht."}
                    </span>
                  </span>
                  <Schalter
                    an={m.abstimmung}
                    label="Abstimmung freigeben"
                    onChange={async (v) => {
                      const f = await m.abstimmungSetzen(v);
                      if (f) meldeFehler("Ging nicht: " + f);
                      else melde(v ? "Abstimmung ist freigegeben" : "Zurück zu Vorschlägen", "erfolg");
                    }}
                  />
                </label>
              )}
              <WortfilterSchalter bereich="motto" />
            </div>
          )}
          {r.offeneVon("") && !verwalten && (
            <div className="mb-2 mt-1 px-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-tinte-leise">Alle Vorschläge</div>
          )}
          <div className="space-y-2.5">
            {liste.map((x, i) =>
              verwalten ? (
                <VerwaltenZeile key={x.id} x={x} m={m} platz={i} anteil={m.zahl(x.id, "like") / hoechste} />
              ) : (
                <MottoZeile key={x.id} x={x} m={m} gesperrt={banned} />
              ),
            )}
            {liste.length === 0 && (
              <div className="rounded-2xl border border-dashed border-black/10 px-4 py-8 text-center dark:border-white/15">
                <div className="text-[28px]">✨</div>
                <p className="mt-1 text-[14px] text-tinte-leise">Noch keine Vorschläge – mach den ersten!</p>
              </div>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}

function MottoZeile({ x, m, gesperrt }: { x: Motto; m: MottoWahl; gesperrt: boolean }) {
  const darfAutor = useRole().can("motto.verwalten");
  const an = m.meine(x.id, "like");
  const tippen = async () => {
    if (gesperrt) return meldeFehler(GESPERRT_TEXT);
    const f = await m.abstimmen(x.id, "like");
    if (f) meldeFehler("Ging nicht: " + f);
  };
  return (
    <div
      className={`rounded-2xl p-3.5 ${
        x.gewaehlt ? "bg-brand/[0.06] ring-2 ring-brand/60" : "bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {x.gewaehlt && <div className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-brand-dark dark:text-brand">Unser Motto ✓</div>}
          <div className="text-[16px] font-bold leading-snug">{x.text}</div>
          {x.erklaerung && <div className="mt-0.5 text-[13px] leading-snug text-tinte-matt dark:text-slate-300">{x.erklaerung}</div>}
          <div className="mt-1 flex items-center gap-3">
            {m.istMeins(x.id) ? (
              <span className="text-[11.5px] text-tinte-leise">Dein Vorschlag</span>
            ) : (
              <MeldenKnopf onClick={() => melden("motto", x.id)} />
            )}
            {darfAutor && <AutorInfo art="motto" id={x.id} />}
          </div>
        </div>
        {m.abstimmung && <StimmKnopf an={an} onClick={() => void tippen()} />}
      </div>
    </div>
  );
}

function StimmKnopf({ an, onClick }: { an: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={an}
      aria-label={an ? "Gefällt mir – zurücknehmen" : "Gefällt mir"}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[14px] font-semibold transition active:scale-90 ${
        an ? "bg-brand text-white shadow-[0_4px_12px_-4px_rgb(var(--brand)/.8)]" : "bg-white text-tinte-matt shadow-sm dark:bg-slate-800 dark:text-slate-200"
      }`}
    >
      <span className={an ? "animate-herz" : ""}>👍</span>
      {an ? "Gefällt mir" : "Like"}
    </button>
  );
}

function VerwaltenZeile({ x, m, platz, anteil }: { x: Motto; m: MottoWahl; platz: number; anteil: number }) {
  const n = m.zahl(x.id, "like");
  const [bearbeite, setBearbeite] = useState(false);
  const [text, setText] = useState(x.text);
  const [erkl, setErkl] = useState(x.erklaerung);
  const speichern = async (patch: Parameters<MottoWahl["aendern"]>[1]) => {
    const f = await m.aendern(x.id, patch);
    if (f) meldeFehler("Ging nicht: " + f);
    return f;
  };
  return (
    <div className={`rounded-2xl bg-[rgb(118_118_128/0.08)] p-3.5 dark:bg-[rgb(118_118_128/0.18)] ${x.ausgeblendet ? "opacity-60" : ""}`}>
      {bearbeite ? (
        <div className="space-y-2">
          <input className="field" maxLength={80} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          <input className="field" maxLength={200} placeholder="Erklärung (optional)" value={erkl} onChange={(e) => setErkl(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-grau flex-1 !min-h-[40px] !text-[15px]" onClick={() => setBearbeite(false)}>
              Abbrechen
            </button>
            <button
              className="btn-primary flex-1 !min-h-[40px] !text-[15px]"
              disabled={text.trim().length < 2}
              onClick={async () => {
                if (!(await speichern({ text, erklaerung: erkl }))) setBearbeite(false);
              }}
            >
              Sichern
            </button>
          </div>
        </div>
      ) : (
        <>
          <button className="flex w-full items-start gap-2.5 text-left" onClick={() => setBearbeite(true)}>
            <span
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-[#1C1C1E]"
              style={{ background: n > 0 && platz < 3 ? MEDAILLE[platz] : "rgb(118 118 128 / .18)" }}
            >
              {platz + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold leading-snug">{x.text}</span>
              {x.erklaerung && <span className="block text-[12.5px] text-tinte-leise">{x.erklaerung}</span>}
              <span className="mt-1.5 flex items-center gap-2">
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.07] dark:bg-white/10">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.round(anteil * 100)}%` }} />
                </span>
                <span className="zahl w-12 shrink-0 text-right text-[13px] font-bold">👍 {n}</span>
              </span>
              <span className="mt-0.5 block text-[11.5px] text-tinte-leise">antippen zum Ändern</span>
            </span>
          </button>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <AutorInfo art="motto" id={x.id} className="mr-1" />
            <label className="flex items-center gap-2 text-[13px] font-semibold">
              <Schalter an={!x.ausgeblendet} label={`${x.text} sichtbar`} onChange={(v) => void speichern({ ausgeblendet: !v })} />
              Sichtbar
            </label>
            <button
              disabled={x.ausgeblendet}
              onClick={() =>
                void frage(
                  x.gewaehlt ? `„${x.text}“ nicht mehr als Motto festlegen?` : `„${x.text}“ als unser Abimotto festlegen? Es steht dann oben auf der Karte.`,
                  x.gewaehlt ? "Aufheben" : "Festlegen",
                ).then(async (ok) => {
                  if (ok && !(await speichern({ gewaehlt: !x.gewaehlt }))) melde(x.gewaehlt ? "Aufgehoben" : "Motto festgelegt", "erfolg");
                })
              }
              className={`ml-auto ${x.gewaehlt ? "btn-klein" : "btn-klein-grau"} !min-h-[2rem] !px-3 !text-[13px]`}
            >
              {x.gewaehlt ? "Festgelegt ✓" : "Als Motto festlegen"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Vorschlagen({ m, fertig, schliessen }: { m: MottoWahl; fertig: () => void; schliessen: () => void }) {
  const [text, setText] = useState("");
  const [erkl, setErkl] = useState("");
  const [sendet, setSendet] = useState(false);
  return (
    <div className="animate-vonRechts">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={fertig} className="py-1 text-[16px] font-semibold text-brand">
          ‹ Abimotto
        </button>
        <button onClick={schliessen} aria-label="Schließen" className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[rgb(118_118_128/0.12)] text-[13px] font-bold text-tinte-leise">
          ✕
        </button>
      </div>
      <h2 className="text-[1.375rem] font-bold leading-tight tracking-[-0.02em]">Motto vorschlagen</h2>
      <p className="mt-0.5 text-[13px] text-tinte-leise">Alle sehen den Vorschlag sofort. Abgestimmt wird, sobald das Komitee die Abstimmung freigibt.</p>
      <div className="feld-grau mt-4 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-tinte-leise">Vorschau</div>
        <div className="mt-1 min-h-[1.8rem] text-[1.3rem] font-extrabold leading-tight">{text.trim() || "Dein Motto"}</div>
      </div>
      <input className="field mt-3" maxLength={80} placeholder="z. B. ABIgeschlossen" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      <input className="field mt-2" maxLength={200} placeholder="Erklärung oder Wortspiel (optional)" value={erkl} onChange={(e) => setErkl(e.target.value)} />
      <div className="mt-1 px-1 text-right text-[11.5px] text-tinte-leise">{text.length}/80</div>
      <button
        className="btn-primary mt-3 w-full disabled:opacity-40"
        disabled={text.trim().length < 2 || sendet}
        onClick={async () => {
          setSendet(true);
          const f = await m.vorschlagen(text, erkl);
          setSendet(false);
          if (f) return meldeFehler(f);
          melde("Vorschlag ist drin", "erfolg");
          setText("");
          setErkl("");
          fertig();
        }}
      >
        {sendet ? "Wird gesendet …" : "Vorschlagen"}
      </button>
    </div>
  );
}
