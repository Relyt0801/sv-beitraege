import { type Halbjahr, type Student } from "../lib/types";
import { isDead, isPreJoin } from "../lib/logic";

const STATUS_CLASS: Record<string, string> = {
  offen: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/25",
  bezahlt: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/25",
  erlassen: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/25",
};
const GLYPH: Record<string, string> = { offen: "€", bezahlt: "✓", erlassen: "~" };

export function TermChip({
  student,
  h,
  i,
  current,
  onToggle,
  big,
}: {
  student: Student;
  h: Halbjahr;
  i: number;
  current: Halbjahr;
  onToggle?: () => void;
  big?: boolean;
}) {
  const t = student.terms[h];
  const pre = isPreJoin(student, i);
  const dead = isDead(student, i);
  const inactive = pre || dead;
  const isCur = h === current;

  let cls: string, glyph: string;
  if (pre) {
    cls = "border-dashed border-slate-300 text-slate-400 dark:border-slate-600 dark:text-slate-500";
    glyph = "–";
  } else if (dead) {
    cls = "bg-red-100 text-red-500 border-red-200 opacity-70 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/25";
    glyph = "×";
  } else {
    cls = STATUS_CLASS[t.status];
    glyph = GLYPH[t.status];
  }

  const size = big ? "h-14 text-sm" : "h-12 text-[13px] sm:h-[52px]";
  const ring = isCur ? "ring-2 ring-brand ring-offset-2 ring-offset-white dark:ring-offset-slate-900" : "";
  const clickable = onToggle && !inactive;

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      className={`flex flex-1 basis-0 flex-col items-center justify-center gap-0.5 rounded-xl border font-bold leading-none transition ${size} ${cls} ${ring} ${
        clickable ? "cursor-pointer active:scale-95" : "cursor-default"
      } ${erlassenLine(t.status, inactive)}`}
    >
      <span className="text-[10px] font-semibold opacity-70">{h}</span>
      <span className="text-base">{glyph}</span>
    </button>
  );
}

function erlassenLine(status: string, inactive: boolean) {
  return status === "erlassen" && !inactive ? "[&>span:last-child]:line-through" : "";
}
