import { type Halbjahr, type Student } from "../lib/types";
import { idx, isDead, isPreJoin } from "../lib/logic";

// Die Farben passen sich selbst an hell/dunkel an (Variablen in index.css).
const STATUS_CLASS: Record<string, string> = {
  offen: "bg-offen-grund text-offen border-offen-rand",
  bezahlt: "bg-bezahlt-grund text-bezahlt border-bezahlt-rand",
  erlassen: "bg-erlassen-grund text-erlassen border-erlassen-rand",
};
// erlassen = Schrägstrich: "zählt nicht", klar unterscheidbar von € und ✓
const GLYPH: Record<string, string> = { offen: "€", bezahlt: "✓", erlassen: "/" };

export function TermChip({
  student,
  h,
  i,
  current,
  onToggle,
  big,
  kompakt,
}: {
  student: Student;
  h: Halbjahr;
  i: number;
  current: Halbjahr;
  onToggle?: () => void;
  big?: boolean;
  /** schmale Variante fuer die Kassenliste: nur Kuerzel und Zeichen */
  kompakt?: boolean;
}) {
  const t = student.terms[h];
  const pre = isPreJoin(student, i);
  const dead = isDead(student, i);
  const inactive = pre || dead;
  const isCur = h === current;

  let cls: string, glyph: string;
  if (pre) {
    cls = "border-dashed border-papier-linie text-tinte-leise dark:border-slate-600 dark:text-slate-500";
    glyph = "–";
  } else if (dead) {
    cls = "bg-red-100 text-red-500 border-red-200 opacity-70 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/25";
    glyph = "×";
  } else if (t.status === "offen" && i > idx(current)) {
    // Kommt erst noch: nicht wie eine Schuld aussehen lassen
    cls = "bg-[rgb(118_118_128/0.1)] text-tinte-leise border-transparent";
    glyph = GLYPH.offen;
  } else {
    cls = STATUS_CLASS[t.status];
    glyph = GLYPH[t.status];
  }

  const size = big ? "h-14 text-sm" : kompakt ? "h-8 text-[11px]" : "h-12 text-[13px] sm:h-[52px] lg:h-16 lg:text-[15px]";
  const ring = isCur
    ? kompakt
      ? "ring-2 ring-brand"
      : "ring-2 ring-brand ring-offset-2 ring-offset-white dark:ring-offset-slate-900"
    : "";
  const clickable = onToggle && !inactive;

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      className={`flex flex-1 basis-0 flex-col items-center justify-center gap-0.5 border font-bold leading-none transition ${kompakt ? "rounded-md" : "rounded-xl"} ${size} ${cls} ${ring} ${
        clickable ? "cursor-pointer active:scale-95" : "cursor-default"
      }`}
    >
      {/* Früher 8 px mit 70 % Deckkraft – kaum lesbar (Kontrast 3,1:1). */}
      <span className={`font-semibold ${kompakt ? "text-[9px] leading-none" : "text-[10px] lg:text-[12px]"}`}>{h}</span>
      <span
        className={`${kompakt ? "text-[12px]" : "text-base"} ${
          t.status === "erlassen" && !inactive ? (kompakt ? "font-black" : "text-lg font-black") : ""
        }`}
      >
        {glyph}
      </span>
    </button>
  );
}
