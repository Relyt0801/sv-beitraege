import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { Gruppe, Wert, Zeile, ZeileEingabe, ZeileMitSchalter } from "./Liste";
import { FussLeiste as FussLeisteBlatt } from "./FussLeiste";
import { Schalter } from "./Schalter";
import { AusHinweis } from "./Funktionen";
import { useRole } from "../auth/RoleProvider";
import { useFunktionen } from "../lib/funktionen";
import { personVerlauf } from "../lib/album";
import {
  useLehrer,
  useRankings,
  useStufePersonen,
  type Lehrer,
  type RankingArt,
  type RankingKategorie,
  type Rankings,
  type StufenPerson,
} from "../lib/rankings";
import { frage, melde, meldeFehler } from "../lib/melder";
import { GesperrtZeile, GESPERRT_TEXT } from "./Gesperrt";
import { useRunden, type RundenStand } from "../lib/runden";
import { RundenAbschnitt, RundenEinstellungen, RundenStandKarte, RundeStartenSheet, SichtbarkeitWahl } from "./Runden";
import { useErgebnisSichtbarkeit } from "../lib/ergebnisse";
import { Icon } from "./Icon";
import { WortfilterSchalter } from "./AutorInfo";
import { TEIL_NAME, useGewinner, useTeil, useVerschiebungen, type GewinnerArt, type Teil } from "../lib/teile";
import { TEIL_FARBE, TeilMarke, TeilUmschalter, TeilWischer, useVerschiebenRueckfrage } from "./TeilUmschalter";
import { GewinnerBuehne, KuerenBlatt, type Kandidat as KuerKandidat } from "./Gewinner";
import { KachelVerwaltung } from "./KachelVerwaltung";
import { KARTE_KLICK_KLASSE, VerwaltetVon, karteKlick } from "./Kachel";

/**
 * Abi-Rankings: „Wird am ehesten berühmt“ & Co. – je Kategorie eine geheime
 * Stimme für eine Person der Stufe bzw. eine Lehrkraft.
 *
 * Aufbau (Update 1.4):
 *   Startseite      zwei bunte Karten (Schüler | Lehrer) → RankingKarten
 *   Blatt je Art    oben Offiziell/Inoffiziell (TeilUmschalter, wischbar),
 *                   darunter die Stand-Karte („Noch 3 von 8 offen“,
 *                   laufende Runden, Haupt-Aktion), dann ein Segment
 *                   „Abstimmen | Ergebnisse“ (der einzige Weg zu den Ergebnissen):
 *                     Abstimmen   kurze Zeilen, gruppiert nach Runde /
 *                                 offen / abgestimmt (Erledigtes eingeklappt)
 *                     Ergebnisse  Kacheln mit Top 3 (Medaillen) und Gewinner
 *                   Ab 7 Kategorien gibt es eine Suche.
 *   Kategorie       Podest, Gewinner, Runden-Stand ganz oben (mit
 *                   „Runde starten“ für wer leitet), darunter die Wahl. Eine
 *                   Runde heißt überall „Runde“; bei Rankings steht „Stichwahl“
 *                   nur als Erklärung dahinter (Runde 2 – Stichwahl).
 *                   Nach der Stimme geht es von selbst zur nächsten offenen
 *                   Kategorie; am Ende steht „Fertig – alle abgestimmt“.
 *   Zahnrad         EIN Blatt „Einstellungen“ mit allen Gruppen der Spec:
 *                   Runden, Ergebnisse, Gewinner, Offiziell &
 *                   Inoffiziell (Wortfilter je Teil, Verschiebe-Anträge),
 *                   Kategorien, Lehrkräfte, Wer darf was?
 */

const MEDAILLE = ["#E9C460", "#C0C4CC", "#D4A373"];
const kurz = (p: StufenPerson) => `${p.vorname} ${p.nachname ? p.nachname[0] + "." : ""}`.trim();

/** Name zu einer Stimme – Person der Stufe oder Lehrkraft */
function useNamen(personen: StufenPerson[], lehrer: Lehrer[]) {
  return useMemo(() => {
    const m = new Map<string, string>();
    for (const p of personen) m.set(p.id, kurz(p));
    for (const l of lehrer) m.set(l.id, l.name);
    return (id: string | null | undefined) => (id ? m.get(id) || "Unbekannt" : "");
  }, [personen, lehrer]);
}

type NameFn = (id: string | null | undefined) => string;

/** Alles, was in eine Runde kommen kann – mit Punkten aus dem Stand */
function quellenFuer(k: RankingKategorie, r: Rankings, personen: StufenPerson[], lehrer: Lehrer[]) {
  const punkte = new Map((r.stand.find((s) => s.kategorie_id === k.id)?.top || []).map((t) => [t.ziel, t.n]));
  return k.art === "lehrer"
    ? lehrer.filter((l) => l.aktiv).map((l) => ({ id: l.id, label: l.name, punkte: punkte.get(l.id) ?? 0 }))
    : personen.map((p) => ({ id: p.id, label: kurz(p), punkte: punkte.get(p.id) ?? 0 }));
}

/**
 * Wer kommt zum Küren in Frage? Die Kandidaten der letzten Runde (mit
 * ihren Stimmen, auch die Herzens-Kandidaten für den Gewinner der Herzen)
 * und die Top 3 des Rankings – doppelte zusammengefasst, nach Stimmen.
 */
function kuerKandidaten(k: RankingKategorie, r: Rankings, runden: RundenStand, name: NameFn): KuerKandidat[] {
  const m = new Map<string, KuerKandidat>();
  const runde = runden.offeneVon(k.id) || runden.letzteBeendete(k.id);
  if (runde)
    for (const x of runden.kandidatenVon(runde.id))
      m.set(x.ziel_id, { id: x.ziel_id, label: x.label, unter: x.hm ? "Herzens-Kandidat" : `Runde ${runde.nr} – Stichwahl`, stimmen: runden.zahl(runde.id, x.ziel_id) ?? null });
  for (const t of r.stand.find((s) => s.kategorie_id === k.id)?.top || [])
    if (!m.has(t.ziel)) m.set(t.ziel, { id: t.ziel, label: name(t.ziel), stimmen: t.n });
  return [...m.values()].sort((a, b) => (b.stimmen ?? -1) - (a.stimmen ?? -1));
}

/* ====================================================================== */
/* Eine Karte auf der Startseite: Schüler- und Lehrer-Ranking            */
/* ====================================================================== */
/** Startseite: je Ranking eine kräftige Farbe (Verlauf nur innerhalb der Farbe) */
const KARTEN_STIL: Record<RankingArt, { verlauf: string; schatten: string; text: string }> = {
  schueler: { verlauf: "from-[#0A84FF] to-[#0062CC]", schatten: "shadow-[0_12px_28px_-14px_rgba(0,98,204,.8)]", text: "text-[#0062CC]" },
  lehrer: { verlauf: "from-[#30B85A] to-[#1E8C42]", schatten: "shadow-[0_12px_28px_-14px_rgba(30,140,66,.8)]", text: "text-[#1E7A3B]" },
};

const ART_STIL: Record<RankingArt, { titel: string; kurz: string }> = {
  schueler: { titel: "Schüler-Ranking", kurz: "Schüler" },
  lehrer: { titel: "Lehrer-Ranking", kurz: "Lehrer" },
};

