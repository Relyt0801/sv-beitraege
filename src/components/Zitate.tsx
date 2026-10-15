import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { Gruppe, Wert, Zeile } from "./Liste";
import { Schalter } from "./Schalter";
import { useRole } from "../auth/RoleProvider";
import { useFunktionen } from "../lib/funktionen";
import { rundenGruppe, teilVonGruppe, useZitate, zitatOhneZeichen, type Zitat, type ZitatArt, type Zitatwand } from "../lib/zitate";
import { ZustimmungsMarke } from "./ZustimmungsMarke";
import { AusHinweis } from "./Funktionen";
import { frage, melde, meldeFehler } from "../lib/melder";
import { useRunden, type KandidatEingabe, type Runde, type RundenStand } from "../lib/runden";
import { RundenAbschnitt, RundenMarke, RundeStartenSheet, SichtbarkeitWahl, Stepper } from "./Runden";
import { useErgebnisSichtbarkeit } from "../lib/ergebnisse";
import { FarbKarte, KnopfGlas, KnopfHell } from "./Kachel";
import { AutorInfo, WortfilterSchalter } from "./AutorInfo";
import { useZustimmungen } from "../lib/zustimmung";
import { useLehrer, useStufePersonen } from "../lib/rankings";
import { LehrerListe, ZahnradKnopf } from "./Rankings";
import { GesperrtZeile, GESPERRT_TEXT } from "./Gesperrt";
import { MeldenKnopf } from "./Melden";
import { melden, wortfilterFinden } from "../lib/melden";
import { TEIL_ERKLAERUNG, TEIL_NAME, useGewinner, useTeil, useVerschiebungen, type Gewinner, type GewinnerArt, type Teil, type Verschiebung } from "../lib/teile";
import { TEIL_FARBE, TeilMarke, TeilSymbol, TeilUmschalter, TeilWischer } from "./TeilUmschalter";
import { GewinnerBuehne, GewinnerMarke, KuerenBlatt, type Kandidat } from "./Gewinner";
import { KachelVerwaltung } from "./KachelVerwaltung";
import { useWfRecht } from "../lib/wortfilter-bereiche";

/**
 * Zitatwand – zwei Teile (Update 1.4):
 *
 *   Offiziell    kommt ins Abibuch (Wortfilter standardmäßig an)
 *   Inoffiziell  nur für die Stufe, wird nicht gedruckt
 *
 * Aufbau des Blatts – alles Wichtige oben, nichts in den Einstellungen
 * versteckt:
 *
 *   1. Umschalter Offiziell | Inoffiziell (auch seitlich wischen)
 *   2. Segment Wand | Ergebnis | Prüfen
 *   3. Wand:     laufende Runde als Stand-Karte ganz oben (bzw. die
 *                gekürten Gewinner), darunter die Zitate des Teils
 *      Ergebnis: Gewinner, Zwischenstand/Ergebnis der Runden, Top-Zitate
 *      Prüfen:   wartende Zitate des Teils, offene Verschiebe-Anträge
 *   4. Zahnrad → EIN Blatt „Einstellungen“ (Abstimmung, Ergebnisse,
 *      Gewinner, Offiziell & Inoffiziell, Lehrerliste, Wer darf was?)
 *
 * Runden laufen je Teil getrennt (lib/zitate.ts → rundenGruppe), Gewinner
 * ebenso (gewinner.gruppe = Teil).
 */
type Ansicht = "wand" | "ergebnis" | "pruefen" | "neu";

const ANDERER: Record<Teil, Teil> = { offiziell: "inoffiziell", inoffiziell: "offiziell" };
const zitatLabel = (z: Zitat) => `„${zitatOhneZeichen(z.text)}“`;
const zitatUnter = (z: Zitat) => `— ${z.wer}${z.kontext ? `, ${z.kontext}` : ""}`;

/* ====================================================================== */
/* Karte auf der Startseite                                               */
/* ====================================================================== */
/**
 * Startseite: Läuft eine Abstimmungsrunde, steht sie vorn (mit Teil-Marke);
 * sonst der gekürte Gewinner oder das neueste Zitat. Wer prüfen darf, sieht,
 * wie viele warten.
 */
