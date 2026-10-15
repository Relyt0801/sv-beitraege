import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { useRole } from "../auth/RoleProvider";

/**
 * Macht eine ganze Karte antippbar (Startseite: Motto, Zitate, Rankings, Album).
 * Gibt die Eigenschaften zurück, die auf das Karten-Element gehören:
 * role=button, Tastatur (Enter/Leertaste) und der Klick. Knöpfe, Links und
 * Eingaben IN der Karte behalten ihre eigene Wirkung – ein Tipp darauf löst
 * nicht zusätzlich die Karte aus.
 */
export function karteKlick(onClick?: () => void, label?: string) {
  if (!onClick) return {};
  return {
    role: "button" as const,
    tabIndex: 0,
    "aria-label": label,
    onClick: (e: MouseEvent<HTMLElement>) => {
      const ziel = (e.target as HTMLElement).closest("button, a, input, select, textarea");
      if (ziel && ziel !== e.currentTarget) return;
      onClick();
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    },
  };
}

/** Rückmeldung für antippbare Karten: leicht einsinken, Fokusring für die Tastatur */
export const KARTE_KLICK_KLASSE =
  "cursor-pointer transition duration-200 ease-ios active:scale-[.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-papier";

/**
 * Feste Fußleiste am Ende eines Blatts („Runde starten“, „Küren“, „Anlegen“):
 * bleibt am unteren Rand sichtbar, auch wenn die Liste darüber lang ist, und
 * reicht bis an den Rand des Blatts (das Blatt hat unten 1,5 rem Polster plus
 * Home-Indikator – die Leiste zieht sich darüber, damit nichts durchscheint).
 */