export function RankingKarten({ className = "" }: { className?: string }) {
  const { can, isEltern, uid } = useRole();
  const { sichtbar } = useFunktionen();
  const darf = !isEltern && sichtbar("rankings") && (can("rankings.nutzen") || can("rankings.verwalten"));
  const [offen, setOffen] = useState<RankingArt | null>(null);
  const r = useRankings(darf, uid, offen !== null);
  const runden = useRunden("rankings", darf, uid, can("rankings.runden"));
  if (!darf) return null;

  return (
    <div className={`flex flex-col ${className}`}>
      <AusHinweis funktion="rankings" className="mb-1.5 px-1" />
      <div className="grid flex-1 grid-cols-2 gap-3">
        {(["schueler", "lehrer"] as RankingArt[]).map((art) => {
          const stil = KARTEN_STIL[art];
          const aktive = r.kategorien.filter((k) => k.aktiv && k.art === art);
          const offenAnzahl = aktive.filter((k) => !(k.id in r.meine)).length;
          const wahlen = runden.offene.filter((x) => aktive.some((k) => k.id === x.gruppe)).length;
          return (
            <section
              key={art}
              // Ganze Karte antippbar (öffnet das Blatt); der Knopf unten bleibt als Hinweis
              {...karteKlick(() => setOffen(art), `${ART_STIL[art].titel} öffnen`)}
              className={`relative flex min-h-[164px] flex-col overflow-hidden rounded-[1.4rem] bg-gradient-to-br p-3.5 text-white sm:p-5 ${KARTE_KLICK_KLASSE} ${stil.verlauf} ${stil.schatten}`}
            >
              {/* Kleines Siegertreppchen oben rechts */}
              <div aria-hidden className="pointer-events-none absolute right-3.5 top-3.5 flex items-end gap-[2px] opacity-90 sm:right-5 sm:top-5">
                {[
                  { h: 15, f: MEDAILLE[1], n: 2 },
                  { h: 22, f: MEDAILLE[0], n: 1 },
                  { h: 10, f: MEDAILLE[2], n: 3 },
                ].map((x) => (
                  <span key={x.n} className="w-[14px] rounded-t-[3px] sm:w-5" style={{ height: x.h, background: x.f }} />
                ))}
              </div>
              {/* Platz für das Treppchen (Handy 46 px, ab sm 64 px) plus Luft – sonst läuft der Text hinein */}
              <div className="pr-14 text-[12px] font-semibold uppercase tracking-[0.02em] text-white/80 sm:pr-[4.5rem]">Abi-Ranking</div>
              <div className="mt-0.5 text-[1.2rem] font-bold leading-tight">{ART_STIL[art].kurz}</div>
              <div className="mt-1 text-[12.5px] leading-snug text-white/80">
                {wahlen
                  ? `${wahlen} ${wahlen === 1 ? "Runde läuft" : "Runden laufen"}`
                  : aktive.length
                    ? offenAnzahl
                      ? `Noch ${offenAnzahl} von ${aktive.length} offen`
                      : `Alle ${aktive.length} abgestimmt`
                    : "Noch keine Kategorien"}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOffen(art);
                }}
                className={`mt-auto inline-flex min-h-[44px] items-center self-start rounded-full bg-white px-4 text-[13.5px] font-semibold shadow-sm transition active:scale-95 ${stil.text}`}
              >
                {offenAnzahl > 0 || wahlen ? "Abstimmen" : "Ergebnisse"}
              </button>
            </section>
          );
        })}
      </div>
      <RankingSheet art={offen} onClose={() => setOffen(null)} r={r} runden={runden} />
    </div>
  );
}

/* ====================================================================== */
/* Blatt je Ranking                                                       */
/* ====================================================================== */
type Ansicht = "abstimmen" | "ergebnisse";

/** Darf jemand irgendetwas im Zahnrad-Blatt? */
function useDarfEinstellungen() {
  const { can, isAdmin } = useRole();
  return isAdmin || can("rankings.verwalten") || can("rankings.runden") || can("lehrer.verwalten") || can("wortfilter.verwalten") || can("perms.manage");
}

function RankingSheet({ art, onClose, r, runden }: { art: RankingArt | null; onClose: () => void; r: Rankings; runden: RundenStand }) {
  const { can } = useRole();
  const open = art !== null;
  const personen = useStufePersonen(open);
  const { lehrer } = useLehrer(open);
  const name = useNamen(personen, lehrer);
  const gewinner = useGewinner("rankings", open);
  const [teil, setTeil] = useTeil("rankings");
  const [wahlId, setWahlId] = useState<string | null>(null);
  const [einstellungen, setEinstellungen] = useState(false);
  const [kueren, setKueren] = useState<RankingKategorie | null>(null);
  // „Fertig – alle abgestimmt“ nach der letzten offenen Kategorie
  const [fertig, setFertig] = useState(false);
  const [neuOffen, setNeuOffen] = useState(false);
  const [ansichtWahl, setAnsicht] = useState<Ansicht | null>(null);
  const [suche, setSuche] = useState("");
  const darfEinstellungen = useDarfEinstellungen();
  const darfKueren = can("rankings.runden") || can("rankings.verwalten");
  const zuletzt = art ?? "schueler";
  const topSichtbar = useTopSichtbar();

  const alleArt = r.kategorien.filter((k) => k.aktiv && k.art === zuletzt);
  const imTeil = alleArt.filter((k) => k.bereich === teil);
  const q = suche.trim().toLowerCase();
  const gefiltert = q ? imTeil.filter((k) => k.titel.toLowerCase().includes(q)) : imTeil;
  const offenAnzahl = imTeil.filter((k) => !(k.id in r.meine)).length;
  // Die Kachel zählt beide Teile („Noch 8 von 8 offen“) – das Blatt zeigt einen
  // Teil. Was im anderen Teil noch offen ist, steht darum in der Stand-Karte.
  const andererTeil: Teil = teil === "offiziell" ? "inoffiziell" : "offiziell";
  const offenAnders = alleArt.filter((k) => k.bereich === andererTeil && !(k.id in r.meine)).length;
  // Beim Öffnen: ist im gemerkten Teil alles erledigt, im anderen aber nicht,
  // gleich dorthin (nur einmal je Öffnen, nie mitten im Abstimmen).
  const teilGeprueft = useRef(false);
  // vor dem Zeichnen, damit nicht kurz der erledigte Teil aufblitzt
  useLayoutEffect(() => {
    if (!open) {
      teilGeprueft.current = false;
      return;
    }
    if (teilGeprueft.current || !r.bereit || alleArt.length === 0) return;
    teilGeprueft.current = true;
    if (offenAnzahl === 0 && offenAnders > 0) setTeil(andererTeil);
  }, [open, r.bereit, alleArt.length, offenAnzahl, offenAnders, andererTeil, setTeil]);
  // Ohne eigene Wahl: gibt es noch Offenes, zuerst „Abstimmen“, sonst „Ergebnisse“
  const ansicht: Ansicht = ansichtWahl ?? (offenAnzahl > 0 || imTeil.some((k) => runden.offeneVon(k.id)) ? "abstimmen" : "ergebnisse");
  const wahl = wahlId ? r.kategorien.find((k) => k.id === wahlId) || null : null;

  const schliessen = () => {
    setWahlId(null);
    setSuche("");
    setAnsicht(null);
    setEinstellungen(false);
    setFertig(false);
    setNeuOffen(false);
    onClose();
  };

  /**
   * Nach einer neuen Stimme: die nächste offene Kategorie dieser Art und dieses
   * Teils (nach der aktuellen, sonst von vorn). Kategorien mit laufender Runde
   * überspringen wir – die stehen oben in der Übersicht. null = alles erledigt.
   */
  const naechsteOffene = (aktuellId: string): RankingKategorie | null => {
    const offene = imTeil.filter((x) => x.id !== aktuellId && !(x.id in r.meine) && !runden.offeneVon(x.id));
    if (!offene.length) return null;
    const i = imTeil.findIndex((x) => x.id === aktuellId);
    return offene.find((x) => imTeil.indexOf(x) > i) ?? offene[0];
  };
  const nachStimme = (k: RankingKategorie) => {
    const n = naechsteOffene(k.id);
    if (n) {
      melde(`Gespeichert – weiter mit „${n.titel}“`, "erfolg");
      setWahlId(n.id);
    } else {
      melde("Gespeichert", "erfolg");
      setWahlId(null);
      setFertig(true);
    }
  };
  return (
    <>
      {/* Bleibt offen unter Einstellungen/Küren: die stehen als Unterseite an seiner Stelle („‹ …“) */}
      <Sheet hoch open={open} onClose={schliessen}>
        {wahl ? (
          <Abstimmen
            key={wahl.id}
            k={wahl}
            r={r}
            runden={runden}
            personen={personen}
            lehrer={lehrer}
            name={name}
            gewinner={gewinner}
            onKueren={darfKueren ? () => setKueren(wahl) : undefined}
            onGestimmt={() => nachStimme(wahl)}
            zurueck={() => setWahlId(null)}
            onClose={schliessen}
          />
        ) : fertig ? (
          <FertigAnsicht
            titel={ART_STIL[zuletzt].titel}
            anzahl={imTeil.length}
            onClose={schliessen}
            onUebersicht={() => setFertig(false)}
            onErgebnisse={() => {
              setAnsicht("ergebnisse");
              setFertig(false);
            }}
          />
        ) : (
          <>
            <SheetKopf
              titel={ART_STIL[zuletzt].titel}
              unter="Geheim: gezählt wird nur, wie oft jemand gewählt wurde."
              onClose={schliessen}
              extra={
                <>
                  {darfEinstellungen && <ZahnradKnopf label="Einstellungen" onClick={() => setEinstellungen(true)} />}
                  {/* „+“ wie bei Motto und Zitaten: neue Kategorie anlegen */}
                  {can("rankings.verwalten") && (
                    <button
                      type="button"
                      onClick={() => setNeuOffen(true)}
                      aria-label="Kategorie anlegen"
                      className="-my-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90"
                    >
                      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-brand text-[18px] font-bold leading-none text-white">+</span>
                    </button>
                  )}
                </>
              }
            />
            <AusHinweis funktion="rankings" className="-mt-2 mb-3" />
            <GesperrtZeile className="-mt-1 mb-3" />
            <TeilUmschalter
              teil={teil}
              setTeil={(t) => {
                setTeil(t);
                setSuche("");
              }}
              zahlen={{ offiziell: alleArt.filter((k) => k.bereich === "offiziell").length, inoffiziell: alleArt.filter((k) => k.bereich === "inoffiziell").length }}
              className="mb-4"
            />
            <TeilWischer teil={teil} setTeil={setTeil}>
              <StandKarte
                art={zuletzt}
                teil={teil}
                kategorien={imTeil}
                r={r}
                runden={runden}
                onOeffnen={(k) => setWahlId(k.id)}
                anders={offenAnders > 0 ? { anzahl: offenAnders, teil: andererTeil, wechseln: () => (setTeil(andererTeil), setSuche("")) } : undefined}
              />

              {/* Ein Weg zu den Ergebnissen: dieses Segment (die Karte oben hat keinen zweiten Knopf mehr) */}
              {imTeil.length > 0 && (
                <div className="seg mb-3 mt-4" role="tablist" aria-label="Ansicht">
                  {(["abstimmen", "ergebnisse"] as Ansicht[]).map((a) => (
                    <button key={a} role="tab" aria-selected={ansicht === a} className={`seg-item ${ansicht === a ? "seg-aktiv" : ""}`} onClick={() => setAnsicht(a)}>
                      {a === "abstimmen" ? "Abstimmen" : "Ergebnisse"}
                    </button>
                  ))}
                </div>
              )}

              {imTeil.length > 6 && (
                <label className="relative mb-3 block">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-tinte-leise">
                    <Icon name="lupe" size={16} />
                  </span>
                  <input className="field !py-2.5 !pl-10 !text-[15px]" placeholder="Kategorie suchen" value={suche} onChange={(e) => setSuche(e.target.value)} />
                </label>
              )}

              {imTeil.length === 0 ? (
                <LeerHinweis teil={teil} darfAnlegen={can("rankings.verwalten")} onAnlegen={() => setNeuOffen(true)} />
              ) : gefiltert.length === 0 ? (
                <p className="py-6 text-center text-[14px] text-tinte-leise">Keine Kategorie mit „{suche.trim()}“.</p>
              ) : ansicht === "abstimmen" ? (
                <AbstimmListe kategorien={gefiltert} r={r} runden={runden} name={name} topSichtbar={topSichtbar} onOeffnen={(k) => setWahlId(k.id)} />
              ) : (
                <ErgebnisKacheln kategorien={gefiltert} r={r} name={name} topSichtbar={topSichtbar} gewinner={gewinner} onOeffnen={(k) => setWahlId(k.id)} />
              )}
            </TeilWischer>
            <VerwaltetVon bereich="Die Rankings" komitee="Abizeitung" darf={darfEinstellungen} />
          </>
        )}
      </Sheet>
      <KategorieNeuSheet open={open && neuOffen} onClose={() => setNeuOffen(false)} r={r} art={zuletzt} startTeil={teil} />
      <RankingEinstellungen
        open={open && einstellungen}
        onClose={() => setEinstellungen(false)}
        r={r}
        runden={runden}
        startArt={zuletzt}
        teil={teil}
        setTeil={setTeil}
        onKueren={setKueren}
        gewinner={gewinner}
      />
      <KuerenFuerKategorie
        k={kueren}
        r={r}
        runden={runden}
        name={name}
        gewinner={gewinner}
        onClose={() => setKueren(null)}
        // Nach dem Küren: Einstellungen zu, die Kategorie mit der Gewinner-Bühne zeigen
        onFertig={(k) => {
          setEinstellungen(false);
          setWahlId(k.id);
        }}
      />
    </>
  );
}

