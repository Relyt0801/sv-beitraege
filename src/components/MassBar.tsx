import { useEffect, useMemo, useState } from "react";
import { HY, type Halbjahr } from "../lib/types";
import { useStore } from "../store";
import { useRole } from "../auth/RoleProvider";
import { idx, isActive, sortStudents } from "../lib/logic";
import { melde } from "../lib/melder";
import { MithilfeBlatt } from "./MithilfeBlatt";
import { Sheet, SheetKopf, useEscapeSchliesst } from "./Sheet";
import { Gruppe, ZeileHaken } from "./Liste";
import { Icon } from "./Icon";

/**
 * Leiste im Auswahl-Modus der Kasse.
 *
 * Oben stehen immer die Namen aller Ausgewählten – auch derer, die Suche oder
 * Filter gerade ausblenden. Vorher stand hier nur „5 ausgewählt“: Im
 * Auswahl-Modus wählt ein Tipp irgendwo auf eine Zeile die Person aus, und
 * eine Auswahl aus einer früheren Suche bleibt stehen. So bekam jemand
 * Mithilfe samt „Danke fürs Mithelfen“-Mitteilung, ohne irgendwo
 * eingetragen zu sein – und niemand sah es vor dem Tippen.
 *
 * Update 1.4 (U3): schwebt als Glas-Karte (am Laptop nicht mehr über die ganze
 * Fensterbreite), Knöpfe im Stil der App, Escape beendet den Auswahl-Modus
 * (solange nicht das Mithilfe-Blatt darüber offen ist).
 *
 * Halbjahr (Prüfung Okt. 2026): stand fest auf EF.1 – auch wenn längst Q1.1
 * lief. Wer dann „bezahlt“ tippte, buchte ins falsche Halbjahr. Jetzt steht
 * hier immer das laufende Halbjahr; ändern geht über eine Liste mit Häkchen
 * im Blatt (kein natives Auswahlfeld). Nach dem Tippen sagt eine Meldung,
 * was wofür eingetragen wurde.
 */