export function FussLeiste({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`sticky bottom-0 z-10 -mx-5 -mb-[calc(env(safe-area-inset-bottom)+1.5rem)] mt-4 bg-papier/95 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 shadow-[0_-10px_14px_-12px_rgba(0,0,0,.18)] backdrop-blur dark:bg-slate-900/95 ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Hinweis für das Stufenteam, wenn es in diesem Bereich nichts einstellen darf:
 * statt einfach kein Zahnrad zu sehen, steht da, wer es verwaltet. Die Angabe
 * gilt für die Startwerte (Rechte → Komitee-Rechte) und ist darum vorsichtig
 * formuliert. Alle anderen Rollen sehen nichts.
 */
export function VerwaltetVon({ bereich, komitee, darf, className = "" }: { bereich: string; komitee: string; darf: boolean; className?: string }) {
  const { role } = useRole();
  const team = role === "stufenteam" || role === "sprecher" || role === "stv_sprecher" || role === "kassenwart";
  if (darf || !team) return null;
  return (
    <p className={`mt-5 px-4 text-center text-[12.5px] leading-snug text-tinte-leise ${className}`}>
      {bereich} verwaltet in der Regel das Komitee „{komitee}“. Fragen dazu am besten dort stellen.
    </p>
  );
}

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
      {/* 12 px = Mindestschrift (Design-Regeln 5); „100“ passt auch in den 40-px-Ring */}
      <span className="zahl absolute text-[12px] font-semibold">{prozent}</span>
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
  onClick,
  label,
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
  /** Ganze Karte antippbar (öffnet das Blatt); Knöpfe darin behalten ihre eigene Wirkung */
  onClick?: () => void;
  /** Vorlesetext für die ganze Karte, z. B. „Abimotto öffnen“ */
  label?: string;
}) {
  return (
    <section
      {...karteKlick(onClick, label)}
      className={`relative flex flex-1 flex-col overflow-hidden rounded-[1.4rem] bg-gradient-to-br p-4 text-white sm:p-5 ${verlauf} ${schatten} ${onClick ? KARTE_KLICK_KLASSE : ""} ${className}`}
    >
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

/**
 * Kleine bunte Kachel zum Antippen – wie in der Kurzbefehle-App von iOS.
 *
 * Gedacht für Raster mit zwei Spalten am Handy (Chats-Reiter: „Frag das
 * Stufenteam“, „Anfragen“, „Eltern“ …). Die ganze Kachel ist EIN Knopf:
 * oben links das Symbol in einem hellen Kreis, oben rechts optional eine
 * Zahl (rot = Neues, das auf einen wartet; weiß = einfach eine Anzahl),
 * unten Titel und eine Zeile Stand. Eine große, blasse Deko in der Ecke macht
 * sie lebendig, ohne zu stören. Gleiche Farblogik wie FarbKarte: EINE Farbe
 * je Kachel, der Verlauf bleibt innerhalb dieser Farbe.
 */
export function FarbKachel({
  verlauf,
  schatten = "",
  symbol,
  titel,
  unter,
  zahl,
  zahlRot = false,
  breit = false,
  gedaempft = false,
  onClick,
  label,
  tour,
}: {
  /** z. B. "from-[#0A84FF] to-[#0066CC]" – beide Töne derselben Farbe */
  verlauf: string;
  /** farbiger Schatten, z. B. "shadow-[0_10px_24px_-14px_rgba(0,102,204,.9)]" */
  schatten?: string;
  /** <Icon …/> (Design-Regeln 5) – Komitee-Emojis aus lib/committees sind Daten und bleiben erlaubt */
  symbol: ReactNode;
  titel: ReactNode;
  /** eine (höchstens zwei) Zeilen Stand, z. B. „2 offen“ oder die letzte Nachricht */
  unter?: ReactNode;
  /** Zahl oben rechts; 0/undefined = keine */
  zahl?: number;
  /** true = rote Zahl (Ungelesenes/Offenes), sonst weiße Kapsel */
  zahlRot?: boolean;
  /** über beide Spalten */
  breit?: boolean;
  /** ruhiger (z. B. „nichts offen“): etwas blasser */
  gedaempft?: boolean;
  onClick: () => void;
  /** Vorlesetext, falls der Titel allein nicht reicht */
  label?: string;
  /** data-tour-Kennung für die Einführung */
  tour?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-tour={tour}
      className={`relative flex min-h-[7.25rem] flex-col overflow-hidden rounded-[1.4rem] bg-gradient-to-br p-3.5 text-left text-white transition duration-200 ease-ios active:scale-[.97] ${verlauf} ${schatten} ${
        breit ? "col-span-2" : ""
      } ${gedaempft ? "opacity-80 saturate-[.85]" : ""}`}
    >
      {/* Deko: das Symbol noch einmal groß und blass in der Ecke. Ein <Icon> hat eine
          feste Pixelgröße – hier wird es auf Deko-Größe gezogen (Emoji: über die Schrift).
          Strich-Symbole sind ohnehin weiß (currentColor). Ein Komitee-Emoji ist
          dagegen ein farbiges Bild: mit brightness(3) wurde z. B. 📰 zu einem
          hellen Rechteck. Emojis darum nur grau und weich eingeblendet
          (soft-light: hellt/dunkelt die Kachelfarbe ab, wie eine Prägung). */}
      <span
        aria-hidden
        className={`pointer-events-none absolute -bottom-4 -right-3 text-[4.75rem] leading-none [&_svg]:h-[4.75rem] [&_svg]:w-[4.75rem] ${
          typeof symbol === "string" ? "opacity-50 mix-blend-soft-light [filter:grayscale(1)]" : "opacity-[0.16]"
        }`}
      >
        {symbol}
      </span>
      <span className="relative flex items-start justify-between gap-2">
        <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-white/25 text-[19px] leading-none">
          {symbol}
        </span>
        {zahl ? (
          <span
            className={`zahl flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-[12.5px] font-bold ${
              zahlRot ? "bg-[#FF3B30] text-white ring-2 ring-white/90" : "bg-white text-tinte"
            }`}
          >
            {zahl > 99 ? "99+" : zahl}
          </span>
        ) : null}
      </span>
      <span className="relative mt-auto block pt-3">
        <span className="block text-[16px] font-semibold leading-tight tracking-[-0.01em]">{titel}</span>
        {unter && <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-snug text-white/85">{unter}</span>}
      </span>
    </button>
  );
}

/** Weißer Hauptknopf auf einer FarbKarte; text = Farbe der Schrift */
export function KnopfHell({ onClick, text, children }: { onClick: () => void; text: string; children: ReactNode }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`inline-flex min-h-[44px] items-center rounded-full bg-white px-4 text-[14px] font-semibold shadow-sm transition active:scale-95 ${text}`}
    >
      {children}
    </button>
  );
}

/** Durchscheinender Nebenknopf auf einer FarbKarte */
export function KnopfGlas({ onClick, children, dunkel = false }: { onClick: () => void; children: ReactNode; dunkel?: boolean }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`inline-flex min-h-[44px] items-center rounded-full px-4 text-[14px] font-semibold text-white transition active:scale-95 ${dunkel ? "bg-black/25" : "bg-white/20"}`}
    >
      {children}
    </button>
  );
}
