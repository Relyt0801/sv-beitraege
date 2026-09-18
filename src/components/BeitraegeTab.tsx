import { useState } from "react";
import { useStore } from "../store";
import { beitraegeVon, staffelVon } from "../lib/logic";
import { useEntwurf } from "../lib/entwurf";
import { HY, type ContribTemplate, type Halbjahr, type Staffel } from "../lib/types";

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
  const preis = useEntwurf(grund, (wert) => setSettings({ ticket_preis: wert }));
  const preise = beitraegeVon(settings);
  const gesamt = HY.reduce((n, h) => n + (preise[h] || 0), 0);

  function anlegen() {
    const t = titel.trim();
    if (!t) return;
    addTemplate(t, Number(punkte) || 0);
    setTitel("");
    setPunkte("5");
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ---------------- Möglichkeiten ---------------- */}
      <section className="card p-4 sm:p-5">
        <h2 className="text-lg font-bold">Wofür gibt es Prozent?</h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-tinte-matt dark:text-slate-400">
          Diese Liste siehst du später, wenn du bei jemandem etwas einträgst. Setz einen Haken bei
          „anpassbar", wenn der Wert je nach Aufwand schwankt.
        </p>

        <ul className="mt-4 grid gap-2">
          {sortiert.map((t) => (
            <VorlagenZeile
              key={t.id}
              vorlage={t}
              onAendern={(patch) => updateTemplate(t.id, patch)}
              onLoeschen={() => removeTemplate(t.id)}
            />
          ))}
        </ul>

        <div className="mt-3 min-w-0 rounded-2xl border border-dashed border-brand/50 p-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <input
              className="w-0 min-w-0 flex-1 rounded-lg bg-papier-matt px-2.5 py-2 text-[15px] dark:bg-slate-800"
              placeholder="Noch etwas, z. B. Fotobox betreut"
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && anlegen()}
            />
            <div className="flex shrink-0 items-center gap-1 rounded-lg bg-papier-matt px-2 py-1 dark:bg-slate-800">
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

      {/* ---------------- Beitrag je Halbjahr ---------------- */}
      <section className="card h-fit p-4 sm:p-5">
        <h2 className="text-lg font-bold">Was kostet ein Halbjahr?</h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-tinte-matt dark:text-slate-400">
          Der Betrag gilt für jede Person, die in dem Halbjahr dabei ist. Änderst du einen Wert,
          rechnen sich alle offenen Beträge sofort neu aus.
        </p>

        <ul className="mt-4 grid gap-2">
          {HY.map((h) => (
            <HalbjahrZeile
              key={h}
              halbjahr={h}
              betrag={preise[h]}
              aktuell={h === settings.aktuelles_halbjahr}
              onBetrag={(wert) => setSettings({ beitraege: { ...preise, [h]: wert } })}
            />
          ))}
        </ul>

        <div className="mt-3 flex items-center justify-between rounded-2xl bg-papier-matt px-3 py-2.5 dark:bg-slate-800/70">
          <span className="text-[13px] font-semibold text-tinte-matt">Alle sechs Halbjahre zusammen</span>
          <span className="text-[15px] font-extrabold">{gesamt} €</span>
        </div>
      </section>

      {/* ---------------- Abiballticket ---------------- */}
      <section className="card h-fit p-4 sm:p-5">
        <h2 className="text-lg font-bold">Abiballticket</h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-tinte-matt dark:text-slate-400">
          Der Zusatzbeitrag gilt <b>nur fürs erste Ticket</b>. Jedes weitere kostet den
          Grundpreis. Es zählt immer die höchste erreichte Stufe, 60 Prozent zählen also als 50.
        </p>

        <label className="mt-4 flex items-center gap-3 rounded-2xl bg-papier-matt p-3 dark:bg-slate-800/70">
          <span className="flex-1 text-[15px] font-semibold">Grundpreis je Ticket</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            className="w-20 rounded-lg bg-white px-2.5 py-2 text-right text-[15px] font-bold dark:bg-slate-900"
            value={preis.wert}
            onChange={(e) => preis.aendern(Math.max(0, Number(e.target.value) || 0))}
            onBlur={preis.jetztSpeichern}
          />
          <span className="text-[15px] font-bold text-tinte-matt">€</span>
        </label>
        {grund === 0 && (
          <p className="mt-1.5 text-[12px] text-tinte-leise">
            Steht 0 drin, ist der Preis noch offen. Dann sehen alle nur den Zusatzbeitrag.
          </p>
        )}

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-tinte-matt">
          Zusatzbeitrag je Prozentstufe
        </div>
        <ul className="mt-2 grid gap-2">
          {staffel.map((stufe, i) => (
            <StufenZeile
              key={stufe.ab}
              stufe={stufe}
              grund={grund}
              onBetrag={(wert) =>
                setSettings({ staffel: staffel.map((x, j) => (j === i ? { ...x, betrag: wert } : x)) })
              }
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * Eine Zeile der Vorlagen-Liste. Titel und Prozentwert werden erst gespeichert,
 * wenn man kurz aufhoert zu tippen oder das Feld verlaesst.
 */
function VorlagenZeile({
  vorlage,
  onAendern,
  onLoeschen,
}: {
  vorlage: ContribTemplate;
  onAendern: (patch: Partial<Pick<ContribTemplate, "titel" | "punkte" | "variabel">>) => void;
  onLoeschen: () => void;
}) {
  const titel = useEntwurf(vorlage.titel, (wert) => onAendern({ titel: wert }));
  const punkte = useEntwurf(vorlage.punkte, (wert) => onAendern({ punkte: wert }));

  return (
    <li className="min-w-0 rounded-2xl border border-papier-linie p-2.5 dark:border-slate-700">
      <div className="flex min-w-0 items-center gap-2">
        <input
          className="w-0 min-w-0 flex-1 rounded-lg bg-papier-matt px-2.5 py-2 text-[15px] font-semibold dark:bg-slate-800"
          value={titel.wert}
          onChange={(e) => titel.aendern(e.target.value)}
          onBlur={titel.jetztSpeichern}
        />
        <div className="flex shrink-0 items-center gap-1 rounded-lg bg-papier-matt px-2 py-1 dark:bg-slate-800">
          <input
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            className="w-10 bg-transparent text-right text-[15px] font-bold text-brand outline-none"
            value={punkte.wert}
            onChange={(e) => punkte.aendern(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
            onBlur={punkte.jetztSpeichern}
          />
          <span className="text-[15px] font-bold text-brand">%</span>
        </div>
        <button
          onClick={() => confirm(`„${vorlage.titel}" wirklich löschen?`) && onLoeschen()}
          className="shrink-0 rounded-lg px-2 py-2 text-tinte-leise transition active:scale-90"
          aria-label="Löschen"
        >
          🗑
        </button>
      </div>
      <label className="mt-1.5 flex cursor-pointer items-center gap-2 pl-1 text-[12px] text-tinte-matt dark:text-slate-400">
        <input
          type="checkbox"
          className="h-4 w-4 accent-brand"
          checked={Boolean(vorlage.variabel)}
          onChange={(e) => onAendern({ variabel: e.target.checked })}
        />
        Wert beim Eintragen anpassbar
      </label>
    </li>
  );
}

/** Eine Stufe der Abiball-Staffel. Speichert ebenfalls erst nach kurzer Pause. */
function StufenZeile({
  stufe,
  grund,
  onBetrag,
}: {
  stufe: Staffel;
  grund: number;
  onBetrag: (wert: number) => void;
}) {
  const betrag = useEntwurf(stufe.betrag, onBetrag);

  return (
    <li className="flex min-w-0 items-center gap-2 rounded-2xl border border-papier-linie px-3 py-2 dark:border-slate-700">
      <span className="shrink-0 whitespace-nowrap text-[15px] font-bold text-brand">ab {stufe.ab} %</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-tinte-matt dark:text-slate-400">
        1. Ticket {grund + betrag.wert} €
        {grund > 0 && betrag.wert > 0 ? ` (${grund} + ${betrag.wert})` : ""}
      </span>
      <div className="flex shrink-0 items-center gap-1 rounded-lg bg-papier-matt px-2 py-1 dark:bg-slate-800">
        <span className="text-[13px] font-semibold text-tinte-leise">+</span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          className="w-12 bg-transparent text-right text-[15px] font-bold outline-none"
          value={betrag.wert}
          onChange={(e) => betrag.aendern(Math.max(0, Number(e.target.value) || 0))}
          onBlur={betrag.jetztSpeichern}
        />
        <span className="text-[15px] font-bold text-tinte-matt">€</span>
      </div>
    </li>
  );
}

/** Ein Halbjahr mit seinem Preis. Speichert erst nach kurzer Pause. */
function HalbjahrZeile({
  halbjahr,
  betrag,
  aktuell,
  onBetrag,
}: {
  halbjahr: Halbjahr;
  betrag: number;
  aktuell: boolean;
  onBetrag: (wert: number) => void;
}) {
  const wert = useEntwurf(betrag, onBetrag);

  return (
    <li
      className={`flex min-w-0 items-center gap-2 rounded-2xl border px-3 py-2 ${
        aktuell ? "border-brand bg-brand/5" : "border-papier-linie dark:border-slate-700"
      }`}
    >
      <span className="w-14 shrink-0 text-[15px] font-bold">{halbjahr}</span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-tinte-leise">
        {aktuell ? "läuft gerade" : ""}
      </span>
      <div className="flex shrink-0 items-center gap-1 rounded-lg bg-papier-matt px-2 py-1 dark:bg-slate-800">
        <input
          type="number"
          min={0}
          inputMode="numeric"
          className="w-14 bg-transparent text-right text-[15px] font-bold outline-none"
          value={wert.wert}
          onChange={(e) => wert.aendern(Math.max(0, Number(e.target.value) || 0))}
          onBlur={wert.jetztSpeichern}
        />
        <span className="text-[15px] font-bold text-tinte-matt">€</span>
      </div>
    </li>
  );
}
