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
    <section className={`card flex flex-1 flex-col p-4 ${className}`}>
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

/**
 * Bunte Karte für die Abizeitung & Co. auf der Startseite (wie bis 1.2):
 * EINE kräftige Farbe je Bereich, höchstens ein Verlauf innerhalb dieser
 * Farbe – keine bunten Mehrfarb-Verläufe. Weißer Text, oben eine kleine
 * Überschrift, rechts oben eine Deko, unten die Knöpfe (KnopfHell/KnopfGlas).
 */
export function FarbKarte({
  verlauf,
  schatten,
  oben,
  titel,
  unter,
  deko,
  marke,
  children,
  knoepfe,
  className = "",
}: {
  /** z. B. "from-[#FF375F] to-[#E0164A]" – beide Töne derselben Farbe */
  verlauf: string;
  /** farbiger Schatten, z. B. "shadow-[0_12px_28px_-14px_rgba(255,55,95,.75)]" */
  schatten: string;
  oben: ReactNode;
  titel: ReactNode;
  unter?: ReactNode;
  deko?: ReactNode;
  marke?: ReactNode;
  children?: ReactNode;
  knoepfe?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`relative flex flex-1 flex-col overflow-hidden rounded-[1.4rem] bg-gradient-to-br p-4 text-white sm:p-5 ${verlauf} ${schatten} ${className}`}>
      {deko && (
        <div aria-hidden className="pointer-events-none absolute right-0 top-0">
          {deko}
        </div>
      )}
      <div className="relative pr-16">
        {marke && <div className="mb-1.5">{marke}</div>}
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/80">{oben}</div>
        <div className="mt-1 text-[1.3rem] font-bold leading-tight tracking-[-0.01em]">{titel}</div>
        {unter && <div className="mt-1 text-[13px] leading-snug text-white/85">{unter}</div>}
      </div>
      {children && <div className="relative">{children}</div>}
      {knoepfe && <div className="relative mt-auto flex flex-wrap items-center gap-2 pt-4">{knoepfe}</div>}
    </section>
  );
}

/** Weißer Hauptknopf auf einer FarbKarte; text = Farbe der Schrift */
export function KnopfHell({ onClick, text, children }: { onClick: () => void; text: string; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-full bg-white px-4 py-2 text-[14px] font-semibold shadow-sm transition active:scale-95 ${text}`}>
      {children}
    </button>
  );
}

/** Durchscheinender Nebenknopf auf einer FarbKarte */
export function KnopfGlas({ onClick, children, dunkel = false }: { onClick: () => void; children: ReactNode; dunkel?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-[14px] font-semibold text-white transition active:scale-95 ${dunkel ? "bg-black/25" : "bg-white/20"}`}
    >
      {children}
    </button>
  );
}
