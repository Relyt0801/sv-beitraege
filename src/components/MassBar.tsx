import { useState } from "react";
import { HY, type Halbjahr } from "../lib/types";
import { useStore } from "../store";

export function MassBar({ selected, onDone }: { selected: Set<string>; onDone: () => void }) {
  const { massApply, templates, addContributionMany } = useStore();
  const [h, setH] = useState<Halbjahr>("EF.1");
  const [punkteOffen, setPunkteOffen] = useState(false);
  const [titel, setTitel] = useState("");
  const [punkte, setPunkte] = useState("5");

  const btn = "rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
  const disabled = selected.size === 0;

  if (punkteOffen)
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3.5 py-2.5 pb-[calc(env(safe-area-inset-bottom)+0.6rem)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mb-2 text-sm font-bold">
          Beitrag für {selected.size} Person{selected.size === 1 ? "" : "en"}
        </div>
        {templates.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTitel(t.titel);
                  setPunkte(String(t.punkte));
                }}
                className="rounded-full border border-brand/40 px-2.5 py-1 text-[13px] font-semibold text-brand"
              >
                {t.titel} <span className="opacity-60">+{t.punkte}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            className="field flex-1 py-2"
            placeholder="Wofür? z. B. Standdienst"
            value={titel}
            onChange={(e) => setTitel(e.target.value)}
          />
          <input
            type="number"
            min={0}
            className="w-16 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center dark:border-slate-700 dark:bg-slate-800"
            value={punkte}
            onChange={(e) => setPunkte(e.target.value)}
          />
          <button
            onClick={() => setPunkteOffen(false)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 dark:border-slate-700"
          >
            Zurück
          </button>
          <button
            disabled={!titel.trim() || selected.size === 0}
            onClick={() => {
              addContributionMany([...selected], titel, Number(punkte) || 0);
              setTitel("");
              setPunkteOffen(false);
              onDone();
            }}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Eintragen
          </button>
        </div>
      </div>
    );

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
      <button disabled={disabled} className={btn} onClick={() => setPunkteOffen(true)}>
        ＋ Beitragspunkte
      </button>
      <button className="rounded-xl bg-brand px-3 py-2 text-sm font-bold text-white" onClick={onDone}>
        Fertig
      </button>
    </div>
  );
}
