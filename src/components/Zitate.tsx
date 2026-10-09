import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { useRole } from "../auth/RoleProvider";
import { useFunktionen } from "../lib/funktionen";
import { useZitate, zitatOhneZeichen, type Zitat, type ZitatArt, type Zitatwand } from "../lib/zitate";
import { ZustimmungsMarke } from "./ZustimmungsMarke";
import { AusHinweis } from "./Funktionen";
import { frage, melde, meldeFehler } from "../lib/melder";
import { useRunden, type RundenStand } from "../lib/runden";
import { RundenAbschnitt, RundenMarke, SichtbarkeitWahl } from "./Runden";
import { useErgebnisSichtbarkeit } from "../lib/ergebnisse";
import { FarbKarte, KnopfGlas, KnopfHell } from "./Kachel";
import { AutorInfo, WortfilterSchalter } from "./AutorInfo";
import { useZustimmungen } from "../lib/zustimmung";
import { useLehrer, useStufePersonen } from "../lib/rankings";
import { LehrerListe, ZahnradKnopf } from "./Rankings";
import { GesperrtZeile, GESPERRT_TEXT } from "./Gesperrt";
import { MeldenKnopf } from "./Melden";
import { melden, wortfilterFinden } from "../lib/melden";

/**
 * Zitatwand auf der Startseite: das neueste Zitat, Einreichen und Alle
 * ansehen. Wer prüfen darf, sieht, wie viele warten. Läuft eine
 * Abstimmungsrunde, steht sie vorn.
 */
