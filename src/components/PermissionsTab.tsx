import { useEffect, useMemo, useState } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import { useRole } from "../auth/RoleProvider";
import { useStore } from "../store";
import { normalize } from "../lib/logic";
import { KomiteeZugriff } from "./KomiteeZugriff";
import { PERM_CATEGORIES, PERM_ROLES, ALL_PERMS, ROLE_DEFAULTS, type PermKey } from "../lib/permissions";

type Matrix = Record<string, Record<string, boolean>>;

// Kurzlabels für die Rollen-Pills, damit alle 4 auch auf schmalen Handys nebeneinander passen.
const ROLE_SHORT: Record<string, string> = {
  schueler: "Schüler",
  sprecher: "Sprecher",
  stv_sprecher: "Stv.",
  stufenteam: "Team",
  kassenwart: "Kasse",
  admin: "Admin",
};

export function PermissionsTab() {
  const { profiles, can, isAdmin, opUserId } = useRole();
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

  /** Nur Rechte zeigen, die man selbst besitzt – Admin sieht alles. */
  const sichtbar = (perm: PermKey) => isAdmin || can(perm);
  const kategorien = PERM_CATEGORIES.map((c) => ({ ...c, perms: c.perms.filter((p) => sichtbar(p.key)) }))
    .filter((c) => c.perms.length > 0);

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

      {kategorien.map((cat) => (
        <section key={cat.label} className="card p-4">
          <h3 className="mb-3 flex items-center gap-2 font-bold">{cat.icon} {cat.label}</h3>
          <div className="space-y-3.5">
            {cat.perms.map((perm) => (
              <div key={perm.key}>
                <div className="text-[15px] font-semibold">{perm.label}</div>
                <div className="mb-1.5 text-[11px] leading-snug text-slate-400">{perm.desc}</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {PERM_ROLES.map((r) => {
                    const on = !!roleMatrix[r.key]?.[perm.key];
                    const locked = r.key === "admin";
                    return (
                      <button
                        key={r.key}
                        disabled={locked}
                        onClick={() => toggleRole(r.key, perm.key)}
                        aria-label={`${perm.label} für ${r.label}`}
                        className={`flex min-w-0 items-center justify-center gap-1 rounded-lg border px-1 py-2 text-center text-[11px] font-bold leading-tight transition ${
                          on ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-500 dark:border-slate-700"
                        } ${locked ? "opacity-60" : ""}`}
                      >
                        <span className="truncate">{ROLE_SHORT[r.key]}</span>
                        {on && <span aria-hidden>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="card p-4">
        <h3 className="font-bold">Einzelne Personen</h3>
        <p className="mb-3 text-[11px] text-slate-400">Ausnahmen für eine Person. Ohne Auswahl gilt, was die Rolle erlaubt.</p>
        <input className="field mb-3" placeholder="Person suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="space-y-2">
          {rows.map(({ p, name }) => {
            const ov = overrides[p.user_id] || {};
            const count = Object.keys(ov).length;
            const geschuetzt = Boolean(p.is_op) || p.user_id === opUserId;
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
                  <div className="space-y-4 border-t border-slate-100 p-3 dark:border-slate-800">
                    {kategorien.map((cat) => (
                      <div key={cat.label}>
                        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                          {cat.icon} {cat.label}
                        </div>
                        <div className="space-y-2.5">
                          {cat.perms.map((perm) => {
                            const val = ov[perm.key];
                            return (
                              <div key={perm.key}>
                                <div className="mb-1 text-[13px] font-semibold leading-tight">{perm.label}</div>
                                <div className={`grid grid-cols-2 gap-1.5 ${geschuetzt ? "pointer-events-none opacity-40" : ""}`}>
                                  <TriBtn
                                    active={val === true}
                                    tone="green"
                                    label="Erlauben"
                                    onClick={() => setOverride(p.user_id, perm.key, val === true ? null : true)}
                                  />
                                  <TriBtn
                                    active={val === false}
                                    tone="red"
                                    label="Verbieten"
                                    onClick={() => setOverride(p.user_id, perm.key, val === false ? null : false)}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
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

      <KomiteeZugriff />
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
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border px-2 py-2 text-center text-[12px] font-bold leading-none transition active:scale-[.98] ${cls}`}
    >
      {label}
    </button>
  );
}
