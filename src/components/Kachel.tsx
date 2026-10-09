import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/**
 * Karte für einen Bereich auf der Startseite (Abi-Album, Motto, Zitate,
 * Rankings) – im Stil der iOS-Widgets: weiße Fläche, ein farbiges Symbol,
 * Titel, eine Zeile Stand, darunter höchstens zwei Knöpfe. Keine Verläufe,
 * damit die Startseite auf dem Handy ruhig bleibt.
 */
export function Kachel({
  icon,
  farbe,
  titel,
  unter,
  rechts,
  children,
  knoepfe,
  marke,
  className = "",
}: {
  icon: IconName;
  /** Tailwind-Hintergrund des Symbols, z. B. bg-[#FF9500] */
  farbe: string;
  titel: ReactNode;
  unter?: ReactNode;
  rechts?: ReactNode;
  children?: ReactNode;
  knoepfe?: ReactNode;
  /** kleine Zeile über dem Titel (z. B. „Runde 2 läuft“) */
  marke?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card flex h-full flex-col p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden className={`symbol ${farbe}`}>
          <Icon name={icon} size={17} strich={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          {marke && <div className="mb-0.5">{marke}</div>}
          <h2 className="text-[17px] font-semibold leading-snug tracking-[-0.01em]">{titel}</h2>
          {unter && <div className="mt-0.5 text-[13px] leading-snug text-tinte-leise">{unter}</div>}
        </div>
        {rechts}
      </div>
      {children}
      {knoepfe && <div className="mt-auto flex flex-wrap gap-2 pt-3">{knoepfe}</div>}
    </section>
  );
}

/** Fortschrittsring (z. B. Steckbrief zu 40 % ausgefüllt) */
export function KleinerRing({ prozent, groesse = 40 }: { prozent: number; groesse?: number }) {
  const r = (groesse - 5) / 2;
  const u = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: groesse, height: groesse }} aria-label={`${prozent} %`}>
      <svg width={groesse} height={groesse} className="-rotate-90">
        <circle cx={groesse / 2} cy={groesse / 2} r={r} fill="none" strokeWidth={4} className="stroke-black/[0.08] dark:stroke-white/[0.12]" />
        <circle
          cx={groesse / 2}
          cy={groesse / 2}
          r={r}
          fill="none"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={u}
          strokeDashoffset={u * (1 - Math.min(100, Math.max(0, prozent)) / 100)}
          className="stroke-brand transition-[stroke-dashoffset] duration-700 ease-ios"
        />
      </svg>
      <span className="zahl absolute text-[11px] font-semibold">{prozent}</span>
    </span>
  );
}
