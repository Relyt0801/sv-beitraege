import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { Schalter } from "./Schalter";
import { Icon } from "./Icon";
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
      <button type="button" aria-label="Weniger" disabled={wert <= min} onClick={() => onChange(wert - 1)} className="flex h-8 w-10 items-center justify-center text-[18px] font-semibold disabled:opacity-30">
        −
      </button>
      <span className="zahl w-7 border-x border-black/10 text-center text-[15px] font-semibold dark:border-white/15">{wert}</span>
      <button type="button" aria-label="Mehr" disabled={wert >= max} onClick={() => onChange(wert + 1)} className="flex h-8 w-10 items-center justify-center text-[18px] font-semibold disabled:opacity-30">
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

/** Farben für den Sieger der Herzen – bewusst anders als die eigentliche Wahl */
const HERZ = {
  rahmen: "border-[#FF2D55]/30",
  flaeche: "bg-[#FF2D55]/[0.05] dark:bg-[#FF2D55]/[0.10]",
  text: "text-[#D70040] dark:text-[#FF6482]",
  voll: "bg-[#FF2D55]",
  ring: "ring-[#FF2D55]",
  chip: "bg-[#FF2D55]/12 text-[#D70040] dark:text-[#FF6482]",
};

/** „Ergebnisse sehen: Nur Komitee | Alle“ – für jede Abstimmung gleich */
export function SichtbarkeitWahl({ alle, onChange, className = "" }: { alle: boolean; onChange: (alle: boolean) => void; className?: string }) {
  return (
    <div className={`flex min-h-[44px] items-center gap-3 ${className}`}>
      <span className="min-w-0 flex-1 whitespace-nowrap text-[15px]">Ergebnisse sehen</span>
      <div className="seg w-[178px] shrink-0" role="radiogroup" aria-label="Ergebnisse sehen">
        <button type="button" role="radio" aria-checked={!alle} className={`seg-item !px-1.5 !text-[12.5px] whitespace-nowrap ${!alle ? "seg-aktiv" : ""}`} onClick={() => onChange(false)}>
          Nur Komitee
        </button>
        <button type="button" role="radio" aria-checked={alle} className={`seg-item !px-1.5 !text-[12.5px] whitespace-nowrap ${alle ? "seg-aktiv" : ""}`} onClick={() => onChange(true)}>
          Alle
        </button>
      </div>
    </div>
  );
}

