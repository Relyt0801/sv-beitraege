import type { Settings } from "../lib/types";
import { naechsteStufe, prozentVon, staffelVon, ticketBetrag } from "../lib/logic";

/**
 * Fortschritt in Prozent: "45 %" mit Balken und Markierungen bei jeder Stufe
 * der Abiball-Staffel. Wird in der eigenen Ansicht und beim Team benutzt.
 */
export function PunkteBar({
  punkte,
  settings,
  onClick,
  compact,
}: {
  punkte: number;
  settings: Settings;
  onClick?: () => void;
  compact?: boolean;
}) {
  const pct = prozentVon(punkte, settings);
  // Preis des ERSTEN Tickets: Grundpreis + Zusatzbeitrag der Stufe
  const betrag = (settings.ticket_preis || 0) + ticketBetrag(pct, settings);
  const voll = pct >= 100;
  const Tag = onClick ? "button" : "div";

  // Markierungen bei 25/50/75 – die Ränder brauchen keinen Strich
  const marken = staffelVon(settings).filter((x) => x.ab > 0 && x.ab < 100);

  return (
    <Tag
      onClick={onClick}
      className={`w-full text-left ${onClick ? "transition active:scale-[.99]" : ""}`}
    >
      <div className="flex items-baseline gap-1.5">
        <span
          className={`font-extrabold ${compact ? "text-[15px]" : "text-lg"} ${
            voll ? "text-emerald-500" : "text-brand"
          }`}
        >
          {pct} %
        </span>
        <span className={`${compact ? "text-[13px]" : "text-sm"} text-slate-500 dark:text-slate-400`}>
          · 1. Ticket {betrag} €
        </span>
        {onClick && <span className="ml-auto text-sm text-slate-400">ansehen ›</span>}
      </div>

      <div className="relative mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-full rounded-full transition-all ${voll ? "bg-emerald-500" : "bg-brand"}`}
          style={{ width: `${Math.max(pct, punkte > 0 ? 4 : 0)}%` }}
        />
        {marken.map((m) => (
          <span
            key={m.ab}
            style={{ left: `${m.ab}%` }}
            className="absolute top-0 h-full w-px bg-white/70 dark:bg-slate-900/70"
          />
        ))}
      </div>

      {!compact && (
        <StufenHinweis pct={pct} settings={settings} />
      )}
    </Tag>
  );
}

/** Eine Zeile: was die nächste Stufe bringt – oder dass es nichts mehr zu holen gibt. */
export function StufenHinweis({ pct, settings }: { pct: number; settings: Settings }) {
  const next = naechsteStufe(pct, settings);
  const grund = settings.ticket_preis || 0;
  if (!next)
    return (
      <div className="mt-1.5 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
        100 % erreicht – aufs erste Abiballticket kommt nichts drauf. 🎉
      </div>
    );
  return (
    <div className="mt-1.5 text-[12px] text-slate-500 dark:text-slate-400">
      Noch <b className="text-slate-700 dark:text-slate-200">{next.fehlt} %</b> bis {next.ab} % – dann
      kostet das erste Ticket nur noch {grund + next.betrag} € ({next.spart} € weniger).
    </div>
  );
}

/** Die ganze Staffel als kleine Tabelle: 0 % → 50 €, 25 % → 40 € … */
export function StaffelTabelle({ settings, pct }: { settings: Settings; pct?: number }) {
  const staffel = staffelVon(settings);
  const aktiv = pct == null ? null : staffel.filter((x) => pct >= x.ab).pop();
  return (
    <div className="flex flex-wrap gap-1.5">
      {staffel.map((x) => {
        const ist = aktiv?.ab === x.ab;
        return (
          <span
            key={x.ab}
            className={`rounded-lg px-2 py-1 text-[12px] font-semibold ${
              ist
                ? "bg-brand text-white"
                : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
            }`}
          >
            {x.ab} % → {(settings.ticket_preis || 0) + x.betrag} €
          </span>
        );
      })}
    </div>
  );
}
