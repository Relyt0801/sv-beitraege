import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { Schalter } from "./Schalter";
import { Icon } from "./Icon";
import { frage, melde, meldeFehler } from "../lib/melder";
import { GESPERRT_TEXT } from "./Gesperrt";
import type { KandidatEingabe, Runde, RundenStand } from "../lib/runden";

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
export function RundenMarke({ runde, className = "" }: { runde: Runde; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-[12px] font-semibold text-brand-dark dark:text-brand ${className}`}>
      <Icon name="stimme" size={13} strich={2.4} />
      Runde {runde.nr}
      {runde.titel && runde.titel !== `Runde ${runde.nr}` ? ` · ${runde.titel}` : ""}
    </span>
  );
}

/**
 * Die offene Runde eines Bereichs bzw. einer Gruppe – oder, für wer leitet,
 * der Knopf, eine zu starten. Steht oben in der Liste des Bereichs.
 */
export function RundenAbschnitt({
  stand,
  gruppe = "",
  gruppeTitel = "",
  quellen,
  leitet,
  gesperrt,
  startText = "Engere Auswahl starten",
}: {
  stand: RundenStand;
  gruppe?: string;
  gruppeTitel?: string;
  /** Alles, was zur Wahl stehen kann – mit bisheriger Punktzahl zum Vorsortieren */
  quellen: (KandidatEingabe & { punkte?: number })[];
  leitet: boolean;
  gesperrt: boolean;
  startText?: string;
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
          onWeiter={() => {
            // Nächste Runde aus dieser: nach Stimmen sortiert vorauswählen
            const ks = stand.kandidatenVon(offen.id).map((k) => ({ id: k.ziel_id, label: k.label, unter: k.unter, punkte: stand.zahl(offen.id, k.ziel_id) ?? 0 }));
            setStarten(ks);
          }}
        />
      ) : (
        <>
          {letzte && (leitet || letzte.ergebnis_sichtbar) && <ErgebnisKurz stand={stand} runde={letzte} />}
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
  onWeiter,
}: {
  stand: RundenStand;
  runde: Runde;
  leitet: boolean;
  gesperrt: boolean;
  onWeiter: () => void;
}) {
  const ks = stand.kandidatenVon(runde.id);
  const meine = stand.meineIn(runde.id);
  const uebrig = Math.max(0, runde.stimmen - meine.length);
  const zahlenDa = leitet || runde.ergebnis_sichtbar;
  const hoechste = Math.max(1, ...ks.map((k) => stand.zahl(runde.id, k.ziel_id) ?? 0));
  const sortiert = zahlenDa && leitet ? [...ks].sort((a, b) => (stand.zahl(runde.id, b.ziel_id) ?? 0) - (stand.zahl(runde.id, a.ziel_id) ?? 0)) : ks;

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-brand/25 bg-brand/[0.04] dark:bg-brand/[0.08]">
      <div className="px-4 pb-2 pt-3.5">
        <RundenMarke runde={runde} />
        {runde.gruppe_titel && <div className="mt-1.5 text-[16px] font-semibold leading-snug">{runde.gruppe_titel}</div>}
        <div className="mt-1 text-[13px] leading-snug text-tinte-matt dark:text-slate-300">
          {gesperrt
            ? GESPERRT_TEXT
            : uebrig === 0
              ? `Du hast ${runde.stimmen === 1 ? "deine Stimme" : `alle ${runde.stimmen} Stimmen`} vergeben. Antippen nimmt eine zurück.`
              : `Du hast noch ${uebrig} von ${runde.stimmen} ${runde.stimmen === 1 ? "Stimme" : "Stimmen"}.`}
        </div>
      </div>
      <ul className="space-y-1.5 px-2.5 pb-2.5">
        {sortiert.map((k) => {
          const an = stand.hatGewaehlt(runde.id, k.ziel_id);
          const n = stand.zahl(runde.id, k.ziel_id);
          return (
            <li key={k.ziel_id}>
              <button
                aria-pressed={an}
                onClick={async () => {
                  if (gesperrt) return meldeFehler(GESPERRT_TEXT);
                  const f = await stand.stimme(runde, k.ziel_id);
                  if (f) meldeFehler(f);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition active:scale-[.99] ${
                  an ? "bg-white shadow-card ring-2 ring-brand dark:bg-slate-900" : "bg-white/70 dark:bg-slate-900/60"
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${
                    an ? "border-brand bg-brand text-white" : "border-black/20 dark:border-white/25"
                  }`}
                >
                  {an && <Icon name="haken" size={14} strich={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-snug">{k.label}</span>
                  {k.unter && <span className="block text-[12.5px] leading-snug text-tinte-leise">{k.unter}</span>}
                  {zahlenDa && n !== undefined && (
                    <span className="mt-1 flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[0.07] dark:bg-white/10">
                        <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.round((n / hoechste) * 100)}%` }} />
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
      {leitet && <RundeSteuern stand={stand} runde={runde} onWeiter={onWeiter} />}
    </section>
  );
}

function RundeSteuern({ stand, runde, onWeiter }: { stand: RundenStand; runde: Runde; onWeiter: () => void }) {
  return (
    <div className="border-t border-black/[0.06] bg-white/60 px-4 py-2 dark:border-white/[0.08] dark:bg-slate-900/40">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-tinte-leise">
        Nur für dich sichtbar · {stand.teilnehmer(runde.id)} {stand.teilnehmer(runde.id) === 1 ? "Person hat" : "Personen haben"} abgestimmt
      </div>
      <div className="flex min-h-[44px] items-center gap-3">
        <span className="min-w-0 flex-1 text-[14px]">Stimmen je Person</span>
        <Stepper
          wert={runde.stimmen}
          label="Stimmen je Person"
          onChange={async (n) => {
            const f = await stand.aendern(runde.id, { stimmen: n });
            if (f) meldeFehler("Ging nicht: " + f);
          }}
        />
      </div>
      <div className="flex min-h-[44px] items-center gap-3">
        <span className="min-w-0 flex-1 text-[14px]">Ergebnis für alle sichtbar</span>
        <Schalter
          an={runde.ergebnis_sichtbar}
          label="Ergebnis für alle sichtbar"
          onChange={async (v) => {
            const f = await stand.aendern(runde.id, { ergebnis: v });
            if (f) meldeFehler("Ging nicht: " + f);
          }}
        />
      </div>
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

function ErgebnisKurz({ stand, runde }: { stand: RundenStand; runde: Runde }) {
  const ks = stand
    .kandidatenVon(runde.id)
    .map((k) => ({ ...k, n: stand.zahl(runde.id, k.ziel_id) ?? 0 }))
    .sort((a, b) => b.n - a.n);
  if (!ks.length) return null;
  return (
    <details className="feld-grau group mb-3 overflow-hidden">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
        <Icon name="pokal" size={17} />
        <span className="min-w-0 flex-1 text-[14px]">
          <span className="font-semibold">Runde {runde.nr} beendet</span>
          <span className="text-tinte-leise"> · vorn: {ks[0].label}</span>
        </span>
        <span className="text-tinte-leise transition group-open:rotate-90" aria-hidden>
          ›
        </span>
      </summary>
      <ol className="space-y-1 px-4 pb-3">
        {ks.map((k, i) => (
          <li key={k.ziel_id} className="flex items-baseline gap-2 text-[14px]">
            <span className="zahl w-5 text-tinte-leise">{i + 1}.</span>
            <span className="min-w-0 flex-1">{k.label}</span>
            <span className="zahl font-semibold">{k.n}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

export function RundeStartenSheet({
  offen,
  quellen,
  gruppe,
  gruppeTitel,
  stand,
  onClose,
}: {
  offen: boolean;
  quellen: (KandidatEingabe & { punkte?: number })[];
  gruppe: string;
  gruppeTitel: string;
  stand: RundenStand;
  onClose: () => void;
}) {
  const sortiert = useMemo(() => [...quellen].sort((a, b) => (b.punkte ?? 0) - (a.punkte ?? 0)), [quellen]);
  const mitPunkten = sortiert.some((q) => (q.punkte ?? 0) > 0);
  const [wahl, setWahl] = useState<Set<string>>(new Set());
  const [titel, setTitel] = useState("Engere Auswahl");
  const [stimmen, setStimmen] = useState(1);
  const [sendet, setSendet] = useState(false);

  useEffect(() => {
    if (!offen) return;
    // Vorauswahl: die (bis zu fünf) Besten mit Stimmen; ohne Stimmen alles, außer bei langen Listen
    const mitStimmen = sortiert.filter((q) => (q.punkte ?? 0) > 0).slice(0, 5);
    setWahl(new Set((mitStimmen.length >= 2 ? mitStimmen : sortiert.length <= 10 ? sortiert : []).map((q) => q.id)));
    setTitel(stand.letzteBeendete(gruppe) || stand.offeneVon(gruppe) ? "Finale" : "Engere Auswahl");
    setStimmen(1);
  }, [offen, sortiert, mitPunkten, stand, gruppe]);

  const top = (n: number) => setWahl(new Set(sortiert.slice(0, n).map((q) => q.id)));

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
      </div>
      {mitPunkten && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {[3, 5, 10].filter((n) => n < sortiert.length).map((n) => (
            <button key={n} onClick={() => top(n)} className="btn-klein-grau !min-h-[2rem] !px-3 !text-[13px]">
              Top {n}
            </button>
          ))}
          <button onClick={() => setWahl(new Set())} className="btn-klein-grau !min-h-[2rem] !px-3 !text-[13px]">
            Keine
          </button>
        </div>
      )}
      <div className="liste max-h-[45vh] overflow-y-auto bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]">
        {sortiert.map((q, i) => {
          const an = wahl.has(q.id);
          return (
            <label key={q.id} className="zeile cursor-pointer">
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-[rgb(var(--brand))]"
                checked={an}
                onChange={() =>
                  setWahl((w) => {
                    const n = new Set(w);
                    if (n.has(q.id)) n.delete(q.id);
                    else n.add(q.id);
                    return n;
                  })
                }
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-snug">{q.label}</span>
                {q.unter && <span className="block truncate text-[12px] text-tinte-leise">{q.unter}</span>}
              </span>
              {mitPunkten && (
                <span className="zahl shrink-0 text-[13px] text-tinte-leise">
                  {i < 3 && (q.punkte ?? 0) > 0 ? ["🥇", "🥈", "🥉"][i] + " " : ""}
                  {q.punkte ?? 0}
                </span>
              )}
            </label>
          );
        })}
      </div>
      <button
        className="btn-primary mt-4"
        disabled={wahl.size < 2 || sendet}
        onClick={async () => {
          setSendet(true);
          const f = await stand.starten({
            gruppe,
            gruppeTitel,
            titel: titel.trim() || "Engere Auswahl",
            stimmen: Math.min(stimmen, Math.max(1, wahl.size - 1)),
            kandidaten: sortiert.filter((q) => wahl.has(q.id)),
          });
          setSendet(false);
          if (f) return meldeFehler(f);
          melde("Runde gestartet", "erfolg");
          onClose();
        }}
      >
        {sendet ? "Wird gestartet …" : `Runde mit ${wahl.size} starten`}
      </button>
    </Sheet>
  );
}
