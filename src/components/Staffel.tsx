import { abiballVon, bonusAnteil, bonusGrenze, staffelVon, ticketPreise } from "../lib/logic";
import type { Settings } from "../lib/types";
import { Ring } from "./Ring";

/** Die Stufe, in der man gerade ist (ab wie viel Prozent). */
export function aktuelleStufe(pct: number, settings: Settings): number | null {
  return staffelVon(settings).filter((x) => Math.min(pct, 100) >= x.ab).pop()?.ab ?? null;
}

/**
 * Ring mit Strichen an den Stellen, an denen der Aufschlag sinkt. Über 100 %
 * (nur wenn eingeschaltet) läuft eine goldene Bonus-Runde darüber.
 */
export function StaffelRing({ pct, settings, klein }: { pct: number; settings: Settings; klein?: boolean }) {
  return (
    <Ring
      pct={pct}
      klein={klein}
      stufen={staffelVon(settings).map((s) => s.ab)}
      aktuellAb={aktuelleStufe(pct, settings)}
      bonus={bonusAnteil(pct, settings)}
    />
  );
}

/**
 * Die Staffel zum Nachsehen: ab wie viel Prozent kostet das erste Ticket wie
 * viel extra.
 *
 * Als Skala (dünner Balken mit Stufenmarken, darunter Prozent und Aufschlag),
 * nicht als Kacheln: Fünf abgerundete Flächen, eine davon voll blau, sahen
 * aus wie eine Auswahl zum Antippen – es ist aber reine Anzeige (Prüfung
 * Okt. 2026). Erreichte Stufen sind blass blau, die geltende kräftig.
 *
 * `kinder` (Eltern mit Geschwistern): EINE Staffel für alle – unter der
 * Stufe, in der ein Kind gerade steht, steht sein Vorname. Vorher stand die
 * ganze Reihe bei jedem Kind einzeln.
 */
export function StaffelKacheln({
  pct,
  settings,
  kinder,
  className = "mt-4",
}: {
  pct: number;
  settings: Settings;
  kinder?: { name: string; pct: number }[];
  className?: string;
}) {
  const a = abiballVon(settings);
  const stufen = staffelVon(settings);
  const grenze = bonusGrenze(a);
  // Wo steht wer? Ohne `kinder` nur die eine Person (pct).
  const stufeVon = (x: number): number | "bonus" | null => (a.ueber100 && x > 100 ? "bonus" : aktuelleStufe(x, settings));
  const leute = kinder ?? [{ name: "", pct }];
  const hier = (s: number | "bonus") => leute.some((k) => stufeVon(k.pct) === s);
  const namen = (s: number | "bonus") => (kinder ? kinder.filter((k) => stufeVon(k.pct) === s).map((k) => k.name) : []);
  // Bei einer Person zeigt der Balken den Weg bis hierher (erreichte Stufen blass)
  const erreicht = (ab: number) => !kinder && pct >= ab;
  const imBonus = hier("bonus");
  const rabatt = ticketPreise(pct, settings).rabatt;

  const namensZeile = (s: number | "bonus") =>
    namen(s).length > 0 && (
      <div className="mt-1 grid text-[12px] font-semibold leading-tight text-brand-dark dark:text-brand">
        {namen(s).map((n) => (
          <span key={n} className="truncate">
            {n}
          </span>
        ))}
      </div>
    );

  return (
    <div className={className}>
      <div className="mb-2 text-[12px] text-tinte-leise">Aufschlag aufs 1. Ticket – je mehr Mithilfe, desto weniger</div>
      <ol className={`grid gap-1 ${a.ueber100 ? "grid-cols-6" : "grid-cols-5"}`} aria-label="Staffel: Aufschlag je nach Mithilfe">
        {stufen.map((stufe) => {
          const jetzt = hier(stufe.ab);
          const weg = erreicht(stufe.ab);
          return (
            <li key={stufe.ab} className="min-w-0 text-center" aria-current={jetzt ? "step" : undefined}>
              <span
                aria-hidden
                className={`block h-1 rounded-full ${jetzt ? "bg-brand" : weg ? "bg-brand/35" : "bg-[rgb(118_118_128/0.18)]"}`}
              />
              <div
                className={`zahl mt-1.5 text-[13px] leading-none ${
                  jetzt ? "font-bold text-brand-dark dark:text-brand" : weg ? "font-semibold text-tinte-matt dark:text-slate-300" : "font-semibold text-tinte-leise"
                }`}
              >
                {stufe.ab} %
              </div>
              <div className={`zahl mt-1 text-[12px] leading-none ${jetzt ? "font-semibold text-brand-dark dark:text-brand" : "text-tinte-leise"}`}>
                +{stufe.betrag} €
              </div>
              {namensZeile(stufe.ab)}
            </li>
          );
        })}
        {a.ueber100 && (
          <li
            className="min-w-0 text-center"
            aria-current={imBonus ? "step" : undefined}
            title={`Alle ${a.bonusSchritt} % über 100: −${a.bonusProSchritt} €, höchstens −${a.bonusMax} €`}
          >
            <span
              aria-hidden
              className={`block h-1 rounded-full ${imBonus ? "bg-gradient-to-r from-[#F6DD8B] via-[#D9A92B] to-[#A87A0C]" : "bg-[#D9A92B]/30"}`}
            />
            <div className={`zahl mt-1.5 text-[13px] leading-none text-[#8A650A] dark:text-[#E9C460] ${imBonus ? "font-bold" : "font-semibold"}`}>
              ✦{grenze}
            </div>
            <div className="zahl mt-1 text-[12px] leading-none text-[#8A650A] dark:text-[#E9C460]">
              −{imBonus && !kinder ? rabatt : a.bonusMax} €
            </div>
            {namensZeile("bonus")}
          </li>
        )}
      </ol>
      {a.ueber100 && (
        <div className="mt-1.5 text-[12px] text-tinte-leise">
          ✦ Über 100 %: alle {a.bonusSchritt} % <b className="text-[#8A650A] dark:text-[#E9C460]">−{a.bonusProSchritt} €</b>, höchstens −{a.bonusMax} €
        </div>
      )}
    </div>
  );
}
