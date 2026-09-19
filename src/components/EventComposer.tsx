import { useMemo, useState } from "react";
import { Sheet } from "./Sheet";
import { useStore } from "../store";
import { useRole } from "../auth/RoleProvider";
import { COMMITTEES, committeeIcon } from "../lib/committees";
import { useEvents } from "../events-store";
import { normalize, offenGesamt, sortStudents } from "../lib/logic";
import { TYPE_META, type EventType } from "../lib/events";

export function EventComposer({
  open,
  onClose,
  onVorlagen,
}: {
  open: boolean;
  onClose: () => void;
  /** Wechsel zum Ausschreiben einer Aktion (Waffelverkauf & Co.). */
  onVorlagen?: () => void;
}) {
  const { students, settings, punkte } = useStore();
  const { canEditBeitrag } = useRole();
  const { createEvent } = useEvents();

  const [type, setType] = useState<EventType>("info");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isWarning, setIsWarning] = useState(false);
  const [audience, setAudience] = useState<"all" | "selected" | "komitee">("all");
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [minOne, setMinOne] = useState(true);
  const [showResults, setShowResults] = useState(true);
  const [anon, setAnon] = useState(true);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    const n = normalize(q);
    return sortStudents(students).filter((s) => !n || normalize(`${s.nachname} ${s.vorname}`).includes(n));
  }, [students, q]);

  function reset() {
    setType("info"); setTitle(""); setBody(""); setIsWarning(false);
    setAudience("all"); setTargets(new Set()); setTags(new Set()); setQ("");
    setOptions(["", ""]); setMultiple(false); setMinOne(true); setShowResults(true); setAnon(true);
  }

  function selectUnpaid() {
    const ids = students.filter((s) => offenGesamt(s, settings, punkte[s.id] || 0) > 0).map((s) => s.id);
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
      tags: audience === "komitee" ? [...tags] : [],
      poll_multiple: multiple,
      poll_min_one: minOne,
      poll_show_results: showResults,
      poll_anon: anon,
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

      {/* Typ – Vorlagen stehen gleichberechtigt daneben, fuehren aber in ein
          eigenes Fenster: eine Aktion hat Schichten statt Antwortmoeglichkeiten. */}
      <div className="mb-4 grid grid-cols-2 gap-1.5 rounded-xl bg-papier-matt p-1 dark:bg-slate-800 sm:grid-cols-4">
        {(Object.keys(TYPE_META) as EventType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`${seg} ${type === t ? "bg-brand text-white" : "text-tinte-matt"}`}
          >
            {TYPE_META[t].icon} {TYPE_META[t].label}
          </button>
        ))}
        {onVorlagen && (
          <button onClick={onVorlagen} className={`${seg} text-tinte-matt`}>
            🧇 Vorlagen
          </button>
        )}
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
        <div className="mb-4 rounded-2xl border border-papier-linie p-3 dark:border-slate-700">
          <div className="mb-2 text-sm font-semibold text-tinte-matt">Antwortoptionen</div>
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
                  className="rounded-lg border border-papier-linie px-3 dark:border-slate-700"
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
            <Toggle label="Anonym abstimmen" on={anon} set={setAnon} />
            <p className="text-[11px] leading-snug text-tinte-leise">
              Anonym: unter den Antworten stehen graue Kreise statt der Initialen. Wer wie gestimmt hat, sieht nur das Stufenteam.
            </p>
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
      <div className="mb-2 text-sm font-semibold text-tinte-matt">Empfänger</div>
      <div className="mb-2 flex gap-1.5 rounded-xl bg-papier-matt p-1 dark:bg-slate-800">
        <button onClick={() => setAudience("all")} className={`${seg} ${audience === "all" ? "bg-brand text-white" : "text-tinte-matt"}`}>
          Alle
        </button>
        <button onClick={() => setAudience("komitee")} className={`${seg} ${audience === "komitee" ? "bg-brand text-white" : "text-tinte-matt"}`}>
          Komitees
        </button>
        <button onClick={() => setAudience("selected")} className={`${seg} ${audience === "selected" ? "bg-brand text-white" : "text-tinte-matt"}`}>
          Personen
        </button>
      </div>

      {audience === "komitee" && (
        <div className="mb-3 grid gap-1.5 rounded-2xl border border-papier-linie p-2 dark:border-slate-700 sm:grid-cols-2">
          {COMMITTEES.map((c) => {
            const on = tags.has(c.slug);
            return (
              <button
                key={c.slug}
                onClick={() =>
                  setTags((prev) => {
                    const n = new Set(prev);
                    on ? n.delete(c.slug) : n.add(c.slug);
                    return n;
                  })
                }
                className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold transition ${
                  on ? "bg-brand/10 text-brand" : "hover:bg-papier-matt dark:hover:bg-slate-800"
                }`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded border text-xs text-white ${on ? "border-brand bg-brand" : "border-papier-linie dark:border-slate-600"}`}>
                  {on ? "✓" : ""}
                </span>
                <span>{committeeIcon(c.slug)}</span>
                {c.label}
              </button>
            );
          })}
          <div className="px-2 pt-1 text-xs text-tinte-leise sm:col-span-2">
            {tags.size === 0 ? "Noch kein Komitee gewählt" : `${tags.size} Komitee(s) – alle Mitglieder sehen den Beitrag`}
          </div>
        </div>
      )}
      {type === "nachricht" && canEditBeitrag && (
        <button onClick={selectUnpaid} className="mb-2 text-sm font-semibold text-brand">
          → alle mit offenem Beitrag (bis {settings.aktuelles_halbjahr}) auswählen
        </button>
      )}
      {audience === "selected" && (
        <div className="mb-3 rounded-2xl border border-papier-linie p-2 dark:border-slate-700">
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
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-papier-matt dark:hover:bg-slate-800"
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded border text-xs text-white ${on ? "border-brand bg-brand" : "border-papier-linie dark:border-slate-600"}`}>
                    {on ? "✓" : ""}
                  </span>
                  {s.nachname}, {s.vorname}
                </button>
              );
            })}
          </div>
          <div className="px-2 pt-1 text-xs text-tinte-leise">{targets.size} ausgewählt</div>
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
      <span className="text-tinte-matt dark:text-slate-300">{label}</span>
      <span className={`relative h-6 w-11 rounded-full transition ${on ? "bg-brand" : "bg-slate-300 dark:bg-slate-600"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}
