import { useEffect, useState } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import { useRole } from "../auth/RoleProvider";
import { KomiteeZugriff } from "./KomiteeZugriff";
import { SkelettKarten } from "./Skelett";
import { Sheet } from "./Sheet";
import type { Profile } from "../auth/RoleProvider";
import { PERM_CATEGORIES, PERM_ROLES, ALL_PERMS, ROLE_DEFAULTS, ROLLE_KURZ, KOMITEE_PERMS, rechteRolle, rollenDerZeile, type PermKey } from "../lib/permissions";
import { COMMITTEES } from "../lib/committees";
import { Schalter } from "./Schalter";

import { meldeFehler } from "../lib/melder";
type Matrix = Record<string, Record<string, boolean>>;

/** Für Rechte, die auch Eltern bekommen können (z. B. Finanzen – Standard). */
const MIT_ELTERN = [...PERM_ROLES, { key: "eltern" as const, label: "Eltern" }];

// Kurzlabels für die Rollen-Pills, damit alle 4 auch auf schmalen Handys nebeneinander passen.


export function PermissionsTab() {
  const { can, isAdmin } = useRole();
  const [roleMatrix, setRoleMatrix] = useState<Matrix>({});
  const [loaded, setLoaded] = useState(false);
  // Kategorien sind zugeklappt – aufklappen, was man ändern will
  const [offen, setOffen] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    (async () => {
      const rm: Matrix = {};
      for (const r of MIT_ELTERN) { rm[r.key] = {}; for (const p of ALL_PERMS) rm[r.key][p] = false; }
      if (!hasSupabase) {
        for (const r of MIT_ELTERN) for (const p of ALL_PERMS) rm[r.key][p] = ROLE_DEFAULTS[r.key].includes(p);
        setRoleMatrix(rm); setLoaded(true); return;
      }
      const { data: rp } = await supabase!.from("role_permissions").select("*");
      for (const row of (rp as { role: string; perm: string; allowed: boolean }[]) || []) {
        const zeile = rechteRolle(row.role); // Stv. fällt mit Sprecher zusammen
        if (rm[zeile]) rm[zeile][row.perm] = row.allowed;
      }
      for (const p of ALL_PERMS) rm["admin"][p] = true; // Admin immer alles
      setRoleMatrix(rm); setLoaded(true);
    })();
  }, []);

  /** Nur Rechte zeigen, die man selbst besitzt – Admin sieht alles. */
  const sichtbar = (perm: PermKey) => isAdmin || can(perm);
  const kategorien = PERM_CATEGORIES.map((c) => ({ ...c, perms: c.perms.filter((p) => sichtbar(p.key)) }))
    .filter((c) => c.perms.length > 0);

  async function toggleRole(roleKey: string, perm: PermKey) {
    if (roleKey === "admin") return;
    const next = !roleMatrix[roleKey]?.[perm];
    setRoleMatrix((m) => ({ ...m, [roleKey]: { ...m[roleKey], [perm]: next } }));
    if (hasSupabase) {
      const { error } = await supabase!
        .from("role_permissions")
        .upsert(rollenDerZeile(roleKey).map((role) => ({ role, perm, allowed: next })));
      if (error) meldeFehler("Speichern fehlgeschlagen: " + error.message);
    }
  }



  if (!loaded)
    return (
      <SkelettKarten n={4} />
    );

  return (
    <div className="space-y-5">
      <p className="text-sm text-tinte-leise">
        Rechte gelten pro Rolle. Ausnahmen für einzelne Personen setzt du unter „Rollen“: Person antippen. Der Admin
        hat immer alle Rechte.
      </p>

      {kategorien.map((cat) => {
        const auf = offen.has(cat.label);
        const an = cat.perms.reduce((n, perm) => n + PERM_ROLES.filter((r) => roleMatrix[r.key]?.[perm.key]).length, 0);
        return (
        <section key={cat.label} className="card overflow-hidden">
          <button
            onClick={() => setOffen((o) => {
              const n = new Set(o);
              if (n.has(cat.label)) n.delete(cat.label); else n.add(cat.label);
              return n;
            })}
            aria-expanded={auf}
            className="flex w-full items-center gap-2 p-4 text-left"
          >
            <span className="text-lg" aria-hidden>{cat.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{cat.label}</span>
              <span className="block text-[12px] text-tinte-leise">
                {cat.perms.length} {cat.perms.length === 1 ? "Recht" : "Rechte"} · {an} Häkchen gesetzt
              </span>
            </span>
            <span className={`text-tinte-leise transition ${auf ? "rotate-90" : ""}`} aria-hidden>›</span>
          </button>
          {auf && (
          <div className="space-y-3.5 border-t border-papier-linie px-4 pb-4 pt-3 dark:border-slate-800">
            {cat.perms.map((perm) => (
              <div key={perm.key}>
                <div className="text-[15px] font-semibold">{perm.label}</div>
                <div className="mb-1.5 text-[11px] leading-snug text-tinte-leise">{perm.desc}</div>
                <div className={`grid grid-cols-3 gap-1.5 ${perm.eltern ? "sm:grid-cols-6" : "sm:grid-cols-5"}`}>
                  {(perm.eltern ? MIT_ELTERN : PERM_ROLES).map((r) => {
                    const on = !!roleMatrix[r.key]?.[perm.key];
                    const locked = r.key === "admin";
                    return (
                      <button
                        key={r.key}
                        disabled={locked}
                        onClick={() => toggleRole(r.key, perm.key)}
                        aria-label={`${perm.label} für ${r.label}`}
                        className={`flex min-w-0 items-center justify-center gap-1 rounded-lg border px-1 py-2 text-center text-[11px] font-bold leading-tight transition ${
                          on ? "border-brand bg-brand text-white" : "border-papier-linie text-tinte-matt dark:border-slate-700"
                        } ${locked ? "opacity-60" : ""}`}
                      >
                        <span className="truncate">{ROLLE_KURZ[r.key] ?? r.label}</span>
                        {on && <span aria-hidden>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          )}
        </section>
        );
      })}

      {can("perms.manage") && <KomiteeRechte />}
      <KomiteeZugriff />
    </div>
  );
}

/** Startwerte wie in supabase/komitees-motto.sql (für die Demo) */
const KOMITEE_START: Record<string, PermKey[]> = {
  abizeitung: ["zitate.pruefen", "rankings.verwalten", "lehrer.verwalten"],
  "motto-pullis": ["motto.verwalten"],
};
const permLabel = (k: PermKey) => PERM_CATEGORIES.flatMap((c) => c.perms).find((p) => p.key === k)?.label ?? k;

/**
 * Komitee-Rechte: ganze Komitees bekommen Verwaltungsrechte zusätzlich zur
 * Rolle (z. B. Abizeitung prüft Zitate). Wer ins Komitee kommt, hat sie
 * sofort; wer rausgeht, verliert sie. Eine persönliche Ausnahme
 * („Verbieten“ unter Rollen → Person) geht trotzdem vor.
 */
function KomiteeRechte() {
  const [m, setM] = useState<Record<string, Set<string>>>({});
  const [auf, setAuf] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSupabase) {
      setM(Object.fromEntries(Object.entries(KOMITEE_START).map(([t, ps]) => [t, new Set<string>(ps)])));
      return;
    }
    void supabase!
      .from("komitee_rechte")
      .select("tag, perm, allowed")
      .then(({ data }) => {
        const neu: Record<string, Set<string>> = {};
        for (const r of (data as { tag: string; perm: string; allowed: boolean }[]) || []) if (r.allowed) (neu[r.tag] ||= new Set()).add(r.perm);
        setM(neu);
      });
  }, []);

  async function setze(tag: string, perm: PermKey, wert: boolean) {
    setM((alt) => {
      const n = new Set(alt[tag] || []);
      if (wert) n.add(perm);
      else n.delete(perm);
      return { ...alt, [tag]: n };
    });
    if (!hasSupabase) return;
    const { error } = await supabase!.from("komitee_rechte").upsert({ tag, perm, allowed: wert }, { onConflict: "tag,perm" });
    if (error) meldeFehler("Speichern fehlgeschlagen: " + error.message);
  }

  return (
    <section className="card overflow-hidden">
      <div className="p-4 pb-2">
        <div className="flex items-center gap-2 font-bold">
          <span aria-hidden className="text-lg">🏷️</span> Komitee-Rechte
        </div>
        <p className="mt-1 text-[12px] leading-snug text-tinte-leise">
          Ganze Komitees bekommen Verwaltungsrechte zusätzlich zur Rolle – z. B. die Abizeitung prüft Zitate. Wer im Komitee ist, hat sie
          sofort. Ausnahmen für einzelne Personen gehen vor.
        </p>
      </div>
      <div className="divide-y divide-papier-linie dark:divide-slate-800">
        {COMMITTEES.map((k) => {
          const an = m[k.slug] || new Set<string>();
          const offen = auf === k.slug;
          return (
            <div key={k.slug}>
              <button onClick={() => setAuf(offen ? null : k.slug)} aria-expanded={offen} className="flex w-full items-center gap-2.5 px-4 py-3 text-left">
                <span aria-hidden>{k.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{k.label}</span>
                  <span className="block truncate text-[12px] text-tinte-leise">
                    {an.size ? KOMITEE_PERMS.filter((p) => an.has(p)).map(permLabel).join(", ") : "Keine zusätzlichen Rechte"}
                  </span>
                </span>
                <span className={`text-tinte-leise transition ${offen ? "rotate-90" : ""}`} aria-hidden>›</span>
              </button>
              {offen && (
                <div className="space-y-1 px-4 pb-3">
                  {KOMITEE_PERMS.map((p) => (
                    <div key={p} className="flex min-h-[44px] items-center gap-3">
                      <span className="min-w-0 flex-1 text-[14px]">{permLabel(p)}</span>
                      <Schalter an={an.has(p)} label={`${permLabel(p)} für ${k.label}`} onChange={(v) => void setze(k.slug, p, v)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TriBtn({ active, label, onClick, tone }: { active: boolean; label: string; onClick: () => void; tone?: "green" | "red" }) {
  const cls = active
    ? tone === "green"
      ? "border-emerald-400 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : tone === "red"
        ? "border-red-300 bg-red-500/10 text-red-500"
        : "border-brand bg-brand text-white"
    : "border-papier-linie text-tinte-matt dark:border-slate-700";
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border px-2 py-2 text-center text-[12px] font-bold leading-none transition active:scale-[.98] ${cls}`}
    >
      {label}
    </button>
  );
}

/**
 * Ausnahmen für eine Person – geöffnet aus „Rollen“ (Person antippen).
 * Je Recht drei Zustände: wie die Rolle (Standard), erlauben, verbieten.
 * Kategorien zugeklappt, damit es übersichtlich bleibt.
 */
export function PersonRechteSheet({ profil, name, onClose }: { profil: Profile; name: string; onClose: () => void }) {
  const { can, isAdmin, opUserId } = useRole();
  const [rolle, setRolle] = useState<Record<string, boolean>>({});
  const [ov, setOv] = useState<Record<string, boolean>>({});
  const [offen, setOffen] = useState<Set<string>>(() => new Set());
  const [bereit, setBereit] = useState(!hasSupabase);
  const geschuetzt = Boolean(profil.is_op) || profil.user_id === opUserId;
  const zeile = rechteRolle(profil.role);

  useEffect(() => {
    if (!hasSupabase) return;
    void (async () => {
      const [{ data: rp }, { data: up }] = await Promise.all([
        supabase!.from("role_permissions").select("perm, allowed").eq("role", profil.role),
        supabase!.from("user_permissions").select("perm, allowed").eq("user_id", profil.user_id),
      ]);
      const r: Record<string, boolean> = {};
      for (const x of (rp as { perm: string; allowed: boolean }[]) || []) r[x.perm] = x.allowed;
      if (zeile === "admin") for (const pk of ALL_PERMS) r[pk] = true;
      const o: Record<string, boolean> = {};
      for (const x of (up as { perm: string; allowed: boolean }[]) || []) o[x.perm] = x.allowed;
      setRolle(r);
      setOv(o);
      setBereit(true);
    })();
  }, [profil.user_id, profil.role, zeile]);

  async function setze(perm: PermKey, val: boolean | null) {
    setOv((o) => {
      const c = { ...o };
      if (val === null) delete c[perm];
      else c[perm] = val;
      return c;
    });
    if (!hasSupabase) return;
    const { error } =
      val === null
        ? await supabase!.from("user_permissions").delete().eq("user_id", profil.user_id).eq("perm", perm)
        : await supabase!.from("user_permissions").upsert({ user_id: profil.user_id, perm, allowed: val });
    if (error) meldeFehler("Speichern fehlgeschlagen: " + error.message);
  }

  const sichtbar = (perm: PermKey) => isAdmin || can(perm);
  const kategorien = PERM_CATEGORIES.map((c) => ({ ...c, perms: c.perms.filter((p) => sichtbar(p.key)) })).filter(
    (c) => c.perms.length > 0,
  );
  const anzahl = Object.keys(ov).length;

  return (
    <Sheet open onClose={onClose}>
      <h2 className="text-[1.375rem] font-bold leading-tight tracking-[-0.02em]">Rechte von {name}</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-tinte-leise">
        Ohne Ausnahme gilt, was die Rolle „{ROLLE_KURZ[zeile] ?? profil.role}“ erlaubt.
        {anzahl > 0 && ` ${anzahl} Ausnahme${anzahl > 1 ? "n" : ""} gesetzt.`}
        {geschuetzt && " Dieses Konto ist geschützt und lässt sich nicht ändern."}
      </p>
      {!bereit ? (
        <div className="mt-4">
          <SkelettKarten n={3} />
        </div>
      ) : (
        <div className="mt-4 grid gap-2.5">
          {kategorien.map((cat) => {
            const auf = offen.has(cat.label);
            const ausn = cat.perms.filter((pp) => ov[pp.key] !== undefined).length;
            return (
              <section key={cat.label} className="overflow-hidden rounded-2xl bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]">
                <button
                  onClick={() =>
                    setOffen((o) => {
                      const n = new Set(o);
                      if (n.has(cat.label)) n.delete(cat.label);
                      else n.add(cat.label);
                      return n;
                    })
                  }
                  aria-expanded={auf}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left"
                >
                  <span aria-hidden>{cat.icon}</span>
                  <span className="min-w-0 flex-1 font-semibold">{cat.label}</span>
                  {ausn > 0 && (
                    <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-bold text-brand">{ausn}</span>
                  )}
                  <span className={`text-tinte-leise transition ${auf ? "rotate-90" : ""}`} aria-hidden>›</span>
                </button>
                {auf && (
                  <div className={`space-y-3 px-4 pb-4 ${geschuetzt ? "pointer-events-none opacity-40" : ""}`}>
                    {cat.perms.map((perm) => {
                      const val = ov[perm.key];
                      const standard = Boolean(rolle[perm.key]);
                      return (
                        <div key={perm.key}>
                          <div className="text-[14px] font-semibold leading-tight">{perm.label}</div>
                          <div className="mb-1.5 text-[11px] leading-snug text-tinte-leise">{perm.desc}</div>
                          <div className="grid grid-cols-3 gap-1.5">
                            <TriBtn
                              active={val === undefined}
                              label={`Wie Rolle (${standard ? "ja" : "nein"})`}
                              onClick={() => void setze(perm.key, null)}
                            />
                            <TriBtn active={val === true} tone="green" label="Erlauben" onClick={() => void setze(perm.key, true)} />
                            <TriBtn active={val === false} tone="red" label="Verbieten" onClick={() => void setze(perm.key, false)} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
      <button className="btn-primary mt-4" onClick={onClose}>
        Fertig
      </button>
    </Sheet>
  );
}
