import { useState } from "react";
import { HY, type Halbjahr } from "../lib/types";
import { useStore } from "../store";

export function MassBar({ selected, onDone }: { selected: Set<string>; onDone: () => void }) {
  const { massApply } = useStore();
  const [h, setH] = useState<Halbjahr>("EF.1");

  const btn = "rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
  const disabled = selected.size === 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white/95 px-3.5 py-2.5 pb-[calc(env(safe-area-inset-bottom)+0.6rem)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <span className="mr-auto text-sm font-bold">{selected.size} ausgewählt</span>
      <select
        className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-800"
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
      <button disabled={disabled} className={btn} onClick={() => massApply(selected, h, "bet")}>
        +1 Beteiligung
      </button>
      <button className="rounded-xl bg-brand px-3 py-2 text-sm font-bold text-white" onClick={onDone}>
        Fertig
      </button>
    </div>
  );
}
