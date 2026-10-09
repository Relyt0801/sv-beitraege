import { useCallback, useEffect, useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { Schalter } from "./Schalter";
import { useRole } from "../auth/RoleProvider";
import { hasSupabase, supabase } from "../lib/supabase";
import { FUNKTIONEN, FUNKTION_THEMEN, darfSchalten, useFunktionen, type FunktionKey } from "../lib/funktionen";
import { Icon, type IconName } from "./Icon";
import { WortfilterSchalter } from "./AutorInfo";
import type { WfBereich } from "../lib/wortfilter-bereiche";

const SYMBOL: Record<FunktionKey, { icon: IconName; farbe: string }> = {
  album: { icon: "buch", farbe: "bg-[#FF2D55]" },
  spotify: { icon: "events", farbe: "bg-[#34C759]" },
  zitate: { icon: "zitat", farbe: "bg-[#A2845E]" },
  rankings: { icon: "pokal", farbe: "bg-[#32ADE6]" },
  motto: { icon: "funke", farbe: "bg-[#FF9500]" },
  umfragen: { icon: "umfrage", farbe: "bg-brand" },
  abiball: { icon: "kasse", farbe: "bg-[#8E8E93]" },
};
/** Welche Wortfilter-Bereiche gehören zur Funktion? */
const WF: Record<FunktionKey, WfBereich[]> = {
  album: ["steckbrief", "kommentare"],
  spotify: [],
  zitate: ["zitate"],
  rankings: ["rankings"],
  motto: ["motto"],
  umfragen: ["umfragen"],
  abiball: [],
};
import { rolleName, type PermKey } from "../lib/permissions";
import { melde, meldeFehler } from "../lib/melder";
import { KategorienSheet, useAlbumOptional } from "./Album";
import { LehrerListe, RankingVerwaltungSheet } from "./Rankings";
import { UmfragenSheet } from "./Umfragen";

/** Welches Recht braucht man, um die Funktion zu nutzen? */
const NUTZEN: Partial<Record<FunktionKey, PermKey>> = {
  album: "album.nutzen",
  zitate: "zitate.nutzen",
  rankings: "rankings.nutzen",
  motto: "motto.nutzen",
};
/** „Alle Schüler und das Team“ – diese Rollen setzt der Schnell-Schalter */
const ALLE: string[] = ["schueler", "sprecher", "stv_sprecher", "stufenteam", "kassenwart"];

type Fenster = null | "steckbrief" | "lehrer" | "rankings" | "umfragen";

/**
 * Profil → Funktionen: ganze Bereiche für alle an/aus. Darunter je Bereich,
 * wer ihn nutzen darf (mit Schnell-Schalter für alle Schüler und das Team),
 * und die Einstellungen dazu – damit nichts mehr gesucht werden muss.
 */
export function FunktionenSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { an, setzen } = useFunktionen();
  const { can } = useRole();
  const album = useAlbumOptional();
  const [fenster, setFenster] = useState<Fenster>(null);
  // perm -> Rollen, die es dürfen
  const [rollen, setRollen] = useState<Record<string, string[]>>({});

  const rechteLaden = useCallback(async () => {
    if (!hasSupabase) {
      setRollen(Object.fromEntries(Object.values(NUTZEN).map((p) => [p!, ALLE])));
      return;
    }
    const { data } = await supabase!
      .from("role_permissions")
      .select("role, perm, allowed")
      .in("perm", Object.values(NUTZEN) as string[])
      .eq("allowed", true);
    const m: Record<string, string[]> = {};
    for (const r of (data as { role: string; perm: string }[]) || []) (m[r.perm] ||= []).push(r.role);
    setRollen(m);
  }, []);

  useEffect(() => {
    if (open) void rechteLaden();
  }, [open, rechteLaden]);

  async function fuerAlle(perm: PermKey, wert: boolean) {
    if (!hasSupabase) return setRollen((r) => ({ ...r, [perm]: wert ? ALLE : [] }));
    const { error } = await supabase!.from("role_permissions").upsert(
      ALLE.map((role) => ({ role, perm, allowed: wert })),
      { onConflict: "role,perm" },
    );
    if (error) return meldeFehler("Ging nicht: " + error.message);
    await rechteLaden();
    melde(wert ? "Für alle Schüler und das Team freigegeben" : "Nur noch Admin", "erfolg");
  }

  const links: Record<FunktionKey, { l: string; f: Fenster; darf: boolean }[]> = {
    abiball: [],
    album: [{ l: "Steckbrief-Kategorien", f: "steckbrief", darf: Boolean(album) && can("album.kategorien") }],
    zitate: [{ l: "Lehrerliste", f: "lehrer", darf: can("lehrer.verwalten") }],
    rankings: [{ l: "Ranking-Kategorien & Lehrer", f: "rankings", darf: can("rankings.verwalten") || can("lehrer.verwalten") }],
    spotify: [],
    motto: [],
    umfragen: [{ l: "Umfragen verwalten", f: "umfragen", darf: can("umfragen.verwalten") || can("umfragen.ergebnisse") }],
  };

  const sichtbareThemen = FUNKTION_THEMEN.map((t) => ({ ...t, funktionen: t.funktionen.filter((k) => darfSchalten(can, k)) })).filter((t) => t.funktionen.length > 0);

  return (
    <>
      <Sheet open={open && !fenster} onClose={onClose}>
        <SheetKopf titel="Funktionen" unter="Nach Thema sortiert. Antippen klappt auf: an/aus, wer es nutzen darf, Wortfilter und Einstellungen." onClose={onClose} />
        <div className="space-y-2.5">
          {sichtbareThemen.map((t) => {
            const anZahl = t.funktionen.filter((k) => an[k]).length;
            return (
              <details key={t.titel} className="card group overflow-hidden" open={sichtbareThemen.length === 1}>
                <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-semibold">{t.titel}</span>
                    <span className="block text-[12.5px] text-tinte-leise">{t.text}</span>
                  </span>
                  <span className="text-[13px] text-tinte-leise">
                    {anZahl} von {t.funktionen.length} an
                  </span>
                  <span className="text-tinte-leise transition group-open:rotate-90" aria-hidden>
                    <Icon name="chevron" size={16} />
                  </span>
                </summary>
                <div className="divide-y divide-black/[0.06] border-t border-black/[0.06] dark:divide-white/[0.08] dark:border-white/[0.08]">
                  {t.funktionen.map((k) => {
                    const f = FUNKTIONEN.find((x) => x.key === k)!;
                    const perm = NUTZEN[k];
                    const wer = perm ? rollen[perm] || [] : [];
                    const alleDa = perm ? ALLE.every((r) => wer.includes(r)) : false;
                    const verwalten = links[k].filter((x) => x.darf);
                    const sym = SYMBOL[k];
                    return (
                      <div key={k} className="px-4 py-3">
                        <label className="flex items-center gap-3">
                          <span aria-hidden className={`symbol ${sym.farbe}`}>
                            <Icon name={sym.icon} size={17} strich={2.2} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-semibold">{f.titel}</span>
                            <span className="block text-[12.5px] leading-snug text-tinte-leise">{f.text}</span>
                          </span>
                          <Schalter
                            an={an[k]}
                            label={f.titel}
                            onChange={async (v) => {
                              const fehler = await setzen(k, v);
                              if (fehler) meldeFehler("Ging nicht: " + fehler);
                              else melde(`${f.titel} ${v ? "an" : "aus"}`, "erfolg");
                            }}
                          />
                        </label>
                        {(perm || WF[k].length > 0 || verwalten.length > 0) && (
                          <div className="ml-[42px] mt-2 space-y-2">
                            {perm && (
                              <div className="flex min-h-[36px] items-center gap-3">
                                <span className="min-w-0 flex-1 text-[13px] leading-snug">
                                  <span className="font-semibold">Nutzen dürfen: </span>
                                  <span className="text-tinte-matt dark:text-slate-300">
                                    {alleDa ? "alle Schüler und das Team" : wer.length ? wer.map(rolleName).join(", ") : "nur Admin"}
                                  </span>
                                </span>
                                {can("perms.manage") && <Schalter an={alleDa} label={`${f.titel}: alle Schüler und das Team`} onChange={(v) => void fuerAlle(perm, v)} />}
                              </div>
                            )}
                            {WF[k].map((b) => (
                              <WortfilterSchalter key={b} bereich={b} kompakt />
                            ))}
                            {verwalten.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {verwalten.map((x) => (
                                  <button key={x.l} onClick={() => setFenster(x.f)} className="btn-klein-grau !min-h-[2rem] !px-3 !text-[13px]">
                                    {x.l}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
        <p className="mt-3 px-1 text-[12px] leading-snug text-tinte-leise">
          Ausgeschaltetes sehen nur, wer es schalten darf (mit Hinweis). Einzelne Bereiche lassen sich Komitees geben: Rollen &amp; Rechte → Rechte → Komitee-Rechte.
        </p>
      </Sheet>

      {album && <KategorienSheet open={open && fenster === "steckbrief"} album={album} onClose={() => setFenster(null)} />}
      <Sheet open={open && fenster === "lehrer"} onClose={() => setFenster(null)}>
        <SheetKopf titel="Lehrerliste" unter="Zum Auswählen bei Zitaten und im Lehrer-Ranking." onClose={() => setFenster(null)} />
        <LehrerListe aktiv={open && fenster === "lehrer"} />
      </Sheet>
      <RankingVerwaltungSheet open={open && fenster === "rankings"} onClose={() => setFenster(null)} />
      <UmfragenSheet open={open && fenster === "umfragen"} onClose={() => setFenster(null)} />
    </>
  );
}