/** Ende der Abstimmung: alles abgestimmt */
function FertigAnsicht({ titel, anzahl, onClose, onUebersicht, onErgebnisse }: { titel: string; anzahl: number; onClose: () => void; onUebersicht: () => void; onErgebnisse: () => void }) {
  return (
    <div className="animate-popIn">
      <SheetKopf titel={titel} onClose={onClose} />
      <div className="flex flex-col items-center px-2 py-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#34C759] text-white">
          <Icon name="haken" size={32} strich={3} />
        </span>
        <div className="mt-4 text-[1.3rem] font-bold tracking-[-0.01em]">Fertig – alle abgestimmt</div>
        <p className="auf-bild mt-1.5 max-w-xs text-[14px] leading-snug text-tinte-leise">
          Du hast in {anzahl === 1 ? "der Kategorie" : `allen ${anzahl} Kategorien`} abgestimmt. Danke! In der Übersicht kannst du jede Stimme noch ändern.
        </p>
      </div>
      <button type="button" className="btn-primary" onClick={onUebersicht}>
        Zur Übersicht
      </button>
      <button type="button" className="btn-grau mt-2" onClick={onErgebnisse}>
        Ergebnisse ansehen
      </button>
    </div>
  );
}

/** Leerer Teil: sagen, was als Nächstes zu tun ist */
function LeerHinweis({ teil, darfAnlegen, onAnlegen }: { teil: Teil; darfAnlegen: boolean; onAnlegen: () => void }) {
  return (
    <div className="feld-grau mt-4 flex flex-col items-center px-5 py-7 text-center">
      <span className={`flex h-11 w-11 items-center justify-center rounded-full ${TEIL_FARBE[teil].grund} ${TEIL_FARBE[teil].text}`}>
        <Icon name="pokal" size={20} />
      </span>
      <div className="mt-2.5 text-[15px] font-semibold">Noch keine {teil === "offiziell" ? "offiziellen" : "inoffiziellen"} Kategorien</div>
      <p className="mt-1 text-[13px] leading-snug text-tinte-leise">
        {darfAnlegen ? "Leg die erste an – sie landet in diesem Teil." : "Wisch zur Seite – vielleicht gibt es im anderen Teil schon etwas."}
      </p>
      {darfAnlegen && (
        <button className="btn-klein mt-3.5" onClick={onAnlegen}>
          Kategorie anlegen
        </button>
      )}
    </div>
  );
}

/**
 * Stand oben im Blatt: wie viele Kategorien noch offen sind, laufende
 * Runden (je eine Zeile, antippen öffnet sie) und die Haupt-Aktion.
 */
function StandKarte({
  art,
  teil,
  kategorien,
  r,
  runden,
  onOeffnen,
  anders,
}: {
  art: RankingArt;
  teil: Teil;
  kategorien: RankingKategorie[];
  r: Rankings;
  runden: RundenStand;
  onOeffnen: (k: RankingKategorie) => void;
  /** Offenes im anderen Teil – mit Sprung dorthin */
  anders?: { anzahl: number; teil: Teil; wechseln: () => void };
}) {
  if (!kategorien.length) return null;
  const stil = KARTEN_STIL[art];
  const offen = kategorien.filter((k) => !(k.id in r.meine));
  const fertig = kategorien.length - offen.length;
  const stichwahlen = kategorien.map((k) => ({ k, runde: runden.offeneVon(k.id) })).filter((x) => x.runde);
  return (
    <section className={`relative overflow-hidden rounded-[1.4rem] bg-gradient-to-br p-4 text-white ${stil.verlauf} ${stil.schatten}`}>
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
      <div className="relative flex items-center gap-2">
        <TeilMarke teil={teil} hell />
        <span className="zahl ml-auto text-[12.5px] font-semibold text-white/80">
          {fertig} / {kategorien.length}
        </span>
      </div>
      <div className="relative mt-2 text-[1.25rem] font-bold leading-tight tracking-[-0.01em]">
        {offen.length ? `Noch ${offen.length} ${offen.length === 1 ? "Kategorie" : "Kategorien"} offen` : "Alles abgestimmt"}
      </div>
      {anders && (
        <button
          type="button"
          onClick={anders.wechseln}
          className="relative -my-1.5 flex min-h-[44px] items-center gap-1 text-left text-[13px] font-semibold text-white/90 transition active:opacity-60"
        >
          + {anders.anzahl} offen in „{TEIL_NAME[anders.teil]}“
          <span aria-hidden className="text-[15px] leading-none">›</span>
        </button>
      )}
      <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-white/25" aria-hidden>
        <div className="h-full rounded-full bg-white transition-[width] duration-700 ease-ios" style={{ width: `${Math.round((fertig / kategorien.length) * 100)}%` }} />
      </div>

      {stichwahlen.length > 0 && (
        <div className="relative mt-3 space-y-1.5">
          {stichwahlen.slice(0, 3).map(({ k, runde }) => {
            const uebrig = Math.max(0, runde!.stimmen - runden.meineIn(runde!.id).length);
            return (
              <button key={k.id} onClick={() => onOeffnen(k)} className="flex w-full items-center gap-2.5 rounded-xl bg-white/15 px-3 py-2 text-left transition active:scale-[.99]">
                <Icon name="stimme" size={15} strich={2.4} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{k.titel}</span>
                  <span className="block text-[12px] text-white/80">
                    Runde {runde!.nr} – Stichwahl · {uebrig ? `noch ${uebrig} ${uebrig === 1 ? "Stimme" : "Stimmen"}` : "abgestimmt"}
                  </span>
                </span>
                <span aria-hidden className="text-[17px] leading-none text-white/80">›</span>
              </button>
            );
          })}
          {stichwahlen.length > 3 && <div className="px-1 text-[12px] text-white/80">… und {stichwahlen.length - 3} weitere unten</div>}
        </div>
      )}

      {/* Nur EIN Weg zu den Ergebnissen: das Segment darunter. Hier nur die Haupt-Aktion. */}
      {offen.length > 0 && (
        <div className="relative mt-3.5 flex flex-wrap gap-2">
          <button onClick={() => onOeffnen(offen[0])} className={`min-h-[44px] rounded-full bg-white px-5 text-[14px] font-semibold shadow-sm transition active:scale-95 ${stil.text}`}>
            Weiter abstimmen
          </button>
        </div>
      )}
    </section>
  );
}

