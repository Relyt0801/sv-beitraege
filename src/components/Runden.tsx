import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { Schalter } from "./Schalter";
import { Icon } from "./Icon";
import { FussLeiste } from "./Kachel";
import { frage, melde, meldeFehler } from "../lib/melder";
import { GESPERRT_TEXT } from "./Gesperrt";
import type { Kandidat, KandidatEingabe, Runde, RundenStand } from "../lib/runden";

/**
 * Abstimmungsrunden – eine Karte für alle Bereiche (Motto, Zitate, Rankings,
 * Umfragen). Wer abstimmt, sieht die engere Auswahl und seine übrigen
 * Stimmen; wer die Runden leitet, sieht die Zahlen, stellt die Stimmen je
 * Person ein, gibt das Ergebnis frei und beendet die Runde.
 */

/** Plus/Minus wie der „Stepper“ in iOS */
export function Stepper({ wert, min = 1, max = 20, onChange, label }: { wert: number; min?: number; max?: number; onChange: (n: number) => void; label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center overflow-hidden rounded-[9px] bg-[rgb(118_118_128/0.12)] dark:bg-[rgb(118_118_128/0.24)]" role="group" aria-label={label}>
      <button type="button" aria-label="Weniger" disabled={wert <= min} onClick={() => onChange(wert - 1)} className="relative flex h-8 w-10 items-center justify-center text-[18px] font-semibold after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[''] disabled:opacity-30">
        −
      </button>
      <span className="zahl w-7 border-x border-black/10 text-center text-[15px] font-semibold dark:border-white/15">{wert}</span>
      <button type="button" aria-label="Mehr" disabled={wert >= max} onClick={() => onChange(wert + 1)} className="relative flex h-8 w-10 items-center justify-center text-[18px] font-semibold after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[''] disabled:opacity-30">
        +
      </button>
    </span>
  );
}

/** Kleine Marke „Runde 2 · Engere Auswahl“ */
export function RundenMarke({ runde, className = "", hell = false }: { runde: Runde; className?: string; /** auf farbigem Grund */ hell?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ${
        hell ? "bg-white/20 text-white" : "bg-brand/10 text-brand-dark dark:text-brand"
      } ${className}`}
    >
      <Icon name="stimme" size={13} strich={2.4} />
      Runde {runde.nr}
      {runde.titel && runde.titel !== `Runde ${runde.nr}` ? ` · ${runde.titel}` : ""}
    </span>
  );
}

/** Farben für den Gewinner der Herzen – bewusst anders als die eigentliche Wahl */
const HERZ = {
  rahmen: "border-[#FF2D55]/30",
  flaeche: "bg-[#FF2D55]/[0.05] dark:bg-[#FF2D55]/[0.10]",
  text: "text-[#D70040] dark:text-[#FF6482]",
  voll: "bg-[#FF2D55]",
  ring: "ring-[#FF2D55]",
  chip: "bg-[#FF2D55]/12 text-[#D70040] dark:text-[#FF6482]",
};

/** „Ergebnisse sehen: Nur Komitee | Alle“ – für jede Abstimmung gleich */
export function SichtbarkeitWahl({
  alle,
  onChange,
  className = "",
  titel = "Ergebnisse sehen",
}: {
  alle: boolean;
  onChange: (alle: boolean) => void;
  className?: string;
  titel?: string;
}) {
  return (
    // Beschriftung links darf umbrechen, der Umschalter hat seine natürliche
    // Breite; reicht der Platz nicht, rutscht er unter die Beschriftung
    // (vorher: feste Breite von 178 px, die die Beschriftung überdeckte). Die Punkte
    // bleiben bei ihrer Textbreite (flex-none), sonst wird die weiße Fläche schmaler als „Nur Komitee“.
    <div className={`flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-1.5 py-1.5 ${className}`}>
      <span className="min-w-[8.5rem] flex-1 text-[15px] leading-snug">{titel}</span>
      <div className="seg shrink-0" role="radiogroup" aria-label={titel}>
        <button type="button" role="radio" aria-checked={!alle} className={`seg-item !flex-none whitespace-nowrap !px-3 !text-[13px] ${!alle ? "seg-aktiv" : ""}`} onClick={() => onChange(false)}>
          Nur Komitee
        </button>
        <button type="button" role="radio" aria-checked={alle} className={`seg-item !flex-none whitespace-nowrap !px-4 !text-[13px] ${alle ? "seg-aktiv" : ""}`} onClick={() => onChange(true)}>
          Alle
        </button>
      </div>
    </div>
  );
}

/** Kopf eines Wahl-Abschnitts: Titel links, Stimmen-Chip rechts */
function AbschnittKopf({ titel, chip, unter, herz = false }: { titel: string; chip: string; unter?: string; herz?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      {herz && (
        <span className={`symbol ${HERZ.voll}`}>
          <Icon name="herz" size={15} strich={2.4} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={`block text-[17px] font-semibold leading-snug tracking-[-0.01em] ${herz ? HERZ.text : ""}`}>{titel}</span>
        {unter && <span className={`block text-[12px] font-semibold uppercase tracking-[0.04em] opacity-80 ${herz ? HERZ.text : "text-tinte-leise"}`}>{unter}</span>}
      </span>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${herz ? HERZ.chip : "bg-brand/10 text-brand-dark dark:text-brand"}`}>{chip}</span>
    </div>
  );
}

/** Punkte für die eigenen Stimmen: gefüllt = vergeben (wie die Seiten-Punkte in iOS) */
function StimmPunkte({ vergeben, gesamt, hell = false }: { vergeben: number; gesamt: number; hell?: boolean }) {
  if (gesamt > 12) return null;
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {Array.from({ length: gesamt }, (_, i) => (
        <span
          key={i}
          className={`h-2 w-2 rounded-full transition-colors duration-300 ${
            i < vergeben ? (hell ? "bg-white" : "bg-brand") : hell ? "bg-white/35" : "bg-[rgb(118_118_128/0.24)]"
          }`}
        />
      ))}
    </span>
  );
}

