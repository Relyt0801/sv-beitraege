import { useEffect, useState, type ReactNode } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { Schalter } from "./Schalter";
import { AusHinweis } from "./Funktionen";
import { GesperrtZeile, GESPERRT_TEXT } from "./Gesperrt";
import { MeldenKnopf } from "./Melden";
import { melden } from "../lib/melden";
import { ZahnradKnopf } from "./Rankings";
import { useRole } from "../auth/RoleProvider";
import { useFunktionen } from "../lib/funktionen";
import { useMotto, type Motto, type MottoWahl } from "../lib/motto";
import { frage, melde, meldeFehler } from "../lib/melder";
import { useRunden, type Runde, type RundenStand, type KandidatEingabe } from "../lib/runden";
import { RundenAbschnitt, RundenEinstellungen, RundenMarke, RundeStartenSheet, SichtbarkeitWahl } from "./Runden";
import { useErgebnisSichtbarkeit } from "../lib/ergebnisse";
import { FarbKarte, KnopfGlas, KnopfHell, VerwaltetVon } from "./Kachel";
import { AutorInfo, WortfilterSchalter } from "./AutorInfo";
import { Gruppe, Zeile, Wert } from "./Liste";
import { Icon } from "./Icon";
import { KachelVerwaltung } from "./KachelVerwaltung";
import { GewinnerBuehne, GewinnerMarke, KuerenBlatt, type Kandidat } from "./Gewinner";
import { TeilUmschalter, TeilWischer, TEIL_FARBE, useVerschiebenRueckfrage } from "./TeilUmschalter";
import { TEIL_NAME, useGewinner, useTeil, useVerschiebungen, type Gewinner, type GewinnerArt, type Teil, type Verschiebung } from "../lib/teile";
import { useWfRecht } from "../lib/wortfilter-bereiche";
import { hasSupabase } from "../lib/supabase";
import { zeigeMottoEnthuellung } from "./MottoEnthuellung";

/**
 * Abimotto (Update 1.4)
 *
 *   Startseite   MottoKarte – orange Kachel; steht das Motto fest, groß darauf.
 *   Blatt        oben der Umschalter Offiziell | Inoffiziell (seitlich wischen
 *                geht auch), darunter die Gewinner-Bühne bzw. eine Karte mit dem
 *                aktuellen Stand und der Haupt-Aktion („Vorschläge sammeln“,
 *                „Abstimmung läuft“, „Runde 2 läuft“, „Runde beendet“). Darunter
 *                das Segment „Vorschläge | Ergebnis“ – das Ergebnis ist also nie
 *                in den Einstellungen versteckt.
 *   Zahnrad      EIN Blatt „Einstellungen“ mit allen Schaltern in fester
 *                Reihenfolge: Abstimmung, Ergebnisse, Gewinner, Offiziell &
 *                Inoffiziell, Wer darf was?
 *                „Runde steuern“ in der Stand-Karte öffnet dasselbe Blatt,
 *                nennt es aber „Runde steuern“ und springt zur Gruppe Runden.
 *
 * Offiziell/Inoffiziell: jeder Vorschlag liegt in einem Teil (Spalte bereich).
 * Runden laufen je Teil (Runden-Gruppe = Teil). Alte Runden aus der Zeit vor
 * den Teilen haben die Gruppe '' – sie gehören zu dem Teil, in dem die meisten
 * ihrer Kandidaten liegen, und werden mit derselben Gruppe fortgesetzt (so
 * sieht auch die ältere App-Version sie weiter).
 *
 * Gewinner: offizielles Motto + optional „Gewinner der Herzen“ je Teil
 * (Tabelle gewinner, gruppe = Teil). Das offizielle Motto löst bei allen –
 * auch Eltern – die Enthüllung aus (MottoEnthuellung.tsx).
 */

const MEDAILLE = ["#E9C460", "#C0C4CC", "#D4A373"];
const KEINE_KANDIDATEN: Kandidat[] = [];

const stimmenText = (n: number) => `${n} ${n === 1 ? "Stimme" : "Stimmen"}`;
const vorschlaegeText = (n: number) => `${n} ${n === 1 ? "Vorschlag" : "Vorschläge"}`;
const personenText = (n: number, verb: string) => `${n} ${n === 1 ? `Person hat` : `Personen haben`} ${verb}`;

type Quelle = KandidatEingabe & { punkte?: number };

/* ====================================================================== */
/* Runden je Teil                                                         */
/* ====================================================================== */

/**
 * Zu welchem Teil gehört eine Runde? Neue Runden tragen den Teil als Gruppe;
 * alte (Gruppe '') zählen zu dem Teil, in dem die Mehrheit ihrer Kandidaten
 * liegt – im Zweifel inoffiziell (dort liegt der ganze Bestand).
 */
function teilDerRunde(runde: Runde, r: RundenStand, teilVon: Map<string, Teil>): Teil {
  if (runde.gruppe === "offiziell" || runde.gruppe === "inoffiziell") return runde.gruppe;
  const ks = r.kandidatenVon(runde.id).filter((k) => !k.hm);
  const offiziell = ks.filter((k) => teilVon.get(k.ziel_id) === "offiziell").length;
  return ks.length > 0 && offiziell * 2 > ks.length ? "offiziell" : "inoffiziell";
}

/** Die maßgebliche Runde eines Teils: die offene, sonst die zuletzt gestartete. */
function rundeVon(teil: Teil, r: RundenStand, teilVon: Map<string, Teil>): Runde | null {
  const passend = r.runden.filter((x) => teilDerRunde(x, r, teilVon) === teil);
  return passend.find((x) => x.offen) || [...passend].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;
}

const teilKarte = (mottos: Motto[]) => new Map(mottos.map((x) => [x.id, x.bereich] as const));

/**
 * Verschieben beantragen – mit der gemeinsamen Rückfrage (Zahl der nötigen
 * Zustimmungen, Hinweis auf Chats → Anfragen). Ohne Datenbank (Demo) wird
 * direkt verschoben. Gibt zurück, ob der Vorschlag jetzt im anderen Teil liegt.
 */
function useMottoVerschieben(m: MottoWahl, vs: ReturnType<typeof useVerschiebungen>) {
  const rueckfrage = useVerschiebenRueckfrage();
  return async (x: Motto): Promise<boolean> => {
    const nach: Teil = x.bereich === "offiziell" ? "inoffiziell" : "offiziell";
    if (!(await rueckfrage(nach, x.text))) return false;
    const fertig = await vs.beantragen(x.id, nach);
    if (!hasSupabase) m.demoVerschieben(x.id, nach);
    return fertig || !hasSupabase;
  };
}

