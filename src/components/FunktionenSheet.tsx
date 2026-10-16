import { useCallback, useEffect, useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { Schalter } from "./Schalter";
import { useRole } from "../auth/RoleProvider";
import { hasSupabase, supabase } from "../lib/supabase";
import { FUNKTIONEN, FUNKTION_THEMEN, darfSchalten, useFunktionen, type FunktionKey } from "../lib/funktionen";
import { Icon, type IconName } from "./Icon";
import { WortfilterSchalter } from "./AutorInfo";
import { WF_BEREICHE, useWfRecht, type WfBereich } from "../lib/wortfilter-bereiche";
import { Gruppe, Wert, Zeile } from "./Liste";

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
/** Ein einzelner Wortfilter unter einer Funktion: sagen, welchen Teil er schaltet */
function wfTitel(b: WfBereich): string {
  const t = WF_BEREICHE.find((x) => x.key === b)?.titel || "";
  return t.includes("(inoffiziell)") ? "Wortfilter · Inoffiziell" : t.includes("(offiziell)") ? "Wortfilter · Offiziell" : "Wortfilter";
}

const WF: Record<FunktionKey, WfBereich[]> = {
  album: ["steckbrief", "kommentare", "kommentare_inoffiziell"],
  spotify: [],
  // beide Teile: wer nur einen davon verwalten darf, sieht genau diesen
  zitate: ["zitate", "zitate_inoffiziell"],
  rankings: ["rankings", "rankings_inoffiziell"],
  motto: ["motto", "motto_inoffiziell"],
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

/** Unterseiten: Verwaltung, Erklärungen („i“ im Kopf), Wortfilter einer Funktion */
type Fenster = null | "steckbrief" | "lehrer" | "rankings" | "umfragen" | "info" | `wf:${FunktionKey}`;

/**
 * Profil → Funktionen: ganze Bereiche für alle an/aus. Darunter je Bereich,
 * wer ihn nutzen darf (mit Schnell-Schalter für alle Schüler und das Team),
 * und die Einstellungen dazu – damit nichts mehr gesucht werden muss.
 *
 * Runde 8 („die Settings nehmen zu viel Platz ein“): jede Zeile EINE Zeile –
 * keine Erklärtexte unter den Schaltern, kein Untertitel, keine Fußnote. Was
 * eine Funktion tut und wer sie gerade nutzen darf, steht hinter dem „i“ im
 * Kopf. Mehrere Wortfilter einer Funktion (Album: Steckbriefe, Kommentare
 * offiziell/inoffiziell) liegen auf einer Unterseite „Wortfilter ›“.
 */
export function FunktionenSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { an, setzen } = useFunktionen();
  const { can } = useRole();
  const wfRecht = useWfRecht();
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
    // Beim Wiederöffnen nicht in der zuletzt offenen Unterseite landen
    else setFenster(null);
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
    zitate: [{ l: "Lehrkräfte", f: "lehrer", darf: can("lehrer.verwalten") }],
    rankings: [{ l: "Rankings verwalten", f: "rankings", darf: can("rankings.verwalten") || can("lehrer.verwalten") }],
    spotify: [],
    motto: [],
    umfragen: [{ l: "Umfragen verwalten", f: "umfragen", darf: can("umfragen.verwalten") || can("umfragen.ergebnisse") }],
  };

  /** Wer darf die Funktion gerade nutzen? (für „Nutzen dürfen“ und die Erklärungen) */
  const werText = (perm: PermKey) => {
    const wer = rollen[perm] || [];
    return ALLE.every((r) => wer.includes(r)) ? "Alle Schüler und das Team" : wer.length ? `Nur ${wer.map(rolleName).join(", ")}` : "Nur Admin";
  };

  // Eine Funktion als Gruppe: Hauptschalter, wer sie nutzen darf, Wortfilter, Verwaltung
  const funktionKarte = (k: FunktionKey) => {
    const f = FUNKTIONEN.find((x) => x.key === k)!;
    const perm = NUTZEN[k];
    const wer = perm ? rollen[perm] || [] : [];
    const alleDa = perm ? ALLE.every((r) => wer.includes(r)) : false;
    const verwalten = links[k].filter((x) => x.darf);
    const wf = WF[k].filter(wfRecht);
    const sym = SYMBOL[k];
    return (
      <div key={k} className="gruppe-zellen">
        {/* EIN Hauptschalter je Funktion: an oder aus für alle */}
        <label className="flex min-h-[48px] cursor-pointer items-center gap-3 px-4 py-2">
          <span aria-hidden className={`symbol ${sym.farbe}`}>
            <Icon name={sym.icon} size={17} strich={2.2} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-snug max-[359px]:text-[15px]">{f.titel}</span>
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
        {/* Unterpunkte eingerückt unter dem Hauptschalter, je EINE Zeile.
            Wer genau nutzen darf (wenn nicht alle), steht hinter dem „i“. */}
        {perm && (
          <label className="flex min-h-[48px] items-center gap-3 py-2 pl-[58px] pr-4">
            {can("perms.manage") ? (
              <>
                <span className="min-w-0 flex-1 truncate text-[15px]">Alle dürfen nutzen</span>
                <Schalter an={alleDa} label={`${f.titel}: alle Schüler und das Team dürfen nutzen`} onChange={(v) => void fuerAlle(perm, v)} />
              </>
            ) : (
              <>
                <span className="shrink-0 text-[15px]">Nutzen</span>
                <span className="flex min-w-0 flex-1 justify-end">
                  <Wert>{alleDa ? "Alle" : wer.length ? `Nur ${wer.map(rolleName).join(", ")}` : "Nur Admin"}</Wert>
                </span>
              </>
            )}
          </label>
        )}
        {/* Ein Wortfilter: gleich der Schalter. Mehrere: eine Zeile „Wortfilter ›“ */}
        {wf.length === 1 && <WortfilterSchalter bereich={wf[0]} zeile einzeilig titel={wfTitel(wf[0])} className="!pl-[58px]" />}
        {wf.length > 1 && (
          <button
            type="button"
            onClick={() => setFenster(`wf:${k}`)}
            className="flex min-h-[48px] w-full items-center gap-3 py-2 pl-[58px] pr-4 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
          >
            <span className="min-w-0 flex-1 text-[15px]">Wortfilter</span>
            <span aria-hidden className="shrink-0 text-[17px] leading-none text-tinte-leise">›</span>
          </button>
        )}
        {/* Verwaltung als Zeilen mit „›“ (wie iOS) – öffnet die Unterseite */}
        {verwalten.map((x) => (
          <button
            key={x.l}
            type="button"
            onClick={() => setFenster(x.f)}
            className="flex min-h-[48px] w-full items-center gap-3 py-2 pl-[58px] pr-4 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
          >
            <span className="min-w-0 flex-1 text-[15px]">{x.l}</span>
            <span aria-hidden className="shrink-0 text-[17px] leading-none text-tinte-leise">›</span>
          </button>
        ))}
      </div>
    );
  };

  const sichtbareThemen = FUNKTION_THEMEN.map((t) => ({ ...t, funktionen: t.funktionen.filter((k) => darfSchalten(can, k)) })).filter((t) => t.funktionen.length > 0);
  const sichtbare = sichtbareThemen.flatMap((t) => t.funktionen);

  return (
    <>
      {/* Bleibt offen, solange eine Unterseite (Lehrkräfte …) darüber liegt:
          die Unterseite steht an seiner Stelle, „‹ Funktionen“ führt zurück
          (Stapel in Sheet.tsx) – Scrollstand und Aufgeklapptes bleiben. */}
      <Sheet open={open} onClose={onClose}>
        <SheetKopf titel="Funktionen" extra={<InfoKnopf onClick={() => setFenster("info")} />} onClose={onClose} />
        <div className="space-y-2.5">
          {sichtbareThemen.map((t) => {
            // Thema mit nur EINER Funktion (Abimotto, Umfragen, Abiball): gleich
            // die Gruppe zeigen – aufgeklappt wiederholte sie nur den Thementitel
            if (t.funktionen.length === 1) return <div key={t.titel}>{funktionKarte(t.funktionen[0])}</div>;
            const anZahl = t.funktionen.filter((k) => an[k]).length;
            return (
              <details key={t.titel} className="group" open={sichtbareThemen.length === 1}>
                {/* Thema als Zeile (weiß auf grau); aufklappen zeigt je Funktion eine Gruppe */}
                <summary className="gruppe-zellen flex min-h-[48px] cursor-pointer list-none items-center gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden [&>*::before]:!hidden">
                  <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{t.titel}</span>
                  <span className="shrink-0 text-[15px] text-tinte-matt dark:text-slate-300">
                    {anZahl} von {t.funktionen.length} an
                  </span>
                  <span className="text-tinte-leise transition group-open:rotate-90" aria-hidden>
                    <Icon name="chevron" size={16} />
                  </span>
                </summary>
                <div className="mt-2.5 space-y-3">
                  {t.funktionen.map(funktionKarte)}
                </div>
              </details>
            );
          })}
        </div>

        {/* „i“: was jede Funktion tut und wer sie gerade nutzen darf – stand
            vorher als zweite Zeile unter jedem Schalter und als Fußnote */}
        <Sheet open={open && fenster === "info"} onClose={() => setFenster(null)}>
          <SheetKopf titel="Was die Funktionen tun" onClose={() => setFenster(null)} />
          <Gruppe
            className="mt-1"
            fuss="Pro Funktion ein Schalter: an oder aus für alle. Ausgeschaltetes sehen nur, wer es schalten darf (mit Hinweis). Einzelne Bereiche lassen sich auch Komitees geben: Rollen → „Rechte je Rolle“ → Komitee-Rechte."
          >
            {sichtbare.map((k) => {
              const f = FUNKTIONEN.find((x) => x.key === k)!;
              const perm = NUTZEN[k];
              return (
                <Zeile
                  key={k}
                  symbol={
                    <span aria-hidden className={`symbol ${SYMBOL[k].farbe}`}>
                      <Icon name={SYMBOL[k].icon} size={17} strich={2.2} />
                    </span>
                  }
                  label={f.titel}
                  unter={perm ? `${f.text} Nutzen: ${werText(perm)}.` : f.text}
                />
              );
            })}
          </Gruppe>
        </Sheet>
        {/* Mehrere Wortfilter einer Funktion: Unterseite mit je einem Schalter */}
        {sichtbare
          .filter((k) => WF[k].filter(wfRecht).length > 1)
          .map((k) => (
            <Sheet key={k} open={open && fenster === `wf:${k}`} onClose={() => setFenster(null)}>
              <SheetKopf titel={`Wortfilter · ${FUNKTIONEN.find((x) => x.key === k)!.titel}`} onClose={() => setFenster(null)} />
              <Gruppe className="mt-1">
                {WF[k].map((b) => (
                  <WortfilterSchalter key={b} bereich={b} zeile einzeilig titel={WF_BEREICHE.find((x) => x.key === b)?.titel} />
                ))}
              </Gruppe>
            </Sheet>
          ))}

        {/* Wortfilter für Steckbrief und Kommentare stehen hier schon unter „Abi-Album“ */}
        {album && <KategorienSheet open={open && fenster === "steckbrief"} album={album} onClose={() => setFenster(null)} mitWortfilter={false} />}
        <Sheet open={open && fenster === "lehrer"} onClose={() => setFenster(null)}>
          <SheetKopf titel="Lehrkräfte" unter="Zum Auswählen bei Zitaten und im Lehrer-Ranking." onClose={() => setFenster(null)} />
          <LehrerListe aktiv={open && fenster === "lehrer"} />
        </Sheet>
        <RankingVerwaltungSheet open={open && fenster === "rankings"} onClose={() => setFenster(null)} />
        <UmfragenSheet open={open && fenster === "umfragen"} onClose={() => setFenster(null)} />
      </Sheet>
    </>
  );
}

/** Rundes „i“ im Kopf (wie das Zahnrad der Bereiche): öffnet die Erklärungen */
function InfoKnopf({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Was die Funktionen tun"
      title="Was die Funktionen tun"
      className="-my-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90"
    >
      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[rgb(118_118_128/0.12)] text-tinte-matt dark:bg-[rgb(118_118_128/0.24)] dark:text-slate-300">
        <Icon name="info" size={17} strich={2.2} />
      </span>
    </button>
  );
}
