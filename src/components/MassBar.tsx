import { useMemo, useState } from "react";
import { HY, type Halbjahr } from "../lib/types";
import { useStore } from "../store";
import { useRole } from "../auth/RoleProvider";
import { sortStudents } from "../lib/logic";
import { MithilfeBlatt } from "./MithilfeBlatt";

/**
 * Leiste im Auswahl-Modus der Kasse.
 *
 * Oben stehen immer die Namen aller Ausgewählten – auch derer, die Suche oder
 * Filter gerade ausblenden. Vorher stand hier nur „5 ausgewählt“: Im
 * Auswahl-Modus wählt ein Tipp irgendwo auf eine Zeile die Person aus, und
 * eine Auswahl aus einer früheren Suche bleibt stehen. So bekam jemand
 * Mithilfe samt „Danke fürs Mithelfen“-Mitteilung, ohne irgendwo
 * eingetragen zu sein – und niemand sah es vor dem Tippen.
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

  const btn = "rounded-xl border border-papier-linie bg-papier-matt px-3 py-2 text-sm font-bold text-tinte disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
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
          <span className="shrink-0 text-tinte-leise">✕</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center gap-2 border-t border-papier-linie bg-white/95 px-3.5 py-2.5 pb-[calc(env(safe-area-inset-bottom)+0.6rem)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      {namen}
      <span className="mr-auto text-sm font-bold">{ausgewaehlt.length} ausgewählt</span>
      <select
        className="rounded-xl border border-papier-linie bg-papier-matt px-2.5 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-800"
        value={h}
        onChange={(e) => setH(e.target.value as Halbjahr)}
      >
        {HY.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <button disabled={disabled} className={btn} onClick={() => massApply(selected, h, "bezahlt")}>
        ✓ bezahlt
      </button>
      <button disabled={disabled} className={btn} onClick={() => massApply(selected, h, "erlassen")}>
        ~ erlassen
      </button>
      <button disabled={disabled} className={btn} onClick={() => massApply(selected, h, "offen")}>
        offen
      </button>
      {canEditHilfen && (
        <button disabled={disabled} className={btn} onClick={() => setPunkteOffen(true)}>
          ＋ Mithilfe
        </button>
      )}
      <button className="rounded-xl bg-brand px-3 py-2 text-sm font-bold text-white" onClick={onDone}>
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
            <div className="mb-1.5 px-4 text-[12px] font-semibold uppercase tracking-[0.04em] text-tinte-leise">Wer war dabei?</div>
            <div className="rounded-2xl bg-[rgb(118_118_128/0.08)] p-3 dark:bg-[rgb(118_118_128/0.18)]">{namen}</div>
            <p className="mt-1.5 px-4 text-[11.5px] text-tinte-leise">Antippen zum Abwählen. Alle bekommen eine Mitteilung.</p>
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
  );
}
