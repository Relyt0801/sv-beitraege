import { useMemo, useState } from "react";
import { normalize } from "../lib/logic";
import { useStore } from "../store";
import { useRole, type Role } from "../auth/RoleProvider";
import { useTopics } from "../topics-store";
import { COMMITTEES } from "../lib/committees";

const ROLE_LABEL: Record<Role, string> = {
  schueler: "Schüler",
  stufenteam: "Stufenteam",
  kassenwart: "Kassenwart",
  admin: "Admin",
};

const PERMANENT = "2099-12-31T00:00:00.000Z";
const isBanned = (u: string | null) => !!u && new Date(u) > new Date();

export function RolesTab() {
  const { profiles, setRole, setBan, isAdmin } = useRole();
  const { students } = useStore();
  const { committeesOf, setUserCommittee } = useTopics();
  const [q, setQ] = useState("");
  const [openKom, setOpenKom] = useState<string | null>(null);

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
        {rows.map(({ p, name }) => {
          const koms = committeesOf(p.user_id);
          const banned = isBanned(p.chat_banned_until);
          return (
            <div key={p.user_id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  title={p.has_logged_in ? "hat sich schon angemeldet" : "noch nie angemeldet"}
                  className={`h-3 w-3 shrink-0 rounded-full ${p.has_logged_in ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
                />
                <div className="min-w-0 flex-1 basis-40">
                  <div className="truncate font-semibold">{name ?? p.username ?? "—"}</div>
                  <div className="truncate text-[13px] text-slate-400">{p.username}</div>
                </div>

                {/* Rolle */}
                <select
                  className="h-[42px] rounded-xl border border-slate-200 bg-slate-50 px-3 font-semibold dark:border-slate-700 dark:bg-slate-800"
                  value={p.role}
                  onChange={(e) => setRole(p.user_id, e.target.value as Role)}
                >
                  {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>

                {/* Komitees als Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setOpenKom(openKom === p.user_id ? null : p.user_id)}
                    className="flex h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 font-semibold dark:border-slate-700 dark:bg-slate-800"
                  >
                    <span className="text-slate-500 dark:text-slate-300">Komitees</span>
                    {koms.length > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-xs font-bold text-white">{koms.length}</span>
                    )}
                    <span className="text-slate-400">▾</span>
                  </button>
                  {openKom === p.user_id && (
                    <>
                      <button className="fixed inset-0 z-20 cursor-default" onClick={() => setOpenKom(null)} aria-label="Schließen" />
                      <div className="absolute right-0 z-30 mt-1 max-h-64 w-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                        {COMMITTEES.map((c) => {
                          const on = koms.includes(c.slug);
                          return (
                            <button
                              key={c.slug}
                              onClick={() => setUserCommittee(p.user_id, c.slug, !on)}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs text-white ${on ? "border-brand bg-brand" : "border-slate-300 dark:border-slate-600"}`}>{on ? "✓" : ""}</span>
                              {c.label}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* Chat-Sperre (nur Admin) */}
                {isAdmin && (
                  <button
                    onClick={() => setBan(p.user_id, banned ? null : PERMANENT)}
                    title={banned ? "Chat-Sperre aufheben" : "Vom Chat sperren"}
                    className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border text-lg transition ${
                      banned
                        ? "border-red-300 bg-red-500/10 text-red-500"
                        : "border-slate-200 text-slate-400 hover:text-slate-600 dark:border-slate-700 dark:hover:text-slate-200"
                    }`}
                  >
                    {banned ? "🚫" : "💬"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-400">
            Noch keine Konten. Sobald Konten angelegt sind, erscheinen sie hier.
          </div>
        )}
      </div>
    </div>
  );
}