export function ZitateKarte({ className = "" }: { className?: string }) {
  const { can, isEltern, uid, banned } = useRole();
  const { sichtbar } = useFunktionen();
  const darf = !isEltern && sichtbar("zitate") && (can("zitate.nutzen") || can("zitate.pruefen"));
  const wand = useZitate(darf, uid);
  const r = useRunden("zitate", darf, uid, can("zitate.runden"));
  const gw = useGewinner("zitate", darf);
  // Der offene Teil – Karte und Blatt teilen ihn
  const [teil, setTeil] = useTeil("zitate");
  const [offen, setOffen] = useState<null | Ansicht>(null);
  const darfPruefen = can("zitate.pruefen");
  // Aus der Benachrichtigung „Neues Zitat zum Prüfen“ (./#zitate)
  useEffect(() => {
    if (!darf) return;
    const pruefe = () => {
      if (window.location.hash !== "#zitate") return;
      history.replaceState(null, "", window.location.pathname + window.location.search);
      setOffen(darfPruefen ? "pruefen" : "wand");
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

  // Laufende Runde: zuerst im offenen Teil, sonst im anderen
  const runde = r.offeneVon(rundenGruppe(teil)) || r.offeneVon(rundenGruppe(ANDERER[teil]));
  const rundeTeil = runde ? teilVonGruppe(runde.gruppe) : teil;
  // Gekürter Gewinner: zuerst im offenen Teil
  const sieger = gw.von(teil, "gewinner") || gw.von(ANDERER[teil], "gewinner");

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
              <TeilMarke teil={rundeTeil} hell />
            </span>
          ) : sieger ? (
            <TeilMarke teil={sieger.gruppe as Teil} hell />
          ) : undefined
        }
        oben={<span className="text-[#E9C460]">{runde ? "Zitate · Abstimmung" : sieger ? "Zitat des Jahrgangs" : heute ? "Neuestes Zitat" : "Zitatwand"}</span>}
        titel={
          runde ? (
            "Welche Zitate kommen in die Abizeitung?"
          ) : sieger ? (
            <button
              onClick={() => (setTeil(sieger.gruppe as Teil), setOffen("ergebnis"))}
              className="block text-left font-buch text-[1.3rem] font-normal italic leading-snug"
            >
              {sieger.label}
            </button>
          ) : heute ? (
            <button onClick={() => setOffen("wand")} className="block text-left font-buch text-[1.3rem] font-normal italic leading-snug">
              „{zitatOhneZeichen(heute.text)}“
            </button>
          ) : (
            <span className="font-buch text-[1.2rem] font-normal italic leading-snug text-white/85">Wer hat diesen einen Satz gesagt, den niemand vergisst?</span>
          )
        }
        unter={
          runde
            ? `${r.meineIn(runde.id).length} von ${runde.stimmen} ${runde.stimmen === 1 ? "Stimme" : "Stimmen"} vergeben`
            : sieger
              ? sieger.unter || undefined
              : heute
                ? zitatUnter(heute)
                : undefined
        }
        deko={<span className="-mt-7 mr-1 block font-buch text-[9rem] leading-none text-[#E9C460]/15">”</span>}
        knoepfe={
          <>
            {runde ? (
              <KnopfHell onClick={() => (setTeil(rundeTeil), setOffen("wand"))} text="text-[#1C1C1E] !bg-[#E9C460]">
                Abstimmen
              </KnopfHell>
            ) : (
              !banned && (
                <KnopfHell onClick={() => setOffen("neu")} text="text-[#1C1C1E] !bg-[#E9C460]">
                  Zitat einreichen
                </KnopfHell>
              )
            )}
            <KnopfGlas onClick={() => setOffen("wand")}>Alle {frei.length ? `(${frei.length})` : ""}</KnopfGlas>
            {darfPruefen && warten > 0 && (
              <button onClick={() => setOffen("pruefen")} className="rounded-full bg-[#FF9F0A] px-3 py-2 text-[13px] font-bold text-[#1C1C1E] transition active:scale-95">
                {warten} prüfen
              </button>
            )}
          </>
        }
      >
        <GesperrtZeile hell className="mt-3" />
      </FarbKarte>
      <ZitateSheet wand={wand} r={r} gw={gw} teil={teil} setTeil={setTeil} ansicht={offen} setAnsicht={setOffen} />
    </div>
  );
}

type GewinnerStand = ReturnType<typeof useGewinner>;
type VerschiebeStand = ReturnType<typeof useVerschiebungen>;

/* ====================================================================== */
/* Das Blatt                                                              */
/* ====================================================================== */
function ZitateSheet({
  wand,
  r,
  gw,
  teil,
  setTeil,
  ansicht,
  setAnsicht,
}: {
  wand: Zitatwand;
  r: RundenStand;
  gw: GewinnerStand;
  teil: Teil;
  setTeil: (t: Teil) => void;
  ansicht: null | Ansicht;
  setAnsicht: (a: null | Ansicht) => void;
}) {
  const { can, banned, isAdmin } = useRole();
  const darfPruefen = can("zitate.pruefen");
  const [einstellungen, setEinstellungen] = useState(false);
  const schliessen = () => setAnsicht(null);

  // Nach einer fertigen Verschiebung neu laden. Über eine Referenz, damit der
  // Live-Kanal in useVerschiebungen nicht bei jedem Zeichnen neu aufgebaut wird.
  const ladenRef = useRef(wand.laden);
  ladenRef.current = wand.laden;
  const nachVerschieben = useCallback(() => void ladenRef.current(), []);
  const v = useVerschiebungen("zitate", darfPruefen && ansicht !== null, nachVerschieben);

  const darfEinstellungen =
    can("zitate.runden") || darfPruefen || can("lehrer.verwalten") || can("wortfilter.verwalten") || can("perms.manage") || isAdmin;

  const zahl = (t: Teil, status: Zitat["status"]) => wand.zitate.filter((z) => z.bereich === t && z.status === status).length;
  const wartenAlle = wand.zitate.filter((z) => z.status === "offen").length;
  const ansichtJetzt: Ansicht = ansicht === "pruefen" && !darfPruefen ? "wand" : ansicht || "wand";

  return (
    <>
      <Sheet open={ansicht !== null} onClose={schliessen}>
        {ansicht === "neu" ? (
          <Einreichen wand={wand} teil={teil} setTeil={setTeil} fertig={() => setAnsicht("wand")} schliessen={schliessen} />
        ) : (
          <>
            <SheetKopf
              titel={<span className="font-buch italic">Zitatwand</span>}
              unter={`${zahl(teil, "frei")} ${zahl(teil, "frei") === 1 ? "Zitat" : "Zitate"} · ${TEIL_NAME[teil]}`}
              onClose={schliessen}
              extra={
                <>
                  {darfEinstellungen && <ZahnradKnopf label="Einstellungen der Zitatwand" onClick={() => setEinstellungen(true)} />}
                  {!banned && (
                    <button
                      type="button"
                      onClick={() => setAnsicht("neu")}
                      aria-label="Zitat einreichen"
                      className="-my-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90"
                    >
                      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-brand text-[18px] font-bold leading-none text-white">+</span>
                    </button>
                  )}
                </>
              }
            />
            {/* 1. Wo bin ich? – Umschalter mit Erklärsatz; beim Prüfen zählt er die Wartenden */}
            <TeilUmschalter
              teil={teil}
              setTeil={setTeil}
              zahlen={
                ansichtJetzt === "pruefen"
                  ? { offiziell: zahl("offiziell", "offen"), inoffiziell: zahl("inoffiziell", "offen") }
                  : { offiziell: zahl("offiziell", "frei"), inoffiziell: zahl("inoffiziell", "frei") }
              }
              className="mb-3"
            />
            {/* 2. Was will ich sehen? */}
            <div className="seg mb-4" role="tablist" aria-label="Ansicht">
              {(
                [
                  ["wand", "Wand"],
                  ["ergebnis", "Ergebnis"],
                  ...(darfPruefen ? ([["pruefen", `Prüfen${wartenAlle ? ` (${wartenAlle})` : ""}`]] as const) : []),
                ] as const
              ).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={ansichtJetzt === k} className={`seg-item ${ansichtJetzt === k ? "seg-aktiv" : ""}`} onClick={() => setAnsicht(k)}>
                  {l}
                </button>
              ))}
            </div>
            <GesperrtZeile className="mb-3" />
            <TeilWischer teil={teil} setTeil={setTeil}>
              {ansichtJetzt === "pruefen" ? (
                <Pruefen wand={wand} teil={teil} setTeil={setTeil} v={v} />
              ) : ansichtJetzt === "ergebnis" ? (
                <ErgebnisAnsicht wand={wand} r={r} gw={gw} teil={teil} einstellungen={() => setEinstellungen(true)} />
              ) : (
                <WandAnsicht wand={wand} r={r} gw={gw} teil={teil} v={v} einreichen={() => setAnsicht("neu")} />
              )}
            </TeilWischer>
          </>
        )}
      </Sheet>
      <ZitateEinstellungen open={einstellungen} onClose={() => setEinstellungen(false)} wand={wand} r={r} gw={gw} teil={teil} v={v} />
    </>
  );
}

