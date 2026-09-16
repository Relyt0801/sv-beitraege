import { useState } from "react";
import { useStore } from "../store";
import { staffelVon } from "../lib/logic";

/**
 * Reiter "Beiträge": hier wird festgelegt, wofür es wie viel Prozent gibt und
 * was das Abiballticket kostet. Beim Eintragen bei einer Person wird danach nur
 * noch aus dieser Liste ausgewählt.
 */
export function BeitraegeTab() {
  const { templates, settings, addTemplate, updateTemplate, removeTemplate, setSettings } = useStore();
  const [titel, setTitel] = useState("");
  const [punkte, setPunkte] = useState("5");

  const sortiert = [...templates].sort((a, b) => a.sort - b.sort || a.punkte - b.punkte);
  const staffel = staffelVon(settings);
  const grund = settings.ticket_preis || 0;

  function anlegen() {
    const t = titel.trim();
    if (!t) return;
    addTemplate(t, Number(punkte) || 0);
    setTitel("");
    setPunkte("5");
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/* ---------------- Möglichkeiten ---------------- */}
      <section className="card p-4 sm:p-5">
        <h2 className="text-lg font-bold">Wofür gibt es Prozent?</h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
          Diese Liste siehst du später, wenn du bei jemandem etwas einträgst. Setz einen Haken bei
          „anpassbar", wenn der Wert je nach Aufwand schwankt.
        </p>

        <ul className="mt-4 grid gap-2">
          {sortiert.map((t) => (
            <li
              key={t.id}
              className="rounded-2xl border border-slate-200 p-2.5 dark:border-slate-700"
            >
              <div className="flex items-center gap-2">
                <input
                  className="min-w-0 flex-1 rounded-lg bg-slate-100 px-2.5 py-2 text-[15px] font-semibold dark:bg-slate-800"
                  value={t.titel}
                  onChange={(e) => updateTemplate(t.id, { titel: e.target.value })}
                />
                <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-800">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    inputMode="numeric"
                    className="w-12 bg-transparent text-right text-[15px] font-bold text-brand outline-none"
                    value={t.punkte}
                    onChange={(e) =>
                      updateTemplate(t.id, { punkte: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })
                    }
                  />
                  <span className="text-[15px] font-bold text-brand">%</span>
                </div>
                <button
                  onClick={() => confirm(`„${t.titel}" wirklich löschen?`) && removeTemplate(t.id)}
                  className="shrink-0 rounded-lg px-2 py-2 text-slate-400 transition active:scale-90"
                  aria-label="Löschen"
                >
                  🗑
                </button>
              </div>
              <label className="mt-1.5 flex cursor-pointer items-center gap-2 pl-1 text-[12px] text-slate-500 dark:text-slate-400">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand"
                  checked={Boolean(t.variabel)}
                  onChange={(e) => updateTemplate(t.id, { variabel: e.target.checked })}
                />
                Wert beim Eintragen anpassbar
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-3 rounded-2xl border border-dashed border-brand/50 p-2.5">
          <div className="flex items-center gap-2">
            <input
              className="min-w-0 flex-1 rounded-lg bg-slate-100 px-2.5 py-2 text-[15px] dark:bg-slate-800"
              placeholder="Noch etwas, zum Beispiel Fotobox betreut"
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && anlegen()}
            />
            <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-800">
              <input
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                className="w-12 bg-transparent text-right text-[15px] font-bold text-brand outline-none"
                value={punkte}
                onChange={(e) => setPunkte(e.target.value)}
              />
              <span className="text-[15px] font-bold text-brand">%</span>
            </div>
            <button
              onClick={anlegen}
              disabled={!titel.trim()}
              className="shrink-0 rounded-lg bg-brand px-3.5 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              ＋
            </button>
          </div>
        </div>
      </section>

      {/* ---------------- Abiballticket ---------------- */}
      <section className="card h-fit p-4 sm:p-5">
        <h2 className="text-lg font-bold">Abiballticket</h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
          Der Zusatzbeitrag gilt <b>nur fürs erste Ticket</b>. Jedes weitere kostet den
          Grundpreis. Es zählt immer die höchste erreichte Stufe, 60 Prozent zählen also als 50.
        </p>

        <label className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-100 p-3 dark:bg-slate-800/70">
          <span className="flex-1 text-[15px] font-semibold">Grundpreis je Ticket</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            className="w-20 rounded-lg bg-white px-2.5 py-2 text-right text-[15px] font-bold dark:bg-slate-900"
            value={grund}
            onChange={(e) => setSettings({ ticket_preis: Math.max(0, Number(e.target.value) || 0) })}
          />
          <span className="text-[15px] font-bold text-slate-500">€</span>
        </label>
        {grund === 0 && (
          <p className="mt-1.5 text-[12px] text-slate-400">
            Steht 0 drin, ist der Preis noch offen. Dann sehen alle nur den Zusatzbeitrag.
          </p>
        )}

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Zusatzbeitrag je Prozentstufe
        </div>
        <ul className="mt-2 grid gap-2">
          {staffel.map((stufe, i) => (
            <li
              key={stufe.ab}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 px-3 py-2 dark:border-slate-700"
            >
              <span className="w-[4.5rem] shrink-0 whitespace-nowrap text-[15px] font-bold text-brand">ab {stufe.ab} %</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-slate-500 dark:text-slate-400">
                1. Ticket {grund + stufe.betrag} €
                {grund > 0 && stufe.betrag > 0 ? ` (${grund} + ${stufe.betrag})` : ""}
              </span>
              <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-800">
                <span className="text-[13px] font-semibold text-slate-400">+</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className="w-12 bg-transparent text-right text-[15px] font-bold outline-none"
                  value={stufe.betrag}
                  onChange={(e) => {
                    const wert = Math.max(0, Number(e.target.value) || 0);
                    setSettings({
                      staffel: staffel.map((x, j) => (j === i ? { ...x, betrag: wert } : x)),
                    });
                  }}
                />
                <span className="text-[15px] font-bold text-slate-500">€</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
