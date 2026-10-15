import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { scrollSperren } from "../lib/scrollsperre";

/**
 * Escape schliesst immer nur das OBERSTE Fenster (Update 1.4, U3).
 *
 * Vorher hing jedes offene Blatt mit einem eigenen Tasten-Griff am Fenster –
 * bei Profil → Funktionen → Einstellungen schloss ein einziges Escape alle
 * drei auf einmal. Jetzt tragen sich alle Fenster (Blätter, Patch-Notes,
 * „Du bist gemeldet“ …) in einen gemeinsamen Stapel ein; reagieren darf nur
 * das zuletzt geöffnete. Die Rückfragen (Melder.tsx) und die Einführung
 * (Tour.tsx) greifen noch davor ab (capture) und sind damit ohnehin obenauf.
 */
const stapel: number[] = [];
let naechsteKennung = 1;

export function useEscapeSchliesst(aktiv: boolean, onClose: () => void) {
  // Immer die neueste Funktion aufrufen, ohne den Stapel-Platz zu verlieren
  const zu = useRef(onClose);
  zu.current = onClose;
  useEffect(() => {
    if (!aktiv) return;
    const id = naechsteKennung++;
    stapel.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (stapel[stapel.length - 1] !== id) return;
      zu.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const i = stapel.indexOf(id);
      if (i >= 0) stapel.splice(i, 1);
    };
  }, [aktiv]);
}

/**
 * Ein Blatt, das von unten hochfaehrt – wie auf dem iPhone.
 *
 * Auf dem Handy: Griff oben, nach unten wischen schliesst. Auf dem Rechner
 * steht es als Fenster in der Mitte. Escape (nur das oberste Blatt) und ein
 * Tipp daneben schliessen immer. Der Kopf (SheetKopf) bleibt beim Scrollen
 * oben stehen, damit das ✕ immer erreichbar ist.
 */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const [zug, setZug] = useState(0);
  const [ziehend, setZiehend] = useState(false);
  const start = useRef(0);

  useEscapeSchliesst(open, onClose);

  // Die Seite dahinter scrollt nicht mit.
  useEffect(() => {
    if (!open) return;
    return scrollSperren();
  }, [open]);

  useEffect(() => {
    if (open) setZug(0);
  }, [open]);

  if (!open) return null;

  const loslassen = () => {
    setZiehend(false);
    if (zug > 110) onClose();
    else setZug(0);
  };

  // Direkt an <body>: so liegt das Blatt immer ueber Kopf- und Tab-Leiste,
  // egal in welcher (animierten) Ebene es geoeffnet wurde.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Schließen"
        tabIndex={-1}
        className="absolute inset-0 animate-fadeIn cursor-default bg-black/40 dark:bg-black/60"
        style={{ opacity: 1 - Math.min(zug / 500, 0.6) }}
        onClick={onClose}
      />
      <div
        className="relative max-h-[92dvh] w-full max-w-2xl animate-sheetIn overflow-y-auto overscroll-contain blatt rounded-t-[1.75rem] bg-papier px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-1.5 shadow-2xl dark:bg-slate-900 sm:animate-popIn sm:rounded-[1.75rem] sm:pt-5"
        style={{
          transform: zug ? `translateY(${zug}px)` : undefined,
          transition: ziehend ? "none" : "transform .38s cubic-bezier(.32,.72,0,1)",
        }}
      >
        {/* Griff: nach unten ziehen schliesst */}
        <div
          className="-mx-5 -mt-1.5 flex h-6 cursor-grab touch-none items-center justify-center sm:hidden"
          onPointerDown={(e) => {
            start.current = e.clientY;
            setZiehend(true);
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => ziehend && setZug(Math.max(0, e.clientY - start.current))}
          onPointerUp={loslassen}
          onPointerCancel={loslassen}
        >
          <span className="h-[5px] w-9 rounded-full bg-slate-300 dark:bg-slate-600" />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Überschrift im Blatt – links der Titel, rechts ein runder Schließen-Knopf.
 *
 * Bleibt beim Scrollen oben stehen (sticky, leicht milchig): In langen Blättern
 * (Funktionen, Einstellungen, Rechte) war nach einem Bildschirm kein ✕ mehr zu
 * sehen. Wirkt, wenn der Kopf direkt im Blatt steht – Sheet scrollt als Ganzes.
 */
export function SheetKopf({
  titel,
  unter,
  onClose,
  extra,
  zurueck,
}: {
  titel: ReactNode;
  unter?: ReactNode;
  onClose: () => void;
  /** Weitere runde Knöpfe links neben dem Schließen (z. B. Einstellungen) */
  extra?: ReactNode;
  /**
   * Unterseite im selben Blatt (wie „‹ Einstellungen“ in iOS): blauer
   * Zurück-Knopf über dem Titel. `text` ist der Name der Seite davor.
   */
  zurueck?: { text: string; onClick: () => void };
}) {
  return (
    <div className="sticky top-0 z-10 -mx-5 mb-2 flex items-start gap-3 bg-papier px-5 pb-2 pt-2 shadow-[0_-24px_0_0_rgb(var(--papier))] dark:bg-slate-900 dark:shadow-[0_-24px_0_0_#1C1C1E]">
      <div className="min-w-0 flex-1">
        {zurueck && (
          <button
            type="button"
            onClick={zurueck.onClick}
            className="-ml-1.5 mb-1 flex min-h-[32px] items-center gap-0.5 rounded-full pr-2 text-[15px] font-medium text-brand-dark transition active:opacity-50 dark:text-brand"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m15 6-6 6 6 6" />
            </svg>
            {zurueck.text}
          </button>
        )}
        <h2 className="text-[1.375rem] font-bold leading-tight tracking-[-0.02em]">{titel}</h2>
        {unter && <p className="mt-0.5 text-[13px] text-tinte-leise">{unter}</p>}
      </div>
      {extra}
      <button
        type="button"
        onClick={onClose}
        aria-label="Schließen"
        className="-m-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90"
      >
        {/* Sichtbar 30 px, antippbar 44 px */}
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[rgb(118_118_128/0.12)] text-[13px] font-bold text-tinte-leise dark:bg-[rgb(118_118_128/0.24)]">
          ✕
        </span>
      </button>
    </div>
  );
}