/** Satz zu den eigenen Stimmen einer Runde – überall gleich formuliert */
export function stimmenSatz(stand: RundenStand, runde: Runde, gesperrt = false): string {
  if (gesperrt) return GESPERRT_TEXT;
  const uebrig = Math.max(0, runde.stimmen - stand.meineIn(runde.id).length);
  if (uebrig === 0) return `Du hast ${runde.stimmen === 1 ? "deine Stimme" : `alle ${runde.stimmen} Stimmen`} vergeben.`;
  return `Du hast noch ${uebrig} von ${runde.stimmen} ${runde.stimmen === 1 ? "Stimme" : "Stimmen"}.`;
}

/**
 * Kandidaten für die nächste Runde aus einer laufenden: nach Stimmen
 * sortiert, nur die eigentliche Wahl (Herzens-Kandidaten bleiben draußen).
 */
export function naechsteRundeQuellen(stand: RundenStand, runde: Runde): (KandidatEingabe & { punkte?: number })[] {
  return stand
    .kandidatenVon(runde.id)
    .filter((k) => !k.hm)
    .map((k) => ({ id: k.ziel_id, label: k.label, unter: k.unter, punkte: stand.zahl(runde.id, k.ziel_id) ?? 0 }));
}

/** Runde beenden – mit Rückfrage, überall gleich */
function rundeBeenden(stand: RundenStand, runde: Runde) {
  void frage(`Runde ${runde.nr} beenden? Danach kann niemand mehr abstimmen.`, "Beenden", true).then(async (ok) => {
    if (!ok) return;
    const f = await stand.aendern(runde.id, { offen: false });
    if (f) meldeFehler("Ging nicht: " + f);
    else melde("Runde beendet", "erfolg");
  });
}

/**
 * Titel der Gruppe einer Runde. „Offiziell“/„Inoffiziell“ steht nur da,
 * solange der Bereich aufgeteilt ist: mitHerz heißt in Motto, Zitate und
 * Rankings genau „ohne Aufteilung“ (nur dann gibt es den Gewinner der Herzen).
 * Ältere Runden tragen den Teil noch im Titel.
 */
function gruppenTitel(t: string, mitHerz: boolean) {
  return mitHerz && (t === "Offiziell" || t === "Inoffiziell") ? "" : t;
}

