import type { Settings } from "../lib/types";

/**
 * Fortschritt der Beitragspunkte: "4 / 30 Beitragspunkte" mit Balken.
 * Wird in der eigenen Ansicht und in der Personenansicht des Teams benutzt.
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
  const ziel = Math.max(1, settings.ziel_punkte);
  const pct = Math.min(100, Math.round((punkte / ziel) * 100));
  const geschafft = punkte >= settings.ziel_punkte;
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      onClick={onClick}
      className={`w-full text-left ${onClick ? "transition active:scale-[.99]" : ""}`}
    >
      <div className="flex items-baseline gap-1.5">
        <span className={`font-extrabold ${compact ? "text-[15px]" : "text-lg"} ${geschafft ? "text-emerald-500" : "text-brand"}`}>
          {punkte}
        </span>
        <span className={`${compact ? "text-[13px]" : "text-sm"} text-slate-500 dark:text-slate-400`}>
          / {settings.ziel_punkte} Beitragspunkte
        </span>
        {onClick && <span className="ml-auto text-sm text-slate-400">ansehen ›</span>}
      </div>
      <div className={`mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700`}>
        <div
          className={`h-full rounded-full transition-all ${geschafft ? "bg-emerald-500" : "bg-brand"}`}
          style={{ width: `${Math.max(pct, punkte > 0 ? 6 : 0)}%` }}
        />
      </div>
    </Tag>
  );
}