/** Kopf eines Wahl-Abschnitts: Titel links, Stimmen-Chip rechts */
function AbschnittKopf({ titel, chip, unter, herz = false }: { titel: string; chip: string; unter?: string; herz?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {herz && (
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ${HERZ.voll}`}>
          <Icon name="herz" size={13} strich={2.4} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={`block text-[16px] font-semibold leading-snug ${herz ? HERZ.text : ""}`}>{titel}</span>
        {unter && <span className={`block text-[12px] font-semibold uppercase tracking-[0.04em] opacity-80 ${herz ? HERZ.text : "text-tinte-leise"}`}>{unter}</span>}
      </span>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${herz ? HERZ.chip : "bg-brand/10 text-brand-dark dark:text-brand"}`}>{chip}</span>
    </div>
  );
}

/**
 * Die offene Runde eines Bereichs bzw. einer Gruppe – oder, für wer leitet,
 * der Knopf, eine zu starten. Steht oben in der Liste des Bereichs.
 *
 * mitHerz: beim Starten lassen sich Honorable Mentions für den „Sieger der
 * Herzen“ auswählen (Motto, Zitate). wahlTitel benennt die eigentliche Wahl.
 */
export function RundenAbschnitt({
  stand,
  gruppe = "",
  gruppeTitel = "",
  quellen,
  leitet,
  gesperrt,
  startText = "Engere Auswahl starten",
  wahlTitel = "Wahl",
  mitHerz = false,
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
          leitet={leitet}
          gesperrt={gesperrt}
          wahlTitel={wahlTitel}
          onWeiter={() => {
            // Nächste Runde aus dieser: nach Stimmen sortiert vorauswählen (nur die Wahl)
            const ks = stand
              .kandidatenVon(offen.id)
              .filter((k) => !k.hm)
              .map((k) => ({ id: k.ziel_id, label: k.label, unter: k.unter, punkte: stand.zahl(offen.id, k.ziel_id) ?? 0 }));
            setStarten(ks);
          }}
        />
      ) : (
        <>
          {letzte && (leitet || letzte.ergebnis_sichtbar) && <ErgebnisKurz stand={stand} runde={letzte} wahlTitel={wahlTitel} />}
          {leitet && quellen.length >= 2 && (
            <button onClick={() => setStarten(quellen)} className="feld-grau mb-3 flex w-full items-center gap-3 px-4 py-3 text-left transition active:scale-[.99]">
              <span className="symbol bg-brand">
                <Icon name="stimme" size={17} strich={2.3} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{startText}</span>
                <span className="block text-[12.5px] leading-snug text-tinte-leise">
                  {letzte ? `Runde ${letzte.nr + 1}` : "Runde 2"}: die Besten auswählen, Stimmen je Person festlegen
                </span>
              </span>
              <Icon name="chevron" size={16} />
            </button>
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
        onClose={() => setStarten(null)}
      />
    </>
  );
}

function RundenKarte({
  stand,
  runde,
  leitet,
  gesperrt,
  wahlTitel,
  onWeiter,
}: {
  stand: RundenStand;
  runde: Runde;
  leitet: boolean;
  gesperrt: boolean;
  wahlTitel: string;
  onWeiter: () => void;
}) {
  const alle = stand.kandidatenVon(runde.id);
  const wahl = alle.filter((k) => !k.hm);
  const herz = alle.filter((k) => k.hm);
  const herzLaeuft = !!runde.hm_aktiv && herz.length >= 2;
  const meine = stand.meineIn(runde.id);
  const uebrig = Math.max(0, runde.stimmen - meine.length);
  const zahlenDa = leitet || runde.ergebnis_sichtbar;
  const sortiere = (ks: typeof alle) =>
    zahlenDa && leitet ? [...ks].sort((a, b) => (stand.zahl(runde.id, b.ziel_id) ?? 0) - (stand.zahl(runde.id, a.ziel_id) ?? 0)) : ks;

  const tippen = async (ziel: string) => {
    if (gesperrt) return meldeFehler(GESPERRT_TEXT);
    const f = await stand.stimme(runde, ziel);
    if (f) meldeFehler(f);
  };

  return (
    <section className="mb-4 space-y-2.5">
      <div className="overflow-hidden rounded-2xl border border-brand/25 bg-brand/[0.04] dark:bg-brand/[0.08]">
        <div className="px-4 pb-2 pt-3.5">
          <RundenMarke runde={runde} />
          {runde.gruppe_titel && <div className="mt-1.5 text-[16px] font-semibold leading-snug">{runde.gruppe_titel}</div>}
          <div className="mt-2.5">
            <AbschnittKopf titel={wahlTitel} chip={`${runde.stimmen} ${runde.stimmen === 1 ? "Stimme" : "Stimmen"}`} />
          </div>
          <div className="mt-1 text-[13px] leading-snug text-tinte-matt dark:text-slate-300">
            {gesperrt
              ? GESPERRT_TEXT
              : uebrig === 0
                ? `Du hast ${runde.stimmen === 1 ? "deine Stimme" : `alle ${runde.stimmen} Stimmen`} vergeben. Antippen nimmt eine zurück.`
                : `Du hast noch ${uebrig} von ${runde.stimmen} ${runde.stimmen === 1 ? "Stimme" : "Stimmen"}.`}
          </div>
        </div>
        <KandidatenListe stand={stand} runde={runde} ks={sortiere(wahl)} zahlenDa={zahlenDa} onTippen={tippen} />
      </div>

      {herzLaeuft && (
        <div className={`overflow-hidden rounded-2xl border ${HERZ.rahmen} ${HERZ.flaeche}`}>
          <div className="px-4 pb-2 pt-3.5">
            <AbschnittKopf titel="Sieger der Herzen" unter="Honorable Mentions" chip="1 Stimme" herz />
          </div>
          <KandidatenListe stand={stand} runde={runde} ks={sortiere(herz)} zahlenDa={zahlenDa} onTippen={tippen} herz />
        </div>
      )}

      {leitet && <RundeSteuern stand={stand} runde={runde} hatHerz={herz.length >= 2} onWeiter={onWeiter} />}
    </section>
  );
}

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
    <ul className="space-y-1.5 px-2.5 pb-2.5">
      {ks.map((k) => {
        const an = stand.hatGewaehlt(runde.id, k.ziel_id);
        const n = stand.zahl(runde.id, k.ziel_id);
        return (
          <li key={k.ziel_id}>
            <button
              aria-pressed={an}
              onClick={() => onTippen(k.ziel_id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition active:scale-[.99] ${
                an ? `bg-white shadow-card ring-2 dark:bg-slate-900 ${herz ? HERZ.ring : "ring-brand"}` : "bg-white/70 dark:bg-slate-900/60"
              }`}
            >
              <span
                aria-hidden
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${
                  an ? (herz ? "border-[#FF2D55] bg-[#FF2D55] text-white" : "border-brand bg-brand text-white") : "border-black/20 dark:border-white/25"
                }`}
              >
                {an && <Icon name={herz ? "herz" : "haken"} size={herz ? 12 : 14} strich={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-snug">{k.label}</span>
                {k.unter && <span className="block text-[12.5px] leading-snug text-tinte-leise">{k.unter}</span>}
                {zahlenDa && n !== undefined && (
                  <span className="mt-1 flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[0.07] dark:bg-white/10">
                      <span className={`block h-full rounded-full ${herz ? HERZ.voll : "bg-brand"}`} style={{ width: `${Math.round((n / hoechste) * 100)}%` }} />
                    </span>
                    <span className="zahl w-8 text-right text-[12.5px] font-semibold text-tinte-matt">{n}</span>
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

function RundeSteuern({ stand, runde, hatHerz, onWeiter }: { stand: RundenStand; runde: Runde; hatHerz: boolean; onWeiter: () => void }) {
  const t = stand.teilnehmer(runde.id);
  const th = stand.teilnehmerHerz(runde.id);
  return (
    <div className="feld-grau px-4 py-2">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-tinte-leise">
        Steuerung · {t} {t === 1 ? "Person hat" : "Personen haben"} gewählt
        {hatHerz && runde.hm_aktiv ? ` · ${th} ${th === 1 ? "Herzstimme" : "Herzstimmen"}` : ""}
      </div>
      <div className="flex min-h-[44px] items-center gap-3">
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
      <SichtbarkeitWahl
        alle={runde.ergebnis_sichtbar}
        onChange={async (v) => {
          const f = await stand.aendern(runde.id, { ergebnis: v });
          if (f) meldeFehler("Ging nicht: " + f);
        }}
      />
      {hatHerz && (
        <div className="flex min-h-[44px] items-center gap-3">
          <span className="min-w-0 flex-1 text-[15px]">Sieger der Herzen</span>
          <Schalter
            an={!!runde.hm_aktiv}
            label="Sieger der Herzen"
            onChange={async (v) => {
              const f = await stand.aendern(runde.id, { hm: v });
              if (f) meldeFehler("Ging nicht: " + f);
            }}
          />
        </div>
      )}
      <div className="flex gap-2 py-2">
        <button className="btn-klein-grau flex-1" onClick={onWeiter}>
          Nächste Runde …
        </button>
        <button
          className="btn-klein-grau flex-1 !text-red-600 dark:!text-red-400"
          onClick={() =>
            void frage(`Runde ${runde.nr} beenden? Danach kann niemand mehr abstimmen.`, "Beenden", true).then(async (ok) => {
              if (!ok) return;
              const f = await stand.aendern(runde.id, { offen: false });
              if (f) meldeFehler("Ging nicht: " + f);
              else melde("Runde beendet", "erfolg");
            })
          }
        >
          Beenden
        </button>
      </div>
    </div>
  );
}

function ErgebnisKurz({ stand, runde, wahlTitel }: { stand: RundenStand; runde: Runde; wahlTitel: string }) {
  const alle = stand
    .kandidatenVon(runde.id)
    .map((k) => ({ ...k, n: stand.zahl(runde.id, k.ziel_id) ?? 0 }))
    .sort((a, b) => b.n - a.n);
  const wahl = alle.filter((k) => !k.hm);
  const herz = alle.filter((k) => k.hm);
  if (!wahl.length) return null;
  const Liste = ({ ks }: { ks: typeof alle }) => (
    <ol className="space-y-1">
      {ks.map((k, i) => (
        <li key={k.ziel_id} className="flex items-baseline gap-2 text-[14px]">
          <span className="zahl w-5 text-tinte-leise">{i + 1}.</span>
          <span className="min-w-0 flex-1">{k.label}</span>
          <span className="zahl font-semibold">{k.n}</span>
        </li>
      ))}
    </ol>
  );
  return (
    <details className="feld-grau group mb-3 overflow-hidden">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
        <Icon name="pokal" size={17} />
        <span className="min-w-0 flex-1 text-[14px]">
          <span className="font-semibold">Runde {runde.nr} beendet</span>
          <span className="text-tinte-leise"> · vorn: {wahl[0].label}</span>
        </span>
        <span className="text-tinte-leise transition group-open:rotate-90" aria-hidden>
          ›
        </span>
      </summary>
      <div className="space-y-3 px-4 pb-3">
        <div>
          <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-tinte-leise">{wahlTitel}</div>
          <Liste ks={wahl} />
        </div>
        {herz.length >= 2 && (
          <div className={`rounded-xl border px-3 py-2 ${HERZ.rahmen} ${HERZ.flaeche}`}>
            <div className={`mb-1 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] ${HERZ.text}`}>
              <Icon name="herz" size={12} strich={2.4} /> Sieger der Herzen · Honorable Mentions
            </div>
            <Liste ks={herz} />
          </div>
        )}
      </div>
    </details>
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
  onClose,
}: {
  offen: boolean;
  quellen: (KandidatEingabe & { punkte?: number })[];
  gruppe: string;
  gruppeTitel: string;
  stand: RundenStand;
  mitHerz?: boolean;
  wahlTitel?: string;
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
    setTitel(stand.letzteBeendete(gruppe) || stand.offeneVon(gruppe) ? "Finale" : "Engere Auswahl");
    setStimmen(1);
    setFuerAlle(false);
  }, [offen, sortiert, mitPunkten, stand, gruppe]);

  /** Die nächsten n hinter der Wahl werden Honorable Mentions */
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
        titel="Neue Abstimmungsrunde"
        unter={`${gruppeTitel ? gruppeTitel + " · " : ""}Wähle aus, was weiterkommt. Eine laufende Runde wird dabei beendet.`}
        onClose={onClose}
      />
      <div className="liste mb-3 bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]">
        <label className="zeile">
          <span className="min-w-0 flex-1 text-[15px]">Name der Runde</span>
          <input className="w-36 bg-transparent text-right text-[15px] text-tinte-matt outline-none" maxLength={40} value={titel} onChange={(e) => setTitel(e.target.value)} />
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
              <span className="block text-[15px]">Sieger der Herzen</span>
              <span className={`block text-[12px] font-semibold ${HERZ.text}`}>Honorable Mentions · 1 Stimme</span>
            </span>
            <Schalter
              an={herzAn}
              label="Sieger der Herzen"
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
            <span className="min-w-0 flex-1 text-[15px]">Honorable Mentions</span>
            <Stepper
              wert={herzZahl}
              min={2}
              max={Math.max(2, Math.min(20, sortiert.length - wahl.size))}
              label="Anzahl Honorable Mentions"
              onChange={(n) => {
                setHerzZahl(n);
                herzAuffuellen(n);
              }}
            />
          </div>
        )}
      </div>
      {mitPunkten && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {[3, 5, 10].filter((n) => n < sortiert.length).map((n) => (
            <button key={n} onClick={() => top(n)} className="btn-klein-grau !min-h-[2rem] !px-3 !text-[13px]">
              Top {n}
            </button>
          ))}
          <button
            onClick={() => {
              setWahl(new Set());
              setHerz(new Set());
            }}
            className="btn-klein-grau !min-h-[2rem] !px-3 !text-[13px]"
          >
            Keine
          </button>
        </div>
      )}
      <div className="liste max-h-[45vh] overflow-y-auto bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]">
        {sortiert.map((q, i) => {
          const an = wahl.has(q.id);
          const istHerz = herz.has(q.id);
          return (
            <div key={q.id} className="zeile">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 shrink-0 accent-[rgb(var(--brand))]"
                  checked={an}
                  aria-label={`${q.label}: zur ${wahlTitel}`}
                  onChange={() => umschalten(q.id, "wahl")}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-snug">{q.label}</span>
                  {q.unter && <span className="block truncate text-[12px] text-tinte-leise">{q.unter}</span>}
                </span>
              </label>
              {mitPunkten && (
                <span className="zahl shrink-0 text-[13px] text-tinte-leise">
                  {i < 3 && (q.punkte ?? 0) > 0 ? ["🥇", "🥈", "🥉"][i] + " " : ""}
                  {q.punkte ?? 0}
                </span>
              )}
              {herzAktiv && (
                <button
                  type="button"
                  aria-pressed={istHerz}
                  aria-label={`${q.label}: Honorable Mention`}
                  onClick={() => umschalten(q.id, "herz")}
                  className={`-my-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-90 ${
                    istHerz ? "bg-[#FF2D55] text-white" : "bg-black/[0.05] text-tinte-leise dark:bg-white/10"
                  }`}
                >
                  <Icon name="herz" size={15} strich={2.4} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {herzAktiv && !herzOk && (
        <p className={`mt-2 px-1 text-[13px] font-semibold ${HERZ.text}`}>Mindestens zwei Honorable Mentions mit ♥ auswählen.</p>
      )}
      <button
        className="btn-primary mt-4"
        disabled={wahl.size < 2 || !herzOk || sendet}
        onClick={async () => {
          setSendet(true);
          const f = await stand.starten({
            gruppe,
            gruppeTitel,
            titel: titel.trim() || "Engere Auswahl",
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
    </Sheet>
  );
}
