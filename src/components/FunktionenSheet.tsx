import { useCallback, useEffect, useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { Schalter } from "./Schalter";
import { useRole } from "../auth/RoleProvider";
import { hasSupabase, supabase } from "../lib/supabase";
import { FUNKTIONEN, useFunktionen, type FunktionKey } from "../lib/funktionen";
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
    umfragen: [{ l: "Umfragen verwalten", f: "umfragen", darf: can("umfragen.verwalten") || can("umfragen.ergebnisse") }],
  };

  return (
    <>
      <Sheet open={open && !fenster} onClose={onClose}>
        <SheetKopf titel="Funktionen" unter="Schaltet Bereiche für alle an oder aus. Darunter: wer sie nutzen darf und die Einstellungen dazu." onClose={onClose} />
        <div className="space-y-3">
          {FUNKTIONEN.map((f) => {
            const perm = NUTZEN[f.key];
            const wer = perm ? rollen[perm] || [] : [];
            const alleDa = perm ? ALLE.every((r) => wer.includes(r)) : false;
            const verwalten = links[f.key].filter((x) => x.darf);
            return (
              <div
                key={f.key}
                className={`overflow-hidden rounded-2xl transition ${
                  an[f.key] ? "bg-[#34C759]/10 dark:bg-[#30D158]/15" : "bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]"
                }`}
              >
                <label className="flex items-center gap-3 px-4 py-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[20px] shadow-sm dark:bg-slate-800">{f.zeichen}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{f.titel}</span>
                    <span className="block text-[12.5px] leading-snug text-tinte-leise">{f.text}</span>
                  </span>
                  <Schalter
                    an={an[f.key]}
                    label={f.titel}
                    onChange={async (v) => {
                      const fehler = await setzen(f.key, v);
                      if (fehler) meldeFehler("Ging nicht: " + fehler);
                      else melde(`${f.titel} ${v ? "an" : "aus"}`, "erfolg");
                    }}
                  />
                </label>
                {perm && (
                  <div className="flex items-center gap-3 border-t border-black/[0.06] px-4 py-2.5 dark:border-white/[0.08]">
                    <span className="min-w-0 flex-1 text-[13px] leading-snug">
                      <span className="font-semibold">Nutzen dürfen: </span>
                      <span className="text-tinte-matt dark:text-slate-300">
                        {alleDa ? "alle Schüler und das Team" : wer.length ? wer.map(rolleName).join(", ") : "nur Admin"}
                      </span>
                    </span>
                    {can("perms.manage") && <Schalter an={alleDa} label={`${f.titel}: alle Schüler und das Team`} onChange={(v) => void fuerAlle(perm, v)} />}
                  </div>
                )}
                {verwalten.length > 0 && (
                  <div className="flex flex-wrap gap-2 border-t border-black/[0.06] px-4 py-2.5 dark:border-white/[0.08]">
                    {verwalten.map((x) => (
                      <button
                        key={x.l}
                        onClick={() => setFenster(x.f)}
                        className="rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-brand-dark shadow-sm transition active:scale-95 dark:bg-slate-800 dark:text-brand"
                      >
                        {x.l} ›
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 px-1 text-[12px] leading-snug text-tinte-leise">
          Ausgeschaltetes siehst nur du (mit Hinweis). Feinere Rechte (z. B. wer Zitate prüft) stehen unter Rollen &amp; Rechte → Abizeitung.
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
