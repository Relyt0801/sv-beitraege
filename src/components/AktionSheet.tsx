import { useEffect, useMemo, useRef, useState } from "react";
import { useTermine } from "../termine-store";
import { useStore } from "../store";
import { frage, meldeFehler } from "../lib/melder";
import { Sheet, SheetKopf } from "./Sheet";
import { Gruppe, Zeile, ZeileEingabe, ZeileHaken, ZeileMitSchalter } from "./Liste";
import { Schalter } from "./Schalter";
import { FussLeiste } from "./FussLeiste";
import { ZeitFeld } from "./ZeitFeld";
import {
  PAUSEN, WOCHENTAG_WAHL, heuteKey, plusTage, tagLang, uhr, wiederholungsTage,
  type Aktion, type NeuerTermin,
} from "../lib/termine";

/** Ohne Vorlage: die erste große Pause – dafür werden die meisten Aktionen
 *  (Waffelverkauf, Kuchenverkauf) ausgeschrieben, nicht für den ganzen Schultag. */
const STANDARD_VON = PAUSEN[0].von;
const STANDARD_BIS = PAUSEN[0].bis;

const ICONS = ["🧇", "🍰", "🥣", "☕", "🍪", "🎪", "🧹", "📦", "🎨", "🎵", "📣", "📌"];

/** Ein Zeitfenster eines Tages – eine Aktion kann mehrere haben (1. und 2. Pause). */
interface Fenster {
  id: number;
  von: string;
  ende: string;
}

/**
 * Eine Aktion mit Schichten ausschreiben.
 *
 * Beispiel Waffelverkauf: Aktion wählen (oder neu anlegen), dann entweder
 * einen einzelnen Termin oder "jeden Montag und Donnerstag, 1. große Pause,
 * bis zu den Ferien". Die Wiederholung wird sofort in einzelne Schichten
 * umgerechnet – so lässt sich eine ausgefallene Pause später einfach löschen,
 * ohne dass die ganze Reihe auseinanderfällt.
 *
 * Mehrere Schichten am selben Tag (z. B. 1. und 2. Pause) sind ein
 * Zeitfenster mehr – kein zweiter Durchlauf nötig.
 */