/** Abstimmen: kurze Zeilen, gruppiert – Runde, offen, abgestimmt (eingeklappt) */
function AbstimmListe({
  kategorien,
  r,
  runden,
  name,
  topSichtbar,
  onOeffnen,
}: {
  kategorien: RankingKategorie[];
  r: Rankings;
  runden: RundenStand;
  name: NameFn;
  topSichtbar: boolean;
  onOeffnen: (k: RankingKategorie) => void;
}) {
  const [alleZeigen, setAlleZeigen] = useState(false);
  const stich = kategorien.filter((k) => runden.offeneVon(k.id));
  const rest = kategorien.filter((k) => !runden.offeneVon(k.id));
  const offen = rest.filter((k) => !(k.id in r.meine));
  const erledigt = rest.filter((k) => k.id in r.meine);
  const sichtbarErledigt = alleZeigen || erledigt.length <= 4 ? erledigt : erledigt.slice(0, 3);

  const zeile = (k: RankingKategorie) => {
    const runde = runden.offeneVon(k.id);
    const hat = k.id in r.meine;
    const vorn = r.stand.find((s) => s.kategorie_id === k.id)?.top[0];
    const unter = runde
      ? `Runde ${runde.nr} – Stichwahl · ${Math.max(0, runde.stimmen - runden.meineIn(runde.id).length) || "keine"} ${runde.stimmen === 1 ? "Stimme" : "Stimmen"} übrig`
      : hat
        ? `Deine Stimme: ${r.meine[k.id] ? name(r.meine[k.id]) : "Weiß nicht"}`
        : "Noch nicht abgestimmt";
    return (
      <button
        key={k.id}
        type="button"
        onClick={() => onOeffnen(k)}
        className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
      >
        <span
          aria-hidden
          className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full ${
            runde ? "bg-brand/12 text-brand" : hat ? "bg-[#34C759] text-white" : "border-[1.5px] border-brand/60"
          }`}
        >
          {runde ? <Icon name="stimme" size={12} strich={2.6} /> : hat ? <Icon name="haken" size={12} strich={3} /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] leading-snug">{k.titel}</span>
          <span className={`block truncate text-[12.5px] ${runde ? "font-semibold text-brand-dark dark:text-brand" : "text-tinte-leise"}`}>{unter}</span>
        </span>
        {topSichtbar && vorn && (
          <span className="flex max-w-[34%] shrink-0 items-center gap-1.5 text-[12.5px] text-tinte-matt dark:text-slate-300">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: MEDAILLE[0] }} />
            <span className="truncate">{name(vorn.ziel)}</span>
          </span>
        )}
        <span aria-hidden className="shrink-0 text-[17px] leading-none text-tinte-leise">›</span>
      </button>
    );
  };

  return (
    <div className="space-y-1">
      {stich.length > 0 && <Gruppe titel="Runde läuft" className="">{stich.map(zeile)}</Gruppe>}
      {offen.length > 0 && <Gruppe titel={`Noch offen · ${offen.length}`} className={stich.length ? "mt-4" : ""}>{offen.map(zeile)}</Gruppe>}
      {erledigt.length > 0 && (
        <Gruppe titel={`Abgestimmt · ${erledigt.length}`} className={stich.length || offen.length ? "mt-4" : ""} fuss="Antippen, um die Stimme zu ändern.">
          {sichtbarErledigt.map(zeile)}
          {sichtbarErledigt.length < erledigt.length && (
            <button type="button" onClick={() => setAlleZeigen(true)} className="flex min-h-[48px] w-full items-center px-4 text-left text-[15px] text-brand">
              Alle {erledigt.length} zeigen
            </button>
          )}
        </Gruppe>
      )}
    </div>
  );
}

/** Ergebnisse: Kacheln mit Top 3 und gekürtem Gewinner – zwei je Reihe */
function ErgebnisKacheln({
  kategorien,
  r,
  name,
  topSichtbar,
  gewinner,
  onOeffnen,
}: {
  kategorien: RankingKategorie[];
  r: Rankings;
  name: NameFn;
  topSichtbar: boolean;
  gewinner: ReturnType<typeof useGewinner>;
  onOeffnen: (k: RankingKategorie) => void;
}) {
  return (
    <>
      {!topSichtbar && (
        <p className="mb-3 px-1 text-[13px] leading-snug text-tinte-leise">Die Plätze gibt das Komitee frei – bis dahin siehst du nur, wie viele abgestimmt haben.</p>
      )}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {kategorien.map((k) => {
          const st = r.stand.find((s) => s.kategorie_id === k.id);
          const g = gewinner.von(k.id, "gewinner");
          const h = gewinner.von(k.id, "herzen");
          return (
            <button
              key={k.id}
              onClick={() => onOeffnen(k)}
              className="flex flex-col rounded-2xl bg-[rgb(var(--zelle))] p-3 text-left shadow-[0_1px_3px_rgba(0,0,0,.05)] transition active:scale-[.98]"
            >
              {/* Titel darf mehrzeilig umbrechen – nichts wird mehr mit „…“ abgeschnitten */}
              <span className="min-h-[2.5em] text-[13.5px] font-semibold leading-snug [overflow-wrap:anywhere]">{k.titel}</span>
              {(g || h) && (
                <span className="mt-1.5 flex flex-col gap-0.5">
                  {g && (
                    <span className="flex items-center gap-1 truncate rounded-full bg-[#F5B53F]/20 px-2 py-0.5 text-[12px] font-bold text-[#9A5B00] dark:text-[#FFD66B]">
                      <Krone /> <span className="truncate">{g.label}</span>
                    </span>
                  )}
                  {h && (
                    <span className="flex items-center gap-1 truncate rounded-full bg-[#FF4F7B]/15 px-2 py-0.5 text-[12px] font-bold text-[#C2185B] dark:text-[#FF8FB1]">
                      <Icon name="herz" size={12} strich={2.4} /> <span className="truncate">{h.label}</span>
                    </span>
                  )}
                </span>
              )}
              {topSichtbar ? (
                <ol className="mt-2 space-y-1">
                  {[0, 1, 2].map((i) => {
                    const t = st?.top[i];
                    return (
                      <li key={i} className="flex items-center gap-1.5 text-[12.5px]">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold leading-none text-[#1C1C1E]" style={{ background: MEDAILLE[i] }}>
                          {i + 1}
                        </span>
                        <span className={`min-w-0 flex-1 truncate ${t ? "font-medium" : "text-tinte-leise"}`}>{t ? name(t.ziel) : "–"}</span>
                        {t && <span className="zahl shrink-0 text-[12px] font-semibold text-tinte-leise">{t.n}</span>}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <span className="mt-2 text-[12.5px] text-tinte-leise">{st?.stimmen ? `${st.stimmen} ${st.stimmen === 1 ? "Stimme" : "Stimmen"}` : "Noch keine Stimmen"}</span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

function Krone() {
  return (
    <svg width={11} height={11} viewBox="0 0 24 24" fill="currentColor" aria-hidden className="shrink-0">
      <path d="M3 8.2l4.6 3.6L12 4.5l4.4 7.3L21 8.2l-1.9 10.3H4.9L3 8.2z" />
    </svg>
  );
}

/** Dürfen die Top 3 gezeigt werden? (Komitee immer, sonst nur, wenn für alle freigegeben) */
function useTopSichtbar(): boolean {
  const { can } = useRole();
  const { alle } = useErgebnisSichtbarkeit(true);
  return alle.rankings || can("rankings.verwalten") || can("rankings.runden");
}

/* ---------------------------------------------------------------- Küren */
function KuerenFuerKategorie({
  k,
  r,
  runden,
  name,
  gewinner,
  onClose,
  onFertig,
}: {
  k: RankingKategorie | null;
  r: Rankings;
  runden: RundenStand;
  name: NameFn;
  gewinner: ReturnType<typeof useGewinner>;
  onClose: () => void;
  /** Nach erfolgreichem Küren (Kategorie, die gekürt wurde) – schließt Einstellungen, zeigt die Bühne */
  onFertig?: (k: RankingKategorie) => void;
}) {
  // Nur neu bauen, wenn sich wirklich etwas ändert – sonst setzt das
  // KuerenBlatt bei jedem Neuladen (alle 15 s) die Auswahl zurück.
  const roh = k ? kuerKandidaten(k, r, runden, name) : [];
  const schluessel = JSON.stringify(roh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const kandidaten = useMemo(() => roh, [schluessel]);
  return (
    <KuerenBlatt
      open={!!k}
      onClose={onClose}
      titel={k ? `Küren · ${k.titel}` : "Küren"}
      kandidaten={kandidaten}
      gewinner={k ? gewinner.von(k.id, "gewinner") : null}
      herzen={k ? gewinner.von(k.id, "herzen") : null}
      onKueren={(art: GewinnerArt, x, leise) => gewinner.kueren({ gruppe: k!.id, art, ziel_id: x.id, label: x.label, unter: "", stimmen: x.stimmen ?? null }, leise)}
      onZuruecknehmen={(art: GewinnerArt) => gewinner.zuruecknehmen(k!.id, art)}
      onFertig={() => k && onFertig?.(k)}
      hinweis={k?.bereich === "offiziell" ? "Offizielle Gewinner kommen ins Abibuch." : "Inoffiziell: nur die Stufe sieht es."}
    />
  );
}

/* ---------------------------------------------------------------- Abstimmen */
function Abstimmen({
  k,
  r,
  runden,
  personen,
  lehrer,
  name,
  gewinner,
  onKueren,
  onGestimmt,
  zurueck,
  onClose,
}: {
  k: RankingKategorie;
  r: Rankings;
  runden: RundenStand;
  personen: StufenPerson[];
  lehrer: Lehrer[];
  name: NameFn;
  gewinner: ReturnType<typeof useGewinner>;
  onKueren?: () => void;
  /** Erste Stimme in dieser Kategorie ist gespeichert → Blatt springt zur nächsten offenen */
  onGestimmt?: () => void;
  zurueck: () => void;
  onClose: () => void;
}) {
  const { banned, can } = useRole();
  // Kurze Pause nach der Stimme, damit man die Auswahl noch aufleuchten sieht;
  // neuester Rückruf per Ref, der Timer räumt beim Verlassen auf.
  const gestimmtRef = useRef(onGestimmt);
  gestimmtRef.current = onGestimmt;
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  const stichwahl = runden.offeneVon(k.id);
  const quellen = quellenFuer(k, r, personen, lehrer);
  const st = r.stand.find((s) => s.kategorie_id === k.id);
  const topSichtbar = useTopSichtbar();
  const leitet = can("rankings.runden");
  const g = gewinner.von(k.id, "gewinner");
  const h = gewinner.von(k.id, "herzen");
  const aktiveLehrer = lehrer.filter((l) => l.aktiv);
  return (
    <div className="animate-vonRechts">
      {/* Derselbe klebende Kopf wie überall: „‹ Schüler-Ranking“, Titel, ✕ */}
      <SheetKopf titel={k.titel} zurueck={{ text: ART_STIL[k.art].titel, onClick: zurueck }} onClose={onClose} />

      {/* Teil, Art, Podest – das Wichtigste ohne Scrollen (Titel steht im Kopf) */}
      <div className="feld-grau mt-1 p-4 shadow-[0_1px_3px_rgba(0,0,0,.05)]">
        <div className="flex items-center gap-2">
          <TeilMarke teil={k.bereich} />
          <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-tinte-leise">{ART_STIL[k.art].kurz}</span>
        </div>
        {topSichtbar ? (
          <div className="mt-3 flex items-end justify-center gap-2">
            {[1, 0, 2].map((i) => {
              const t = st?.top[i];
              return (
                <div key={i} className="flex w-1/3 flex-col items-center">
                  <span className="mb-1 w-full truncate text-center text-[12.5px] font-semibold">{t ? name(t.ziel) : "–"}</span>
                  <span
                    className="flex w-full items-start justify-center rounded-t-xl pt-1 text-[13px] font-bold text-[#1C1C1E]"
                    style={{ height: [50, 36, 26][i], background: MEDAILLE[i] }}
                  >
                    {t ? t.n : ""}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-1 text-[13px] text-tinte-leise">
            {st?.stimmen ? `${st.stimmen} ${st.stimmen === 1 ? "Stimme" : "Stimmen"} bisher` : "Noch keine Stimmen"} · Plätze gibt das Komitee frei.
          </p>
        )}
        {onKueren && (
          <div className="mt-3 flex gap-2">
            <button className="btn-klein-grau flex-1 !text-[13.5px]" onClick={onKueren}>
              <Icon name="pokal" size={15} /> {g || h ? "Gewinner ändern" : "Gewinner küren"}
            </button>
          </div>
        )}
      </div>

      {(g || h) && (
        <div className="mt-3">
          <GewinnerBuehne gewinner={g} herzen={h} klein />
        </div>
      )}

      <GesperrtZeile className="mt-3" />

      {/* Runden-Stand oben, „Runde starten“ für wer leitet (die erste Runde heißt Stichwahl) */}
      <RundenStandKarte
        stand={runden}
        gruppe={k.id}
        gruppeTitel={k.titel}
        quellen={quellen}
        leitet={leitet}
        gesperrt={banned}
        startText="Runde starten"
        wahlTitel="Stichwahl"
        standardName="Stichwahl"
        mitHerz
        className="mt-3"
      />

      <div className="mt-4">
        <RundenAbschnitt
          stand={runden}
          gruppe={k.id}
          gruppeTitel={k.titel}
          quellen={quellen}
          leitet={leitet}
          gesperrt={banned}
          startText="Runde starten"
          wahlTitel="Stichwahl"
          standardName="Stichwahl"
          nurWahl
        />
      </div>

      {!stichwahl && (
        <>
          <p className="mb-2 px-1 text-[13px] text-tinte-leise">
            {k.id in r.meine ? `Deine Stimme: ${r.meine[k.id] ? name(r.meine[k.id]) : "Weiß nicht"} – du kannst sie ändern.` : "Wähle aus:"}
          </p>
          <ZielWahl
            art={k.art}
            personen={personen}
            lehrer={aktiveLehrer}
            wert={r.meine[k.id]}
            gewaehlt={k.id in r.meine}
            setzen={async (ziel) => {
              if (banned) return meldeFehler(GESPERRT_TEXT);
              const warOffen = !(k.id in r.meine);
              const f = await r.abstimmen(k.id, ziel);
              if (f) return meldeFehler("Ging nicht: " + f);
              if (!warOffen || !gestimmtRef.current) return melde("Stimme geändert", "erfolg");
              // Erste Stimme: kurz die Auswahl zeigen, dann weiter zur nächsten offenen Kategorie
              if (timer.current) window.clearTimeout(timer.current);
              timer.current = window.setTimeout(() => gestimmtRef.current?.(), 450);
            }}
          />
        </>
      )}
    </div>
  );
}

/** Auswahl einer Person der Stufe oder einer Lehrkraft (auch in Pop-up-Umfragen) */
export function ZielWahl({
  art,
  personen,
  lehrer,
  wert,
  gewaehlt,
  setzen,
}: {
  art: RankingArt;
  personen: StufenPerson[];
  lehrer: Lehrer[];
  wert: string | null | undefined;
  /** true: es gibt schon eine Antwort (auch „weiß nicht“) */
  gewaehlt: boolean;
  setzen: (ziel: string | null) => void;
}) {
  const [suche, setSuche] = useState("");
  const q = suche.trim().toLowerCase();
  const liste =
    art === "schueler"
      ? personen.filter((p) => !q || `${p.vorname} ${p.nachname}`.toLowerCase().includes(q)).map((p) => ({ id: p.id, oben: p.vorname, unten: p.nachname, kuerzel: `${p.vorname[0] || ""}${p.nachname[0] || ""}` }))
      : lehrer.filter((l) => !q || `${l.name} ${l.faecher}`.toLowerCase().includes(q)).map((l) => ({ id: l.id, oben: l.name, unten: l.faecher, kuerzel: l.name.replace(/^(Frau|Herr|Fr\.|Hr\.)\s+/i, "").slice(0, 2).toUpperCase() }));

  return (
    <>
      <input className="field mb-2" placeholder={art === "schueler" ? "Name suchen" : "Lehrkraft suchen"} value={suche} onChange={(e) => setSuche(e.target.value)} />
      <div className="-mx-1 grid max-h-[46dvh] grid-cols-3 gap-2 overflow-y-auto p-1 sm:grid-cols-4">
        {liste.map((p) => {
          const an = wert === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setzen(p.id)}
              className={`flex flex-col items-center gap-1 rounded-2xl px-1 pb-2 pt-2.5 transition active:scale-95 ${
                an ? "bg-[#E9C460]/20 ring-2 ring-[#C99A1E]" : "zelle"
              }`}
            >
              <span className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br text-[14px] font-bold text-white ${personVerlauf(p.id)}`}>
                {p.kuerzel}
              </span>
              <span className="w-full truncate text-center text-[12.5px] font-semibold">{p.oben}</span>
              {p.unten && <span className="-mt-1 w-full truncate text-center text-[12px] text-tinte-leise">{p.unten}</span>}
            </button>
          );
        })}
      </div>
      {liste.length === 0 && (
        <p className="py-6 text-center text-[13.5px] text-tinte-leise">{art === "lehrer" ? "Noch keine Lehrkräfte eingetragen." : "Niemand gefunden."}</p>
      )}
      <button
        onClick={() => setzen(null)}
        className={`mt-3 w-full rounded-full py-2.5 text-[14px] font-semibold transition ${
          gewaehlt && !wert ? "bg-[rgb(118_118_128/0.2)]" : "bg-[rgb(118_118_128/0.1)] text-tinte-matt dark:text-slate-300"
        }`}
      >
        {gewaehlt && !wert ? "✓ Weiß nicht" : "Weiß nicht"}
      </button>
    </>
  );
}

