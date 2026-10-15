import { useEffect, useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { Gruppe } from "./Liste";
import { Icon } from "./Icon";
import { FussLeiste } from "./Kachel";
import { melde } from "../lib/melder";
import type { Gewinner, GewinnerArt } from "../lib/teile";

/**
 * Gekürte Gewinner schön zeigen – und küren.
 *
 *   GewinnerBuehne   die Karte(n) oben im Bereich: Gewinner in Gold mit
 *                    Krone, „Gewinner der Herzen“ in Rosé mit Herz.
 *   KuerenBlatt      Auswahl aus den Kandidaten (mit Stimmen), je ein
 *                    Gewinner und optional ein Gewinner der Herzen.
 */
export interface Kandidat {
  id: string;
  label: string;
  unter?: string;
  stimmen?: number | null;
}

function Krone({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 8.2l4.6 3.6L12 4.5l4.4 7.3L21 8.2l-1.9 10.3H4.9L3 8.2z" />
      <rect x="4.9" y="19.6" width="14.2" height="2" rx="1" />
    </svg>
  );
}
function Herz({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.7 4.5c2.1 0 3.5 1.2 4.3 2.4.8-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.7 4.3 7.2C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

export function GewinnerBuehne({
  gewinner,
  herzen,
  titel,
  klein,
}: {
  gewinner: Gewinner | null;
  herzen: Gewinner | null;
  /** z. B. Name der Ranking-Kategorie */
  titel?: string;
  klein?: boolean;
}) {
  if (!gewinner && !herzen) return null;
  return (
    <div className={`grid gap-2 ${gewinner && herzen && !klein ? "sm:grid-cols-[1.4fr_1fr]" : ""}`}>
      {gewinner && (
        <div className="relative overflow-hidden rounded-[1.25rem] bg-gradient-to-br from-[#FFD66B] via-[#F5B53F] to-[#E08A1E] p-4 text-[#3D2600] shadow-[0_14px_30px_-16px_rgba(224,138,30,.9)]">
          <div aria-hidden className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full bg-white/30 blur-2xl" />
          <div className="relative flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em]">
            <Krone size={16} /> Gewinner{titel ? ` · ${titel}` : ""}
          </div>
          <div className={`relative mt-1 font-extrabold leading-tight tracking-[-0.02em] [overflow-wrap:anywhere] ${klein ? "text-[17px]" : "text-[22px]"}`}>
            {gewinner.label}
          </div>
          {(gewinner.unter || gewinner.stimmen != null) && (
            <div className="relative mt-1 text-[13px] font-medium opacity-80">
              {[gewinner.unter, gewinner.stimmen != null ? `${gewinner.stimmen} ${gewinner.stimmen === 1 ? "Stimme" : "Stimmen"}` : ""].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      )}
      {herzen && (
        <div className="relative overflow-hidden rounded-[1.25rem] bg-gradient-to-br from-[#FF8FB1] to-[#FF4F7B] p-4 text-white shadow-[0_14px_30px_-16px_rgba(255,79,123,.9)]">
          <div className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em]">
            <Herz size={15} /> Gewinner der Herzen
          </div>
          <div className={`mt-1 font-extrabold leading-tight tracking-[-0.02em] [overflow-wrap:anywhere] ${klein ? "text-[16px]" : "text-[19px]"}`}>
            {herzen.label}
          </div>
          {(herzen.unter || herzen.stimmen != null) && (
            <div className="mt-1 text-[13px] font-medium opacity-90">
              {[herzen.unter, herzen.stimmen != null ? `${herzen.stimmen} ♥` : ""].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Kleine Marke an einem Eintrag, der gewonnen hat */
export function GewinnerMarke({ art }: { art: GewinnerArt }) {
  return art === "gewinner" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#F5B53F]/20 px-2 py-0.5 text-[11.5px] font-bold text-[#9A5B00] dark:text-[#FFD66B]">
      <Krone size={12} /> Gewinner
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#FF4F7B]/15 px-2 py-0.5 text-[11.5px] font-bold text-[#C2185B] dark:text-[#FF8FB1]">
      <Herz size={11} /> Herzen
    </span>
  );
}

/**
 * Blatt zum Küren. kandidaten nach Stimmen sortiert übergeben; der erste ist
 * vorausgewählt. Speichern ruft onKueren je Art auf (nur was sich geändert hat).
 */
export function KuerenBlatt({
  open,
  onClose,
  titel,
  kandidaten,
  gewinner,
  herzen,
  onKueren,
  onZuruecknehmen,
  hinweis,
  onFertig,
}: {
  open: boolean;
  onClose: () => void;
  titel: string;
  kandidaten: Kandidat[];
  gewinner: Gewinner | null;
  herzen: Gewinner | null;
  /** leise = true: keine eigene Meldung zeigen – das Blatt meldet am Ende EINMAL für alles */
  onKueren: (art: GewinnerArt, k: Kandidat, leise: boolean) => Promise<boolean>;
  onZuruecknehmen: (art: GewinnerArt) => Promise<void>;
  /** z. B. „Das Motto wird danach allen gezeigt – auch Eltern.“ */
  hinweis?: string;
  /**
   * Nach einem erfolgreichen Küren (Blatt ist dann schon zu): Hier schließt der
   * Aufrufer das Einstellungsblatt dahinter und zeigt die Gewinner-Bühne.
   */
  onFertig?: () => void;
}) {
  const [g, setG] = useState<string | null>(null);
  const [h, setH] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setG(gewinner?.ziel_id ?? kandidaten[0]?.id ?? null);
    setH(herzen?.ziel_id ?? null);
  }, [open, gewinner, herzen, kandidaten]);

  async function speichern() {
    setBusy(true);
    const kg = kandidaten.find((k) => k.id === g);
    const kh = kandidaten.find((k) => k.id === h);
    let neuG = false;
    let neuH = false;
    let geaendert = false;
    if (kg && kg.id !== gewinner?.ziel_id) {
      neuG = await onKueren("gewinner", kg, true);
      // Schlägt etwas fehl, zeigt der Aufrufer den Fehler – das Blatt bleibt offen
      if (!neuG) return setBusy(false);
    }
    if (!kg && gewinner) {
      await onZuruecknehmen("gewinner");
      geaendert = true;
    }
    if (kh && kh.id !== herzen?.ziel_id) {
      neuH = await onKueren("herzen", kh, true);
      if (!neuH) return setBusy(false);
    }
    if (!kh && herzen) {
      await onZuruecknehmen("herzen");
      geaendert = true;
    }
    setBusy(false);
    // Eine einzige Meldung (vorher kamen zwei übereinander)
    if (neuG || neuH) melde(neuG && neuH ? "Gewinner und Gewinner der Herzen gekürt" : neuH ? "Gewinner der Herzen gekürt" : "Gewinner gekürt", "erfolg");
    onClose();
    if (neuG || neuH || geaendert) onFertig?.();
  }

  const zeile = (k: Kandidat, wahl: string | null, setWahl: (id: string | null) => void, farbe: string, platz: number) => {
    const an = wahl === k.id;
    return (
      <button
        key={k.id}
        type="button"
        onClick={() => setWahl(an ? null : k.id)}
        className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
        aria-pressed={an}
      >
        <span className="zahl w-5 shrink-0 text-center text-[13px] font-semibold text-tinte-leise">{platz}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{k.label}</span>
          {k.unter && <span className="block text-[12.5px] text-tinte-leise">{k.unter}</span>}
        </span>
        {k.stimmen != null && <span className="zahl shrink-0 text-[13px] text-tinte-leise">{k.stimmen}</span>}
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white transition ${
            an ? farbe : "border-[1.5px] border-black/20 dark:border-white/25"
          }`}
        >
          {an && <Icon name="haken" size={14} strich={3} />}
        </span>
      </button>
    );
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel={titel} unter="Danach steht der Gewinner groß oben – für alle sichtbar." onClose={onClose} />
      {kandidaten.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-tinte-leise">Noch nichts zum Küren – erst abstimmen lassen.</p>
      ) : (
        <>
          <Gruppe titel="Gewinner" className="">
            {kandidaten.map((k, i) => zeile(k, g, setG, "bg-[#E08A1E]", i + 1))}
          </Gruppe>
          <Gruppe titel="Gewinner der Herzen (optional)" fuss="Zum Beispiel der Liebling vieler, der knapp nicht gewonnen hat.">
            {kandidaten.filter((k) => k.id !== g).map((k, i) => zeile(k, h, setH, "bg-[#FF4F7B]", i + 1))}
          </Gruppe>
          {hinweis && <p className="mt-4 px-1 text-[13px] leading-snug text-tinte-leise">{hinweis}</p>}
          {/* Fußknopf immer sichtbar – vorher musste man bis ans Ende der Liste scrollen */}
          <FussLeiste>
            <button className="btn-primary" disabled={busy} onClick={() => void speichern()}>
              {busy ? "Wird gekürt …" : gewinner || herzen ? "Änderung speichern" : "Küren"}
            </button>
          </FussLeiste>
        </>
      )}
    </Sheet>
  );
}
