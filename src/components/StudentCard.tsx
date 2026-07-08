import { HY, type Settings, type Student } from "../lib/types";
import { offenBetrag } from "../lib/logic";
import { TermChip } from "./TermChip";

export function StudentCard({
  student,
  settings,
  selectable,
  selected,
  onOpen,
  onToggleSelect,
}: {
  student: Student;
  settings: Settings;
  selectable: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
}) {
  const leaving = student.verlaesst_ab != null;
  const joiningLate = student.beigetreten_ab !== "EF.1";
  const betrag = offenBetrag(student, settings.aktuelles_halbjahr);

  return (
    <div
      className={`card flex items-center gap-3 p-3 sm:p-4 ${
        leaving ? "!border-red-300 dark:!border-red-500/40" : ""
      } ${selected ? "ring-2 ring-brand" : ""}`}
      onClick={() => (selectable ? onToggleSelect() : onOpen())}
    >
      {selectable && (
        <div
          className={`flex h-6 w-6 min-w-6 items-center justify-center rounded-lg border-2 text-sm text-white transition ${
            selected ? "border-brand bg-brand" : "border-slate-300 dark:border-slate-600"
          }`}
        >
          {selected ? "✓" : ""}
        </div>
      )}

      <div className="min-w-0 flex-1 cursor-pointer">
        <div className="flex items-center gap-2 font-semibold">
          <span className="truncate">
            {student.nachname}, {student.vorname}
          </span>
          {leaving && (
            <span className="pill shrink-0 bg-red-500 text-white">verlässt {student.verlaesst_ab}</span>
          )}
          {joiningLate && !leaving && (
            <span className="pill shrink-0 bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              ab {student.beigetreten_ab}
            </span>
          )}
        </div>
        <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
          {HY.map((h, i) => (
            <TermChip key={h} student={student} h={h} i={i} current={settings.aktuelles_halbjahr} />
          ))}
        </div>
      </div>

      <div className="min-w-[60px] text-right">
        <div className={`text-base font-extrabold ${betrag > 0 ? "text-amber-500" : "text-emerald-500"}`}>
          {betrag > 0 ? `${betrag} €` : "✓"}
        </div>
        <div className="text-[10px] text-slate-400">{betrag > 0 ? "offen" : "bezahlt"}</div>
      </div>
    </div>
  );
}
