import { farbeVon, istKlausur, istKuerzel, type Termin } from "../lib/termine";

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

/** Hintergrund eines Termin-Kärtchens: für mich = Markenfarbe, sonst die gewählte Farbe. */
export function chipKlasse(t: Termin, meins: boolean): string {
  if (t.privat) return "border border-dashed border-tinte-leise/50 bg-transparent text-tinte-matt dark:text-slate-300";
  if (meins) return "bg-brand text-white";
  const f = farbeVon(t);
  return f ? f.chip : "bg-papier-matt text-tinte-matt dark:bg-slate-800 dark:text-slate-300";
}

/** Farbe des kleinen Punktes (Handy-Monat, Wochenstreifen). */
export function punktKlasse(t: Termin, meins: boolean): string {
  if (t.privat) return "border border-tinte-leise/70";
  if (meins) return "bg-brand";
  if (istKlausur(t)) return "bg-tinte dark:bg-slate-200";
  return farbeVon(t)?.punkt ?? "bg-tinte-leise/60";
}