/** Zur Wahl-Karte einer Runde scrollen (sie trägt die id „runde-<id>“) */
function zurRunde(rundeId: string) {
  const el = document.getElementById(`runde-${rundeId}`);
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Die offene Runde eines Bereichs bzw. einer Gruppe – oder, für wer leitet,
 * der Knopf, eine zu starten. Steht oben in der Liste des Bereichs.
 *
 * mitHerz: beim Starten lassen sich Herzens-Kandidaten für den „Gewinner der
 * Herzen“ auswählen (Motto, Zitate, Rankings). wahlTitel benennt die eigentliche Wahl.
 *
 * nurWahl: Stand, Start-Knopf, Kurz-Ergebnis und Steuerung zeigt schon eine
 * RundenStandKarte oben (bzw. RundenEinstellungen im Zahnrad-Blatt) – hier
 * steht dann nur noch die Liste zum Abstimmen.
 */
export function RundenAbschnitt({
  stand,
  gruppe = "",
  gruppeTitel = "",
  quellen,
  leitet,
  gesperrt,
  startText = "Runde starten",
  wahlTitel = "Wahl",
  mitHerz = false,
  nurWahl = false,
  standardName,
}: {
  stand: RundenStand;
  gruppe?: string;
  gruppeTitel?: string;
  /** Alles, was zur Wahl stehen kann – mit bisheriger Punktzahl zum Vorsortieren */
  quellen: (KandidatEingabe & { punkte?: number })[];
  leitet: boolean;
  gesperrt: boolean;
  startText?: string;
  wahlTitel?: string;
  mitHerz?: boolean;
  /** nur die Wahl-Liste (Stand und Steuerung stehen woanders) */
  nurWahl?: boolean;
  /** Name der ersten Runde, z. B. „Stichwahl“ (Standard „Engere Auswahl“) */
  standardName?: string;
}) {
  const [starten, setStarten] = useState<null | (KandidatEingabe & { punkte?: number })[]>(null);
  const offen = stand.offeneVon(gruppe);
  const letzte = stand.letzteBeendete(gruppe);

  return (
    <>
      {offen ? (
        <RundenKarte
          stand={stand}
          runde={offen}
          leitet={leitet && !nurWahl}
          kompakt={nurWahl}
          zahlenSehen={leitet}
          gesperrt={gesperrt}
          wahlTitel={wahlTitel}
          mitHerz={mitHerz}
          onWeiter={() => setStarten(naechsteRundeQuellen(stand, offen))}
        />
      ) : nurWahl ? null : (
        <>
          {letzte && (leitet || letzte.ergebnis_sichtbar) && <ErgebnisKurz stand={stand} runde={letzte} wahlTitel={wahlTitel} mitHerz={mitHerz} />}
          {leitet && quellen.length >= 2 && (
            <StartZeile titel={startText} unter={`${letzte ? `Runde ${letzte.nr + 1}` : "Runde 2"}: die Besten auswählen, Stimmen je Person festlegen`} onClick={() => setStarten(quellen)} />
          )}
        </>
      )}
      <RundeStartenSheet
        offen={starten !== null}
        quellen={starten || []}
        gruppe={gruppe}
        gruppeTitel={gruppeTitel}
        stand={stand}
        mitHerz={mitHerz}
        wahlTitel={wahlTitel}
        standardName={standardName}
        onClose={() => setStarten(null)}
      />
    </>
  );
}

/** Weiße Zelle mit blauem Symbol: „Runde starten“ */
function StartZeile({ titel, unter, onClick }: { titel: string; unter: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="feld-grau mb-3 flex w-full items-center gap-3 px-4 py-3 text-left transition active:scale-[.99]">
      <span className="symbol bg-brand">
        <Icon name="stimme" size={17} strich={2.3} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{titel}</span>
        <span className="block text-[12.5px] leading-snug text-tinte-leise">{unter}</span>
      </span>
      <Icon name="chevron" size={16} />
    </button>
  );
}

function RundenKarte({
  stand,
  runde,
  leitet,
  zahlenSehen,
  gesperrt,
  wahlTitel,
  mitHerz,
  onWeiter,
  kompakt = false,
}: {
  stand: RundenStand;
  runde: Runde;
  /** ohne Runden-Marke und Gruppen-Titel (stehen schon in der Stand-Karte) */
  kompakt?: boolean;
  /** Gewinner der Herzen gibt es nur ohne Aufteilung (siehe gruppenTitel) */
  mitHerz: boolean;
  /** Steuerung unter der Karte zeigen */
  leitet: boolean;
  /** Zahlen sehen, auch wenn nicht freigegeben (wer leitet) */
  zahlenSehen: boolean;
  gesperrt: boolean;
  wahlTitel: string;
  onWeiter: () => void;
}) {
  const alle = stand.kandidatenVon(runde.id);
  const wahl = alle.filter((k) => !k.hm);
  const herz = alle.filter((k) => k.hm);
  const herzDa = mitHerz && herz.length >= 2;
  const herzLaeuft = herzDa && !!runde.hm_aktiv;
  const titel = gruppenTitel(runde.gruppe_titel, mitHerz);
  const meine = stand.meineIn(runde.id);
  const zahlenDa = zahlenSehen || runde.ergebnis_sichtbar;
  const sortiere = (ks: typeof alle) =>
    zahlenDa && zahlenSehen ? [...ks].sort((a, b) => (stand.zahl(runde.id, b.ziel_id) ?? 0) - (stand.zahl(runde.id, a.ziel_id) ?? 0)) : ks;

  const tippen = async (ziel: string) => {
    if (gesperrt) return meldeFehler(GESPERRT_TEXT);
    const f = await stand.stimme(runde, ziel);
    if (f) meldeFehler(f);
  };

  return (
    <section id={`runde-${runde.id}`} className="mb-4 scroll-mt-4 space-y-3">
      <div className="feld-grau overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,.05)]">
        <div className="px-4 pb-2.5 pt-3.5">
          {!kompakt && (
            <>
              <div className="flex items-center gap-2">
                <RundenMarke runde={runde} />
                <span className="ml-auto">
                  <StimmPunkte vergeben={meine.length} gesamt={runde.stimmen} />
                </span>
              </div>
              {titel && <div className="mt-1.5 text-[15px] font-semibold leading-snug text-tinte-matt dark:text-slate-300">{titel}</div>}
            </>
          )}
          <div className={kompakt ? "" : "mt-2"}>
            <AbschnittKopf titel={wahlTitel} chip={`${runde.stimmen} ${runde.stimmen === 1 ? "Stimme" : "Stimmen"}`} />
          </div>
          <div className="mt-1 text-[13px] leading-snug text-tinte-leise">
            {stimmenSatz(stand, runde, gesperrt)}
            {!gesperrt && meine.length > 0 ? " Antippen nimmt eine zurück." : ""}
          </div>
        </div>
        <KandidatenListe stand={stand} runde={runde} ks={sortiere(wahl)} zahlenDa={zahlenDa} onTippen={tippen} />
      </div>

      {herzLaeuft && (
        <div className="feld-grau overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,.05)]">
          <div className="px-4 pb-2.5 pt-3.5">
            <AbschnittKopf titel="Gewinner der Herzen" unter="Herzens-Kandidaten" chip="1 Stimme" herz />
          </div>
          <KandidatenListe stand={stand} runde={runde} ks={sortiere(herz)} zahlenDa={zahlenDa} onTippen={tippen} herz />
        </div>
      )}

      {leitet && <RundeSteuern stand={stand} runde={runde} hatHerz={herzDa} onWeiter={onWeiter} />}
    </section>
  );
}

/** Kandidaten als Liste mit Trennlinien und Haken-Kreis links (wie Auswahllisten in iOS) */
function KandidatenListe({
  stand,
  runde,
  ks,
  zahlenDa,
  onTippen,
  herz = false,
}: {
  stand: RundenStand;
  runde: Runde;
  ks: Kandidat[];
  zahlenDa: boolean;
  onTippen: (ziel: string) => void;
  herz?: boolean;
}) {
  const hoechste = Math.max(1, ...ks.map((k) => stand.zahl(runde.id, k.ziel_id) ?? 0));
  return (
    <ul className="gruppe-zellen !rounded-none border-t border-black/[0.06] dark:border-white/[0.08]">
      {ks.map((k) => {
        const an = stand.hatGewaehlt(runde.id, k.ziel_id);
        const n = stand.zahl(runde.id, k.ziel_id);
        return (
          <li key={k.ziel_id}>
            <button
              aria-pressed={an}
              onClick={() => onTippen(k.ziel_id)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06] ${
                an ? (herz ? "bg-[#FF2D55]/[0.06]" : "bg-brand/[0.06]") : ""
              }`}
            >
              <span
                aria-hidden
                className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full transition duration-200 ease-ios ${
                  an ? (herz ? "scale-100 bg-[#FF2D55] text-white" : "scale-100 bg-brand text-white") : "border-[1.5px] border-black/20 dark:border-white/25"
                }`}
              >
                {an && <Icon name={herz ? "herz" : "haken"} size={herz ? 11 : 13} strich={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[15px] leading-snug [overflow-wrap:anywhere] ${an ? "font-semibold" : ""}`}>{k.label}</span>
                {k.unter && <span className="block text-[12.5px] leading-snug text-tinte-leise">{k.unter}</span>}
                {zahlenDa && n !== undefined && (
                  <span className="mt-1.5 flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgb(118_118_128/0.12)] dark:bg-[rgb(118_118_128/0.24)]">
                      <span className={`block h-full rounded-full transition-[width] duration-500 ease-ios ${herz ? HERZ.voll : "bg-brand"}`} style={{ width: `${Math.round((n / hoechste) * 100)}%` }} />
                    </span>
                    <span className="zahl w-8 text-right text-[12.5px] font-semibold text-tinte-matt dark:text-slate-300">{n}</span>
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Steuerung unter der Wahl – wie eine Gruppe in den iOS-Einstellungen */
function RundeSteuern({ stand, runde, hatHerz, onWeiter }: { stand: RundenStand; runde: Runde; hatHerz: boolean; onWeiter: () => void }) {
  const t = stand.teilnehmer(runde.id);
  const th = stand.teilnehmerHerz(runde.id);
  return (
    <div>
      <h3 className="mb-1.5 px-4 text-[13px] uppercase tracking-[0.02em] text-tinte-leise">
        Steuerung · {t} {t === 1 ? "Person hat" : "Personen haben"} gewählt
        {hatHerz && runde.hm_aktiv ? ` · ${th} ♥` : ""}
      </h3>
      <SteuerZeilen stand={stand} runde={runde} hatHerz={hatHerz} onWeiter={onWeiter} />
    </div>
  );
}

/** Die Zeilen der Steuerung (Stimmen, Sichtbarkeit, Herzen, Weiter, Beenden) */
function SteuerZeilen({ stand, runde, hatHerz, onWeiter }: { stand: RundenStand; runde: Runde; hatHerz: boolean; onWeiter: () => void }) {
  return (
    <div className="gruppe-zellen">
      <div className="flex min-h-[48px] items-center gap-3 px-4 py-2">
        <span className="min-w-0 flex-1 text-[15px]">Stimmen je Person</span>
        <Stepper
          wert={runde.stimmen}
          label="Stimmen je Person"
          onChange={async (n) => {
            const f = await stand.aendern(runde.id, { stimmen: n });
            if (f) meldeFehler("Ging nicht: " + f);
          }}
        />
      </div>
      <div className="px-4 py-1">
        <SichtbarkeitWahl
          alle={runde.ergebnis_sichtbar}
          onChange={async (v) => {
            const f = await stand.aendern(runde.id, { ergebnis: v });
            if (f) meldeFehler("Ging nicht: " + f);
          }}
        />
      </div>
      {hatHerz && (
        <div className="flex min-h-[48px] items-center gap-3 px-4 py-2">
          <span className="min-w-0 flex-1 text-[15px]">Gewinner der Herzen</span>
          <Schalter
            an={!!runde.hm_aktiv}
            label="Gewinner der Herzen"
            onChange={async (v) => {
              const f = await stand.aendern(runde.id, { hm: v });
              if (f) meldeFehler("Ging nicht: " + f);
            }}
          />
        </div>
      )}
      <button type="button" onClick={onWeiter} className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left text-[15px] text-brand transition active:bg-black/[0.04] dark:active:bg-white/[0.06]">
        <span className="flex-1">Nächste Runde starten …</span>
        <span aria-hidden className="text-[17px] leading-none text-tinte-leise">›</span>
      </button>
      <button
        type="button"
        onClick={() => rundeBeenden(stand, runde)}
        className="flex min-h-[48px] w-full items-center px-4 py-2 text-left text-[15px] font-semibold text-red-600 transition active:bg-black/[0.04] dark:text-red-400 dark:active:bg-white/[0.06]"
      >
        Runde {runde.nr} beenden
      </button>
    </div>
  );
}

/** Rangliste einer Runde (Wahl und, falls vorhanden, Gewinner der Herzen) */
function RundenRangliste({ stand, runde, wahlTitel, mitHerz }: { stand: RundenStand; runde: Runde; wahlTitel: string; mitHerz: boolean }) {
  const alle = stand
    .kandidatenVon(runde.id)
    .map((k) => ({ ...k, n: stand.zahl(runde.id, k.ziel_id) ?? 0 }))
    .sort((a, b) => b.n - a.n);
  const wahl = alle.filter((k) => !k.hm);
  const herz = alle.filter((k) => k.hm);
  const Liste = ({ ks, rosa }: { ks: typeof alle; rosa?: boolean }) => (
    <ol className="gruppe-zellen">
      {ks.map((k, i) => (
        <li key={k.ziel_id} className="flex min-h-[44px] items-center gap-3 px-4 py-2 text-[15px]">
          <span
            className={`zahl flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
              i < 3 && !rosa ? "text-[#1C1C1E]" : rosa && i === 0 ? "bg-[#FF2D55] text-white" : "text-tinte-leise"
            }`}
            style={i < 3 && !rosa ? { background: MEDAILLE[i] } : undefined}
          >
            {i + 1}
          </span>
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{k.label}</span>
          <span className="zahl font-semibold">{k.n}</span>
        </li>
      ))}
    </ol>
  );
  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-1.5 px-4 text-[13px] uppercase tracking-[0.02em] text-tinte-leise">{wahlTitel}</h3>
        <Liste ks={wahl} />
      </div>
      {mitHerz && herz.length >= 2 && (
        <div>
          <h3 className={`mb-1.5 flex items-center gap-1.5 px-4 text-[13px] uppercase tracking-[0.02em] ${HERZ.text}`}>
            <Icon name="herz" size={12} strich={2.4} /> Gewinner der Herzen
          </h3>
          <Liste ks={herz} rosa />
        </div>
      )}
    </div>
  );
}

/** Medaillenfarben Gold, Silber, Bronze – wie bei den Rankings */
const MEDAILLE = ["#E9C460", "#C0C4CC", "#D4A373"];

function ErgebnisKurz({ stand, runde, wahlTitel, mitHerz }: { stand: RundenStand; runde: Runde; wahlTitel: string; mitHerz: boolean }) {
  const wahl = stand
    .kandidatenVon(runde.id)
    .filter((k) => !k.hm)
    .map((k) => ({ ...k, n: stand.zahl(runde.id, k.ziel_id) ?? 0 }))
    .sort((a, b) => b.n - a.n);
  if (!wahl.length) return null;
  return (
    <details className="feld-grau group mb-3 overflow-hidden">
      <summary className="flex min-h-[48px] cursor-pointer list-none items-center gap-3 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="symbol bg-[#E9A23B]">
          <Icon name="pokal" size={16} strich={2.2} />
        </span>
        <span className="min-w-0 flex-1 text-[14.5px] leading-snug">
          <span className="font-semibold">Runde {runde.nr} beendet</span>
          <span className="block truncate text-[12.5px] text-tinte-leise">vorn: {wahl[0].label}</span>
        </span>
        <span className="text-[17px] text-tinte-leise transition group-open:rotate-90" aria-hidden>
          ›
        </span>
      </summary>
      <div className="px-0 pb-3">
        <RundenRangliste stand={stand} runde={runde} wahlTitel={wahlTitel} mitHerz={mitHerz} />
      </div>
    </details>
  );
}

/** Blatt mit dem Ergebnis einer Runde (aus der Stand-Karte heraus) */
export function RundenErgebnisBlatt({
  stand,
  runde,
  wahlTitel = "Wahl",
  mitHerz = false,
  onClose,
}: {
  stand: RundenStand;
  runde: Runde | null;
  wahlTitel?: string;
  mitHerz?: boolean;
  onClose: () => void;
}) {
  const t = runde ? stand.teilnehmer(runde.id) : 0;
  const titel = runde ? gruppenTitel(runde.gruppe_titel, mitHerz) : "";
  return (
    <Sheet open={!!runde} onClose={onClose}>
      {runde && (
        <>
          <SheetKopf
            titel={`Ergebnis · Runde ${runde.nr}`}
            unter={`${runde.offen ? "Läuft noch" : "Beendet"}${titel ? ` · ${titel}` : ""} · ${t} ${t === 1 ? "Person hat" : "Personen haben"} gewählt`}
            onClose={onClose}
          />
          <RundenRangliste stand={stand} runde={runde} wahlTitel={wahlTitel} mitHerz={mitHerz} />
        </>
      )}
    </Sheet>
  );
}

/* ====================================================================== */
/* Stand-Karte oben im Bereich                                            */
/* ====================================================================== */

/**
 * Kompakte Karte für ganz oben in einem Bereich: zeigt die laufende Runde
 * (Nummer, Titel, meine Stimmen als Punkte), führt mit einem Tipp zur
 * Wahl-Liste und – sobald man es sehen darf – zum Ergebnis. Wer die Runden
 * leitet, startet hier die (nächste) Runde und beendet sie.
 *
 * Läuft nichts und darf man nichts starten, zeigt sie das letzte Ergebnis
 * (falls freigegeben) – sonst gar nichts.
 *
 * Dazu passt darunter <RundenAbschnitt nurWahl … /> mit der eigentlichen
 * Liste zum Abstimmen (die Karte scrollt mit „Abstimmen“ dorthin).
 */
export function RundenStandKarte({
  stand,
  gruppe = "",
  gruppeTitel = "",
  quellen,
  leitet,
  gesperrt = false,
  startText = "Runde starten",
  wahlTitel = "Wahl",
  mitHerz = false,
  standardName,
  onAbstimmen,
  onErgebnis,
  verlauf = "from-[#0A84FF] to-[#0062CC]",
  schatten = "shadow-[0_12px_28px_-14px_rgba(0,98,204,.8)]",
  className = "",
}: {
  stand: RundenStand;
  gruppe?: string;
  gruppeTitel?: string;
  /** Was in eine neue Runde kommen kann (mit Punkten zum Vorsortieren) */
  quellen: (KandidatEingabe & { punkte?: number })[];
  leitet: boolean;
  gesperrt?: boolean;
  startText?: string;
  wahlTitel?: string;
  mitHerz?: boolean;
  /** Name der ersten Runde, z. B. „Stichwahl“ (Standard „Engere Auswahl“) */
  standardName?: string;
  /** „Abstimmen“: Standard = zur Wahl-Liste (RundenAbschnitt) scrollen */
  onAbstimmen?: (runde: Runde) => void;
  /** „Ergebnis“: Standard = Ergebnis-Blatt dieser Karte */
  onErgebnis?: (runde: Runde) => void;
  /** Farbe der Karte während einer Runde (Verlauf innerhalb EINER Farbe) */
  verlauf?: string;
  schatten?: string;
  className?: string;
}) {
  const [starten, setStarten] = useState<null | (KandidatEingabe & { punkte?: number })[]>(null);
  const [ergebnis, setErgebnis] = useState<Runde | null>(null);
  const offen = stand.offeneVon(gruppe);
  const letzte = stand.letzteBeendete(gruppe);
  const zeigeErgebnis = (r: Runde) => (onErgebnis ? onErgebnis(r) : setErgebnis(r));

  let inhalt: ReactNode = null;
  if (offen) {
    const meine = stand.meineIn(offen.id).length;
    const fertig = meine >= offen.stimmen;
    const t = stand.teilnehmer(offen.id);
    const ergebnisDa = leitet || offen.ergebnis_sichtbar;
    const titel = gruppeTitel || gruppenTitel(offen.gruppe_titel, mitHerz);
    inhalt = (
      <section className={`relative overflow-hidden rounded-[1.4rem] bg-gradient-to-br p-4 text-white ${verlauf} ${schatten}`}>
        <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
        <div className="relative flex items-center gap-2">
          <RundenMarke runde={offen} hell />
          <span className="ml-auto">
            <StimmPunkte vergeben={meine} gesamt={offen.stimmen} hell />
          </span>
        </div>
        <div className="relative mt-2 text-[1.2rem] font-bold leading-tight tracking-[-0.01em]">
          {fertig ? "Deine Stimmen sind drin" : "Abstimmung läuft"}
        </div>
        <div className="relative mt-0.5 text-[13.5px] leading-snug text-white/85">
          {titel ? `${titel} · ` : ""}
          {stimmenSatz(stand, offen, gesperrt)}
        </div>
        <div className="relative mt-3.5 flex flex-wrap items-center gap-2">
          <button
            onClick={() => (onAbstimmen ? onAbstimmen(offen) : zurRunde(offen.id))}
            className="rounded-full bg-white px-4 py-2 text-[14px] font-semibold text-[#0062CC] shadow-sm transition active:scale-95"
          >
            {fertig ? "Stimmen ansehen" : "Jetzt abstimmen"}
          </button>
          {ergebnisDa && (
            <button onClick={() => zeigeErgebnis(offen)} className="rounded-full bg-white/20 px-4 py-2 text-[14px] font-semibold text-white transition active:scale-95">
              Ergebnis
            </button>
          )}
        </div>
        {leitet && (
          <div className="relative mt-3.5 flex flex-wrap items-center gap-2 border-t border-white/20 pt-3">
            <span className="zahl mr-auto text-[12.5px] font-semibold text-white/85">{t} gewählt</span>
            <button onClick={() => setStarten(naechsteRundeQuellen(stand, offen))} className="rounded-full bg-white/20 px-3.5 py-1.5 text-[13px] font-semibold text-white transition active:scale-95">
              Nächste Runde
            </button>
            <button onClick={() => rundeBeenden(stand, offen)} className="rounded-full bg-black/25 px-3.5 py-1.5 text-[13px] font-semibold text-white transition active:scale-95">
              Runde beenden
            </button>
          </div>
        )}
      </section>
    );
  } else {
    const ergebnisSichtbar = !!letzte && (leitet || letzte.ergebnis_sichtbar);
    const vorn = letzte
      ? stand
          .kandidatenVon(letzte.id)
          .filter((k) => !k.hm)
          .map((k) => ({ ...k, n: stand.zahl(letzte.id, k.ziel_id) ?? 0 }))
          .sort((a, b) => b.n - a.n)[0]
      : undefined;
    if (ergebnisSichtbar || (leitet && quellen.length >= 2))
      inhalt = (
        <section className="gruppe-zellen shadow-[0_1px_3px_rgba(0,0,0,.05)]">
          {ergebnisSichtbar && letzte && (
            <button
              type="button"
              onClick={() => zeigeErgebnis(letzte)}
              className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
            >
              <span className="symbol bg-[#E9A23B]">
                <Icon name="pokal" size={16} strich={2.2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">Runde {letzte.nr} beendet</span>
                <span className="block truncate text-[12.5px] text-tinte-leise">{vorn ? `vorn: ${vorn.label}` : "Ergebnis ansehen"}</span>
              </span>
              <span className="text-[13px] font-semibold text-brand">Ergebnis</span>
              <span aria-hidden className="text-[17px] leading-none text-tinte-leise">›</span>
            </button>
          )}
          {leitet && quellen.length >= 2 && (
            <button
              type="button"
              onClick={() => setStarten(quellen)}
              className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
            >
              <span className="symbol bg-brand">
                <Icon name="stimme" size={17} strich={2.3} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{startText}</span>
                <span className="block text-[12.5px] leading-snug text-tinte-leise">
                  {letzte ? `Runde ${letzte.nr + 1}` : "Runde 2"}: die Besten auswählen, Stimmen festlegen
                </span>
              </span>
              <span aria-hidden className="text-[17px] leading-none text-tinte-leise">›</span>
            </button>
          )}
        </section>
      );
  }

  return (
    <>
      {inhalt && <div className={`animate-fadeIn ${className}`}>{inhalt}</div>}
      <RundeStartenSheet
        offen={starten !== null}
        quellen={starten || []}
        gruppe={gruppe}
        gruppeTitel={gruppeTitel}
        stand={stand}
        mitHerz={mitHerz}
        wahlTitel={wahlTitel}
        standardName={standardName}
        onClose={() => setStarten(null)}
      />
      <RundenErgebnisBlatt stand={stand} runde={ergebnis} wahlTitel={wahlTitel} mitHerz={mitHerz} onClose={() => setErgebnis(null)} />
    </>
  );
}

/**
 * Gruppe „Abstimmung“ für das Einstellungs-Blatt (Zahnrad) eines Bereichs:
 * läuft eine Runde → Stimmen je Person, wer das Ergebnis sieht, Gewinner der
 * Herzen, nächste Runde, beenden. Sonst → „Runde starten …“.
 * Nur für wer leitet (sonst nichts).
 */
export function RundenEinstellungen({
  stand,
  gruppe = "",
  gruppeTitel = "",
  quellen,
  leitet,
  titel = "Abstimmung",
  startText = "Runde starten",
  wahlTitel = "Wahl",
  mitHerz = false,
  standardName,
  fuss,
  className = "mt-4",
}: {
  stand: RundenStand;
  gruppe?: string;
  gruppeTitel?: string;
  quellen: (KandidatEingabe & { punkte?: number })[];
  leitet: boolean;
  titel?: string;
  startText?: string;
  wahlTitel?: string;
  mitHerz?: boolean;
  /** Name der ersten Runde, z. B. „Stichwahl“ (Standard „Engere Auswahl“) */
  standardName?: string;
  fuss?: ReactNode;
  className?: string;
}) {
  const [starten, setStarten] = useState<null | (KandidatEingabe & { punkte?: number })[]>(null);
  if (!leitet) return null;
  const offen = stand.offeneVon(gruppe);
  const letzte = stand.letzteBeendete(gruppe);
  const herzDa = mitHerz && offen ? stand.kandidatenVon(offen.id).filter((k) => k.hm).length >= 2 : false;
  const t = offen ? stand.teilnehmer(offen.id) : 0;

  return (
    <section className={className}>
      <h3 className="mb-1.5 px-4 text-[13px] uppercase tracking-[0.02em] text-tinte-leise">{titel}</h3>
      {offen ? (
        <>
          <div className="gruppe-zellen mb-0">
            <div className="flex min-h-[48px] items-center gap-3 px-4 py-2">
              <RundenMarke runde={offen} />
              <span className="zahl ml-auto text-[14px] text-tinte-matt dark:text-slate-300">
                {t} {t === 1 ? "Person" : "Personen"}
              </span>
            </div>
          </div>
          <div className="mt-2">
            <SteuerZeilen stand={stand} runde={offen} hatHerz={herzDa} onWeiter={() => setStarten(naechsteRundeQuellen(stand, offen))} />
          </div>
        </>
      ) : (
        <div className="gruppe-zellen">
          <button
            type="button"
            disabled={quellen.length < 2}
            onClick={() => setStarten(quellen)}
            className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] disabled:opacity-40 dark:active:bg-white/[0.06]"
          >
            <span className="symbol bg-brand">
              <Icon name="stimme" size={16} strich={2.3} />
            </span>
            <span className="min-w-0 flex-1 text-[15px]">{startText} …</span>
            <span className="text-[13px] text-tinte-leise">{letzte ? `Runde ${letzte.nr + 1}` : "Runde 2"}</span>
            <span aria-hidden className="text-[17px] leading-none text-tinte-leise">›</span>
          </button>
        </div>
      )}
      {(fuss || (!offen && quellen.length < 2)) && (
        <p className="mt-1.5 px-4 text-[13px] leading-snug text-tinte-leise">{fuss ?? "Für eine Runde braucht es mindestens zwei Möglichkeiten."}</p>
      )}
      <RundeStartenSheet
        offen={starten !== null}
        quellen={starten || []}
        gruppe={gruppe}
        gruppeTitel={gruppeTitel}
        stand={stand}
        mitHerz={mitHerz}
        wahlTitel={wahlTitel}
        standardName={standardName}
        onClose={() => setStarten(null)}
      />
    </section>
  );
}

export function RundeStartenSheet({
  offen,
  quellen,
  gruppe,
  gruppeTitel,
  stand,
  mitHerz = false,
  wahlTitel = "Wahl",
  standardName,
  onClose,
}: {
  offen: boolean;
  quellen: (KandidatEingabe & { punkte?: number })[];
  gruppe: string;
  gruppeTitel: string;
  stand: RundenStand;
  mitHerz?: boolean;
  wahlTitel?: string;
  /** Name der ersten Runde (Standard „Engere Auswahl“, bei Rankings „Stichwahl“) */
  standardName?: string;
  onClose: () => void;
}) {
  const sortiert = useMemo(() => [...quellen].sort((a, b) => (b.punkte ?? 0) - (a.punkte ?? 0)), [quellen]);
  const mitPunkten = sortiert.some((q) => (q.punkte ?? 0) > 0);
  const [wahl, setWahl] = useState<Set<string>>(new Set());
  const [herz, setHerz] = useState<Set<string>>(new Set());
  const [herzAn, setHerzAn] = useState(false);
  const [herzZahl, setHerzZahl] = useState(3);
  const [titel, setTitel] = useState("Engere Auswahl");
  const [stimmen, setStimmen] = useState(1);
  const [fuerAlle, setFuerAlle] = useState(false);
  const [sendet, setSendet] = useState(false);

  useEffect(() => {
    if (!offen) return;
    // Vorauswahl: die (bis zu fünf) Besten mit Stimmen; ohne Stimmen alles, außer bei langen Listen
    const mitStimmen = sortiert.filter((q) => (q.punkte ?? 0) > 0).slice(0, 5);
    setWahl(new Set((mitStimmen.length >= 2 ? mitStimmen : sortiert.length <= 10 ? sortiert : []).map((q) => q.id)));
    setHerz(new Set());
    setHerzAn(false);
    setHerzZahl(3);
    setTitel(stand.letzteBeendete(gruppe) || stand.offeneVon(gruppe) ? "Finale" : standardName ?? "Engere Auswahl");
    setStimmen(1);
    setFuerAlle(false);
  }, [offen, sortiert, mitPunkten, stand, gruppe, standardName]);

  /** Die nächsten n hinter der Wahl werden Herzens-Kandidaten */
  const herzAuffuellen = (n: number, w: Set<string> = wahl) =>
    setHerz(new Set(sortiert.filter((q) => !w.has(q.id)).slice(0, n).map((q) => q.id)));

  const top = (n: number) => {
    const w = new Set(sortiert.slice(0, n).map((q) => q.id));
    setWahl(w);
    if (herzAn) herzAuffuellen(herzZahl, w);
  };

  const umschalten = (id: string, ziel: "wahl" | "herz") => {
    const [eigen, setEigen, ander, setAnder] = ziel === "wahl" ? [wahl, setWahl, herz, setHerz] as const : [herz, setHerz, wahl, setWahl] as const;
    const n = new Set(eigen);
    if (n.has(id)) n.delete(id);
    else {
      n.add(id);
      if (ander.has(id)) {
        const a = new Set(ander);
        a.delete(id);
        setAnder(a);
      }
    }
    setEigen(n);
  };

  const herzAktiv = mitHerz && herzAn;
  const herzOk = !herzAktiv || herz.size >= 2;

  return (
    <Sheet open={offen} onClose={onClose}>
      <SheetKopf
        titel="Neue Runde"
        unter={`${gruppeTitel ? gruppeTitel + " · " : ""}Wähle aus, was weiterkommt. Eine laufende Runde wird dabei beendet.`}
        onClose={onClose}
      />
      <div className="liste mb-3 zelle">
        <label className="zeile">
          <span className="min-w-0 flex-1 text-[15px]">Name der Runde</span>
          <input className="w-40 min-w-0 bg-transparent text-right text-[15px] font-medium text-tinte outline-none placeholder:text-tinte-leise" maxLength={40} placeholder="z. B. Finale" value={titel} onChange={(e) => setTitel(e.target.value)} />
        </label>
        <div className="zeile">
          <span className="min-w-0 flex-1 text-[15px]">Stimmen je Person</span>
          <Stepper wert={stimmen} max={Math.max(1, Math.min(20, wahl.size - 1))} label="Stimmen je Person" onChange={setStimmen} />
        </div>
        <div className="zeile">
          <SichtbarkeitWahl alle={fuerAlle} onChange={setFuerAlle} className="w-full" />
        </div>
        {mitHerz && (
          <div className="zeile">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px]">Gewinner der Herzen</span>
              <span className={`block text-[12.5px] font-semibold ${HERZ.text}`}>Herzens-Kandidaten · 1 Stimme</span>
            </span>
            <Schalter
              an={herzAn}
              label="Gewinner der Herzen"
              onChange={(v) => {
                setHerzAn(v);
                const n = Math.max(2, Math.min(herzZahl, sortiert.length - wahl.size));
                setHerzZahl(n);
                if (v && herz.size === 0) herzAuffuellen(n);
                if (!v) setHerz(new Set());
              }}
            />
          </div>
        )}
        {herzAktiv && (
          <div className="zeile">
            <span className="min-w-0 flex-1 text-[15px]">Herzens-Kandidaten</span>
            <Stepper
              wert={herzZahl}
              min={2}
              max={Math.max(2, Math.min(20, sortiert.length - wahl.size))}
              label="Anzahl Herzens-Kandidaten"
              onChange={(n) => {
                setHerzZahl(n);
                herzAuffuellen(n);
              }}
            />
          </div>
        )}
      </div>
      {mitPunkten && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 px-1 text-[13px] text-tinte-leise">Auswahl:</span>
          {[3, 5, 10].filter((n) => n < sortiert.length).map((n) => (
            <button key={n} onClick={() => top(n)} className="btn-klein-grau !px-3 !text-[13px]">
              Top {n}
            </button>
          ))}
          <button
            onClick={() => {
              setWahl(new Set());
              setHerz(new Set());
            }}
            className="btn-klein-grau !px-3 !text-[13px]"
          >
            Keine
          </button>
        </div>
      )}
      <div className="liste max-h-[45vh] overflow-y-auto zelle">
        {sortiert.map((q, i) => {
          const an = wahl.has(q.id);
          const istHerz = herz.has(q.id);
          return (
            <div key={q.id} className="zeile">
              <button
                type="button"
                role="checkbox"
                aria-checked={an}
                aria-label={`${q.label}: zur ${wahlTitel}`}
                onClick={() => umschalten(q.id, "wahl")}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                {/* Haken-Kreis wie in iOS-Auswahllisten statt Kästchen */}
                <span
                  aria-hidden
                  className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full transition duration-200 ease-ios ${
                    an ? "bg-brand text-white" : "border-[1.5px] border-black/20 dark:border-white/25"
                  }`}
                >
                  {an && <Icon name="haken" size={13} strich={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-snug">{q.label}</span>
                  {q.unter && <span className="block truncate text-[12px] text-tinte-leise">{q.unter}</span>}
                </span>
              </button>
              {mitPunkten && (
                <span className="zahl flex shrink-0 items-center gap-1.5 text-[13px] text-tinte-leise">
                  {i < 3 && (q.punkte ?? 0) > 0 && <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: MEDAILLE[i] }} />}
                  {q.punkte ?? 0}
                </span>
              )}
              {herzAktiv && (
                <button
                  type="button"
                  aria-pressed={istHerz}
                  aria-label={`${q.label}: Herzens-Kandidat`}
                  onClick={() => umschalten(q.id, "herz")}
                  className={`-my-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-90 ${
                    istHerz ? "bg-[#FF2D55] text-white" : "bg-[rgb(118_118_128/0.12)] text-tinte-leise dark:bg-[rgb(118_118_128/0.24)]"
                  }`}
                >
                  <Icon name="herz" size={15} strich={2.4} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {/* Was sind Herzens-Kandidaten? – ein Satz, solange der Schalter an ist */}
      {herzAktiv && (
        <p className="mt-2 px-1 text-[13px] leading-snug text-tinte-leise">
          Herzens-Kandidaten sind Vorschläge, die es nicht in die Runde schaffen, aber trotzdem gefallen. Tippe bei mindestens zwei Vorschlägen auf das{" "}
          <span className={HERZ.text}>♥</span> – darüber wird zusätzlich abgestimmt (eine Stimme je Person).
        </p>
      )}
      {herzAktiv && !herzOk && (
        <p className={`mt-2 px-1 text-[13px] font-semibold ${HERZ.text}`}>Mindestens zwei Herzens-Kandidaten mit ♥ auswählen.</p>
      )}
      {/* Fußknopf bleibt am unteren Rand des Blatts sichtbar, auch bei langer Liste */}
      <FussLeiste>
      <button
        className="btn-primary"
        disabled={wahl.size < 2 || !herzOk || sendet}
        onClick={async () => {
          setSendet(true);
          const f = await stand.starten({
            gruppe,
            gruppeTitel,
            titel: titel.trim() || (standardName ?? "Engere Auswahl"),
            stimmen: Math.min(stimmen, Math.max(1, wahl.size - 1)),
            ergebnis: fuerAlle,
            kandidaten: [
              ...sortiert.filter((q) => wahl.has(q.id)),
              ...(herzAktiv ? sortiert.filter((q) => herz.has(q.id)).map((q) => ({ ...q, hm: true })) : []),
            ],
          });
          setSendet(false);
          if (f) return meldeFehler(f);
          melde("Runde gestartet", "erfolg");
          onClose();
        }}
      >
        {sendet ? "Wird gestartet …" : `Runde mit ${wahl.size} starten${herzAktiv && herz.size ? ` · ${herz.size} ♥` : ""}`}
      </button>
        {wahl.size < 2 && <p className="mt-1.5 text-center text-[12.5px] text-tinte-leise">Wähle mindestens zwei Möglichkeiten aus.</p>}
      </FussLeiste>
    </Sheet>
  );
}