export function MassBar({
  selected,
  onAbwaehlen,
  onDone,
}: {
  selected: Set<string>;
  onAbwaehlen: (id: string) => void;
  onDone: () => void;
}) {
  const { massApply, addContributionMany, students, settings } = useStore();
  const { canEditHilfen } = useRole();
  const laeuft = settings.aktuelles_halbjahr;
  const [h, setH] = useState<Halbjahr>(laeuft);
  // Stellt jemand das laufende Halbjahr um, zieht die Auswahl mit
  useEffect(() => setH(laeuft), [laeuft]);
  const [hjOffen, setHjOffen] = useState(false);
  const [punkteOffen, setPunkteOffen] = useState(false);

  // Nur Personen, die es noch gibt – alphabetisch wie in der Liste.
  const ausgewaehlt = useMemo(() => sortStudents(students.filter((s) => selected.has(s.id))), [students, selected]);

  // Escape beendet den Modus. Ist das Mithilfe-Blatt offen, liegt es im Escape-
  // Stapel (Sheet.tsx) weiter oben und schließt zuerst – dieses Escape bekommt nur das oberste.
  useEscapeSchliesst(true, onDone);

  const btn = "btn-klein-grau !px-3.5";
  const disabled = ausgewaehlt.length === 0;

  // Eintragen und kurz sagen, was passiert ist. Wer im Halbjahr nicht dabei
  // ist (noch nicht oder nicht mehr), wird übersprungen – auch das steht da.
  const setzen = (status: "bezahlt" | "erlassen" | "offen") => {
    const i = idx(h);
    const dabei = ausgewaehlt.filter((s) => isActive(s, i)).length;
    massApply(selected, h, status);
    const rest = ausgewaehlt.length - dabei;
    melde(
      `${h}: ${dabei} ${dabei === 1 ? "Person" : "Personen"} auf „${status}“${rest > 0 ? ` · ${rest} in ${h} nicht dabei` : ""}`,
      dabei > 0 ? "erfolg" : "info",
    );
  };

  const namen = ausgewaehlt.length > 0 && (
    <div className="flex max-h-[5.5rem] w-full flex-wrap gap-1 overflow-y-auto">
      {ausgewaehlt.map((s) => (
        <button
          key={s.id}
          onClick={() => onAbwaehlen(s.id)}
          aria-label={`${s.vorname} ${s.nachname} abwählen`}
          className="flex max-w-full items-center gap-1 rounded-full bg-brand/10 py-0.5 pl-2.5 pr-1.5 text-[12px] font-semibold text-tinte dark:bg-brand/20 dark:text-slate-200"
        >
          <span className="truncate">
            {s.nachname}, {s.vorname}
          </span>
          <span className="shrink-0 px-1 text-tinte-leise">✕</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
    <div className="pointer-events-auto mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-[1.5rem] border border-white/60 p-3 shadow-[0_8px_32px_-8px_rgba(0,0,0,.28),0_0_0_.5px_rgba(0,0,0,.08)] glas !bg-[rgb(var(--glas))] dark:border-white/10">
      {namen}
      <span className="mr-auto text-[15px] font-semibold">{ausgewaehlt.length} ausgewählt</span>
      {/* Halbjahr: Kapsel wie die übrigen Knöpfe, öffnet eine Häkchen-Liste */}
      <button
        type="button"
        className={`${btn} ${h !== laeuft ? "!bg-brand/15" : ""}`}
        onClick={() => setHjOffen(true)}
        aria-haspopup="dialog"
        aria-label={`Halbjahr ${h}${h === laeuft ? " (läuft gerade)" : ""} – ändern`}
      >
        {h}
        <span aria-hidden className="rotate-90">
          <Icon name="chevron" size={13} strich={2.6} />
        </span>
      </button>
      <button disabled={disabled} className={btn} onClick={() => setzen("bezahlt")}>
        bezahlt
      </button>
      <button disabled={disabled} className={btn} onClick={() => setzen("erlassen")}>
        erlassen
      </button>
      <button disabled={disabled} className={btn} onClick={() => setzen("offen")}>
        offen
      </button>
      {canEditHilfen && (
        <button disabled={disabled} className={btn} onClick={() => setPunkteOffen(true)}>
          Mithilfe
        </button>
      )}
      <button className="btn-klein !px-5" onClick={onDone}>
        Fertig
      </button>

      <Sheet open={hjOffen} onClose={() => setHjOffen(false)}>
        <SheetKopf titel="Halbjahr" unter="Dafür gelten „bezahlt“, „erlassen“ und „offen“." onClose={() => setHjOffen(false)} />
        <Gruppe className="">
          {HY.map((x) => (
            <ZeileHaken
              key={x}
              label={x}
              unter={x === laeuft ? "läuft gerade" : undefined}
              gewaehlt={x === h}
              onClick={() => {
                setH(x);
                setHjOffen(false);
              }}
            />
          ))}
        </Gruppe>
      </Sheet>

      {/* Mithilfe für mehrere: dasselbe Blatt wie für eine Person. Unten
          stehen die Ausgewählten (antippen = abwählen). */}
      <MithilfeBlatt
        open={punkteOffen}
        onClose={() => setPunkteOffen(false)}
        fuer={`${ausgewaehlt.length} Person${ausgewaehlt.length === 1 ? "" : "en"}`}
        knopf={`Für ${ausgewaehlt.length} eintragen`}
        zusatz={
          <div className="mt-4">
            <div className="mb-1.5 px-4 text-[13px] font-semibold uppercase tracking-[0.02em] text-tinte-leise">Wer war dabei?</div>
            <div className="rounded-2xl zelle p-3">{namen}</div>
            <p className="mt-1.5 px-4 text-[12px] text-tinte-leise">Antippen zum Abwählen. Alle bekommen eine Mitteilung.</p>
          </div>
        }
        onEintragen={(titel, p, datum) => {
          if (!ausgewaehlt.length) return;
          addContributionMany(
            ausgewaehlt.map((x) => x.id),
            titel,
            p,
            datum,
          );
          onDone();
        }}
      />
    </div>
    </div>
  );
}