export function ZitateKarte({ className = "" }: { className?: string }) {
  const { can, isEltern, uid, banned } = useRole();
  const { sichtbar } = useFunktionen();
  const darf = !isEltern && sichtbar("zitate") && (can("zitate.nutzen") || can("zitate.pruefen"));
  const wand = useZitate(darf, uid);
  const r = useRunden("zitate", darf, uid, can("zitate.runden"));
  const [offen, setOffen] = useState<null | "liste" | "neu" | "pruefen">(null);
  const darfPruefen = can("zitate.pruefen");
  // Aus der Benachrichtigung „Neues Zitat zum Prüfen“ (./#zitate)
  useEffect(() => {
    if (!darf) return;
    const pruefe = () => {
      if (window.location.hash !== "#zitate") return;
      history.replaceState(null, "", window.location.pathname + window.location.search);
      setOffen(darfPruefen ? "pruefen" : "liste");
    };
    pruefe();
    window.addEventListener("hashchange", pruefe);
    return () => window.removeEventListener("hashchange", pruefe);
  }, [darf, darfPruefen]);
  if (!darf) return null;

  const frei = wand.zitate.filter((z) => z.status === "frei");
  const warten = wand.zitate.filter((z) => z.status === "offen").length;
  // Immer das neueste freigegebene Zitat (zuletzt geprüft)
  const zeit = (z: Zitat) => z.geprueft_at || z.created_at;
  const heute = frei.length ? [...frei].sort((a, b) => zeit(b).localeCompare(zeit(a)))[0] : null;

  const runde = r.offeneVon("");
  return (
    <div className={`flex flex-col ${className}`}>
      <AusHinweis funktion="zitate" className="mb-1.5 px-1" />
      <FarbKarte
        verlauf="from-[#2C2C2E] to-[#1C1C1E]"
        schatten="shadow-[0_12px_30px_-14px_rgba(0,0,0,.75)]"
        className="dark:ring-1 dark:ring-white/10"
        marke={
          runde ? (
            <span className="flex flex-wrap gap-1.5">
              <RundenMarke runde={runde} hell />
              {runde.hm_aktiv && <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-semibold">♥ Sieger der Herzen</span>}
            </span>
          ) : undefined
        }
        oben={<span className="text-[#E9C460]">{runde ? "Zitate · Engere Auswahl" : heute ? "Neuestes Zitat" : "Zitatwand"}</span>}
        titel={
          runde ? (
            "Welche Zitate kommen in die Abizeitung?"
          ) : heute ? (
            <button onClick={() => setOffen("liste")} className="block text-left font-buch text-[1.3rem] font-normal italic leading-snug">
              „{zitatOhneZeichen(heute.text)}“
            </button>
          ) : (
            <span className="font-buch text-[1.2rem] font-normal italic leading-snug text-white/85">Wer hat diesen einen Satz gesagt, den niemand vergisst?</span>
          )
        }
        unter={
          runde
            ? `${r.meineIn(runde.id).length} von ${runde.stimmen} ${runde.stimmen === 1 ? "Stimme" : "Stimmen"} vergeben`
            : heute
              ? `— ${heute.wer}${heute.kontext ? `, ${heute.kontext}` : ""}`
              : undefined
        }
        deko={<span className="-mt-7 mr-1 block font-buch text-[9rem] leading-none text-[#E9C460]/15">”</span>}
        knoepfe={
          <>
            {!banned && !runde && (
              <KnopfHell onClick={() => setOffen("neu")} text="text-[#1C1C1E] !bg-[#E9C460]">
                Zitat einreichen
              </KnopfHell>
            )}
            {runde ? (
              <KnopfHell onClick={() => setOffen("liste")} text="text-[#1C1C1E] !bg-[#E9C460]">
                Abstimmen
              </KnopfHell>
            ) : (
              <KnopfGlas onClick={() => setOffen("liste")}>Alle {frei.length ? `(${frei.length})` : ""}</KnopfGlas>
            )}
            {can("zitate.pruefen") && warten > 0 && (
              <button onClick={() => setOffen("pruefen")} className="rounded-full bg-[#FF9F0A] px-3 py-2 text-[13px] font-bold text-[#1C1C1E] transition active:scale-95">
                {warten} prüfen
              </button>
            )}
          </>
        }
      >
        <GesperrtZeile hell className="mt-3" />
      </FarbKarte>
      <ZitateSheet wand={wand} r={r} ansicht={offen} setAnsicht={setOffen} />
    </div>
  );
}

function ZitateSheet({
  wand,
  r,
  ansicht,
  setAnsicht,
}: {
  wand: Zitatwand;
  r: RundenStand;
  ansicht: null | "liste" | "neu" | "pruefen";
  setAnsicht: (a: null | "liste" | "neu" | "pruefen") => void;
}) {
  const { can, banned } = useRole();
  const [lehrerOffen, setLehrerOffen] = useState(false);
  const schliessen = () => setAnsicht(null);
  const warten = wand.zitate.filter((z) => z.status === "offen");

  return (
    <>
    <Sheet open={lehrerOffen && ansicht !== null} onClose={() => setLehrerOffen(false)}>
      <SheetKopf titel="Lehrerliste" unter="Zum Auswählen bei Zitaten und im Lehrer-Ranking." onClose={() => setLehrerOffen(false)} />
      <LehrerListe aktiv={lehrerOffen} />
    </Sheet>
    <Sheet open={ansicht !== null && !lehrerOffen} onClose={schliessen}>
      {ansicht === "neu" ? (
        <Einreichen wand={wand} fertig={() => setAnsicht("liste")} schliessen={schliessen} />
      ) : (
        <>
          <SheetKopf
            titel={<span className="font-buch italic">Zitatwand</span>}
            unter={`${wand.zitate.filter((z) => z.status === "frei").length} Zitate`}
            onClose={schliessen}
            extra={
              <>
              {can("lehrer.verwalten") && <ZahnradKnopf label="Lehrerliste pflegen" onClick={() => setLehrerOffen(true)} />}
              {!banned && <button
                type="button"
                onClick={() => setAnsicht("neu")}
                aria-label="Zitat einreichen"
                className="-my-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90"
              >
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-brand text-[18px] font-bold leading-none text-white">+</span>
              </button>}
              </>
            }
          />
          {can("zitate.pruefen") && (
            <div className="seg mb-4">
              <button className={`seg-item ${ansicht === "liste" ? "seg-aktiv" : ""}`} onClick={() => setAnsicht("liste")}>
                Wand
              </button>
              <button className={`seg-item ${ansicht === "pruefen" ? "seg-aktiv" : ""}`} onClick={() => setAnsicht("pruefen")}>
                Prüfen{warten.length ? ` (${warten.length})` : ""}
              </button>
            </div>
          )}
          <GesperrtZeile className="mb-3" />
          {ansicht === "pruefen" ? (
            <>
              <WortfilterSchalter bereich="zitate" className="mb-3" />
              <ZitateSichtbarkeit wand={wand} />
              <Pruefen wand={wand} />
            </>
          ) : (
            <>
              <RundenAbschnitt
                stand={r}
                quellen={wand.zitate
                  .filter((z) => z.status === "frei")
                  .map((z) => ({ id: z.id, label: `„${zitatOhneZeichen(z.text)}“`, unter: `— ${z.wer}${z.kontext ? `, ${z.kontext}` : ""}`, punkte: wand.stimmenVon(z.id) }))}
                leitet={can("zitate.runden")}
                gesperrt={banned}
                startText="Abstimmungsrunde starten"
                wahlTitel="Zitate-Wahl"
                mitHerz
              />
              <Wand wand={wand} />
            </>
          )}
        </>
      )}
    </Sheet>
    </>
  );
}

/** Komitee: Wer sieht die 🔥-Zahlen der Zitatwand? */
function ZitateSichtbarkeit({ wand }: { wand: Zitatwand }) {
  const e = useErgebnisSichtbarkeit(true);
  return (
    <div className="feld-grau mb-3 px-4 py-1">
      <SichtbarkeitWahl
        alle={e.alle.zitate}
        onChange={async (v) => {
          const f = await e.setzen("zitate", v);
          if (f) meldeFehler("Ging nicht: " + f);
          else void wand.neuZaehlen();
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- Wand */
function Wand({ wand }: { wand: Zitatwand }) {
  const [filter, setFilter] = useState<"alle" | ZitatArt>("alle");
  const [sortWahl, setSort] = useState<"top" | "neu">("top");
  // Ohne sichtbare Zahlen gibt es keine Rangliste
  const sort = wand.zahlenSichtbar ? sortWahl : "neu";
  const frei = wand.zitate.filter((z) => z.status === "frei");
  const meineOffenen = wand.zitate.filter((z) => z.status === "offen" && wand.istMeins(z.id));

  const rang = useMemo(() => [...frei].sort((a, b) => wand.stimmenVon(b.id) - wand.stimmenVon(a.id)).map((z) => z.id), [frei, wand]);
  const liste = frei
    .filter((z) => filter === "alle" || z.art === filter)
    .sort((a, b) => (sort === "top" ? wand.stimmenVon(b.id) - wand.stimmenVon(a.id) : b.created_at.localeCompare(a.created_at)));

  if (!wand.bereit) return <p className="py-10 text-center text-[14px] text-tinte-leise">Lädt …</p>;

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <div className="seg flex-1">
          {(
            [
              ["alle", "Alle"],
              ["lehrer", "Lehrer"],
              ["schueler", "Schüler"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={`seg-item ${filter === k ? "seg-aktiv" : ""}`} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
        {wand.zahlenSichtbar && <button
          onClick={() => setSort((s) => (s === "top" ? "neu" : "top"))}
          className="rounded-[9px] bg-[rgb(118_118_128/0.12)] px-3 py-1.5 text-[13px] font-semibold dark:bg-[rgb(118_118_128/0.24)]"
        >
          {sort === "top" ? "🔥 Top" : "🕒 Neu"}
        </button>}
      </div>

      {meineOffenen.length > 0 && (
        <p className="mb-3 rounded-xl bg-[#FF9F0A]/15 px-3 py-2 text-[13px] text-tinte-matt dark:text-slate-300">
          {meineOffenen.length === 1 ? "Eins deiner Zitate wartet" : `${meineOffenen.length} deiner Zitate warten`} noch auf die Prüfung.
        </p>
      )}

      <div className="space-y-2.5">
        {liste.map((z) => (
          <ZitatZeile key={z.id} z={z} platz={sort === "top" ? rang.indexOf(z.id) + 1 : 0} wand={wand} />
        ))}
      </div>
      {liste.length === 0 && <p className="py-10 text-center text-[14px] text-tinte-leise">Noch keine Zitate. Reich das erste ein!</p>}
    </>
  );
}

function ZitatZeile({ z, platz, wand }: { z: Zitat; platz: number; wand: Zitatwand }) {
  const { can, banned: gesperrt } = useRole();
  const an = wand.meineStimme(z.id);
  const n = wand.stimmenVon(z.id);
  const [tick, setTick] = useState(0);
  const [edit, setEdit] = useState<null | { text: string; wer: string; kontext: string }>(null);

  if (edit)
    return (
      <div className="space-y-2 rounded-2xl bg-[rgb(118_118_128/0.08)] p-3 dark:bg-[rgb(118_118_128/0.18)]">
        <textarea className="field min-h-[80px] resize-y font-buch" maxLength={300} value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <input className="field" maxLength={60} placeholder="Wer" value={edit.wer} onChange={(e) => setEdit({ ...edit, wer: e.target.value })} />
          <input className="field" maxLength={60} placeholder="Wann / wo" value={edit.kontext} onChange={(e) => setEdit({ ...edit, kontext: e.target.value })} />
        </div>
        <div className="flex gap-2">
          <button
            className="btn-grau flex-1 !min-h-[40px] !text-[15px] !text-red-600"
            onClick={() =>
              void frage("Dieses Zitat löschen? Es wird geleert und verschwindet von der Wand.", "Löschen", true).then(async (ok) => {
                if (!ok) return;
                const f = await wand.pruefen(z.id, "abgelehnt");
                if (f) meldeFehler(f);
              })
            }
          >
            Löschen
          </button>
          <button className="btn-grau flex-1 !min-h-[40px] !text-[15px]" onClick={() => setEdit(null)}>
            Abbrechen
          </button>
          <button
            className="btn-primary flex-1 !min-h-[40px] !text-[15px]"
            onClick={async () => {
              const f = await wand.bearbeiten(z.id, edit);
              if (f) return meldeFehler(f);
              setEdit(null);
            }}
          >
            Sichern
          </button>
        </div>
      </div>
    );

  return (
    <div className="flex gap-3 rounded-2xl bg-[rgb(118_118_128/0.08)] p-4 dark:bg-[rgb(118_118_128/0.18)]">
      <div className="min-w-0 flex-1">
        {platz > 0 && platz <= 3 && n > 0 && (
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#9A7410] dark:text-[#E9C460]">Platz {platz}</div>
        )}
        <div className="font-buch text-[17px] leading-[1.4]">„{zitatOhneZeichen(z.text)}“</div>
        <div className="mt-1.5 text-[13px] text-tinte-leise">
          — {z.wer}
          {z.kontext ? `, ${z.kontext}` : ""}
        </div>
        <div className="mt-1.5 flex items-center gap-3">
          {can("zitate.pruefen") && (
            <button className="text-[12.5px] font-semibold text-brand-dark dark:text-brand" onClick={() => setEdit({ text: z.text, wer: z.wer, kontext: z.kontext })}>
              Bearbeiten
            </button>
          )}
          {!wand.istMeins(z.id) && <MeldenKnopf onClick={() => melden("zitat", z.id)} />}
          {can("zitate.pruefen") && <AutorInfo art="zitat" id={z.id} />}
        </div>
      </div>
      <button
        onClick={() => {
          if (gesperrt) return meldeFehler(GESPERRT_TEXT);
          setTick((t) => t + 1);
          void wand.abstimmen(z.id);
        }}
        aria-label={an ? "Stimme zurücknehmen" : "Feuer geben"}
        aria-pressed={an}
        className={`flex w-[52px] shrink-0 flex-col items-center gap-0.5 self-start rounded-[14px] py-2 transition active:scale-90 ${
          an ? "bg-[#FF9F0A]/15 text-[#C93400] dark:text-[#FF9F0A]" : "bg-white/70 text-tinte-leise dark:bg-white/10"
        }`}
      >
        <span key={tick} className={`text-[19px] leading-none ${tick ? "animate-herz" : ""} ${an ? "" : "grayscale"}`}>
          🔥
        </span>
        {wand.zahlenSichtbar && <span className="zahl text-[12px] font-bold">{n}</span>}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- Einreichen */
function Einreichen({ wand, fertig, schliessen }: { wand: Zitatwand; fertig: () => void; schliessen: () => void }) {
  const [art, setArt] = useState<ZitatArt>("lehrer");
  const [wer, setWer] = useState("");
  const [text, setText] = useState("");
  const [kontext, setKontext] = useState("");
  const [busy, setBusy] = useState(false);
  const [gesendet, setGesendet] = useState(false);
  const [andere, setAndere] = useState(false);
  const [suche, setSuche] = useState("");
  const { lehrer } = useLehrer(true);
  const personen = useStufePersonen(true);
  const geht = text.trim().length > 2 && wer.trim().length > 0;
  const q = suche.trim().toLowerCase();
  const namen =
    art === "lehrer"
      ? lehrer.filter((l) => l.aktiv).map((l) => l.name)
      : personen.map((p) => `${p.vorname} ${p.nachname ? p.nachname[0] + "." : ""}`.trim());
  const treffer = namen.filter((n) => !q || n.toLowerCase().includes(q));

  if (gesendet)
    return (
      <div className="flex animate-popIn flex-col items-center py-10 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#34C759] text-[30px] text-white">✓</span>
        <div className="mt-3 text-[1.25rem] font-bold">Eingereicht</div>
        <p className="mt-1 max-w-xs text-[14px] text-tinte-leise">Das Team schaut kurz drüber. Danach steht es auf der Zitatwand.</p>
        <button className="btn-primary mt-5 w-full" onClick={fertig}>
          Zur Zitatwand
        </button>
        <button
          className="mt-3 text-[15px] font-semibold text-tinte-leise"
          onClick={() => {
            setGesendet(false);
            setText("");
            setKontext("");
          }}
        >
          Noch eins einreichen
        </button>
      </div>
    );

  return (
    <div className="animate-fadeIn">
      <SheetKopf titel="Zitat einreichen" onClose={schliessen} />
      {/* Vorschau wie gedruckt */}
      <div className="rounded-2xl bg-[#FFF8E7] px-5 pb-4 pt-3 text-[#3A2E12] dark:bg-[#2A2414] dark:text-[#F3E7C6]">
        <div className="font-buch text-[2.6rem] leading-none text-[#C93400]">“</div>
        <div className={`-mt-2 min-h-[48px] font-buch text-[18px] italic leading-snug ${text.trim() ? "" : "opacity-40"}`}>
          {text.trim() || "Hier erscheint das Zitat, während du tippst …"}
        </div>
        <div className="mt-2 text-[13px] opacity-70">
          — {wer.trim() || (art === "lehrer" ? "Lehrkraft" : "Mitschüler*in")}
          {kontext.trim() ? `, ${kontext.trim()}` : ""}
        </div>
      </div>

      <div className="seg mt-4">
        <button className={`seg-item ${art === "lehrer" ? "seg-aktiv" : ""}`} onClick={() => (setArt("lehrer"), setWer(""), setAndere(false))}>
          Lehrer
        </button>
        <button className={`seg-item ${art === "schueler" ? "seg-aktiv" : ""}`} onClick={() => (setArt("schueler"), setWer(""), setAndere(false))}>
          Mitschüler
        </button>
      </div>
      <h3 className="mb-1.5 mt-4 px-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-tinte-leise">Wer hat es gesagt?</h3>
      {namen.length > 8 && !andere && (
        <input className="field mb-2" placeholder="Suchen" value={suche} onChange={(e) => setSuche(e.target.value)} />
      )}
      {!andere && (
        <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
          {treffer.map((n) => (
            <button
              key={n}
              onClick={() => setWer(n)}
              className={`rounded-full px-3 py-1.5 text-[14px] font-semibold transition active:scale-95 ${
                wer === n ? "bg-brand text-white" : "bg-[rgb(118_118_128/0.12)] dark:bg-[rgb(118_118_128/0.24)]"
              }`}
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => (setAndere(true), setWer(""))}
            className="rounded-full border border-dashed border-black/20 px-3 py-1.5 text-[14px] font-semibold text-tinte-matt dark:border-white/25 dark:text-slate-300"
          >
            Andere …
          </button>
        </div>
      )}
      <div className="mt-3 space-y-2">
        {(andere || namen.length === 0) && (
          <input className="field" maxLength={60} autoFocus={andere} placeholder={art === "lehrer" ? "Name, z. B. Frau …" : "Vorname, Initial"} value={wer} onChange={(e) => setWer(e.target.value)} />
        )}
        <textarea className="field min-h-[96px] resize-y" maxLength={300} placeholder="Was wurde gesagt?" value={text} onChange={(e) => setText(e.target.value)} />
        <input className="field" maxLength={60} placeholder="Wann / wo (optional), z. B. Deutsch-LK" value={kontext} onChange={(e) => setKontext(e.target.value)} />
      </div>
      <button
        className="btn-primary mt-4 w-full disabled:opacity-40"
        disabled={!geht || busy}
        onClick={async () => {
          setBusy(true);
          const f = await wand.einreichen({ text, wer, art, kontext });
          setBusy(false);
          if (f) return meldeFehler("Ging nicht: " + f);
          setGesendet(true);
        }}
      >
        {busy ? "…" : "Einreichen"}
      </button>
      <p className="mt-2 text-center text-[12px] text-tinte-leise">Erscheint erst nach der Prüfung. Bitte nichts Verletzendes.</p>
    </div>
  );
}

/* ---------------------------------------------------------------- Prüfen */
function Pruefen({ wand }: { wand: Zitatwand }) {
  const { uid } = useRole();
  const offen = wand.zitate.filter((z) => z.status === "offen");
  const zu = useZustimmungen("zitat", offen.length > 0, uid);
  if (!offen.length) return <p className="py-10 text-center text-[14px] text-tinte-leise">Alles geprüft.</p>;
  return (
    <div className="space-y-2.5">
      {offen.map((z) => (
        <div key={z.id} className="animate-aufsteigen rounded-2xl bg-[rgb(118_118_128/0.08)] p-4 dark:bg-[rgb(118_118_128/0.18)]">
          <div className="font-buch text-[16.5px] leading-snug">„{zitatOhneZeichen(z.text)}“</div>
          <div className="mt-1 text-[12.5px] leading-snug text-tinte-leise">
            — {z.wer}
            {z.kontext ? `, ${z.kontext}` : ""}
          </div>
          <WortfilterHinweis text={`${z.text} ${z.wer} ${z.kontext}`} />
          <div className="mt-2.5 flex items-center gap-2">
            <span className="min-w-0 flex-1">
              <ZustimmungsMarke zahl={zu.zahl(z.id)} noetig={zu.noetig} ichSchon={zu.ichSchon(z.id)} />
            </span>
            <AutorInfo art="zitat" id={z.id} />
            <button
              aria-label="Ablehnen"
              onClick={async () => {
                const f = await wand.pruefen(z.id, "abgelehnt");
                if (f) meldeFehler(f);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFEDEC] text-[16px] font-bold text-[#D70015] transition active:scale-90 dark:bg-red-500/15"
            >
              ✕
            </button>
            <button
              aria-label="Freigeben"
              onClick={async () => {
                const f = await wand.pruefen(z.id, "frei");
                if (f?.startsWith("Deine Zustimmung")) {
                  melde(f);
                  void zu.laden();
                } else if (f) meldeFehler(f);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EAF6EC] text-[16px] font-bold text-[#248A3D] transition active:scale-90 dark:bg-green-500/15"
            >
              ✓
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Beim Prüfen: Zitate laufen nicht durch den Wortfilter – hier nur ein Hinweis */
function WortfilterHinweis({ text }: { text: string }) {
  const [treffer, setTreffer] = useState<string | null>(null);
  useEffect(() => {
    let aktiv = true;
    void wortfilterFinden(text).then((t) => aktiv && setTreffer(t));
    return () => {
      aktiv = false;
    };
  }, [text]);
  if (!treffer) return null;
  return (
    <div className="mt-1.5 inline-flex rounded-full bg-[#FFF4E5] px-2.5 py-1 text-[12px] font-semibold text-[#B25000] dark:bg-[#FF9F0A]/15 dark:text-[#FF9F0A]">
      ⚠ enthält ein Wort aus dem Wortfilter („{treffer}“)
    </div>
  );
}
