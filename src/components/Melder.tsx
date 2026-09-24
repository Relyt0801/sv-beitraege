import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { melderEinhaengen, type MeldeArt } from "../lib/melder";

/**
 * Zeichnet Meldungen und Rückfragen selbst, statt die Fenster des Browsers zu
 * benutzen. Warum das nötig war, steht in src/lib/melder.ts.
 *
 * Gehört ganz nach außen (src/main.tsx), damit auch die Datenspeicher darauf
 * zugreifen können. Liegt per Portal direkt an <body> und über allen Blättern.
 */

interface Toast {
  id: number;
  text: string;
  art: MeldeArt;
}

interface Rueckfrage {
  text: string;
  jaText: string;
  gefaehrlich: boolean;
  nurOk: boolean;
  antworte: (ok: boolean) => void;
}

const PUNKT: Record<MeldeArt, string> = {
  info: "bg-white/70",
  erfolg: "bg-[#30D158]",
  fehler: "bg-[#FF453A]",
};

export function MelderProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [warteschlange, setWarteschlange] = useState<Rueckfrage[]>([]);
  const naechsteId = useRef(1);
  const rueckfrage = warteschlange[0] ?? null;

  const zeigeToast = useCallback((text: string, art: MeldeArt) => {
    const id = naechsteId.current++;
    setToasts((v) => [...v.filter((t) => t.text !== text).slice(-2), { id, text, art }]);
    // Fehler bleiben länger stehen – die will man wirklich lesen.
    const dauer = art === "fehler" ? 7000 : 3500;
    setTimeout(() => setToasts((v) => v.filter((t) => t.id !== id)), dauer);
  }, []);

  // Mehrere Rückfragen kurz hintereinander: nacheinander zeigen, keine geht verloren.
  const zeigeFrage = useCallback(
    (text: string, jaText: string, gefaehrlich: boolean, nurOk: boolean) =>
      new Promise<boolean>((antworte) => {
        setWarteschlange((w) => [...w, { text, jaText, gefaehrlich, nurOk, antworte }]);
      }),
    [],
  );

  useEffect(() => melderEinhaengen(zeigeToast, zeigeFrage), [zeigeToast, zeigeFrage]);

  const schliessen = useCallback((ok: boolean) => {
    setWarteschlange((w) => {
      w[0]?.antworte(ok);
      return w.slice(1);
    });
  }, []);

  // Escape bricht ab, Enter bestätigt – wie im Browserfenster auch.
  useEffect(() => {
    if (!rueckfrage) return;
    const aufTaste = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        schliessen(false);
      }
      if (e.key === "Enter") {
        e.preventDefault();
        schliessen(true);
      }
    };
    // capture: vor dem Escape-Griff offener Blätter, sonst schliesst beides
    window.addEventListener("keydown", aufTaste, true);
    return () => window.removeEventListener("keydown", aufTaste, true);
  }, [rueckfrage, schliessen]);

  return (
    <>
      {children}
      {createPortal(
        <>
          {toasts.length > 0 && (
            <div
              className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[85] flex flex-col items-center gap-2 px-4"
              role="status"
              aria-live="polite"
            >
              {toasts.map((t) => (
                <div
                  key={t.id}
                  className="pointer-events-auto flex max-w-md animate-aufsteigen items-start gap-2.5 rounded-[1.25rem] bg-[#1c1c1e]/90 px-4 py-3 text-[14px] font-semibold leading-snug text-white shadow-2xl backdrop-blur-xl"
                >
                  <span className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${PUNKT[t.art]}`} />
                  <span className="min-w-0 whitespace-pre-line break-words">{t.text}</span>
                </div>
              ))}
            </div>
          )}

          {rueckfrage && (
            <div
              className="fixed inset-0 z-[90] flex animate-fadeIn items-center justify-center bg-black/40 p-6 dark:bg-black/60"
              onClick={() => schliessen(false)}
              role="alertdialog"
              aria-modal="true"
            >
              <div
                className="w-full max-w-[20rem] animate-popIn rounded-[1.5rem] bg-white p-5 text-center shadow-2xl dark:bg-slate-900"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="whitespace-pre-line break-words text-[15px] leading-snug">{rueckfrage.text}</p>
                <div className={`mt-5 grid gap-2 ${rueckfrage.nurOk ? "" : "grid-cols-2"}`}>
                  {!rueckfrage.nurOk && (
                    <button className="btn-grau !min-h-[2.75rem] !text-[16px]" onClick={() => schliessen(false)}>
                      Abbrechen
                    </button>
                  )}
                  <button
                    autoFocus
                    className={`btn-primary !min-h-[2.75rem] !text-[16px] ${
                      rueckfrage.gefaehrlich ? "!bg-[#D70015] hover:!bg-[#B00012] dark:!bg-[#FF453A]" : ""
                    }`}
                    onClick={() => schliessen(true)}
                  >
                    {rueckfrage.jaText}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>,
        document.body,
      )}
    </>
  );
}