/* ====================================================================== */
/* Karte auf der Startseite                                               */
/* ====================================================================== */
export function MottoKarte({ className = "" }: { className?: string }) {
  const { can, isEltern, uid, banned } = useRole();
  const { sichtbar } = useFunktionen();
  const darf = !isEltern && sichtbar("motto") && (can("motto.nutzen") || can("motto.verwalten"));
  const m = useMotto(darf, uid);
  const r = useRunden("motto", darf, uid, can("motto.runden"));
  const [teil, setTeil] = useTeil("motto");
  const [ansicht, setAnsicht] = useState<null | "liste" | "neu">(null);
  if (!darf) return null;

  const sichtbare = m.mottos.filter((x) => !x.ausgeblendet);
  // Das gekürte offizielle Motto (gewaehlt setzt gewinner_kueren)
  const gewaehlt = sichtbare.find((x) => x.gewaehlt) || null;
  const meineLikes = sichtbare.filter((x) => m.meine(x.id, "like")).length;
  const runde = r.offene[0] || null;

  /** Blatt öffnen – läuft eine Runde, gleich in ihrem Teil; steht das Motto fest, im offiziellen */
  const oeffnen = (a: "liste" | "neu") => {
    if (a === "liste" && gewaehlt) setTeil("offiziell");
    else if (a === "liste" && runde) setTeil(teilDerRunde(runde, r, teilKarte(m.mottos)));
    setAnsicht(a);
  };

  return (
    <div className={`flex flex-col ${className}`} data-motto="karte">
      <AusHinweis funktion="motto" className="mb-1.5 px-1" />
      <FarbKarte
        verlauf="from-[#FF9500] to-[#F26B00]"
        schatten="shadow-[0_12px_28px_-14px_rgba(242,107,0,.8)]"
        onClick={() => oeffnen("liste")}
        label="Abimotto öffnen"
        marke={
          runde && !gewaehlt ? (
            <span className="flex flex-wrap gap-1.5">
              <RundenMarke runde={runde} hell />
              {runde.hm_aktiv && <span className="inline-flex items-center rounded-full bg-white/20 px-2.5 py-1 text-[12px] font-semibold">♥ Gewinner der Herzen</span>}
            </span>
          ) : undefined
        }
        oben={gewaehlt ? "Unser Abimotto" : runde ? `Abimotto · Runde ${runde.nr}` : m.abstimmung ? "Abimotto · Abstimmung läuft" : "Abimotto · Vorschläge"}
        titel={
          gewaehlt ? (
            <button onClick={() => oeffnen("liste")} className="text-left text-[1.45rem] font-extrabold leading-tight [overflow-wrap:anywhere]">
              {gewaehlt.text}
            </button>
          ) : runde ? (
            "Welches Motto kommt auf die Pullis?"
          ) : m.abstimmung ? (
            "Abstimmen: Welches Motto soll es werden?"
          ) : (
            "Reiche Vorschläge für unser Abimotto ein"
          )
        }
        unter={
          gewaehlt
            ? gewaehlt.erklaerung || `Gewählt aus ${sichtbare.length} ${sichtbare.length === 1 ? "Vorschlag" : "Vorschlägen"}`
            : runde
              ? `${r.meineIn(runde.id).length} von ${stimmenText(runde.stimmen)} vergeben`
              : m.abstimmung
                ? `${vorschlaegeText(sichtbare.length)} · ${meineLikes ? `du hast ${meineLikes} gelikt` : "like alle, die dir gefallen"}`
                : `${vorschlaegeText(sichtbare.length)} bisher`
        }
        deko={<span className="-mr-2 -mt-3 block text-[6.5rem] leading-none opacity-25">✨</span>}
        knoepfe={
          <>
            {!gewaehlt && !runde && !m.abstimmung && !banned && (
              <KnopfHell onClick={() => oeffnen("neu")} text="text-[#C2410C]">
                Vorschlag einreichen
              </KnopfHell>
            )}
            {gewaehlt || runde || m.abstimmung ? (
              <KnopfHell onClick={() => oeffnen("liste")} text="text-[#C2410C]">
                {gewaehlt ? "Alle ansehen" : "Abstimmen"}
              </KnopfHell>
            ) : (
              // Kurz wie bei den Zitaten („Alle (6)“): mit „Alle ansehen“ brachen die
              // beiden Knöpfe am Handy (Regal, 315 px) in zwei Reihen um
              <KnopfGlas onClick={() => oeffnen("liste")}>{sichtbare.length ? `Alle (${sichtbare.length})` : "Alle ansehen"}</KnopfGlas>
            )}
          </>
        }
      >
        {/* Ab iPad (zwei Karten nebeneinander, gleich hoch): die neuesten
            Vorschläge statt leerer Fläche neben dem Steckbrief. Am Handy im
            Regal nicht – die Karte soll dort nicht höher werden. */}
        {!gewaehlt && sichtbare.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 max-sm:hidden">
            {sichtbare.slice(0, 3).map((x) => (
              <span key={x.id} className="max-w-full truncate rounded-full bg-white/20 px-2.5 py-1 text-[12.5px] font-semibold">
                „{x.text}“
              </span>
            ))}
          </div>
        )}
        <GesperrtZeile hell className="mt-3" />
      </FarbKarte>
      <MottoSheet m={m} r={r} teil={teil} setTeil={setTeil} ansicht={ansicht} setAnsicht={setAnsicht} />
    </div>
  );
}

/* ====================================================================== */
/* Blatt                                                                  */
/* ====================================================================== */
type Reiter = "vorschlaege" | "ergebnis";
/** Momentaufnahme fürs Küren (damit das Blatt beim Neuladen nicht zurückspringt) */
interface KuerStand {
  kandidaten: Kandidat[];
  herz: Map<string, number>;
}

