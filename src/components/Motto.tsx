import { useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { Schalter } from "./Schalter";
import { AusHinweis } from "./Funktionen";
import { GesperrtZeile, GESPERRT_TEXT } from "./Gesperrt";
import { ZahnradKnopf } from "./Rankings";
import { useRole } from "../auth/RoleProvider";
import { useFunktionen } from "../lib/funktionen";
import { useMotto, type Motto, type MottoArt, type MottoWahl } from "../lib/motto";
import { frage, melde, meldeFehler } from "../lib/melder";

const MEDAILLE = ["#E9C460", "#C0C4CC", "#D4A373"];

/* ====================================================================== */
/* Karte im Profil                                                        */
/* ====================================================================== */
export function MottoKarte({ className = "" }: { className?: string }) {
  const { can, isEltern, uid, banned } = useRole();
  const { sichtbar } = useFunktionen();
  const darf = !isEltern && sichtbar("motto") && (can("motto.nutzen") || can("motto.verwalten"));
  const m = useMotto(darf, uid);
  const [ansicht, setAnsicht] = useState<null | "liste" | "neu">(null);
  if (!darf) return null;

  const sichtbare = m.mottos.filter((x) => !x.ausgeblendet);
  const gewaehlt = sichtbare.find((x) => x.gewaehlt) || null;
  const vorne = [...sichtbare].sort((a, b) => m.punkte(b.id) - m.punkte(a.id))[0] || null;

  return (
    <div className={className}>
      <AusHinweis funktion="motto" className="mb-1.5 px-1" />
      <section className="relative overflow-hidden rounded-[1.4rem] bg-gradient-to-br from-[#5E2BFF] via-[#A3148F] to-[#D9480F] p-4 text-white shadow-[0_10px_30px_-14px_rgba(94,43,255,.8)] sm:p-5">
        <span aria-hidden className="pointer-events-none absolute -right-3 -top-4 text-[6.5rem] leading-none opacity-20">
          ✨
        </span>
        <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/80">
          {gewaehlt ? "Unser Abimotto" : m.abstimmung ? "Abimotto · Abstimmung läuft" : "Abimotto · Vorschläge"}
        </div>
        {gewaehlt ? (
          <button onClick={() => setAnsicht("liste")} className="mt-1.5 block max-w-[85%] text-left text-[1.45rem] font-extrabold leading-tight tracking-[-0.01em]">
            {gewaehlt.text}
          </button>
        ) : m.abstimmung && vorne && m.punkte(vorne.id) > 0 ? (
          <button onClick={() => setAnsicht("liste")} className="mt-1.5 block max-w-[85%] text-left">
            <span className="block text-[12px] font-semibold text-white/75">Gerade vorne</span>
            <span className="block text-[1.3rem] font-extrabold leading-tight">{vorne.text}</span>
            <span className="mt-1 block text-[13px] text-white/80">
              🔥 {m.zahl(vorne.id, "feuer")} · 👍 {m.zahl(vorne.id, "like")}
            </span>
          </button>
        ) : (
          <p className="mt-1.5 max-w-[85%] text-[1.2rem] font-bold leading-snug">
            {m.abstimmung ? "Abstimmen: Welches Motto soll auf unsere Pullis?" : "Reiche Vorschläge für unser Abimotto ein"}
          </p>
        )}
        <div className="mt-1.5 text-[13px] text-white/80">
          {sichtbare.length} {sichtbare.length === 1 ? "Vorschlag" : "Vorschläge"}
          {m.abstimmung && m.meinFavorit ? ` · Dein 🔥: ${m.meinFavorit.text}` : !m.abstimmung && !gewaehlt ? " · Abstimmung startet, sobald das Komitee sie freigibt" : ""}
        </div>
        <GesperrtZeile hell className="mt-3" />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {m.abstimmung || gewaehlt ? (
            <button onClick={() => setAnsicht("liste")} className="rounded-full bg-white px-4 py-2 text-[14px] font-semibold text-[#5E2BFF] transition active:scale-95">
              {gewaehlt ? "Alle ansehen" : "Abstimmen"}
            </button>
          ) : (
            <>
              {!banned && (
                <button onClick={() => setAnsicht("neu")} className="rounded-full bg-white px-4 py-2 text-[14px] font-semibold text-[#5E2BFF] transition active:scale-95">
                  Vorschlag einreichen
                </button>
              )}
              <button onClick={() => setAnsicht("liste")} className="rounded-full bg-white/20 px-4 py-2 text-[14px] font-semibold transition active:scale-95">
                Alle ansehen
              </button>
            </>
          )}
        </div>
      </section>
      <MottoSheet m={m} ansicht={ansicht} setAnsicht={setAnsicht} />
    </div>
  );
}

/* ====================================================================== */
/* Blatt                                                                  */
/* ====================================================================== */
function MottoSheet({
  m,
  ansicht,
  setAnsicht,
}: {
  m: MottoWahl;
  ansicht: null | "liste" | "neu";
  setAnsicht: (a: null | "liste" | "neu") => void;
}) {
  const { can, banned } = useRole();
  const [verwalten, setVerwalten] = useState(false);
  const [sort, setSort] = useState<"top" | "neu">("top");
  const darfVerwalten = can("motto.verwalten");
  const schliessen = () => {
    setAnsicht(null);
    setVerwalten(false);
  };
  const liste = m.mottos
    .filter((x) => verwalten || !x.ausgeblendet)
    .sort((a, b) => (m.abstimmung && sort === "top" ? m.punkte(b.id) - m.punkte(a.id) || b.created_at.localeCompare(a.created_at) : b.created_at.localeCompare(a.created_at)));
  const rang = [...m.mottos.filter((x) => !x.ausgeblendet)].sort((a, b) => m.punkte(b.id) - m.punkte(a.id)).map((x) => x.id);

  return (
    <Sheet open={ansicht !== null} onClose={schliessen}>
      {ansicht === "neu" ? (
        <Vorschlagen m={m} fertig={() => setAnsicht("liste")} schliessen={schliessen} />
      ) : (
        <>
          <SheetKopf
            titel="Abimotto"
            unter={
              verwalten
                ? "Verwalten: Abstimmung freigeben, ändern, ausblenden, festlegen"
                : m.abstimmung
                  ? "🔥 = dein Favorit (nur einer) · 👍 so viele du willst"
                  : "Reiche Vorschläge ein – abgestimmt wird, sobald das Komitee die Abstimmung freigibt."
            }
            onClose={schliessen}
            extra={
              <>
                {darfVerwalten && <ZahnradKnopf label={verwalten ? "Verwalten beenden" : "Abimotto verwalten"} onClick={() => setVerwalten((v) => !v)} />}
                {!banned && (!m.abstimmung || darfVerwalten) && (
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
          {verwalten && (
            <label className="mb-3 flex items-center gap-3 rounded-2xl bg-gradient-to-br from-[#5E2BFF]/10 to-[#D9480F]/10 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">Abstimmung freigeben</span>
                <span className="block text-[12.5px] leading-snug text-tinte-leise">
                  {m.abstimmung ? "Läuft: alle stimmen mit 👍 und 🔥 ab, neue Vorschläge nur noch vom Komitee." : "Aus: alle können Vorschläge einreichen, abstimmen geht noch nicht."}
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
          {!m.abstimmung && !verwalten && !banned && (
            <button
              onClick={() => setAnsicht("neu")}
              className="mb-3 w-full rounded-2xl bg-gradient-to-br from-[#5E2BFF] via-[#A3148F] to-[#D9480F] px-4 py-3 text-left text-[15px] font-semibold text-white transition active:scale-[.99]"
            >
              ✨ Vorschlag einreichen
            </button>
          )}
          {m.abstimmung && (
          <div className="seg mb-3">
            <button className={`seg-item ${sort === "top" ? "seg-aktiv" : ""}`} onClick={() => setSort("top")}>
              Beliebteste
            </button>
            <button className={`seg-item ${sort === "neu" ? "seg-aktiv" : ""}`} onClick={() => setSort("neu")}>
              Neueste
            </button>
          </div>
          )}
          <div className="space-y-2.5">
            {liste.map((x) =>
              verwalten ? (
                <VerwaltenZeile key={x.id} x={x} m={m} />
              ) : (
                <MottoZeile key={x.id} x={x} m={m} platz={m.abstimmung && sort === "top" ? rang.indexOf(x.id) : -1} gesperrt={banned} />
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

function MottoZeile({ x, m, platz, gesperrt }: { x: Motto; m: MottoWahl; platz: number; gesperrt: boolean }) {
  const top = platz >= 0 && platz < 3 && m.punkte(x.id) > 0;
  const tippen = async (art: MottoArt) => {
    if (gesperrt) return meldeFehler(GESPERRT_TEXT);
    const f = await m.abstimmen(x.id, art);
    if (f) meldeFehler("Ging nicht: " + f);
  };
  return (
    <div
      className={`rounded-2xl p-3.5 ${
        x.gewaehlt
          ? "bg-gradient-to-br from-[#5E2BFF]/15 to-[#FF6B3D]/15 ring-2 ring-[#B5179E]/50"
          : "bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]"
      }`}
    >
      <div className="flex items-start gap-2.5">
        {top && (
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-[#1C1C1E]" style={{ background: MEDAILLE[platz] }}>
            {platz + 1}
          </span>
        )}
        <div className="min-w-0 flex-1">
          {x.gewaehlt && <div className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#B5179E]">Festgelegt ✓</div>}
          <div className="text-[16px] font-bold leading-snug">{x.text}</div>
          {x.erklaerung && <div className="mt-0.5 text-[13px] leading-snug text-tinte-matt dark:text-slate-300">{x.erklaerung}</div>}
          {x.von === m.me && <div className="mt-1 text-[11.5px] text-tinte-leise">Dein Vorschlag</div>}
        </div>
      </div>
      {m.abstimmung && (
      <div className="mt-2.5 flex gap-2">
        <StimmKnopf zeichen="👍" n={m.zahl(x.id, "like")} an={m.meine(x.id, "like")} label="Gefällt mir" onClick={() => void tippen("like")} />
        <StimmKnopf zeichen="🔥" n={m.zahl(x.id, "feuer")} an={m.meine(x.id, "feuer")} label="Mein Favorit" onClick={() => void tippen("feuer")} feuer />
      </div>
      )}
    </div>
  );
}

function StimmKnopf({ zeichen, n, an, label, onClick, feuer }: { zeichen: string; n: number; an: boolean; label: string; onClick: () => void; feuer?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={an}
      aria-label={`${label}: ${n}`}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-semibold transition active:scale-90 ${
        an
          ? feuer
            ? "bg-[#FF6B3D] text-white shadow-[0_4px_12px_-4px_rgba(255,107,61,.8)]"
            : "bg-brand text-white"
          : "bg-white text-tinte-matt shadow-sm dark:bg-slate-800 dark:text-slate-200"
      }`}
    >
      <span className={an ? "animate-herz" : ""}>{zeichen}</span>
      <span className="zahl">{n}</span>
    </button>
  );
}

function VerwaltenZeile({ x, m }: { x: Motto; m: MottoWahl }) {
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
          <button className="block w-full text-left" onClick={() => setBearbeite(true)}>
            <span className="block text-[15px] font-bold leading-snug">{x.text}</span>
            {x.erklaerung && <span className="block text-[12.5px] text-tinte-leise">{x.erklaerung}</span>}
            <span className="mt-0.5 block text-[12px] text-tinte-leise">
              🔥 {m.zahl(x.id, "feuer")} · 👍 {m.zahl(x.id, "like")} · von {x.von_name || "?"} · antippen zum Ändern
            </span>
          </button>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
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
              className={`ml-auto rounded-full px-3 py-1.5 text-[13px] font-semibold transition active:scale-95 disabled:opacity-40 ${
                x.gewaehlt ? "bg-[#B5179E] text-white" : "bg-white text-[#B5179E] shadow-sm dark:bg-slate-800"
              }`}
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
      <div className="mt-4 rounded-2xl bg-gradient-to-br from-[#5E2BFF] via-[#A3148F] to-[#D9480F] p-4 text-white">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/75">Vorschau</div>
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
