import { farbeVon, istKlausur, istKuerzel, type SchichtStatus, type Termin } from "../lib/termine";

/**
 * Das Zeichen eines Termins: ein Bildzeichen (🧇) oder ein Fach-Kürzel als
 * kleines Schild (M, EK, F7). Kürzel sehen im ganzen Kalender gleich aus,
 * damit man die eigene Klausur auf einen Blick findet.
 */
export function Zeichen({ icon, auf = false, klein = false }: { icon: string | null | undefined; auf?: boolean; klein?: boolean }) {
  if (!icon) return null;
  if (!istKuerzel(icon)) return <span className="mr-1" aria-hidden>{icon}</span>;
  return <Kuerzel text={icon} auf={auf} klein={klein} />;
}

export function Kuerzel({ text, auf = false, klein = false }: { text: string; auf?: boolean; klein?: boolean }) {
  return (
    <span
      className={`mr-1 inline-flex items-center justify-center rounded font-zahl font-extrabold uppercase leading-none tracking-tight ${
        klein ? "min-w-[1.35rem] px-1 py-[3px] text-[9px]" : "min-w-[1.6rem] px-1 py-[3px] text-[10px]"
      } ${auf ? "bg-white/25 text-white" : "bg-tinte/85 text-white dark:bg-slate-200 dark:text-slate-900"}`}
    >
      {text}
    </span>
  );
}

/**
 * Mehrere Klausuren an einem Tag: eine Zeile mit den Kürzeln statt einer
 * Kachel je Fach. Doppelte Kürzel (M GK und M LK) stehen nur einmal da.
 */
export function KuerzelLeiste({ liste, max = 3, klein = false }: { liste: Termin[]; max?: number; klein?: boolean }) {
  const kuerzel = [...new Set(liste.filter(istKlausur).map((t) => (t.icon || "").toUpperCase()))];
  if (!kuerzel.length) return null;
  const sichtbar = kuerzel.slice(0, max);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-y-0.5" title={`Klausuren: ${kuerzel.join(", ")}`}>
      {sichtbar.map((k) => (
        <Kuerzel key={k} text={k} klein={klein} />
      ))}
      {kuerzel.length > max && (
        <span className="text-[10px] font-bold text-tinte-leise">+{kuerzel.length - max}</span>
      )}
    </span>
  );
}

/**
 * Hintergrund eines Termin-Kärtchens: für mich = Markenfarbe, sonst die
 * gewählte Farbe. Bei Schichten zählt zuerst, wie ich dazu stehe:
 *  - bekommen:        sattes Grün (wie ein bestätigtes Ticket)
 *  - gemeldet:        normale Farbe mit feinem blauen Innenrand
 *  - nicht bekommen:  verblasst, gestrichelter Rand, ohne Füllung
 */
export function chipKlasse(t: Termin, meins: boolean, status: SchichtStatus = null): string {
  if (t.privat) return "border border-dashed border-tinte-leise/50 bg-transparent text-tinte-matt dark:text-slate-300";
  if (status === "eingeteilt") return "bg-emerald-600 text-white dark:bg-emerald-600";
  if (status === "nicht")
    return "border border-dashed border-tinte-leise/60 bg-transparent text-tinte-leise opacity-60 dark:border-slate-500 dark:text-slate-400";
  const grund = meins ? "bg-brand text-white" : farbeVon(t)?.chip ?? "bg-papier-matt text-tinte-matt dark:bg-slate-800 dark:text-slate-300";
  return status === "gemeldet" ? `${grund} ring-1 ring-inset ring-brand/70` : grund;
}

/** Farbe des kleinen Punktes (Handy-Monat, Wochenstreifen). */
export function punktKlasse(t: Termin, meins: boolean, status: SchichtStatus = null): string {
  if (t.privat) return "border border-tinte-leise/70";
  if (status === "eingeteilt") return "bg-emerald-500 ring-2 ring-emerald-500/30";
  if (status === "nicht") return "border border-dashed border-tinte-leise opacity-60";
  if (meins) return "bg-brand";
  if (istKlausur(t)) return "bg-tinte dark:bg-slate-200";
  return farbeVon(t)?.punkt ?? "bg-tinte-leise/60";
}

/** Kurzes Zeichen vor dem Titel in engen Kärtchen. */
export function schichtVorzeichen(status: SchichtStatus): string {
  return status === "eingeteilt" ? "✓ " : status === "gemeldet" ? "⏳ " : "";
}

/**
 * Das Schildchen rechts an einer Terminzeile. Ersetzt bei Schichten das
 * allgemeine „für dich“, weil es genauer sagt, woran man ist.
 */
export function SchichtSchild({ status, klein = false }: { status: SchichtStatus; klein?: boolean }) {
  if (!status) return null;
  const groesse = klein ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]";
  if (status === "eingeteilt")
    return (
      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 font-bold text-white shadow-sm ${groesse}`}>
        <Haken /> deine Schicht
      </span>
    );
  if (status === "gemeldet")
    return (
      <span className={`shrink-0 whitespace-nowrap rounded-full border border-brand/50 font-bold text-brand ${groesse}`}>
        ⏳ gemeldet
      </span>
    );
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full border border-dashed border-tinte-leise/70 font-bold text-tinte-leise ${groesse}`}>
      nicht bekommen
    </span>
  );
}

/** Rahmen einer ganzen Zeile / Karte je nach Schicht-Stand. */
export function schichtRahmen(status: SchichtStatus): string {
  if (status === "eingeteilt")
    return "!bg-emerald-50 ring-2 ring-emerald-500/60 dark:!bg-emerald-500/10 dark:ring-emerald-400/50";
  if (status === "nicht")
    return "!border !border-dashed !border-tinte-leise/50 !bg-transparent !shadow-none opacity-60";
  return "";
}

function Haken() {
  return (
    <svg viewBox="0 0 12 12" className="h-[0.8em] w-[0.8em]" aria-hidden>
      <path d="M2.2 6.4 4.8 9 9.8 3.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Kleine Erklärung im Kalender – nur, wenn man überhaupt Schichten hat. */
export function SchichtLegende() {
  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-tinte-matt dark:text-slate-300">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/30" aria-hidden /> Schicht bekommen
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-brand" aria-hidden /> gemeldet, wartet
      </span>
      <span className="inline-flex items-center gap-1.5 opacity-70">
        <span className="h-2.5 w-2.5 rounded-full border border-dashed border-tinte-leise" aria-hidden /> nicht bekommen
      </span>
    </div>
  );
}