/* ====================================================================== */
/* Wand                                                                   */
/* ====================================================================== */
function WandAnsicht({
  wand,
  r,
  gw,
  teil,
  v,
  einreichen,
}: {
  wand: Zitatwand;
  r: RundenStand;
  gw: GewinnerStand;
  teil: Teil;
  v: VerschiebeStand;
  einreichen: () => void;
}) {
  const { banned } = useRole();
  const gruppe = rundenGruppe(teil);
  const runde = r.offeneVon(gruppe);
  const g = gw.von(teil, "gewinner");
  const h = gw.von(teil, "herzen");
  return (
    <>
      {/* Stand ganz oben: die laufende Runde (Abstimmen ohne Scrollen) …
          Steuerung der Runde liegt im Einstellungs-Blatt, darum leitet={false}. */}
      {runde && (
        <RundenAbschnitt stand={r} gruppe={gruppe} gruppeTitel={TEIL_NAME[teil]} quellen={[]} leitet={false} gesperrt={banned} wahlTitel="Zitate-Wahl" mitHerz />
      )}
      {/* … oder die gekürten Gewinner */}
      {!runde && (g || h) && (
        <div className="mb-4">
          <GewinnerBuehne gewinner={g} herzen={h} titel={TEIL_NAME[teil]} />
        </div>
      )}
      <Wand wand={wand} teil={teil} gw={gw} v={v} einreichen={einreichen} />
    </>
  );
}

function Wand({ wand, teil, gw, v, einreichen }: { wand: Zitatwand; teil: Teil; gw: GewinnerStand; v: VerschiebeStand; einreichen: () => void }) {
  const { banned } = useRole();
  const [filter, setFilter] = useState<"alle" | ZitatArt>("alle");
  const [sortWahl, setSort] = useState<"top" | "neu">("top");
  // Ohne sichtbare Zahlen gibt es keine Rangliste
  const sort = wand.zahlenSichtbar ? sortWahl : "neu";
  const frei = useMemo(() => wand.zitate.filter((z) => z.status === "frei" && z.bereich === teil), [wand.zitate, teil]);
  const meineOffenen = wand.zitate.filter((z) => z.status === "offen" && z.bereich === teil && wand.istMeins(z.id));
  const g = gw.von(teil, "gewinner");
  const h = gw.von(teil, "herzen");

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
        {wand.zahlenSichtbar && (
          <button
            onClick={() => setSort((s) => (s === "top" ? "neu" : "top"))}
            className="rounded-[9px] bg-[rgb(118_118_128/0.12)] px-3 py-1.5 text-[13px] font-semibold dark:bg-[rgb(118_118_128/0.24)]"
            aria-label={sort === "top" ? "Sortiert nach Feuer – auf Neueste umstellen" : "Sortiert nach Neueste – auf Feuer umstellen"}
          >
            {sort === "top" ? "🔥 Top" : "🕒 Neu"}
          </button>
        )}
      </div>

      {meineOffenen.length > 0 && (
        <p className="mb-3 rounded-xl bg-[#FF9F0A]/15 px-3 py-2 text-[13px] text-tinte-matt dark:text-slate-300">
          {meineOffenen.length === 1 ? "Eins deiner Zitate wartet" : `${meineOffenen.length} deiner Zitate warten`} noch auf die Prüfung.
        </p>
      )}

      <div className="space-y-2.5">
        {liste.map((z) => (
          <ZitatZeile
            key={z.id}
            z={z}
            platz={sort === "top" ? rang.indexOf(z.id) + 1 : 0}
            wand={wand}
            v={v}
            marken={[...(g?.ziel_id === z.id ? (["gewinner"] as const) : []), ...(h?.ziel_id === z.id ? (["herzen"] as const) : [])]}
          />
        ))}
      </div>
      {liste.length === 0 && (
        <div className="flex flex-col items-center py-10 text-center">
          <span className={`flex h-12 w-12 items-center justify-center rounded-full ${TEIL_FARBE[teil].grund} ${TEIL_FARBE[teil].text}`}>
            <TeilSymbol teil={teil} size={22} />
          </span>
          <p className="mt-3 max-w-xs text-[14px] leading-snug text-tinte-leise">
            {frei.length
              ? "Keine Zitate in dieser Auswahl."
              : teil === "offiziell"
                ? "Noch keine offiziellen Zitate. Reich eins ein, das ins Abibuch darf."
                : "Noch keine inoffiziellen Zitate. Reich das erste ein!"}
          </p>
          {!frei.length && !banned && (
            <button className="btn-klein mt-4" onClick={einreichen}>
              Zitat einreichen
            </button>
          )}
        </div>
      )}
    </>
  );
}

