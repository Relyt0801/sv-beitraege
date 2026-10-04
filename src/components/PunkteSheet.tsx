import { useState } from "react";
import type { Contribution, Settings, Student } from "../lib/types";
import { useStore } from "../store";
import { Sheet } from "./Sheet";
import { prozentVon, ticketPreise } from "../lib/logic";
import { StaffelKacheln } from "./Staffel";
import { Gruppe, KopfBild, RechnungKopf } from "./Liste";
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


  const ticket = ticketPreise(pct, settings);

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="mx-auto max-w-md">
        <RechnungKopf
          bild={<KopfBild text="🙌" />}
          oben={`${student.vorname} ${student.nachname}`}
          wert={`${pct} %`}
          wertKlasse={pct > 100 ? "text-[#9A7410] dark:text-[#E9C460]" : pct >= 100 ? "text-bezahlt dark:text-emerald-300" : "text-brand"}
          titel="mitgeholfen"
          unter={ticket.preisSteht ? `1. Abiball-Ticket ${ticket.erstes} €` : `Zuschlag aufs 1. Ticket ${ticket.aufschlag - ticket.rabatt} €`}
          onClose={onClose}
        />

        <StaffelKacheln pct={pct} settings={settings} />

        {editable && (
          <div className="mt-4">
            <MithilfeEintragen
              fuer={`${student.vorname} ${student.nachname}`}
              onEintragen={(titel, p, tag) => addContribution(student.id, titel, p, tag)}
            />
          </div>
        )}

        <Gruppe titel="Eingetragen" fuss={editable && list.length > 0 ? "Antippen zum Ändern oder Löschen" : undefined}>
          {list.length === 0 ? (
            <div className="px-4 py-5 text-center text-[13.5px] text-tinte-leise">Noch nichts eingetragen.</div>
          ) : (
            list.map((c) => (
              <EintragZeile
                key={c.id}
                c={c}
                editable={editable}
                // Fürs Team: wer hat das eingetragen? (supabase/mithilfe-nachvollziehen.sql)
                von={editable && c.created_by ? profile[c.created_by]?.anzeigename || "Unbekannt" : ""}
                onChange={(patch) => updateContribution(c.id, patch)}
                onDelete={async () => {
                  if (await frage(`„${c.titel}" wirklich löschen?`, "Löschen", true)) removeContribution(c.id);
                }}
              />
            ))
          )}
        </Gruppe>
      </div>
    </Sheet>
  );
}

function EintragZeile({
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
      <div className="grid gap-2 px-4 py-3">
        <input
          className="w-full rounded-lg bg-white px-3 py-2 text-[15px] outline-none dark:bg-slate-800"
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
          autoFocus
          aria-label="Wofür"
        />
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              inputMode="numeric"
              aria-label="Prozent"
              className="w-16 rounded-lg bg-white px-2 py-2 text-right text-[15px] font-bold text-brand outline-none dark:bg-slate-800"
              value={punkte}
              onChange={(e) => setPunkte(e.target.value)}
            />
            <span className="text-[15px] font-bold text-brand">%</span>
          </span>
          <button onClick={onDelete} className="px-2 py-2 text-[14px] font-semibold text-red-600 dark:text-red-400">
            Löschen
          </button>
          <button onClick={() => setEdit(false)} className="ml-auto px-2 py-2 text-[14px] font-semibold text-tinte-matt dark:text-slate-300">
            Abbrechen
          </button>
          <button
            onClick={() => {
              onChange({ titel: titel.trim() || c.titel, punkte: Number(punkte) || 0 });
              setEdit(false);
            }}
            className="rounded-full bg-brand px-4 py-2 text-[14px] font-bold text-white"
          >
            Sichern
          </button>
        </div>
      </div>
    );

  const Tag = editable ? "button" : "div";
  return (
    <Tag
      onClick={editable ? () => setEdit(true) : undefined}
      className={`flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left ${editable ? "transition active:bg-black/[0.04] dark:active:bg-white/[0.06]" : ""}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px]">{c.titel}</span>
        {(datum || von) && (
          <span className="block truncate text-[12px] text-tinte-leise">{[datum, von && `von ${von}`].filter(Boolean).join(" · ")}</span>
        )}
      </span>
      <span className="zahl shrink-0 text-[15px] font-bold text-brand">+{c.punkte} %</span>
    </Tag>
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
