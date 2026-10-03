import { abiballVon, bonusAnteil, staffelVon, ticketPreise } from "../lib/logic";
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
export function StaffelRing({ pct, settings }: { pct: number; settings: Settings }) {
  return (
    <Ring
      pct={pct}
      stufen={staffelVon(settings).map((s) => s.ab)}
      aktuellAb={aktuelleStufe(pct, settings)}
      bonus={bonusAnteil(pct, settings)}
    />
  );
}

/** Die Staffel zum Nachsehen: ab wie viel Prozent kostet das erste Ticket wie viel extra. */
export function StaffelKacheln({ pct, settings }: { pct: number; settings: Settings }) {
  const aktuell = aktuelleStufe(pct, settings);
  const a = abiballVon(settings);
  const imBonus = a.ueber100 && pct > 100;
  const stufen = staffelVon(settings);
  const rabatt = ticketPreise(pct, settings).rabatt;
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-[12px] text-tinte-leise">Helferzuschuss aufs erste Ticket</div>
      <div className={`grid gap-1 ${a.ueber100 ? "grid-cols-6" : "grid-cols-5"}`}>
        {stufen.map((stufe) => {
          const erreicht = pct >= stufe.ab;
          return (
            <div
              key={stufe.ab}
              className={`rounded-xl px-1 py-2 text-center transition ${
                aktuell === stufe.ab && !imBonus
                  ? "bg-brand text-white"
                  : erreicht
                    ? "bg-brand/[0.12] text-brand-dark dark:text-brand"
                    : "bg-[rgb(118_118_128/0.1)] text-tinte-leise"
              }`}
            >
              <div className="zahl text-[13px] font-bold leading-none">{stufe.ab} %</div>
              <div className="zahl mt-1 text-[11px] font-medium leading-none">+{stufe.betrag} €</div>
            </div>
          );
        })}
        {a.ueber100 && (
          <div
            className={`rounded-xl px-1 py-2 text-center transition ${
              imBonus
                ? "bg-gradient-to-br from-[#F6DD8B] via-[#D9A92B] to-[#A87A0C] text-[#3D2B00] shadow-[0_2px_10px_rgba(217,169,43,.35)]"
                : "bg-[#D9A92B]/[0.12] text-[#8A650A] dark:text-[#E9C460]"
            }`}
            title={`Bonus bis ${a.bonusBis} %: bis zu ${a.bonusRabatt} € Rabatt`}
          >
            <div className="zahl text-[13px] font-bold leading-none">✦{a.bonusBis}</div>
            <div className="zahl mt-1 text-[11px] font-medium leading-none">
              −{imBonus ? rabatt : a.bonusRabatt} €
            </div>
          </div>
        )}
      </div>
      {a.ueber100 && (
        <div className="mt-1.5 text-[11.5px] leading-snug text-tinte-leise">
          Über 100 % zählt weiter: bis {a.bonusBis} % gibt es bis zu{" "}
          <b className="text-[#8A650A] dark:text-[#E9C460]">{a.bonusRabatt} € Bonus</b> aufs erste Ticket.
        </div>
      )}
    </div>
  );
}
