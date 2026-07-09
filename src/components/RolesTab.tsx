import { useMemo, useState } from "react";
import { normalize, sortStudents } from "../lib/logic";
import { useStore } from "../store";
import { useRole, type Role } from "../auth/RoleProvider";

const ROLE_LABEL: Record<Role, string> = {
  schueler: "Schüler",
  stufenteam: "Stufenteam",
  kassenwart: "Kassenwart",
  admin: "Admin",
};

export function RolesTab() {
  const { profiles, setRole } = useRole();
  const { students } = useStore();
  const [q, setQ] = useState("");

  const nameFor = (studentId: string | null) => {
    const s = studentId ? students.find((x) => x.id === studentId) : null;
    return s ? `${s.nachname}, ${s.vorname}` : null;
  };

  const rows = useMemo(() => {
    const norm = normalize(q);
    return [...profiles]
      .map((p) => ({ p, name: nameFor(p.student_id) }))
      .filter(({ p, name }) => !norm || normalize(`${p.username} ${name ?? ""}`).includes(norm))
      .sort((a, b) =>
        (a.name ?? a.p.username ?? "").localeCompare(b.name ?? b.p.username ?? "", "de"),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, q, students]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-card dark:border-slate-800 dark:bg-slate-900 dark:shadow-cardDark">
        <span className="text-slate-400">🔍</span>
        <input
          className="w-full bg-transparent text-base outline-none placeholder:text-slate-400"
          placeholder="Nutzer oder Name suchen…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="grid gap-2.5">
        {rows.map(({ p, name }) => (
          <div key={p.user_id} className="card flex flex-wrap items-center gap-3 p-4">
            <span
              title={p.has_logged_in ? "hat sich schon angemeldet" : "noch nie angemeldet"}
              className={`h-3 w-3 shrink-0 rounded-full ${
                p.has_logged_in ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{name ?? p.username ?? "—"}</div>
              <div className="truncate text-[13px] text-slate-400">{p.username}</div>
            </div>
            <select
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold dark:border-slate-700 dark:bg-slate-800"
              value={p.role}
              onChange={(e) => setRole(p.user_id, e.target.value as Role)}
            >
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-400">
            Noch keine Konten. Sobald Konten angelegt sind, erscheinen sie hier.
          </div>
        )}
      </div>
    </div>
  );
}
