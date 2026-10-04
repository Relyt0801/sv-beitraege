import { useMemo, useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { useRole } from "../auth/RoleProvider";
import { useFunktionen } from "../lib/funktionen";
import { useZitate, type Zitat, type ZitatArt, type Zitatwand } from "../lib/zitate";
import { AusHinweis } from "./Funktionen";
import { meldeFehler } from "../lib/melder";

/**
 * Zitatwand im Profil: dunkle Karte mit dem „Zitat des Tages“, darunter
 * Einreichen und Alle ansehen. Wer prüfen darf, sieht, wie viele warten.
 */
export function ZitateKarte({ className = "" }: { className?: string }) {
  const { can, isEltern, uid } = useRole();
  const { sichtbar } = useFunktionen();
  const darf = !isEltern && sichtbar("zitate") && (can("zitate.nutzen") || can("zitate.pruefen"));
  const wand = useZitate(darf, uid);
  const [offen, setOffen] = useState<null | "liste" | "neu" | "pruefen">(null);
  if (!darf) return null;

  const frei = wand.zitate.filter((z) => z.status === "frei");
  const warten = wand.zitate.filter((z) => z.status === "offen").length;
  // Zitat des Tages: wechselt täglich, aus den freigegebenen
  const tag = Math.floor(Date.now() / 864e5);
  const heute = frei.length ? frei[tag % frei.length] : null;

  return (
    <div className={className}>
      <AusHinweis funktion="zitate" className="mb-1.5 px-1" />
      <section className="relative overflow-hidden rounded-[1.4rem] bg-[#1C1C1E] p-4 text-white shadow-[0_10px_30px_-14px_rgba(0,0,0,.7)] sm:p-5">
        <span aria-hidden className="pointer-events-none absolute -right-2 -top-6 font-buch text-[9rem] leading-none text-[#E9C460]/15">
          ”
        </span>
        <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#E9C460]">
          {heute ? "Zitat des Tages" : "Zitatwand"}
        </div>
        {heute ? (
          <button onClick={() => setOffen("liste")} className="mt-2 block text-left">
            <span className="block font-buch text-[1.3rem] italic leading-snug">„{heute.text}“</span>
            <span className="mt-1.5 block text-[13px] text-white/70">
              — {heute.wer}
              {heute.kontext ? `, ${heute.kontext}` : ""}
            </span>
          </button>
        ) : (
          <p className="mt-2 font-buch text-[1.2rem] italic leading-snug text-white/85">Wer hat diesen einen Satz gesagt, den niemand vergisst?</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button onClick={() => setOffen("neu")} className="rounded-full bg-[#E9C460] px-4 py-2 text-[14px] font-semibold text-[#1C1C1E] transition active:scale-95">
            Zitat einreichen
          </button>
          <button onClick={() => setOffen("liste")} className="rounded-full bg-white/15 px-4 py-2 text-[14px] font-semibold transition active:scale-95">
            Alle {frei.length ? `(${frei.length})` : ""}
          </button>
          {can("zitate.pruefen") && warten > 0 && (
            <button onClick={() => setOffen("pruefen")} className="rounded-full bg-[#FF9F0A] px-3 py-2 text-[13px] font-bold text-[#1C1C1E] transition active:scale-95">
              {warten} prüfen
            </button>
          )}
        </div>
      </section>
      <ZitateSheet wand={wand} ansicht={offen} setAnsicht={setOffen} />
    </div>
  );
}

function ZitateSheet({
  wand,
  ansicht,
  setAnsicht,
}: {
  wand: Zitatwand;
  ansicht: null | "liste" | "neu" | "pruefen";
  setAnsicht: (a: null | "liste" | "neu" | "pruefen") => void;
}) {
  const { can } = useRole();
  const schliessen = () => setAnsicht(null);
  const warten = wand.zitate.filter((z) => z.status === "offen");

  return (
    <Sheet open={ansicht !== null} onClose={schliessen}>
      {ansicht === "neu" ? (
        <Einreichen wand={wand} fertig={() => setAnsicht("liste")} schliessen={schliessen} />
      ) : (
        <>
          <SheetKopf
            titel={<span className="font-buch italic">Zitatwand</span>}
            unter={`${wand.zitate.filter((z) => z.status === "frei").length} Zitate`}
            onClose={schliessen}
            extra={
              <button
                type="button"
                onClick={() => setAnsicht("neu")}
                aria-label="Zitat einreichen"
                className="-my-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90"
              >
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-brand text-[18px] font-bold leading-none text-white">+</span>
              </button>
            }
          />
          {can("zitate.pruefen") && (
            <div className="seg mb-4">
              <button className={`seg-item ${ansicht === "liste" ? "seg-aktiv" : ""}`} onClick={() => setAnsicht("liste")}>
                Wand
              </button>
              <button className={`seg-item ${ansicht === "pruefen" ? "seg-aktiv" : ""}`} onClick={() => setAnsicht("pruefen")}>
                Prüfen{warten.length ? ` (${warten.length})` : ""}
              </button>
            </div>
          )}
          {ansicht === "pruefen" ? <Pruefen wand={wand} /> : <Wand wand={wand} />}
        </>
      )}
    </Sheet>
  );
}

/* ---------------------------------------------------------------- Wand */
function Wand({ wand }: { wand: Zitatwand }) {
  const [filter, setFilter] = useState<"alle" | ZitatArt>("alle");
  const [sort, setSort] = useState<"top" | "neu">("top");
  const frei = wand.zitate.filter((z) => z.status === "frei");
  const meineOffenen = wand.zitate.filter((z) => z.status === "offen" && z.eingereicht_von === wand.me);

  const rang = useMemo(() => [...frei].sort((a, b) => wand.stimmenVon(b.id) - wand.stimmenVon(a.id)).map((z) => z.id), [frei, wand]);
  const liste = frei
    .filter((z) => filter === "alle" || z.art === filter)
    .sort((a, b) => (sort === "top" ? wand.stimmenVon(b.id) - wand.stimmenVon(a.id) : b.created_at.localeCompare(a.created_at)));

  if (!wand.bereit) return <p className="py-10 text-center text-[14px] text-tinte-leise">Lädt …</p>;

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <div className="seg flex-1">
          {(
            [
              ["alle", "Alle"],
              ["lehrer", "Lehrer"],
              ["schueler", "Schüler"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={`seg-item ${filter === k ? "seg-aktiv" : ""}`} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSort((s) => (s === "top" ? "neu" : "top"))}
          className="rounded-[9px] bg-[rgb(118_118_128/0.12)] px-3 py-1.5 text-[13px] font-semibold dark:bg-[rgb(118_118_128/0.24)]"
        >
          {sort === "top" ? "🔥 Top" : "🕒 Neu"}
        </button>
      </div>

      {meineOffenen.length > 0 && (
        <p className="mb-3 rounded-xl bg-[#FF9F0A]/15 px-3 py-2 text-[13px] text-tinte-matt dark:text-slate-300">
          {meineOffenen.length === 1 ? "Eins deiner Zitate wartet" : `${meineOffenen.length} deiner Zitate warten`} noch auf die Prüfung.
        </p>
      )}

      <div className="space-y-2.5">
        {liste.map((z) => (
          <ZitatZeile key={z.id} z={z} platz={sort === "top" ? rang.indexOf(z.id) + 1 : 0} wand={wand} />
        ))}
      </div>
      {liste.length === 0 && <p className="py-10 text-center text-[14px] text-tinte-leise">Noch keine Zitate. Reich das erste ein!</p>}
    </>
  );
}

function ZitatZeile({ z, platz, wand }: { z: Zitat; platz: number; wand: Zitatwand }) {
  const an = wand.meineStimme(z.id);
  const n = wand.stimmenVon(z.id);
  const [tick, setTick] = useState(0);
  return (
    <div className="flex gap-3 rounded-2xl bg-[rgb(118_118_128/0.08)] p-4 dark:bg-[rgb(118_118_128/0.18)]">
      <div className="min-w-0 flex-1">
        {platz > 0 && platz <= 3 && n > 0 && (
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#9A7410] dark:text-[#E9C460]">
            {["🥇", "🥈", "🥉"][platz - 1]} Platz {platz}
          </div>
        )}
        <div className="font-buch text-[17px] leading-[1.4]">„{z.text}“</div>
        <div className="mt-1.5 text-[13px] text-tinte-leise">
          — {z.wer}
          {z.kontext ? `, ${z.kontext}` : ""}
        </div>
      </div>
      <button
        onClick={() => {
          setTick((t) => t + 1);
          void wand.abstimmen(z.id);
        }}
        aria-label={an ? "Stimme zurücknehmen" : "Feuer geben"}
        aria-pressed={an}
        className={`flex w-[52px] shrink-0 flex-col items-center gap-0.5 self-start rounded-[14px] py-2 transition active:scale-90 ${
          an ? "bg-[#FF9F0A]/15 text-[#C93400] dark:text-[#FF9F0A]" : "bg-white/70 text-tinte-leise dark:bg-white/10"
        }`}
      >
        <span key={tick} className={`text-[19px] leading-none ${tick ? "animate-herz" : ""} ${an ? "" : "grayscale"}`}>
          🔥
        </span>
        <span className="zahl text-[12px] font-bold">{n}</span>
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- Einreichen */
function Einreichen({ wand, fertig, schliessen }: { wand: Zitatwand; fertig: () => void; schliessen: () => void }) {
  const [art, setArt] = useState<ZitatArt>("lehrer");
  const [wer, setWer] = useState("");
  const [text, setText] = useState("");
  const [kontext, setKontext] = useState("");
  const [busy, setBusy] = useState(false);
  const [gesendet, setGesendet] = useState(false);
  const geht = text.trim().length > 2 && wer.trim().length > 0;

  if (gesendet)
    return (
      <div className="flex animate-popIn flex-col items-center py-10 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#34C759] text-[30px] text-white">✓</span>
        <div className="mt-3 text-[1.25rem] font-bold">Eingereicht</div>
        <p className="mt-1 max-w-xs text-[14px] text-tinte-leise">Das Team schaut kurz drüber. Danach steht es auf der Zitatwand.</p>
        <button className="btn-primary mt-5 w-full" onClick={fertig}>
          Zur Zitatwand
        </button>
        <button
          className="mt-3 text-[15px] font-semibold text-tinte-leise"
          onClick={() => {
            setGesendet(false);
            setText("");
            setKontext("");
          }}
        >
          Noch eins einreichen
        </button>
      </div>
    );

  return (
    <div className="animate-fadeIn">
      <SheetKopf titel="Zitat einreichen" onClose={schliessen} />
      {/* Vorschau wie gedruckt */}
      <div className="rounded-2xl bg-[#FFF8E7] px-5 pb-4 pt-3 text-[#3A2E12] dark:bg-[#2A2414] dark:text-[#F3E7C6]">
        <div className="font-buch text-[2.6rem] leading-none text-[#C93400]">“</div>
        <div className={`-mt-2 min-h-[48px] font-buch text-[18px] italic leading-snug ${text.trim() ? "" : "opacity-40"}`}>
          {text.trim() || "Hier erscheint das Zitat, während du tippst …"}
        </div>
        <div className="mt-2 text-[13px] opacity-70">
          — {wer.trim() || (art === "lehrer" ? "Lehrkraft" : "Mitschüler*in")}
          {kontext.trim() ? `, ${kontext.trim()}` : ""}
        </div>
      </div>

      <div className="seg mt-4">
        <button className={`seg-item ${art === "lehrer" ? "seg-aktiv" : ""}`} onClick={() => setArt("lehrer")}>
          Lehrer
        </button>
        <button className={`seg-item ${art === "schueler" ? "seg-aktiv" : ""}`} onClick={() => setArt("schueler")}>
          Mitschüler
        </button>
      </div>
      <div className="mt-3 space-y-2">
        <input className="field" maxLength={60} placeholder={art === "lehrer" ? "Wer? z. B. Frau …" : "Wer? Vorname, Initial"} value={wer} onChange={(e) => setWer(e.target.value)} />
        <textarea className="field min-h-[96px] resize-y" maxLength={300} placeholder="Was wurde gesagt?" value={text} onChange={(e) => setText(e.target.value)} />
        <input className="field" maxLength={60} placeholder="Wann / wo (optional), z. B. Deutsch-LK" value={kontext} onChange={(e) => setKontext(e.target.value)} />
      </div>
      <button
        className="btn-primary mt-4 w-full disabled:opacity-40"
        disabled={!geht || busy}
        onClick={async () => {
          setBusy(true);
          const f = await wand.einreichen({ text, wer, art, kontext });
          setBusy(false);
          if (f) return meldeFehler("Ging nicht: " + f);
          setGesendet(true);
        }}
      >
        {busy ? "…" : "Einreichen"}
      </button>
      <p className="mt-2 text-center text-[12px] text-tinte-leise">Erscheint erst nach der Prüfung. Bitte nichts Verletzendes.</p>
    </div>
  );
}

/* ---------------------------------------------------------------- Prüfen */
function Pruefen({ wand }: { wand: Zitatwand }) {
  const offen = wand.zitate.filter((z) => z.status === "offen");
  if (!offen.length) return <p className="py-10 text-center text-[14px] text-tinte-leise">Alles geprüft.</p>;
  return (
    <div className="space-y-2.5">
      {offen.map((z) => (
        <div key={z.id} className="animate-aufsteigen rounded-2xl bg-[rgb(118_118_128/0.08)] p-4 dark:bg-[rgb(118_118_128/0.18)]">
          <div className="font-buch text-[16.5px] leading-snug">„{z.text}“</div>
          <div className="mt-2 flex items-center gap-2">
            <span className="min-w-0 flex-1 text-[12.5px] text-tinte-leise">
              — {z.wer}
              {z.kontext ? `, ${z.kontext}` : ""} · von {z.eingereicht_name || "?"}
            </span>
            <button
              aria-label="Ablehnen"
              onClick={async () => {
                const f = await wand.pruefen(z.id, "abgelehnt");
                if (f) meldeFehler(f);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFEDEC] text-[16px] font-bold text-[#D70015] transition active:scale-90 dark:bg-red-500/15"
            >
              ✕
            </button>
            <button
              aria-label="Freigeben"
              onClick={async () => {
                const f = await wand.pruefen(z.id, "frei");
                if (f) meldeFehler(f);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EAF6EC] text-[16px] font-bold text-[#248A3D] transition active:scale-90 dark:bg-green-500/15"
            >
              ✓
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
