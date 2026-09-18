import { useState } from "react";
import { HY, type Halbjahr, type Status, type Student } from "../lib/types";
import { basisOffen, beitragFuer, isDead, isPreJoin, prozentVon, ticketBetrag } from "../lib/logic";
import { useStore } from "../store";
import { useRole } from "../auth/RoleProvider";
import { Sheet } from "./Sheet";
import { PunkteSheet } from "./PunkteSheet";

/**
 * Wie ein Halbjahr aussieht, je nach Stand. Die Farben kommen aus der Palette
 * (bezahlt / offen / erlassen), damit ueberall dasselbe Gruen, Braun und Blau
 * steht – in der Kasse, beim Schueler und hier.
 */
const ART: Record<Status, { text: string; zeichen: string; klasse: string; punkt: string }> = {
  bezahlt: {
    text: "bezahlt",
    zeichen: "✓",
    klasse: "border-papier-linie bg-white text-bezahlt dark:border-slate-700 dark:bg-slate-900 dark:text-emerald-300",
    punkt: "bg-bezahlt-grund text-bezahlt dark:bg-emerald-500/20 dark:text-emerald-300",
  },
  offen: {
    text: "noch offen",
    zeichen: "€",
    klasse: "border-offen-rand bg-offen-grund/40 text-offen dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300",
    punkt: "bg-offen-grund text-offen dark:bg-amber-500/20 dark:text-amber-300",
  },
  erlassen: {
    text: "erlassen",
    zeichen: "/",
    klasse: "border-papier-linie bg-white text-erlassen dark:border-slate-700 dark:bg-slate-900 dark:text-blue-300",
    punkt: "bg-erlassen-grund text-erlassen dark:bg-blue-500/20 dark:text-blue-300",
  },
};

/** Ein Tipp schaltet weiter – kein Menue, keine drei Knoepfe nebeneinander. */
const NAECHSTER: Record<Status, Status> = { offen: "bezahlt", bezahlt: "erlassen", erlassen: "offen" };

