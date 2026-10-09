import { useEffect, useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { Schalter } from "./Schalter";
import { MuteKnopf } from "./MuteKnopf";
import { Avatar } from "./Avatar";
import { useRole } from "../auth/RoleProvider";
import { useProfiles } from "../profiles-store";
import { hasSupabase, supabase } from "../lib/supabase";
import { frage, melde, meldeFehler } from "../lib/melder";
import { hinScrollen, useSprungziel } from "../lib/sprung";
import { Icon } from "./Icon";
import { useWortfilterBereiche, WF_BEREICHE } from "../lib/wortfilter-bereiche";
import { ART_TEXT, GRUENDE, meldungSenden, useMeldungen, type MeldeArt, type MeldeGrund, type Meldung } from "../lib/melden";

/* ====================================================================== */
/* Melden-Blatt – einmal in App.tsx eingehängt, geöffnet über melden()    */
/* ====================================================================== */
export function MeldenWurzel() {
  const [ziel, setZiel] = useState<{ art: MeldeArt; zielId: string } | null>(null);
  const [grund, setGrund] = useState<MeldeGrund | null>(null);
  const [notiz, setNotiz] = useState("");
  const [sendet, setSendet] = useState(false);
  const [fertig, setFertig] = useState(false);

  useEffect(() => {
    const auf = (e: Event) => {
      setZiel((e as CustomEvent<{ art: MeldeArt; zielId: string }>).detail);
      setGrund(null);
      setNotiz("");
      setFertig(false);
    };
    window.addEventListener("sv:melden", auf);
    return () => window.removeEventListener("sv:melden", auf);
  }, []);

  const zu = () => setZiel(null);

  return (
    <Sheet open={ziel !== null} onClose={zu}>
      {fertig ? (
        <div className="py-4 text-center">
          <div className="text-[44px]">🚩</div>
          <h2 className="mt-1 text-[1.3rem] font-bold">Danke, ist gemeldet</h2>
          <p className="mx-auto mt-1 max-w-xs text-[14px] leading-snug text-tinte-leise">
            Das Stufenteam schaut es sich an. Wer gemeldet hat, sieht niemand außer dem Team.
          </p>
          <button className="btn-primary mt-5 w-full" onClick={zu}>
            Fertig
          </button>
        </div>
      ) : (
        <>
          <SheetKopf titel="Melden" unter={ziel ? `${ART_TEXT[ziel.art]} – was ist das Problem?` : ""} onClose={zu} />
          <div className="space-y-2">
            {GRUENDE.map((g) => (
              <button
                key={g.key}
                onClick={() => setGrund(g.key)}
                aria-pressed={grund === g.key}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-[15px] font-semibold transition active:scale-[.99] ${
                  grund === g.key ? "bg-brand text-white" : "bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]"
                }`}
              >
                <span className="text-[20px]">{g.zeichen}</span>
                {g.text}
              </button>
            ))}
          </div>
          <textarea
            className="field mt-3 min-h-[72px] resize-none"
            maxLength={300}
            placeholder="Kurz erklären (freiwillig)"
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
          />
          <button
            className="btn-primary mt-3 w-full disabled:opacity-40"
            disabled={!grund || !ziel || sendet}
            onClick={async () => {
              if (!ziel || !grund) return;
              setSendet(true);
              const f = await meldungSenden(ziel.art, ziel.zielId, grund, notiz);
              setSendet(false);
              if (f) return meldeFehler(f);
              setFertig(true);
            }}
          >
            {sendet ? "Wird gesendet …" : "Melden"}
          </button>
          <p className="mt-2 text-center text-[12px] text-tinte-leise">Bitte nur, wenn wirklich etwas nicht in Ordnung ist.</p>
        </>
      )}
    </Sheet>
  );
}

/** Kleiner Melden-Knopf (Fähnchen) für Listen */
export function MeldenKnopf({ onClick, label = "Melden", className = "" }: { onClick: () => void; label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex items-center gap-1 text-[12px] font-semibold text-tinte-leise transition active:scale-95 ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-[14px] w-[14px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
      </svg>
      {label}
    </button>
  );
}

/* ====================================================================== */
/* Für das Team: offene Meldungen (Chats → Anfragen)                      */
/* ====================================================================== */
export function MeldungenAnfragen() {
  const { can } = useRole();
  const darf = can("meldungen.bearbeiten");
  const m = useMeldungen(darf);
  useSprungziel("meldung", darf && m.liste.length > 0, () => hinScrollen("sprung-meldung"));
  if (!darf || m.liste.length === 0) return null;

  // Mehrere Meldungen zum selben Inhalt zusammenfassen
  const gruppen = new Map<string, Meldung[]>();
  for (const x of m.liste) {
    const k = `${x.art}:${x.ziel_id}`;
    gruppen.set(k, [...(gruppen.get(k) || []), x]);
  }

  return (
    <div id="sprung-meldung" className="mb-4 grid gap-2.5">
      {[...gruppen.values()].map((g) => (
        <MeldungKarte key={g[0].id} gruppe={g} m={m} />
      ))}
    </div>
  );
}

function MeldungKarte({ gruppe, m }: { gruppe: Meldung[]; m: ReturnType<typeof useMeldungen> }) {
  const { can } = useRole();
  const { profile } = useProfiles();
  const x = gruppe[0];
  const name = x.gemeldet_user ? profile[x.gemeldet_user]?.anzeigename || "Jemand" : "Unbekannt";
  const gruende = [...new Set(gruppe.map((g) => GRUENDE.find((r) => r.key === g.grund)?.text || g.grund))];
  const notizen = gruppe.map((g) => g.notiz).filter(Boolean);
  const darfEntfernen =
    x.art === "chat"
      ? can("chats.delete_messages")
      : x.art === "kommentar" || x.art === "steckbrief"
        ? can("album.moderieren")
        : x.art === "motto"
          ? can("motto.verwalten")
          : can("zitate.pruefen");

  return (
    <div className="card border-red-300/60 p-4 dark:border-red-500/30">
      <div className="flex items-start gap-2.5">
        <Avatar userId={x.gemeldet_user} name={name} size={36} />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">
            🚩 {ART_TEXT[x.art]} von {name}
          </div>
          <div className="mt-0.5 text-[12.5px] text-tinte-matt dark:text-slate-300">
            {gruende.join(", ")} · {gruppe.length === 1 ? "1 Meldung" : `${gruppe.length} Meldungen`}
          </div>
          <blockquote className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-[rgb(118_118_128/0.08)] px-3 py-2 text-[13.5px] leading-snug dark:bg-[rgb(118_118_128/0.18)]">
            {x.auszug || "–"}
          </blockquote>
          {notizen.map((n, i) => (
            <div key={i} className="mt-1 text-[12.5px] italic text-tinte-leise">
              „{n}“
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {darfEntfernen && (
          <button
            className="rounded-full bg-red-600 px-3.5 py-2 text-[13.5px] font-semibold text-white transition active:scale-95"
            onClick={() =>
              void frage("Den Inhalt entfernen?", "Entfernen", true).then(async (ok) => {
                if (!ok) return;
                const f = (await m.inhaltEntfernen(x)) || (await m.erledigen(x.id, "entfernt"));
                if (f) meldeFehler("Ging nicht: " + f);
                else melde("Entfernt", "erfolg");
              })
            }
          >
            Entfernen
          </button>
        )}
        <button
          className="rounded-full bg-[rgb(118_118_128/0.12)] px-3.5 py-2 text-[13.5px] font-semibold transition active:scale-95 dark:bg-[rgb(118_118_128/0.24)]"
          onClick={async () => {
            const f = await m.erledigen(x.id, "ok");
            if (f) meldeFehler("Ging nicht: " + f);
          }}
        >
          Ist in Ordnung
        </button>
        {x.gemeldet_user && (
          <span className="ml-auto text-[13px] font-semibold">
            <MuteKnopf userId={x.gemeldet_user} name={name} />
          </span>
        )}
      </div>
    </div>
  );
}

/* ====================================================================== */
/* Wortfilter pflegen (Profil → Wortfilter, Recht wortfilter.verwalten)   */
/* ====================================================================== */
interface Eintrag {
  id: string;
  wort: string;
  stufe: "block" | "erlaubt";
  modus: "wort" | "anfang" | "ueberall";
  aktiv: boolean;
}
const MODI: { key: Eintrag["modus"]; text: string; hilfe: string }[] = [
  { key: "wort", text: "Nur als Wort", hilfe: "auch mit Endung (-e, -en, -er, -s …)" },
  { key: "anfang", text: "Wortanfang", hilfe: "z. B. auch Zusammensetzungen dahinter" },
  { key: "ueberall", text: "Überall", hilfe: "auch mitten in anderen Wörtern" },
];

export function WortfilterSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [liste, setListe] = useState<Eintrag[]>([]);
  const [teil, setTeil] = useState<"block" | "erlaubt" | "bereiche">("block");
  const [neu, setNeu] = useState("");
  const [modus, setModus] = useState<Eintrag["modus"]>("anfang");
  const [probe, setProbe] = useState("");
  const [probeErg, setProbeErg] = useState<string | null | undefined>(undefined);
  const [suche, setSuche] = useState("");
  const [zeichen, setZeichen] = useState("");
  const [zeichenAlt, setZeichenAlt] = useState("");
  const bereiche = useWortfilterBereiche(open);

  const laden = async () => {
    if (!hasSupabase) return;
    const [{ data }, { data: z }] = await Promise.all([
      supabase!.from("wortfilter").select("id, wort, stufe, modus, aktiv").order("wort"),
      supabase!.from("app_settings").select("wortfilter_zeichen").eq("id", 1).maybeSingle(),
    ]);
    setListe((data as Eintrag[]) || []);
    const zz = (z as { wortfilter_zeichen?: string } | null)?.wortfilter_zeichen ?? "";
    setZeichen(zz);
    setZeichenAlt(zz);
  };
  useEffect(() => {
    if (open) void laden();
  }, [open]);

  const q = suche.trim().toLowerCase();
  const sichtbar = liste.filter((e) => e.stufe === teil && (!q || e.wort.toLowerCase().includes(q)));

  async function hinzufuegen() {
    const w = neu.trim();
    if (w.length < 2 || teil === "bereiche") return;
    if (!hasSupabase) return;
    const { error } = await supabase!.from("wortfilter").insert({ wort: w, stufe: teil, modus: teil === "block" ? modus : "wort" });
    if (error) return meldeFehler(error.message.includes("duplicate") ? "Steht schon drin." : "Ging nicht: " + error.message);
    setNeu("");
    melde(`„${w}“ hinzugefügt`, "erfolg");
    void laden();
  }

  async function loeschen(e: Eintrag) {
    const ok = await frage(`„${e.wort}“ aus der Liste löschen?`, "Löschen", true);
    if (!ok) return;
    setListe((l) => l.filter((x) => x.id !== e.id));
    const { error } = await supabase!.from("wortfilter").delete().eq("id", e.id);
    if (error) {
      meldeFehler("Ging nicht: " + error.message);
      void laden();
    }
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel="Wortfilter" unter="Blockt beleidigende Wörter – je Bereich an- und ausschaltbar." onClose={onClose} />

      {/* Ausprobieren */}
      <div className="feld-grau mb-4 p-3">
        <div className="flex gap-2">
          <input
            className="field !bg-white dark:!bg-slate-800"
            placeholder="Text ausprobieren, z. B. „A.r.s.c.h“"
            value={probe}
            onChange={(e) => {
              setProbe(e.target.value);
              setProbeErg(undefined);
            }}
            onKeyDown={(e) => e.key === "Enter" && probe.trim() && e.currentTarget.nextElementSibling instanceof HTMLButtonElement && e.currentTarget.nextElementSibling.click()}
          />
          <button
            className="btn-klein shrink-0"
            disabled={!probe.trim()}
            onClick={async () => {
              if (!hasSupabase) return setProbeErg(null);
              const { data } = await supabase!.rpc("wortfilter_finden", { p_text: probe });
              setProbeErg((data as string | null) || null);
            }}
          >
            Prüfen
          </button>
        </div>
        {probeErg !== undefined && (
          <div className={`mt-1.5 px-1 text-[13px] font-semibold ${probeErg ? "text-red-600 dark:text-red-400" : "text-[#248A3D] dark:text-[#30D158]"}`}>
            {probeErg ? `Wird geblockt („${probeErg}“)` : "Geht durch"}
          </div>
        )}
      </div>

      <div className="seg mb-4">
        <button className={`seg-item ${teil === "block" ? "seg-aktiv" : ""}`} onClick={() => setTeil("block")}>
          Blocken ({liste.filter((e) => e.stufe === "block").length})
        </button>
        <button className={`seg-item ${teil === "erlaubt" ? "seg-aktiv" : ""}`} onClick={() => setTeil("erlaubt")}>
          Ausnahmen ({liste.filter((e) => e.stufe === "erlaubt").length})
        </button>
        <button className={`seg-item ${teil === "bereiche" ? "seg-aktiv" : ""}`} onClick={() => setTeil("bereiche")}>
          Bereiche
        </button>
      </div>

      {teil === "bereiche" ? (
        <>
          <div className="liste bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]">
            {WF_BEREICHE.map((b) => (
              <label key={b.key} className="zeile">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px]">{b.titel}</span>
                  <span className="block text-[12px] leading-snug text-tinte-leise">{b.text}</span>
                </span>
                <Schalter
                  an={bereiche.an[b.key]}
                  label={`Wortfilter für ${b.titel}`}
                  onChange={async (v) => {
                    const f = await bereiche.setzen(b.key, v);
                    if (f) meldeFehler("Ging nicht: " + f);
                  }}
                />
              </label>
            ))}
          </div>
          <p className="mt-1.5 px-4 text-[12px] leading-snug text-tinte-leise">
            Den Schalter für ihren Bereich finden Komitees auch direkt dort (z. B. Zitate → Prüfen). Links und Spotify-IDs zählen nie mit.
          </p>
        </>
      ) : (
        <>
          {/* Hinzufügen */}
          <h3 className="abschnitt">{teil === "block" ? "Neues Wort blocken" : "Neue Ausnahme"}</h3>
          <div className="liste mb-1.5 bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]">
            <div className="zeile">
              <input
                className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-tinte-leise"
                maxLength={40}
                placeholder={teil === "block" ? "Wort eingeben" : "Erlaubtes Wort, z. B. idiotensicher"}
                value={neu}
                onChange={(e) => setNeu(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void hinzufuegen()}
              />
              <button className="btn-klein shrink-0" disabled={neu.trim().length < 2} onClick={() => void hinzufuegen()}>
                Hinzufügen
              </button>
            </div>
            {teil === "block" && (
              <div className="px-3 py-2">
                <div className="seg">
                  {MODI.map((x) => (
                    <button key={x.key} className={`seg-item !px-1 ${modus === x.key ? "seg-aktiv" : ""}`} onClick={() => setModus(x.key)}>
                      {x.text}
                    </button>
                  ))}
                </div>
                <p className="mt-1 px-1 text-[12px] text-tinte-leise">{MODI.find((x) => x.key === modus)?.hilfe}</p>
              </div>
            )}
          </div>

          {teil === "block" && (
            <>
              <h3 className="abschnitt mt-5">Emojis blocken</h3>
              <div className="liste bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]">
                <div className="zeile">
                  <input
                    className="min-w-0 flex-1 bg-transparent text-[20px] tracking-wider outline-none placeholder:text-[15px] placeholder:tracking-normal placeholder:text-tinte-leise"
                    aria-label="Geblockte Emojis"
                    maxLength={200}
                    placeholder="z. B. 🍆🍑💦"
                    value={zeichen}
                    onChange={(e) => setZeichen(e.target.value.replace(/[\sA-Za-z0-9]/g, ""))}
                  />
                  <button
                    className="btn-klein shrink-0"
                    disabled={zeichen === zeichenAlt}
                    onClick={async () => {
                      if (!hasSupabase) return;
                      const { error } = await supabase!.rpc("wortfilter_zeichen_setzen", { p: zeichen });
                      if (error) return meldeFehler("Ging nicht: " + error.message);
                      setZeichenAlt(zeichen);
                      melde("Gespeichert", "erfolg");
                    }}
                  >
                    Speichern
                  </button>
                </div>
              </div>
              <p className="mt-1.5 px-4 text-[12px] text-tinte-leise">Jedes Emoji hier blockt wie ein Wort – Hautfarben zählen mit.</p>
            </>
          )}

          {/* Liste: durchsuchen, Modus ändern, aus-/einschalten, löschen */}
          <div className="mb-1.5 mt-5 flex items-center gap-2 px-4">
            <h3 className="kennlabel min-w-0 flex-1">{teil === "block" ? "Geblockte Wörter" : "Ausnahmen"}</h3>
          </div>
          <input className="field mb-2" placeholder="In der Liste suchen" value={suche} onChange={(e) => setSuche(e.target.value)} />
          <div className="liste bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]">
            {sichtbar.map((e) => (
              <div key={e.id} className={`zeile !gap-2 ${e.aktiv ? "" : "opacity-55"}`}>
                <span className="min-w-0 flex-1 truncate text-[15px]">{e.wort}</span>
                {e.stufe === "block" && (
                  <select
                    aria-label={`Modus für ${e.wort}`}
                    className="max-w-[7.5rem] rounded-lg bg-white px-2 py-1 text-[12.5px] dark:bg-slate-800"
                    value={e.modus}
                    onChange={async (ev) => {
                      const v = ev.target.value as Eintrag["modus"];
                      setListe((l) => l.map((x) => (x.id === e.id ? { ...x, modus: v } : x)));
                      const { error } = await supabase!.from("wortfilter").update({ modus: v }).eq("id", e.id);
                      if (error) meldeFehler("Ging nicht: " + error.message);
                    }}
                  >
                    {MODI.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.text}
                      </option>
                    ))}
                  </select>
                )}
                <Schalter
                  an={e.aktiv}
                  label={`${e.wort} aktiv`}
                  onChange={async (v) => {
                    setListe((l) => l.map((x) => (x.id === e.id ? { ...x, aktiv: v } : x)));
                    const { error } = await supabase!.from("wortfilter").update({ aktiv: v }).eq("id", e.id);
                    if (error) meldeFehler("Ging nicht: " + error.message);
                  }}
                />
                <button
                  aria-label={`${e.wort} löschen`}
                  onClick={() => void loeschen(e)}
                  className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-red-600 transition active:scale-90 dark:text-red-400"
                >
                  <Icon name="muell" size={18} />
                </button>
              </div>
            ))}
            {sichtbar.length === 0 && <p className="px-4 py-3 text-[13px] text-tinte-leise">{q ? "Nichts gefunden." : "Noch nichts eingetragen."}</p>}
          </div>
          <p className="mt-2 px-4 text-[12px] leading-snug text-tinte-leise">
            Erkennt auch Umgehungen: Groß/klein, Umlaute, Zahlen statt Buchstaben (4rsch), Zeichen dazwischen (A.r.s.c.h), Leerzeichen, Wiederholungen und Sternchen (f*ck).
            Schalter aus = bleibt gespeichert, wirkt aber nicht; 🗑 löscht es ganz.
          </p>
        </>
      )}
    </Sheet>
  );
}
