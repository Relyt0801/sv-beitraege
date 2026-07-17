import { useEffect, useMemo, useState } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import { useRole } from "../auth/RoleProvider";
import { useStore } from "../store";
import { normalize } from "../lib/logic";
import { PERM_CATEGORIES, PERM_ROLES, ALL_PERMS, ROLE_DEFAULTS, type PermKey } from "../lib/permissions";

type Matrix = Record<string, Record<string, boolean>>;

export function PermissionsTab() {
  const { profiles } = useRole();
  const { students } = useStore();
  const [roleMatrix, setRoleMatrix] = useState<Matrix>({});
  const [overrides, setOverrides] = useState<Record<string, Record<string, boolean>>>({});
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [openUser, setOpenUser] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const rm: Matrix = {};
      for (const r of PERM_ROLES) { rm[r.key] = {}; for (const p of ALL_PERMS) rm[r.key][p] = false; }
      if (!hasSupabase) {
        for (const r of PERM_ROLES) for (const p of ALL_PERMS) rm[r.key][p] = ROLE_DEFAULTS[r.key].includes(p);
        setRoleMatrix(rm); setOverrides({}); setLoaded(true); return;
      }
      const { data: rp } = await supabase!.from("role_permissions").select("*");
      for (const row of (rp as { role: string; perm: string; allowed: boolean }[]) || []) if (rm[row.role]) rm[row.role][row.perm] = row.allowed;
      for (const p of ALL_PERMS) rm["admin"][p] = true; // Admin immer alles
      const { data: up } = await supabase!.from("user_permissions").select("*");
      const uo: Record<string, Record<string, boolean>> = {};
      for (const row of (up as { user_id: string; perm: string; allowed: boolean }[]) || []) (uo[row.user_id] ||= {})[row.perm] = row.allowed;
      setRoleMatrix(rm); setOverrides(uo); setLoaded(true);
    })();
  }, []);

  const nameFor = (sid: string | null) => {
    const s = sid ? students.find((x) => x.id === sid) : null;
    return s ? `${s.nachname}, ${s.vorname}` : null;
  };

  async function toggleRole(roleKey: string, perm: PermKey) {
    if (roleKey === "admin") return;
    const next = !roleMatrix[roleKey]?.[perm];
    setRoleMatrix((m) => ({ ...m, [roleKey]: { ...m[roleKey], [perm]: next } }));
    if (hasSupabase) {
      const { error } = await supabase!.from("role_permissions").upsert({ role: roleKey, perm, allowed: next });
      if (error) alert("Speichern fehlgeschlagen: " + error.message);
    }
  }

  async function setOverride(userId: string, perm: PermKey, val: boolean | null) {
    setOverrides((o) => {
      const c = { ...(o[userId] || {}) };
      if (val === null) delete c[perm]; else c[perm] = val;
      return { ...o, [userId]: c };
    });
    if (hasSupabase) {
      if (val === null) await supabase!.from("user_permissions").delete().eq("user_id", userId).eq("perm", perm);
      else await supabase!.from("user_permissions").upsert({ user_id: userId, perm, allowed: val });
    }
  }

  const rows = useMemo(() => {
    const norm = normalize(q);
    return [...profiles]
      .map((p) => ({ p, name: nameFor(p.student_id) }))
      .filter(({ p, name }) => !norm || normalize(`${p.username} ${name ?? ""}`).includes(norm))
      .sort((a, b) => (a.name ?? a.p.username ?? "").localeCompare(b.name ?? b.p.username ?? "", "de"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, q, students]);

  if (!loaded)
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-slate-400">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-300 border-t-brand dark:border-slate-700 dark:border-t-brand" />
        <div className="text-sm font-medium">Berechtigungen werden geladen …</div>
      </div>
    );

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-400">Rechte gelten pro Rolle. Für einzelne Personen kannst du unten Ausnahmen setzen – die überschreiben die Rolle. Der Admin hat immer alle Rechte.</p>

      {PERM_CATEGORIES.map((cat) => (
        <section key={cat.label} className="card p-4">
          <h3 className="mb-3 flex items-center gap-2 font-bold">{cat.icon} {cat.label}</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="sticky left-0 z-10 bg-white py-1 text-left dark:bg-slate-900">Recht</th>
                  {PERM_ROLES.map((r) => <th key={r.key} className="px-1.5 text-center font-bold">{r.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {cat.perms.map((perm) => (
                  <tr key={perm.key} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="sticky left-0 z-10 min-w-[160px] max-w-[220px] bg-white py-2 pr-3 dark:bg-slate-900">
                      <div className="font-semibold">{perm.label}</div>
                      <div className="text-[11px] text-slate-400">{perm.desc}</div>
                    </td>
                    {PERM_ROLES.map((r) => {
                      const on = !!roleMatrix[r.key]?.[perm.key];
                      const locked = r.key === "admin";
                      return (
                        <td key={r.key} className="px-1.5 text-center align-middle">
                          <button
                            disabled={locked}
                            onClick={() => toggleRole(r.key, perm.key)}
                            aria-label={`${perm.label} für ${r.label}`}
                            className={`mx-auto flex h-7 w-7 items-center justify-center rounded-lg border text-sm font-bold transition ${
                              on ? "border-brand bg-brand text-white" : "border-slate-200 text-transparent dark:border-slate-700"
                            } ${locked ? "opacity-60" : ""}`}
                          >
                            ✓
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="card p-4">
        <h3 className="font-bold">Einzelne Personen</h3>
        <p className="mb-3 text-[11px] text-slate-400">Ausnahmen für eine Person – „Standard" folgt der Rolle.</p>
        <input className="field mb-3" placeholder="Person suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="space-y-2">
          {rows.map(({ p, name }) => {
            const ov = overrides[p.user_id] || {};
            const count = Object.keys(ov).length;
            return (
              <div key={p.user_id} className="rounded-xl border border-slate-200 dark:border-slate-700">
                <button onClick={() => setOpenUser(openUser === p.user_id ? null : p.user_id)} className="flex w-full items-center gap-2 p-3 text-left">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{name ?? p.username}</div>
                    <div className="truncate text-[11px] text-slate-400">{p.username} · Rolle: {p.role}</div>
                  </div>
                  {count > 0 && <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-bold text-brand">{count} Ausnahme{count > 1 ? "n" : ""}</span>}
                  <span className="text-slate-400">{openUser === p.user_id ? "▲" : "▼"}</span>
                </button>
                {openUser === p.user_id && (
                  <div className="space-y-3 border-t border-slate-100 p-3 dark:border-slate-800">
                    {PERM_CATEGORIES.map((cat) => (
                      <div key={cat.label}>
                        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{cat.icon} {cat.label}</div>
                        {cat.perms.map((perm) => {
                          const val = ov[perm.key];
                          const roleHas = !!roleMatrix[p.role]?.[perm.key];
                          return (
                            <div key={perm.key} className="mb-1.5 flex flex-wrap items-center gap-2">
                              <span className="flex-1 text-sm">{perm.label}</span>
                              <div className="flex gap-1">
                                <TriBtn active={val === undefined} label={`Standard (${roleHas ? "an" : "aus"})`} onClick={() => setOverride(p.user_id, perm.key, null)} />
                                <TriBtn active={val === true} tone="green" label="Erlauben" onClick={() => setOverride(p.user_id, perm.key, true)} />
                                <TriBtn active={val === false} tone="red" label="Verbieten" onClick={() => setOverride(p.user_id, perm.key, false)} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {rows.length === 0 && <div className="py-8 text-center text-sm text-slate-400">Keine Person gefunden.</div>}
        </div>
      </section>
    </div>
  );
}

function TriBtn({ active, label, onClick, tone }: { active: boolean; label: string; onClick: () => void; tone?: "green" | "red" }) {
  const cls = active
    ? tone === "green"
      ? "border-emerald-400 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : tone === "red"
        ? "border-red-300 bg-red-500/10 text-red-500"
        : "border-brand bg-brand text-white"
    : "border-slate-200 text-slate-500 dark:border-slate-700";
  return <button onClick={onClick} className={`rounded-lg border px-2 py-1 text-[11px] font-bold transition ${cls}`}>{label}</button>;
}
