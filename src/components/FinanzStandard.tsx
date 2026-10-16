import { useEffect, useMemo, useState } from "react";
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
import { GeplantKarte, Kennzahlen, PostenBereiche } from "./FinanzBereiche";
import { useDunkel } from "../lib/dunkel";
import { useRole } from "../auth/RoleProvider";

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

/**
 * iPad hoch und breiter (ab 768 px, Tailwind „md“)? Dort stehen zwei Spalten
 * und „Geplante Aktionen“ als Karte; darunter als eine Zeile. Eigener kleiner
 * Hook wie useMittel (BeitraegeTab.tsx), folgt dem Drehen des Geräts.
 */
const AB_MD = "(min-width: 768px)";
function useAbMd(): boolean {
  const [ab, setAb] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(AB_MD).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(AB_MD);
    if (!mq) return;
    const neu = () => setAb(mq.matches);
    neu();
    mq.addEventListener("change", neu);
    return () => mq.removeEventListener("change", neu);
  }, []);
  return ab;
}

export function FinanzStandardInhalt({ d }: { d: FinanzUebersicht }) {
  const dunkel = useDunkel();
  const ab768 = useAbMd();
  // Eltern lasen „Offene Elternbeiträge 125 €“ als eigene Schuld – es ist die
  // Summe der ganzen Stufe (die eigene steht auf ihrer Übersicht).
  const { role } = useRole();
  const prozent = d.ziel_cent > 0 ? Math.max(0, Math.min(100, Math.round((d.stand_cent / d.ziel_cent) * 100))) : null;
  const fehlt = d.ziel_cent - d.stand_cent;
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

  // Ab iPad hoch zwei Spalten: links Kontostand und darunter „Geplante
  // Aktionen“, rechts die lange Liste „Aktionen, Beiträge und Sonstiges“.
  // Vorher ging der Kontostand über die volle Breite (Einnahmen und Ausgaben
  // 550 px auseinander), darunter blieb rechts eine große leere Fläche und die
  // Seite musste am Laptop gescrollt werden. Zeile 2 nimmt den Rest auf
  // (auto_1fr), damit zwischen Kontostand und „Geplant“ keine Lücke entsteht.
  // Am Handy (unter 768 px) steht „Geplante Aktionen“ als EINE Zeile am Ende,
  // die Liste im Blatt – wie im Kassenbuch am Handy (FinanzenTab). Vorher
  // eine eigene Karte, ~180 px (Rollen-Prüfung Schüler/Eltern, Okt. 2026).
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 pb-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:items-start">
      {/* ------------------------------------------------ Stand und Ziel */}
      <section className="card min-w-0 p-5 md:col-start-1 md:row-start-1">
        {/* Das Datum steht rechts in der Kopfzeile – vorher eine eigene Zeile
            „Stand der letzten Buchung vom …“ unter der Zahl (Okt. 2026) */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[14px] font-medium text-tinte-leise">Kontostand der Stufe</span>
          {d.letzte_buchung && (
            <span className="shrink-0 text-[12px] text-tinte-leise">
              Stand {new Date(d.letzte_buchung).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
            </span>
          )}
        </div>
        <div className={`zahl mt-1 font-zahl text-[2.5rem] font-bold leading-none tracking-[-0.03em] ${d.stand_cent < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
          {euro(d.stand_cent)}
        </div>

        {prozent !== null && (
          <div className="mt-4">
            {/* Was noch fehlt, steht rechts neben den Prozent – vorher eine
                eigene Zeile „Es fehlen noch …“ unter dem Balken (Okt. 2026).
                Ist es zu eng (iPhone SE), bricht die rechte Hälfte als Ganzes
                in eine eigene Zeile um; abgeschnitten wird nichts. */}
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
              <span className="min-w-0 font-bold">Ziel {d.ziel_titel}: {euroKurz(d.ziel_cent)}</span>
              <span className="zahl shrink-0">
                <b>{prozent} %</b>
                {fehlt > 0 && <span className="font-normal text-tinte-leise"> · fehlen {euroKurz(fehlt)}</span>}
              </span>
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
          </div>
        )}

        <Kennzahlen
          ein={d.einnahmen_cent}
          aus={d.ausgaben_cent}
          offen={{ cent: d.offen_cent, halbjahr: d.halbjahr }}
          offenTitel={role === "eltern" ? "Noch offen in der ganzen Stufe" : undefined}
        />
      </section>

      <PostenBereiche
        d={d}
        listeKlasse="md:col-start-2 md:row-start-1 md:row-span-2"
        geplantKlasse="md:col-start-1 md:row-start-2"
        vollAb="md"
        ohneGeplant={!ab768}
      />
      {/* Handy: derselbe Baustein wie im Kassenbuch – nur lesen, ein Tipp
          öffnet die Liste im Blatt */}
      {!ab768 && (
        <div className="gruppe-zellen min-w-0">
          <GeplantKarte alsZeile darf={false} fin={null} />
        </div>
      )}
    </div>
  );
}

