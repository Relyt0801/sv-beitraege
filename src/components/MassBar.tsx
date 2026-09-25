import { useMemo, useState } from "react";
import { HY, type Halbjahr } from "../lib/types";
import { useStore } from "../store";
import { useRole } from "../auth/RoleProvider";
import { sortStudents } from "../lib/logic";

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
  const { massApply, templates, addContributionMany, students } = useStore();
  const { canEditHilfen } = useRole();
  const [h, setH] = useState<Halbjahr>("EF.1");
  const [punkteOffen, setPunkteOffen] = useState(false);
  const [titel, setTitel] = useState("");
  const [punkte, setPunkte] = useState("5");

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

  if (punkteOffen)
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-papier-linie bg-white/95 px-3.5 py-2.5 pb-[calc(env(safe-area-inset-bottom)+0.6rem)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mb-1 text-sm font-bold">
          Mithilfe für {ausgewaehlt.length} Person{ausgewaehlt.length === 1 ? "" : "en"}
        </div>
        <p className="mb-1.5 text-[11px] text-tinte-leise">
          Alle hier bekommen sofort eine Mitteilung. Wer nicht dabei war: antippen zum Abwählen.
        </p>
        <div className="mb-2">{namen}</div>
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
            className="field min-w-0 flex-1 py-2"
            placeholder="Wofür? z. B. Standdienst"
            value={titel}
            onChange={(e) => setTitel(e.target.value)}
          />
          <input
            type="number"
            min={0}
            className="w-16 rounded-xl border border-papier-linie bg-papier-matt px-2 py-2 text-center dark:border-slate-700 dark:bg-slate-800"
            value={punkte}
            onChange={(e) => setPunkte(e.target.value)}
          />
          <button
            onClick={() => setPunkteOffen(false)}
            className="rounded-xl border border-papier-linie px-3 py-2 text-sm font-semibold text-tinte-matt dark:border-slate-700"
          >
            Zurück
          </button>
          <button
            disabled={!titel.trim() || disabled}
            onClick={() => {
              addContributionMany(
                ausgewaehlt.map((s) => s.id),
                titel,
                Number(punkte) || 0,
              );
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
    </div>
  );
}
