import { useMemo } from "react";
import { useStore } from "../store";
import { basisOffen } from "../lib/logic";
import { committeeLabel } from "../lib/committees";
import { hasSupabase } from "../lib/supabase";
import { demoBuchungen } from "../lib/demo";
import {
  euro, euroKurz, farbHex, postenFarbe, schuljahrVon, uebersichtAus, useFinanzUebersicht,
  type FinanzPosten, type FinanzUebersicht,
} from "../lib/finanzen";
import { useDunkel } from "../lib/dunkel";

/**
 * Finanzen – Standard-Ansicht: was die ganze Stufe (und die Eltern) sehen.
 * Nur Summen: Kontostand, Ziel, offene Beiträge, Beiträge je Phase und jede
 * Aktion mit Einnahmen, Ausgaben und Saldo. Keine Namen, keine Einzelbuchungen.
 */
export function FinanzStandard({ aktionName }: { aktionName?: (id: string) => string }) {
  const { daten, fehler } = useFinanzUebersicht(true);
  const demo = useDemoUebersicht(!hasSupabase, aktionName);
  const d = hasSupabase ? daten : demo;

  if (fehler)
    return <div className="card p-6 text-center text-sm text-tinte-matt">Die Finanzen lassen sich gerade nicht laden: {fehler}</div>;
  if (!d)
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-tinte-leise">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-papier-linie border-t-brand dark:border-slate-700" />
        <span className="text-sm">Finanzen werden geladen …</span>
      </div>
    );
  return <FinanzStandardInhalt d={d} />;
}

function useDemoUebersicht(aktiv: boolean, aktionName?: (id: string) => string): FinanzUebersicht | null {
  const { students, settings } = useStore();
  return useMemo(() => {
    if (!aktiv || !students.length) return null;
    let cent = 0, personen = 0;
    for (const s of students) {
      const o = basisOffen(s, settings.aktuelles_halbjahr, settings);
      if (o > 0) { cent += Math.round(o * 100); personen++; }
    }
    return uebersichtAus(
      demoBuchungen(students),
      { ziel_cent: 800000, ziel_titel: "Abiball" },
      { cent, personen },
      settings.aktuelles_halbjahr,
      aktionName || (() => "Aktion"),
    );
  }, [aktiv, students, settings, aktionName]);
}

const PHASE_NAME: Record<string, string> = { EF: "Einführungsphase (EF)", Q1: "Qualifikationsphase 1 (Q1)", Q2: "Qualifikationsphase 2 (Q2)" };

function postenName(p: FinanzPosten): string {
  if (p.art === "komitee") return `Ausgaben ${committeeLabel(p.titel)}`;
  return p.titel;
}

