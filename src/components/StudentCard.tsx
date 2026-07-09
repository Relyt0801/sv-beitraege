import { HY, STATI, type Settings, type Student } from "../lib/types";
import { offenGesamt, zusatzFaellig } from "../lib/logic";
import { TermChip } from "./TermChip";

export function StudentCard({
  student,
  settings,
  selectable,
  selected,
  canToggleBeitrag,
  loginState,
  onOpen,
  onToggleSelect,
  onToggleTerm,
}: {
  student: Student;
  settings: Settings;
  selectable: boolean;
  selected: boolean;
  canToggleBeitrag: boolean;
  loginState?: boolean | null;
  onOpen: () => void;
  onToggleSelect: () => void;
  onToggleTerm: (h: (typeof HY)[number]) => void;
}) {
  const leaving = student.verlaesst_ab != null;
  const joiningLate = student.beigetreten_ab !== "EF.1";
  const betrag = offenGesamt(student, settings);
  const zusatz = zusatzFaellig(student, settings);

  return (
    <div
      className={`card p-4 sm:p-5 ${leaving ? "!border-red-300 dark:!border-red-500/40" : ""} ${
        selected ? "ring-2 ring-brand" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        {selectable && (
          <button
            onClick={onToggleSelect}
            className={`mt-0.5 flex h-6 w-6 min-w-6 items-center justify-center rounded-lg border-2 text-sm text-white transition ${
              selected ? "border-brand bg-brand" : "border-slate-300 dark:border-slate-600"
            }`}
          >
            {selected ? "✓" : ""}
          </button>
        )}

        <button
          onClick={() => (selectable ? onToggleSelect() : onOpen())}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {loginState != null && (
              <span
                title={loginState ? "hat sich schon angemeldet" : "noch nie angemeldet"}
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  loginState ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
                }`}
              />
            )}
            <span className="text-[17px] font-semibold leading-tight">
              {student.nachname}, {student.vorname}
            </span>
            {leaving && (
              <span className="rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white">
                verlässt {student.verlaesst_ab}
              </span>
            )}
            {joiningLate && !leaving && (
              <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                ab {student.beigetreten_ab}
              </span>
            )}
          </div>
          <div className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
            {student.beteiligungen} Beteiligung{student.beteiligungen === 1 ? "" : "en"}
          </div>
        </button>

        <div className="shrink-0 text-right">
          <div className={`text-xl font-extrabold ${betrag > 0 ? "text-amber-500" : "text-emerald-500"}`}>
            {betrag > 0 ? `${betrag} €` : "✓"}
          </div>
          <div className="text-[11px] text-slate-400">
            {betrag > 0 ? (zusatz ? "offen +Zusatz" : "offen") : "bezahlt"}
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-1.5 sm:gap-2">
        {HY.map((h, i) => (
          <TermChip
            key={h}
            student={student}
            h={h}
            i={i}
            current={settings.aktuelles_halbjahr}
            onToggle={!selectable && canToggleBeitrag ? () => onToggleTerm(h) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

export function nextStatus(cur: string) {
  const i = STATI.indexOf(cur as any);
  return STATI[(i + 1) % STATI.length];
}
