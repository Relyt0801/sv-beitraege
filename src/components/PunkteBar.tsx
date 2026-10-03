import type { Settings } from "../lib/types";
import { abiballVon, bonusAnteil, naechsteStufe, prozentVon, staffelVon, ticketPreise } from "../lib/logic";

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
  // Preis des ERSTEN Tickets: Grundpreis + Zuschlag der Stufe − Bonus
  const preise = ticketPreise(pct, settings);
  const voll = pct >= 100;
  const bonus = bonusAnteil(pct, settings);
  const gold = bonus > 0;
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
            gold ? "text-[#9A7410] dark:text-[#E9C460]" : voll ? "text-emerald-600 dark:text-emerald-400" : "text-brand"
          }`}
        >
          {gold ? "✦ " : ""}{pct} %
        </span>
        <span className={`${compact ? "text-[13px]" : "text-sm"} text-tinte-matt dark:text-slate-400`}>
          {preise.preisSteht ? `1. Ticket ${preise.erstes} €` : `Zuschlag ${preise.aufschlag} €`}
          {preise.rabatt > 0 ? ` (−${preise.rabatt} € Bonus)` : ""}
        </span>
        {onClick && <span className="ml-auto text-sm text-tinte-leise">ansehen ›</span>}
      </div>

      <div className="relative mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-full rounded-full transition-all ${voll ? "bg-emerald-500" : "bg-brand"}`}
          style={{ width: `${Math.min(100, Math.max(pct, punkte > 0 ? 4 : 0))}%` }}
        />
        {/* Bonus über 100 %: goldener Balken über dem vollen grünen */}
        {gold && (
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#F6DD8B] via-[#D9A92B] to-[#A87A0C] transition-all"
            style={{ width: `${Math.max(4, bonus * 100)}%` }}
          />
        )}
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
  const a = abiballVon(settings);
  if (!next && a.ueber100 && pct < a.bonusBis)
    return (
      <div className="mt-1.5 text-[12px] font-semibold text-[#8A650A] dark:text-[#E9C460]">
        Kein Zuschlag mehr. Bis {a.bonusBis} % wird das erste Ticket noch bis zu {a.bonusRabatt} € günstiger.
      </div>
    );
  if (!next)
    return (
      <div className="mt-1.5 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
        Volle 100 %. Auf dein erstes Abiball-Ticket kommt kein Aufschlag mehr.
      </div>
    );
  return (
    <div className="mt-1.5 text-[12px] text-tinte-matt dark:text-slate-400">
      Noch <b className="text-tinte dark:text-slate-200">{next.fehlt} %</b> bis {next.ab} %. Dann
      kostet das erste Ticket nur noch {grund + next.betrag} €, also {next.spart} € weniger.
    </div>
  );
}

/** Die ganze Staffel als kleine Tabelle: 0 % → 50 €, 25 % → 40 € … */
export function StaffelTabelle({ settings, pct }: { settings: Settings; pct?: number }) {
  const staffel = staffelVon(settings);
  const aktiv = pct == null ? null : staffel.filter((x) => Math.min(pct, 100) >= x.ab).pop();
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
                : "bg-slate-200 text-tinte-matt dark:bg-slate-700 dark:text-slate-300"
            }`}
          >
            {x.ab} % → {(settings.ticket_preis || 0) + x.betrag} €
          </span>
        );
      })}
    </div>
  );
}