/** Offener Verschiebe-Antrag an einem Eintrag: Stand + Zustimmen/Verwerfen */
function AntragLeiste({ a, v, className = "" }: { a: Verschiebung; v: VerschiebeStand; className?: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${TEIL_FARBE[a.nach].grund} ${className}`}>
      <span className={`shrink-0 ${TEIL_FARBE[a.nach].text}`}>
        <TeilSymbol teil={a.nach} size={15} />
      </span>
      <span className="min-w-0 flex-1 text-[12.5px] leading-snug">
        <span className="font-semibold">Nach {TEIL_NAME[a.nach]} beantragt</span>
        <span className="text-tinte-matt dark:text-slate-300">
          {" "}
          · {a.stimmen} von {a.noetig}
          {a.ich ? " · du hast zugestimmt" : ""}
        </span>
      </span>
      {!a.ich && (
        <button className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[12.5px] font-semibold text-brand-dark shadow-sm dark:bg-white/15 dark:text-brand" onClick={() => void v.zustimmen(a.id)}>
          Zustimmen
        </button>
      )}
      <button className="shrink-0 px-1 text-[12.5px] font-semibold text-red-600 dark:text-red-400" onClick={() => void v.ablehnen(a.id)}>
        Verwerfen
      </button>
    </div>
  );
}

/** Verschieben beantragen – mit kurzer Rückfrage, was das bedeutet */
function useVerschieben(wand: Zitatwand, v: VerschiebeStand) {
  return useCallback(
    async (z: Zitat) => {
      const nach = ANDERER[z.bereich];
      const ok = await frage(
        `Nach „${TEIL_NAME[nach]}“ verschieben?\n\n${TEIL_ERKLAERUNG[nach]}\n\nDas braucht Zustimmungen aus dem Team (Profil → Freigaben).`,
        "Beantragen",
      );
      if (!ok) return;
      const fertig = await v.beantragen(z.id, nach);
      if (fertig) wand.demoVerschieben(z.id, nach);
    },
    [wand, v],
  );
}

function ZitatZeile({ z, platz, wand, v, marken }: { z: Zitat; platz: number; wand: Zitatwand; v: VerschiebeStand; marken: GewinnerArt[] }) {
  const { can, banned: gesperrt } = useRole();
  const an = wand.meineStimme(z.id);
  const n = wand.stimmenVon(z.id);
  const [tick, setTick] = useState(0);
  const [edit, setEdit] = useState<null | { text: string; wer: string; kontext: string }>(null);
  const darfPruefen = can("zitate.pruefen");
  const antrag = darfPruefen ? v.antragZu(z.id) : null;
  const verschieben = useVerschieben(wand, v);

  if (edit)
    return (
      <div className="space-y-2 rounded-2xl zelle p-3">
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
    <div className="rounded-2xl zelle p-4">
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          {(marken.length > 0 || (platz > 0 && platz <= 3 && n > 0)) && (
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              {marken.map((m) => (
                <GewinnerMarke key={m} art={m} />
              ))}
              {platz > 0 && platz <= 3 && n > 0 && (
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#9A7410] dark:text-[#E9C460]">Platz {platz}</span>
              )}
            </div>
          )}
          <div className="font-buch text-[17px] leading-[1.4]">„{zitatOhneZeichen(z.text)}“</div>
          <div className="mt-1.5 text-[13px] text-tinte-leise">{zitatUnter(z)}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {darfPruefen && (
              <button className="text-[12.5px] font-semibold text-brand-dark dark:text-brand" onClick={() => setEdit({ text: z.text, wer: z.wer, kontext: z.kontext })}>
                Bearbeiten
              </button>
            )}
            {darfPruefen && !antrag && (
              <button className={`inline-flex items-center gap-1 text-[12.5px] font-semibold ${TEIL_FARBE[ANDERER[z.bereich]].text}`} onClick={() => void verschieben(z)}>
                <TeilSymbol teil={ANDERER[z.bereich]} size={12} />
                Nach {TEIL_NAME[ANDERER[z.bereich]]}
              </button>
            )}
            {!wand.istMeins(z.id) && <MeldenKnopf onClick={() => melden("zitat", z.id)} />}
            {darfPruefen && <AutorInfo art="zitat" id={z.id} />}
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
            an ? "bg-[#FF9F0A]/15 text-[#C93400] dark:text-[#FF9F0A]" : "bg-[rgb(118_118_128/0.12)] text-tinte-leise dark:bg-[rgb(118_118_128/0.24)]"
          }`}
        >
          <span key={tick} className={`text-[19px] leading-none ${tick ? "animate-herz" : ""} ${an ? "" : "grayscale"}`}>
            🔥
          </span>
          {wand.zahlenSichtbar && <span className="zahl text-[12px] font-bold">{n}</span>}
        </button>
      </div>
      {antrag && <AntragLeiste a={antrag} v={v} className="mt-2.5" />}
    </div>
  );
}

/* ====================================================================== */
/* Ergebnis                                                               */
/* ====================================================================== */
/** Platz-Kreis: Gold, Silber, Bronze für die ersten drei */
function Platz({ n }: { n: number }) {
  const farbe = n === 1 ? "bg-[#F5B53F] text-[#3D2600]" : n === 2 ? "bg-[#C7CCD6] text-[#2A2F3A]" : n === 3 ? "bg-[#D99A6C] text-[#3A1E08]" : "text-tinte-leise";
  return <span className={`zahl flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold ${farbe}`}>{n}</span>;
}

