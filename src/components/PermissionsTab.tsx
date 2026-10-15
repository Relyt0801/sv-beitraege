import { useEffect, useState } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import { useRole } from "../auth/RoleProvider";
import { KomiteeZugriff } from "./KomiteeZugriff";
import { SkelettKarten } from "./Skelett";
import { Sheet, SheetKopf } from "./Sheet";
import type { Profile } from "../auth/RoleProvider";
import { Gruppe, Symbol, Zeile } from "./Liste";
import { Icon, type IconName } from "./Icon";
import { usePasswortNeu } from "./PasswortNeu";
import { ALLE_KACHEL_PERMS } from "./KachelVerwaltung";
import { PERM_CATEGORIES, PERM_ROLES, ALL_PERMS, ROLE_DEFAULTS, ROLLE_KURZ, KOMITEE_PERMS, permsNachThema, rechteRolle, rollenDerZeile, type PermKey } from "../lib/permissions";
import { COMMITTEES } from "../lib/committees";
import { Schalter } from "./Schalter";

import { meldeFehler } from "../lib/melder";
type Matrix = Record<string, Record<string, boolean>>;

/** Für Rechte, die auch Eltern bekommen können (z. B. Finanzen – Standard). */
const MIT_ELTERN = [...PERM_ROLES, { key: "eltern" as const, label: "Eltern" }];

/**
 * Symbole für die Rechte-Themen – vorher standen hier Emojis (📋 🏷️ 🛡️ …),
 * die neben den Linien-Symbolen der App wie ein Stilbruch wirkten. Die Texte
 * der Themen kommen weiter aus lib/permissions.ts; hier nur das Aussehen.
 */
