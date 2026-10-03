import { useMemo } from "react";
import { SkelettKarten } from "./Skelett";
import { useStore } from "../store";
import { basisOffen } from "../lib/logic";
import { hasSupabase } from "../lib/supabase";
import { demoBuchungen } from "../lib/demo";
import {
  euro, euroKurz, farbHex, postenFarbe, uebersichtAus, useFinanzUebersicht,
  type FinanzUebersicht,
} from "../lib/finanzen";
import { DEMO_KATEGORIEN } from "../lib/demo";
import { Kennzahlen, PostenBereiche } from "./FinanzBereiche";
import { useDunkel } from "../lib/dunkel";

/**
 * Finanzen – Standard-Ansicht: was die ganze Stufe (und die Eltern) sehen.
 * Nur Summen: Kontostand, Ziel, offene Beiträge, dann zwei Bereiche
 * (Aktionen, Beiträge und Sonstiges / Ausgaben) – jede Zeile antippbar.
 * Keine Namen, keine Einzelbuchungen.
 */
export function FinanzStandard({ aktionName }: { aktionName?: (id: string) => string }) {
  const { daten, fehler } = useFinanzUebersicht(true);
  const demo = useDemoUebersicht(!hasSupabase, aktionName);
  const d = hasSupabase ? daten : demo;

  if (fehler)
    return <div className="card p-6 text-center text-sm text-tinte-matt">Die Finanzen lassen sich gerade nicht laden: {fehler}</div>;
  if (!d)
    return (
      <SkelettKarten n={3} gross />
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
      DEMO_KATEGORIEN,
    );
  }, [aktiv, students, settings, aktionName]);
}

export function FinanzStandardInhalt({ d }: { d: FinanzUebersicht }) {
  const dunkel = useDunkel();
  const prozent = d.ziel_cent > 0 ? Math.max(0, Math.min(100, Math.round((d.stand_cent / d.ziel_cent) * 100))) : null;
  const beitraegeSumme = d.beitraege.reduce((n, b) => n + b.cent, 0);

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

        <Kennzahlen ein={d.einnahmen_cent} aus={d.ausgaben_cent} offen={{ cent: d.offen_cent, halbjahr: d.halbjahr }} />
      </section>

      <PostenBereiche d={d} />
    </div>
  );
}

