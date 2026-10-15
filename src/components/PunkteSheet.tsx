import { useState } from "react";
import type { Contribution, Settings, Student } from "../lib/types";
import { useStore } from "../store";
import { Sheet, SheetKopf } from "./Sheet";
import { prozentVon, ticketPreise } from "../lib/logic";
import { StaffelKacheln } from "./Staffel";
import { Gruppe, Wert, Zeile } from "./Liste";
import { Icon } from "./Icon";
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
      <div>
        <SheetKopf
          titel={`${student.vorname} ${student.nachname}`}
          unter="Mithilfe und Ticketpreis"
          onClose={onClose}
        />

        <Gruppe>
          <Zeile label="Mitgeholfen">
            <Wert stark>{pct} %</Wert>
          </Zeile>
          <Zeile label={ticket.preisSteht ? "1. Abiball-Ticket" : "Aufschlag aufs 1. Ticket"}>
            <Wert>{ticket.preisSteht ? `${ticket.erstes} €` : `${ticket.aufschlag - ticket.rabatt} €`}</Wert>
          </Zeile>
        </Gruppe>

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
        <input className="field" value={titel} onChange={(e) => setTitel(e.target.value)} autoFocus aria-label="Wofür" />
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            inputMode="numeric"
            aria-label="Prozent"
            className="field !w-20 text-right font-bold"
            value={punkte}
            onChange={(e) => setPunkte(e.target.value)}
          />
          <span className="text-[15px] font-bold text-brand">%</span>
          <button type="button" onClick={onDelete} className="btn-klein-grau !text-red-600 dark:!text-red-400">
            Löschen
          </button>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEdit(false)} className="btn-grau flex-1">
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => {
              onChange({ titel: titel.trim() || c.titel, punkte: Number(punkte) || 0 });
              setEdit(false);
            }}
            className="btn-primary flex-1"
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
        className="btn-primary gap-2"
      >
        <Icon name="plus" size={18} /> Mithilfe eintragen
      </button>
      <MithilfeBlatt open={auf} onClose={() => setAuf(false)} fuer={fuer} onEintragen={onEintragen} />
    </>
  );
}
