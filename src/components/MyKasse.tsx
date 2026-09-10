import { useState } from "react";
import { HY, type Settings, type Student } from "../lib/types";
import { basisOffen, offenGesamt } from "../lib/logic";
import { TermChip } from "./TermChip";
import { PunkteBar } from "./PunkteBar";
import { PunkteSheet } from "./PunkteSheet";

/**
 * Die eigene Ansicht für alle, die nicht im Stufenteam sind:
 * eine Karte statt einer Liste – Betrag, Halbjahre, Beitragspunkte.
 */
export function MyKasse({
  student,
  settings,
  punkte,
  ready,
}: {
  student: Student | null;
  settings: Settings;
  punkte: number;
  ready: boolean;
}) {
  const [showPunkte, setShowPunkte] = useState(false);

  if (!ready)
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-slate-400">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-300 border-t-brand dark:border-slate-700 dark:border-t-brand" />
        <div className="text-sm font-medium">Deine Beiträge werden geladen …</div>
      </div>
    );

  if (!student)
    return (
      <div className="card p-6 text-center text-sm text-slate-500">
        Zu deinem Konto ist noch keine Person zugeordnet.
        <br />
        Melde dich beim Stufenteam, dann wird das freigeschaltet.
      </div>
    );

  const offen = offenGesamt(student, settings, punkte);
  const basis = basisOffen(student, settings.aktuelles_halbjahr);
  const zusatzDrin = offen > basis;

  return (
    <>
      <div className="card p-5" data-tour="meine-karte">
        <div className="text-sm text-slate-500">Deine Stufenkasse</div>
        <div className="mt-0.5 text-xl font-bold leading-tight">
          {student.vorname} {student.nachname}
        </div>

        <div className="mt-4 flex items-end gap-3">
          <div>
            <div className={`text-4xl font-extrabold ${offen > 0 ? "text-amber-500" : "text-emerald-500"}`}>
              {offen > 0 ? `${offen} €` : "0 €"}
            </div>
            <div className="text-[13px] text-slate-500">
              {offen > 0 ? (zusatzDrin ? "offen (inkl. Zusatzbeitrag)" : "noch offen") : "alles bezahlt ✓"}
            </div>
          </div>
        </div>

        <div className="mt-4 flex gap-1.5" data-tour="meine-halbjahre">
          {HY.map((h, i) => (
            <TermChip key={h} student={student} h={h} i={i} current={settings.aktuelles_halbjahr} />
          ))}
        </div>
        <div className="mt-1.5 text-[11px] text-slate-400">
          25 € pro Halbjahr · grün = bezahlt, blau = erlassen
        </div>

        <div className="mt-5 rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/70" data-tour="meine-punkte">
          <PunkteBar punkte={punkte} settings={settings} onClick={() => setShowPunkte(true)} />
          <p className="mt-2.5 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
            Für Mithilfe gibt es Beitragspunkte. Wer bis zum Ende unter {settings.ziel_punkte} Punkten
            bleibt, zahlt zusätzlich {settings.zusatz} €. Tippe für deine Einträge.
          </p>
        </div>
      </div>

      <PunkteSheet
        student={student}
        settings={settings}
        editable={false}
        open={showPunkte}
        onClose={() => setShowPunkte(false)}
      />
    </>
  );
}