/* ====================================================================== */
/* Bausteine                                                              */
/* ====================================================================== */
/** Rundes Zahnrad oben rechts – auch Motto und Zitate benutzen es */
export function ZahnradKnopf({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="-my-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90"
    >
      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[rgb(118_118_128/0.12)] text-tinte-matt dark:bg-[rgb(118_118_128/0.24)] dark:text-slate-300">
        <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
        </svg>
      </span>
    </button>
  );
}


/* ====================================================================== */
/* Einstellungen (Zahnrad) – EIN Blatt für alles                          */
/* ====================================================================== */

/** Für Profil → Funktionen: dasselbe Einstellungs-Blatt ohne das Ranking-Blatt */
export function RankingVerwaltungSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { uid, can } = useRole();
  const r = useRankings(open, uid);
  const runden = useRunden("rankings", open, uid, can("rankings.runden"));
  const gewinner = useGewinner("rankings", open);
  const [teil, setTeil] = useTeil("rankings");
  const [kueren, setKueren] = useState<RankingKategorie | null>(null);
  const personen = useStufePersonen(open);
  const { lehrer } = useLehrer(open);
  const name = useNamen(personen, lehrer);
  return (
    <>
      {/* Bleibt offen unter „Küren“ – das steht als Unterseite an seiner Stelle */}
      <RankingEinstellungen
        open={open}
        onClose={onClose}
        r={r}
        runden={runden}
        teil={teil}
        setTeil={setTeil}
        onKueren={setKueren}
        gewinner={gewinner}
      />
      <KuerenFuerKategorie k={kueren} r={r} runden={runden} name={name} gewinner={gewinner} onClose={() => setKueren(null)} />
    </>
  );
}

