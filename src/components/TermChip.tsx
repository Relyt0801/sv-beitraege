import { type Halbjahr, type Student } from "../lib/types";
import { isDead, isPreJoin } from "../lib/logic";

const STATUS_CLASS: Record<string, string> = {
  offen: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  bezahlt: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  erlassen: "bg-blue-100 text-blue-700 line-through dark:bg-blue-500/15 dark:text-blue-300",
};

export function TermChip({
  student,
  h,
  i,
  current,
  size = "sm",
}: {
  student: Student;
  h: Halbjahr;
  i: number;
  current: Halbjahr;
  size?: "sm" | "lg";
}) {
  const t = student.terms[h];
  const pre = isPreJoin(student, i);
  const dead = isDead(student, i);
  const isCur = h === current;

  let cls = "";
  let content = "";
  if (pre) {
    cls = "border-dashed border-slate-300 text-slate-400 dark:border-slate-600 dark:text-slate-500";
    content = "–";
  } else if (dead) {
    cls = "bg-red-100 text-red-500 opacity-70 dark:bg-red-500/15 dark:text-red-300";
    content = "×";
  } else {
    cls = STATUS_CLASS[t.status];
    content = t.bet > 0 ? `●${t.bet}` : t.status === "bezahlt" ? "✓" : t.status === "erlassen" ? "~" : "";
  }

  const base =
    size === "lg"
      ? "min-w-[54px] rounded-xl px-2 py-1.5 text-[11px]"
      : "min-w-[46px] rounded-lg px-1.5 py-1 text-[10px]";

  return (
    <div
      className={`flex flex-col items-center border font-bold ${base} ${cls} ${
        isCur ? "ring-2 ring-brand ring-offset-1 ring-offset-white dark:ring-offset-slate-900" : "border-transparent"
      }`}
    >
      <span className="text-[9px] font-semibold opacity-70">{h}</span>
      <span className="leading-tight">{content || " "}</span>
    </div>
  );
}
