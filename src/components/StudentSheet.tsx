import { HY, STATI, type Halbjahr, type Student } from "../lib/types";
import { isDead, isPreJoin, offenGesamt, zusatzFaellig } from "../lib/logic";
import { useStore } from "../store";
import { Sheet } from "./Sheet";

const STATUS_LABEL: Record<string, string> = { offen: "offen", bezahlt: "✓ bezahlt", erlassen: "~ erlassen" };
const STATUS_ON: Record<string, string> = {
  offen: "bg-amber-500 text-white border-amber-500",
  bezahlt: "bg-emerald-500 text-white border-emerald-500",
  erlassen: "bg-blue-500 text-white border-blue-500",
};

export function StudentSheet({ student, onClose }: { student: Student | null; onClose: () => void }) {
  const { settings, setTerm, bumpBet, updateStudent, removeStudent } = useStore();

  return (
    <Sheet open={student != null} onClose={onClose}>
      {student && (
        <>
          <div className="mb-4 flex items-center gap-3">
            <span className="flex-1 text-2xl font-bold leading-tight">
              {student.nachname}, {student.vorname}
            </span>
            <button className="iconbtn" onClick={onClose} aria-label="Schließen">
              ✕
            </button>
          </div>

          {/* Zusammenfassung */}
          <div className="mb-5 flex items-center gap-3 rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/70">
            <div className="flex-1">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Offen gesamt</div>
              <div className="text-2xl font-extrabold">
                {offenGesamt(student, settings)} €{" "}
                {zusatzFaellig(student, settings) && (
                  <span className="align-middle text-sm font-semibold text-red-500">inkl. {settings.zusatz} € Zusatz</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Beteiligungen</div>
              <div className="mt-1 flex items-center overflow-hidden rounded-xl border border-slate-300 dark:border-slate-600">
                <button onClick={() => bumpBet(student.id, -1)} className="h-11 w-11 bg-white text-2xl font-bold dark:bg-slate-900">
                  −
                </button>
                <span className="min-w-[48px] text-center text-xl font-extrabold">{student.beteiligungen}</span>
                <button onClick={() => bumpBet(student.id, 1)} className="h-11 w-11 bg-white text-2xl font-bold dark:bg-slate-900">
                  ＋
                </button>
              </div>
            </div>
          </div>

          <div className="mb-2 text-sm font-semibold text-slate-500">Beiträge pro Halbjahr</div>
          <div className="grid gap-2.5">
            {HY.map((h, i) => {
              const t = student.terms[h];
              const pre = isPreJoin(student, i);
              const dead = isDead(student, i);
              const inactive = pre || dead;
              const isCur = h === settings.aktuelles_halbjahr;
              return (
                <div
                  key={h}
                  className={`flex flex-wrap items-center gap-2 rounded-2xl border p-3 ${
                    isCur ? "border-brand ring-2 ring-brand/20" : "border-slate-200 dark:border-slate-700"
                  } ${dead ? "bg-red-50 opacity-60 dark:bg-red-500/10" : pre ? "bg-slate-50 opacity-70 dark:bg-slate-800/40" : ""}`}
                >
                  <span className="text-[15px] font-extrabold">{h}</span>
                  {isCur && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">AKTUELL</span>}
                  {pre && <span className="text-xs text-slate-400">noch nicht dabei</span>}
                  {dead && <span className="text-xs text-red-400">verlassen</span>}
                  <div className="ml-auto flex gap-1.5">
                    {STATI.map((s) => (
                      <button
                        key={s}
                        disabled={inactive}
                        onClick={() => setTerm(student.id, h, s)}
                        className={`rounded-lg border px-3 py-2 text-[13px] font-bold transition disabled:opacity-30 ${
                          t.status === s && !inactive
                            ? STATUS_ON[s]
                            : "border-slate-200 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
                        }`}
                      >
                        {STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <label className="text-sm text-slate-500">Dabei ab</label>
            <select
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
              value={student.beigetreten_ab}
              onChange={(e) => updateStudent(student.id, { beigetreten_ab: e.target.value as Halbjahr })}
            >
              {HY.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
            <label className="text-sm text-slate-500">Verlässt ab</label>
            <select
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
              value={student.verlaesst_ab ?? ""}
              onChange={(e) => updateStudent(student.id, { verlaesst_ab: (e.target.value || null) as Halbjahr | null })}
            >
              <option value="">— bleibt —</option>
              {HY.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
            <button
              onClick={() => {
                if (confirm("Diese Person wirklich löschen?")) {
                  removeStudent(student.id);
                  onClose();
                }
              }}
              className="ml-auto rounded-xl border border-red-300 px-3 py-2 text-sm font-bold text-red-500"
            >
              Löschen
            </button>
          </div>

          <button className="btn-primary mt-5" onClick={onClose}>
            Fertig
          </button>
        </>
      )}
    </Sheet>
  );
}
