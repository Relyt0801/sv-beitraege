import { useState } from "react";
import type { Contribution, Settings, Student } from "../lib/types";
import { useStore } from "../store";
import { Sheet } from "./Sheet";
import { PunkteBar, StaffelTabelle } from "./PunkteBar";
import { prozentVon, ticketBetrag } from "../lib/logic";

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
  const { contributions, templates, addContribution, updateContribution, removeContribution } = useStore();
  // gewählte Vorlage + ggf. angepasster Wert + Datum der Hilfe
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [wert, setWert] = useState("5");
  const [datum, setDatum] = useState(() => new Date().toISOString().slice(0, 10));

  if (!student) return null;
  const list = contributions
    .filter((c) => c.student_id === student.id)
    .sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0));
  const summe = list.reduce((n, c) => n + c.punkte, 0);
  const pct = prozentVon(summe, settings);

  const vorlage = templates.find((t) => t.id === gewaehlt) ?? null;

  function waehle(id: string) {
    const t = templates.find((x) => x.id === id);
    setGewaehlt(id);
    setWert(String(t?.punkte ?? 0)); // Prozentwert der Vorlage übernehmen
  }

  function speichern() {
    if (!vorlage) return;
    const p = vorlage.variabel ? Math.max(0, Math.min(100, Number(wert) || 0)) : vorlage.punkte;
    addContribution(student!.id, vorlage.titel, p, datum);
    setGewaehlt(null);
    setDatum(new Date().toISOString().slice(0, 10));
  }

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
        <p className="mt-2.5 text-[13px] leading-relaxed text-tinte-matt dark:text-slate-300">
          Das <b>erste</b> Abiball-Ticket kostet bei diesem Stand{" "}
          <b>{(settings.ticket_preis || 0) + ticketBetrag(pct, settings)} €</b>
          {settings.ticket_preis ? ` (${settings.ticket_preis} € Grundpreis + ${ticketBetrag(pct, settings)} €)` : ""}.
          Weitere Tickets sind davon nicht betroffen.
        </p>
      </div>

      {editable && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[13px] font-semibold text-tinte-matt">Mithilfe eintragen</h3>
            <span className="text-[11px] text-tinte-leise">aus der Liste wählen</span>
          </div>

          {templates.length === 0 ? (
            <p className="mt-2 rounded-xl border border-papier-linie bg-papier-matt p-3 text-[13px] text-tinte-matt dark:border-slate-700 dark:bg-slate-800">
              Es steht noch nichts zur Auswahl. Das Stufenteam legt die Möglichkeiten im Reiter
              „Beiträge" an.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[...templates]
                .sort((a, b) => a.sort - b.sort || a.punkte - b.punkte)
                .map((t) => {
                  const aktiv = t.id === gewaehlt;
                  return (
                    <button
                      key={t.id}
                      onClick={() => waehle(t.id)}
                      className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[12px] font-semibold transition active:scale-[.98] ${
                        aktiv
                          ? "border-brand bg-brand text-white"
                          : t.variabel
                            ? "border-brand/30 bg-brand/5 text-tinte dark:bg-slate-800 dark:text-slate-200"
                            : "border-papier-linie bg-white text-tinte dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      }`}
                    >
                      {t.titel}
                      <span className={`zahl font-bold ${aktiv ? "text-white" : "text-brand"}`}>
                        {t.variabel ? "% frei" : `+${t.punkte} %`}
                      </span>
                    </button>
                  );
                })}
            </div>
          )}

          {/* Datum steht schon, Wert haengt an der Vorlage: eintragen ist ein Griff. */}
          <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-papier-linie bg-papier-matt px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
            <label htmlFor="mithilfe-datum" className="shrink-0 text-[12px] font-semibold text-tinte-matt">
              am
            </label>
            <input
              id="mithilfe-datum"
              type="date"
              className="w-0 min-w-[7.5rem] flex-1 bg-transparent text-[13px] font-semibold outline-none"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
            />
            {vorlage?.variabel && (
              <span className="flex shrink-0 items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  inputMode="numeric"
                  className="w-14 rounded-lg border border-papier-linie bg-white px-1.5 py-1.5 text-center text-[13px] font-bold text-brand dark:border-slate-600 dark:bg-slate-900"
                  value={wert}
                  onChange={(e) => setWert(e.target.value)}
                />
                <span className="text-[12px] font-bold text-brand">%</span>
              </span>
            )}
            <button
              onClick={speichern}
              disabled={!vorlage}
              className="h-9 shrink-0 rounded-lg bg-brand px-3.5 text-[13px] font-bold text-white transition active:scale-[.98] disabled:opacity-40"
            >
              Eintragen
            </button>
          </div>
          {!vorlage && templates.length > 0 && (
            <div className="mt-1.5 text-[11px] text-tinte-leise">Erst antippen, wobei geholfen wurde.</div>
          )}
        </div>
      )}

      <h3 className="mb-2 mt-5 text-[13px] font-semibold text-tinte-matt">Zuletzt eingetragen</h3>
      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-papier-linie py-10 text-center text-sm text-tinte-leise dark:border-slate-700">
          Hier steht noch nichts.
          <br />
          Sobald du bei etwas mithilfst, taucht es hier auf.
        </div>
      ) : (
        <ul className="divide-y divide-papier-linie overflow-hidden rounded-2xl border border-papier-linie dark:divide-slate-700 dark:border-slate-700">
          {list.map((c) => (
            <Zeile
              key={c.id}
              c={c}
              editable={editable}
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
        {datum && <div className="text-[11px] text-tinte-leise">{datum}</div>}
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
