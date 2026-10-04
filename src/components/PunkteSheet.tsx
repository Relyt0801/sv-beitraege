import { useState } from "react";
import type { Contribution, Settings, Student } from "../lib/types";
import { useStore } from "../store";
import { Sheet } from "./Sheet";
import { PunkteBar, StaffelTabelle } from "./PunkteBar";
import { prozentVon } from "../lib/logic";
import { AbiTicket } from "./AbiTicket";
import { MithilfeBlatt } from "./MithilfeBlatt";
import { useProfiles } from "../profiles-store";

import { frage } from "../lib/melder";
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
  const { profile } = useProfiles();

  if (!student) return null;
  const list = contributions
    .filter((c) => c.student_id === student.id)
    .sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0));
  const summe = list.reduce((n, c) => n + c.punkte, 0);
  const pct = prozentVon(summe, settings);


  return (
    <Sheet open={open} onClose={onClose}>
      <div className="mb-4 flex items-start gap-3">
        <div className="flex-1">
          <div className="text-xl font-bold leading-tight">Gesammelte Prozent</div>
          <div className="text-sm text-tinte-matt">
            {student.vorname} {student.nachname}
          </div>
        </div>
        <button className="iconbtn" onClick={onClose} aria-label="Schließen">
          ✕
        </button>
      </div>

      <div className="mb-4 rounded-2xl bg-papier-matt p-4 dark:bg-slate-800/70">
        <PunkteBar punkte={summe} settings={settings} />
        <div className="mt-3">
          <StaffelTabelle settings={settings} pct={pct} />
        </div>
        <div className="mt-3 grid gap-2">
          <AbiTicket art="erstes" student={student} settings={settings} prozent={pct} klein />
        </div>
      </div>

      {editable && (
        <div className="mt-4">
          <MithilfeEintragen fuer={`${student.vorname} ${student.nachname}`} onEintragen={(titel, p, tag) => addContribution(student.id, titel, p, tag)} />
        </div>
      )}

      <h3 className="mb-2 mt-5 text-[13px] font-semibold text-tinte-matt">Zuletzt eingetragen</h3>
      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-papier-linie py-10 text-center text-sm text-tinte-leise dark:border-slate-700">
          Noch nichts eingetragen.
        </div>
      ) : (
        <ul className="divide-y divide-papier-linie overflow-hidden rounded-2xl border border-papier-linie dark:divide-slate-700 dark:border-slate-700">
          {list.map((c) => (
            <Zeile
              key={c.id}
              c={c}
              editable={editable}
              // Fürs Team: wer hat das eingetragen? Steht bei Einträgen, seit die
              // Datenbank das mitschreibt (supabase/mithilfe-nachvollziehen.sql).
              von={editable && c.created_by ? profile[c.created_by]?.anzeigename || "Unbekannt" : ""}
              onChange={(patch) => updateContribution(c.id, patch)}
              onDelete={async () => {
                if (await frage(`„${c.titel}" wirklich löschen?`, "Löschen", true)) removeContribution(c.id);
              }}
            />
          ))}
        </ul>
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
  von,
  onChange,
  onDelete,
}: {
  c: Contribution;
  editable: boolean;
  von: string;
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
            className="w-20 rounded-lg border border-papier-linie bg-white px-2.5 py-2 text-center dark:border-slate-700 dark:bg-slate-800"
            value={punkte}
            onChange={(e) => setPunkte(e.target.value)}
          />
          <button onClick={onDelete} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-bold text-red-500">
            Löschen
          </button>
          <button
            onClick={() => setEdit(false)}
            className="ml-auto rounded-lg border border-papier-linie px-3 py-2 text-sm font-semibold text-tinte-matt dark:border-slate-700"
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
        {(datum || von) && (
          <div className="truncate text-[11px] text-tinte-leise">{[datum, von && `von ${von}`].filter(Boolean).join(" · ")}</div>
        )}
      </div>
      <span className="shrink-0 rounded-full bg-brand/12 px-2.5 py-1 text-sm font-extrabold text-brand">
        +{c.punkte}
      </span>
      {editable && (
        <button onClick={() => setEdit(true)} className="shrink-0 text-tinte-leise" aria-label="Bearbeiten">
          ✎
        </button>
      )}
    </li>
  );
}

/**
 * Knopf „Mithilfe eintragen“ – öffnet das Blatt wie eine Rechnung, in dem man
 * erst die Aktion auswählt (siehe MithilfeBlatt).
 */
export function MithilfeEintragen({
  onEintragen,
  fuer,
}: {
  onEintragen: (titel: string, punkte: number, datum: string) => void;
  fuer: string;
}) {
  const [auf, setAuf] = useState(false);
  return (
    <>
      <button
        onClick={() => setAuf(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3 text-[15px] font-bold text-white transition active:scale-[.98]"
      >
        <span aria-hidden className="text-lg leading-none">＋</span> Mithilfe eintragen
      </button>
      <MithilfeBlatt open={auf} onClose={() => setAuf(false)} fuer={fuer} onEintragen={onEintragen} />
    </>
  );
}