function MottoSheet({
  m,
  r,
  teil,
  setTeil,
  ansicht,
  setAnsicht,
}: {
  m: MottoWahl;
  r: RundenStand;
  teil: Teil;
  setTeil: (t: Teil) => void;
  ansicht: null | "liste" | "neu";
  setAnsicht: (a: null | "liste" | "neu") => void;
}) {
  const { can, banned, isAdmin } = useRole();
  const darfRunden = can("motto.runden");
  const darfVerwalten = can("motto.verwalten");
  const darfKueren = darfRunden || darfVerwalten;
  const darfEinstellungen = darfKueren || isAdmin || can("perms.manage");
  const offen = ansicht !== null;

  const ergebnisse = useErgebnisSichtbarkeit(offen);
  const gw = useGewinner("motto", offen);
  // m.laden ist stabil (useCallback) – der Live-Kanal wird nicht bei jedem Zeichnen neu gebaut
  const vs = useVerschiebungen("motto_vorschlaege", offen && darfVerwalten, m.laden);
  const verschieben = useMottoVerschieben(m, vs);

  const [reiter, setReiter] = useState<Reiter>("vorschlaege");
  const [einstellungen, setEinstellungen] = useState(false);
  // true = geöffnet über „Runde steuern“ (Titel „Runde steuern“, springt zur Gruppe Runden)
  const [fokusRunde, setFokusRunde] = useState(false);
  const [kuer, setKuer] = useState<KuerStand | null>(null);
  const [starten, setStarten] = useState<null | Quelle[]>(null);
  const [bearbeite, setBearbeite] = useState<string | null>(null);

  const schliessen = () => {
    setAnsicht(null);
    setEinstellungen(false);
    setFokusRunde(false);
  };
  const einstellungenOeffnen = (fokus: boolean) => {
    setFokusRunde(fokus);
    setEinstellungen(true);
  };
  /** Nach dem Küren: Einstellungen zu, oben im Blatt steht die Gewinner-Bühne */
  const nachKueren = () => {
    setEinstellungen(false);
    setFokusRunde(false);
    setReiter("vorschlaege");
    window.setTimeout(() => document.getElementById("motto-gewinner")?.scrollIntoView({ behavior: "smooth", block: "start" }), 380);
  };

  // ---------------------------------------------------------------- Stand des Teils
  const teilVon = teilKarte(m.mottos);
  const imTeil = m.mottos.filter((x) => x.bereich === teil);
  const sichtbare = imTeil.filter((x) => !x.ausgeblendet);
  const zahlen: Record<Teil, number> = {
    offiziell: m.mottos.filter((x) => x.bereich === "offiziell" && !x.ausgeblendet).length,
    inoffiziell: m.mottos.filter((x) => x.bereich === "inoffiziell" && !x.ausgeblendet).length,
  };
  const runde = rundeVon(teil, r, teilVon);
  const offeneRunde = runde?.offen ? runde : null;
  // Wer leitet, sieht die Zahlen der Runde immer, alle anderen nach Freigabe
  const rundeZahlenDa = !!runde && (darfRunden || runde.ergebnis_sichtbar);
  const likesSichtbar = m.zahlenSichtbar;
  // Neue Runden laufen in der Gruppe des Teils – alte (Gruppe '') werden fortgesetzt
  const rundenGruppe = runde ? runde.gruppe : teil;

  // Gewinner des Teils. Für das offizielle Motto zählt notfalls auch ein
  // „gewaehlt“ aus der Zeit vor der Gewinner-Tabelle.
  const gewaehlt = teil === "offiziell" ? sichtbare.find((x) => x.gewaehlt) || null : null;
  const gekuert = gw.von(teil, "gewinner");
  const gewinner: Gewinner | null =
    gekuert ||
    (gewaehlt
      ? { bereich: "motto", gruppe: "offiziell", art: "gewinner", ziel_id: gewaehlt.id, label: gewaehlt.text, unter: gewaehlt.erklaerung, stimmen: null, gekuert_at: gewaehlt.gewaehlt_at || "" }
      : null);
  const herzen = gw.von(teil, "herzen");

  const quellen: Quelle[] = sichtbare.map((x) => ({ id: x.id, label: x.text, unter: x.erklaerung, punkte: m.zahl(x.id, "like") }));
  const darfVorschlagen = !banned && ((!m.abstimmung && !offeneRunde) || darfVerwalten);

  /** Kandidaten fürs Küren: Runde (nach Stimmen) oder alle Vorschläge (nach Likes) */
  const kuerenOeffnen = () => {
    const herz = new Map<string, number>();
    let kandidaten: Kandidat[];
    if (runde) {
      const ks = r.kandidatenVon(runde.id).map((k) => ({ ...k, n: rundeZahlenDa ? r.zahl(runde.id, k.ziel_id) ?? 0 : null }));
      const sortiert = (l: typeof ks) => (rundeZahlenDa ? [...l].sort((a, b) => (b.n ?? 0) - (a.n ?? 0)) : l);
      for (const k of ks) if (k.hm && k.n != null) herz.set(k.ziel_id, k.n);
      kandidaten = [
        ...sortiert(ks.filter((k) => !k.hm)).map((k) => ({ id: k.ziel_id, label: k.label, unter: k.unter || undefined, stimmen: k.n })),
        // Herzens-Kandidaten aus dem Voting „Gewinner der Herzen“ – mit ihren Herzstimmen
        ...sortiert(ks.filter((k) => k.hm)).map((k) => ({
          id: k.ziel_id,
          label: k.label,
          unter: `Herzens-Kandidat${k.n != null ? ` · ${k.n} ♥` : ""}`,
          stimmen: null,
        })),
      ];
    } else {
      kandidaten = [...sichtbare]
        .sort((a, b) => m.zahl(b.id, "like") - m.zahl(a.id, "like"))
        .map((x) => ({ id: x.id, label: x.text, unter: x.erklaerung || undefined, stimmen: likesSichtbar ? m.zahl(x.id, "like") : null }));
    }
    setKuer({ kandidaten, herz });
  };

  const kueren = async (art: GewinnerArt, k: Kandidat, leise: boolean): Promise<boolean> => {
    const x = m.mottos.find((y) => y.id === k.id);
    const stimmen = art === "herzen" ? (kuer?.herz.get(k.id) ?? null) : (k.stimmen ?? null);
    const ok = await gw.kueren({ gruppe: teil, art, ziel_id: k.id, label: x?.text ?? k.label, unter: x?.erklaerung ?? "", stimmen }, leise);
    // Mit Datenbank setzt gewinner_kueren „gewaehlt“ selbst – im Demo-Modus die App
    if (ok && !hasSupabase && teil === "offiziell" && art === "gewinner") await m.aendern(k.id, { gewaehlt: true });
    if (ok) void m.laden();
    return ok;
  };
  const zuruecknehmen = async (art: GewinnerArt) => {
    await gw.zuruecknehmen(teil, art);
    if (!hasSupabase && teil === "offiziell" && art === "gewinner" && gewaehlt) await m.aendern(gewaehlt.id, { gewaehlt: false });
    void m.laden();
  };

  const abstimmungStarten = () =>
    void frage("Abstimmung freigeben? Dann liken alle die Vorschläge – neue Vorschläge kann nur noch das Komitee einreichen.", "Freigeben").then(async (ok) => {
      if (!ok) return;
      const f = await m.abstimmungSetzen(true);
      if (f) meldeFehler("Ging nicht: " + f);
      else melde("Abstimmung ist freigegeben", "erfolg");
    });

  const bearbeiteMotto = bearbeite ? m.mottos.find((y) => y.id === bearbeite) || null : null;

  return (
    <>
      <Sheet hoch open={offen} onClose={schliessen}>
        {ansicht === "neu" ? (
          <Vorschlagen
            m={m}
            startTeil={teil}
            fertig={(t) => {
              setTeil(t);
              setAnsicht("liste");
            }}
            schliessen={schliessen}
          />
        ) : (
          <>
            <SheetKopf
              titel="Abimotto"
              onClose={schliessen}
              extra={
                <>
                  {darfEinstellungen && <ZahnradKnopf label="Einstellungen" onClick={() => einstellungenOeffnen(false)} />}
                  {darfVorschlagen && (
                    <button
                      type="button"
                      onClick={() => setAnsicht("neu")}
                      aria-label="Motto vorschlagen"
                      className="-my-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90"
                    >
                      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-brand text-[18px] font-bold leading-none text-white">+</span>
                    </button>
                  )}
                </>
              }
            />
            <AusHinweis funktion="motto" className="-mt-2 mb-3" />
            <GesperrtZeile className="-mt-1 mb-3" />
            <TeilUmschalter teil={teil} setTeil={setTeil} zahlen={zahlen} className="mb-4" />

            <TeilWischer teil={teil} setTeil={setTeil}>
              {/* ------------------------------------------ Gewinner oder aktueller Stand */}
              {(gewinner || herzen) && (
                <div className="mb-3 scroll-mt-2" id="motto-gewinner">
                  <GewinnerBuehne gewinner={gewinner} herzen={herzen} titel={teil === "offiziell" ? "Unser Abimotto" : TEIL_NAME[teil]} />
                </div>
              )}
              {!gewinner && (
                <StandKarte
                  m={m}
                  r={r}
                  teil={teil}
                  runde={runde}
                  anzahl={sichtbare.length}
                  rundeZahlenDa={rundeZahlenDa}
                  darfRunden={darfRunden}
                  darfVerwalten={darfVerwalten}
                  darfKueren={darfKueren}
                  gesperrt={banned}
                  onVorschlag={() => setAnsicht("neu")}
                  onAbstimmung={abstimmungStarten}
                  onRundeStarten={() => setStarten(quellen)}
                  onKueren={kuerenOeffnen}
                  onErgebnis={() => setReiter("ergebnis")}
                  onSteuern={() => einstellungenOeffnen(true)}
                  onAbstimmen={(id) => {
                    // Zur Wahl-Liste (RundenAbschnitt trägt die id „runde-<id>“)
                    setReiter("vorschlaege");
                    window.setTimeout(() => document.getElementById(`runde-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
                  }}
                />
              )}

              {/* ------------------------------------------ Vorschläge | Ergebnis */}
              <div className="seg mb-3" role="tablist" aria-label="Ansicht">
                {(["vorschlaege", "ergebnis"] as Reiter[]).map((x) => (
                  <button key={x} type="button" role="tab" aria-selected={reiter === x} onClick={() => setReiter(x)} className={`seg-item ${reiter === x ? "seg-aktiv" : ""}`}>
                    {x === "vorschlaege" ? "Vorschläge" : "Ergebnis"}
                  </button>
                ))}
              </div>

              {reiter === "vorschlaege" ? (
                <VorschlagListe
                  m={m}
                  teil={teil}
                  liste={imTeil.filter((x) => darfVerwalten || !x.ausgeblendet)}
                  offeneRunde={offeneRunde}
                  r={r}
                  gesperrt={banned}
                  darfRunden={darfRunden}
                  darfVerwalten={darfVerwalten}
                  gewinnerId={gewinner?.ziel_id ?? null}
                  herzenId={herzen?.ziel_id ?? null}
                  antragZu={vs.antragZu}
                  onBearbeiten={(x) => setBearbeite(x.id)}
                  onVerschieben={(x) => void verschieben(x)}
                  onVorschlag={darfVorschlagen ? () => setAnsicht("neu") : undefined}
                />
              ) : (
                <ErgebnisAnsicht
                  m={m}
                  r={r}
                  runde={runde}
                  sichtbare={sichtbare}
                  rundeZahlenDa={rundeZahlenDa}
                  likesSichtbar={likesSichtbar}
                  fuerAlle={ergebnisse.alle.motto}
                  darfKueren={darfKueren}
                  gekuert={!!gewinner}
                  onKueren={kuerenOeffnen}
                />
              )}
            </TeilWischer>
            {/* Stufenteam ohne Recht: sagen, wer das verwaltet (statt kein Zahnrad ohne Erklärung) */}
            <VerwaltetVon bereich="Das Abimotto" komitee="Motto & Pullis" darf={darfEinstellungen} />
          </>
        )}
      </Sheet>

      {/* ------------------------------------------ Einstellungen (Zahnrad) */}
      <EinstellungenBlatt
        offen={offen && einstellungen}
        fokusRunde={fokusRunde}
        onClose={() => {
          setEinstellungen(false);
          setFokusRunde(false);
        }}
        m={m}
        r={r}
        teil={teil}
        setTeil={setTeil}
        runde={runde}
        rundenGruppe={rundenGruppe}
        quellen={quellen}
        fuerAlle={ergebnisse.alle.motto}
        setFuerAlle={async (v) => {
          const f = await ergebnisse.setzen("motto", v);
          if (f) meldeFehler("Ging nicht: " + f);
          else void m.neuZaehlen();
        }}
        gewinner={gewinner}
        herzen={herzen}
        vs={vs}
        onKueren={kuerenOeffnen}
      />

      {/* ------------------------------------------ Blätter darüber */}
      <RundeStartenSheet
        offen={offen && starten !== null}
        quellen={starten || []}
        gruppe={rundenGruppe}
        gruppeTitel=""
        stand={r}
        mitHerz
        wahlTitel="Abimotto-Wahl"
        onClose={() => setStarten(null)}
      />
      <KuerenBlatt
        open={offen && kuer !== null}
        onClose={() => setKuer(null)}
        titel={teil === "offiziell" ? "Abimotto küren" : "Inoffiziellen Gewinner küren"}
        kandidaten={kuer?.kandidaten ?? KEINE_KANDIDATEN}
        gewinner={gekuert}
        herzen={herzen}
        onKueren={kueren}
        onZuruecknehmen={zuruecknehmen}
        hinweis={
          teil === "offiziell"
            ? "Danach sehen alle – auch Eltern – beim nächsten Öffnen die Enthüllung."
            : "Der inoffizielle Gewinner bleibt in der Stufe – keine Enthüllung, Eltern sehen ihn nie."
        }
        onFertig={nachKueren}
      />
      <VorschlagBlatt x={offen ? bearbeiteMotto : null} onClose={() => setBearbeite(null)} m={m} verschieben={verschieben} vs={vs} />
    </>
  );
}

/* ====================================================================== */
/* Stand-Karte: was gerade passiert – mit der Haupt-Aktion                */
/* ====================================================================== */
function StandKarte({
  m,
  r,
  teil,
  runde,
  anzahl,
  rundeZahlenDa,
  darfRunden,
  darfVerwalten,
  darfKueren,
  gesperrt,
  onVorschlag,
  onAbstimmung,
  onRundeStarten,
  onKueren,
  onErgebnis,
  onSteuern,
  onAbstimmen,
}: {
  m: MottoWahl;
  r: RundenStand;
  teil: Teil;
  runde: Runde | null;
  anzahl: number;
  rundeZahlenDa: boolean;
  darfRunden: boolean;
  darfVerwalten: boolean;
  darfKueren: boolean;
  gesperrt: boolean;
  onVorschlag: () => void;
  onAbstimmung: () => void;
  onRundeStarten: () => void;
  onKueren: () => void;
  onErgebnis: () => void;
  onSteuern: () => void;
  onAbstimmen: (rundeId: string) => void;
}) {
  let symbol: { icon: "stimme" | "pokal" | "plus" | "herz"; farbe: string };
  let titel: string;
  let text: ReactNode;
  const knoepfe: ReactNode[] = [];
  const haupt = (k: string, label: string, onClick: () => void) => (
    <button key={k} type="button" className="btn-klein" onClick={onClick}>
      {label}
    </button>
  );
  const neben = (k: string, label: string, onClick: () => void) => (
    <button key={k} type="button" className="btn-klein-grau" onClick={onClick}>
      {label}
    </button>
  );

  if (runde?.offen) {
    // Runde 2 (oder später) läuft – abgestimmt wird direkt darunter
    const uebrig = Math.max(0, runde.stimmen - r.meineIn(runde.id).length);
    symbol = { icon: "stimme", farbe: "bg-brand" };
    titel = `Runde ${runde.nr} läuft`;
    // Name der Runde (z. B. „Finale“) vorn im Satz – die Marke trägt schon die Wahl darunter
    const name = runde.titel && runde.titel !== `Runde ${runde.nr}` ? `${runde.titel}: ` : "";
    text = gesperrt
      ? GESPERRT_TEXT
      : uebrig === 0
        ? `${name}Du hast ${runde.stimmen === 1 ? "deine Stimme" : `alle ${runde.stimmen} Stimmen`} vergeben. Danke!`
        : `${name}Du hast noch ${uebrig} von ${stimmenText(runde.stimmen)}.`;
    if (!gesperrt) knoepfe.push((uebrig > 0 ? haupt : neben)("abstimmen", uebrig > 0 ? "Jetzt abstimmen" : "Meine Stimmen", () => onAbstimmen(runde.id)));
    if (darfKueren) knoepfe.push(neben("kueren", "Gewinner küren …", onKueren));
    if (darfRunden) knoepfe.push(neben("steuern", "Runde steuern", onSteuern));
    if (rundeZahlenDa) knoepfe.push(neben("ergebnis", "Ergebnis", onErgebnis));
  } else if (runde) {
    // Runde beendet, aber noch kein Gewinner gekürt
    const vorn = rundeZahlenDa
      ? [...r.kandidatenVon(runde.id).filter((k) => !k.hm)].sort((a, b) => (r.zahl(runde.id, b.ziel_id) ?? 0) - (r.zahl(runde.id, a.ziel_id) ?? 0))[0]
      : null;
    symbol = { icon: "pokal", farbe: "bg-[#F5A524]" };
    titel = `Runde ${runde.nr} ist beendet`;
    text = vorn ? `Vorn liegt „${vorn.label}“. ${darfKueren ? "Jetzt das Motto küren." : "Das Komitee kürt bald das Motto."}` : "Das Komitee wertet aus und kürt bald das Motto.";
    if (darfKueren) knoepfe.push(haupt("kueren", "Gewinner küren …", onKueren));
    if (rundeZahlenDa) knoepfe.push(neben("ergebnis", "Ergebnis ansehen", onErgebnis));
    if (darfRunden && anzahl >= 2) knoepfe.push(neben("neu", `Nächste Runde (${runde.nr + 1}) starten`, onRundeStarten));
  } else if (m.abstimmung) {
    // Runde 1: alle liken
    const meine = m.mottos.filter((x) => x.bereich === teil && !x.ausgeblendet && m.meine(x.id, "like")).length;
    symbol = { icon: "herz", farbe: "bg-[#FF375F]" };
    titel = "Abstimmung läuft";
    text = gesperrt
      ? GESPERRT_TEXT
      : `Like alle Mottos, die dir gefallen – so viele du willst. ${meine ? `Du hast ${meine} gelikt.` : "Du hast noch keins gelikt."}`;
    if (darfRunden && anzahl >= 2) knoepfe.push(haupt("runde", "Runde 2 starten", onRundeStarten));
    if (darfKueren && anzahl >= 1) knoepfe.push(neben("kueren", "Gewinner küren …", onKueren));
    if (m.zahlenSichtbar) knoepfe.push(neben("ergebnis", "Ergebnis ansehen", onErgebnis));
  } else {
    // Vorschläge sammeln
    symbol = { icon: "plus", farbe: "bg-[#FF9500]" };
    titel = "Vorschläge sammeln";
    text = anzahl
      ? `${vorschlaegeText(anzahl)} bisher. Abgestimmt wird, sobald das Komitee die Abstimmung freigibt.`
      : `Noch kein Vorschlag im Teil ${TEIL_NAME[teil]}. Mach den Anfang!`;
    if (!gesperrt) knoepfe.push(haupt("vorschlag", "Vorschlag einreichen", onVorschlag));
    if (darfVerwalten) knoepfe.push(neben("abstimmung", "Abstimmung starten", onAbstimmung));
    else if (darfRunden && anzahl >= 2) knoepfe.push(neben("runde", "Runde 2 starten", onRundeStarten));
  }

  return (
    <section className="mb-3 animate-aufsteigen rounded-[1.25rem] zelle p-4 shadow-[0_1px_3px_rgba(0,0,0,.05)]" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className={`symbol ${symbol.farbe}`}>
          <Icon name={symbol.icon} size={17} strich={2.3} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-bold leading-tight tracking-[-0.01em]">{titel}</h3>
          <p className="mt-1 text-[14px] leading-snug text-tinte-matt dark:text-slate-300">{text}</p>
        </div>
      </div>
      {knoepfe.length > 0 && <div className="mt-3.5 flex flex-wrap gap-2">{knoepfe}</div>}
    </section>
  );
}

/* ====================================================================== */
/* Reiter „Vorschläge“                                                    */
/* ====================================================================== */
function VorschlagListe({
  m,
  teil,
  liste,
  offeneRunde,
  r,
  gesperrt,
  darfRunden,
  darfVerwalten,
  gewinnerId,
  herzenId,
  antragZu,
  onBearbeiten,
  onVerschieben,
  onVorschlag,
}: {
  m: MottoWahl;
  teil: Teil;
  liste: Motto[];
  offeneRunde: Runde | null;
  r: RundenStand;
  gesperrt: boolean;
  darfRunden: boolean;
  darfVerwalten: boolean;
  gewinnerId: string | null;
  herzenId: string | null;
  antragZu: (id: string) => Verschiebung | null;
  onBearbeiten: (x: Motto) => void;
  onVerschieben: (x: Motto) => void;
  onVorschlag?: () => void;
}) {
  // Sind die Likes sichtbar und läuft die Abstimmung, lässt sich nach Likes sortieren
  const sortierbar = m.zahlenSichtbar && m.abstimmung;
  const [sort, setSort] = useState<"top" | "neu">("top");
  const nachLikes = sortierbar && sort === "top";
  const sortiert = [...liste].sort((a, b) =>
    nachLikes ? m.zahl(b.id, "like") - m.zahl(a.id, "like") || b.created_at.localeCompare(a.created_at) : b.created_at.localeCompare(a.created_at),
  );

  return (
    <>
      {/* Läuft eine Runde, steht die Wahl ganz oben – abstimmen ohne Suchen.
          Steuerung steht im Zahnrad-Blatt (nurWahl); wer leitet, sieht die Zahlen. */}
      {offeneRunde && (
        <RundenAbschnitt stand={r} gruppe={offeneRunde.gruppe} quellen={[]} leitet={darfRunden} nurWahl gesperrt={gesperrt} wahlTitel="Abimotto-Wahl" mitHerz />
      )}

      <div className="mb-1.5 mt-1 flex min-h-[32px] items-center gap-2 px-1">
        <h3 className="min-w-0 flex-1 text-[13px] uppercase tracking-[0.02em] text-tinte-leise">
          {offeneRunde ? "Alle Vorschläge" : "Vorschläge"} · {liste.filter((x) => !x.ausgeblendet).length}
        </h3>
        {sortierbar && liste.length > 1 && (
          <div className="seg w-[150px] shrink-0" role="radiogroup" aria-label="Sortieren">
            {(["top", "neu"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={sort === s}
                onClick={() => setSort(s)}
                className={`seg-item !px-1 !py-1 !text-[12.5px] ${sort === s ? "seg-aktiv" : ""}`}
              >
                {s === "top" ? "Beliebt" : "Neu"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {sortiert.map((x) => (
          <MottoZeile
            key={x.id}
            x={x}
            m={m}
            gesperrt={gesperrt}
            darfVerwalten={darfVerwalten}
            gewinner={x.id === gewinnerId ? "gewinner" : x.id === herzenId ? "herzen" : null}
            antrag={darfVerwalten ? antragZu(x.id) : null}
            onBearbeiten={() => onBearbeiten(x)}
            onVerschieben={() => onVerschieben(x)}
          />
        ))}
        {sortiert.length === 0 && (
          <div className="rounded-[1.25rem] zelle px-5 py-8 text-center">
            <span className={`mx-auto flex h-11 w-11 items-center justify-center rounded-full ${TEIL_FARBE[teil].grund} ${TEIL_FARBE[teil].text}`}>
              <Icon name="funke" size={20} />
            </span>
            <p className="mt-2 text-[15px] font-semibold">Noch keine Vorschläge</p>
            <p className="mt-0.5 text-[13px] leading-snug text-tinte-leise">
              {teil === "offiziell" ? "Hier steht, was aufs Abibuch und die Pullis kommen kann." : "Hier ist Platz für alles, was nur unsere Stufe versteht."}
            </p>
            {onVorschlag && (
              <button type="button" className="btn-klein mt-3" onClick={onVorschlag}>
                Ersten Vorschlag einreichen
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function MottoZeile({
  x,
  m,
  gesperrt,
  darfVerwalten,
  gewinner,
  antrag,
  onBearbeiten,
  onVerschieben,
}: {
  x: Motto;
  m: MottoWahl;
  gesperrt: boolean;
  darfVerwalten: boolean;
  gewinner: GewinnerArt | null;
  antrag: Verschiebung | null;
  onBearbeiten: () => void;
  onVerschieben: () => void;
}) {
  const nach: Teil = x.bereich === "offiziell" ? "inoffiziell" : "offiziell";
  const an = m.meine(x.id, "like");
  const tippen = async () => {
    if (gesperrt) return meldeFehler(GESPERRT_TEXT);
    const f = await m.abstimmen(x.id, "like");
    if (f) meldeFehler("Ging nicht: " + f);
  };
  return (
    <div
      className={`rounded-[1.1rem] zelle p-3.5 shadow-[0_1px_2px_rgba(0,0,0,.04)] ${
        gewinner === "gewinner" ? "ring-2 ring-[#F5B53F]/70" : gewinner === "herzen" ? "ring-2 ring-[#FF4F7B]/50" : ""
      } ${x.ausgeblendet ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {(gewinner || x.ausgeblendet || antrag) && (
            <div className="mb-1 flex flex-wrap gap-1.5">
              {gewinner && <GewinnerMarke art={gewinner} />}
              {x.ausgeblendet && (
                <span className="rounded-full bg-[rgb(118_118_128/0.12)] px-2 py-0.5 text-[12px] font-semibold text-tinte-matt dark:bg-[rgb(118_118_128/0.24)] dark:text-slate-300">
                  Ausgeblendet
                </span>
              )}
              {antrag && (
                <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${TEIL_FARBE[antrag.nach].grund} ${TEIL_FARBE[antrag.nach].text}`}>
                  → {TEIL_NAME[antrag.nach]} · {antrag.stimmen}/{antrag.noetig}
                </span>
              )}
            </div>
          )}
          <div className="text-[16px] font-bold leading-snug [overflow-wrap:anywhere]">{x.text}</div>
          {x.erklaerung && <div className="mt-0.5 text-[13px] leading-snug text-tinte-matt dark:text-slate-300">{x.erklaerung}</div>}
          <div className="mt-1 flex items-center gap-3">
            {m.istMeins(x.id) ? (
              <span className="text-[12px] text-tinte-leise">Dein Vorschlag</span>
            ) : (
              // Tippfläche größer als das Symbol, ohne die Zeile höher zu machen
              <MeldenKnopf onClick={() => melden("motto", x.id)} className="-my-2.5 min-h-[44px] -mx-1 px-1" />
            )}
            {/* Verschieben sichtbar an der Zeile (nicht nur hinter „···“) – wie bei den Zitaten */}
            {darfVerwalten && !antrag && (
              <button type="button" onClick={onVerschieben} className={`-my-2.5 inline-flex min-h-[44px] items-center gap-1 text-[12.5px] font-semibold ${TEIL_FARBE[nach].text}`}>
                Nach {TEIL_NAME[nach]}
              </button>
            )}
            {darfVerwalten && <AutorInfo art="motto" id={x.id} />}
          </div>
        </div>
        {m.abstimmung && !x.ausgeblendet && <StimmKnopf an={an} zahl={m.zahlenSichtbar ? m.zahl(x.id, "like") : undefined} onClick={() => void tippen()} />}
        {darfVerwalten && (
          <button
            type="button"
            onClick={onBearbeiten}
            aria-label={`„${x.text}“ verwalten`}
            className="-mr-1.5 flex h-11 w-9 shrink-0 items-center justify-center rounded-full text-tinte-matt transition active:scale-90 dark:text-slate-300"
          >
            <span className="flex h-[28px] w-[28px] items-center justify-center rounded-full bg-[rgb(118_118_128/0.12)] dark:bg-[rgb(118_118_128/0.24)]">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
                <circle cx="5.5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="18.5" cy="12" r="1.8" />
              </svg>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

/** Herz als Linienzeichen (gefüllt = gelikt) – ein Symbol für „Like“ im ganzen Bereich */
function HerzZeichen({ gefuellt, size = 16 }: { gefuellt?: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={gefuellt ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2.2} strokeLinejoin="round" aria-hidden>
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
    </svg>
  );
}

function StimmKnopf({ an, zahl, onClick }: { an: boolean; zahl?: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={an}
      aria-label={an ? "Gefällt mir – zurücknehmen" : "Gefällt mir"}
      className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold transition active:scale-90 ${
        an ? "bg-brand text-white shadow-[0_4px_12px_-4px_rgb(var(--brand)/.8)]" : "bg-[rgb(118_118_128/0.12)] text-tinte dark:bg-[rgb(118_118_128/0.24)] dark:text-slate-100"
      }`}
    >
      <span className={an ? "animate-herz" : ""}>
        <HerzZeichen gefuellt={an} />
      </span>
      {zahl !== undefined ? <span className="zahl">{zahl}</span> : an ? "Gefällt mir" : "Like"}
    </button>
  );
}

/* ====================================================================== */
/* Reiter „Ergebnis“                                                      */
/* ====================================================================== */
function ErgebnisAnsicht({
  m,
  r,
  runde,
  sichtbare,
  rundeZahlenDa,
  likesSichtbar,
  fuerAlle,
  darfKueren,
  gekuert,
  onKueren,
}: {
  m: MottoWahl;
  r: RundenStand;
  runde: Runde | null;
  sichtbare: Motto[];
  rundeZahlenDa: boolean;
  likesSichtbar: boolean;
  fuerAlle: boolean;
  darfKueren: boolean;
  gekuert: boolean;
  onKueren: () => void;
}) {
  const [alleLikes, setAlleLikes] = useState(false);
  const likes = sichtbare.map((x) => ({ id: x.id, label: x.text, unter: x.erklaerung, n: m.zahl(x.id, "like") })).sort((a, b) => b.n - a.n);
  const zeigeLikes = alleLikes ? likes : likes.slice(0, 10);
  const ks = runde ? r.kandidatenVon(runde.id).map((k) => ({ id: k.ziel_id, label: k.label, unter: k.unter, hm: !!k.hm, n: r.zahl(runde.id, k.ziel_id) ?? 0 })) : [];
  const wahl = ks.filter((k) => !k.hm).sort((a, b) => b.n - a.n);
  const herz = ks.filter((k) => k.hm).sort((a, b) => b.n - a.n);
  const nichts = !runde && (!likesSichtbar || likes.length === 0);

  return (
    <div className="space-y-4">
      {runde &&
        (rundeZahlenDa ? (
          <>
            <Gruppe
              className=""
              titel={`Runde ${runde.nr}${runde.titel && runde.titel !== `Runde ${runde.nr}` ? ` · ${runde.titel}` : ""}${runde.offen ? " · läuft" : " · beendet"}`}
              fuss={`${personenText(r.teilnehmer(runde.id), "gewählt")} · ${runde.ergebnis_sichtbar ? "für alle sichtbar" : "nur für das Komitee sichtbar"}`}
            >
              <RangListe eintraege={wahl} />
            </Gruppe>
            {herz.length >= 2 && (
              <Gruppe className="" titel="Gewinner der Herzen" fuss={`${r.teilnehmerHerz(runde.id)} Herzstimmen`}>
                <RangListe eintraege={herz} herz />
              </Gruppe>
            )}
          </>
        ) : (
          <HinweisZelle icon="stimme" titel={`Runde ${runde.nr} ${runde.offen ? "läuft" : "ist beendet"}`} text="Das Ergebnis sieht gerade nur das Komitee." />
        ))}

      {likesSichtbar
        ? likes.length > 0 && (
            <Gruppe
              className=""
              titel={runde ? "Runde 1 · Likes" : "Likes"}
              fuss={`${m.waehlende ? `${personenText(m.waehlende, "gelikt")} · ` : ""}${fuerAlle ? "für alle sichtbar" : "nur für das Komitee sichtbar"}`}
            >
              <RangListe eintraege={zeigeLikes} likes />
              {likes.length > 10 && (
                <button type="button" onClick={() => setAlleLikes((v) => !v)} className="flex min-h-[44px] w-full items-center justify-center px-4 text-[15px] font-semibold text-brand-dark dark:text-brand">
                  {alleLikes ? "Weniger zeigen" : `Alle ${likes.length} zeigen`}
                </button>
              )}
            </Gruppe>
          )
        : runde && <HinweisZelle icon="herz" titel="Likes" text="Die Zahlen sieht gerade nur das Komitee." />}

      {nichts && (
        <HinweisZelle
          icon="pokal"
          titel="Noch kein Ergebnis"
          text={likes.length === 0 ? "Erst Vorschläge sammeln, dann abstimmen – das Ergebnis steht dann hier." : "Sobald das Komitee das Ergebnis freigibt oder das Motto kürt, steht es hier."}
        />
      )}

      {darfKueren && (runde || likes.length >= 1) && (
        <button type="button" className="btn-grau" onClick={onKueren}>
          {gekuert ? "Gewinner ändern …" : "Gewinner küren …"}
        </button>
      )}
    </div>
  );
}

function HinweisZelle({ icon, titel, text }: { icon: "stimme" | "herz" | "pokal"; titel: string; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-[0.875rem] zelle px-4 py-3">
      <span className="symbol bg-[#8E8E93]">
        <Icon name={icon} size={16} strich={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{titel}</span>
        <span className="block text-[13px] leading-snug text-tinte-leise">{text}</span>
      </span>
    </div>
  );
}

/** Rangliste mit Platz, Balken und Zahl – in einer Gruppe */
function RangListe({ eintraege, herz, likes }: { eintraege: { id: string; label: string; unter?: string; n: number }[]; herz?: boolean; likes?: boolean }) {
  const hoechste = Math.max(1, ...eintraege.map((e) => e.n));
  return (
    <>
      {eintraege.map((e, i) => {
        const medaille = e.n > 0 && i < 3;
        return (
          <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
            <span
              className={`zahl flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${medaille ? "text-[#1C1C1E]" : "text-tinte-matt dark:text-slate-300"}`}
              style={{ background: medaille ? MEDAILLE[i] : "rgb(118 118 128 / .16)" }}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{e.label}</span>
              {e.unter && <span className="block truncate text-[12.5px] text-tinte-leise">{e.unter}</span>}
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-[rgb(118_118_128/0.16)]">
                <span className={`block h-full rounded-full ${herz ? "bg-[#FF2D55]" : "bg-brand"}`} style={{ width: `${Math.round((e.n / hoechste) * 100)}%` }} />
              </span>
            </span>
            <span className="zahl shrink-0 text-right text-[15px] font-bold">
              <span className="mr-1 inline-flex align-middle text-tinte-leise">{likes ? <HerzZeichen size={13} /> : herz ? <span className="text-[12px] font-semibold">♥</span> : null}</span>
              {e.n}
            </span>
          </div>
        );
      })}
    </>
  );
}

/* ====================================================================== */
/* Einstellungen – alles an einem Ort                                     */
/* ====================================================================== */
function EinstellungenBlatt({
  offen,
  fokusRunde,
  onClose,
  m,
  r,
  teil,
  setTeil,
  runde,
  rundenGruppe,
  quellen,
  fuerAlle,
  setFuerAlle,
  gewinner,
  herzen,
  vs,
  onKueren,
}: {
  offen: boolean;
  /** Geöffnet über „Runde steuern“: passender Titel, springt zur Gruppe Runden */
  fokusRunde: boolean;
  onClose: () => void;
  m: MottoWahl;
  r: RundenStand;
  teil: Teil;
  setTeil: (t: Teil) => void;
  runde: Runde | null;
  rundenGruppe: string;
  quellen: Quelle[];
  fuerAlle: boolean;
  setFuerAlle: (v: boolean) => Promise<void>;
  gewinner: Gewinner | null;
  herzen: Gewinner | null;
  vs: ReturnType<typeof useVerschiebungen>;
  onKueren: () => void;
}) {
  const { can } = useRole();
  const darfRunden = can("motto.runden");
  const darfVerwalten = can("motto.verwalten");
  const darfKueren = darfRunden || darfVerwalten;
  const wfRecht = useWfRecht();
  const darfWortfilter = wfRecht("motto") || wfRecht("motto_inoffiziell");

  // „Runde steuern“ → direkt zur Gruppe Runden springen (das Blatt ist lang)
  useEffect(() => {
    if (!offen || !fokusRunde) return;
    const t = window.setTimeout(() => document.getElementById("motto-runden")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    return () => window.clearTimeout(t);
  }, [offen, fokusRunde]);

  return (
    <Sheet open={offen} onClose={onClose}>
      <SheetKopf
        titel={fokusRunde ? "Runde steuern" : "Einstellungen"}
        unter={fokusRunde ? "Abimotto · weitere Einstellungen findest du weiter unten" : "Abimotto · Runden, Ergebnis und Gewinner gelten je Teil"}
        onClose={onClose}
      />
      <TeilUmschalter teil={teil} setTeil={setTeil} ohneErklaerung />

      {/* 1) Abstimmung – Likes für beide Teile, Runden je Teil */}
      {darfVerwalten && (
        <Gruppe titel="Abstimmung" fuss="Gilt für beide Teile. Danach geht es mit Runde 2 weiter – einer engeren Auswahl.">
          <label className="flex min-h-[52px] items-center gap-3 px-4 py-2">
            <span className="symbol bg-[#FF375F]">
              <Icon name="herz" size={16} strich={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px]">Likes freigeben (Runde 1)</span>
              <span className="block text-[12.5px] leading-snug text-tinte-leise">
                {m.abstimmung ? "An: alle liken, neue Vorschläge nur noch vom Komitee" : "Aus: alle reichen Vorschläge ein"}
              </span>
            </span>
            <Schalter
              an={m.abstimmung}
              label="Likes freigeben"
              onChange={async (v) => {
                const f = await m.abstimmungSetzen(v);
                if (f) meldeFehler("Ging nicht: " + f);
                else melde(v ? "Abstimmung ist freigegeben" : "Zurück zu Vorschlägen", "erfolg");
              }}
            />
          </label>
        </Gruppe>
      )}
      <div id="motto-runden" className="scroll-mt-2">
        <RundenEinstellungen
          stand={r}
          gruppe={rundenGruppe}
          quellen={quellen}
          leitet={darfRunden}
          titel={darfVerwalten ? `Runden · ${TEIL_NAME[teil]}` : `Abstimmung · ${TEIL_NAME[teil]}`}
          startText="Runde starten"
          wahlTitel="Abimotto-Wahl"
          mitHerz
          className={darfVerwalten ? "mt-5" : "mt-4"}
        />
      </div>

      {/* 2) Ergebnisse */}
      {darfKueren && (
        <Gruppe titel="Ergebnisse" fuss="Das Komitee sieht die Zahlen immer. Wer was gewählt hat, sieht niemand. Das Ergebnis steht für alle im Segment „Ergebnis“.">
          <div className="px-4 py-1">
            <SichtbarkeitWahl titel="Likes sehen" alle={fuerAlle} onChange={(v) => void setFuerAlle(v)} />
          </div>
          {/* Laufende Runde: Sichtbarkeit steht oben bei den Runden; beendete hier */}
          {darfRunden && runde && !runde.offen && (
            <div className="px-4 py-1">
              <SichtbarkeitWahl
                titel={`Runde ${runde.nr} sehen`}
                alle={runde.ergebnis_sichtbar}
                onChange={async (v) => {
                  const f = await r.aendern(runde.id, { ergebnis: v });
                  if (f) meldeFehler("Ging nicht: " + f);
                }}
              />
            </div>
          )}
        </Gruppe>
      )}

      {/* 3) Gewinner */}
      {darfKueren && (
        <Gruppe
          titel={`Gewinner · ${TEIL_NAME[teil]}`}
          fuss={
            teil === "offiziell"
              ? "Das offizielle Motto sehen danach alle – auch Eltern – als Enthüllung beim nächsten Öffnen der App."
              : "Der inoffizielle Gewinner bleibt in der Stufe – ohne Enthüllung."
          }
        >
          <Zeile
            label="Gewinner küren …"
            onClick={onKueren}
            symbol={
              <span className="symbol bg-[#F5A524]">
                <Icon name="pokal" size={16} strich={2.2} />
              </span>
            }
          >
            <Wert>{gewinner ? gewinner.label : "noch offen"}</Wert>
          </Zeile>
          {herzen && (
            <Zeile
              label="Gewinner der Herzen"
              symbol={
                <span className="symbol bg-[#FF4F7B]">
                  <Icon name="herz" size={16} strich={2.2} />
                </span>
              }
            >
              <Wert>{herzen.label}</Wert>
            </Zeile>
          )}
          {teil === "offiziell" && gewinner && (
            <Zeile
              label="Enthüllung ansehen"
              blau
              onClick={() => {
                onClose();
                // Merker zurücksetzen und sofort abspielen (MottoEnthuellung hört zu)
                zeigeMottoEnthuellung({ id: gewinner.ziel_id, motto: gewinner.label, stimmen: gewinner.stimmen });
              }}
            />
          )}
        </Gruppe>
      )}

      {/* 4) Offiziell & Inoffiziell */}
      {(darfWortfilter || darfVerwalten) && (
        <Gruppe titel="Offiziell & Inoffiziell" fuss="Verschieben beantragt man am Vorschlag („Nach Offiziell“). Es braucht Zustimmungen aus dem Team; Admins allein reichen. Offene Anträge stehen auch unter Chats → Anfragen.">
          <WortfilterSchalter zeile bereich="motto" titel="Wortfilter · Offiziell" />
          <WortfilterSchalter zeile bereich="motto_inoffiziell" titel="Wortfilter · Inoffiziell" />
          {darfVerwalten &&
            (vs.liste.length === 0 ? (
              <Zeile label="Offene Verschiebungen">
                <Wert>keine</Wert>
              </Zeile>
            ) : (
              vs.liste.map((v) => (
                <div key={v.id} className="px-4 py-2.5">
                  <span className="block text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{v.titel}</span>
                  <span className="block text-[12.5px] text-tinte-leise">
                    nach <span className={`font-semibold ${TEIL_FARBE[v.nach].text}`}>{TEIL_NAME[v.nach]}</span> · {v.stimmen} von {v.noetig} Zustimmungen
                  </span>
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="btn-klein" disabled={v.ich} onClick={() => void vs.zustimmen(v.id)}>
                      {v.ich ? "Zugestimmt" : "Zustimmen"}
                    </button>
                    <button type="button" className="btn-klein-grau !text-red-600 dark:!text-red-400" onClick={() => void vs.ablehnen(v.id)}>
                      Verwerfen
                    </button>
                  </div>
                </div>
              ))
            ))}
        </Gruppe>
      )}

      {/* 5) Wer darf was? */}
      <KachelVerwaltung kachel="motto" />
    </Sheet>
  );
}

/* ====================================================================== */
/* Einen Vorschlag verwalten (···)                                        */
/* ====================================================================== */
function VorschlagBlatt({
  x,
  onClose,
  m,
  vs,
  verschieben,
}: {
  x: Motto | null;
  onClose: () => void;
  m: MottoWahl;
  vs: ReturnType<typeof useVerschiebungen>;
  /** gemeinsame Rückfrage + Antrag (useMottoVerschieben) */
  verschieben: (x: Motto) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [erkl, setErkl] = useState("");
  const [fuer, setFuer] = useState<string | null>(null);
  // Beim Öffnen eines (anderen) Vorschlags die Felder füllen
  if (x && fuer !== x.id) {
    setFuer(x.id);
    setText(x.text);
    setErkl(x.erklaerung);
  }
  if (!x && fuer !== null) setFuer(null);

  const speichern = async (patch: Parameters<MottoWahl["aendern"]>[1]) => {
    if (!x) return "kein Vorschlag";
    const f = await m.aendern(x.id, patch);
    if (f) meldeFehler("Ging nicht: " + f);
    return f;
  };
  const nach: Teil = x?.bereich === "offiziell" ? "inoffiziell" : "offiziell";
  const antrag = x ? vs.antragZu(x.id) : null;
  const geaendert = !!x && (text.trim() !== x.text || erkl.trim() !== x.erklaerung);

  return (
    <Sheet open={!!x} onClose={onClose}>
      {x && (
        <>
          <SheetKopf titel="Vorschlag verwalten" unter={`Liegt im Teil ${TEIL_NAME[x.bereich]}`} onClose={onClose} />
          <Gruppe className="" titel="Text">
            <input className="w-full bg-transparent px-4 py-3 text-[16px] font-semibold outline-none" maxLength={80} value={text} onChange={(e) => setText(e.target.value)} aria-label="Motto" />
            <input
              className="w-full bg-transparent px-4 py-3 text-[15px] outline-none placeholder:text-tinte-leise"
              maxLength={200}
              placeholder="Erklärung (optional)"
              value={erkl}
              onChange={(e) => setErkl(e.target.value)}
              aria-label="Erklärung"
            />
          </Gruppe>
          {geaendert && (
            <button
              type="button"
              className="btn-primary mt-3"
              disabled={text.trim().length < 2}
              onClick={async () => {
                if (!(await speichern({ text: text.trim(), erklaerung: erkl.trim() }))) melde("Gesichert", "erfolg");
              }}
            >
              Änderung sichern
            </button>
          )}

          <Gruppe titel="Sichtbarkeit" fuss="Ausgeblendete Vorschläge sieht nur, wer das Motto verwaltet.">
            <label className="flex min-h-[48px] items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1 text-[15px]">Für alle sichtbar</span>
              <Schalter an={!x.ausgeblendet} label={`${x.text} sichtbar`} onChange={(v) => void speichern({ ausgeblendet: !v })} />
            </label>
            <Zeile label="Eingereicht von">
              <AutorInfo art="motto" id={x.id} />
            </Zeile>
          </Gruppe>

          <Gruppe
            titel="Teil"
            fuss={
              nach === "offiziell"
                ? "Offiziell kommt ins Abibuch und wird später auch Eltern gezeigt. Der Wortfilter prüft den Text dabei."
                : "Inoffiziell sieht nur die Stufe – es wird nicht gedruckt."
            }
          >
            {antrag ? (
              <Zeile label={`Nach ${TEIL_NAME[antrag.nach]} beantragt`}>
                <Wert>
                  {antrag.stimmen} von {antrag.noetig}
                </Wert>
                {!antrag.ich && (
                  <button type="button" className="btn-klein !px-3 !text-[13px]" onClick={() => void vs.zustimmen(antrag.id)}>
                    Zustimmen
                  </button>
                )}
              </Zeile>
            ) : (
              <Zeile
                label={<span className={TEIL_FARBE[nach].text}>Nach {TEIL_NAME[nach]} verschieben …</span>}
                onClick={() => void verschieben(x).then((fertig) => fertig && onClose())}
              />
            )}
          </Gruppe>
        </>
      )}
    </Sheet>
  );
}

/* ====================================================================== */
/* Vorschlagen                                                            */
/* ====================================================================== */
function Vorschlagen({ m, startTeil, fertig, schliessen }: { m: MottoWahl; startTeil: Teil; fertig: (t: Teil) => void; schliessen: () => void }) {
  const [text, setText] = useState("");
  const [erkl, setErkl] = useState("");
  // Standard ist der Teil, der gerade offen war
  const [teil, setTeil] = useState<Teil>(startTeil);
  const [sendet, setSendet] = useState(false);
  return (
    <div className="animate-vonRechts">
      <SheetKopf titel="Motto vorschlagen" unter="Alle aus der Stufe sehen den Vorschlag sofort." onClose={schliessen} zurueck={{ text: "Abimotto", onClick: () => fertig(startTeil) }} />
      <TeilUmschalter teil={teil} setTeil={setTeil} />
      <div className="mt-4 rounded-[1.25rem] zelle p-4">
        <div className={`text-[12px] font-semibold uppercase tracking-[0.08em] ${TEIL_FARBE[teil].text}`}>Vorschau · {TEIL_NAME[teil]}</div>
        <div className="mt-1 min-h-[1.8rem] text-[1.3rem] font-extrabold leading-tight [overflow-wrap:anywhere]">{text.trim() || "Dein Motto"}</div>
        {erkl.trim() && <div className="mt-0.5 text-[13px] text-tinte-matt dark:text-slate-300">{erkl.trim()}</div>}
      </div>
      <input className="field mt-3" maxLength={80} placeholder="z. B. ABIgeschlossen" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      <input className="field mt-2" maxLength={200} placeholder="Erklärung oder Wortspiel (optional)" value={erkl} onChange={(e) => setErkl(e.target.value)} />
      <div className="mt-1 px-1 text-right text-[12px] text-tinte-leise">{text.length}/80</div>
      <button
        className="btn-primary mt-3 w-full"
        disabled={text.trim().length < 2 || sendet}
        onClick={async () => {
          setSendet(true);
          const f = await m.vorschlagen(text, erkl, teil);
          setSendet(false);
          if (f) return meldeFehler(f);
          melde(`Vorschlag ist drin (${TEIL_NAME[teil]})`, "erfolg");
          setText("");
          setErkl("");
          fertig(teil);
        }}
      >
        {sendet ? "Wird gesendet …" : `Vorschlagen · ${TEIL_NAME[teil]}`}
      </button>
    </div>
  );
}
