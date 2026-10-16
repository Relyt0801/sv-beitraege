import { useEffect, useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { Gruppe } from "./Liste";
import { Schalter } from "./Schalter";
import { hasSupabase, supabase } from "../lib/supabase";
import { meldeFehler } from "../lib/melder";
import { useRole } from "../auth/RoleProvider";
import { COMMITTEES } from "../lib/committees";
import { ALL_PERMS, KOMITEE_PERMS, PERM_CATEGORIES, PERM_ROLES, ROLE_DEFAULTS, rollenDerZeile, type PermDef, type PermKey } from "../lib/permissions";

/**
 * „Wer darf hier was?“ – direkt in der Kachel statt unter Rollen → Rechte je Rolle.
 *
 * Zeigt für die Rechte eines Bereichs (z. B. motto.verwalten, motto.runden,
 * funktion.motto), welche Rollen und Komitees sie haben, und lässt sie
 * umschalten. Gleiche Tabellen wie „Rechte je Rolle“ (role_permissions,
 * komitee_rechte) – nur nach Kachel sortiert. Sichtbar für Admins und wer
 * „Berechtigungen vergeben“ darf.
 *
 * Die Rechte der Kacheln, die „Wer darf was?“ wirklich eingebaut haben
 * (IN_KACHEL_EINSTELLBAR), blendet „Rechte je Rolle“ aus, damit es
 * übersichtlich bleibt.
 */
export const KACHEL_PERMS: Record<string, PermKey[]> = {
  motto: ["motto.nutzen", "motto.verwalten", "motto.runden", "funktion.motto"],
  zitate: ["zitate.nutzen", "zitate.pruefen", "zitate.runden", "funktion.zitate"],
  rankings: ["rankings.nutzen", "rankings.verwalten", "rankings.runden", "lehrer.verwalten", "funktion.rankings"],
  album: ["album.nutzen", "album.kategorien", "album.moderieren", "album.redigieren", "funktion.album", "funktion.spotify"],
  umfragen: ["umfragen.verwalten", "umfragen.ergebnisse", "umfragen.runden", "funktion.umfragen"],
};
export const ALLE_KACHEL_PERMS = new Set<PermKey>(Object.values(KACHEL_PERMS).flat());

/**
 * Nur diese Kacheln haben „Wer darf was?“ wirklich eingebaut (Motto.tsx,
 * Zitate.tsx, Rankings.tsx). Album und Umfragen (noch) nicht – ihre Rechte
 * bleiben deshalb unter „Rechte je Rolle“, in den Komitee-Rechten und bei
 * den Ausnahmen je Person. Kommt <KachelVerwaltung kachel="album" /> bzw.
 * "umfragen" dazu, die Kachel hier ergänzen.
 */
export const IN_KACHEL_EINSTELLBAR = new Set<PermKey>([...KACHEL_PERMS.motto, ...KACHEL_PERMS.zitate, ...KACHEL_PERMS.rankings]);

const ROLLEN = PERM_ROLES.filter((r) => r.key !== "admin");
const DEFS = new Map<PermKey, PermDef>(PERM_CATEGORIES.flatMap((c) => c.perms.map((p) => [p.key, p] as const)));

type Stand = { rollen: Record<string, Set<string>>; komitees: Record<string, Set<string>> };

function useRechteStand(offen: boolean) {
  const [stand, setStand] = useState<Stand | null>(null);
  useEffect(() => {
    if (!offen) return;
    (async () => {
      const rollen: Record<string, Set<string>> = {};
      const komitees: Record<string, Set<string>> = {};
      if (!hasSupabase) {
        for (const r of ROLLEN) rollen[r.key] = new Set(ROLE_DEFAULTS[r.key] || []);
        setStand({ rollen, komitees });
        return;
      }
      const [{ data: rp }, { data: kr }] = await Promise.all([
        supabase!.from("role_permissions").select("role, perm, allowed"),
        supabase!.from("komitee_rechte").select("tag, perm, allowed"),
      ]);
      for (const r of ROLLEN) rollen[r.key] = new Set();
      for (const row of (rp as { role: string; perm: string; allowed: boolean }[]) || []) {
        const k = row.role === "stv_sprecher" ? "sprecher" : row.role;
        if (row.allowed && rollen[k]) rollen[k].add(row.perm);
      }
      for (const row of (kr as { tag: string; perm: string; allowed: boolean }[]) || []) if (row.allowed) (komitees[row.tag] ||= new Set()).add(row.perm);
      setStand({ rollen, komitees });
    })();
  }, [offen]);
  return [stand, setStand] as const;
}

/** Zeile(n) „Verwaltung“ für ein Einstellungs-Blatt. */
export function KachelVerwaltung({ kachel, titel = "Wer darf was?" }: { kachel: keyof typeof KACHEL_PERMS; titel?: string }) {
  const { isAdmin, can } = useRole();
  const [auf, setAuf] = useState<PermKey | null>(null);
  const [stand, setStand] = useRechteStand(true);
  if (!isAdmin && !can("perms.manage")) return null;
  const perms = KACHEL_PERMS[kachel].filter((p) => ALL_PERMS.includes(p));

  const wer = (p: PermKey): string => {
    if (!stand) return "…";
    const r = ROLLEN.filter((x) => stand.rollen[x.key]?.has(p)).map((x) => x.label);
    const k = COMMITTEES.filter((x) => stand.komitees[x.slug]?.has(p)).map((x) => x.label);
    const alle = [...r, ...k];
    return alle.length ? alle.join(", ") : "nur Admin";
  };

  async function setzeRolle(rolle: string, perm: PermKey, wert: boolean) {
    setStand((s) => {
      if (!s) return s;
      const n = new Set(s.rollen[rolle] || []);
      if (wert) n.add(perm);
      else n.delete(perm);
      return { ...s, rollen: { ...s.rollen, [rolle]: n } };
    });
    if (!hasSupabase) return;
    const { error } = await supabase!.from("role_permissions").upsert(rollenDerZeile(rolle).map((role) => ({ role, perm, allowed: wert })));
    if (error) meldeFehler("Speichern fehlgeschlagen: " + error.message);
  }
  async function setzeKomitee(tag: string, perm: PermKey, wert: boolean) {
    setStand((s) => {
      if (!s) return s;
      const n = new Set(s.komitees[tag] || []);
      if (wert) n.add(perm);
      else n.delete(perm);
      return { ...s, komitees: { ...s.komitees, [tag]: n } };
    });
    if (!hasSupabase) return;
    const { error } = await supabase!.from("komitee_rechte").upsert({ tag, perm, allowed: wert }, { onConflict: "tag,perm" });
    if (error) meldeFehler("Speichern fehlgeschlagen: " + error.message);
  }

  const def = auf ? DEFS.get(auf) : null;
  return (
    <>
      <Gruppe titel={titel} fuss="Admins dürfen immer alles. Ausnahmen für einzelne Personen: Rollen → Personen → Person antippen.">
        {perms.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setAuf(p)}
            className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px]">{DEFS.get(p)?.label || p}</span>
              <span className="block truncate text-[12.5px] text-tinte-leise">{wer(p)}</span>
            </span>
            <span aria-hidden className="shrink-0 text-[17px] leading-none text-tinte-leise">›</span>
          </button>
        ))}
      </Gruppe>

      <Sheet open={!!auf} onClose={() => setAuf(null)}>
        {auf && def && (
          <>
            <SheetKopf titel={def.label} unter={def.desc} onClose={() => setAuf(null)} />
            <Gruppe titel="Rollen" className="">
              {ROLLEN.map((r) => (
                <label key={r.key} className="flex min-h-[48px] items-center gap-3 px-4 py-2">
                  <span className="flex-1 text-[15px]">{r.label}</span>
                  <Schalter an={!!stand?.rollen[r.key]?.has(auf)} onChange={(v) => void setzeRolle(r.key, auf, v)} label={r.label} />
                </label>
              ))}
            </Gruppe>
            {KOMITEE_PERMS.includes(auf) && (
              <Gruppe titel="Komitees" fuss="Wer im Komitee ist, hat das Recht sofort.">
                {COMMITTEES.filter((c) => !c.teamOnly).map((c) => (
                  <label key={c.slug} className="flex min-h-[48px] items-center gap-3 px-4 py-2">
                    <span className="flex-1 text-[15px]">{c.label}</span>
                    <Schalter an={!!stand?.komitees[c.slug]?.has(auf)} onChange={(v) => void setzeKomitee(c.slug, auf, v)} label={c.label} />
                  </label>
                ))}
              </Gruppe>
            )}
          </>
        )}
      </Sheet>
    </>
  );
}
