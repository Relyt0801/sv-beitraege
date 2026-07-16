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

const inDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString();
const PERMANENT = "2099-12-31T00:00:00.000Z";
const isBannedUntil = (u: string | null) => !!u && new Date(u) > new Date();

export function RolesTab() {
  const { profiles, setRole, setBan, isAdmin } = useRole();
  const { students } = useStore();
  const { committeesOf, setUserCommittee } = useTopics();
  const [q, setQ] = useState("");
  const [openKom, setOpenKom] = useState<string | null>(null);
  const [openBan, setOpenBan] = useState<string | null>(null);

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
          return (
            <div key={p.user_id} className="card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  title={p.has_logged_in ? "hat sich schon angemeldet" : "noch nie angemeldet"}
                  className={`h-3 w-3 shrink-0 rounded-full ${p.has_logged_in ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
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
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => setOpenKom(openKom === p.user_id ? null : p.user_id)}
                className="mt-2 flex w-full items-center gap-2 text-left text-xs text-slate-500"
              >
                <span className="font-semibold">Komitees:</span>
                <span className="flex-1 truncate">
                  {koms.length ? koms.map((s) => COMMITTEES.find((c) => c.slug === s)?.label || s).join(", ") : "keine"}
                </span>
                <span>{openKom === p.user_id ? "▲" : "▼"}</span>
              </button>

              {openKom === p.user_id && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {COMMITTEES.map((c) => {
                    const on = koms.includes(c.slug);
                    return (
                      <button
                        key={c.slug}
                        onClick={() => setUserCommittee(p.user_id, c.slug, !on)}
                        className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
                          on ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-500 dark:border-slate-700"
                        }`}
                      >
                        {on ? "✓ " : ""}{c.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {isAdmin && (
                <>
                  <button
                    onClick={() => setOpenBan(openBan === p.user_id ? null : p.user_id)}
                    className="mt-2 flex w-full items-center gap-2 text-left text-xs"
                  >
                    <span className="font-semibold text-slate-500">Chat-Sperre:</span>
                    <span className={`flex-1 truncate ${isBannedUntil(p.chat_banned_until) ? "font-bold text-red-500" : "text-slate-400"}`}>
                      {isBannedUntil(p.chat_banned_until)
                        ? p.chat_banned_until === PERMANENT
                          ? "dauerhaft gesperrt"
                          : "gesperrt bis " + new Date(p.chat_banned_until!).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                        : "aktiv (nicht gesperrt)"}
                    </span>
                    <span>{openBan === p.user_id ? "▲" : "▼"}</span>
                  </button>
                  {openBan === p.user_id && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {isBannedUntil(p.chat_banned_until) && (
                        <button onClick={() => setBan(p.user_id, null)} className="rounded-full border border-emerald-400 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          ✓ Entsperren
                        </button>
                      )}
                      <button onClick={() => setBan(p.user_id, inDays(1))} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-bold text-slate-500 dark:border-slate-700">1 Tag</button>
                      <button onClick={() => setBan(p.user_id, inDays(7))} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-bold text-slate-500 dark:border-slate-700">7 Tage</button>
                      <button onClick={() => setBan(p.user_id, PERMANENT)} className="rounded-full border border-red-300 px-3 py-1 text-xs font-bold text-red-500">Dauerhaft</button>
                    </div>
                  )}
                </>
              )}
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
