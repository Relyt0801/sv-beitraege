import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { useKi, type Schicht } from "../ki-store";
import { useStore } from "../store";
import { tagLang, terminIcon, uhr } from "../lib/termine";
import type { Anwesenheit } from "../lib/ki";
import { meldeFehler } from "../lib/melder";
import { abschlussOeffnen } from "./SchichtAbschluss";

/** Ereignis, mit dem man die Übersicht von überall öffnet. */
export const AUF_ANWESENHEIT = "sv:anwesenheit";
export function anwesenheitOeffnen() {
  window.dispatchEvent(new Event(AUF_ANWESENHEIT));
}

/**
 * „Wer war da?“ – fürs Stufenteam, je beendeter Schicht (30 Tage):
 * wer eingeteilt war und was die Person selbst gesagt hat, dazu Angaben von
 * Leuten, die nicht eingeteilt waren (z. B. per Chat).
 *
 *   ✓ eingetragen (automatisch oder bestätigt)   ⏳ sagt „war da“ – prüfen
 *   ✗ sagt „nicht da“                            – keine Antwort
 *
 * „stimmt nicht“ nimmt einen Eintrag wieder heraus und senkt den
 * Vertrauens-Score der Person (den sieht nur der Admin). Ein Score wird nur
 * bei Personen geführt, die eingewilligt haben (und in der Testphase sind).
 */
export function AnwesenheitSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { beendet, anwesenheit, offeneAngaben } = useKi();
  const [nurOffen, setNurOffen] = useState(true);
  // Beim Öffnen: gibt es etwas zu tun, zuerst nur das zeigen.
  const zuTun = offeneAngaben.length > 0;
  useEffect(() => {
    if (open) setNurOffen(zuTun);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const liste = useMemo(() => {
    const offenIn = new Set(offeneAngaben.map((w) => w.termin_id));
    return beendet.filter(
      (s) => !nurOffen || offenIn.has(s.termin.id) || (!s.termin.abschluss && s.termin.personen.length > 0),
    );
  }, [beendet, offeneAngaben, nurOffen]);

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel="Wer war da?" unter="Schichten der letzten 30 Tage" onClose={onClose} />
      <div className="seg mb-3" role="radiogroup" aria-label="Anzeige">
        <button role="radio" aria-checked={nurOffen} onClick={() => setNurOffen(true)} className={`seg-item ${nurOffen ? "seg-aktiv" : ""}`}>
          Zu erledigen
        </button>
        <button role="radio" aria-checked={!nurOffen} onClick={() => setNurOffen(false)} className={`seg-item ${!nurOffen ? "seg-aktiv" : ""}`}>
          Alle
        </button>
      </div>
      {liste.length === 0 ? (
        <p className="py-10 text-center text-sm text-tinte-leise">Nichts zu prüfen. 🙌</p>
      ) : (
        <ul className="grid gap-3">
          {liste.map((s) => (
            <SchichtKarte key={s.termin.id} schicht={s} angaben={anwesenheit.filter((w) => w.termin_id === s.termin.id)} />
          ))}
        </ul>
      )}
      <p className="mt-3 text-[12px] leading-relaxed text-tinte-leise">
        „stimmt nicht“ nimmt die Mithilfe wieder heraus. Wer nicht da war, bekommt beim Abschließen der Schicht keine
        Punkte – auch nicht über „Punkte vergeben“.
      </p>
    </Sheet>
  );
}

