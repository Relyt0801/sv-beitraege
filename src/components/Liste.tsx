import type { ReactNode } from "react";

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
}: {
  titel?: string;
  fuss?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {titel && (
        <h3 className="mb-1.5 px-4 text-[12px] font-semibold uppercase tracking-[0.04em] text-tinte-leise">{titel}</h3>
      )}
      <div className="divide-y divide-black/[0.06] overflow-hidden rounded-2xl bg-[rgb(118_118_128/0.08)] dark:divide-white/[0.08] dark:bg-[rgb(118_118_128/0.18)]">
        {children}
      </div>
      {fuss && <p className="mt-1.5 px-4 text-[12px] leading-snug text-tinte-leise">{fuss}</p>}
    </section>
  );
}

/**
 * Eine Zeile: links die Bezeichnung, rechts der Wert. Mit onClick wird sie
 * zum Knopf mit „›“; rot = gefährliche Aktion (z. B. Löschen).
 */
export function Zeile({
  label,
  children,
  onClick,
  rot,
  disabled,
}: {
  label: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
  rot?: boolean;
  disabled?: boolean;
}) {
  const inhalt = (
    <>
      <span className={`shrink-0 text-[15px] ${rot ? "font-semibold text-red-600 dark:text-red-400" : ""}`}>{label}</span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">{children}</span>
      {onClick && !rot && <span aria-hidden className="shrink-0 text-[17px] leading-none text-tinte-leise">›</span>}
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
  return <div className="flex min-h-[48px] items-center gap-3 px-4 py-2">{inhalt}</div>;
}

/** Wert rechts in einer Zeile – gedämpft, wie in den iOS-Einstellungen. */
export function Wert({ children, stark }: { children: ReactNode; stark?: boolean }) {
  return (
    <span className={`zahl truncate text-[15px] ${stark ? "font-bold" : "text-tinte-matt dark:text-slate-300"}`}>{children}</span>
  );
}

/** Auswahlfeld in einer Zeile – sieht aus wie ein Wert, öffnet die native Auswahl. */
export function ZeileAuswahl({
  value,
  onChange,
  children,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-[60%] cursor-pointer appearance-none truncate bg-transparent text-right text-[15px] text-tinte-matt outline-none dark:text-slate-300"
    >
      {children}
    </select>
  );
}

/**
 * Kopf eines Blatts wie eine Rechnung bei Apple: oben mittig ein Bild, darunter
 * eine kleine Zeile, die große Zahl und ein Titel. Rechts oben schließen.
 */
export function RechnungKopf({
  bild,
  oben,
  wert,
  wertKlasse = "",
  titel,
  unter,
  onClose,
}: {
  bild?: ReactNode;
  oben?: ReactNode;
  wert?: ReactNode;
  wertKlasse?: string;
  titel?: ReactNode;
  unter?: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="relative flex flex-col items-center pt-1 text-center">
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Schließen"
          className="absolute -right-1.5 -top-1.5 flex h-11 w-11 items-center justify-center rounded-full transition active:scale-90"
        >
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[rgb(118_118_128/0.12)] text-[13px] font-bold text-tinte-leise dark:bg-[rgb(118_118_128/0.24)]">
            ✕
          </span>
        </button>
      )}
      {bild}
      {oben && <div className="mt-2 text-[13px] font-semibold text-tinte-leise">{oben}</div>}
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
