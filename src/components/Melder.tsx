import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { melderEinhaengen, type MeldeArt } from "../lib/melder";

/**
 * Zeichnet Meldungen und Rückfragen selbst, statt die Fenster des Browsers zu
 * benutzen. Warum das nötig war, steht in src/lib/melder.ts.
 *
 * Gehört ganz nach außen (src/main.tsx), damit auch die Datenspeicher darauf
 * zugreifen können.
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
  antworte: (ok: boolean) => void;
}

const FARBE: Record<MeldeArt, string> = {
  info: "bg-tinte text-white dark:bg-slate-800",
  erfolg: "bg-bezahlt text-white",
  fehler: "bg-red-600 text-white",
};

export function MelderProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [rueckfrage, setRueckfrage] = useState<Rueckfrage | null>(null);
  const naechsteId = useRef(1);

  const zeigeToast = useCallback((text: string, art: MeldeArt) => {
    const id = naechsteId.current++;
    setToasts((v) => [...v.slice(-2), { id, text, art }]);
    // Fehler bleiben länger stehen – die will man wirklich lesen.
    const dauer = art === "fehler" ? 7000 : 3500;
    setTimeout(() => setToasts((v) => v.filter((t) => t.id !== id)), dauer);
  }, []);

  const zeigeFrage = useCallback(
    (text: string, jaText: string, gefaehrlich: boolean) =>
      new Promise<boolean>((antworte) => {
        setRueckfrage({ text, jaText, gefaehrlich, antworte });
      }),
    [],
  );

  useEffect(() => melderEinhaengen(zeigeToast, zeigeFrage), [zeigeToast, zeigeFrage]);

  const schliessen = useCallback(
    (ok: boolean) => {
      setRueckfrage((r) => {
        r?.antworte(ok);
        return null;
      });
    },
    [],
  );

  // Escape bricht ab, Enter bestätigt – wie im Browserfenster auch.
  useEffect(() => {
    if (!rueckfrage) return;
    const aufTaste = (e: KeyboardEvent) => {
      if (e.key === "Escape") schliessen(false);
      if (e.key === "Enter") schliessen(true);
    };
    window.addEventListener("keydown", aufTaste);
    return () => window.removeEventListener("keydown", aufTaste);
  }, [rueckfrage, schliessen]);

  return (
    <>
      {children}

      {/* Meldungen: oben, unter dem Kopf, damit sie nicht mit der
          Chat-Eingabezeile unten kollidieren. */}
      {toasts.length > 0 && (
        <div
          className="pointer-events-none fixed inset-x-0 top-[calc(var(--kopf)+0.5rem)] z-[60] flex flex-col items-center gap-2 px-3"
          role="status"
          aria-live="polite"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto max-w-md animate-fadeIn rounded-xl px-4 py-3 text-sm font-semibold shadow-2xl ${FARBE[t.art]}`}
            >
              {t.text}
            </div>
          ))}
        </div>
      )}

      {rueckfrage && (
        <div
          className="fixed inset-0 z-[70] flex animate-fadeIn items-center justify-center bg-slate-950/55 p-5 backdrop-blur-sm"
          onClick={() => schliessen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm animate-sheetIn rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="whitespace-pre-line text-[15px] leading-snug">{rueckfrage.text}</p>
            <div className="mt-5 flex gap-2">
              <button
                className="flex-1 rounded-xl border border-papier-linie py-3 text-center text-[15px] font-semibold transition active:scale-[.98] dark:border-slate-700"
                onClick={() => schliessen(false)}
              >
                Abbrechen
              </button>
              <button
                autoFocus
                className={`flex-1 rounded-xl py-3 text-center text-[15px] font-semibold text-white transition active:scale-[.98] ${
                  rueckfrage.gefaehrlich ? "bg-red-600 hover:bg-red-700" : "bg-brand hover:bg-brand-dark"
                }`}
                onClick={() => schliessen(true)}
              >
                {rueckfrage.jaText}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