/** Eine Ergebnis-Zeile: Platz, Zitat, Balken und Zahl */
function ErgebnisZeile({ platz, label, unter, n, max, herz, marken = [] }: { platz: number; label: string; unter?: string; n: number; max: number; herz?: boolean; marken?: GewinnerArt[] }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Platz n={platz} />
      <div className="min-w-0 flex-1">
        {marken.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-1.5">
            {marken.map((m) => (
              <GewinnerMarke key={m} art={m} />
            ))}
          </div>
        )}
        <div className="font-buch text-[15.5px] leading-snug [overflow-wrap:anywhere]">{label}</div>
        {unter && <div className="mt-0.5 text-[12.5px] text-tinte-leise">{unter}</div>}
        <div className="mt-1.5 flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgb(118_118_128/0.16)]">
            <span
              className={`block h-full rounded-full transition-[width] duration-700 ease-ios ${herz ? "bg-[#FF2D55]" : "bg-brand"}`}
              style={{ width: `${max ? Math.round((n / max) * 100) : 0}%` }}
            />
          </span>
          <span className="zahl w-8 text-right text-[13px] font-semibold text-tinte-matt dark:text-slate-300">{n}</span>
        </div>
      </div>
    </div>
  );
}

/** Ergebnis bzw. Zwischenstand einer Runde – Wahl und Sieger der Herzen getrennt */
function RundenErgebnis({ r, runde, marke }: { r: RundenStand; runde: Runde; marke: (id: string) => GewinnerArt[] }) {
  const alle = r
    .kandidatenVon(runde.id)
    .map((k) => ({ ...k, n: r.zahl(runde.id, k.ziel_id) ?? 0 }))
    .sort((a, b) => b.n - a.n);
  const wahl = alle.filter((k) => !k.hm);
  const herz = alle.filter((k) => k.hm);
  const t = r.teilnehmer(runde.id);
  if (!wahl.length) return null;
  return (
    <>
      <Gruppe
        titel={`Runde ${runde.nr} · ${runde.offen ? "Zwischenstand" : "Ergebnis"}`}
        fuss={`${t} ${t === 1 ? "Person hat" : "Personen haben"} gewählt${runde.offen ? " – die Runde läuft noch." : "."}${!runde.ergebnis_sichtbar ? " Nur das Komitee sieht diese Zahlen." : ""}`}
      >
        {wahl.map((k, i) => (
          <ErgebnisZeile key={k.ziel_id} platz={i + 1} label={k.label} unter={k.unter} n={k.n} max={wahl[0].n} marken={marke(k.ziel_id)} />
        ))}
      </Gruppe>
      {herz.length >= 2 && (
        <Gruppe titel="Sieger der Herzen · Honorable Mentions">
          {herz.map((k, i) => (
            <ErgebnisZeile key={k.ziel_id} platz={i + 1} label={k.label} unter={k.unter} n={k.n} max={herz[0].n} herz marken={marke(k.ziel_id)} />
          ))}
        </Gruppe>
      )}
    </>
  );
}

function ErgebnisAnsicht({ wand, r, gw, teil, einstellungen }: { wand: Zitatwand; r: RundenStand; gw: GewinnerStand; teil: Teil; einstellungen: () => void }) {
  const { can } = useRole();
  const leitet = can("zitate.runden");
  const darfKueren = leitet || can("zitate.pruefen");
  const gruppe = rundenGruppe(teil);
  const offen = r.offeneVon(gruppe);
  const letzte = r.letzteBeendete(gruppe);
  const g = gw.von(teil, "gewinner");
  const h = gw.von(teil, "herzen");
  const marke = (id: string): GewinnerArt[] => [...(g?.ziel_id === id ? (["gewinner"] as const) : []), ...(h?.ziel_id === id ? (["herzen"] as const) : [])];
  const sichtbar = (x: Runde | null): x is Runde => !!x && (leitet || x.ergebnis_sichtbar);

  const top = wand.zahlenSichtbar
    ? wand.zitate
        .filter((z) => z.status === "frei" && z.bereich === teil)
        .map((z) => ({ z, n: wand.stimmenVon(z.id) }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n)
        .slice(0, 10)
    : [];
  const nichts = !g && !h && !sichtbar(offen) && !sichtbar(letzte) && top.length === 0;

  return (
    <div className="animate-fadeIn">
      {(g || h) && <GewinnerBuehne gewinner={g} herzen={h} titel={TEIL_NAME[teil]} />}
      {darfKueren && (
        <Gruppe className={g || h ? "mt-3" : ""} fuss={!g && !h ? "Gekürte Gewinner stehen danach groß oben – auf der Wand und auf der Startseite." : undefined}>
          <Zeile label={g || h ? "Gewinner ändern" : "Gewinner küren"} onClick={einstellungen}>
            <Wert>{TEIL_NAME[teil]}</Wert>
          </Zeile>
        </Gruppe>
      )}
      {sichtbar(offen) && <RundenErgebnis r={r} runde={offen} marke={marke} />}
      {sichtbar(letzte) && <RundenErgebnis r={r} runde={letzte} marke={marke} />}
      {top.length > 0 && (
        <Gruppe titel="Beliebteste Zitate" fuss="Gezählt wird das Feuer auf der Wand – eine Stimme je Person und Zitat.">
          {top.map((x, i) => (
            <ErgebnisZeile key={x.z.id} platz={i + 1} label={zitatLabel(x.z)} unter={zitatUnter(x.z)} n={x.n} max={top[0].n} marken={marke(x.z.id)} />
          ))}
        </Gruppe>
      )}
      {nichts && (
        <div className="flex flex-col items-center py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F5B53F]/20 text-[22px]">🏆</span>
          <p className="mt-3 max-w-xs text-[14px] leading-snug text-tinte-leise">
            Noch keine Ergebnisse im Teil „{TEIL_NAME[teil]}“. Gib den Zitaten auf der Wand Feuer – sobald das Komitee auswertet, steht es hier.
          </p>
        </div>
      )}
    </div>
  );
}

/* ====================================================================== */
/* Einreichen                                                             */
/* ====================================================================== */
function Einreichen({ wand, teil, setTeil, fertig, schliessen }: { wand: Zitatwand; teil: Teil; setTeil: (t: Teil) => void; fertig: () => void; schliessen: () => void }) {
  const [art, setArt] = useState<ZitatArt>("lehrer");
  const [wer, setWer] = useState("");
  const [text, setText] = useState("");
  const [kontext, setKontext] = useState("");
  const [busy, setBusy] = useState(false);
  const [gesendet, setGesendet] = useState<Teil | null>(null);
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
        <div className="mt-2">
          <TeilMarke teil={gesendet} />
        </div>
        <p className="mt-2 max-w-xs text-[14px] text-tinte-leise">Das Team schaut kurz drüber. Danach steht es auf der Zitatwand.</p>
        <button className="btn-primary mt-5 w-full" onClick={fertig}>
          Zur Zitatwand
        </button>
        <button
          className="mt-3 text-[15px] font-semibold text-tinte-leise"
          onClick={() => {
            setGesendet(null);
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
      {/* Wohin? Standard ist der Teil, der gerade offen war */}
      <TeilUmschalter teil={teil} setTeil={setTeil} className="mb-4" />
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
      <h3 className="mb-1.5 mt-4 px-1 text-[13px] uppercase tracking-[0.02em] text-tinte-leise">Wer hat es gesagt?</h3>
      {namen.length > 8 && !andere && <input className="field mb-2" placeholder="Suchen" value={suche} onChange={(e) => setSuche(e.target.value)} />}
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
            className="rounded-full bg-[rgb(118_118_128/0.12)] px-3 py-1.5 text-[14px] font-semibold text-brand-dark dark:bg-[rgb(118_118_128/0.24)] dark:text-brand"
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
          const f = await wand.einreichen({ text, wer, art, kontext, bereich: teil });
          setBusy(false);
          if (f) return meldeFehler("Ging nicht: " + f);
          setGesendet(teil);
        }}
      >
        {busy ? "…" : `${TEIL_NAME[teil]} einreichen`}
      </button>
      <p className="mt-2 text-center text-[12px] text-tinte-leise">
        {teil === "offiziell" ? "Erscheint erst nach der Prüfung – und später im Abibuch." : "Erscheint erst nach der Prüfung. Bitte nichts Verletzendes."}
      </p>
    </div>
  );
}