/**
 * Das Einstellungs-Blatt. Oben der Teil (Offiziell | Inoffiziell) und die
 * Art (Schüler | Lehrer) – alles darunter gilt für diese Auswahl. Gruppen in
 * der Reihenfolge der Spec; jede nur, wenn man sie darf.
 */
function RankingEinstellungen({
  open,
  onClose,
  r,
  runden,
  startArt = "schueler",
  teil,
  setTeil,
  onKueren,
  gewinner,
}: {
  open: boolean;
  onClose: () => void;
  r: Rankings;
  runden: RundenStand;
  startArt?: RankingArt;
  teil: Teil;
  setTeil: (t: Teil) => void;
  onKueren: (k: RankingKategorie) => void;
  gewinner: ReturnType<typeof useGewinner>;
}) {
  const { can } = useRole();
  const [artWahl, setArt] = useState<RankingArt | null>(null);
  const [lehrerOffen, setLehrerOffen] = useState(false);
  const [stichwahlWahl, setStichwahlWahl] = useState(false);
  const [startK, setStartK] = useState<RankingKategorie | null>(null);
  const art = artWahl ?? startArt;
  const personen = useStufePersonen(open);
  const { lehrer } = useLehrer(open);
  const name = useNamen(personen, lehrer);
  const darfVerwalten = can("rankings.verwalten");
  const leitet = can("rankings.runden");
  const darfKueren = leitet || darfVerwalten;
  const darfFilter = darfVerwalten || can("wortfilter.verwalten");
  // Neu laden nach einem Verschieben – stabil, damit der Live-Kanal nicht neu aufgebaut wird
  const nachVerschieben = useCallback(() => void r.neuLaden(), [r.neuLaden]);
  const v = useVerschiebungen("ranking_kategorien", open && darfVerwalten, nachVerschieben);

  const hier = r.kategorien.filter((k) => k.art === art && k.bereich === teil);
  const aktiv = hier.filter((k) => k.aktiv);
  const laufend = aktiv.filter((k) => runden.offeneVon(k.id));
  const mitStimmen = aktiv.filter((k) => (r.stand.find((s) => s.kategorie_id === k.id)?.stimmen ?? 0) > 0 || gewinner.von(k.id, "gewinner") || runden.letzteBeendete(k.id));

  const schliessen = () => {
    setArt(null);
    onClose();
  };

  return (
    <>
      {/* Bleibt offen unter Lehrkräfte/Runde starten (Unterseiten, Stapel in Sheet.tsx) */}
      <Sheet open={open} onClose={schliessen}>
        <SheetKopf titel="Einstellungen" unter="Rankings – gilt für den gewählten Teil und die gewählte Art." onClose={schliessen} />
        <TeilUmschalter teil={teil} setTeil={setTeil} className="mb-3" />
        <div className="seg mb-1" role="tablist" aria-label="Art">
          {(["schueler", "lehrer"] as RankingArt[]).map((a) => (
            <button key={a} role="tab" aria-selected={art === a} className={`seg-item ${art === a ? "seg-aktiv" : ""}`} onClick={() => setArt(a)}>
              {ART_STIL[a].titel}
            </button>
          ))}
        </div>

        {/* 1) Abstimmung: Runden je Kategorie (die erste Runde heißt Stichwahl) */}
        {leitet && (
          <>
            <Gruppe titel="Abstimmung · Runden" fuss="Je Kategorie läuft eine Runde. Die erste Runde ist die Stichwahl unter den Besten. Die Kategorie zeigt sie dann ganz oben.">
              <button
                type="button"
                onClick={() => setStichwahlWahl(true)}
                disabled={aktiv.length === 0}
                className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] disabled:opacity-40 dark:active:bg-white/[0.06]"
              >
                <span className="symbol bg-brand">
                  <Icon name="stimme" size={16} strich={2.3} />
                </span>
                <span className="min-w-0 flex-1 text-[15px]">Runde starten …</span>
                <Wert>{laufend.length ? `${laufend.length} läuft` : "keine läuft"}</Wert>
                <span aria-hidden className="text-[17px] leading-none text-tinte-leise">›</span>
              </button>
            </Gruppe>
            {laufend.map((k) => (
              <RundenEinstellungen
                key={k.id}
                stand={runden}
                gruppe={k.id}
                gruppeTitel={k.titel}
                quellen={quellenFuer(k, r, personen, lehrer)}
                leitet={leitet}
                titel={`Runde steuern · ${k.titel}`}
                startText="Runde starten"
                wahlTitel="Stichwahl"
                standardName="Stichwahl"
                mitHerz
              />
            ))}
          </>
        )}

        {/* 2) Ergebnisse */}
        {(darfVerwalten || leitet) && <RankingSichtbarkeit />}

        {/* 3) Gewinner */}
        {darfKueren && (
          <Gruppe titel="Gewinner" fuss={mitStimmen.length ? "Gewinner und Gewinner der Herzen je Kategorie – erscheinen groß an der Kategorie." : "Küren geht, sobald eine Kategorie Stimmen hat."}>
            {mitStimmen.map((k) => {
              const g = gewinner.von(k.id, "gewinner");
              return (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => onKueren(k)}
                  className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
                >
                  <span className="min-w-0 flex-1 text-[15px] leading-snug">{k.titel}</span>
                  <span className={`max-w-[40%] truncate text-[14px] ${g ? "font-semibold text-[#9A5B00] dark:text-[#FFD66B]" : "text-tinte-leise"}`}>{g ? g.label : "Küren"}</span>
                  <span aria-hidden className="text-[17px] leading-none text-tinte-leise">›</span>
                </button>
              );
            })}
            {mitStimmen.length === 0 && <p className="px-4 py-3 text-[14px] text-tinte-leise">Noch nichts zu küren.</p>}
          </Gruppe>
        )}

        {/* 4) Offiziell & Inoffiziell: Wortfilter je Teil, offene Verschiebe-Anträge */}
        {darfFilter && (
          <Gruppe titel="Offiziell & Inoffiziell" fuss="Offiziell kommt ins Abibuch (Wortfilter empfohlen). Inoffiziell bleibt in der Stufe.">
            <WortfilterSchalter zeile bereich="rankings" titel="Wortfilter · Offiziell" />
            <WortfilterSchalter zeile bereich="rankings_inoffiziell" titel="Wortfilter · Inoffiziell" />
          </Gruppe>
        )}
        {darfVerwalten && v.liste.length > 0 && (
          <Gruppe titel={`Verschiebe-Anträge · ${v.liste.length}`} fuss="Verschoben wird, sobald genug zugestimmt haben. Die Anträge stehen auch unter Chats → Anfragen.">
            {v.liste.map((a) => (
              <div key={a.id} className="flex min-h-[56px] items-center gap-3 px-4 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{a.titel}</span>
                  <span className="block text-[12.5px] text-tinte-leise">
                    nach {TEIL_NAME[a.nach]} · {a.stimmen} von {a.noetig}
                    {a.ich ? " · du hast zugestimmt" : ""}
                  </span>
                </span>
                {!a.ich && (
                  <button className="btn-klein !min-h-[2rem] !px-3 !text-[13px]" onClick={() => void v.zustimmen(a.id)}>
                    Zustimmen
                  </button>
                )}
                <button className="btn-klein-grau !min-h-[2rem] !px-3 !text-[13px] !text-red-600 dark:!text-red-400" onClick={() => void v.ablehnen(a.id)}>
                  Verwerfen
                </button>
              </div>
            ))}
          </Gruppe>
        )}

        {/* 5) Kategorien verwalten */}
        {darfVerwalten && <KategorienListe r={r} art={art} teil={teil} v={v} />}

        {/* 6) Lehrkräfte */}
        {can("lehrer.verwalten") && (
          <Gruppe titel="Lehrkräfte">
            <button
              type="button"
              onClick={() => setLehrerOffen(true)}
              className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
            >
              <span className="symbol bg-[#30B85A]">
                <Icon name="person" size={16} strich={2.2} />
              </span>
              <span className="min-w-0 flex-1 text-[15px]">Lehrkräfte pflegen</span>
              <Wert>{lehrer.length}</Wert>
              <span aria-hidden className="text-[17px] leading-none text-tinte-leise">›</span>
            </button>
          </Gruppe>
        )}

        {/* 7) Wer darf was? */}
        <KachelVerwaltung kachel="rankings" />
      </Sheet>

      {/* Lehrkräfte als eigenes Blatt */}
      <Sheet open={open && lehrerOffen} onClose={() => setLehrerOffen(false)}>
        <SheetKopf titel="Lehrkräfte" unter="Für Lehrer-Rankings und Zitate." onClose={() => setLehrerOffen(false)} />
        <LehrerListe aktiv={open && lehrerOffen} />
      </Sheet>

      {/* Runde starten: erst die Kategorie wählen */}
      <Sheet open={open && stichwahlWahl} onClose={() => setStichwahlWahl(false)}>
        <SheetKopf titel="Runde starten" unter={`${ART_STIL[art].titel} · ${TEIL_NAME[teil]} – welche Kategorie?`} onClose={() => setStichwahlWahl(false)} />
        <Gruppe className="">
          {aktiv.map((k) => {
            const runde = runden.offeneVon(k.id);
            const vorn = r.stand.find((s) => s.kategorie_id === k.id)?.top[0];
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => {
                  setStichwahlWahl(false);
                  setStartK(k);
                }}
                className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-snug">{k.titel}</span>
                  <span className="block truncate text-[12.5px] text-tinte-leise">
                    {runde ? `Runde ${runde.nr} läuft – wird durch die neue ersetzt` : vorn ? `vorn: ${name(vorn.ziel)} (${vorn.n})` : "noch keine Stimmen"}
                  </span>
                </span>
                <span aria-hidden className="text-[17px] leading-none text-tinte-leise">›</span>
              </button>
            );
          })}
        </Gruppe>
      </Sheet>
      <RundeStartenSheet
        offen={open && !!startK}
        quellen={startK ? quellenFuer(startK, r, personen, lehrer) : []}
        gruppe={startK?.id ?? ""}
        gruppeTitel={startK?.titel ?? ""}
        stand={runden}
        wahlTitel="Stichwahl"
        standardName="Stichwahl"
        mitHerz
        onClose={() => setStartK(null)}
      />
    </>
  );
}

