import { useMemo } from "react";
import { Icon } from "./Icon";
import { useStore } from "../store";
import { basisOffen } from "../lib/logic";
import { committeeLabel } from "../lib/committees";
import { hasSupabase } from "../lib/supabase";
import { demoBuchungen } from "../lib/demo";
import {
  euro, euroKurz, uebersichtAus, useFinanzUebersicht,
  type FinanzPosten, type FinanzUebersicht,
} from "../lib/finanzen";

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
  const prozent = d.ziel_cent > 0 ? Math.max(0, Math.min(100, Math.round((d.stand_cent / d.ziel_cent) * 100))) : null;
  const beitraegeSumme = d.beitraege.reduce((n, b) => n + b.cent, 0);
  const aktionen = d.posten.filter((p) => p.art === "aktion");
  const weitere = d.posten.filter((p) => p.art !== "aktion");

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
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${prozent}%` }} />
            </div>
            {d.ziel_cent > d.stand_cent && (
              <div className="mt-1.5 text-[12px] text-tinte-leise">Es fehlen noch {euroKurz(d.ziel_cent - d.stand_cent)}.</div>
            )}
          </div>
        )}

        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Kennzahl titel="Rein" wert={euroKurz(d.einnahmen_cent)} ton="plus" />
          <Kennzahl titel="Raus" wert={euroKurz(d.ausgaben_cent)} ton="minus" />
          <Kennzahl titel="Beiträge offen" wert={euroKurz(d.offen_cent)} unter={`bis ${d.halbjahr}`} />
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
        <h2 className="text-[17px] font-bold">Aktionen und Ausgaben</h2>
        <p className="mb-3 text-[12px] text-tinte-leise">Jede Aktion mit dem, was reinkam, was sie gekostet hat, und was übrig blieb.</p>
        {aktionen.length + weitere.length === 0 ? (
          <p className="text-[13px] text-tinte-leise">Noch keine Aktionen oder Ausgaben verbucht.</p>
        ) : (
          <ul className="grid gap-2">
            {[...aktionen, ...weitere].map((p) => (
              <PostenZeile key={`${p.art}|${p.titel}`} p={p} />
            ))}
          </ul>
        )}
      </section>

      <div className="flex items-start gap-2 rounded-2xl bg-[rgb(118_118_128/0.1)] px-4 py-3 text-[13px] leading-relaxed text-tinte-matt dark:text-slate-300 lg:col-span-2">
        <span className="mt-0.5 shrink-0"><Icon name="info" size={16} /></span>
        <span>
          Das ist die Übersicht für alle. Einzelne Buchungen – und wer was bezahlt hat – sehen nur das Stufenteam,
          der Kassenwart und der Aufsichtsrat.
        </span>
      </div>
    </div>
  );
}

function PostenZeile({ p }: { p: FinanzPosten }) {
  const saldo = p.ein_cent - p.aus_cent;
  return (
    <li className="rounded-xl bg-papier-matt px-3 py-2.5 dark:bg-slate-800">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{postenName(p)}</span>
        <span className={`zahl shrink-0 text-[15px] font-bold ${saldo < 0 ? "text-red-600 dark:text-red-400" : "text-bezahlt"}`}>
          {saldo < 0 ? "−" : "+"}{euro(Math.abs(saldo))}
        </span>
      </div>
      {(p.art === "aktion" || (p.ein_cent > 0 && p.aus_cent > 0)) && (
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-tinte-leise">
          <span>Einnahmen <span className="zahl font-semibold">{euroKurz(p.ein_cent)}</span></span>
          <span>Ausgaben <span className="zahl font-semibold">{euroKurz(p.aus_cent)}</span></span>
          <span>Total <span className="zahl font-semibold">{saldo < 0 ? "−" : ""}{euroKurz(Math.abs(saldo))}</span></span>
        </div>
      )}
    </li>
  );
}

function Kennzahl({ titel, wert, unter, ton }: { titel: string; wert: string; unter?: string; ton?: "plus" | "minus" }) {
  return (
    <div className="min-w-0 rounded-xl bg-papier-matt px-2 py-2.5 dark:bg-slate-800">
      <dt className="truncate text-[12px] font-medium text-tinte-leise">{titel}</dt>
      <dd className={`zahl mt-0.5 truncate text-[16px] font-bold ${ton === "plus" ? "text-bezahlt" : ton === "minus" ? "text-red-600 dark:text-red-400" : ""}`}>
        {wert}
      </dd>
      {unter && <dd className="truncate text-[11px] text-tinte-leise">{unter}</dd>}
    </div>
  );
}
