import { useState } from "react";
import type { Contribution, Settings, Student } from "../lib/types";
import { useStore } from "../store";
import { Sheet } from "./Sheet";
import { PunkteBar, StaffelTabelle } from "./PunkteBar";
import { prozentVon, ticketBetrag } from "../lib/logic";

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
  const [addOpen, setAddOpen] = useState(false);
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
    setAddOpen(false);
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="mb-4 flex items-start gap-3">
        <div className="flex-1">
          <div className="text-xl font-bold leading-tight">Gesammelte Prozent</div>
          <div className="text-sm text-slate-500">
            {student.vorname} {student.nachname}
          </div>
        </div>
        <button className="iconbtn" onClick={onClose} aria-label="Schließen">
          ✕
        </button>
      </div>

      <div className="mb-4 rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/70">
        <PunkteBar punkte={summe} settings={settings} />
        <div className="mt-3">
          <StaffelTabelle settings={settings} pct={pct} />
        </div>
        <p className="mt-2.5 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
          Das <b>erste</b> Abiballticket kostet bei diesem Stand{" "}
          <b>{(settings.ticket_preis || 0) + ticketBetrag(pct, settings)} €</b>
          {settings.ticket_preis ? ` (${settings.ticket_preis} € Grundpreis + ${ticketBetrag(pct, settings)} €)` : ""}.
          Weitere Tickets sind davon nicht betroffen.
        </p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400 dark:border-slate-700">
          Noch nichts eingetragen.
          <br />
          Hilf bei einer Aktion mit – dann erscheint sie hier.
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
          {list.map((c) => (
            <Zeile
              key={c.id}
              c={c}
              editable={editable}
              onChange={(patch) => updateContribution(c.id, patch)}
              onDelete={() => {
                if (confirm(`„${c.titel}" wirklich löschen?`)) removeContribution(c.id);
              }}
            />
          ))}
        </ul>
      )}

      {editable && (
        <div className="mt-4">
          {addOpen ? (
            <div className="rounded-2xl border border-brand/40 bg-brand/5 p-3">
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Wofür?
              </div>
              {templates.length === 0 ? (
                <p className="rounded-xl bg-white p-3 text-[13px] text-slate-500 dark:bg-slate-900">
                  Es sind noch keine Möglichkeiten hinterlegt. Das Stufenteam legt sie im Reiter
                  „Beiträge" an.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {[...templates]
                    .sort((a, b) => a.sort - b.sort || a.punkte - b.punkte)
                    .map((t) => {
                      const aktiv = t.id === gewaehlt;
                      return (
                        <button
                          key={t.id}
                          onClick={() => waehle(t.id)}
                          className={`rounded-full border px-2.5 py-1.5 text-[13px] font-semibold transition ${
                            aktiv
                              ? "border-brand bg-brand text-white"
                              : "border-brand/40 bg-white text-brand dark:bg-slate-900"
                          }`}
                        >
                          {t.titel} <span className="opacity-70">+{t.punkte} %</span>
                        </button>
                      );
                    })}
                </div>
              )}

              {vorlage && (
                <div className="mt-3 grid gap-2">
                  <label className="flex items-center gap-2.5">
                    <span className="w-16 shrink-0 text-[13px] font-semibold text-slate-500">Datum</span>
                    <input
                      type="date"
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[15px] dark:border-slate-700 dark:bg-slate-800"
                      value={datum}
                      onChange={(e) => setDatum(e.target.value)}
                    />
                  </label>
                  <label className="flex items-center gap-2.5">
                    <span className="w-16 shrink-0 text-[13px] font-semibold text-slate-500">Wert</span>
                    {vorlage.variabel ? (
                      <span className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          inputMode="numeric"
                          className="w-20 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-center text-[15px] font-bold text-brand dark:border-slate-700 dark:bg-slate-800"
                          value={wert}
                          onChange={(e) => setWert(e.target.value)}
                        />
                        <span className="text-[13px] font-bold text-brand">%</span>
                        <span className="text-[12px] text-slate-400">je nach Aufwand anpassbar</span>
                      </span>
                    ) : (
                      <span className="text-[15px] font-bold text-brand">{vorlage.punkte} %</span>
                    )}
                  </label>
                </div>
              )}

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => {
                    setAddOpen(false);
                    setGewaehlt(null);
                  }}
                  className="ml-auto rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 dark:border-slate-700"
                >
                  Abbrechen
                </button>
                <button
                  onClick={speichern}
                  disabled={!vorlage}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                >
                  Eintragen
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddOpen(true)}
              className="w-full rounded-2xl border border-dashed border-brand/50 py-3 text-sm font-bold text-brand transition active:scale-[.99]"
            >
              ＋ Beitrag eintragen
            </button>
          )}
        </div>
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
            className="w-20 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-center dark:border-slate-700 dark:bg-slate-800"
            value={punkte}
            onChange={(e) => setPunkte(e.target.value)}
          />
          <button onClick={onDelete} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-bold text-red-500">
            Löschen
          </button>
          <button
            onClick={() => setEdit(false)}
            className="ml-auto rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 dark:border-slate-700"
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
        {datum && <div className="text-[11px] text-slate-400">{datum}</div>}
      </div>
      <span className="shrink-0 rounded-full bg-brand/12 px-2.5 py-1 text-sm font-extrabold text-brand">
        +{c.punkte}
      </span>
      {editable && (
        <button onClick={() => setEdit(true)} className="shrink-0 text-slate-400" aria-label="Bearbeiten">
          ✎
        </button>
      )}
    </li>
  );
}