/** „Ergebnisse sehen: Nur Komitee | Alle“ für alle Rankings */
function RankingSichtbarkeit() {
  const e = useErgebnisSichtbarkeit(true);
  return (
    <Gruppe titel="Ergebnisse" fuss="Komitee und wer Runden leitet sehen die Plätze immer.">
      <div className="px-4 py-1">
        <SichtbarkeitWahl
          titel="Plätze sehen"
          alle={e.alle.rankings}
          onChange={async (val) => {
            const f = await e.setzen("rankings", val);
            if (f) meldeFehler("Ging nicht: " + f);
          }}
        />
      </div>
    </Gruppe>
  );
}

/**
 * Kategorien des gewählten Teils und der gewählten Art – iOS-Liste wie bei
 * den Lehrkräften: je Kategorie eine Zeile mit „›“, alles Weitere
 * (umbenennen, an/aus, verschieben, löschen) im Blatt darüber („‹ Einstellungen“).
 * „Neue Kategorie“ ist die letzte Zeile in Blau (Design-Regeln 2).
 */
function KategorienListe({ r, art, teil, v }: { r: Rankings; art: RankingArt; teil: Teil; v: ReturnType<typeof useVerschiebungen> }) {
  const [blatt, setBlatt] = useState<string | null>(null);
  const [neuOffen, setNeuOffen] = useState(false);
  const liste = r.kategorien.filter((k) => k.art === art && k.bereich === teil);

  return (
    <>
      <Gruppe
        titel={`Kategorien · ${TEIL_NAME[teil]} · ${liste.length}`}
        fuss="Aus: ausgeblendet, die Stimmen bleiben. Tipp: per Umfrage sammeln und im Ergebnis mit einem Tipp übernehmen."
      >
        {liste.map((k) => {
          const antrag = v.antragZu(k.id);
          const stimmen = r.stand.find((x) => x.kategorie_id === k.id)?.stimmen ?? 0;
          // Zweite Zeile immer (Stimmen, ggf. Antrag): so darf auch ein langer Titel umbrechen
          const unter = [stimmen ? `${stimmen} ${stimmen === 1 ? "Stimme" : "Stimmen"}` : "Noch keine Stimmen", antrag ? `Antrag nach ${TEIL_NAME[antrag.nach]} ${antrag.stimmen}/${antrag.noetig}` : ""]
            .filter(Boolean)
            .join(" · ");
          return (
            <Zeile key={k.id} label={k.titel} unter={unter} onClick={() => setBlatt(k.id)}>
              {!k.aktiv && <Wert>Aus</Wert>}
            </Zeile>
          );
        })}
        {liste.length === 0 && <p className="px-4 py-3 text-[14px] text-tinte-leise">Hier noch keine.</p>}
        <Zeile label="Neue Kategorie" blau onClick={() => setNeuOffen(true)} />
      </Gruppe>
      <RankingKategorieBlatt k={blatt ? r.kategorien.find((k) => k.id === blatt) ?? null : null} r={r} v={v} onClose={() => setBlatt(null)} />
      <KategorieNeuSheet open={neuOffen} onClose={() => setNeuOffen(false)} r={r} art={art} startTeil={teil} />
    </>
  );
}

