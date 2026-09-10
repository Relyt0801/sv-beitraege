import { useState } from "react";
import type { Contribution, Settings, Student } from "../lib/types";
import { useStore } from "../store";
import { Sheet } from "./Sheet";
import { PunkteBar } from "./PunkteBar";

/**
 * Liste der gesammelten Beiträge einer Person.
 * - Schüler: nur ansehen
 * - Stufenteam/Kassenwart/Admin (editable): Wert ändern, löschen, hinzufügen
 */
export function PunkteSheet({
  student,
  settings,
  editable,
  open,
  onClose,
}: {
  student: Student | null;
  settings: Settings;
  editable: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const { contributions, addContribution, updateContribution, removeContribution } = useStore();
  const [addOpen, setAddOpen] = useState(false);
  const [titel, setTitel] = useState("");
  const [punkte, setPunkte] = useState("5");

  if (!student) return null;
  const list = contributions
    .filter((c) => c.student_id === student.id)
    .sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0));
  const summe = list.reduce((n, c) => n + c.punkte, 0);
  const fehlt = Math.max(0, settings.ziel_punkte - summe);

  function speichern() {
    if (!titel.trim()) return;
    addContribution(student!.id, titel, Number(punkte) || 0);
    setTitel("");
    setPunkte("5");
    setAddOpen(false);
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="mb-4 flex items-start gap-3">
        <div className="flex-1">
          <div className="text-xl font-bold leading-tight">Beitragspunkte</div>
          <div className="text-sm text-slate-500">
            {student.vorname} {student.nachname}
          </div>
        </div>
        <button className="iconbtn" onClick={onClose} aria-label="Schließen">
          ✕
        </button>
      </div>

      <div className="mb-4 rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/70">
        <PunkteBar punkte={summe} settings={settings} />
        <p className="mt-3 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
          {fehlt > 0 ? (
            <>
              Es fehlen noch <b>{fehlt} Punkte</b>. Wer die {settings.ziel_punkte} Punkte bis zum Ende
              nicht erreicht, zahlt einmalig <b>{settings.zusatz} € Zusatzbeitrag</b>.
            </>
          ) : (
            <>Ziel erreicht — es fällt <b>kein Zusatzbeitrag</b> an. 🎉</>
          )}
        </p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400 dark:border-slate-700">
          Noch nichts eingetragen.
          <br />
          Hilf bei einer Aktion mit – dann erscheint sie hier.
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
          {list.map((c) => (
            <Zeile
              key={c.id}
              c={c}
              editable={editable}
              onChange={(patch) => updateContribution(c.id, patch)}
              onDelete={() => {
                if (confirm(`„${c.titel}" wirklich löschen?`)) removeContribution(c.id);
              }}
            />
          ))}
        </ul>
      )}

      {editable && (
        <div className="mt-4">
          {addOpen ? (
            <div className="rounded-2xl border border-brand/40 bg-brand/5 p-3">
              <input
                className="field mb-2"
                autoFocus
                placeholder="Wofür? z. B. Kuchen gebacken"
                value={titel}
                onChange={(e) => setTitel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && speichern()}
              />
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-500">Punkte</label>
                <input
                  type="number"
                  min={0}
                  className="w-20 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-center dark:border-slate-700 dark:bg-slate-800"
                  value={punkte}
                  onChange={(e) => setPunkte(e.target.value)}
                />
                <button
                  onClick={() => setAddOpen(false)}
                  className="ml-auto rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 dark:border-slate-700"
                >
                  Abbrechen
                </button>
                <button
                  onClick={speichern}
                  disabled={!titel.trim()}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                >
                  Eintragen
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddOpen(true)}
              className="w-full rounded-2xl border border-dashed border-brand/50 py-3 text-sm font-bold text-brand transition active:scale-[.99]"
            >
              ＋ Beitrag eintragen
            </button>
          )}
        </div>
      )}

      <button className="btn-primary mt-5" onClick={onClose}>
        Fertig
      </button>
    </Sheet>
  );
}

function Zeile({
  c,
  editable,
  onChange,
  onDelete,
}: {
  c: Contribution;
  editable: boolean;
  onChange: (patch: Partial<Pick<Contribution, "titel" | "punkte">>) => void;
  onDelete: () => void;
}) {
  const [edit, setEdit] = useState(false);
  const [titel, setTitel] = useState(c.titel);
  const [punkte, setPunkte] = useState(String(c.punkte));
  const datum = c.datum ? new Date(c.datum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "";

  if (edit)
    return (
      <li className="bg-brand/5 p-3">
        <input className="field mb-2" value={titel} onChange={(e) => setTitel(e.target.value)} autoFocus />
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            className="w-20 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-center dark:border-slate-700 dark:bg-slate-800"
            value={punkte}
            onChange={(e) => setPunkte(e.target.value)}
          />
          <button onClick={onDelete} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-bold text-red-500">
            Löschen
          </button>
          <button
            onClick={() => setEdit(false)}
            className="ml-auto rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 dark:border-slate-700"
          >
            Abbrechen
          </button>
          <button
            onClick={() => {
              onChange({ titel: titel.trim() || c.titel, punkte: Number(punkte) || 0 });
              setEdit(false);
            }}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white"
          >
            Speichern
          </button>
        </div>
      </li>
    );

  return (
    <li className="flex items-center gap-3 bg-white px-3.5 py-3 dark:bg-slate-900">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{c.titel}</div>
        {datum && <div className="text-[11px] text-slate-400">{datum}</div>}
      </div>
      <span className="shrink-0 rounded-full bg-brand/12 px-2.5 py-1 text-sm font-extrabold text-brand">
        +{c.punkte}
      </span>
      {editable && (
        <button onClick={() => setEdit(true)} className="shrink-0 text-slate-400" aria-label="Bearbeiten">
          ✎
        </button>
      )}
    </li>
  );
}