export function StudentSheet({
  student,
  punkte,
  onClose,
}: {
  student: Student | null;
  punkte: number;
  onClose: () => void;
}) {
  const { settings, setTerm, updateStudent, removeStudent } = useStore();
  const { canEditBeitrag, canEditData } = useRole();
  const [showPunkte, setShowPunkte] = useState(false);
  const [showStamm, setShowStamm] = useState(false);

  if (!student) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  const offen = basisOffen(student, settings.aktuelles_halbjahr, settings);
  const pct = prozentVon(punkte, settings);
  const ticket = (settings.ticket_preis || 0) + ticketBetrag(pct, settings);
  const initialen = (student.vorname[0] || "") + (student.nachname[0] || "");

  return (
    <Sheet open onClose={onClose}>
      {/* ------------------------------------------------- Kopf der Person */}
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-[15px] font-bold text-white">
          {initialen.toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate font-zahl text-[1.15rem] font-extrabold tracking-[-0.02em]">
            {student.nachname}, {student.vorname}
          </span>
          <span className="block truncate text-[11px] text-tinte-leise">dabei seit {student.beigetreten_ab}</span>
        </span>
        <button className="iconbtn shrink-0" onClick={onClose} aria-label="Schließen">
          ✕
        </button>
      </div>

      {/* ------------------------------------------------- zwei Kennzahlen */}
      <div className="mt-3.5 grid grid-cols-2 gap-2">
        <div className={`rounded-2xl p-3.5 ${offen > 0 ? "bg-offen-grund" : "bg-bezahlt-grund"} dark:bg-slate-800/70`}>
          <div className={`text-[11px] font-semibold ${offen > 0 ? "text-offen dark:text-amber-300" : "text-bezahlt dark:text-emerald-300"}`}>
            Noch offen
          </div>
          <div className={`zahl mt-1 text-[1.6rem] font-extrabold leading-none ${offen > 0 ? "text-offen dark:text-amber-300" : "text-bezahlt dark:text-emerald-300"}`}>
            {offen} €
          </div>
        </div>
        <button
          onClick={() => setShowPunkte(true)}
          className="rounded-2xl bg-brand/10 p-3.5 text-left transition active:scale-[.98] dark:bg-brand/20"
        >
          <div className="text-[11px] font-semibold text-brand-dark dark:text-brand-soft">Mitgeholfen</div>
          <div className="zahl mt-1 text-[1.6rem] font-extrabold leading-none text-brand-dark dark:text-brand-soft">
            {pct} %
          </div>
        </button>
      </div>
      <div className="mt-2 text-[11px] text-tinte-leise">
        1. Abiballticket {ticket} € · wird getrennt bezahlt
      </div>

      {/* ------------------------------------------------- Zahlungen */}
      <div className="mt-5 flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-tinte-matt">Zahlungen</h3>
        <span className="text-[11px] text-tinte-leise">
          {canEditBeitrag ? "tippen zum Umschalten" : "nur ansehen"}
        </span>
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        {HY.map((h, i) => {
          const t = student.terms[h];
          const pre = isPreJoin(student, i);
          const tot = isDead(student, i);
          const aus = pre || tot;
          const art = ART[t.status];
          const jetzt = h === settings.aktuelles_halbjahr;
          return (
            <button
              key={h}
              type="button"
              disabled={aus || !canEditBeitrag}
              onClick={() => setTerm(student.id, h, NAECHSTER[t.status])}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition active:scale-[.99] disabled:opacity-45 ${
                aus ? "border-papier-linie bg-papier-matt dark:border-slate-700 dark:bg-slate-800/40" : art.klasse
              } ${jetzt ? "ring-2 ring-brand/25" : ""}`}
            >
              <span className="w-[3.1rem] shrink-0 text-[13px] font-bold">{h}</span>
              <span className="zahl w-[2.6rem] shrink-0 text-[12px] font-semibold text-tinte-leise">
                {beitragFuer(h, settings)} €
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                {pre ? "noch nicht dabei" : tot ? "verlassen" : art.text}
              </span>
              {jetzt && !aus && (
                <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">
                  jetzt
                </span>
              )}
              <span
                className={`flex h-[1.6rem] w-[1.6rem] shrink-0 items-center justify-center rounded-lg text-[13px] font-bold ${
                  aus ? "bg-papier-linie text-tinte-leise dark:bg-slate-700" : art.punkt
                }`}
              >
                {aus ? "–" : art.zeichen}
              </span>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => setShowPunkte(true)}
        className="mt-3 w-full rounded-xl border border-papier-linie py-2.5 text-[13px] font-semibold text-tinte-matt transition active:scale-[.99] dark:border-slate-600 dark:text-slate-300"
      >
        {canEditData ? "Mithilfe eintragen" : "Mithilfe ansehen"}
      </button>

      {/* ------------------------------------------------- Stammdaten */}
      {canEditData && !showStamm && (
        <button
          onClick={() => setShowStamm(true)}
          className="mt-2 w-full rounded-xl py-2 text-[12px] font-semibold text-tinte-leise"
        >
          Stammdaten & Löschen anzeigen
        </button>
      )}

      {canEditData && showStamm && (
        <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-papier-linie pt-4 dark:border-slate-700">
          <label className="text-[13px] text-tinte-matt">Dabei ab</label>
          <select
            className="min-w-0 rounded-xl border border-papier-linie bg-papier-matt px-3 py-2 text-[13px] dark:border-slate-700 dark:bg-slate-800"
            value={student.beigetreten_ab}
            onChange={(e) => updateStudent(student.id, { beigetreten_ab: e.target.value as Halbjahr })}
          >
            {HY.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
          <label className="text-[13px] text-tinte-matt">Verlässt ab</label>
          <select
            className="min-w-0 rounded-xl border border-papier-linie bg-papier-matt px-3 py-2 text-[13px] dark:border-slate-700 dark:bg-slate-800"
            value={student.verlaesst_ab ?? ""}
            onChange={(e) => updateStudent(student.id, { verlaesst_ab: (e.target.value || null) as Halbjahr | null })}
          >
            <option value="">— bleibt —</option>
            {HY.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
          <button
            onClick={() => {
              if (confirm("Diese Person wirklich löschen?")) {
                removeStudent(student.id);
                onClose();
              }
            }}
            className="ml-auto rounded-xl border border-red-300 px-3 py-2 text-[13px] font-bold text-red-500"
          >
            Löschen
          </button>
        </div>
      )}

      <button className="btn-primary mt-4" onClick={onClose}>
        Fertig
      </button>

      <PunkteSheet
        student={student}
        settings={settings}
        editable={canEditData}
        open={showPunkte}
        onClose={() => setShowPunkte(false)}
      />
    </Sheet>
  );
}