/** Eine Ranking-Kategorie bearbeiten: Titel, an/aus, in den anderen Teil verschieben, löschen */
function RankingKategorieBlatt({
  k,
  r,
  v,
  onClose,
}: {
  k: RankingKategorie | null;
  r: Rankings;
  v: ReturnType<typeof useVerschiebungen>;
  onClose: () => void;
}) {
  const verschiebenFrage = useVerschiebenRueckfrage();
  const [titel, setTitel] = useState("");
  const [an, setAn] = useState(true);
  const [busy, setBusy] = useState(false);

  // Beim Öffnen die Werte der gewählten Kategorie übernehmen
  const kennung = k?.id ?? null;
  useEffect(() => {
    if (!k) return;
    setTitel(k.titel);
    setAn(k.aktiv);
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kennung]);

  const antrag = k ? v.antragZu(k.id) : null;
  const anderer: Teil = k?.bereich === "offiziell" ? "inoffiziell" : "offiziell";

  async function sichern() {
    if (!k || !titel.trim() || busy) return;
    setBusy(true);
    const f = await r.kategorieSpeichern({ ...k, titel: titel.trim(), aktiv: an });
    setBusy(false);
    if (f) return meldeFehler("Ging nicht: " + f);
    onClose();
  }

  return (
    <Sheet open={k !== null} onClose={onClose}>
      {k && (
        <>
          <SheetKopf titel={k.titel} unter={`${ART_STIL[k.art].titel} · ${TEIL_NAME[k.bereich]}`} onClose={onClose} />
          {/* Titel als mehrzeiliges Feld – Ranking-Titel sind oft lang */}
          <Gruppe titel="Titel" className="mt-1">
            <textarea
              rows={2}
              maxLength={120}
              value={titel}
              onChange={(e) => setTitel(e.target.value.replace(/\n/g, " "))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void sichern();
                }
              }}
              aria-label="Titel"
              className="block w-full resize-none bg-transparent px-4 py-3 text-[16px] leading-snug outline-none placeholder:text-tinte-leise"
            />
          </Gruppe>
          <Gruppe fuss="Aus: Die Kategorie ist ausgeblendet, die Stimmen bleiben.">
            <ZeileMitSchalter label="Zum Abstimmen zeigen">
              <Schalter an={an} onChange={setAn} label="Zum Abstimmen zeigen" />
            </ZeileMitSchalter>
          </Gruppe>
          <Gruppe
            fuss={
              antrag
                ? `Antrag nach ${TEIL_NAME[antrag.nach]} läuft: ${antrag.stimmen} von ${antrag.noetig} Zustimmungen.`
                : anderer === "offiziell"
                  ? "Offiziell kommt ins Abibuch."
                  : "Inoffiziell bleibt in der Stufe."
            }
          >
            <Zeile
              label={`Nach ${TEIL_NAME[anderer]} verschieben`}
              blau
              disabled={Boolean(antrag)}
              onClick={() =>
                void verschiebenFrage(anderer, k.titel).then(async (ok) => {
                  if (!ok) return;
                  if (await v.beantragen(k.id, anderer)) {
                    await r.nachVerschieben(k.id, anderer);
                    onClose();
                  }
                })
              }
            />
          </Gruppe>
          <Gruppe>
            <Zeile
              label="Kategorie löschen"
              rot
              onClick={() =>
                void frage(`„${k.titel}“ samt allen Stimmen löschen? Das lässt sich nicht rückgängig machen.`, "Löschen", true).then(async (ok) => {
                  if (!ok) return;
                  const f = await r.kategorieLoeschen(k.id);
                  if (f) return meldeFehler("Ging nicht: " + f);
                  onClose();
                })
              }
            />
          </Gruppe>
          <FussLeisteBlatt>
            <button type="button" className="btn-primary w-full disabled:opacity-40" disabled={!titel.trim() || busy} onClick={() => void sichern()}>
              {busy ? "…" : "Sichern"}
            </button>
          </FussLeisteBlatt>
        </>
      )}
    </Sheet>
  );
}

/**
 * „+“ im Blattkopf oder „Neue Kategorie“ in den Einstellungen: neue Kategorie
 * anlegen – wie bei Motto und Zitaten ein kleines eigenes Blatt. Der Teil
 * (Offiziell | Inoffiziell) startet mit dem, was gerade offen ist; die Art
 * (Schüler | Lehrer) kommt vom Blatt.
 */
function KategorieNeuSheet({ open, onClose, r, art, startTeil }: { open: boolean; onClose: () => void; r: Rankings; art: RankingArt; startTeil: Teil }) {
  const [titel, setTitel] = useState("");
  const [teil, setTeil] = useState<Teil>(startTeil);
  const [busy, setBusy] = useState(false);
  // Beim Öffnen frisch starten (mit dem Teil, in dem man gerade ist)
  useEffect(() => {
    if (open) {
      setTitel("");
      setTeil(startTeil);
    }
  }, [open, startTeil]);

  const anlegen = async () => {
    if (!titel.trim() || busy) return;
    setBusy(true);
    const f = await r.kategorieSpeichern({ titel, art, bereich: teil });
    setBusy(false);
    if (f) return meldeFehler("Ging nicht: " + f);
    melde(`Kategorie angelegt – ${TEIL_NAME[teil]}`, "erfolg");
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel="Neue Kategorie" unter={`${ART_STIL[art].titel} – darüber wird abgestimmt.`} onClose={onClose} />
      <Gruppe className="mt-1">
        <ZeileEingabe label="Titel" value={titel} onChange={setTitel} placeholder="z. B. Wird am ehesten berühmt" maxLength={120} autoFocus onEnter={() => void anlegen()} />
      </Gruppe>
      <TeilUmschalter teil={teil} setTeil={setTeil} className="mt-4" />
      <FussLeisteBlatt>
        <button type="button" className="btn-primary w-full disabled:opacity-40" disabled={!titel.trim() || busy} onClick={() => void anlegen()}>
          {busy ? "…" : `In ${TEIL_NAME[teil]} anlegen`}
        </button>
      </FussLeisteBlatt>
    </Sheet>
  );
}

/** Lehrkräfte pflegen – auch aus der Zitatwand erreichbar */
/**
 * Lehrkräfte pflegen – iOS-Liste: je Lehrkraft eine Zeile mit „›“, alles
 * Weitere (Name, Fächer, auswählbar, löschen) im Blatt darüber. „Neue
 * Lehrkraft“ ist die letzte Zeile in Blau (Design-Regeln 2: ein
 * Bedienelement je Zeile, kein Mülleimer in der Liste).
 */
export function LehrerListe({ aktiv }: { aktiv: boolean }) {
  const l = useLehrer(aktiv);
  // null = zu, "neu" = anlegen, sonst die Lehrkraft
  const [blatt, setBlatt] = useState<Lehrer | "neu" | null>(null);

  return (
    <>
      <Gruppe titel={`Lehrkräfte (${l.lehrer.length})`} className="mt-0" fuss="Ausgeschaltet: bleibt gespeichert, ist aber nicht mehr auswählbar.">
        {l.lehrer.length === 0 && <p className="px-4 py-3 text-[13px] text-tinte-leise">Noch niemand eingetragen.</p>}
        {l.lehrer.map((x) => (
          <Zeile key={x.id} label={x.name} unter={x.faecher || undefined} onClick={() => setBlatt(x)}>
            {!x.aktiv && <Wert>aus</Wert>}
          </Zeile>
        ))}
        <Zeile label="Neue Lehrkraft" blau onClick={() => setBlatt("neu")} />
      </Gruppe>
      <LehrerBlatt lehrer={blatt} onClose={() => setBlatt(null)} speichern={l.speichern} loeschen={l.loeschen} />
    </>
  );
}

/** Eine Lehrkraft anlegen oder ändern (Unterseite der Liste, „‹ Lehrkräfte“) */
function LehrerBlatt({
  lehrer,
  onClose,
  speichern,
  loeschen,
}: {
  lehrer: Lehrer | "neu" | null;
  onClose: () => void;
  speichern: (l: Partial<Lehrer> & { name: string }) => Promise<string | null>;
  loeschen: (id: string) => Promise<string | null>;
}) {
  const offen = lehrer !== null;
  const x = lehrer && lehrer !== "neu" ? lehrer : null;
  const [name, setName] = useState("");
  const [faecher, setFaecher] = useState("");
  const [an, setAn] = useState(true);
  const [busy, setBusy] = useState(false);

  // Beim Öffnen die Werte der gewählten Lehrkraft übernehmen
  const kennung = x?.id ?? (offen ? "neu" : null);
  useEffect(() => {
    if (!kennung) return;
    setName(x?.name ?? "");
    setFaecher(x?.faecher ?? "");
    setAn(x?.aktiv ?? true);
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kennung]);

  async function sichern() {
    if (!name.trim() || busy) return;
    setBusy(true);
    const f = await speichern({ id: x?.id, name, faecher, aktiv: an });
    setBusy(false);
    if (f) return meldeFehler(f);
    onClose();
  }

  return (
    <Sheet open={offen} onClose={onClose}>
      <SheetKopf titel={x ? x.name : "Neue Lehrkraft"} onClose={onClose} />
      <Gruppe>
        <ZeileEingabe label="Name" value={name} onChange={setName} placeholder="z. B. Frau …" maxLength={60} autoFocus={!x} onEnter={() => void sichern()} />
        <ZeileEingabe label="Fächer" value={faecher} onChange={setFaecher} placeholder="optional" maxLength={60} onEnter={() => void sichern()} />
      </Gruppe>
      {x && (
        <Gruppe fuss="Aus: bleibt gespeichert, ist aber bei Zitaten und im Lehrer-Ranking nicht mehr auswählbar.">
          <ZeileMitSchalter label="Auswählbar">
            <Schalter an={an} onChange={setAn} label="Auswählbar" />
          </ZeileMitSchalter>
        </Gruppe>
      )}
      {x && (
        <Gruppe>
          <Zeile
            label="Lehrkraft löschen"
            rot
            onClick={() =>
              void frage(`${x.name} aus der Liste löschen? Stimmen für diese Lehrkraft gehen verloren.`, "Löschen", true).then(async (ok) => {
                if (!ok) return;
                const f = await loeschen(x.id);
                if (f) return meldeFehler("Ging nicht: " + f);
                onClose();
              })
            }
          />
        </Gruppe>
      )}
      <FussLeisteBlatt>
        <button type="button" className="btn-primary w-full disabled:opacity-40" disabled={!name.trim() || busy} onClick={() => void sichern()}>
          {busy ? "…" : x ? "Sichern" : "Hinzufügen"}
        </button>
      </FussLeisteBlatt>
    </Sheet>
  );
}
