import type { ReactNode } from "react";
import { SchliessenKnopf, ZurueckKnopf, useBlattKopf, useZurueckKanal } from "./Sheet";

/**
 * Bausteine im Stil der iOS-Einstellungen – überall in der App gleich:
 *
 *   RechnungKopf  oben mittig: Bild/Icon, kleine Zeile, große Zahl, Titel
 *   Gruppe        kleine Überschrift, graue Gruppe mit Trennlinien, Fußnote
 *   Zeile         links Bezeichnung, rechts Wert – optional antippbar (›)
 *
 * Bitte keine eigenen Kästen mit Rahmen mehr bauen, sondern diese nehmen.
 */

/** Abschnitt: kleine Überschrift, graue Gruppe, optional eine Fußnote darunter. */
export function Gruppe({
  titel,
  fuss,
  children,
  className = "mt-4",
  spalten = false,
}: {
  titel?: string;
  fuss?: ReactNode;
  children: ReactNode;
  className?: string;
  /** ab Laptop/iPad quer die Zeilen in zwei Spalten (index.css → .gruppe-zwei) */
  spalten?: boolean;
}) {
  return (
    <section className={className}>
      {titel && (
        <h3 className="auf-bild mb-1.5 px-4 text-[13px] font-normal uppercase tracking-[0.02em] text-tinte-leise">{titel}</h3>
      )}
      <div className={`gruppe-zellen ${spalten ? "gruppe-zwei" : ""}`}>
        {children}
      </div>
      {fuss && <p className="auf-bild mt-1.5 px-4 text-[13px] leading-snug text-tinte-leise">{fuss}</p>}
    </section>
  );
}

/**
 * Eine Zeile: links die Bezeichnung, rechts der Wert. Mit onClick wird sie
 * zum Knopf mit „›“; rot = gefährliche Aktion (z. B. Löschen).
 *
 * Ergänzt für 1.4 (alles optional, bestehende Aufrufe bleiben gleich):
 *   symbol  farbiges Kästchen links wie in den iOS-Einstellungen (<Symbol …/>)
 *   unter   kleine zweite Zeile unter der Bezeichnung (Erklärung, Stand)
 *   blau    Aktion in Systemblau ohne „›“ (z. B. „Person hinzufügen“)
 *   ohnePfeil  antippbar, aber ohne „›“ (z. B. wenn rechts schon ein Haken steht)
 */
export function Zeile({
  label,
  children,
  onClick,
  rot,
  disabled,
  symbol,
  unter,
  blau,
  ohnePfeil,
}: {
  label: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
  rot?: boolean;
  disabled?: boolean;
  symbol?: ReactNode;
  unter?: ReactNode;
  blau?: boolean;
  ohnePfeil?: boolean;
}) {
  const farbe = rot ? "text-red-600 dark:text-red-400" : blau ? "text-brand-dark dark:text-brand" : "";
  const hatWert = children !== undefined && children !== null && children !== false && children !== "";
  const inhalt = (
    <>
      {symbol}
      {unter ? (
        // Mit zweiter Zeile darf die Bezeichnung umbrechen; rechts bleibt fest.
        <span className="min-w-0 flex-1">
          <span className={`block text-[15px] leading-snug ${rot ? "font-semibold" : ""} ${farbe}`}>{label}</span>
          <span className="mt-0.5 block text-[12.5px] leading-snug text-tinte-leise">{unter}</span>
        </span>
      ) : (
        // Ohne Wert rechts darf eine lange Bezeichnung umbrechen (statt „›“
        // aus der Zeile zu schieben). Mit Wert/Eingabefeld bleibt sie ganz
        // (höchstens 65 % breit) – sonst brach „Bezeichnung“ neben einem
        // Eingabefeld mitten im Wort um.
        <span className={`text-[15px] leading-snug ${hatWert ? "max-w-[65%] shrink-0" : "min-w-0 flex-1"} ${rot ? "font-semibold" : blau ? "font-medium" : ""} ${farbe}`}>{label}</span>
      )}
      {(hatWert || unter) && <span className={`flex min-w-0 items-center justify-end gap-1.5 ${unter ? "shrink-0" : "flex-1"}`}>{children}</span>}
      {onClick && !rot && !blau && !ohnePfeil && <span aria-hidden className="shrink-0 text-[17px] leading-none text-tinte-leise">›</span>}
    </>
  );
  if (onClick)
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] disabled:opacity-40 dark:active:bg-white/[0.06]"
      >
        {inhalt}
      </button>
    );
  return <div className={`flex min-h-[48px] items-center gap-3 px-4 py-2 ${disabled ? "opacity-40" : ""}`}>{inhalt}</div>;
}

