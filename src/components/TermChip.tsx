import { type Halbjahr, type Student } from "../lib/types";
import { isDead, isPreJoin } from "../lib/logic";

const STATUS_CLASS: Record<string, string> = {
  offen: "bg-offen-grund text-offen border-offen-rand dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/25",
  bezahlt: "bg-bezahlt-grund text-bezahlt border-bezahlt-rand dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/25",
  erlassen: "bg-erlassen-grund text-erlassen border-erlassen-rand dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/25",
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
  } else {
    cls = STATUS_CLASS[t.status];
    glyph = GLYPH[t.status];
  }

  const size = big ? "h-14 text-sm" : kompakt ? "h-8 text-[11px]" : "h-12 text-[13px] sm:h-[52px]";
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
      <span className={`font-semibold opacity-70 ${kompakt ? "text-[8px] leading-none" : "text-[10px]"}`}>{h}</span>
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
