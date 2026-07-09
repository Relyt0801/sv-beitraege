import { useMemo, useState } from "react";
import { Sheet } from "./Sheet";
import { useStore } from "../store";
import { useRole } from "../auth/RoleProvider";
import { useEvents } from "../events-store";
import { normalize, offenGesamt, sortStudents } from "../lib/logic";
import { TYPE_META, type EventType } from "../lib/events";

export function EventComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { students, settings } = useStore();
  const { canEditBeitrag } = useRole();
  const { createEvent } = useEvents();

  const [type, setType] = useState<EventType>("info");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isWarning, setIsWarning] = useState(false);
  const [audience, setAudience] = useState<"all" | "selected">("all");
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [minOne, setMinOne] = useState(true);
  const [showResults, setShowResults] = useState(true);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    const n = normalize(q);
    return sortStudents(students).filter((s) => !n || normalize(`${s.nachname} ${s.vorname}`).includes(n));
  }, [students, q]);

  function reset() {
    setType("info"); setTitle(""); setBody(""); setIsWarning(false);
    setAudience("all"); setTargets(new Set()); setQ("");
    setOptions(["", ""]); setMultiple(false); setMinOne(true); setShowResults(true);
  }

  function selectUnpaid() {
    const ids = students.filter((s) => offenGesamt(s, settings) > 0).map((s) => s.id);
    setAudience("selected");
    setTargets(new Set(ids));
  }

  async function submit() {
    if (!title.trim()) return;
    setBusy(true);
    await createEvent({
      type,
      title: title.trim(),
      body: body.trim(),
      is_warning: type === "nachricht" && isWarning,
      audience,
      target_ids: audience === "selected" ? [...targets] : [],
      poll_multiple: multiple,
      poll_min_one: minOne,
      poll_show_results: showResults,
      options: type === "umfrage" ? options.map((o) => o.trim()).filter(Boolean) : [],
    });
    setBusy(false);
    reset();
    onClose();
  }

  const seg = "flex-1 rounded-lg py-2 text-sm font-bold transition";

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex-1 text-xl font-bold">Neu erstellen</span>
        <button className="iconbtn" onClick={onClose} aria-label="Schließen">✕</button>
      </div>

      {/* Typ */}
      <div className="mb-4 flex gap-1.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {(Object.keys(TYPE_META) as EventType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`${seg} ${type === t ? "bg-brand text-white" : "text-slate-500"}`}
          >
            {TYPE_META[t].icon} {TYPE_META[t].label}
          </button>
        ))}
      </div>

      <input className="field mb-3" placeholder="Überschrift" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea
        className="field mb-3 min-h-[90px] resize-y"
        placeholder={type === "umfrage" ? "Frage / Beschreibung (optional)" : "Text"}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />

      {/* Abstimmung */}
      {type === "umfrage" && (
        <div className="mb-4 rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
          <div className="mb-2 text-sm font-semibold text-slate-500">Antwortoptionen</div>
          {options.map((o, i) => (
            <div key={i} className="mb-2 flex gap-2">
              <input
                className="field"
                placeholder={`Option ${i + 1}`}
                value={o}
                onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
              />
              {options.length > 2 && (
                <button
                  onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                  className="rounded-lg border border-slate-200 px-3 dark:border-slate-700"
                >
                  −
                </button>
              )}
            </div>
          ))}
          <button onClick={() => setOptions((prev) => [...prev, ""])} className="text-sm font-semibold text-brand">
            + Option
          </button>
          <div className="mt-3 flex flex-col gap-2">
            <Toggle label="Mehrere Antworten erlaubt" on={multiple} set={setMultiple} />
            <Toggle label="Antwort ist Pflicht" on={minOne} set={setMinOne} />
            <Toggle label="Schüler sehen Ergebnisse" on={showResults} set={setShowResults} />
          </div>
        </div>
      )}

      {/* Warnung (nur Kassenwart/Admin) */}
      {type === "nachricht" && canEditBeitrag && (
        <div className="mb-3">
          <Toggle label="Als Warnung markieren (rot)" on={isWarning} set={setIsWarning} />
        </div>
      )}

      {/* Empfänger */}
      <div className="mb-2 text-sm font-semibold text-slate-500">Empfänger</div>
      <div className="mb-2 flex gap-1.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        <button onClick={() => setAudience("all")} className={`${seg} ${audience === "all" ? "bg-brand text-white" : "text-slate-500"}`}>
          Alle
        </button>
        <button onClick={() => setAudience("selected")} className={`${seg} ${audience === "selected" ? "bg-brand text-white" : "text-slate-500"}`}>
          Auswahl
        </button>
      </div>
      {type === "nachricht" && canEditBeitrag && (
        <button onClick={selectUnpaid} className="mb-2 text-sm font-semibold text-brand">
          → alle mit offenem Beitrag (bis {settings.aktuelles_halbjahr}) auswählen
        </button>
      )}
      {audience === "selected" && (
        <div className="mb-3 rounded-2xl border border-slate-200 p-2 dark:border-slate-700">
          <input className="field mb-2" placeholder="Person suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-48 overflow-y-auto">
            {list.map((s) => {
              const on = targets.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() =>
                    setTargets((prev) => {
                      const n = new Set(prev);
                      on ? n.delete(s.id) : n.add(s.id);
                      return n;
                    })
                  }
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded border text-xs text-white ${on ? "border-brand bg-brand" : "border-slate-300 dark:border-slate-600"}`}>
                    {on ? "✓" : ""}
                  </span>
                  {s.nachname}, {s.vorname}
                </button>
              );
            })}
          </div>
          <div className="px-2 pt-1 text-xs text-slate-400">{targets.size} ausgewählt</div>
        </div>
      )}

      <button className="btn-primary mt-2" disabled={busy || !title.trim()} onClick={submit}>
        {busy ? "…" : "Veröffentlichen"}
      </button>
    </Sheet>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button onClick={() => set(!on)} className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <span className={`relative h-6 w-11 rounded-full transition ${on ? "bg-brand" : "bg-slate-300 dark:bg-slate-600"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}