export function AktionSheet({ offen, onSchliessen }: { offen: boolean; onSchliessen: () => void }) {
  const { aktionen, termine: alleTermine, aktionAnlegen, aktionAendern, aktionProzent, aktionLoeschen, anlegenViele } = useTermine();
  // Wie viel eine Schicht zählt, kommt aus dem Beiträge-Reiter – so passen
  // Aktionen und eingetragene Mithilfe immer zusammen.
  const { templates } = useStore();
  const vorlagen = useMemo(
    () => [...templates].sort((a, b) => a.sort - b.sort || a.punkte - b.punkte),
    [templates],
  );

  const naechsteId = useRef(1);
  const neuesFenster = (von: string, ende: string): Fenster => ({ id: naechsteId.current++, von, ende });

  const [aktionId, setAktionId] = useState<string>("");
  const [neuTitel, setNeuTitel] = useState("");
  const [neuIcon, setNeuIcon] = useState("🧇");
  const [neuProzent, setNeuProzent] = useState("5");

  const [wiederholt, setWiederholt] = useState(false);
  const [datum, setDatum] = useState(heuteKey());
  const [bis, setBis] = useState(plusTage(heuteKey(), 42));
  const [tage, setTage] = useState<Set<number>>(new Set([1, 4]));
  const [ganztaegig, setGanztaegig] = useState(false);
  const [fenster, setFenster] = useState<Fenster[]>(() => [neuesFenster(STANDARD_VON, STANDARD_BIS)]);
  const [alsVorlage, setAlsVorlage] = useState(true);
  const [ort, setOrt] = useState("");
  const [plaetze, setPlaetze] = useState(2);

  const [fehler, setFehler] = useState("");
  const [busy, setBusy] = useState(false);

  const gewaehlt = aktionen.find((a) => a.id === aktionId) || null;

  // Aktion gewählt: ihre gespeicherten Zeiten, Ort und Plätze übernehmen.
  // Keine Vorlage oder neue Aktion: die erste große Pause.
  useEffect(() => {
    if (!offen) return;
    const v = aktionen.find((x) => x.id === aktionId);
    setGanztaegig(Boolean(v?.vorlage_ganztaegig));
    setFenster([
      neuesFenster(v?.vorlage_von ? uhr(v.vorlage_von) : STANDARD_VON, v?.vorlage_bis ? uhr(v.vorlage_bis) : STANDARD_BIS),
    ]);
    setOrt(v?.vorlage_ort || "");
    setPlaetze(v?.vorlage_plaetze || 2);
    setAlsVorlage(!v?.vorlage_von && !v?.vorlage_ganztaegig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktionId, offen]);
  const offeneAktionen = aktionen.filter((a) => !a.geschlossen);

  /** Die Tage, an denen tatsächlich eine Schicht entsteht. */
  const termine = useMemo(
    () => (wiederholt ? wiederholungsTage(datum, bis, [...tage]) : datum ? [datum] : []),
    [wiederholt, datum, bis, tage],
  );
  /** Zeitfenster ohne Doppelte – gleiche Zeiten würden sonst zwei gleiche Schichten ergeben. */
  const fensterListe = useMemo(() => {
    if (ganztaegig) return [{ von: null as string | null, bis: null as string | null }];
    const gesehen = new Set<string>();
    const aus: { von: string | null; bis: string | null }[] = [];
    for (const f of fenster) {
      const k = `${f.von}-${f.ende}`;
      if (gesehen.has(k)) continue;
      gesehen.add(k);
      aus.push({ von: f.von, bis: f.ende });
    }
    return aus;
  }, [fenster, ganztaegig]);
  const anzahl = termine.length * fensterListe.length;

  async function speichern() {
    setFehler("");
    let id = aktionId;

    // Neue Aktion? Erst anlegen, dann die Schichten dranhängen.
    if (!ganztaegig && fenster.some((f) => f.ende <= f.von)) return setFehler("Eine Endzeit liegt vor der Anfangszeit.");
    const erstes = fensterListe[0];
    const vorlage = {
      vorlage_von: ganztaegig ? null : erstes.von,
      vorlage_bis: ganztaegig ? null : erstes.bis,
      vorlage_ganztaegig: ganztaegig,
      vorlage_ort: ort.trim(),
      vorlage_plaetze: Math.max(1, Math.min(50, plaetze || 1)),
    };

    if (!id) {
      if (!neuTitel.trim()) return setFehler("Wähle eine Aktion oder gib ihr einen Namen.");
      setBusy(true);
      // Kennung vorab festlegen – dann hängen die Schichten sicher an der
      // richtigen Aktion, auch wenn die Liste noch nicht neu geladen ist.
      id = crypto.randomUUID();
      const f = await aktionAnlegen({
        id,
        titel: neuTitel.trim(),
        icon: neuIcon,
        beschreibung: "",
        prozent: Math.max(0, Math.min(100, Number(neuProzent) || 0)),
        geschlossen: false,
        ...(alsVorlage ? vorlage : {}),
      });
      setBusy(false);
      if (f) return setFehler("Die Aktion konnte nicht angelegt werden: " + f);
    } else if (alsVorlage) {
      await aktionAendern(id, vorlage);
    }

    if (termine.length === 0) return setFehler("Kein Tag getroffen. Prüfe Zeitraum und Wochentage.");

    const aktion = aktionen.find((a) => a.id === id);
    const liste: NeuerTermin[] = [];
    for (const tag of termine) {
      for (const f of fensterListe) {
        liste.push({
          titel: aktion?.titel || neuTitel.trim(),
          beschreibung: "",
          ort: ort.trim(),
          datum: tag,
          bis_datum: null,
          von: f.von,
          bis: f.bis,
          sichtbar: "alle",
          fuer_eltern: false,
          tags: [],
          personen: [],
          aktion_id: id,
          plaetze: Math.max(1, plaetze || 1),
          icon: aktion?.icon || neuIcon,
        });
      }
    }

    setBusy(true);
    const f = await anlegenViele(liste);
    setBusy(false);
    if (f) return setFehler("Die Schichten konnten nicht angelegt werden: " + f);
    onSchliessen();
  }

  /** Eine Pause an-/abwählen: gleiche Zeiten schon da → raus, sonst dazu. */
  function pauseUmschalten(von: string, ende: string) {
    setFenster((prev) => {
      const da = prev.find((f) => f.von === von && f.ende === ende);
      if (da) return prev.length > 1 ? prev.filter((f) => f !== da) : prev;
      return [...prev, neuesFenster(von, ende)];
    });
  }
  const einFenster = (id: number, teil: Partial<Fenster>) =>
    setFenster((prev) => prev.map((f) => (f.id === id ? { ...f, ...teil } : f)));

  return (
    <Sheet open={offen} onClose={onSchliessen}>
      <SheetKopf titel="Aktion mit Schichten" unter="Termine mit Plätzen, in die man sich einträgt" onClose={onSchliessen} />

      {/* ------------------------------------------------ Welche Aktion */}
      {offeneAktionen.length > 0 && (
        <Gruppe titel="Worum geht es?" className="mt-0">
          {offeneAktionen.map((a) => (
            <ZeileHaken
              key={a.id}
              gewaehlt={a.id === aktionId}
              onClick={() => setAktionId(a.id === aktionId ? "" : a.id)}
              label={
                <>
                  <span aria-hidden className="mr-2">{a.icon}</span>
                  {a.titel}
                </>
              }
              unter={`${a.vorlage_ganztaegig ? "ganztägig · " : a.vorlage_von ? `${uhr(a.vorlage_von)} Uhr · ` : ""}zählt +${a.prozent} %`}
            />
          ))}
          <ZeileHaken gewaehlt={!aktionId} onClick={() => setAktionId("")} label="Neue Aktion anlegen" />
        </Gruppe>
      )}

      {gewaehlt && (
        <AktionVerwalten
          aktion={gewaehlt}
          vorlagen={vorlagen}
          schichtenAb={alleTermine.filter((t) => t.aktion_id === gewaehlt.id && t.datum >= heuteKey()).length}
          schichtenGesamt={alleTermine.filter((t) => t.aktion_id === gewaehlt.id).length}
          onProzent={(p) => void aktionProzent(gewaehlt.id, p).then((f) => f && meldeFehler("Ändern hat nicht geklappt: " + f))}
          onEntfernen={async () => {
            const alle = alleTermine.filter((t) => t.aktion_id === gewaehlt.id).length;
            if (alle === 0) {
              if (await frage(`Die Vorlage „${gewaehlt.titel}" löschen?`, "Löschen", true)) {
                await aktionLoeschen(gewaehlt.id);
                setAktionId("");
              }
              return;
            }
            // Mit Schichten: nicht löschen (sonst verschwinden sie samt
            // Einteilung), sondern aus der Auswahl nehmen.
            if (await frage(`„${gewaehlt.titel}" aus der Auswahl nehmen? Die ${alle} vorhandenen Schichten bleiben stehen.`, "Entfernen", true)) {
              await aktionAendern(gewaehlt.id, { geschlossen: true });
              setAktionId("");
            }
          }}
        />
      )}

      {!aktionId && (
        <>
          <Gruppe titel={offeneAktionen.length > 0 ? "Neue Aktion" : "Worum geht es?"} className={offeneAktionen.length > 0 ? "mt-4" : "mt-0"}>
            <ZeileEingabe label="Name" placeholder="z. B. Kuchenverkauf" maxLength={60} value={neuTitel} onChange={setNeuTitel} />
            <div className="px-4 py-3">
              <div className="mb-2 text-[13px] text-tinte-leise">Zeichen</div>
              <div className="flex flex-wrap gap-1.5">
                {ICONS.map((i) => (
                  <button
                    key={i}
                    onClick={() => setNeuIcon(i)}
                    className={`h-11 w-11 rounded-xl text-[22px] transition active:scale-95 ${
                      neuIcon === i ? "bg-brand/15 ring-2 ring-brand" : "bg-[rgb(118_118_128/0.12)] dark:bg-[rgb(118_118_128/0.24)]"
                    }`}
                    aria-label={`Zeichen ${i}`}
                    aria-pressed={neuIcon === i}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
          </Gruppe>
          <Gruppe
            titel="Wie viel zählt eine Schicht?"
            fuss="Die Werte kommen aus dem Reiter Beiträge. So passen Aktion und eingetragene Mithilfe immer zusammen."
          >
            <ProzentWahl vorlagen={vorlagen} wert={Number(neuProzent) || 0} setzen={(p) => setNeuProzent(String(p))} />
          </Gruppe>
        </>
      )}

      {/* ------------------------------------------------ Wann */}
      <div className="seg mb-0 mt-5" role="tablist" aria-label="Einmalig oder regelmäßig">
        <button role="tab" aria-selected={!wiederholt} onClick={() => setWiederholt(false)} className={`seg-item whitespace-nowrap !py-2 !text-[14px] ${!wiederholt ? "seg-aktiv" : ""}`}>
          Einmalig
        </button>
        <button role="tab" aria-selected={wiederholt} onClick={() => setWiederholt(true)} className={`seg-item whitespace-nowrap !py-2 !text-[14px] ${wiederholt ? "seg-aktiv" : ""}`}>
          Regelmäßig
        </button>
      </div>

      <Gruppe
        titel="Wann"
        className="mt-3"
        fuss={wiederholt ? "Jede Schicht steht einzeln im Kalender – fällt eine Pause aus, löschst du nur diese." : undefined}
      >
        <Zeile label={wiederholt ? "Ab" : "Am"}>
          <input
            type="date"
            aria-label={wiederholt ? "Erster Tag" : "Datum"}
            className="min-w-0 bg-transparent text-right text-[16px] outline-none"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
          />
        </Zeile>
        {wiederholt && (
          <Zeile label="Bis">
            <input
              type="date"
              aria-label="Letzter Tag"
              min={datum}
              className="min-w-0 bg-transparent text-right text-[16px] outline-none"
              value={bis}
              onChange={(e) => setBis(e.target.value)}
            />
          </Zeile>
        )}
        {wiederholt && (
          <div className="px-4 py-3">
            <div className="mb-2 text-[13px] text-tinte-leise">An diesen Wochentagen</div>
            <div className="grid grid-cols-7 gap-1.5">
              {WOCHENTAG_WAHL.map((w) => {
                const an = tage.has(w.nr);
                return (
                  <button
                    key={w.nr}
                    onClick={() =>
                      setTage((prev) => {
                        const n = new Set(prev);
                        if (an) n.delete(w.nr);
                        else n.add(w.nr);
                        return n;
                      })
                    }
                    aria-label={w.lang}
                    aria-pressed={an}
                    className={`h-11 rounded-xl text-[14px] font-semibold transition active:scale-95 ${
                      an ? "bg-brand text-white" : "bg-[rgb(118_118_128/0.12)] text-tinte-matt dark:bg-[rgb(118_118_128/0.24)] dark:text-slate-300"
                    }`}
                  >
                    {w.kurz}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Gruppe>

      <Gruppe
        titel="Uhrzeit"
        fuss={ganztaegig ? undefined : "24-Stunden-Zeit, z. B. 0910 tippen. Mehrere Zeiten ergeben pro Tag mehrere Schichten."}
      >
        <ZeileMitSchalter label="Ganztägig">
          <Schalter an={ganztaegig} onChange={setGanztaegig} label="Ganztägig" />
        </ZeileMitSchalter>
        {!ganztaegig && (
          <>
            <div className="flex flex-wrap gap-1.5 px-4 py-3" role="group" aria-label="Pausen">
              {PAUSEN.map((p) => {
                const an = fenster.some((f) => f.von === p.von && f.ende === p.bis);
                return (
                  <button
                    key={p.name}
                    onClick={() => pauseUmschalten(p.von, p.bis)}
                    aria-pressed={an}
                    className={`min-h-[44px] rounded-full px-3.5 text-[14px] font-semibold transition active:scale-95 ${
                      an ? "bg-brand text-white" : "bg-[rgb(118_118_128/0.12)] text-brand-dark dark:bg-[rgb(118_118_128/0.24)] dark:text-brand"
                    }`}
                  >
                    {p.name} <span className="zahl font-normal opacity-90">{p.von}</span>
                  </button>
                );
              })}
            </div>
            {fenster.map((f, i) => (
              <div key={f.id} className="flex min-h-[56px] items-center gap-2 py-2 pl-4 pr-1">
                <span className="w-[4.5rem] shrink-0 text-[15px]">{fenster.length > 1 ? `Schicht ${i + 1}` : "Von – bis"}</span>
                <ZeitFeld wert={f.von} onChange={(v) => einFenster(f.id, { von: v })} label={`Beginn Schicht ${i + 1}`} />
                <span aria-hidden className="text-tinte-leise">–</span>
                <ZeitFeld wert={f.ende} onChange={(v) => einFenster(f.id, { ende: v })} label={`Ende Schicht ${i + 1}`} />
                <span className="flex-1" />
                {fenster.length > 1 && (
                  <button
                    onClick={() => setFenster((prev) => prev.filter((x) => x.id !== f.id))}
                    className="flex h-11 w-11 shrink-0 items-center justify-center text-[16px] text-tinte-leise active:opacity-50"
                    aria-label={`Schicht ${i + 1} entfernen`}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <Zeile
              blau
              label="Weitere Schicht am selben Tag"
              onClick={() => {
                // Nächste noch nicht gewählte Pause vorschlagen, sonst eine Stunde nach dem letzten Ende
                const frei = PAUSEN.find((p) => !fenster.some((f) => f.von === p.von && f.ende === p.bis));
                setFenster((prev) => [...prev, frei ? neuesFenster(frei.von, frei.bis) : neuesFenster("14:00", "14:45")]);
              }}
            />
          </>
        )}
      </Gruppe>

      <Gruppe titel="Ort und Plätze">
        <ZeileEingabe label="Ort" placeholder="z. B. Pausenhalle" maxLength={60} value={ort} onChange={setOrt} />
        <Zeile label="Plätze je Schicht">
          <span className="flex items-center gap-1">
            <button
              onClick={() => setPlaetze((p) => Math.max(1, p - 1))}
              disabled={plaetze <= 1}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgb(118_118_128/0.12)] text-[20px] font-medium text-brand-dark transition active:scale-90 disabled:opacity-40 dark:bg-[rgb(118_118_128/0.24)] dark:text-brand"
              aria-label="Einen Platz weniger"
            >
              −
            </button>
            <span className="zahl w-8 text-center text-[17px] font-bold" aria-live="polite">{plaetze}</span>
            <button
              onClick={() => setPlaetze((p) => Math.min(50, p + 1))}
              disabled={plaetze >= 50}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgb(118_118_128/0.12)] text-[20px] font-medium text-brand-dark transition active:scale-90 disabled:opacity-40 dark:bg-[rgb(118_118_128/0.24)] dark:text-brand"
              aria-label="Einen Platz mehr"
            >
              +
            </button>
          </span>
        </Zeile>
      </Gruppe>

      <Gruppe className="mt-4">
        <ZeileMitSchalter label={`Zeit, Ort und Plätze für „${gewaehlt?.titel || neuTitel.trim() || "diese Aktion"}“ merken`}>
          <Schalter an={alsVorlage} onChange={setAlsVorlage} label="Zeit, Ort und Plätze merken" />
        </ZeileMitSchalter>
      </Gruppe>

      {/* ------------------------------------------------ Vorschau */}
      <p className="mt-4 px-4 text-[14px] leading-relaxed text-tinte-matt dark:text-slate-300">
        {anzahl === 0 ? (
          "Noch kein Tag getroffen."
        ) : (
          <>
            Das ergibt <b>{anzahl}</b> {anzahl === 1 ? "Schicht" : "Schichten"} mit je <b>{Math.max(1, plaetze || 1)}</b> Plätzen,{" "}
            {ganztaegig ? "ganztägig" : fensterListe.map((f) => `${f.von}–${f.bis}`).join(" und ")}:
            <br />
            <span className="text-tinte-leise">
              {termine.slice(0, 3).map((t) => tagLang(t)).join(" · ")}
              {termine.length > 3 ? ` … bis ${tagLang(termine[termine.length - 1])}` : ""}
            </span>
          </>
        )}
      </p>

      {fehler && <p className="mt-2 px-4 text-[14px] font-semibold text-amber-700 dark:text-amber-300">{fehler}</p>}

      <FussLeiste>
        <button disabled={busy || anzahl === 0} onClick={speichern} className="btn-primary">
          {busy ? "…" : `${anzahl || ""} ${anzahl === 1 ? "Schicht" : "Schichten"} ausschreiben`}
        </button>
      </FussLeiste>
    </Sheet>
  );
}

export type { Aktion };

export type Vorlage = { id: string; titel: string; punkte: number };

/** Prozent aus den Beitrags-Vorlagen wählen – keine freie Zahl mehr. */
export function ProzentWahl({ vorlagen, wert, setzen }: { vorlagen: Vorlage[]; wert: number; setzen: (p: number) => void }) {
  if (!vorlagen.length) {
    return <p className="px-4 py-3 text-[13px] text-tinte-leise">Im Beiträge-Reiter sind noch keine Möglichkeiten angelegt.</p>;
  }
  const passt = vorlagen.some((v) => v.punkte === wert);
  return (
    <>
      {vorlagen.map((v) => (
        <ZeileHaken
          key={v.id}
          gewaehlt={v.punkte === wert}
          onClick={() => setzen(v.punkte)}
          label={v.titel}
          rechts={<span className="zahl shrink-0 text-[15px] font-semibold text-brand-dark dark:text-brand">+{v.punkte} %</span>}
        />
      ))}
      {!passt && (
        <p className="px-4 py-2.5 text-[13px] font-semibold text-amber-700 dark:text-amber-300">
          Zählt gerade +{wert} % – das steht so nicht im Beiträge-Reiter. Bitte eine Zeile wählen.
        </p>
      )}
    </>
  );
}

/** Gewählte Aktion: Prozent angleichen oder aus der Liste nehmen. */
function AktionVerwalten({
  aktion, vorlagen, schichtenAb, schichtenGesamt, onProzent, onEntfernen,
}: {
  aktion: Aktion;
  vorlagen: Vorlage[];
  schichtenAb: number;
  schichtenGesamt: number;
  onProzent: (p: number) => void;
  onEntfernen: () => void;
}) {
  const [offen, setOffen] = useState(false);
  const passt = vorlagen.some((v) => v.punkte === aktion.prozent);
  return (
    <>
      <Gruppe
        className="mt-4"
        fuss={!passt && !offen ? "Passt nicht zum Reiter Beiträge – unter „Anpassen“ angleichen." : undefined}
      >
        <Zeile
          label={schichtenAb > 0 ? `${schichtenAb} kommende Schicht${schichtenAb === 1 ? "" : "en"}` : "Keine kommenden Schichten"}
          unter={
            <>
              zählt <span className={`font-bold ${passt ? "text-brand-dark dark:text-brand" : "text-amber-700 dark:text-amber-300"}`}>+{aktion.prozent} %</span>
            </>
          }
          ohnePfeil
          onClick={() => setOffen(!offen)}
        >
          <span className="text-[15px] font-medium text-brand-dark dark:text-brand">{offen ? "Fertig" : "Anpassen"}</span>
        </Zeile>
        {offen && <ProzentWahl vorlagen={vorlagen} wert={aktion.prozent} setzen={onProzent} />}
      </Gruppe>
      {offen && (
        <Gruppe className="mt-4">
          <Zeile rot onClick={onEntfernen} label={schichtenGesamt === 0 ? "Vorlage löschen …" : "Aus der Auswahl nehmen …"} />
        </Gruppe>
      )}
    </>
  );
}
