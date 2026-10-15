import { useEffect, useMemo, useState } from "react";
import { COMMITTEES, committeeIcon } from "../lib/committees";
import { normalize, sortStudents } from "../lib/logic";
import { useStore } from "../store";
import { useTermine } from "../termine-store";
import { useRole } from "../auth/RoleProvider";
import { Sheet, SheetKopf } from "./Sheet";
import { Gruppe, Zeile, ZeileHaken, ZeileMitSchalter } from "./Liste";
import { Schalter } from "./Schalter";
import { Icon } from "./Icon";
import { FussLeiste } from "./FussLeiste";
import { ZeitFeld } from "./ZeitFeld";
import {
  FARBEN, STUNDEN, SYMBOLE, WOCHENTAG_WAHL, heuteKey, istKuerzel, plusTage, tagLang, uhr, wiederholungsTage, zeitText,
  type NeuerTermin, type Sichtbarkeit, type Termin,
} from "../lib/termine";
import { committeeLabel } from "../lib/committees";
import { umfangText } from "../lib/termine";

import { frage } from "../lib/melder";
import { terminAlsDatei, useKalenderDemo } from "../lib/kalender-sync";

/**
 * Termin anlegen oder ändern.
 *
 * Pflicht sind nur Titel und Datum. Alles andere darf leer bleiben – ein
 * "Mottowoche" ohne Uhrzeit und Raum ist ein gültiger Eintrag.
 */
