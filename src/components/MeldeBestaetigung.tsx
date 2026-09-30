import { useEffect, useState } from "react";

/**
 * Bestätigung nach „eintragen“ bei einer Schicht – aufgebaut wie ein
 * Bezahl-Fenster (Apple Pay): erst ein drehender Ring, dann ein grüner Kreis
 * mit Haken. Darunter der wichtige Satz: Eintragen heißt nur „ich würde
 * mitmachen“ – die Schicht hat man erst, wenn das Stufenteam einen einteilt.
 */
export function MeldeBestaetigung({
  auftrag,
  titel,
  unter,
  onFertig,
}: {
  /** läuft gerade (Eintragen in der Datenbank); null = nichts anzeigen */
  auftrag: Promise<unknown> | null;
  titel: string;
  unter?: string;
  onFertig: () => void;
}) {
  const [fertig, setFertig] = useState(false);

  useEffect(() => {
    if (!auftrag) return;
    setFertig(false);
    let aktiv = true;
    // Mindestens kurz laden – sonst wirkt es wie ein Flackern
    void Promise.all([auftrag.catch(() => undefined), new Promise((r) => setTimeout(r, 900))]).then(() => {
      if (!aktiv) return;
      setFertig(true);
      try {
        navigator.vibrate?.(12);
      } catch {
        /* nicht überall erlaubt */
      }
    });
    return () => {
      aktiv = false;
    };
  }, [auftrag]);

  if (!auftrag) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-3 backdrop-blur-[2px] melde-hinein sm:items-center"
      onClick={() => fertig && onFertig()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-[1.75rem] bg-white px-6 pb-6 pt-8 text-center shadow-2xl melde-hoch dark:bg-slate-900"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto h-[76px] w-[76px]">
          <svg viewBox="0 0 76 76" className="h-full w-full" aria-hidden>
            {!fertig ? (
              <>
                <circle cx="38" cy="38" r="32" fill="none" strokeWidth="6" className="stroke-[rgb(118_118_128/0.18)]" />
                <circle
                  cx="38"
                  cy="38"
                  r="32"
                  fill="none"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray="60 201"
                  className="melde-dreh stroke-brand"
                />
              </>
            ) : (
              <>
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
              </>
            )}
          </svg>
        </div>

        <div className="mt-4 text-[1.3rem] font-bold tracking-[-0.02em]">
          {fertig ? "Du bist gemeldet" : "Wird gemeldet …"}
        </div>
        <div className="mt-0.5 text-[14px] text-tinte-matt dark:text-slate-400">
          {titel}
          {unter ? ` · ${unter}` : ""}
        </div>

        <div
          className={`mt-4 rounded-2xl bg-[rgb(118_118_128/0.1)] p-3.5 text-left text-[13.5px] leading-relaxed transition-opacity duration-300 ${
            fertig ? "opacity-100" : "opacity-0"
          }`}
        >
          <b>Noch keine feste Schicht.</b> Das Stufenteam teilt ein – wer bisher wenig Mithilfe hat, kommt
          zuerst dran. Bekommst du sie, wird sie grün mit Haken – oben unter „Deine Schichten“ und im Kalender.
        </div>

        <button
          disabled={!fertig}
          onClick={onFertig}
          className="btn-primary mt-4 disabled:opacity-40"
        >
          Verstanden
        </button>
      </div>
    </div>
  );
}