/**
 * Farbiges Symbol-Kästchen links in einer Zeile (wie in den iOS-Einstellungen).
 * `farbe` ist eine Tailwind-Hintergrundklasse, z. B. "bg-[#34C759]".
 * Kinder: meist ein <Icon …/> in 16–17 px, Strichstärke 2.2.
 */
export function Symbol({ farbe, children }: { farbe: string; children: ReactNode }) {
  return (
    <span aria-hidden className={`symbol ${farbe}`}>
      {children}
    </span>
  );
}

/**
 * Zeile mit Kippschalter rechts – die ganze Zeile ist das Label, ein Tipp
 * irgendwo darauf schaltet um (wie in iOS). Der Schalter selbst kommt als
 * Kind herein, damit Liste.tsx nicht von Schalter.tsx abhängt.
 */
export function ZeileMitSchalter({
  label,
  unter,
  symbol,
  children,
  disabled,
}: {
  label: ReactNode;
  unter?: ReactNode;
  symbol?: ReactNode;
  /** Der <Schalter …/> */
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`flex min-h-[48px] cursor-pointer items-center gap-3 px-4 py-2 ${disabled ? "pointer-events-none opacity-40" : ""}`}>
      {symbol}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug">{label}</span>
        {unter && <span className="mt-0.5 block text-[12.5px] leading-snug text-tinte-leise">{unter}</span>}
      </span>
      {children}
    </label>
  );
}

/**
 * Auswahl-Zeile mit Haken rechts (wie „Klingelton“-Listen in iOS): die
 * gewählte Zeile trägt einen blauen Haken. Für Mehrfachauswahl einfach
 * mehrere Zeilen mit `gewaehlt` setzen.
 */
