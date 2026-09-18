import { useMemo, useState } from "react";
import { normalize } from "../lib/logic";
import { useStore } from "../store";
import { useRole, type Role } from "../auth/RoleProvider";
import { useTopics } from "../topics-store";
import { COMMITTEES } from "../lib/committees";
import { rolleName } from "../lib/permissions";
import { KontoZeile, Suchfeld } from "./KontoZeile";

/** Reihenfolge im Auswahlfeld. Die Namen kommen zentral aus permissions.ts. */
const ROLLEN_AUSWAHL: Role[] = ["schueler", "sprecher", "stv_sprecher", "stufenteam", "kassenwart", "admin", "eltern"];

/** Elternzugaenge stehen nicht in der Rollenliste – sie gehoeren nicht zur Stufe. */
const VERSTECKT: Role[] = ["eltern"];

/** Diese beiden Rollen darf nur der Admin vergeben – und je nur einmal. */
const NUR_ADMIN: Role[] = ["sprecher", "stv_sprecher"];

const isBanned = (p: { chat_banned_until: string | null; chat_ban_permanent?: boolean }) =>
  Boolean(p.chat_ban_permanent) || (!!p.chat_banned_until && new Date(p.chat_banned_until) > new Date());

const DAUERN: { label: string; ms: number | null }[] = [
  { label: "1 Stunde", ms: 60 * 60 * 1000 },
  { label: "1 Tag", ms: 24 * 60 * 60 * 1000 },
  { label: "Dauerhaft", ms: null },
];

export function RolesTab() {
  const { profiles, setRole, setBan, can, isAdmin, opUserId } = useRole();
  const canAssignKom = can("komitees.assign");
  const canTimeout = can("mod.timeout");
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
      .filter((p) => !VERSTECKT.includes(p.role))
      .map((p) => ({ p, name: nameFor(p.student_id) }))
      .filter(({ p, name }) => !norm || normalize(`${p.username} ${name ?? ""}`).includes(norm))
      .sort((a, b) =>
        (a.name ?? a.p.username ?? "").localeCompare(b.name ?? b.p.username ?? "", "de"),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, q, students]);

  return (
    <div>
      <Suchfeld wert={q} onChange={setQ} />

      <div className="grid gap-2.5 [&>*]:min-w-0">
        {rows.map(({ p }) => {
          const koms = committeesOf(p.user_id);
          const banned = isBanned(p);
          const geschuetzt = p.is_op || p.user_id === opUserId;
          return (
            <div key={p.user_id} className="card min-w-0 p-4">
              {/* Zeile 1: Person */}
              <KontoZeile
                profil={p}
                student={p.student_id ? students.find((x) => x.id === p.student_id) : null}
                punkt={p.must_change_password === false}
              />

              {/* Zeile 2: Rolle + Komitees + Chat-Sperre nebeneinander */}
              <div className="mt-2.5 flex min-w-0 flex-wrap items-stretch gap-2">
                <select
                  disabled={geschuetzt}
                  title={geschuetzt ? "Diese Rolle kann nicht geändert werden" : undefined}
                  className="h-[42px] w-0 min-w-[8.5rem] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 font-semibold disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800"
                  value={p.role}
                  onChange={(e) => setRole(p.user_id, e.target.value as Role)}
                >
                  {ROLLEN_AUSWAHL
                    .filter((r) => isAdmin || !NUR_ADMIN.includes(r) || p.role === r)
                    .map((r) => {
                      const vergeben = NUR_ADMIN.includes(r) && profiles.some((x) => x.role === r && x.user_id !== p.user_id);
                      return (
                        <option key={r} value={r} disabled={vergeben}>
                          {rolleName(r)}
                          {vergeben ? " (schon vergeben)" : ""}
                        </option>
                      );
                    })}
                </select>

                {canAssignKom && (
                  <div className="relative w-0 min-w-[7rem] flex-1">
                    <button
                      onClick={() => setOpenKom(openKom === p.user_id ? null : p.user_id)}
                      className="flex h-[42px] w-full items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 font-semibold dark:border-slate-700 dark:bg-slate-800"
                    >
                      <span className="truncate text-slate-500 dark:text-slate-300">Komitees</span>
                      {koms.length > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-xs font-bold text-white">{koms.length}</span>
                      )}
                      <span className="ml-auto text-slate-400">▾</span>
                    </button>
                    {openKom === p.user_id && (
                      <>
                        <button className="fixed inset-0 z-20 cursor-default" onClick={() => setOpenKom(null)} aria-label="Schließen" />
                        <div className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
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
                )}

                {canTimeout && !geschuetzt && (
                  <div className={`relative shrink-0 ${canAssignKom ? "" : "ml-auto"}`}>
                    <button
                      onClick={() => (banned ? setBan(p.user_id, null, false) : setOpenBan(openBan === p.user_id ? null : p.user_id))}
                      title={banned ? "Sperre aufheben" : "Vom Chat sperren"}
                      className={`flex h-[42px] w-[42px] items-center justify-center rounded-xl border text-lg transition ${
                        banned
                          ? "border-red-300 bg-red-500/10 text-red-500"
                          : "border-slate-200 text-slate-400 hover:text-slate-600 dark:border-slate-700 dark:hover:text-slate-200"
                      }`}
                    >
                      {banned ? "🚫" : "💬"}
                    </button>
                    {openBan === p.user_id && !banned && (
                      <>
                        <button className="fixed inset-0 z-20 cursor-default" onClick={() => setOpenBan(null)} aria-label="Schließen" />
                        <div className="absolute right-0 z-30 mt-1 w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                          <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Sperren für</div>
                          {DAUERN.map((d) => (
                            <button
                              key={d.label}
                              onClick={() => {
                                setOpenBan(null);
                                void setBan(
                                  p.user_id,
                                  d.ms ? new Date(Date.now() + d.ms).toISOString() : null,
                                  d.ms === null,
                                );
                              }}
                              className="w-full rounded-lg px-2 py-2 text-left text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
                {canTimeout && geschuetzt && (
                  <span
                    title="Dieses Konto kann nicht gesperrt werden"
                    className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-slate-200 text-lg text-slate-400 opacity-40 dark:border-slate-700 ${
                      canAssignKom ? "" : "ml-auto"
                    }`}
                  >
                    💬
                  </span>
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