function SchichtKarte({ schicht, angaben }: { schicht: Schicht; angaben: Anwesenheit[] }) {
  const { students } = useStore();
  const t = schicht.termin;
  const name = new Map(students.map((s) => [s.id, `${s.vorname} ${s.nachname}`]));
  const von = new Map(angaben.map((w) => [w.student_id, w]));
  const zusaetzlich = angaben.filter((w) => !t.personen.includes(w.student_id));
  const zeilen = [...t.personen.map((sid) => ({ sid, w: von.get(sid) ?? null, eingeteilt: true })), ...zusaetzlich.map((w) => ({ sid: w.student_id, w, eingeteilt: false }))];
  const da = zeilen.filter((z) => z.w?.angabe === "da").length;
  const nicht = zeilen.filter((z) => z.w?.angabe === "nicht_da").length;

  return (
    <li className="rounded-2xl border border-papier-linie p-3 dark:border-slate-700">
      <div className="flex items-start gap-2.5">
        <span className="text-xl leading-none">{terminIcon(t, schicht.aktion.icon)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-bold">{t.titel}</span>
          <span className="block text-[12px] text-tinte-leise">
            {tagLang(t.datum)}
            {t.von ? ` · ${uhr(t.von)}${t.bis ? `–${uhr(t.bis)}` : ""}` : ""} · {da} da · {nicht} nicht da
          </span>
        </span>
        {!t.abschluss && t.personen.length > 0 && (
          <button onClick={abschlussOeffnen} className="shrink-0 rounded-lg bg-amber-700 px-2.5 py-1 text-[12px] font-bold text-white">
            abschließen
          </button>
        )}
      </div>
      <ul className="mt-2 divide-y divide-papier-linie dark:divide-slate-800">
        {zeilen.map((z) => (
          <PersonZeile key={z.sid} name={name.get(z.sid) || "Unbekannt"} w={z.w} eingeteilt={z.eingeteilt} abgeschlossen={t.abschluss ?? null} />
        ))}
      </ul>
    </li>
  );
}

function PersonZeile({ name, w, eingeteilt, abgeschlossen }: { name: string; w: Anwesenheit | null; eingeteilt: boolean; abgeschlossen: string | null }) {
  const { pruefen } = useKi();
  const [busy, setBusy] = useState(false);
  async function los(stimmt: boolean) {
    if (!w) return;
    setBusy(true);
    const f = await pruefen(w.id, stimmt);
    setBusy(false);
    if (f) meldeFehler("Das hat nicht geklappt: " + f);
  }

  const zeichen = !w
    ? abgeschlossen === "vergeben" ? "✓" : "–"
    : w.angabe === "nicht_da"
      ? "✗"
      : w.status === "falsch"
        ? "⊘"
        : w.status === "offen"
          ? "⏳"
          : "✓";
  const text = !w
    ? abgeschlossen === "vergeben" ? "eingetragen (Schicht abgeschlossen)" : "keine Antwort"
    : w.angabe === "nicht_da"
      ? "sagt: nicht da"
      : w.status === "falsch"
        ? "stimmt nicht – nichts eingetragen"
        : w.status === "offen"
          ? `sagt: war da${eingeteilt ? "" : " · nicht eingeteilt"}${w.quelle === "chat" ? " · per Chat" : ""}`
          : w.status === "auto"
            ? "war da · sofort eingetragen"
            : "war da · bestätigt";

  return (
    <li className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 py-2">
      <span
        aria-hidden
        className={`w-5 shrink-0 text-center text-[15px] font-bold ${
          zeichen === "✓" ? "text-emerald-600" : zeichen === "⏳" ? "text-amber-600" : zeichen === "✗" || zeichen === "⊘" ? "text-red-500" : "text-tinte-leise"
        }`}
      >
        {zeichen}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{name}</span>
        <span className="block text-[12px] text-tinte-leise">{text}</span>
      </span>
      {w && w.angabe === "da" && w.status === "offen" && (
        <span className="flex basis-full gap-1.5 pl-7 sm:basis-auto sm:pl-0">
          <button disabled={busy} onClick={() => void los(true)} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-bold text-white disabled:opacity-50">
            stimmt
          </button>
          <button disabled={busy} onClick={() => void los(false)} className="rounded-lg border border-papier-linie px-2.5 py-1.5 text-[12px] font-bold text-tinte-matt disabled:opacity-50 dark:border-slate-700">
            stimmt nicht
          </button>
        </span>
      )}
      {w && w.angabe === "da" && (w.status === "auto" || w.status === "bestaetigt") && (
        <button disabled={busy} onClick={() => void los(false)} className="shrink-0 text-[12px] font-semibold text-tinte-leise underline disabled:opacity-50">
          stimmt nicht
        </button>
      )}
      {w && w.status === "falsch" && (
        <button disabled={busy} onClick={() => void los(true)} className="shrink-0 text-[12px] font-semibold text-tinte-leise underline disabled:opacity-50">
          doch da
        </button>
      )}
    </li>
  );
}