export function ZeileHaken({
  label,
  unter,
  symbol,
  gewaehlt,
  onClick,
  disabled,
  rechts,
}: {
  label: ReactNode;
  unter?: ReactNode;
  symbol?: ReactNode;
  gewaehlt: boolean;
  onClick: () => void;
  disabled?: boolean;
  /** Zusatz rechts vor dem Haken (z. B. ein Schloss) */
  rechts?: ReactNode;
}) {
  return (
    <button
      type="button"
      // aria-pressed statt role=menuitemcheckbox: die Zeilen stehen in keinem Menü (axe)
      aria-pressed={gewaehlt}
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] disabled:opacity-40 dark:active:bg-white/[0.06]"
    >
      {symbol}
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] leading-snug ${gewaehlt ? "font-medium" : ""}`}>{label}</span>
        {unter && <span className="mt-0.5 block text-[12.5px] leading-snug text-tinte-leise">{unter}</span>}
      </span>
      {rechts}
      <span aria-hidden className={`shrink-0 text-brand transition-opacity duration-200 ${gewaehlt ? "opacity-100" : "opacity-0"}`}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      </span>
    </button>
  );
}

/** Wert rechts in einer Zeile – gedämpft, wie in den iOS-Einstellungen. */
export function Wert({ children, stark }: { children: ReactNode; stark?: boolean }) {
  return (
    <span className={`zahl truncate text-[15px] ${stark ? "font-bold" : "text-tinte-matt dark:text-slate-300"}`}>{children}</span>
  );
}

/**
 * Kopf eines Blatts wie eine Rechnung bei Apple: oben mittig ein Bild, darunter
 * eine kleine Zeile, die große Zahl und ein Titel. Rechts oben schließen.
 *
 * Im Blatt-Stapel (siehe Sheet.tsx) wie SheetKopf: als Unterseite links
 * „‹ <Seite davor>“, und ✕ schließt den ganzen Stapel. `zurueck` setzt einen
 * eigenen Zurück-Knopf (Unterseite im selben Blatt).
 */
export function RechnungKopf({
  bild,
  oben,
  wert,
  wertKlasse = "",
  titel,
  unter,
  onClose,
  zurueck,
}: {
  bild?: ReactNode;
  oben?: ReactNode;
  wert?: ReactNode;
  wertKlasse?: string;
  titel?: ReactNode;
  unter?: ReactNode;
  onClose?: () => void;
  zurueck?: { text: string; onClick: () => void };
}) {
  // Für „‹ …“ einer Unterseite zählt die kleine Zeile („Mithilfe nachtragen“)
  const lage = useBlattKopf(oben ?? titel);
  useZurueckKanal(zurueck?.onClick);
  const zurueckJetzt = zurueck ?? (lage?.kind && onClose ? { text: lage.zurueckText, onClick: onClose } : undefined);
  return (
    <div className="relative flex flex-col items-center pt-1 text-center">
      {zurueckJetzt && <ZurueckKnopf text={zurueckJetzt.text} onClick={zurueckJetzt.onClick} className="absolute left-0 top-0.5 max-w-[38%]" />}
      {onClose && <SchliessenKnopf onClick={lage?.kind ? lage.alleSchliessen : onClose} className="absolute -right-1.5 top-0.5" />}
      {bild}
      {oben && (
        <div id={lage?.titelId} className="mt-2 text-[13px] font-semibold text-tinte-leise">
          {oben}
        </div>
      )}
      {wert !== undefined && (
        <div className={`zahl mt-1 text-[2.6rem] font-extrabold leading-none tracking-[-0.03em] ${wertKlasse}`}>{wert}</div>
      )}
      {titel && <div className="mt-1.5 text-[15px] font-semibold">{titel}</div>}
      {unter && <div className="mt-0.5 text-[12.5px] text-tinte-leise">{unter}</div>}
    </div>
  );
}

/** Rundes Bild mit Initialen (oder einem Zeichen) für den Rechnungskopf. */
export function KopfBild({ text, farbe = "from-[#3B82F6] to-[#0A58CA]" }: { text: string; farbe?: string }) {
  return (
    <span
      className={`flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br text-[20px] font-bold text-white shadow-sm ${farbe}`}
    >
      {text}
    </span>
  );
}

/** Eingabe in einer Zeile: links die Bezeichnung, rechts das Feld (wie in iOS-Formularen). */
export function ZeileEingabe({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoFocus,
  onEnter,
  maxLength,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  maxLength?: number;
  inputMode?: "text" | "numeric" | "decimal" | "email";
}) {
  return (
    <label className="flex min-h-[48px] items-center gap-3 px-4 py-2">
      <span className="shrink-0 text-[15px]">{label}</span>
      <input
        type={type}
        value={value}
        autoFocus={autoFocus}
        maxLength={maxLength}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        className="min-w-0 flex-1 bg-transparent text-right text-[15px] outline-none placeholder:text-tinte-leise"
      />
    </label>
  );
}

/** Segmentierte Auswahl in einer Zeile (z. B. Halbjahre). */
export function ZeileSegmente<T extends string>({
  werte,
  wert,
  onWahl,
}: {
  werte: readonly T[];
  wert: T;
  onWahl: (w: T) => void;
}) {
  return (
    <div className="px-3 py-2.5">
      <div className="seg">
        {werte.map((w) => (
          <button key={w} type="button" onClick={() => onWahl(w)} className={`seg-item px-1 ${wert === w ? "seg-aktiv" : ""}`}>
            {w}
          </button>
        ))}
      </div>
    </div>
  );
}
