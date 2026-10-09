import { useState } from "react";
import { HY, type Halbjahr, type Status, type Student } from "../lib/types";
import { basisOffen, beitragFuer, isDead, isPreJoin, prozentVon, ticketPreise } from "../lib/logic";
import { useStore } from "../store";
import { useRole } from "../auth/RoleProvider";
import { Sheet } from "./Sheet";
import { PunkteSheet } from "./PunkteSheet";
import { Gruppe, KopfBild, RechnungKopf, Wert, Zeile, ZeileAuswahl } from "./Liste";

import { frage } from "../lib/melder";
import { usePasswortNeu } from "./PasswortNeu";
/** Wie ein Halbjahr aussieht: Farbe der Kapsel rechts, aus der Palette. */
const ART: Record<Status, { text: string; klasse: string }> = {
  bezahlt: { text: "✓ bezahlt", klasse: "bg-bezahlt-grund text-bezahlt dark:bg-emerald-500/20 dark:text-emerald-300" },
  offen: { text: "offen", klasse: "bg-offen-grund text-offen dark:bg-amber-500/20 dark:text-amber-300" },
  erlassen: { text: "erlassen", klasse: "bg-erlassen-grund text-erlassen dark:bg-blue-500/20 dark:text-blue-300" },
};

/** Ein Tipp schaltet weiter – kein Menue, keine drei Knoepfe nebeneinander. */
const NAECHSTER: Record<Status, Status> = { offen: "bezahlt", bezahlt: "erlassen", erlassen: "offen" };

/**
 * Eine Person – aufgebaut wie eine Rechnung: oben groß, was offen ist,
 * darunter die Halbjahre (antippen schaltet um), Mithilfe und Stammdaten.
 */
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
  const { canEditBeitrag, canEditData, canEditHilfen, userByStudent } = useRole();
  const pw = usePasswortNeu();
  const [showPunkte, setShowPunkte] = useState(false);

  if (!student) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  const offen = basisOffen(student, settings.aktuelles_halbjahr, settings);
  const pct = prozentVon(punkte, settings);
  const ticket = ticketPreise(pct, settings);
  const initialen = ((student.vorname[0] || "") + (student.nachname[0] || "")).toUpperCase();

  return (
    <Sheet open onClose={onClose}>
      <div className="mx-auto max-w-md">
        <RechnungKopf
          bild={<KopfBild text={initialen} />}
          oben={`${student.vorname} ${student.nachname}`}
          wert={`${offen} €`}
          wertKlasse={offen > 0 ? "text-offen dark:text-amber-300" : "text-bezahlt dark:text-emerald-300"}
          titel={offen > 0 ? `noch offen bis ${settings.aktuelles_halbjahr}` : "alles bezahlt"}
          unter={`dabei seit ${student.beigetreten_ab}`}
          onClose={onClose}
        />

        {/* ------------------------------------------------- Halbjahre */}
        <Gruppe titel="Halbjahre" fuss={canEditBeitrag ? "Antippen: offen → bezahlt → erlassen" : undefined}>
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
                className={`flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06] ${
                  aus ? "opacity-45" : ""
                }`}
              >
                <span className="w-12 shrink-0 text-[15px] font-semibold">{h}</span>
                <span className="zahl min-w-0 flex-1 text-[14px] text-tinte-leise">
                  {beitragFuer(h, settings)} €
                  {jetzt && !aus && <span className="ml-2 text-[11px] font-bold text-brand">jetzt</span>}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[12.5px] font-semibold transition-colors duration-200 ${
                    aus ? "text-tinte-leise" : art.klasse
                  }`}
                >
                  {pre ? "noch nicht dabei" : tot ? "verlassen" : art.text}
                </span>
              </button>
            );
          })}
        </Gruppe>

        {/* ------------------------------------------------- Mithilfe */}
        <Gruppe titel="Mithilfe">
          <Zeile label={canEditHilfen ? "Mitgeholfen · eintragen" : "Mitgeholfen"} onClick={() => setShowPunkte(true)}>
            <Wert stark>{pct} %</Wert>
          </Zeile>
          <Zeile label="1. Abiball-Ticket">
            <Wert>{ticket.preisSteht ? `${ticket.erstes} €` : `+${ticket.aufschlag - ticket.rabatt} € Zuschlag`}</Wert>
          </Zeile>
        </Gruppe>

        {/* ------------------------------------------------- Stammdaten */}
        {canEditData && (
          <Gruppe titel="Stammdaten">
            <Zeile label="Dabei ab">
              <ZeileAuswahl
                label="Dabei ab"
                value={student.beigetreten_ab}
                onChange={(v) => updateStudent(student.id, { beigetreten_ab: v as Halbjahr })}
              >
                {HY.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </ZeileAuswahl>
            </Zeile>
            <Zeile label="Verlässt ab">
              <ZeileAuswahl
                label="Verlässt ab"
                value={student.verlaesst_ab ?? ""}
                onChange={(v) => updateStudent(student.id, { verlaesst_ab: (v || null) as Halbjahr | null })}
              >
                <option value="">bleibt</option>
                {HY.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </ZeileAuswahl>
            </Zeile>
            {pw.darf && userByStudent[student.id] && (
              <Zeile label={pw.busy ? "Neues Passwort wird erzeugt …" : "Neues Passwort generieren"} onClick={() => void pw.zuruecksetzen(userByStudent[student.id], `${student.vorname} ${student.nachname}`)} />
            )}
            <Zeile
              label="Person löschen"
              rot
              onClick={async () => {
                if (await frage(`${student.vorname} ${student.nachname} wirklich löschen?`, "Löschen", true)) {
                  removeStudent(student.id);
                  onClose();
                }
              }}
            />
          </Gruppe>
        )}
      </div>

      {pw.anzeige}
      <PunkteSheet
        student={student}
        settings={settings}
        editable={canEditHilfen}
        open={showPunkte}
        onClose={() => setShowPunkte(false)}
      />
    </Sheet>
  );
}