export function FinanzStandardInhalt({ d }: { d: FinanzUebersicht }) {
  const dunkel = useDunkel();
  const prozent = d.ziel_cent > 0 ? Math.max(0, Math.min(100, Math.round((d.stand_cent / d.ziel_cent) * 100))) : null;
  const beitraegeSumme = d.beitraege.reduce((n, b) => n + b.cent, 0);
  const aktionen = d.posten.filter((p) => p.art === "aktion" || p.art === "kategorie");
  const weitere = d.posten.filter((p) => p.art !== "aktion" && p.art !== "kategorie");

  // Woher das Geld kommt – als farbige Abschnitte im Balken. Gleiche Farbe =
  // ein Abschnitt; die Anteile richten sich nach den Einnahmen.
  const abschnitte = (() => {
    const m = new Map<string, number>();
    if (beitraegeSumme > 0) m.set("blau", beitraegeSumme);
    for (const p of d.posten) if (p.ein_cent > 0) m.set(postenFarbe(p), (m.get(postenFarbe(p)) || 0) + p.ein_cent);
    const summe = [...m.values()].reduce((n, c) => n + c, 0);
    return summe > 0 ? [...m.entries()].map(([farbe, cent]) => ({ farbe, anteil: cent / summe })) : [];
  })();

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      {/* ------------------------------------------------ Stand und Ziel */}
      <section className="card p-5 lg:col-span-2">
        <div className="text-[14px] font-medium text-tinte-leise">Kontostand der Stufe</div>
        <div className={`zahl mt-1 font-zahl text-[2.5rem] font-bold leading-none tracking-[-0.03em] ${d.stand_cent < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
          {euro(d.stand_cent)}
        </div>
        {d.letzte_buchung && (
          <div className="mt-1.5 text-[12px] text-tinte-leise">
            Stand der letzten Buchung vom {new Date(d.letzte_buchung).toLocaleDateString("de-DE")}
          </div>
        )}

        {prozent !== null && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate font-bold">Ziel {d.ziel_titel}: {euroKurz(d.ziel_cent)}</span>
              <span className="zahl shrink-0 font-bold">{prozent} %</span>
            </div>
            <div
              className="h-3 overflow-hidden rounded-full bg-papier-linie dark:bg-slate-800"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={prozent}
              aria-label={`${prozent} Prozent vom Ziel ${d.ziel_titel}`}
            >
              <div className="flex h-full overflow-hidden rounded-full transition-all" style={{ width: `${prozent}%` }}>
                {abschnitte.length === 0 ? (
                  <div className="h-full w-full bg-brand" />
                ) : (
                  abschnitte.map((a) => (
                    <div key={a.farbe} className="h-full" style={{ width: `${a.anteil * 100}%`, background: farbHex(a.farbe, dunkel) }} />
                  ))
                )}
              </div>
            </div>
            {d.ziel_cent > d.stand_cent && (
              <div className="mt-1.5 text-[12px] text-tinte-leise">Es fehlen noch {euroKurz(d.ziel_cent - d.stand_cent)}.</div>
            )}
          </div>
        )}

        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Kennzahl titel="Einnahmen" wert={euroKurz(d.einnahmen_cent)} />
          <Kennzahl titel="Ausgaben" wert={euroKurz(d.ausgaben_cent)} />
          <Kennzahl titel="Elternbeiträge offen" wert={euroKurz(d.offen_cent)} unter={`fällig bis ${d.halbjahr} (${schuljahrVon(d.halbjahr)})`} />
        </dl>
      </section>

      {/* ------------------------------------------------ Stufenbeiträge */}
      <section className="card p-5">
        <h2 className="text-[17px] font-bold">Stufenbeiträge</h2>
        <p className="mb-3 text-[12px] text-tinte-leise">Was bisher an Beiträgen eingegangen ist – zusammengefasst je Phase.</p>
        {d.beitraege.length === 0 ? (
          <p className="text-[13px] text-tinte-leise">Noch keine Beiträge verbucht.</p>
        ) : (
          <ul className="grid gap-2">
            {d.beitraege.map((b) => (
              <li key={b.phase} className="flex items-center gap-3 rounded-xl bg-papier-matt px-3 py-2.5 dark:bg-slate-800">
                <Punkt hex={farbHex("blau", dunkel)} />
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{PHASE_NAME[b.phase] ?? "Ohne Halbjahr"}</span>
                <span className="zahl shrink-0 text-[15px] font-bold">{euro(b.cent)}</span>
              </li>
            ))}
            <li className="flex items-center gap-3 px-3 pt-1 text-[13px] text-tinte-leise">
              <span className="min-w-0 flex-1">Zusammen</span>
              <span className="zahl shrink-0 font-bold">{euro(beitraegeSumme)}</span>
            </li>
          </ul>
        )}
      </section>

      {/* ------------------------------------------------ Aktionen und mehr */}
      <section className="card p-5">
        <h2 className="text-[17px] font-bold">Aktionen, Ausgaben und Sonstiges</h2>
        <p className="mb-3 text-[12px] text-tinte-leise">Jede Aktion mit dem, was reinkam, was sie gekostet hat, und was übrig blieb.</p>
        {aktionen.length + weitere.length === 0 ? (
          <p className="text-[13px] text-tinte-leise">Noch keine Aktionen oder Ausgaben verbucht.</p>
        ) : (
          <ul className="grid gap-2">
            {[...aktionen, ...weitere].map((p) => (
              <PostenZeile key={`${p.art}|${p.titel}`} p={p} hex={farbHex(postenFarbe(p), dunkel)} />
            ))}
          </ul>
        )}
      </section>

    </div>
  );
}

/** Farbpunkt – dieselbe Farbe wie der Abschnitt im Balken. */
function Punkt({ hex }: { hex: string }) {
  return <span aria-hidden className="h-2.5 w-2.5 shrink-0 self-center rounded-full" style={{ background: hex }} />;
}

function PostenZeile({ p, hex }: { p: FinanzPosten; hex: string }) {
  const saldo = p.ein_cent - p.aus_cent;
  return (
    <li className="rounded-xl bg-papier-matt px-3 py-2.5 dark:bg-slate-800">
      <div className="flex items-baseline gap-3">
        <Punkt hex={hex} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{postenName(p)}</span>
        <span className={`zahl shrink-0 text-[15px] font-bold ${saldo < 0 ? "text-red-600 dark:text-red-400" : "text-bezahlt"}`}>
          {saldo < 0 ? "−" : "+"}{euro(Math.abs(saldo))}
        </span>
      </div>
      {(p.art === "aktion" || (p.ein_cent > 0 && p.aus_cent > 0)) && (
        <div className="mt-0.5 flex flex-wrap gap-x-3 pl-[1.375rem] text-[12px] text-tinte-leise">
          <span>Einnahmen <span className="zahl font-semibold">{euroKurz(p.ein_cent)}</span></span>
          <span>Ausgaben <span className="zahl font-semibold">{euroKurz(p.aus_cent)}</span></span>
          <span>Total <span className="zahl font-semibold">{saldo < 0 ? "−" : ""}{euroKurz(Math.abs(saldo))}</span></span>
        </div>
      )}
    </li>
  );
}

/** Zahlen ohne Wertung: Einnahmen, Ausgaben und Offenes in derselben Farbe. */
function Kennzahl({ titel, wert, unter }: { titel: string; wert: string; unter?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-papier-matt px-1.5 py-2.5 dark:bg-slate-800">
      <dt className="text-[12px] font-medium leading-tight text-tinte-leise">{titel}</dt>
      {/* Beträge nie abschneiden – lieber etwas kleiner */}
      <dd className="zahl mt-0.5 whitespace-nowrap text-[clamp(13px,3.6vw,16px)] font-bold tracking-tight">{wert}</dd>
      {unter && <dd className="text-[11px] leading-tight text-tinte-leise">{unter}</dd>}
    </div>
  );
}