/* ====================================================================== */
/* Prüfen                                                                 */
/* ====================================================================== */
function Pruefen({ wand, teil, setTeil, v }: { wand: Zitatwand; teil: Teil; setTeil: (t: Teil) => void; v: VerschiebeStand }) {
  const { uid } = useRole();
  const alle = wand.zitate.filter((z) => z.status === "offen");
  const offen = alle.filter((z) => z.bereich === teil);
  const imAnderen = alle.length - offen.length;
  const zu = useZustimmungen("zitat", alle.length > 0, uid);
  const verschieben = useVerschieben(wand, v);
  // Anträge zu Zitaten, die nicht (mehr) auf der Wand stehen, sonst nirgends sichtbar
  const antraege = v.liste.filter((a) => !wand.zitate.some((z) => z.id === a.ziel_id && z.status === "frei"));

  return (
    <div className="space-y-2.5">
      {antraege.length > 0 && <VerschiebeListe liste={antraege} v={v} titel="Offene Verschiebe-Anträge" />}
      {offen.map((z) => {
        const antrag = v.antragZu(z.id);
        return (
          <div key={z.id} className="animate-aufsteigen rounded-2xl zelle p-4">
            <div className="mb-1.5">
              <TeilMarke teil={z.bereich} />
            </div>
            <div className="font-buch text-[16.5px] leading-snug">„{zitatOhneZeichen(z.text)}“</div>
            <div className="mt-1 text-[12.5px] leading-snug text-tinte-leise">{zitatUnter(z)}</div>
            <WortfilterHinweis text={`${z.text} ${z.wer} ${z.kontext}`} />
            <div className="mt-2.5 flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <ZustimmungsMarke zahl={zu.zahl(z.id)} noetig={zu.noetig} ichSchon={zu.ichSchon(z.id)} />
              </span>
              <AutorInfo art="zitat" id={z.id} />
              {!antrag && (
                <button
                  aria-label={`Nach ${TEIL_NAME[ANDERER[z.bereich]]} verschieben`}
                  title={`Nach ${TEIL_NAME[ANDERER[z.bereich]]} verschieben`}
                  onClick={() => void verschieben(z)}
                  className={`flex h-10 w-10 items-center justify-center rounded-full transition active:scale-90 ${TEIL_FARBE[ANDERER[z.bereich]].grund} ${TEIL_FARBE[ANDERER[z.bereich]].text}`}
                >
                  <TeilSymbol teil={ANDERER[z.bereich]} size={17} />
                </button>
              )}
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
            {antrag && <AntragLeiste a={antrag} v={v} className="mt-2.5" />}
          </div>
        );
      })}
      {!offen.length && (
        <div className="flex flex-col items-center py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#34C759]/15 text-[20px] text-[#248A3D]">✓</span>
          <p className="mt-3 text-[14px] text-tinte-leise">Im Teil „{TEIL_NAME[teil]}“ ist alles geprüft.</p>
          {imAnderen > 0 && (
            <button className="btn-klein-grau mt-3" onClick={() => setTeil(ANDERER[teil])}>
              {imAnderen} {imAnderen === 1 ? "wartet" : "warten"} in {TEIL_NAME[ANDERER[teil]]} ›
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Liste offener Verschiebe-Anträge (Prüfen und Einstellungen) */
function VerschiebeListe({ liste, v, titel }: { liste: Verschiebung[]; v: VerschiebeStand; titel: string }) {
  return (
    <Gruppe titel={titel} className="" fuss="Verschoben wird, sobald genug zugestimmt haben (Profil → Freigaben).">
      {liste.map((a) => (
        <div key={a.id} className="px-4 py-3">
          <div className="font-buch text-[15px] leading-snug [overflow-wrap:anywhere]">„{zitatOhneZeichen(a.titel)}“</div>
          <AntragLeiste a={a} v={v} className="mt-2" />
        </div>
      ))}
    </Gruppe>
  );
}

/** Beim Prüfen: Zitate laufen nicht immer durch den Wortfilter – hier nur ein Hinweis */
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

/* ====================================================================== */
/* Einstellungen – EIN Blatt hinter dem Zahnrad                           */
/* ====================================================================== */
/**
 * Reihenfolge wie überall in Update 1.4:
 *   1 Abstimmung   2 Ergebnisse   3 Gewinner   4 Offiziell & Inoffiziell
 *   (Lehrerliste)  5 Wer darf was?
 * 1–3 gelten je Teil (Umschalter oben im Blatt), 4–5 für beide.
 */
function ZitateEinstellungen({
  open,
  onClose,
  wand,
  r,
  gw,
  teil,
  v,
}: {
  open: boolean;
  onClose: () => void;
  wand: Zitatwand;
  r: RundenStand;
  gw: GewinnerStand;
  teil: Teil;
  v: VerschiebeStand;
}) {
  const { can } = useRole();
  const leitet = can("zitate.runden");
  const darfPruefen = can("zitate.pruefen");
  const darfKueren = leitet || darfPruefen;
  const wfRecht = useWfRecht();
  const e = useErgebnisSichtbarkeit(open);
  // Welcher Teil wird eingestellt? Beim Öffnen der gerade offene.
  const [t, setT] = useState<Teil>(teil);
  useEffect(() => {
    if (open) setT(teil);
  }, [open, teil]);
  const [start, setStart] = useState<null | (KandidatEingabe & { punkte?: number })[]>(null);
  const [kueren, setKueren] = useState(false);
  const [lehrer, setLehrer] = useState(false);

  const gruppe = rundenGruppe(t);
  const offen = r.offeneVon(gruppe);
  const letzte = r.letzteBeendete(gruppe);
  const runde = offen || letzte;
  const hmZahl = offen ? r.kandidatenVon(offen.id).filter((k) => k.hm).length : 0;
  const wahlZahl = offen ? r.kandidatenVon(offen.id).filter((k) => !k.hm).length : 0;

  // Alles, was im Teil zur Wahl stehen kann – mit Feuer zum Vorsortieren
  // (gemerkt, damit KuerenBlatt seine Auswahl nicht bei jedem Zeichnen verliert)
  const { zitate, stimmenVon } = wand;
  const quellen = useMemo(
    () =>
      zitate
        .filter((z) => z.status === "frei" && z.bereich === t)
        .map((z) => ({ id: z.id, label: zitatLabel(z), unter: zitatUnter(z), punkte: stimmenVon(z.id) })),
    [zitate, stimmenVon, t],
  );

  // Kandidaten zum Küren: aus der letzten Runde des Teils (mit deren Stimmen,
  // Honorable Mentions = Sieger der Herzen dahinter), sonst nach Feuer.
  const kandidaten: Kandidat[] = useMemo(() => {
    if (runde) {
      const ks = r.kandidatenVon(runde.id).map((k) => ({ id: k.ziel_id, label: k.label, unter: k.unter, stimmen: r.zahl(runde.id, k.ziel_id) ?? null, hm: !!k.hm }));
      const nach = (a: { stimmen: number | null }, b: { stimmen: number | null }) => (b.stimmen ?? 0) - (a.stimmen ?? 0);
      return [
        ...ks.filter((k) => !k.hm).sort(nach),
        ...ks.filter((k) => k.hm).sort(nach).map((k) => ({ ...k, unter: `♥ Honorable Mention${k.unter ? ` · ${k.unter}` : ""}` })),
      ];
    }
    return [...quellen].sort((a, b) => b.punkte - a.punkte).map((q) => ({ id: q.id, label: q.label, unter: q.unter, stimmen: wand.zahlenSichtbar ? q.punkte : null }));
  }, [runde, r, quellen, wand.zahlenSichtbar]);

  const g = gw.von(t, "gewinner");
  const h = gw.von(t, "herzen");
  const fehler = (f: string | null) => f && meldeFehler("Ging nicht: " + f);
  const zeigeWf = wfRecht("zitate");

  return (
    <>
      <Sheet open={open} onClose={onClose}>
        <SheetKopf titel="Einstellungen" unter="Zitatwand" onClose={onClose} />

        {darfKueren && (
          <>
            <TeilUmschalter teil={t} setTeil={setT} ohneErklaerung />
            <p className="mt-1.5 px-4 text-[13px] leading-snug text-tinte-leise">Abstimmung, Ergebnis und Gewinner gelten je Teil.</p>
          </>
        )}

        {/* 1 · Abstimmung */}
        {leitet && (
          <Gruppe
            titel={`Abstimmung · ${TEIL_NAME[t]}`}
            fuss={
              offen
                ? "Eine neue Runde beendet die laufende. Zum Abstimmen steht die Runde für alle oben auf der Wand."
                : quellen.length < 2
                  ? "Für eine Runde braucht es mindestens zwei freigegebene Zitate in diesem Teil."
                  : "Die Besten auswählen, Stimmen je Person festlegen – optional mit Sieger der Herzen."
            }
          >
            {offen ? (
              <>
                <Zeile label={`Runde ${offen.nr} läuft`}>
                  <Wert>
                    {r.teilnehmer(offen.id)} {r.teilnehmer(offen.id) === 1 ? "Person" : "Personen"}
                  </Wert>
                </Zeile>
                <div className="flex min-h-[48px] items-center gap-3 px-4 py-2">
                  <span className="min-w-0 flex-1 text-[15px]">Stimmen je Person</span>
                  <Stepper wert={offen.stimmen} max={Math.max(1, Math.min(20, wahlZahl - 1))} label="Stimmen je Person" onChange={async (n) => fehler(await r.aendern(offen.id, { stimmen: n }))} />
                </div>
                {hmZahl >= 2 && (
                  <label className="flex min-h-[48px] items-center gap-3 px-4 py-2">
                    <span className="min-w-0 flex-1 text-[15px]">Sieger der Herzen</span>
                    <Schalter an={!!offen.hm_aktiv} label="Sieger der Herzen" onChange={async (v) => fehler(await r.aendern(offen.id, { hm: v }))} />
                  </label>
                )}
                <Zeile
                  label="Nächste Runde …"
                  onClick={() =>
                    setStart(
                      r
                        .kandidatenVon(offen.id)
                        .filter((k) => !k.hm)
                        .map((k) => ({ id: k.ziel_id, label: k.label, unter: k.unter, punkte: r.zahl(offen.id, k.ziel_id) ?? 0 })),
                    )
                  }
                />
                <Zeile
                  label="Runde beenden"
                  rot
                  onClick={() =>
                    void frage(`Runde ${offen.nr} beenden? Danach kann niemand mehr abstimmen.`, "Beenden", true).then(async (ok) => {
                      if (!ok) return;
                      const f = await r.aendern(offen.id, { offen: false });
                      if (f) fehler(f);
                      else melde("Runde beendet", "erfolg");
                    })
                  }
                />
              </>
            ) : (
              <Zeile label={letzte ? `Runde ${letzte.nr + 1} starten` : "Abstimmungsrunde starten"} onClick={() => setStart(quellen)} disabled={quellen.length < 2}>
                <Wert>{quellen.length} Zitate</Wert>
              </Zeile>
            )}
          </Gruppe>
        )}

        {/* 2 · Ergebnisse */}
        {(leitet || darfPruefen) && (
          <Gruppe titel="Ergebnisse" fuss="Die Feuer-Zahlen gelten für beide Teile. Ergebnisse stehen immer im Segment „Ergebnis“ der Wand.">
            {leitet && runde && (
              <div className="px-4 py-1">
                <SichtbarkeitWahl titel={`Runde ${runde.nr}`} alle={runde.ergebnis_sichtbar} onChange={async (val) => fehler(await r.aendern(runde.id, { ergebnis: val }))} />
              </div>
            )}
            <div className="px-4 py-1">
              <SichtbarkeitWahl
                titel="🔥-Zahlen sehen"
                alle={e.alle.zitate}
                onChange={async (val) => {
                  const f = await e.setzen("zitate", val);
                  if (f) fehler(f);
                  else void wand.neuZaehlen();
                }}
              />
            </div>
          </Gruppe>
        )}

        {/* 3 · Gewinner */}
        {darfKueren && (
          <Gruppe titel={`Gewinner · ${TEIL_NAME[t]}`} fuss={runde ? `Vorschläge aus Runde ${runde.nr}, Honorable Mentions für den Gewinner der Herzen.` : "Vorschläge nach Feuer auf der Wand."}>
            <Zeile label="Gewinner" onClick={() => setKueren(true)}>
              <Wert>{g ? kurz(g) : "Noch keiner"}</Wert>
            </Zeile>
            <Zeile label="Gewinner der Herzen" onClick={() => setKueren(true)}>
              <Wert>{h ? kurz(h) : "Noch keiner"}</Wert>
            </Zeile>
          </Gruppe>
        )}

        {/* 4 · Offiziell & Inoffiziell */}
        {(zeigeWf || darfPruefen) && (
          <Gruppe
            titel="Offiziell & Inoffiziell"
            fuss="Offiziell kommt ins Abibuch – der Wortfilter blockt dort Beleidigungen schon beim Einreichen und beim Verschieben."
          >
            <WortfilterSchalter zeile bereich="zitate" titel="Wortfilter · Offiziell" />
            <WortfilterSchalter zeile bereich="zitate_inoffiziell" titel="Wortfilter · Inoffiziell" />
            {darfPruefen && v.liste.length === 0 && (
              <Zeile label="Verschiebe-Anträge">
                <Wert>Keine offen</Wert>
              </Zeile>
            )}
          </Gruppe>
        )}
        {darfPruefen && v.liste.length > 0 && (
          <div className="mt-4">
            <VerschiebeListe liste={v.liste} v={v} titel="Offene Verschiebe-Anträge" />
          </div>
        )}

        {/* Lehrerliste (auch für das Lehrer-Ranking) */}
        {can("lehrer.verwalten") && (
          <Gruppe titel="Namen" fuss="Die Lehrerliste steht beim Einreichen zur Auswahl und im Lehrer-Ranking.">
            <Zeile label="Lehrerliste pflegen" onClick={() => setLehrer(true)} />
          </Gruppe>
        )}

        {/* 5 · Wer darf was? */}
        <KachelVerwaltung kachel="zitate" />
      </Sheet>

      <Sheet open={lehrer} onClose={() => setLehrer(false)}>
        <SheetKopf titel="Lehrerliste" unter="Zum Auswählen bei Zitaten und im Lehrer-Ranking." onClose={() => setLehrer(false)} />
        <LehrerListe aktiv={lehrer} />
      </Sheet>
      <RundeStartenSheet
        offen={start !== null}
        quellen={start || []}
        gruppe={gruppe}
        gruppeTitel={TEIL_NAME[t]}
        stand={r}
        mitHerz
        wahlTitel="Zitate-Wahl"
        onClose={() => setStart(null)}
      />
      <KuerenBlatt
        open={kueren}
        onClose={() => setKueren(false)}
        titel={`Gewinner küren · ${TEIL_NAME[t]}`}
        kandidaten={kandidaten}
        gewinner={g}
        herzen={h}
        hinweis={t === "offiziell" ? "Der offizielle Gewinner kommt so ins Abibuch." : "Nur für die Stufe – wird nicht gedruckt."}
        onKueren={(art, k) => gw.kueren({ gruppe: t, art, ziel_id: k.id, label: k.label, unter: (k.unter || "").replace(/^♥ Honorable Mention( · )?/, ""), stimmen: k.stimmen ?? null })}
        onZuruecknehmen={(art) => gw.zuruecknehmen(t, art)}
      />
    </>
  );
}

/** Gewinner kurz für eine Zeile: Text ohne Anführungszeichen, gekürzt */
function kurz(g: Gewinner): string {
  const s = zitatOhneZeichen(g.label);
  return s.length > 28 ? s.slice(0, 27) + "…" : s;
}
