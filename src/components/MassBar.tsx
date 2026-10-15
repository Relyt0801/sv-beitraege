import { useMemo, useState } from "react";
import { HY, type Halbjahr } from "../lib/types";
import { useStore } from "../store";
import { useRole } from "../auth/RoleProvider";
import { sortStudents } from "../lib/logic";
import { MithilfeBlatt } from "./MithilfeBlatt";
import { useEscapeSchliesst } from "./Sheet";

/**
 * Leiste im Auswahl-Modus der Kasse.
 *
 * Oben stehen immer die Namen aller Ausgewählten – auch derer, die Suche oder
 * Filter gerade ausblenden. Vorher stand hier nur „5 ausgewählt“: Im
 * Auswahl-Modus wählt ein Tipp irgendwo auf eine Zeile die Person aus, und
 * eine Auswahl aus einer früheren Suche bleibt stehen. So bekam jemand
 * Mithilfe samt „Danke fürs Mithelfen“-Mitteilung, ohne irgendwo
 * eingetragen zu sein – und niemand sah es vor dem Tippen.
 *
 * Update 1.4 (U3): schwebt als Glas-Karte (am Laptop nicht mehr über die ganze
 * Fensterbreite), Knöpfe im Stil der App, Escape beendet den Auswahl-Modus
 * (solange nicht das Mithilfe-Blatt darüber offen ist).
 */
export function MassBar({
  selected,
  onAbwaehlen,
  onDone,
}: {
  selected: Set<string>;
  onAbwaehlen: (id: string) => void;
  onDone: () => void;
}) {
  const { massApply, addContributionMany, students } = useStore();
  const { canEditHilfen } = useRole();
  const [h, setH] = useState<Halbjahr>("EF.1");
  const [punkteOffen, setPunkteOffen] = useState(false);

  // Nur Personen, die es noch gibt – alphabetisch wie in der Liste.
  const ausgewaehlt = useMemo(() => sortStudents(students.filter((s) => selected.has(s.id))), [students, selected]);

  // Escape beendet den Modus. Ist das Mithilfe-Blatt offen, liegt es im Escape-
  // Stapel (Sheet.tsx) weiter oben und schließt zuerst – dieses Escape bekommt nur das oberste.
  useEscapeSchliesst(true, onDone);

  const btn = "btn-klein-grau !px-3.5";
  const disabled = ausgewaehlt.length === 0;

  const namen = ausgewaehlt.length > 0 && (
    <div className="flex max-h-[5.5rem] w-full flex-wrap gap-1 overflow-y-auto">
      {ausgewaehlt.map((s) => (
        <button
          key={s.id}
          onClick={() => onAbwaehlen(s.id)}
          aria-label={`${s.vorname} ${s.nachname} abwählen`}
          className="flex max-w-full items-center gap-1 rounded-full bg-brand/10 py-0.5 pl-2.5 pr-1.5 text-[12px] font-semibold text-tinte dark:bg-brand/20 dark:text-slate-200"
        >
          <span className="truncate">
            {s.nachname}, {s.vorname}
          </span>
          <span className="shrink-0 px-1 text-tinte-leise">✕</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
    <div className="pointer-events-auto mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-[1.5rem] border border-white/60 p-3 shadow-[0_8px_32px_-8px_rgba(0,0,0,.28),0_0_0_.5px_rgba(0,0,0,.08)] glas dark:border-white/10">
      {namen}
      <span className="mr-auto text-[15px] font-semibold">{ausgewaehlt.length} ausgewählt</span>
      {/* Halbjahr: native Auswahl, aber wie die übrigen Knöpfe gestaltet */}
      <select
        aria-label="Halbjahr"
        className="min-h-[2.5rem] rounded-full bg-[rgb(118_118_128/0.12)] px-3.5 text-[14px] font-semibold text-brand-dark outline-none dark:bg-[rgb(118_118_128/0.24)] dark:text-brand"
        value={h}
        onChange={(e) => setH(e.target.value as Halbjahr)}
      >
        {HY.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <button disabled={disabled} className={btn} onClick={() => massApply(selected, h, "bezahlt")}>
        bezahlt
      </button>
      <button disabled={disabled} className={btn} onClick={() => massApply(selected, h, "erlassen")}>
        erlassen
      </button>
      <button disabled={disabled} className={btn} onClick={() => massApply(selected, h, "offen")}>
        offen
      </button>
      {canEditHilfen && (
        <button disabled={disabled} className={btn} onClick={() => setPunkteOffen(true)}>
          Mithilfe
        </button>
      )}
      <button className="btn-klein !px-5" onClick={onDone}>
        Fertig
      </button>

      {/* Mithilfe für mehrere: dasselbe Blatt wie für eine Person. Unten
          stehen die Ausgewählten (antippen = abwählen). */}
      <MithilfeBlatt
        open={punkteOffen}
        onClose={() => setPunkteOffen(false)}
        fuer={`${ausgewaehlt.length} Person${ausgewaehlt.length === 1 ? "" : "en"}`}
        knopf={`Für ${ausgewaehlt.length} eintragen`}
        zusatz={
          <div className="mt-4">
            <div className="mb-1.5 px-4 text-[13px] font-semibold uppercase tracking-[0.02em] text-tinte-leise">Wer war dabei?</div>
            <div className="rounded-2xl zelle p-3">{namen}</div>
            <p className="mt-1.5 px-4 text-[12px] text-tinte-leise">Antippen zum Abwählen. Alle bekommen eine Mitteilung.</p>
          </div>
        }
        onEintragen={(titel, p, datum) => {
          if (!ausgewaehlt.length) return;
          addContributionMany(
            ausgewaehlt.map((x) => x.id),
            titel,
            p,
            datum,
          );
          onDone();
        }}
      />
    </div>
    </div>
  );
}