export function TerminSheet({
  offen,
  termin,
  startDatum,
  entwurf,
  onSchliessen,
  onGespeichert,
}: {
  offen: boolean;
  /** gesetzt = bearbeiten, null = neu */
  termin: Termin | null;
  startDatum: string;
  /** Vorausgefüllt – kommt aus einer übernommenen Terminanfrage. */
  entwurf?: NeuerTermin | null;
  onSchliessen: () => void;
  /** Läuft nach dem erfolgreichen Speichern – damit die Anfrage, aus der
   *  dieser Termin entstanden ist, danach als erledigt abgehakt wird. */
  onGespeichert?: () => void;
}) {
  const { anlegen, anlegenViele, aendern, loeschen } = useTermine();
  const { students } = useStore();
  const { can, isStaff } = useRole();
  const darf = isStaff || can("termine.manage");

  const [titel, setTitel] = useState("");
  const [ort, setOrt] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [datum, setDatum] = useState(startDatum || heuteKey());
  const [mehrtaegig, setMehrtaegig] = useState(false);
  const [bisDatum, setBisDatum] = useState("");
  const [ganztaegig, setGanztaegig] = useState(false);
  const [von, setVon] = useState("07:35");
  const [bis, setBis] = useState("16:15");
  const [sichtbar, setSichtbar] = useState<Sichtbarkeit>("alle");
  const [fuerEltern, setFuerEltern] = useState(false);
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [personen, setPersonen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [wiederholt, setWiederholt] = useState(false);
  const [wdhBis, setWdhBis] = useState("");
  const [wochentage, setWochentage] = useState<Set<number>>(new Set());
  const [fehler, setFehler] = useState("");
  const [busy, setBusy] = useState(false);
  // Neuer Termin: standardmäßig Mitteilung. Änderung: standardmäßig still.
  const [melden, setMelden] = useState(true);
  const [farbe, setFarbe] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("");
  const [frei, setFrei] = useState(false);

  // Beim Öffnen befüllen – bearbeiten heißt: alles steht schon drin.
  useEffect(() => {
    if (!offen) return;
    setFehler("");
    if (termin) {
      setTitel(termin.titel);
      setOrt(termin.ort);
      setBeschreibung(termin.beschreibung);
      setDatum(termin.datum);
      setMehrtaegig(Boolean(termin.bis_datum && termin.bis_datum !== termin.datum));
      setBisDatum(termin.bis_datum || "");
      setGanztaegig(!termin.von);
      setVon(uhr(termin.von) || "07:35");
      setBis(uhr(termin.bis) || "16:15");
      setSichtbar(termin.sichtbar);
      setFuerEltern(termin.fuer_eltern);
      setTags(new Set(termin.tags));
      setPersonen(new Set(termin.personen));
      setFarbe(termin.farbe ?? null);
      setSymbol(termin.icon ?? "");
      setFrei(Boolean(termin.frei));
    } else if (entwurf) {
      // Aus einer Anfrage übernommen: alles steht schon drin, das Team
      // muss nur noch prüfen und auf "Eintragen" drücken.
      setTitel(entwurf.titel);
      setOrt(entwurf.ort);
      setBeschreibung(entwurf.beschreibung);
      setDatum(entwurf.datum);
      setMehrtaegig(Boolean(entwurf.bis_datum && entwurf.bis_datum !== entwurf.datum));
      setBisDatum(entwurf.bis_datum || "");
      setGanztaegig(!entwurf.von);
      setVon(entwurf.von || "07:35");
      setBis(entwurf.bis || "16:15");
      setSichtbar(entwurf.sichtbar);
      setFuerEltern(entwurf.fuer_eltern);
      setTags(new Set(entwurf.tags));
      setPersonen(new Set(entwurf.personen));
      setFarbe(entwurf.farbe ?? null);
      setSymbol(entwurf.icon ?? "");
      setFrei(Boolean(entwurf.frei));
    } else {
      setTitel("");
      setOrt("");
      setBeschreibung("");
      setDatum(startDatum || heuteKey());
      setMehrtaegig(false);
      setBisDatum("");
      setGanztaegig(false);
      setVon("07:35");
      setBis("16:15");
      setSichtbar("alle");
      setFuerEltern(false);
      setTags(new Set());
      setPersonen(new Set());
      setFarbe(null);
      setSymbol("");
      setFrei(false);
    }
    setMelden(!termin);
    setWiederholt(false);
    setWdhBis("");
    setWochentage(new Set());
    setQ("");
  }, [offen, termin, startDatum, entwurf]);

  /** Die Tage, an denen der Termin tatsächlich entsteht. Nur bei
   *  "wiederholt sich" – sonst ist es genau der eine gewählte Tag. */
  const wdhTage = useMemo(
    () => (wiederholt ? wiederholungsTage(datum, wdhBis, [...wochentage]) : []),
    [wiederholt, datum, wdhBis, wochentage],
  );

  const liste = useMemo(() => {
    const n = normalize(q);
    return sortStudents(students).filter(
      (s) => !n || normalize(`${s.nachname} ${s.vorname}`).includes(n),
    );
  }, [students, q]);

  if (!darf) return null;

  async function speichern() {
    if (!titel.trim()) return setFehler("Gib dem Termin eine Bezeichnung.");
    if (!datum) return setFehler("Wähle ein Datum.");
    if (mehrtaegig && bisDatum && bisDatum < datum) return setFehler("Das Ende liegt vor dem Anfang.");
    if (wiederholt) {
      if (wochentage.size === 0) return setFehler("Wähle mindestens einen Wochentag.");
      if (!wdhBis) return setFehler("Bis wann soll sich der Termin wiederholen?");
      if (wdhTage.length === 0) return setFehler("In diesem Zeitraum liegt keiner der gewählten Wochentage.");
    }
    if (!ganztaegig && von && bis && bis <= von && !mehrtaegig)
      return setFehler("Die Endzeit liegt vor der Anfangszeit.");
    if (sichtbar === "komitee" && tags.size === 0) return setFehler("Wähle mindestens ein Komitee.");
    if (sichtbar === "personen" && personen.size === 0) return setFehler("Wähle mindestens eine Person.");

    const daten: NeuerTermin = {
      titel,
      beschreibung,
      ort,
      datum,
      bis_datum: mehrtaegig && bisDatum ? bisDatum : null,
      von: ganztaegig ? null : von || null,
      bis: ganztaegig ? null : bis || null,
      sichtbar,
      fuer_eltern: fuerEltern,
      tags: sichtbar === "komitee" ? [...tags] : [],
      personen: sichtbar === "personen" ? [...personen] : [],
      icon: symbol.trim() || null,
      farbe,
      frei,
      // Beim Ändern einer Schicht die Verbindung zur Aktion behalten –
      // vorher wurde sie hier stillschweigend gelöscht.
      aktion_id: termin?.aktion_id ?? entwurf?.aktion_id ?? null,
      plaetze: termin?.plaetze ?? entwurf?.plaetze ?? null,
    };

    setBusy(true);
    // Wiederholung heißt: echte Einzeltermine, sofort ausgerechnet. Fällt
    // eine Woche aus, löscht man diesen einen Tag – der Rest bleibt stehen.
    const f = termin
      ? await aendern(termin.id, daten, { melden })
      : wiederholt
        ? await anlegenViele(wdhTage.map((tag) => ({ ...daten, datum: tag, bis_datum: null })), { melden })
        : await anlegen(daten, { melden });
    setBusy(false);
    if (f) setFehler("Speichern hat nicht geklappt: " + f);
    else {
      onGespeichert?.();
      onSchliessen();
    }
  }


  /** Eine Auswahl ein-/ausschalten (Komitees, Personen, Wochentage) */
  function umschalten<T>(setter: (f: (prev: Set<T>) => Set<T>) => void, id: T) {
    setter((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  /** Datumsfeld rechts in einer Zeile – 16 px, damit iOS beim Antippen nicht zoomt */
  const datumFeld = "min-w-0 bg-transparent text-right text-[16px] outline-none";
  /** Textfeld rechts in einer Zeile */
  const textFeld = "min-w-0 flex-1 bg-transparent text-right text-[16px] outline-none placeholder:text-tinte-leise";
  /** runder Wahlknopf (Farbe, Zeichen, Wochentag) */
  const chip = (an: boolean) =>
    `rounded-xl text-[14px] font-semibold transition active:scale-95 ${
      an ? "bg-brand text-white" : "bg-[rgb(118_118_128/0.12)] text-tinte-matt dark:bg-[rgb(118_118_128/0.24)] dark:text-slate-300"
    }`;

  return (
    <Sheet open={offen} onClose={onSchliessen}>
      <SheetKopf titel={termin ? "Termin ändern" : "Neuer Termin"} onClose={onSchliessen} />

      {/* ------------------------------------------------ Was */}
      <Gruppe className="mt-0">
        <Zeile label="Bezeichnung">
          <input
            className={textFeld}
            placeholder="z. B. Komiteesitzung"
            aria-label="Bezeichnung"
            value={titel}
            onChange={(e) => setTitel(e.target.value)}
            autoFocus
          />
        </Zeile>
        <Zeile label="Ort">
          <input
            className={textFeld}
            placeholder="optional, z. B. Raum 204"
            aria-label="Ort (optional)"
            value={ort}
            onChange={(e) => setOrt(e.target.value)}
          />
        </Zeile>
      </Gruppe>

      {/* ------------------------------------------------ Wann */}
      <Gruppe
        titel="Wann"
        fuss={
          wiederholt
            ? wdhTage.length === 0
              ? "Wähle Wochentage und einen Zeitraum."
              : `Das ergibt ${wdhTage.length} Termin${wdhTage.length === 1 ? "" : "e"} – vom ${tagLang(wdhTage[0])} bis ${tagLang(wdhTage[wdhTage.length - 1])}. Jeder steht einzeln im Kalender und lässt sich einzeln absagen.`
            : undefined
        }
      >
        <Zeile label={wiederholt ? "Ab" : mehrtaegig ? "Von" : "Am"}>
          <input type="date" aria-label="Datum" className={datumFeld} value={datum} onChange={(e) => setDatum(e.target.value)} />
        </Zeile>
        {mehrtaegig && !wiederholt && (
          <Zeile label="Bis">
            <input type="date" aria-label="Letzter Tag" min={datum} className={datumFeld} value={bisDatum} onChange={(e) => setBisDatum(e.target.value)} />
          </Zeile>
        )}
        <ZeileMitSchalter label="Ganztägig">
          <Schalter an={ganztaegig} onChange={setGanztaegig} label="Ganztägig" />
        </ZeileMitSchalter>
        {!wiederholt && (
          <ZeileMitSchalter label="Über mehrere Tage">
            <Schalter an={mehrtaegig} onChange={setMehrtaegig} label="Über mehrere Tage" />
          </ZeileMitSchalter>
        )}
        {/* Beim Ändern nicht anbieten: sonst würde aus einem Termin
            plötzlich eine ganze Reihe und der alte bliebe stehen. */}
        {!termin && (
          <ZeileMitSchalter label="Wiederholt sich">
            <Schalter
              an={wiederholt}
              onChange={(v) => {
                setWiederholt(v);
                if (v) {
                  setMehrtaegig(false);
                  if (!wdhBis) setWdhBis(plusTage(datum || heuteKey(), 42));
                }
              }}
              label="Wiederholt sich"
            />
          </ZeileMitSchalter>
        )}
        {wiederholt && (
          <>
            <Zeile label="Bis">
              <input type="date" aria-label="Letzter Tag der Reihe" min={datum} className={datumFeld} value={wdhBis} onChange={(e) => setWdhBis(e.target.value)} />
            </Zeile>
            <div className="px-4 py-3">
              <div className="mb-2 text-[13px] text-tinte-leise">An diesen Wochentagen</div>
              <div className="grid grid-cols-7 gap-1.5">
                {WOCHENTAG_WAHL.map((w) => (
                  <button
                    key={w.nr}
                    onClick={() => umschalten(setWochentage, w.nr)}
                    aria-label={w.lang}
                    aria-pressed={wochentage.has(w.nr)}
                    className={`h-11 ${chip(wochentage.has(w.nr))}`}
                  >
                    {w.kurz}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {!ganztaegig && (
          <Zeile label="Uhrzeit">
            <ZeitFeld wert={von} onChange={setVon} label="Beginn" />
            <span aria-hidden className="text-tinte-leise">–</span>
            <ZeitFeld wert={bis} onChange={setBis} label="Ende" />
          </Zeile>
        )}
        {!ganztaegig && (
          <StundenWahl
            von={von}
            bis={bis}
            setzen={(v, b) => {
              setVon(v);
              setBis(b);
            }}
          />
        )}
      </Gruppe>

      {/* ------------------------------------------------ Aussehen */}
      <Gruppe
        titel="Aussehen im Kalender"
        fuss="Ein Fach-Kürzel steht als kleines Schild im Kalender – gut für Klausuren. „Ferien“ färbt die Tage durchgehend ein, auch über mehrere Wochen."
      >
        <div className="px-4 py-3">
          <div className="mb-2 text-[13px] text-tinte-leise">Farbe</div>
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Farbe">
            <button
              role="radio"
              aria-checked={farbe === null}
              onClick={() => setFarbe(null)}
              className={`min-h-[40px] rounded-full px-3.5 text-[14px] font-semibold ${
                farbe === null ? "bg-brand text-white" : "bg-[rgb(118_118_128/0.12)] text-tinte-matt dark:bg-[rgb(118_118_128/0.24)] dark:text-slate-300"
              }`}
            >
              Standard
            </button>
            {FARBEN.map((f) => (
              <button
                key={f.key}
                role="radio"
                aria-checked={farbe === f.key}
                aria-label={f.name}
                title={f.name}
                onClick={() => setFarbe(f.key)}
                className={`h-10 w-10 rounded-full ${f.punkt} transition active:scale-90 ${
                  farbe === f.key ? "ring-2 ring-brand ring-offset-2 ring-offset-[rgb(var(--zelle))]" : ""
                }`}
              />
            ))}
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="mb-2 text-[13px] text-tinte-leise">Zeichen</div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setSymbol("")} aria-pressed={!symbol} className={`min-h-[40px] px-3.5 ${chip(!symbol)}`}>
              Keins
            </button>
            {SYMBOLE.map((z) => (
              <button
                key={z}
                onClick={() => setSymbol(z)}
                aria-label={`Zeichen ${z}`}
                aria-pressed={symbol === z}
                className={`h-10 w-10 rounded-xl text-[20px] leading-none transition active:scale-95 ${
                  symbol === z ? "bg-brand/15 ring-2 ring-brand" : "bg-[rgb(118_118_128/0.12)] dark:bg-[rgb(118_118_128/0.24)]"
                }`}
              >
                {z}
              </button>
            ))}
          </div>
        </div>
        <Zeile label="Oder Kürzel">
          <input
            className={`${textFeld} font-bold uppercase`}
            placeholder="z. B. M, EK, F7"
            aria-label="Fach-Kürzel"
            maxLength={4}
            value={istKuerzel(symbol) ? symbol : ""}
            onChange={(e) => setSymbol(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 4))}
          />
        </Zeile>
        <ZeileMitSchalter label="Ferien / unterrichtsfrei">
          <Schalter
            an={frei}
            onChange={(v) => {
              setFrei(v);
              if (v) {
                setGanztaegig(true);
                if (!farbe) setFarbe("gruen");
              }
            }}
            label="Ferien / unterrichtsfrei"
          />
        </ZeileMitSchalter>
      </Gruppe>

      {/* ------------------------------------------------ Wer */}
      <div className="mb-1.5 mt-4 px-4 text-[13px] uppercase tracking-[0.02em] text-tinte-leise">Wer sieht den Termin?</div>
      <div className="seg" role="tablist" aria-label="Wer sieht den Termin?">
        {(
          [
            ["alle", "Alle"],
            ["komitee", "Komitees"],
            ["personen", "Personen"],
          ] as [Sichtbarkeit, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={sichtbar === k}
            onClick={() => setSichtbar(k)}
            className={`seg-item whitespace-nowrap !py-2 !text-[14px] ${sichtbar === k ? "seg-aktiv" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 px-4 text-[13px] leading-snug text-tinte-leise">
        {sichtbar === "alle"
          ? "Jeder in der Stufe sieht diesen Termin."
          : "Wer nicht dazugehört, sieht den Termin gar nicht – auch keine Lücke im Kalender."}
      </p>

      {sichtbar === "komitee" && (
        <Gruppe className="mt-3">
          {COMMITTEES.map((c) => (
            <ZeileHaken
              key={c.slug}
              label={
                <>
                  <span aria-hidden className="mr-2">{committeeIcon(c.slug)}</span>
                  {c.label}
                </>
              }
              gewaehlt={tags.has(c.slug)}
              onClick={() => umschalten(setTags, c.slug)}
            />
          ))}
        </Gruppe>
      )}

      {sichtbar === "personen" && (
        <div className="mt-3">
          <input className="field mb-2" placeholder="Person suchen…" aria-label="Person suchen" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-64 overflow-y-auto overscroll-contain rounded-[0.875rem]">
            <Gruppe className="" fuss={personen.size === 0 ? "Noch niemand gewählt" : `${personen.size} ausgewählt`}>
              {liste.map((s) => (
                <ZeileHaken
                  key={s.id}
                  label={`${s.nachname}, ${s.vorname}`}
                  gewaehlt={personen.has(s.id)}
                  onClick={() => umschalten(setPersonen, s.id)}
                />
              ))}
            </Gruppe>
          </div>
        </div>
      )}

      <Gruppe fuss="Standardmäßig aus. Sinnvoll z. B. beim Abiball oder der Zeugnisvergabe.">
        <ZeileMitSchalter label="Eltern sehen diesen Termin auch">
          <Schalter an={fuerEltern} onChange={setFuerEltern} label="Eltern sehen diesen Termin auch" />
        </ZeileMitSchalter>
      </Gruppe>

      <div className="mt-4">
        <textarea
          className="field min-h-[4.5rem]"
          placeholder="Notiz (optional) – was man vorher wissen sollte …"
          aria-label="Notiz (optional)"
          value={beschreibung}
          onChange={(e) => setBeschreibung(e.target.value)}
        />
      </div>

      <Gruppe
        fuss={
          termin
            ? "Aus: Der Termin ändert sich still im Kalender. An, wenn sich Zeit, Datum oder Ort ändern."
            : melden
              ? "Kommt bei allen an, die Mitteilungen erlaubt haben."
              : "Still eintragen: Der Termin steht nur im Kalender, niemand bekommt ein Pop-up."
        }
      >
        <ZeileMitSchalter label={termin ? "Änderung als Mitteilung schicken" : "Mitteilung an alle, die ihn sehen"}>
          <Schalter an={melden} onChange={setMelden} label="Mitteilung schicken" />
        </ZeileMitSchalter>
      </Gruppe>

      {fehler && <p className="mt-3 px-4 text-[14px] font-semibold text-amber-700 dark:text-amber-300">{fehler}</p>}

      {/* Löschen weit weg vom Hauptknopf, rot, mit Rückfrage */}
      {termin && (
        <Gruppe className="mt-8">
          <Zeile
            rot
            label="Termin löschen …"
            onClick={async () => {
              if (await frage(`Den Termin „${termin.titel}" wirklich löschen?`, "Löschen", true)) {
                void loeschen(termin.id);
                onSchliessen();
              }
            }}
          />
        </Gruppe>
      )}

      <FussLeiste>
        <button disabled={busy} onClick={speichern} className="btn-primary">
          {busy
            ? "…"
            : termin
              ? "Speichern"
              : wiederholt && wdhTage.length > 0
                ? `${wdhTage.length} Termine eintragen`
                : "Eintragen"}
        </button>
      </FussLeiste>
    </Sheet>
  );
}

/** Schnellwahl nach Schulstunden: erste Wahl = Beginn, zweite = Ende. */
function StundenWahl({ von, bis, setzen }: { von: string; bis: string; setzen: (von: string, bis: string) => void }) {
  const ab = STUNDEN.find((s) => s.von === von)?.nr ?? null;
  const bisNr = STUNDEN.find((s) => s.bis === bis)?.nr ?? null;
  const [warteAufEnde, setWarteAufEnde] = useState(false);
  return (
    <div className="px-4 py-3">
      <div className="mb-2 text-[13px] text-tinte-leise">
        {warteAufEnde ? "Bis zu welcher Stunde?" : "Nach Schulstunden (tippen: Beginn, dann Ende)"}
      </div>
      <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
        {STUNDEN.map((s) => {
          const drin = ab !== null && bisNr !== null && s.nr >= ab && s.nr <= bisNr;
          return (
            <button
              key={s.nr}
              title={`${s.nr}. Stunde: ${s.von}–${s.bis}`}
              aria-pressed={drin}
              onClick={() => {
                if (warteAufEnde && ab !== null && s.nr >= ab) {
                  setzen(STUNDEN[ab - 1].von, s.bis);
                  setWarteAufEnde(false);
                } else {
                  setzen(s.von, s.bis);
                  setWarteAufEnde(true);
                }
              }}
              className={`min-h-[44px] rounded-xl py-1.5 text-center leading-tight transition active:scale-95 ${
                drin ? "bg-brand text-white" : "bg-[rgb(118_118_128/0.12)] text-tinte-matt dark:bg-[rgb(118_118_128/0.24)] dark:text-slate-300"
              }`}
            >
              <span className="block text-[14px] font-extrabold">{s.nr}.</span>
              <span className={`zahl block text-[12px] ${drin ? "text-white" : "text-tinte-leise"}`}>{s.von}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Ein Termin zum Ansehen – für alle, die ihn nicht ändern dürfen. */
export function TerminAnsehen({
  termin, onSchliessen, onBearbeiten,
}: { termin: Termin | null; onSchliessen: () => void; onBearbeiten?: () => void }) {
  const { termine, loeschen, loeschenViele, zuteilen } = useTermine();
  const { students } = useStore();
  const { isStaff, can } = useRole();
  const darf = isStaff || can("termine.manage");
  // „In meinen Kalender“ (.ics) – zurzeit aus: KALENDER_SYNC_AN in lib/kalender-sync.ts
  const kalenderDemo = useKalenderDemo();
  // Immer den frischen Stand zeigen (z. B. nach dem Austragen einer Person)
  const t = termin ? termine.find((x) => x.id === termin.id) ?? termin : null;

  /** Die "Reihe": gleicher Titel, gleiche Uhrzeit, gleiche Aktion, ab heute. */
  const reihe = useMemo(() => {
    if (!t) return [] as Termin[];
    const heute = heuteKey();
    return termine.filter(
      (x) =>
        x.titel === t.titel && x.von === t.von && x.bis === t.bis &&
        (x.aktion_id || null) === (t.aktion_id || null) && x.datum >= heute,
    );
  }, [termine, t]);

  if (!t) return null;
  const termin_ = t;
  const namen = new Map(students.map((s) => [s.id, `${s.vorname} ${s.nachname}`]));
  /** Wert rechts in einer Zeile – darf umbrechen, nichts wird abgeschnitten */
  const wert = (text: string) => <span className="min-w-0 text-right text-[15px] leading-snug text-tinte-matt dark:text-slate-300">{text}</span>;
  return (
    <Sheet open onClose={onSchliessen}>
      <SheetKopf titel={termin_.titel} unter={umfangText(termin_, committeeLabel) || undefined} onClose={onSchliessen} />

      <Gruppe className="mt-0">
        <Zeile label="Wann">
          {wert(`${tagLang(termin_.datum)}${termin_.bis_datum && termin_.bis_datum !== termin_.datum ? ` bis ${tagLang(termin_.bis_datum)}` : ""}`)}
        </Zeile>
        <Zeile label="Uhrzeit">{wert(zeitText(termin_))}</Zeile>
        {termin_.ort && <Zeile label="Ort">{wert(termin_.ort)}</Zeile>}
      </Gruppe>

      {termin_.beschreibung && (
        <Gruppe titel="Notiz">
          <p className="whitespace-pre-wrap px-4 py-3 text-[15px] leading-relaxed text-tinte-matt dark:text-slate-300">{termin_.beschreibung}</p>
        </Gruppe>
      )}

      {termin_.personen.length > 0 && (termin_.aktion_id || darf) && (
        <Gruppe titel={termin_.aktion_id ? "Eingeteilt" : "Für diese Personen"}>
          {termin_.personen.map((sid) => (
            <div key={sid} className="flex min-h-[48px] items-center gap-2 py-1.5 pl-4 pr-2">
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{namen.get(sid) || "Unbekannt"}</span>
              {darf && termin_.aktion_id && (
                <button
                  onClick={async () => {
                    if (await frage(`${namen.get(sid) || "Diese Person"} aus der Schicht nehmen? Sie bekommt Bescheid.`, "Austragen", true))
                      void zuteilen(termin_.id, sid, false);
                  }}
                  className="btn-klein-grau shrink-0"
                  aria-label={`${namen.get(sid) || "Person"} austragen`}
                >
                  Austragen
                </button>
              )}
            </div>
          ))}
        </Gruppe>
      )}

      {/* Testphase: einzelnen Termin in den eigenen Kalender übernehmen */}
      {kalenderDemo && (
        <button onClick={() => terminAlsDatei(termin_)} className="btn-grau mt-4 gap-2 !text-[15px]">
          <Icon name="kalender" size={18} /> In meinen Kalender übernehmen
        </button>
      )}

      {/* Löschen: ganz unten, rot, jeweils mit Rückfrage – nicht neben „Fertig“ */}
      {darf && (
        <Gruppe className="mt-8">
          <Zeile
            rot
            label="Nur diesen Termin löschen …"
            onClick={async () => {
              if (await frage(`„${termin_.titel}" am ${tagLang(termin_.datum)} löschen?`, "Löschen", true)) {
                void loeschen(termin_.id);
                onSchliessen();
              }
            }}
          />
          {reihe.length > 1 && (
            <Zeile
              rot
              label={`Alle ${reihe.length} kommenden „${termin_.titel}" löschen …`}
              onClick={async () => {
                if (await frage(`Alle ${reihe.length} kommenden Termine „${termin_.titel}" löschen?`, "Alle löschen", true)) {
                  void loeschenViele(reihe.map((x) => x.id));
                  onSchliessen();
                }
              }}
            />
          )}
        </Gruppe>
      )}

      <FussLeiste>
        <div className="flex gap-2">
          {onBearbeiten && (
            <button onClick={onBearbeiten} className="btn-grau min-w-0 flex-1">
              Ändern
            </button>
          )}
          <button onClick={onSchliessen} className="btn-primary min-w-0 flex-1">
            Fertig
          </button>
        </div>
      </FussLeiste>
    </Sheet>
  );
}
