import { memo } from "react";
import { HY, STATI, type Settings, type Student } from "../lib/types";
import { offenGesamt, prozentVon } from "../lib/logic";
import { TermChip } from "./TermChip";
import { Avatar } from "./Avatar";

/**
 * Eine Person in der Kassenliste – eine Zeile, die man am Stueck liest:
 * Name, offener Betrag, die sechs Halbjahre, Mithilfe. Vorher war jede Person
 * eine eigene Karte; bei 130 Leuten wurde daraus eine sehr lange Kachelwand,
 * in der man nichts vergleichen konnte.
 */
function StudentCardRoh({
  student,
  settings,
  punkte,
  anchor,
  selectable,
  selected,
  canToggleBeitrag,
  loginState,
  userId,
  onOpen,
  onToggleSelect,
  onToggleTerm,
}: {
  student: Student;
  settings: Settings;
  punkte: number;
  /** optionaler Anker für die Einführung */
  anchor?: string;
  selectable: boolean;
  selected: boolean;
  canToggleBeitrag: boolean;
  loginState?: boolean | null;
  /** Konto der Person – faerbt den Namenskreis wie im Rollen-Reiter. */
  userId?: string | null;
  onOpen: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onToggleTerm: (id: string, h: (typeof HY)[number]) => void;
}) {
  const leaving = student.verlaesst_ab != null;
  const joiningLate = student.beigetreten_ab !== "EF.1";
  const betrag = offenGesamt(student, settings);
  const prozent = prozentVon(punkte, settings);

  return (
    <div
      data-tour={anchor}
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3 transition sm:px-4 ${
        selected ? "bg-brand/5 ring-2 ring-inset ring-brand" : ""
      } ${leaving ? "bg-red-50/60 dark:bg-red-500/5" : ""}`}
    >
      {selectable && (
        <button
          onClick={() => onToggleSelect(student.id)}
          aria-label="Auswählen"
          className={`flex h-6 w-6 min-w-6 shrink-0 items-center justify-center rounded-lg border-2 text-sm text-white transition ${
            selected ? "border-brand bg-brand" : "border-papier-linie dark:border-slate-600"
          }`}
        >
          {selected ? "✓" : ""}
        </button>
      )}

      {/* Person */}
      <button
        onClick={() => (selectable ? onToggleSelect(student.id) : onOpen(student.id))}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left sm:basis-[13rem]"
      >
        {/* Derselbe Namenskreis wie im Rollen-Reiter: Farbe der Person, nicht
            Farbe des Zahlungsstands. Der Betrag rechts sagt das ohnehin. */}
        <span className="relative shrink-0">
          <Avatar userId={userId} name={`${student.nachname}, ${student.vorname}`} size={36} />
          {loginState != null && (
            <span
              title={loginState ? "hat ein eigenes Passwort gesetzt" : "nutzt noch das Startpasswort"}
              className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                loginState ? "bg-bezahlt" : "bg-papier-linie dark:bg-slate-600"
              }`}
            />
          )}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[14px] font-semibold">
            {student.nachname}, {student.vorname}
          </span>
          <span className="block truncate text-[11px] text-tinte-leise">
            {leaving
              ? `verlässt ${student.verlaesst_ab}`
              : joiningLate
                ? `dabei ab ${student.beigetreten_ab}`
                : "dabei seit EF.1"}
          </span>
        </span>
      </button>

      {/* Offen */}
      <button
        onClick={() => (selectable ? onToggleSelect(student.id) : onOpen(student.id))}
        className={`zahl shrink-0 text-right text-[17px] font-bold sm:w-16 ${
          betrag > 0 ? "text-offen dark:text-amber-300" : "text-bezahlt dark:text-emerald-300"
        }`}
      >
        {betrag > 0 ? `${betrag} €` : "✓"}
      </button>

      {/* Halbjahre */}
      <div className="order-last flex w-full gap-1.5 sm:order-none sm:w-auto sm:max-w-[13rem] sm:flex-1">
        {HY.map((h, i) => (
          <TermChip
            key={h}
            student={student}
            h={h}
            i={i}
            current={settings.aktuelles_halbjahr}
            kompakt
            onToggle={!selectable && canToggleBeitrag ? () => onToggleTerm(student.id, h) : undefined}
          />
        ))}
      </div>

      {/* Mithilfe */}
      <button
        onClick={() => (selectable ? onToggleSelect(student.id) : onOpen(student.id))}
        className="flex shrink-0 items-center gap-1.5"
        aria-label={`Mithilfe ${prozent} Prozent`}
      >
        <span className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-papier-matt dark:bg-slate-800 sm:block">
          <span
            className="block h-full rounded-full bg-brand"
            style={{ width: `${Math.min(100, prozent)}%` }}
          />
        </span>
        <span className={`zahl w-9 text-right text-[13px] font-semibold ${prozent >= 100 ? "text-bezahlt dark:text-emerald-300" : "text-tinte-matt dark:text-slate-300"}`}>
          {prozent} %
        </span>
      </button>
    </div>
  );
}

/**
 * Eine Zeile zeichnet sich nur neu, wenn sich an ihr etwas geaendert hat.
 *
 * Ohne das wurden bei 300 Personen mit jedem Buchstaben im Suchfeld alle 300
 * Zeilen neu gebaut – rund 10.000 DOM-Knoten. Genau daher kam das Nachhaengen
 * beim Tippen.
 */
export const StudentCard = memo(StudentCardRoh);

export function nextStatus(cur: string) {
  const i = STATI.indexOf(cur as any);
  return STATI[(i + 1) % STATI.length];
}
