import { staffelVon } from "../lib/logic";
import type { Settings } from "../lib/types";
import { Ring } from "./Ring";

/** Die Stufe, in der man gerade ist (ab wie viel Prozent). */
export function aktuelleStufe(pct: number, settings: Settings): number | null {
  return staffelVon(settings).filter((x) => pct >= x.ab).pop()?.ab ?? null;
}

/** Ring mit Strichen an den Stellen, an denen der Aufschlag sinkt. */
export function StaffelRing({ pct, settings }: { pct: number; settings: Settings }) {
  return <Ring pct={pct} stufen={staffelVon(settings).map((s) => s.ab)} aktuellAb={aktuelleStufe(pct, settings)} />;
}

/** Die Staffel zum Nachsehen: ab wie viel Prozent kostet das erste Ticket wie viel extra. */
export function StaffelKacheln({ pct, settings }: { pct: number; settings: Settings }) {
  const aktuell = aktuelleStufe(pct, settings);
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-[12px] text-tinte-leise">Aufschlag aufs erste Ticket</div>
      <div className="grid grid-cols-5 gap-1">
        {staffelVon(settings).map((stufe) => {
          const erreicht = pct >= stufe.ab;
          return (
            <div
              key={stufe.ab}
              className={`rounded-xl px-1 py-2 text-center transition ${
                aktuell === stufe.ab
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
      </div>
    </div>
  );
}