const KAT_SYMBOL: Record<string, { icon: IconName; farbe: string }> = {
  "Chats & Übersicht": { icon: "chats", farbe: "bg-[#34C759]" },
  Komitees: { icon: "person", farbe: "bg-[#5856D6]" },
  Moderation: { icon: "schild", farbe: "bg-[#FF9500]" },
  Kasse: { icon: "kasse", farbe: "bg-[#32ADE6]" },
  Daten: { icon: "beitraege", farbe: "bg-[#8E8E93]" },
  Finanzen: { icon: "finanzen", farbe: "bg-[#30B0C7]" },
  Termine: { icon: "kalender", farbe: "bg-[#FF3B30]" },
  Abizeitung: { icon: "buch", farbe: "bg-[#A2845E]" },
  Abimotto: { icon: "funke", farbe: "bg-[#FF9500]" },
  Umfragen: { icon: "umfrage", farbe: "bg-brand" },
  Abiball: { icon: "events", farbe: "bg-[#AF52DE]" },
  "Rollen & Rechte": { icon: "rechte", farbe: "bg-[#FF2D55]" },
};
function KatSymbol({ label }: { label: string }) {
  const k = KAT_SYMBOL[label] ?? { icon: "info" as IconName, farbe: "bg-[#8E8E93]" };
  return (
    <Symbol farbe={k.farbe}>
      <Icon name={k.icon} size={16} strich={2.2} />
    </Symbol>
  );
}


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
  // Rechte, die direkt in einer Kachel eingestellt werden (Abimotto, Zitate …),
  // stehen hier nicht mehr – siehe KachelVerwaltung.
  const sichtbar = (perm: PermKey) => (isAdmin || can(perm)) && !ALLE_KACHEL_PERMS.has(perm);
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
      <p className="px-1 text-[13px] leading-snug text-tinte-leise">
        Rechte gelten je Rolle. Ausnahmen für einzelne Personen setzt du unter „Personen“: Person antippen. Der Admin hat
        immer alle Rechte. Wer Abimotto, Zitate, Rankings, Abi-Album und Umfragen verwalten darf, stellst du direkt in der
        jeweiligen Kachel ein (Zahnrad → Wer darf was?).
      </p>

      {kategorien.map((cat) => {
        const auf = offen.has(cat.label);
        return (
          <section key={cat.label} className="gruppe-zellen">
            <button
              onClick={() => setOffen((o) => {
                const n = new Set(o);
                if (n.has(cat.label)) n.delete(cat.label); else n.add(cat.label);
                return n;
              })}
              aria-expanded={auf}
              className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
            >
              <KatSymbol label={cat.label} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{cat.label}</span>
                <span className="block text-[12.5px] text-tinte-leise">
                  {cat.perms.length} {cat.perms.length === 1 ? "Recht" : "Rechte"}
                </span>
              </span>
              <span className={`text-tinte-leise transition ${auf ? "rotate-90" : ""}`} aria-hidden>
                <Icon name="chevron" size={16} strich={2.4} />
              </span>
            </button>
            {auf && (
              <div className="space-y-4 px-4 pb-4 pt-3">
                {cat.perms.map((perm, i) => (
                  <div key={perm.key}>
                    {perm.unter && perm.unter !== cat.perms[i - 1]?.unter && <UnterKopf text={perm.unter} erstes={i === 0} />}
                    <div className="text-[15px] font-semibold">{perm.label}</div>
                    <div className="mb-2 text-[12.5px] leading-snug text-tinte-leise">{perm.desc}</div>
                    <div className={`grid grid-cols-3 gap-1.5 ${perm.eltern ? "sm:grid-cols-6" : "sm:grid-cols-5"}`}>
                      {(perm.eltern ? MIT_ELTERN : PERM_ROLES).map((r) => {
                        const on = !!roleMatrix[r.key]?.[perm.key];
                        const locked = r.key === "admin";
                        return (
                          // Ein = blaue Kapsel mit Haken, aus = graue Kapsel (vorher
                          // stand „aus“ nur als Text da und las sich wie eine Überschrift)
                          <button
                            key={r.key}
                            disabled={locked}
                            onClick={() => toggleRole(r.key, perm.key)}
                            aria-pressed={on}
                            aria-label={`${perm.label} für ${r.label}`}
                            className={`flex min-h-[36px] min-w-0 items-center justify-center gap-1 rounded-full px-2 text-center text-[12px] font-semibold leading-tight transition active:scale-95 ${
                              on
                                ? "bg-brand text-white"
                                : "bg-[rgb(118_118_128/0.12)] text-tinte-matt dark:bg-[rgb(118_118_128/0.24)] dark:text-slate-300"
                            } ${locked ? "opacity-60" : ""}`}
                          >
                            <span className="truncate">{ROLLE_KURZ[r.key] ?? r.label}</span>
                            {on && <Icon name="haken" size={13} strich={3} />}
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
  abizeitung: ["zitate.pruefen", "zitate.runden", "rankings.verwalten", "rankings.runden", "lehrer.verwalten", "album.redigieren", "album.kategorien", "album.moderieren", "funktion.album", "funktion.zitate", "funktion.rankings"],
  "motto-pullis": ["motto.verwalten", "motto.runden", "funktion.motto"],
};
const permLabel = (k: PermKey) => PERM_CATEGORIES.flatMap((c) => c.perms).find((p) => p.key === k)?.label ?? k;

/**
 * Komitee-Rechte: ganze Komitees bekommen Verwaltungsrechte zusätzlich zur
 * Rolle (z. B. Abizeitung prüft Zitate). Wer ins Komitee kommt, hat sie
 * sofort; wer rausgeht, verliert sie. Eine persönliche Ausnahme
 * („Verbieten“ unter Personen → Person) geht trotzdem vor.
 *
 * Die Rechte für Abimotto, Zitate, Rankings, Album und Umfragen stehen in der
 * jeweiligen Kachel (Zahnrad → Wer darf was?) – hier nur der Rest. Der
 * Untertitel jeder Zeile sagt das ehrlich, statt „Rechte in den Kacheln“ zu
 * versprechen und dann trotzdem weitere Rechte aufzuklappen.
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

  // Nur Rechte, die sich nicht in einer Kachel einstellen lassen
  const hierRechte = KOMITEE_PERMS.filter((p) => !ALLE_KACHEL_PERMS.has(p));

  return (
    <Gruppe
      titel="Komitee-Rechte"
      className=""
      fuss="Ganze Komitees bekommen Rechte für ihre Themen. Wer im Komitee ist, hat sie sofort. Ausnahmen für einzelne Personen gehen vor. Rechte für Abimotto, Zitate, Rankings, Album und Umfragen stehen in der jeweiligen Kachel (Zahnrad → Wer darf was?)."
    >
      {COMMITTEES.map((k) => {
        const an = m[k.slug] || new Set<string>();
        const offen = auf === k.slug;
        const hierAn = hierRechte.filter((p) => an.has(p));
        const inKacheln = KOMITEE_PERMS.some((p) => ALLE_KACHEL_PERMS.has(p) && an.has(p));
        return (
          <div key={k.slug}>
            <button
              onClick={() => setAuf(offen ? null : k.slug)}
              aria-expanded={offen}
              className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{k.label}</span>
                <span className="block truncate text-[12.5px] text-tinte-leise">
                  {hierAn.length ? hierAn.map(permLabel).join(", ") : "Keine zusätzlichen Rechte hier"}
                  {inKacheln ? " · weitere in den Kacheln" : ""}
                </span>
              </span>
              <span className={`text-tinte-leise transition ${offen ? "rotate-90" : ""}`} aria-hidden>
                <Icon name="chevron" size={16} strich={2.4} />
              </span>
            </button>
            {offen && (
              <div className="px-4 pb-3">
                {permsNachThema(hierRechte).map((t) => (
                  <div key={t.label} className="mt-1">
                    <div className="pb-0.5 pt-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-tinte-leise">{t.label}</div>
                    {t.gruppen.flatMap((g) => g.perms).map((pp) => (
                      <label key={pp.key} className="flex min-h-[44px] items-center gap-3">
                        <span className="min-w-0 flex-1 text-[15px] leading-snug">{pp.label}</span>
                        <Schalter an={an.has(pp.key)} label={`${pp.label} für ${k.label}`} onChange={(v) => void setze(k.slug, pp.key, v)} />
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </Gruppe>
  );
}

/** Zwischenüberschrift innerhalb eines Themas („Zitatwand“, „Rankings“) */
function UnterKopf({ text, erstes }: { text: string; erstes: boolean }) {
  return (
    <div className={`mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-tinte-leise ${erstes ? "" : "mt-5 border-t border-black/[0.08] pt-3 dark:border-white/10"}`}>
      {text}
    </div>
  );
}

/**
 * Ausnahmen für eine Person – geöffnet aus „Personen“ (Person antippen).
 * Je Recht drei Zustände als Segment: wie die Rolle (Standard), erlauben,
 * verbieten. Themen zugeklappt, damit es übersichtlich bleibt.
 *
 * Oben steht „Konto“ mit dem Passwort-Zurücksetzen (vorher nur im
 * Chat-Sperren-Menü der Personenliste zu finden). Rechte, die sonst in den
 * Kacheln eingestellt werden, stehen getrennt darunter, mit Hinweis.
 */
export function PersonRechteSheet({ profil, name, onClose }: { profil: Profile; name: string; onClose: () => void }) {
  const { can, isAdmin, opUserId, uid } = useRole();
  const pw = usePasswortNeu();
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
  const themen = (nurKachel: boolean) =>
    PERM_CATEGORIES.map((c) => ({
      ...c,
      perms: c.perms.filter((p) => sichtbar(p.key) && ALLE_KACHEL_PERMS.has(p.key) === nurKachel),
    })).filter((c) => c.perms.length > 0);
  const kategorien = themen(false);
  const kachelThemen = themen(true);
  const anzahl = Object.keys(ov).length;

  /** Ein zugeklapptes Thema mit seinen Rechten (Segment je Recht) */
  const thema = (cat: (typeof kategorien)[number]) => {
    const auf = offen.has(cat.label);
    const ausn = cat.perms.filter((pp) => ov[pp.key] !== undefined).length;
    return (
      <section key={cat.label} className="gruppe-zellen">
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
          className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
        >
          <KatSymbol label={cat.label} />
          <span className="min-w-0 flex-1 text-[15px] font-semibold">{cat.label}</span>
          {ausn > 0 && (
            <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[12px] font-bold text-brand-dark dark:text-brand">{ausn}</span>
          )}
          <span className={`text-tinte-leise transition ${auf ? "rotate-90" : ""}`} aria-hidden>
            <Icon name="chevron" size={16} strich={2.4} />
          </span>
        </button>
        {auf && (
          <div className={`space-y-4 px-4 pb-4 pt-2 ${geschuetzt ? "pointer-events-none opacity-40" : ""}`}>
            {cat.perms.map((perm, i) => {
              const val = ov[perm.key];
              const standard = Boolean(rolle[perm.key]);
              return (
                <div key={perm.key}>
                  {perm.unter && perm.unter !== cat.perms[i - 1]?.unter && <UnterKopf text={perm.unter} erstes={i === 0} />}
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 text-[15px] font-semibold leading-tight">{perm.label}</span>
                    <span className="shrink-0 text-[12.5px] text-tinte-leise">Rolle: {standard ? "ja" : "nein"}</span>
                  </div>
                  <div className="mb-2 mt-0.5 text-[12.5px] leading-snug text-tinte-leise">{perm.desc}</div>
                  {/* Segment wie überall in der App (graue Bahn, weißer Daumen) */}
                  <div className="seg" role="radiogroup" aria-label={`${perm.label} für ${name}`}>
                    <button role="radio" aria-checked={val === undefined} onClick={() => void setze(perm.key, null)} className={`seg-item ${val === undefined ? "seg-aktiv" : ""}`}>
                      Wie Rolle
                    </button>
                    <button
                      role="radio"
                      aria-checked={val === true}
                      onClick={() => void setze(perm.key, true)}
                      className={`seg-item ${val === true ? "seg-aktiv !text-bezahlt dark:!text-emerald-300" : ""}`}
                    >
                      Erlauben
                    </button>
                    <button
                      role="radio"
                      aria-checked={val === false}
                      onClick={() => void setze(perm.key, false)}
                      className={`seg-item ${val === false ? "seg-aktiv !text-red-600 dark:!text-red-400" : ""}`}
                    >
                      Verbieten
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  return (
    <Sheet open onClose={onClose}>
      <SheetKopf
        titel={`Rechte von ${name}`}
        unter={
          <>
            Ohne Ausnahme gilt, was die Rolle „{ROLLE_KURZ[zeile] ?? profil.role}“ erlaubt.
            {anzahl > 0 && ` ${anzahl} Ausnahme${anzahl > 1 ? "n" : ""} gesetzt.`}
            {geschuetzt && " Dieses Konto ist geschützt und lässt sich nicht ändern."}
          </>
        }
        onClose={onClose}
      />

      {/* Konto: Passwort zurücksetzen – für den Admin, nie für das geschützte Konto */}
      {pw.darf && !geschuetzt && profil.user_id !== uid && (
        <Gruppe titel="Konto" className="mb-5" fuss="Erzeugt ein neues Startpasswort. Die Person muss es beim nächsten Anmelden ändern.">
          <Zeile
            label={pw.busy ? "Wird erzeugt …" : "Passwort zurücksetzen"}
            blau
            onClick={() => void pw.zuruecksetzen(profil.user_id, name)}
            symbol={
              <Symbol farbe="bg-[#8E8E93]">
                <Icon name="schluessel" size={16} strich={2.2} />
              </Symbol>
            }
          />
        </Gruppe>
      )}
      {pw.anzeige}

      {!bereit ? (
        <div className="mt-4">
          <SkelettKarten n={3} />
        </div>
      ) : (
        <>
          <h3 className="abschnitt">Rechte</h3>
          <div className="grid gap-2.5">{kategorien.map(thema)}</div>

          {kachelThemen.length > 0 && (
            <>
              <h3 className="abschnitt mt-6">Rechte aus den Kacheln</h3>
              <div className="grid gap-2.5">{kachelThemen.map(thema)}</div>
              <p className="mt-1.5 px-4 text-[13px] leading-snug text-tinte-leise">
                Für Rollen und Komitees stellst du diese Rechte direkt in der Kachel ein (Zahnrad → Wer darf was?). Hier legst du nur eine Ausnahme für {name} fest.
              </p>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}
